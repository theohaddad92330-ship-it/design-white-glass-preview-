import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { SprintsService } from './sprints.service'

/**
 * #1318 — « les cartes ne montrent quasiment que le nom du compte ».
 *
 * Même cause exacte que #1315 sur /favorites : la requête du tableau ne
 * SÉLECTIONNAIT ni `logo_url` ni `website`, donc l'écran ne pouvait rien
 * peindre. « Une liste d'entreprises se reconnaît, elle ne se lit pas » est
 * déjà la règle sur /accounts et le cockpit ; ce tableau était hors garde.
 */
describe('le tableau des priorités porte de quoi reconnaître une entreprise (#1318)', () => {
  /**
   * Les requêtes du board, découpées sur le mot-clé et non sur UNE LIGNE.
   *
   * ⚠️ La première version filtrait les lignes contenant littéralement
   * `SELECT id, company_name, sprint`. Elle est tombée — correctement — le jour
   * où la requête est passée sur plusieurs lignes et a pris un alias
   * (`SELECT a.id, …`) : son corpus est devenu vide, et l'assertion
   * « la garde LIT quelque chose » l'a dit au lieu de la laisser verte à vide.
   * Elle découpe maintenant sur `SELECT` … `FROM accounts`, qui est ce qu'elle
   * veut vraiment désigner.
   */
  function boardQueries(): string[] {
    const source = readFileSync(join(__dirname, 'sprints.service.ts'), 'utf8')
    // #3296 : la requête des comptes NON PLACÉS (`sprint IS NULL`) ne porte pas
    // les colonnes de carte — elle n'est pas une requête de board.
    return [...source.matchAll(/SELECT[\s\S]*?FROM accounts\b/g)]
      .map(match => match[0])
      .filter(query => query.includes('sprint_entered_at'))
  }

  it('sélectionne logo_url et website — une colonne non demandée ne voyage pas', () => {
    const queries = boardQueries()

    // La garde LIT quelque chose : sans cette assertion, un renommage de la
    // requête la rendrait verte sur un corpus vide.
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
      expect(query).toContain('logo_url')
      expect(query).toContain('website')
    }
  })

  /**
   * #1318.3 — « chaque compte doit réutiliser les informations déjà
   * disponibles ailleurs dans Bellum : score, dernière activité, prochaine
   * action ».
   */
  it('sélectionne de quoi ARBITRER : score, dernière activité, prochaine action (#1318.3)', () => {
    const queries = boardQueries()

    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
      expect(query).toContain('priority_score')
      expect(query).toContain('updated_at')
      expect(query).toContain('without_next_action')
    }
  })

  // #3257.7b — la VRAIE prochaine action : le titre et l'échéance de la tâche
  // ouverte à venir, lus sur `tasks` avec la définition d'« ouverte » du contrat.
  it('sélectionne la prochaine tâche ouverte, avec la définition d’« ouverte » du contrat (#3257.7b)', () => {
    const source = readFileSync(join(__dirname, 'sprints.service.ts'), 'utf8')
    const queries = boardQueries()
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
      expect(query).toContain('next_task_title')
      expect(query).toContain('next_task_due_on')
    }
    expect(source).toContain("taskStillOpenSql('t')")
  })

  // #3257.4 — le partenaire lié à `partner_route` est LU dans `account_partners`
  // (déclaré ou détecté, jamais écarté), pas inventé.
  it('lit le partenaire lié dans account_partners, hors relations écartées (#3257.4)', () => {
    const queries = boardQueries()
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
      expect(query).toContain('partner_name')
      expect(query).toContain('account_partners')
      expect(query).toContain("relationship = 'partner'")
      expect(query).toContain('dismissed_at IS NULL')
    }
  })

  it('n’invente PAS son prédicat « rien n’est programmé » — il vient du module comptes (#1318.3)', () => {
    // Deux formulations de la même règle divergeraient, et le board dirait le
    // contraire du cockpit sur le même compte. GA-54, transposé ici.
    const source = readFileSync(join(__dirname, 'sprints.service.ts'), 'utf8')

    expect(source).toContain('ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask')
    // La garde sait dire NON : un `NOT EXISTS … FROM tasks` recopié à la main
    // rendrait ce test rouge, ce qui est exactement le but.
    expect(source).not.toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM tasks/)
  })
})

describe('le board d’effort (tome 5, BEL-SPRINT-001)', () => {
  // `hasPlan` par défaut à `true` : les tests du plafond, qui ne parlent pas
  // de plan, n'ont pas à savoir que `move()` vérifie aussi `planRequired`
  // depuis N15-B — seuls les tests dédiés au plan le font varier.
  const make = (
    rows: Record<string, unknown>[],
    focusCount = 0,
    hasPlan = true,
    unplaced: Record<string, unknown>[] = [],
  ) => {
    const updates: Record<string, unknown>[] = []
    const repo = {
      query: jest.fn((sql: string) =>
        String(sql).includes('action_plans')
          ? Promise.resolve([{ has_plan: hasPlan }])
          : String(sql).includes('a.sprint IS NULL')
            ? Promise.resolve(unplaced)
            : Promise.resolve(rows),
      ),
      findOne: jest.fn().mockResolvedValue(rows[0] ?? null),
      count: jest.fn().mockResolvedValue(focusCount),
      update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
        updates.push({ id, ...patch })
      }),
    }
    return { service: new SprintsService(repo as never), repo, updates }
  }

  it('range les comptes par colonne', async () => {
    const { service } = make([
      { id: '1', company_name: 'A', sprint: 'focus' },
      { id: '2', company_name: 'B', sprint: 'volume' },
    ])
    const board = await service.board('w1')
    expect(board.focus).toHaveLength(1)
    expect(board.volume).toHaveLength(1)
    expect(board.extension).toEqual([])
  })

  describe('comptes non placés — #3296 (/accounts?lens=effort vide en prod)', () => {
    it('les comptes SANS niveau sont rendus à part, jamais confondus avec un niveau', async () => {
      const { service } = make([], 0, true, [
        { id: 'u1', company_name: 'SNCF', logo_url: null, website: null, priority_score: null },
        { id: 'u2', company_name: 'AIRBUS', logo_url: null, website: null, priority_score: 71 },
      ])
      const board = await service.board('w1')
      expect(board.unplaced.map(a => a.company_name)).toEqual(['SNCF', 'AIRBUS'])
      expect(board.focus).toEqual([])
    })

    it('aucun compte non placé → liste vide (pas de ligne fantôme)', async () => {
      const { service } = make([{ id: '1', company_name: 'A', sprint: 'focus' }])
      expect((await service.board('w1')).unplaced).toEqual([])
    })
  })

  describe('suggested_switch — #3296 (#3269.6), lu au moment du board, jamais écrit', () => {
    it('un partenaire lié apparaît sur un compte en extension → suggère partner_route', async () => {
      const { service } = make([
        { id: '1', company_name: 'Thales', sprint: 'extension', partner_name: 'Kalvyn Access (exemple)' },
      ])
      const board = await service.board('w1')
      expect(board.extension[0].suggested_switch).toEqual({
        to: 'partner_route',
        reason: 'Un partenaire ouvre la voie d’entrée — proposition de passer en route partenaire.',
      })
    })

    it('sans partenaire lié → aucune suggestion', async () => {
      const { service } = make([{ id: '1', company_name: 'A', sprint: 'extension', partner_name: null }])
      const board = await service.board('w1')
      expect(board.extension[0].suggested_switch).toBeNull()
    })

    it('un compte déjà en partner_route ne se suggère jamais lui-même', async () => {
      const { service } = make([{ id: '1', company_name: 'SNCF', sprint: 'partner_route', partner_name: 'X' }])
      const board = await service.board('w1')
      expect(board.partner_route[0].suggested_switch).toBeNull()
    })

    it('move() rend aussi la suggestion, sur l’état À JOUR du compte', async () => {
      const { service } = make([
        { id: '1', company_name: 'Thales', sprint: 'extension', partner_name: 'Kalvyn Access (exemple)' },
      ])
      const updated = await service.move('w1', '1', 'extension', null)
      expect(updated.suggested_switch?.to).toBe('partner_route')
    })
  })

  it('REFUSE le neuvième compte en Focus, avec le compte en clair', async () => {
    // La seule règle bloquante du board, et elle l'est par nécessité : sans
    // plafond, l'effort maximum devient l'effort moyen.
    const { service } = make([{ id: '1', company_name: 'A', sprint: 'volume' }], 8)
    await expect(service.move('w1', '1', 'focus', null)).rejects.toBeInstanceOf(ConflictException)
  })

  it('laisse entrer le huitième', async () => {
    const { service, updates } = make([{ id: '1', company_name: 'A', sprint: 'volume' }], 7)
    await service.move('w1', '1', 'focus', null)
    expect(updates[0]).toMatchObject({ sprint: 'focus' })
  })

  it('ne recompte pas le plafond pour un compte DÉJÀ en Focus', async () => {
    const { service, repo } = make([{ id: '1', company_name: 'A', sprint: 'focus' }], 8)
    await service.move('w1', '1', 'focus', null)
    expect(repo.count).not.toHaveBeenCalled()
  })

  it('REFUSE une sortie sans motif', async () => {
    const { service } = make([{ id: '1', company_name: 'A', sprint: 'volume' }])
    await expect(service.move('w1', '1', 'no_go', '  ')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('garde le motif en sortant, l’efface en remontant', async () => {
    const { service, updates } = make([{ id: '1', company_name: 'A', sprint: 'volume' }])
    await service.move('w1', '1', 'no_go', 'Pas de budget avant 2027')
    expect(updates[0]).toMatchObject({ sprint_exit_reason: 'Pas de budget avant 2027' })

    const back = make([{ id: '1', company_name: 'A', sprint: 'no_go' }])
    await back.service.move('w1', '1', 'volume', null)
    expect(back.updates[0]).toMatchObject({ sprint_exit_reason: null })
  })

  it('ne déplace pas un compte d’un autre espace', async () => {
    const { service, repo } = make([])
    repo.findOne.mockResolvedValue(null)
    await expect(service.move('w2', '1', 'focus', null)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('garde QUI a déplacé le compte — #3262 (BEL-SC-233)', async () => {
    const { service, updates } = make([{ id: '1', company_name: 'A', sprint: 'volume' }])
    await service.move('w1', '1', 'no_go', 'Pas de budget', {}, 'u-42')
    expect(updates[0]).toMatchObject({ sprint_decided_by: 'u-42' })
  })

  it('sans auteur transmis, ne devine personne (geste manuel)', async () => {
    const { service, updates } = make([{ id: '1', company_name: 'A', sprint: 'volume' }])
    await service.move('w1', '1', 'no_go', 'Pas de budget')
    expect(updates[0]).toMatchObject({ sprint_decided_by: null })
  })
})

/**
 * `planRequired` (N15-B) — déclaré cinq fois dans `SPRINT_RULES`, lu par
 * aucun appelant. Un board qui l'exige et dont le compte n'a pas de plan
 * refuse l'entrée en Focus — et dit ce qui manque : un refus muet se lit
 * comme un bug.
 */
describe('l’entrée en Focus exige un plan de compte (geste manuel)', () => {
  const make = (rows: Record<string, unknown>[], focusCount = 0, hasPlan = true) => {
    const updates: Record<string, unknown>[] = []
    const repo = {
      query: jest.fn((sql: string) =>
        String(sql).includes('action_plans') ? Promise.resolve([{ has_plan: hasPlan }]) : Promise.resolve(rows),
      ),
      findOne: jest.fn().mockResolvedValue(rows[0] ?? null),
      count: jest.fn().mockResolvedValue(focusCount),
      update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
        updates.push({ id, ...patch })
      }),
    }
    return { service: new SprintsService(repo as never), repo, updates }
  }

  it('REFUSE l’entrée en Focus sans plan, et dit ce qui manque', async () => {
    const { service } = make([{ id: '1', company_name: 'A', sprint: 'volume' }], 0, false)
    expect.assertions(2)
    try {
      await service.move('w1', '1', 'focus', null)
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException)
      expect((error as Error).message).toContain('plan de compte')
    }
  })

  it('laisse entrer en Focus un compte qui a un plan', async () => {
    const { service, updates } = make([{ id: '1', company_name: 'A', sprint: 'volume' }], 0, true)
    await service.move('w1', '1', 'focus', null)
    expect(updates[0]).toMatchObject({ sprint: 'focus' })
  })

  it('ne vérifie pas le plan pour un compte DÉJÀ en Focus — aucun geste d’entrée', async () => {
    const { service, repo } = make([{ id: '1', company_name: 'A', sprint: 'focus' }], 8, false)
    await service.move('w1', '1', 'focus', null)
    // `.query()` sert aussi à relire le compte après l'écriture (dernière
    // étape de `move`) : ce qu'on garde, c'est qu'AUCUN appel ne porte sur
    // `action_plans` — le plan n'est jamais consulté ici.
    expect(repo.query).not.toHaveBeenCalledWith(expect.stringContaining('action_plans'), expect.anything())
  })

  it('ne vérifie pas le plan pour un niveau qui ne l’exige pas', async () => {
    const { service, repo, updates } = make([{ id: '1', company_name: 'A', sprint: 'focus' }], 0, false)
    await service.move('w1', '1', 'volume', null)
    expect(updates[0]).toMatchObject({ sprint: 'volume' })
    expect(repo.query).not.toHaveBeenCalledWith(expect.stringContaining('action_plans'), expect.anything())
  })
})

/**
 * Les sept règles de bascule (`shouldSwitch`) étaient écrites, testées, et
 * n'avaient AUCUN appelant — la famille de défauts trouvée dans les huit tomes :
 * du code juste que personne n'appelle. Ces tests portent sur leur appelant.
 */
describe('les bascules d’effort ont enfin un appelant', () => {
  // `manager.transaction` est mocké pour rejouer le RUNNER sur la même liste
  // `queries` que `query` — un `applyEvent` qui écrit passe par la
  // transaction, `board()` (le plafond du Focus) passe par `query` seul.
  const makeService = (sprint: string | null, focusRows: Record<string, unknown>[] = []) => {
    const queries: unknown[][] = []
    const runnerQuery = jest.fn(async (sql: string, params: unknown[]) => {
      queries.push([sql, params])
      return sql.includes('UPDATE') ? [] : focusRows
    })
    const repo = {
      findOne: jest.fn().mockResolvedValue(sprint === null ? null : { id: 'a1', sprint }),
      query: runnerQuery,
      manager: {
        transaction: jest.fn(async (cb: (runner: { query: typeof runnerQuery }) => Promise<void>) => {
          await cb({ query: runnerQuery })
        }),
      },
    }
    return { service: new SprintsService(repo as never), queries }
  }

  it('MONTE l’effort toute seule sur une réponse positive', () => {
    const { service, queries } = makeService('volume')
    return service.applyEvent('w1', 'a1', 'positive_reply', 'action-1').then(result => {
      expect(result.applied).toBe(true)
      expect(result.level).toBe('extension')
      expect(queries.some(([sql]) => String(sql).includes('UPDATE accounts'))).toBe(true)
    })
  })

  it('PROPOSE de réveiller un compte en veille dont la condition est remplie, sans rien écrire (#3257.8)', async () => {
    const { service, queries } = makeService('watch')
    const result = await service.applyEvent('w1', 'a1', 'wake_condition_met', 'cond-1')
    expect(result).toMatchObject({ applied: false, level: 'watch', switch: { to: 'extension', automatic: false } })
    expect(queries.some(([sql]) => String(sql).includes('UPDATE accounts'))).toBe(false)
  })

  it('PROPOSE la route partenaire, avec son nom, sans rien écrire (#3257.8)', async () => {
    const { service, queries } = makeService('focus')
    const result = await service.applyEvent('w1', 'a1', 'partner_access_found', 'p-1')
    expect(result.switch).toMatchObject({ to: 'partner_route', automatic: false })
    expect(result.switch?.reason).toMatch(/route partenaire/)
    expect(queries.some(([sql]) => String(sql).includes('INSERT INTO sprint_switches'))).toBe(false)
  })

  it('PROPOSE, sans rien écrire, quand la bascule descend l’effort', async () => {
    // Descendre l'effort à la place du commercial, c'est décider à sa place
    // d'abandonner.
    const { service, queries } = makeService('extension')
    const result = await service.applyEvent('w1', 'a1', 'two_relances_no_reply', 'action-1')
    expect(result.applied).toBe(false)
    expect(result.switch?.to).toBe('no_go')
    expect(queries.some(([sql]) => String(sql).includes('UPDATE accounts'))).toBe(false)
  })

  it('ne fait pas sauter le plafond du Focus sur une bonne nouvelle', async () => {
    // Une bascule automatique refusée par le plafond redevient une PROPOSITION
    // plutôt que de disparaître : le commercial doit savoir qu'un compte
    // mériterait le Focus et que la place manque.
    const full = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, sprint: 'focus' }))
    const { service, queries } = makeService('extension', full)
    const result = await service.applyEvent('w1', 'a1', 'meeting_booked', 'action-1')
    expect(result.applied).toBe(false)
    expect(result.switch).toEqual(expect.objectContaining({ to: 'focus', automatic: false }))
    expect(queries.some(([sql]) => String(sql).includes('UPDATE accounts'))).toBe(false)
  })

  it('la bascule automatique vers Focus ignore `planRequired` — ce n’est pas une décision de l’utilisateur (N15-B)', async () => {
    // Décision prudente : bloquer une bonne nouvelle parce que le compte n'a
    // pas de plan reviendrait à faire porter à l'absence de plan une décision
    // que l'utilisateur n'a pas prise. Seul `move()` (geste manuel) applique
    // `sprintEntryProblems` — `applyEvent` ne l'appelle jamais.
    const { service, queries } = makeService('extension')
    const result = await service.applyEvent('w1', 'a1', 'meeting_booked', 'cause-rdv-1')
    expect(result.applied).toBe(true)
    expect(result.level).toBe('focus')
    expect(queries.some(([sql]) => String(sql).includes('UPDATE accounts'))).toBe(true)
    expect(queries.some(([sql]) => String(sql).includes('action_plans'))).toBe(false)
  })

  it('rejouer la même cause après la bascule ne fait plus rien — idempotent par construction', async () => {
    // La même cause — littéralement la même référence, `cause-reponse-1` —
    // rejouée sur le niveau qu'elle vient d'atteindre, ne trouve plus de règle
    // dans `shouldSwitch` : rien n'est réécrit une seconde fois. Deux appels séparés simulent l'avant/après,
    // comme le fait déjà `sprint.test.ts` pour `sprint_exit_reason`.
    const before = makeService('volume')
    const first = await before.service.applyEvent('w1', 'a1', 'positive_reply', 'cause-reponse-1')
    expect(first.applied).toBe(true)
    expect(first.level).toBe('extension')

    const after = makeService('extension')
    const second = await after.service.applyEvent('w1', 'a1', 'positive_reply', 'cause-reponse-1')
    expect(second.applied).toBe(false)
    expect(after.queries.some(([sql]) => String(sql).includes('UPDATE accounts'))).toBe(false)
  })

  it('ne pose pas d’office un compte hors board sur un niveau', async () => {
    const { service } = makeService(null)
    await expect(service.applyEvent('w1', 'a1', 'positive_reply', 'action-1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rend « rien à faire » quand l’évènement ne dit rien à ce niveau', async () => {
    const { service } = makeService('focus')
    const result = await service.applyEvent('w1', 'a1', 'asks_for_plan', 'action-1')
    expect(result).toEqual({ applied: false, switch: null, level: 'focus' })
  })

  it('n’attribue une bascule AUTOMATIQUE à personne — #3262 (BEL-SC-233)', async () => {
    const { service, queries } = makeService('volume')
    await service.applyEvent('w1', 'a1', 'positive_reply', 'action-1')
    const update = queries.find(([sql]) => String(sql).includes('UPDATE accounts'))
    expect(update?.[0]).toContain('sprint_decided_by = NULL')
  })
})

/**
 * m8 — la bascule automatique doit être TRAÇABLE (on sait ce qui l'a
 * déclenchée) et IDEMPOTENTE (la même cause ne bascule pas deux fois).
 *
 * ⚠️ Le piège nommé dans la mémoire du dépôt (`deterministic-jobid-trap`) :
 * une clé d'idempotence qui ne borne QUE par `(account_id, event)` confond
 * deux occurrences RÉELLES et DISTINCTES du même évènement sur le même
 * compte — exactement comme un `jobId` borné par compte confondait deux runs
 * d'analyse successifs. La clé doit inclure la RÉFÉRENCE de la cause
 * (`source_ref`), pas seulement sa nature. Ce bloc simule la contrainte
 * unique `sprint_switches_dedupe_idx (account_id, event, source_ref)` posée
 * par la migration, pour prouver que le SERVICE la respecte.
 */
describe('la bascule automatique est traçable et idempotente (m8)', () => {
  function makeStatefulService(initialSprint: string | null) {
    let sprint = initialSprint
    const seen = new Set<string>()
    const queries: unknown[][] = []
    const runnerQuery = jest.fn(async (sql: string, params: unknown[]) => {
      queries.push([sql, params])
      if (sql.includes('INSERT INTO sprint_switches')) {
        const [, accountId, event, sourceRef] = params as string[]
        const key = `${accountId}:${event}:${sourceRef}`
        if (seen.has(key)) {
          const error = new Error(
            'duplicate key value violates unique constraint "sprint_switches_dedupe_idx"',
          ) as Error & {
            code: string
          }
          error.code = '23505'
          throw error
        }
        seen.add(key)
        return []
      }
      if (sql.includes('UPDATE accounts')) {
        sprint = params[2] as string
        return []
      }
      return []
    })
    const repo = {
      findOne: jest.fn(async () => (sprint === null ? null : { id: 'a1', sprint })),
      query: runnerQuery,
      manager: {
        transaction: jest.fn(async (cb: (runner: { query: typeof runnerQuery }) => Promise<void>) => {
          await cb({ query: runnerQuery })
        }),
      },
    }
    return {
      service: new SprintsService(repo as never),
      queries,
      setSprint: (value: string | null) => {
        sprint = value
      },
      getSprint: () => sprint,
    }
  }

  it('insère une trace au moment où elle bascule', async () => {
    const { service, queries } = makeStatefulService('volume')
    await service.applyEvent('w1', 'a1', 'positive_reply', 'action-1')

    const insert = queries.find(([sql]) => String(sql).includes('INSERT INTO sprint_switches'))
    expect(insert).toBeDefined()
    const [, params] = insert as [string, unknown[]]
    expect(params).toEqual(['w1', 'a1', 'positive_reply', 'action-1', 'volume', 'extension', expect.any(String)])
  })

  it('la MÊME cause ne bascule pas deux fois, et une correction humaine posée entre les deux appels survit', async () => {
    // `meeting_booked` est automatique aussi bien depuis 'extension' que depuis
    // 'volume' (§29) : la correction humaine choisie ci-dessous laisse donc la
    // bascule ÉLIGIBLE une seconde fois, et c'est bien l'idempotence par
    // `source_ref` — pas une simple relecture de `shouldSwitch` — qui doit
    // arrêter le rejeu.
    const { service, setSprint, getSprint } = makeStatefulService('extension')

    const first = await service.applyEvent('w1', 'a1', 'meeting_booked', 'action-1')
    expect(first).toMatchObject({ applied: true, level: 'focus' })

    // Un humain corrige ENTRE les deux appels — le rejeu d'une même cause
    // (retry réseau, webhook redélivré) ne doit jamais lui reprendre la main.
    setSprint('volume')

    const replay = await service.applyEvent('w1', 'a1', 'meeting_booked', 'action-1')
    expect(replay).toEqual({ applied: false, switch: null, level: 'volume' })
    expect(getSprint()).toBe('volume') // pas réécrasé par le rejeu
  })

  it('deux causes DIFFÉRENTES du même évènement basculent bien deux fois', async () => {
    // Le piège du jobId déterministe : la clé n'est pas (compte, évènement)
    // seul, sinon une seconde réponse positive, bien réelle, des semaines
    // plus tard, ne basculerait plus jamais rien.
    const { service, setSprint } = makeStatefulService('volume')

    const first = await service.applyEvent('w1', 'a1', 'positive_reply', 'action-1')
    expect(first).toMatchObject({ applied: true, level: 'extension' })

    // Le compte redescend (correction humaine), puis une SECONDE réponse
    // positive — une cause différente — arrive plus tard.
    setSprint('volume')
    const second = await service.applyEvent('w1', 'a1', 'positive_reply', 'action-2')
    expect(second).toMatchObject({ applied: true, level: 'extension' })
  })
})

describe('le plafond du Focus de l’espace est lisible (#3407)', () => {
  const capacityFor = async (members: number | null): Promise<number> => {
    const repo = { query: jest.fn(async () => [{ n: members }]) }
    return new SprintsService(repo as never).focusCapacity('w1')
  }

  it('8 par commercial : un seul membre → 8, trois membres → 24', async () => {
    expect(await capacityFor(1)).toBe(8)
    expect(await capacityFor(3)).toBe(24)
  })

  it('équipe inconnue → le plafond par commercial, jamais 0', async () => {
    expect(await capacityFor(null)).toBe(8)
    expect(await capacityFor(0)).toBe(8)
  })
})
