import { createMockRepository } from '../../database/test-utils'
import type { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import { EsnDirectoryService } from './esn-directory.service'
import { ESN_DIRECTORY_SEED } from './esn-seed-names'
import { withOverflowScores } from './territory-overflow'

describe('le référentiel ESN (tome 4, BEL-DATA-001)', () => {
  describe('la graine', () => {
    it('porte les 477 noms du fichier d’origine, sans doublon', () => {
      expect(ESN_DIRECTORY_SEED).toHaveLength(477)
      const normalized = ESN_DIRECTORY_SEED.map(entry => EsnDirectoryService.normalize(entry.name))
      expect(new Set(normalized).size).toBe(477)
    })

    it('ne porte AUCUN domaine', () => {
      // 93 % des domaines du fichier sont dérivés du nom (« Open » → open.com,
      // faux). Les garder ferait courir le risque qu'ils s'affichent comme le
      // site officiel ; ils ne portent aucune information qu'on ne saurait
      // re-dériver.
      const asJson = JSON.stringify(ESN_DIRECTORY_SEED)
      expect(asJson).not.toContain('.com')
      expect(asJson).not.toContain('.fr')
    })

    it('dit d’où vient chaque nom', () => {
      const sources = new Set(ESN_DIRECTORY_SEED.map(entry => entry.source))
      expect([...sources].sort()).toEqual(['both', 'pdf', 'xlsx'])
    })
  })

  describe('la normalisation des noms', () => {
    it('rapproche les écritures d’un même nom', () => {
      expect(EsnDirectoryService.normalize('SII Sud-Ouest')).toBe('sii sud ouest')
      expect(EsnDirectoryService.normalize('  Onepoint  ')).toBe('onepoint')
      expect(EsnDirectoryService.normalize('Méthodes & Co')).toBe('methodes co')
    })
  })

  describe('la résolution par lots', () => {
    const makeService = (rows: Record<string, unknown>[], entries: Record<string, unknown>[]) => {
      const saved: Record<string, unknown>[] = []
      const repo = {
        count: jest.fn().mockResolvedValue(rows.length),
        // La réservation du lot est un UPDATE … RETURNING : c'est ce qui permet
        // à deux instances de se partager les 477 noms sans verrou global.
        query: jest.fn().mockResolvedValue(rows),
        find: jest.fn().mockResolvedValue(rows),
        save: jest.fn(async (row: Record<string, unknown>) => row),
        // C'est `update(id, patch)` qui écrit désormais : le lot est réservé par
        // un UPDATE … RETURNING qui ne rend que l'id et le nom, donc il n'y a
        // plus d'entité complète à sauver.
        update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
          saved.push({ id, ...patch })
        }),
      }
      const ia = { esnResolve: jest.fn().mockResolvedValue({ entries }) }
      const service = new EsnDirectoryService(repo as never, ia as never)
      return { service, repo, ia, saved }
    }

    it('écrit les faits registre d’un nom résolu', async () => {
      const { service, saved } = makeService(
        [{ id: '1', inputName: 'Karytis', resolutionStatus: 'pending' }],
        [
          {
            inputName: 'Karytis',
            status: 'resolved',
            siren: '552100554',
            nafCode: '6202A',
            department: '31',
            establishmentCount: 3,
          },
        ],
      )
      const result = await service.resolvePending(10)
      expect(result).toEqual({ attempted: 1, resolved: 1 })
      expect(saved[0]).toMatchObject({
        resolutionStatus: 'resolved',
        siren: '552100554',
        nafCode: '6202A',
        headquartersDepartment: '31',
        establishmentCount: 3,
      })
    })

    it('conserve un nom non résolu AVEC sa raison', async () => {
      const { service, saved } = makeService(
        [{ id: '1', inputName: 'Cabinet Inconnu', resolutionStatus: 'pending' }],
        [{ inputName: 'Cabinet Inconnu', status: 'unresolved', reason: 'Aucune entité ne correspond.' }],
      )
      await service.resolvePending(10)
      expect(saved[0]).toMatchObject({
        resolutionStatus: 'unresolved',
        resolutionReason: 'Aucune entité ne correspond.',
      })
      // Aucun SIREN inventé sur un nom qu'on n'a pas su résoudre.
      expect(saved[0]).not.toHaveProperty('siren')
    })

    it('REND le nom au lot suivant quand le registre est en panne', async () => {
      // Écrire « non résolue » sur une panne ferait cesser de réessayer ; le
      // laisser « en cours » le gèlerait une demi-heure pour rien.
      const { service, saved, repo } = makeService(
        [{ id: '1', inputName: 'Karytis', resolutionStatus: 'pending' }],
        [{ inputName: 'Karytis', status: 'pending', reason: 'Le registre n’a pas répondu.' }],
      )
      const result = await service.resolvePending(10)
      expect(result).toEqual({ attempted: 1, resolved: 0 })
      // Le nom REDEVIENT disponible, et rien d'autre n'est écrit.
      expect(saved).toEqual([{ id: '1', resolutionStatus: 'pending' }])
    })

    it('ne demande rien quand il n’y a plus rien en attente', async () => {
      const { service, ia } = makeService([], [])
      // `ensureSeeded` voit une table vide et sème : c'est le comportement
      // voulu, mais ici on veut mesurer la résolution, pas la graine.
      ;(service as unknown as { seeded: boolean }).seeded = true
      const result = await service.resolvePending(10)
      expect(result).toEqual({ attempted: 0, resolved: 0 })
      expect(ia.esnResolve).not.toHaveBeenCalled()
    })
  })
})

/**
 * N16 — « une ESN déclare si elle sous-traite ».
 *
 * Le repli fabriqué ici simule les DEUX écritures que le service émet : le
 * couple `INSERT … ON CONFLICT` sur la table scopée, et le `UPDATE
 * esn_directory` de la promotion. Ce n'est pas une base de test, c'est le
 * minimum qui permet de prouver l'effet de BOUT EN BOUT — jusqu'au score de
 * débordement — sans dépendre d'un Postgres réel.
 */
describe('la déclaration d’ouverture à la sous-traitance (N16, D589-D593)', () => {
  type EsnRow = {
    id: string
    normalizedName: string
    riskFlag: string
    openToSubcontracting: string
    subcontractingConfidence: string | null
    subcontractingSourcesCount: number
    hiringBaseline: Record<string, unknown> | null
  }
  type Declaration = {
    workspaceId: string
    esnDirectoryId: string
    value: string
    confidence: string
    evidence: string | null
  }

  const makeSubcontractingService = (esnRows: EsnRow[], sharing: Record<string, boolean>) => {
    const esnById = new Map(esnRows.map(row => [row.id, { ...row }]))
    const esnByName = new Map(esnRows.map(row => [row.normalizedName, row.id]))
    const declarations = new Map<string, Declaration>()

    const repo = {
      findOne: jest.fn(async ({ where }: { where: { normalizedName: string } }) => {
        const id = esnByName.get(where.normalizedName)
        return id ? { id } : null
      }),
      // `factsByName` appelle `find({ where: { normalizedName: In(names) } })`
      // — on ne rejoue pas l'opérateur TypeORM, on lit juste ce qu'il enveloppe.
      find: jest.fn(async ({ where }: { where: { normalizedName: unknown } }) => {
        const wrapped = where.normalizedName as { _type?: string; _value?: string[] }
        const names = Array.isArray(wrapped?._value) ? wrapped._value : [where.normalizedName as unknown as string]
        return [...esnById.values()].filter(row => names.includes(row.normalizedName))
      }),
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (/INSERT INTO esn_subcontracting_declarations/.test(sql)) {
          const [workspaceId, esnDirectoryId, value, confidence, evidence] = params as [
            string,
            string,
            string,
            string,
            string | null,
          ]
          declarations.set(`${workspaceId}:${esnDirectoryId}`, {
            workspaceId,
            esnDirectoryId,
            value,
            confidence,
            evidence,
          })
          return []
        }
        if (/FROM esn_subcontracting_declarations/.test(sql)) {
          const [esnDirectoryId] = params as [string]
          return [...declarations.values()]
            .filter(row => row.esnDirectoryId === esnDirectoryId)
            .map(row => ({ workspaceId: row.workspaceId, value: row.value, confidence: row.confidence }))
        }
        if (/FROM workspaces/.test(sql)) {
          const [ids] = params as [string[]]
          return ids.filter(id => sharing[id] === true).map(id => ({ id }))
        }
        if (/UPDATE esn_directory/.test(sql)) {
          const esnId = params[0] as string
          const row = esnById.get(esnId)
          if (!row) return []
          if (/'inconnu'/.test(sql)) {
            Object.assign(row, {
              openToSubcontracting: 'inconnu',
              subcontractingConfidence: null,
              subcontractingSourcesCount: 0,
            })
          } else {
            const [, value, confidence, , sourcesCount] = params as [string, string, string, string, number]
            Object.assign(row, {
              openToSubcontracting: value,
              subcontractingConfidence: confidence,
              subcontractingSourcesCount: sourcesCount,
            })
          }
          return []
        }
        throw new Error(`requête non simulée dans ce test : ${sql}`)
      }),
    }
    const ia = { esnResolve: jest.fn() }
    const service = new EsnDirectoryService(repo as never, ia as never)
    return { service, esnById }
  }

  const SII: EsnRow = {
    id: 'e1',
    normalizedName: 'sii',
    riskFlag: 'aucun',
    openToSubcontracting: 'inconnu',
    subcontractingConfidence: null,
    subcontractingSourcesCount: 0,
    hiringBaseline: null,
  }

  it('refuse une ESN absente du référentiel', async () => {
    const { service } = makeSubcontractingService([], {})
    await expect(
      service.declareSubcontracting('w1', 'Fantôme SSII', { value: 'oui', confidence: 'certain', evidence: null }),
    ).rejects.toThrow('Fantôme SSII')
  })

  it('enregistre une déclaration SEULE sans rien promouvoir', async () => {
    const { service, esnById } = makeSubcontractingService([SII], { w1: true })
    const result = await service.declareSubcontracting('w1', 'SII', {
      value: 'oui',
      confidence: 'certain',
      evidence: 'Ils l’ont dit au téléphone.',
    })
    expect(result.aggregate).toBeNull()
    expect(esnById.get('e1')?.openToSubcontracting).toBe('inconnu')
  })

  it('promeut l’agrégat au TROISIÈME espace concordant, avec sa confiance la plus FAIBLE', async () => {
    const { service, esnById } = makeSubcontractingService([SII], { w1: true, w2: true, w3: true })
    await service.declareSubcontracting('w1', 'SII', { value: 'oui', confidence: 'certain', evidence: null })
    await service.declareSubcontracting('w2', 'SII', { value: 'oui', confidence: 'probable', evidence: null })
    const third = await service.declareSubcontracting('w3', 'SII', {
      value: 'oui',
      confidence: 'suppose',
      evidence: null,
    })

    expect(third.aggregate).toEqual({
      openToSubcontracting: 'oui',
      subcontractingConfidence: 'suppose',
      subcontractingSourcesCount: 3,
    })
    expect(esnById.get('e1')).toMatchObject({
      openToSubcontracting: 'oui',
      subcontractingConfidence: 'suppose',
      subcontractingSourcesCount: 3,
    })
  })

  it('IGNORE la déclaration d’un espace qui n’a pas activé le partage communautaire', async () => {
    // Trois déclarations existent, une seule espace n'a pas activé le partage :
    // le seuil ne l'atteint donc jamais — D593.
    const { service, esnById } = makeSubcontractingService([SII], { w1: true, w2: true, w3: false })
    await service.declareSubcontracting('w1', 'SII', { value: 'oui', confidence: 'certain', evidence: null })
    await service.declareSubcontracting('w2', 'SII', { value: 'oui', confidence: 'certain', evidence: null })
    const third = await service.declareSubcontracting('w3', 'SII', {
      value: 'oui',
      confidence: 'certain',
      evidence: null,
    })

    expect(third.aggregate).toBeNull()
    expect(esnById.get('e1')?.openToSubcontracting).toBe('inconnu')
  })

  it('sait dire NON — un quatrième espace qui contredit fait REDEVENIR « inconnu » un agrégat déjà promu', async () => {
    const { service, esnById } = makeSubcontractingService([SII], { w1: true, w2: true, w3: true, w4: true })
    await service.declareSubcontracting('w1', 'SII', { value: 'oui', confidence: 'certain', evidence: null })
    await service.declareSubcontracting('w2', 'SII', { value: 'oui', confidence: 'certain', evidence: null })
    await service.declareSubcontracting('w3', 'SII', { value: 'oui', confidence: 'certain', evidence: null })
    expect(esnById.get('e1')?.openToSubcontracting).toBe('oui')

    const fourth = await service.declareSubcontracting('w4', 'SII', {
      value: 'non',
      confidence: 'certain',
      evidence: null,
    })
    expect(fourth.aggregate).toBeNull()
    expect(esnById.get('e1')).toMatchObject({
      openToSubcontracting: 'inconnu',
      subcontractingConfidence: null,
      subcontractingSourcesCount: 0,
    })
  })

  it('BOUT EN BOUT : trois déclarations font passer l’axe « ouverture » du score de débordement d’ABSENT à MESURÉ', async () => {
    const { service } = makeSubcontractingService([SII], { w1: true, w2: true, w3: true })

    const overview = {
      department: '31',
      sinceDays: 90,
      market: { state: 'ready' as const },
      competition: { state: 'ready' as const },
      overflow: { state: 'ready' as const, esn: [{ name: 'SII', offers: 34 }] },
      accessible: { state: 'ready' as const },
      unknowns: [],
    }
    // `withOverflowScores` ÉLARGIT les états littéraux ('ready' devient
    // 'ready' | 'partial' | …), donc son retour n'est plus assignable à
    // `typeof overview`. Le lecteur n'a besoin que de la forme qu'il LIT.
    const axisOf = (result: { overflow: { esn?: unknown[] } }) => {
      const found = (result.overflow.esn ?? []).find(item => (item as { name: string }).name === 'SII') as
        | { score?: { axes: { axis: string; availability: string; points: number | null }[] } }
        | undefined
      return found?.score?.axes.find(axis => axis.axis === 'ouverture')
    }

    const before = await withOverflowScores(overview as never, service)
    expect(axisOf(before)?.availability).toBe('absent')

    await service.declareSubcontracting('w1', 'SII', { value: 'oui', confidence: 'certain', evidence: null })
    await service.declareSubcontracting('w2', 'SII', { value: 'oui', confidence: 'certain', evidence: null })
    await service.declareSubcontracting('w3', 'SII', { value: 'oui', confidence: 'certain', evidence: null })

    const after = await withOverflowScores(overview as never, service)
    const axis = axisOf(after)
    expect(axis?.availability).toBe('measured')
    expect(axis?.points).toBeGreaterThan(0)
  })
})

/**
 * Le service IA rend la CLÉ du référentiel, pas le nom publié.
 *
 * C'est ce qui permet la jointure (`factsByName` lit `normalized_name`) et le
 * regroupement de deux graphies d'une même ESN — « SII » et « SII SUD OUEST »
 * sont une seule entité, et deux lignes se partageraient ses offres.
 *
 * Mais une clé est en minuscules. Sans resubstitution, corriger l'appariement
 * aurait affiché « capgemini » à l'écran : un défaut VISIBLE créé par un
 * correctif invisible.
 */
describe('le libellé rendu à l’écran pour une ESN qui déborde', () => {
  const overviewWith = (name: string) => ({
    department: '31',
    sinceDays: 90,
    market: { state: 'ready' as const },
    competition: { state: 'ready' as const },
    overflow: { state: 'ready' as const, esn: [{ name, offers: 34 }] },
    accessible: { state: 'ready' as const },
    unknowns: [],
  })
  const nameOf = (result: { overflow: { esn?: unknown[] } }) =>
    ((result.overflow.esn ?? [])[0] as { name: string } | undefined)?.name

  it('reprend le libellé du référentiel quand la clé y est connue', async () => {
    const directory = {
      factsByName: async () => new Map([['capgemini', { inputName: 'Capgemini' } as never]]),
    }

    const result = await withOverflowScores(overviewWith('capgemini') as never, directory as never)

    expect(nameOf(result)).toBe('Capgemini')
  })

  it('garde ce que l’IA a rendu quand le référentiel ne connaît pas la clé', async () => {
    // Jamais un blanc : un nom inconnu du référentiel reste affichable.
    const directory = { factsByName: async () => new Map() }

    const result = await withOverflowScores(overviewWith('karytis') as never, directory as never)

    expect(nameOf(result)).toBe('karytis')
  })
})

/**
 * #1887 — LA LECTURE QUI SERT LA SUGGESTION.
 *
 * Le classement est testé à part (`esn-name-suggest.spec.ts`). Ce qui se prouve
 * ici est la LECTURE : ce qu'on demande à la base, et ce qu'on ne lui demande
 * PAS quand la frappe est trop courte.
 */
describe('#1887 — le référentiel suggère un nom', () => {
  const makeService = (rows: Record<string, unknown>[]) => {
    const repo = {
      count: jest.fn().mockResolvedValue(rows.length),
      find: jest.fn().mockResolvedValue(rows),
    }
    const service = new EsnDirectoryService(repo as never, {} as never)
    return { service, repo }
  }

  const entry = (inputName: string) => ({
    inputName,
    normalizedName: EsnDirectoryService.normalize(inputName),
    siren: null,
    headquartersCity: null,
    headcountRange: null,
    parentName: null,
  })

  it('cherche sur la clé NORMALISÉE, pas sur le nom brut', async () => {
    const { service, repo } = makeService([entry('Capgemini')])

    const suggestions = await service.suggest('Capgémini')

    // La frappe accentuée a été pliée AVANT d'atteindre la base — c'est la
    // seule chose qui empêche « Sogéti » de ne jamais trouver « Sogeti ».
    const where = repo.find.mock.calls[0][0].where as { normalizedName: { value: string } }
    expect(where.normalizedName.value).toBe('%capgemini%')
    expect(suggestions.map(suggestion => suggestion.name)).toEqual(['Capgemini'])
  })

  it('ne touche PAS la base sous le minimum de caractères', async () => {
    const { service, repo } = makeService([entry('Capgemini')])

    await expect(service.suggest('c')).resolves.toEqual([])

    expect(repo.find).not.toHaveBeenCalled()
    expect(repo.count).not.toHaveBeenCalled()
  })

  it('sème le référentiel avant de le lire — une salle neuve suggère quand même', async () => {
    // `ensureSeeded` est ce qui fait que la suggestion marche dès la première
    // frappe d'un espace qui n'a jamais ouvert Territoire.
    const { service, repo } = makeService([entry('Capgemini')])

    await service.suggest('cap')

    expect(repo.count).toHaveBeenCalled()
  })
})

/**
 * #3921.b — « effectif en hausse » repose sur DEUX relevés mesurés
 * (`sirene_snapshots`), jamais déduit ; sinon il reste NOMMÉ « non collecté ».
 */
describe('#3921.b — headcountGrowing lu dans l’historique des relevés', () => {
  const overview = {
    department: '31',
    sinceDays: 90,
    market: { state: 'ready' as const },
    competition: { state: 'ready' as const },
    overflow: { state: 'ready' as const, esn: [{ name: 'capgemini', offers: 34 }] },
    accessible: { state: 'ready' as const },
    unknowns: [],
  }
  // Une moyenne de référence connue : sans elle, l'axe Volume sort du
  // dénominateur et la hausse d'effectif n'aurait nulle part où compter.
  const facts = new Map([
    ['capgemini', { inputName: 'Capgemini', siren: '330703844', hiringBaseline: { quarterlyAverage: 10 } } as never],
  ])
  const volumeOf = (result: { overflow: { esn?: unknown[] } }) =>
    ((result.overflow.esn ?? [])[0] as { score: { axes: { axis: string; evidence: string }[] } }).score.axes.find(
      axis => axis.axis === 'volume',
    )

  it('deux relevés mesurés en hausse : le signal compte, avec sa preuve', async () => {
    const directory = {
      factsByName: async () => facts,
      headcountHistoryBySiren: async () =>
        new Map([
          [
            '330703844',
            [
              { observedOn: '2026-01-10', headcountRange: '12' },
              { observedOn: '2026-10-01', headcountRange: '21' },
            ],
          ],
        ]),
    }
    const result = await withOverflowScores(overview as never, directory as never)
    expect(JSON.stringify(volumeOf(result))).toContain('effectif en hausse au registre')
    expect((volumeOf(result) as unknown as { points: number }).points).toBe(30)
  })

  it('un seul relevé : rien de déduit, le signal reste nommé non collecté', async () => {
    const directory = {
      factsByName: async () => facts,
      headcountHistoryBySiren: async () =>
        new Map([['330703844', [{ observedOn: '2026-10-01', headcountRange: '21' }]]]),
    }
    const result = await withOverflowScores(overview as never, directory as never)
    expect(JSON.stringify(volumeOf(result))).not.toContain('effectif en hausse')
    // Le volume seul (25), sans les 5 points d'une hausse qu'on ne sait pas mesurer.
    expect((volumeOf(result) as unknown as { points: number }).points).toBe(25)
  })
})

describe('#3921.b — la résolution au registre écrit un RELEVÉ d’effectif daté', () => {
  it('chaque ESN résolue avec une tranche laisse une ligne `sirene_snapshots` (source esn_directory)', async () => {
    const repo = createMockRepository<EsnDirectoryEntity>()
    repo.count.mockResolvedValue(1)
    repo.query.mockResolvedValueOnce([[{ id: 'e1', inputName: 'Capgemini' }], 1])
    const ia = {
      esnResolve: jest.fn().mockResolvedValue({
        entries: [{ inputName: 'Capgemini', status: 'resolved', siren: '330703844', headcountTranche: '21' }],
      }),
    }
    const service = new EsnDirectoryService(repo as never, ia as never)

    await service.resolvePending(1)

    const snapshot = repo.query.mock.calls.find(([sql]) => String(sql).includes('sirene_snapshots'))
    expect(snapshot?.[0]).toContain("'esn_directory'")
    expect(snapshot?.[1]).toEqual(['330703844', '21'])
  })
})

/**
 * #3921.8 (Louis 15/10/2026) — `newEstablishment` est nourri par la relecture nocturne : deux relevés
 * d'établissements mesurés + une ouverture datée par le registre ; sinon il reste NOMMÉ non collecté.
 */
describe('#3921.8 — newEstablishment lu dans les relevés de la relecture nocturne', () => {
  const overview = {
    department: '31',
    sinceDays: 90,
    market: { state: 'ready' as const },
    competition: { state: 'ready' as const },
    overflow: { state: 'ready' as const, esn: [{ name: 'capgemini', offers: 34 }] },
    accessible: { state: 'ready' as const },
    unknowns: [],
  }
  const facts = new Map([
    ['capgemini', { inputName: 'Capgemini', siren: '330703844', hiringBaseline: { quarterlyAverage: 10 } } as never],
  ])
  const today = new Date().toISOString().slice(0, 10)
  const volume = (result: { overflow: { esn?: unknown[] } }) =>
    (
      (result.overflow.esn ?? [])[0] as { score: { axes: { axis: string; evidence: string; points: number }[] } }
    ).score.axes.find(axis => axis.axis === 'volume')

  it('deux relevés + une ouverture récente : le signal compte, avec sa preuve', async () => {
    const directory = {
      factsByName: async () => facts,
      establishmentSignalsBySiren: async () =>
        new Map([['330703844', { readingDays: ['2026-09-01', today], openingDays: [today] }]]),
    }
    const result = await withOverflowScores(overview as never, directory as never)
    expect(JSON.stringify(volume(result))).toContain('établissement ouvert récemment')
    expect(volume(result)?.points).toBe(30)
  })

  it('SAIT DIRE NON — un seul relevé : rien de déduit, aucun point, le signal reste nommé non collecté', async () => {
    const directory = {
      factsByName: async () => facts,
      establishmentSignalsBySiren: async () => new Map([['330703844', { readingDays: [today], openingDays: [today] }]]),
    }
    const result = await withOverflowScores(overview as never, directory as never)
    expect(JSON.stringify(volume(result))).not.toContain('établissement ouvert')
    expect(volume(result)?.points).toBe(25)
  })

  it('SAIT DIRE NON — sans méthode de lecture (ancien appelant) : chemin inchangé', async () => {
    const directory = { factsByName: async () => facts }
    const result = await withOverflowScores(overview as never, directory as never)
    expect(volume(result)?.points).toBe(25)
  })
})

/**
 * #3921.12 (décision Louis 16/10/2026) — `recentAward` est DÉRIVÉ de `esn_directory.public_awards` (marchés
 * GAGNÉS, rôle titulaire) : vrai sous six mois, faux mesuré si lue sans marché récent, nommé non collecté
 * tant que les marchés n'ont jamais été lus.
 */
describe('#3921.12 — recentAward dérivé des marchés gagnés du référentiel', () => {
  const overview = {
    department: '31',
    sinceDays: 90,
    market: { state: 'ready' as const },
    competition: { state: 'ready' as const },
    overflow: { state: 'ready' as const, esn: [{ name: 'capgemini', offers: 34 }] },
    accessible: { state: 'ready' as const },
    unknowns: [],
  }
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
  const factsOf = (row: Record<string, unknown>) =>
    new Map([['capgemini', { inputName: 'Capgemini', siren: '330703844', ...row } as never]])
  const newLoad = (result: { overflow: { esn?: unknown[] } }) =>
    (
      (result.overflow.esn ?? [])[0] as {
        score: { axes: { axis: string; evidence: string; points: number | null }[]; uncollected?: string[] }
      }
    ).score.axes.find(axis => axis.axis === 'charge_nouvelle')

  it('un marché gagné il y a moins de six mois : le signal compte, avec sa preuve', async () => {
    const directory = {
      factsByName: async () =>
        factsOf({ publicAwards: [{ ref: 'decp:A', date: day(-30) }], awardsRefreshedAt: new Date() }),
    }
    const result = await withOverflowScores(overview as never, directory as never)
    expect(newLoad(result)?.points).toBe(10)
    expect(JSON.stringify(newLoad(result))).toContain('marché public attribué')
  })

  it('SAIT DIRE NON — lue sans marché récent : mesuré faux, aucun point mais pas « non collecté »', async () => {
    const directory = {
      factsByName: async () =>
        factsOf({ publicAwards: [{ ref: 'decp:B', date: day(-400) }], awardsRefreshedAt: new Date() }),
    }
    const result = await withOverflowScores(overview as never, directory as never)
    expect(newLoad(result)?.points).toBe(0)
  })

  it('SAIT DIRE NON — jamais lue : rien de déduit, l’axe reste non vérifiable', async () => {
    const directory = { factsByName: async () => factsOf({ publicAwards: [], awardsRefreshedAt: null }) }
    const result = await withOverflowScores(overview as never, directory as never)
    expect(newLoad(result)?.points).toBeNull()
  })
})
