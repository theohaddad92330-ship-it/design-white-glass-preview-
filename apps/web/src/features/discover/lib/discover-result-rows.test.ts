import { describe, expect, it } from 'vitest'
import {
  filterNeedRows,
  needRowsFromCandidates,
  needRowsHiddenBreakdown,
  partnerRowsFromCandidates,
} from './discover-result-rows'
import type { DiscoverCandidate, DiscoverSignal } from './discover-types'
import { buildPartnerRelationIndex } from './discover-filters'

/**
 * #2165.8 / #2165.9 / #2166.26-.41 — les deux PROJECTIONS que Découvrir peut
 * rendre sans aucune source nouvelle.
 *
 * Le point de vigilance de tout ce fichier : une projection ne doit JAMAIS
 * fabriquer une ligne. Un besoin n'existe que s'il y a un signal daté ; un
 * partenaire n'existe que si le NAF a été RÉSOLU et désigne une ESN. Ce que la
 * projection laisse de côté est COMPTÉ, jamais silencieux — sinon la liste
 * ment par omission, exactement comme un « 0 » à la place d'un « non mesuré ».
 */

function signal(overrides: Partial<DiscoverSignal> = {}): DiscoverSignal {
  return { type: 'hiring', label: '5 postes data ouverts', date: '2026-09-01', ...overrides }
}

function candidate(overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'Acme',
    siren: '111111111',
    nafCode: '30.30Z',
    sector: 'Industrie',
    city: 'Toulouse',
    department: '31',
    headcountRange: '50-249',
    creationDate: '2005-01-01',
    score: 50,
    scoreMax: 80,
    scoreUnmeasured: [],
    scoreFactors: [],
    signals: [],
    dataConfidence: null,
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...overrides,
  } as DiscoverCandidate
}

describe('besoins et signaux (#2165.8)', () => {
  it('#2166.26/.27/.29/.30 — une ligne PAR signal, avec son entreprise, sa nature, sa date et sa preuve', () => {
    const projection = needRowsFromCandidates([
      candidate({
        name: 'Acme',
        signals: [signal({ type: 'tender', label: 'AO IT publié', date: '2026-09-10', url: 'https://boamp/1' })],
      }),
    ])
    expect(projection.rows).toHaveLength(1)
    const row = projection.rows[0]!
    expect(row.company).toBe('Acme')
    expect(row.nature).toBe('tender')
    expect(row.date).toBe('2026-09-10')
    expect(row.evidenceUrl).toBe('https://boamp/1')
    // #2165.48 — le département vient du candidat porteur, jamais deviné du signal.
    expect(row.department).toBe('31')
  })

  it('rend les besoins du plus RÉCENT au plus ancien — c’est le « pourquoi maintenant »', () => {
    const projection = needRowsFromCandidates([
      candidate({
        signals: [signal({ date: '2026-01-01', label: 'vieux' }), signal({ date: '2026-09-09', label: 'frais' })],
      }),
    ])
    expect(projection.rows.map(r => r.label)).toEqual(['frais', 'vieux'])
  })

  it('#2166.31 — le niveau de preuve est une DISTINCTION nommée, jamais une échelle inventée', () => {
    const projection = needRowsFromCandidates([
      candidate({ signals: [signal({ intermediated: true }), signal({ label: 'direct', date: '2026-09-02' })] }),
    ])
    expect(projection.rows.map(r => r.evidenceLevel)).toEqual(['direct', 'intermediated'])
  })

  it('#2165.46 — un signal LÉGAL (Greffe) ne porte AUCUN niveau de preuve — ce n’est pas une publication', () => {
    // Réfuté en prod 20/09 (719b9cf44) : 17 cartes sur 17 portaient « Publié
    // par l'employeur », Vie juridique / Greffe comprises. Le niveau de
    // preuve ne s'applique qu'à un signal d'EMBAUCHE — le seul type publié
    // par un employeur ou un intermédiaire pour son compte.
    const projection = needRowsFromCandidates([
      candidate({ signals: [signal({ type: 'legal', label: 'Immatriculation RCS Nanterre' })] }),
    ])
    expect(projection.rows[0]!.evidenceLevel).toBeNull()
  })

  it('#2165.46 — « Publié par l’employeur » PARTITIONNE : un signal légal n’est jamais compté « direct »', () => {
    const projection = needRowsFromCandidates([
      candidate({
        signals: [
          signal({ type: 'legal', label: 'Greffe' }),
          signal({ type: 'hiring', label: 'poste ouvert', date: '2026-09-02' }),
        ],
      }),
    ])
    expect(filterNeedRows(projection.rows, { nature: 'any', directOnly: true, company: '' })).toHaveLength(1)
    expect(filterNeedRows(projection.rows, { nature: 'any', directOnly: true, company: '' })[0]!.label).toBe(
      'poste ouvert',
    )
  })

  it('#2166.33 — ce qu’on ne sait pas de la ligne est NOMMÉ, jamais laissé vide', () => {
    const projection = needRowsFromCandidates([candidate({ signals: [signal()] })])
    expect(projection.rows[0]!.unknown).toEqual(['expertise', 'evidenceUrl', 'urgency', 'contractType'])
  })

  it('un candidat SANS signal n’invente pas de besoin — il est compté à part', () => {
    const projection = needRowsFromCandidates([
      candidate({ signals: [] }),
      candidate({ siren: '222', signals: [signal()] }),
    ])
    expect(projection.rows).toHaveLength(1)
    expect(projection.withoutSignal).toBe(1)
  })

  it('n’attrape pas ce qu’il ne vise pas : les cinq natures passent, y compris legal et tech', () => {
    const projection = needRowsFromCandidates([
      candidate({
        signals: [
          signal({ type: 'legal', date: '2026-09-05' }),
          signal({ type: 'tech', date: '2026-09-04' }),
          signal({ type: 'award', date: '2026-09-03' }),
        ],
      }),
    ])
    expect(projection.rows.map(r => r.nature)).toEqual(['legal', 'tech', 'award'])
  })
})

describe('filtres de la liste de besoins (#2165.45 / #2165.46)', () => {
  const rows = needRowsFromCandidates([
    candidate({
      signals: [
        signal({ type: 'tender', date: '2026-09-05' }),
        signal({ type: 'hiring', date: '2026-09-04', intermediated: true }),
        signal({ type: 'hiring', date: '2026-09-03' }),
      ],
    }),
  ]).rows

  it('la nature s’applique À LA LIGNE, pas au compte porteur', () => {
    expect(filterNeedRows(rows, { nature: 'tender', directOnly: false, company: '' })).toHaveLength(1)
  })

  it('#2165.46 — « publié par l’employeur » ne garde QUE les embauches directes — un AO n’est pas une publication', () => {
    // RÉFUTÉ EN PROD 20/09 (719b9cf44) : ce test attendait 2 (le tender
    // comptait « direct » par défaut) — c'est exactement le défaut mesuré en
    // recette, pas un comportement à préserver.
    expect(filterNeedRows(rows, { nature: 'any', directOnly: true, company: '' })).toHaveLength(1)
  })

  it('n’attrape pas ce qu’il ne vise pas : sans critère, rien n’est retiré', () => {
    expect(filterNeedRows(rows, { nature: 'any', directOnly: false, company: '' })).toHaveLength(3)
  })
})

describe('#2165.47 — filtre besoins : Compte', () => {
  const rows = needRowsFromCandidates([
    candidate({ name: 'Acme', signals: [signal({ date: '2026-09-05' })] }),
    candidate({ siren: '222', name: 'Bêta Ingénierie', signals: [signal({ date: '2026-09-04' })] }),
  ]).rows

  it('resserre sur le NOM de l’entreprise porteuse, insensible à la casse', () => {
    expect(filterNeedRows(rows, { nature: 'any', directOnly: false, company: 'acme' })).toHaveLength(1)
  })

  it('accepte une sous-chaîne, comme les filtres de contact (#2165.34/.36)', () => {
    expect(filterNeedRows(rows, { nature: 'any', directOnly: false, company: 'ingénierie' })).toHaveLength(1)
  })

  it('n’attrape pas ce qu’il ne vise pas : un texte vide ne retire rien', () => {
    expect(filterNeedRows(rows, { nature: 'any', directOnly: false, company: '' })).toHaveLength(2)
  })

  it('aucune correspondance renvoie une liste vide, jamais tout', () => {
    expect(filterNeedRows(rows, { nature: 'any', directOnly: false, company: 'inconnu' })).toHaveLength(0)
  })
})

// #2165.44 — RÉFUTÉ en prod le 19/09 : « 90 jours » → « 30 jours » sur
// /discover?type=needs ne changeait rien (40 → 40), un signal de 2023 restait
// affiché. La fenêtre de fraîcheur (`sinceDays`, rail) ne s'appliquait qu'à la
// requête SIGNAUX côté serveur — jamais aux LIGNES de besoin déjà rendues.
describe('#2165.44 — filtre besoins : Date (fenêtre de fraîcheur)', () => {
  const NOW = Date.parse('2026-09-19T12:00:00Z')
  const rows = needRowsFromCandidates([
    candidate({
      signals: [
        signal({ label: 'frais', date: '2026-09-10' }), // 9 jours
        signal({ label: 'vieux', date: '2023-06-07' }), // largement hors fenêtre
      ],
    }),
  ]).rows

  it('retire une ligne hors fenêtre, et elle seule', () => {
    const kept = filterNeedRows(rows, { nature: 'any', directOnly: false, company: '', sinceDays: 30, nowMs: NOW })
    expect(kept.map(r => r.label)).toEqual(['frais'])
  })

  it('`sinceDays` absent (ou `null`) ne retire rien — aucune contrainte devinée', () => {
    expect(filterNeedRows(rows, { nature: 'any', directOnly: false, company: '' })).toHaveLength(2)
    expect(
      filterNeedRows(rows, { nature: 'any', directOnly: false, company: '', sinceDays: null, nowMs: NOW }),
    ).toHaveLength(2)
  })

  it('une date illisible n’est JAMAIS comptée « hors fenêtre » — non mesuré ≠ hors zone', () => {
    const unreadable = needRowsFromCandidates([
      candidate({ signals: [signal({ label: 'casse', date: 'pas-une-date' })] }),
    ]).rows
    expect(
      filterNeedRows(unreadable, { nature: 'any', directOnly: false, company: '', sinceDays: 30, nowMs: NOW }),
    ).toHaveLength(1)
  })
})

// #2165.48 — RÉFUTÉ en prod le 19/09 : `department=31,33` sur
// /discover?type=needs ne changeait rien (40 → 40), une ligne portée par une
// entreprise du 69 restait affichée. Même défaut que #2165.44 : la zone ne
// s'appliquait qu'à la requête REGISTRE côté serveur, jamais aux LIGNES.
describe('#2165.48 — filtre besoins : Zone (département)', () => {
  const rows = needRowsFromCandidates([
    candidate({ name: 'Dans la zone', department: '31', signals: [signal({ date: '2026-09-05' })] }),
    candidate({ siren: '222', name: 'Hors zone', department: '69', signals: [signal({ date: '2026-09-04' })] }),
    candidate({
      siren: '333',
      name: 'Département inconnu',
      department: null,
      signals: [signal({ date: '2026-09-03' })],
    }),
  ]).rows

  it('retire une ligne hors des départements choisis', () => {
    const kept = filterNeedRows(rows, { nature: 'any', directOnly: false, company: '', departments: ['31', '33'] })
    expect(kept.map(r => r.company).sort()).toEqual(['Dans la zone', 'Département inconnu'])
  })

  it('un département INCONNU n’est jamais écarté par ce critère — GA-18/GA-19', () => {
    const kept = filterNeedRows(rows, { nature: 'any', directOnly: false, company: '', departments: ['75'] })
    expect(kept.map(r => r.company)).toEqual(['Département inconnu'])
  })

  it('`departments` vide ne retire rien — aucune contrainte devinée', () => {
    expect(filterNeedRows(rows, { nature: 'any', directOnly: false, company: '', departments: [] })).toHaveLength(3)
  })
})

describe('needRowsHiddenBreakdown — le nombre retiré, dit à l’écran (#2165.44/.46/.48)', () => {
  const NOW = Date.parse('2026-09-19T12:00:00Z')
  const rows = needRowsFromCandidates([
    candidate({
      name: 'Intermédiée',
      department: '31',
      signals: [signal({ date: '2026-09-10', intermediated: true })],
    }),
    candidate({ siren: '222', name: 'Vieille', department: '31', signals: [signal({ date: '2023-06-07' })] }),
    candidate({ siren: '333', name: 'Hors zone', department: '69', signals: [signal({ date: '2026-09-10' })] }),
    candidate({ siren: '444', name: 'Gardée', department: '31', signals: [signal({ date: '2026-09-10' })] }),
  ]).rows

  it('compte chaque motif — mutuellement exclusifs, dans l’ordre direct → fenêtre → zone', () => {
    const breakdown = needRowsHiddenBreakdown(rows, {
      directOnly: true,
      sinceDays: 30,
      departments: ['31'],
      nowMs: NOW,
    })
    expect(breakdown).toEqual({ direct: 1, window: 1, zone: 1, freelance: 0 })
  })

  it('la somme des motifs égale EXACTEMENT ce que `filterNeedRows` retire — deux fonctions, un seul écart possible', () => {
    const options = {
      nature: 'any' as const,
      directOnly: true,
      company: '',
      sinceDays: 30,
      departments: ['31'],
      nowMs: NOW,
    }
    const kept = filterNeedRows(rows, options)
    const breakdown = needRowsHiddenBreakdown(rows, options)
    expect(rows.length - kept.length).toBe(breakdown.direct + breakdown.window + breakdown.zone)
  })

  it('rien de coché, rien de compté', () => {
    expect(needRowsHiddenBreakdown(rows, { directOnly: false })).toEqual({
      direct: 0,
      window: 0,
      zone: 0,
      freelance: 0,
    })
  })
})

describe('partenaires / ESN (#2165.9)', () => {
  it('#2166.34 — ne garde que les NAF qui désignent une ESN', () => {
    const projection = partnerRowsFromCandidates([
      candidate({ name: 'ESN A', siren: '1', nafCode: '62.01Z' }),
      candidate({ name: 'Industriel', siren: '2', nafCode: '30.30Z' }),
    ])
    expect(projection.rows.map(r => r.name)).toEqual(['ESN A'])
  })

  it('#2166.34 — un NAF AMBIGU est rendu, et son ambiguïté est portée par la ligne', () => {
    const projection = partnerRowsFromCandidates([candidate({ name: 'Conseil', siren: '3', nafCode: '70.22Z' })])
    expect(projection.rows[0]!.nafClass).toBe('ambiguous')
  })

  it('un NAF NON RÉSOLU n’est ni un partenaire ni un « non » — il est compté à part', () => {
    const projection = partnerRowsFromCandidates([
      candidate({ siren: '4', nafCode: null }),
      candidate({ siren: '5', nafCode: '62.03Z' }),
    ])
    expect(projection.rows).toHaveLength(1)
    expect(projection.unresolvedNaf).toBe(1)
  })

  it('#2166.36/.37 — territoire et relations OBSERVÉES viennent des faits déjà rendus', () => {
    const projection = partnerRowsFromCandidates([
      candidate({
        siren: '6',
        nafCode: '62.02A',
        department: '33',
        city: 'Bordeaux',
        signals: [signal({ type: 'award', label: 'Marché attribué', detail: 'Titulaire : X' })],
      }),
    ])
    const row = projection.rows[0]!
    expect(row.department).toBe('33')
    expect(row.observed).toHaveLength(1)
    expect(row.observed[0]!.detail).toBe('Titulaire : X')
  })

  it('#2166.40 — ce qui manque est NOMMÉ : aucune relation observée, aucune expertise déclarée', () => {
    const projection = partnerRowsFromCandidates([
      candidate({ siren: '7', nafCode: '62.01Z', sector: null, signals: [] }),
    ])
    expect(projection.rows[0]!.unknown).toContain('expertise')
    expect(projection.rows[0]!.unknown).toContain('observedRelations')
  })

  // #2489.3 — la liste Candidats montre le logo d'un compte déjà apparié
  // (#2166.1) ; la projection Partenaires le perdait en route, alors que
  // c'est LA MÊME source déjà vérifiée (`DiscoverPortfolioService`), jamais
  // devinée depuis le nom.
  it('#2489.3 — porte logoUrl/website déjà vérifiés (compte apparié), jamais devinés', () => {
    const projection = partnerRowsFromCandidates([
      candidate({
        siren: '8',
        nafCode: '62.01Z',
        accountId: 'acc-1',
        logoUrl: 'https://logo.example/esn-a.png',
        website: 'esn-a.example',
      }),
    ])
    expect(projection.rows[0]!.logoUrl).toBe('https://logo.example/esn-a.png')
    expect(projection.rows[0]!.website).toBe('esn-a.example')
  })

  it('#2489.3 — candidat neuf (jamais apparié) : ni logo ni site, jamais devinés', () => {
    const projection = partnerRowsFromCandidates([candidate({ siren: '9', nafCode: '62.01Z' })])
    expect(projection.rows[0]!.logoUrl).toBeUndefined()
    expect(projection.rows[0]!.website).toBeUndefined()
  })

  /**
   * #2165.55 — RÉFUTÉ en prod le 19/09 (0 carte sur 24 portait le bloc
   * complémentarité) : `PartnerComplementarityBlock`/`complementarityFor`
   * n'étaient câblés QUE sur la grille de cartes par défaut
   * (`entityType==='esn'`, `resultType==='accounts'`), jamais sur cette
   * projection — l'écran RÉEL de `/discover?type=partners`. Sans `context`,
   * le comportement historique (score jamais calculé) est préservé, comme
   * tous les tests ci-dessus qui appellent la fonction à un seul argument.
   */
  describe('complémentarité (#2165.55)', () => {
    it('sans contexte (appel historique à un argument) : complémentarité totalement inconnue, jamais un score à 0', () => {
      const projection = partnerRowsFromCandidates([candidate({ siren: '10', nafCode: '62.01Z' })])
      expect(projection.rows[0]!.complementarity).toEqual({
        score: null,
        axes: expect.any(Array),
        unmeasuredAxes: expect.any(Array),
      })
      expect(projection.rows[0]!.unknown).toContain('complementarity')
    })

    it('connue : au moins un axe évalué → PAS dans « Non su », le score est porté par la ligne', () => {
      const projection = partnerRowsFromCandidates(
        [candidate({ siren: '11', nafCode: '62.02A', sector: 'Édition de logiciels' })],
        { ownProfile: { sectors: ['software_tech'], headcountRange: null } },
      )
      const row = projection.rows[0]!
      expect(row.complementarity?.axes.find(a => a.axis === 'sectors')?.score).toBe(100)
      expect(row.unknown).not.toContain('complementarity')
    })

    it('inconnue : profil propre sans secteur déclaré → « Non su » la nomme', () => {
      const projection = partnerRowsFromCandidates([candidate({ siren: '12', nafCode: '62.02A' })], {
        ownProfile: { sectors: [], headcountRange: null },
      })
      expect(projection.rows[0]!.unknown).toContain('complementarity')
    })
  })

  /**
   * #2165.56 / #2151.34 — RÉFUTÉ en prod le 19/09 : 0 ligne sur 24 affichait
   * un statut de rang 2. Chaque ligne porte désormais `rank2`, jamais fondu
   * dans la liste « Non su » (les trois états sont TOUJOURS affichés,
   * l'absence de signal n'est pas une absence d'affichage).
   */
  describe('statut de rang 2 (#2165.56 / #2151.34)', () => {
    it('sans contexte (appel historique) : inconnu par défaut, jamais deviné', () => {
      const projection = partnerRowsFromCandidates([candidate({ siren: '13', nafCode: '62.01Z', name: 'Capgemini' })])
      expect(projection.rows[0]!.rank2).toBe('unknown')
    })

    it('observé : rang 2 vu sur un dossier de l’espace', () => {
      const projection = partnerRowsFromCandidates(
        [candidate({ siren: '14', nafCode: '62.01Z', name: 'Halden Numérique' })],
        { relationIndex: buildPartnerRelationIndex([{ name: 'Halden Numérique', rank2: 1 }]) },
      )
      expect(projection.rows[0]!.rank2).toBe('observed')
    })

    it('déclaré : l’ESN le dit elle-même (esn_directory.open_to_subcontracting)', () => {
      const projection = partnerRowsFromCandidates([candidate({ siren: '15', nafCode: '62.01Z', name: 'Capgemini' })], {
        declaredIndex: new Map([['capgemini', true]]),
      })
      expect(projection.rows[0]!.rank2).toBe('declared')
    })
  })

  // #3238 (recette démo 05/10) — « Besoins et signaux » dit aussi le SITE qui a publié l'offre.
  it("#3238 une ligne de besoin porte la ville du site quand la source l'affiche — jamais devinée", () => {
    const { rows } = needRowsFromCandidates([
      candidate({
        city: 'Paris',
        signals: [
          signal({ siteCity: 'Lorient' }),
          signal({ siteCity: 'Paris', date: '2026-08-01' }),
          signal({ date: '2026-07-01' }),
        ],
      }),
    ])
    expect(rows.map(row => row.siteCity ?? null)).toEqual(['Lorient', null, null])
  })
})

describe('#4999.1 — « Uniquement freelance » sur Besoins et signaux', () => {
  const rows = () =>
    needRowsFromCandidates([
      candidate({
        signals: [
          signal({ label: 'mission freelance data', contractType: 'FREELANCE' }),
          signal({ label: 'CDI data', contractType: 'CDI', date: '2026-09-02' }),
          signal({ label: 'poste sans contrat lisible', date: '2026-09-03' }),
          signal({ type: 'legal', label: 'Greffe', date: '2026-09-04' }),
        ],
      }),
    ]).rows

  it('ne garde que les besoins dont la SOURCE dit freelance — le contrat muet ne passe jamais', () => {
    const kept = filterNeedRows(rows(), { nature: 'any', directOnly: false, company: '', freelanceOnly: true })
    expect(kept.map(row => row.label)).toEqual(['mission freelance data'])
  })

  it('décoché, rien ne change', () => {
    expect(filterNeedRows(rows(), { nature: 'any', directOnly: false, company: '' })).toHaveLength(4)
  })

  it('compte ce que le filtre a retiré, et dit quand AUCUN signal freelance n’existe (null, jamais 0)', () => {
    const none = needRowsFromCandidates([candidate({ signals: [signal({ contractType: 'CDI' })] })]).rows
    expect(needRowsHiddenBreakdown(rows(), { directOnly: false, freelanceOnly: true }).freelance).toBe(3)
    expect(needRowsHiddenBreakdown(none, { directOnly: false, freelanceOnly: true }).freelance).toBe(1)
    expect(filterNeedRows(none, { nature: 'any', directOnly: false, company: '', freelanceOnly: true })).toHaveLength(0)
  })
})
