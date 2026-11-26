import { MatchingService } from './matching.service'

/**
 * #1959.7 — « deux lancements identiques de `matchNeed` ne produisent pas
 * deux ÉCRITURES » : MESURÉ le 18/09, pas codé à l'aveugle.
 *
 * Ce que la mesure trouve : `matchNeed` écrit bien une NOUVELLE ligne
 * `match_runs` (+ ses `match_run_entries`) à CHAQUE appel — c'est
 * `journal()` (`matching.service.ts:236-295`), et c'est VOULU : le
 * commentaire de tête du service le dit explicitement — « Aucun crédit
 * n'est débité : le matching interne est le geste qu'on veut voir répété,
 * et le facturer le tuerait » (`matching.service.ts:54-55`). Un classement
 * relancé pour voir un vivier qui a bougé n'est pas un « double effet », au
 * même titre qu'une recherche relancée ne l'est pas.
 *
 * Le « double effet » que la doctrine interdit (« une écriture CRM/ERP passe
 * par une porte », « jamais de deuxième dépense ») ne s'applique donc pas
 * ICI de la même façon qu'à `export_contact_to_crm` ou `schedule_reminder` :
 * `MatchingService` n'a AUCUN chemin vers les crédits — son constructeur
 * n'injecte que `runs` / `entries` / `weightVersions` (matching.service.ts:
 * 61-65), rien qui touche `user_credits` ou une file de facturation. Ce test
 * le vérifie à l'exécution plutôt que de le croire sur lecture : sur DEUX
 * lancements identiques, aucune requête ni aucune ligne écrite ne porte la
 * moindre trace de crédit, et le CLASSEMENT rendu (D26, déterminisme) est
 * bit à bit le même.
 *
 * Point du registre : 1959.7 → DÉJÀ LÀ (le seul dédup qui aurait un sens ici
 * — sur le contenu — romprait le geste « reclasser après une correction »,
 * exactement le piège que `deterministic-jobid-trap` documente pour
 * `AnalysisService.buildJobId`).
 */
describe('MatchingService — deux lancements identiques de matchNeed, aucun double effet chargeable', () => {
  const needRow = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Développeur Java',
    skills: [{ term: 'Java', required: true, level: null }],
    seniority: 'senior',
    start_on: null,
    target_tjm_cents: '62000',
    location: 'Paris',
    contract_kind: 'regie',
    languages: [{ code: 'fr', level: 'natif' }],
    clearances: [],
    stack: [],
    status: 'to_match',
    account_id: '22222222-2222-4222-8222-222222222222',
    account_name: 'ACME',
    account_sector: 'Banque',
    project_sectors: null,
  }

  const consultantRow = {
    id: '33333333-3333-4333-8333-333333333333',
    full_name: 'Camille Fournier',
    title: 'Développeuse Java',
    seniority: 'senior',
    availability: 'immediate',
    available_from: null,
    availability_checked_at: null,
    contract_type: 'cdi',
    tjm: 620,
    sectors: ['Banque'],
    zones: ['IDF'],
    mobility_zones: null,
    remote_preference: null,
    refused_sectors: null,
    refused_technologies: null,
    references: null,
    languages: [{ code: 'fr', level: 'natif' }],
    clearances: null,
    consent_given_at: null,
    consent_expires_at: null,
    consent_basis: null,
  }

  /** Les requêtes SQL VUES par le service — c'est sur CETTE liste que le test
   *  cherche la moindre trace de crédit, pas sur une supposition. */
  const seenSql: string[] = []
  /** Les lignes VRAIMENT écrites (`runs.save` / `entries.save`) — même motif. */
  const savedRows: Record<string, unknown>[] = []

  function service() {
    const query = jest.fn(async (sql: string) => {
      seenSql.push(sql)
      if (sql.includes('FROM project_needs n')) return [needRow]
      if (sql.includes('FROM consultants c') && sql.includes('c.full_name')) return [consultantRow]
      if (sql.includes('FROM consultants c')) return [consultantRow]
      if (sql.includes('FROM consultant_skills')) {
        return [{ consultant_id: consultantRow.id, skill: 'java', raw_label: 'Java', level: 'confirme', source: 'cv' }]
      }
      if (sql.includes('FROM mission_assignments')) return []
      return []
    })
    const runs = {
      manager: { query },
      save: jest.fn(async (row: Record<string, unknown>) => {
        savedRows.push(row)
      }),
      create: (x: Record<string, unknown>) => x,
    }
    const entries = {
      save: jest.fn(async (rows: Record<string, unknown>[]) => {
        savedRows.push(...rows)
      }),
      create: (x: Record<string, unknown>) => x,
    }
    const weightVersions = {
      createQueryBuilder: () => {
        throw new Error('pas de version de pondération dans ce test')
      },
    }
    // #2178.33/.34 — aucun feedback ne porte sur ce besoin dans ce test : le
    // fallback générique de `query` ci-dessus rend déjà `[]` pour toute
    // requête non reconnue, donc `feedbackLearnings` reste `[]`, sans trace
    // de crédit à chercher dans `seenSql` (même objet, même mesure).
    const feedback = { manager: { query } }
    return new MatchingService(runs as never, entries as never, weightVersions as never, feedback as never)
  }

  const NOW = new Date('2026-09-18T09:00:00.000Z')

  it('rend le MÊME classement deux fois de suite (D26) — le déterminisme que #1959.7 réclame', async () => {
    const first = await service().matchNeed(needRow.id, null, 'user-1', { canReadFinance: true, now: NOW })
    const second = await service().matchNeed(needRow.id, null, 'user-1', { canReadFinance: true, now: NOW })

    // `runId` et `createdAt` sont l'identité de la TENTATIVE (voulue neuve à
    // chaque lancement, comme deux recherches) ; le CLASSEMENT lui-même —
    // buckets, scores, axes — doit être identique à l'octet près.
    const strip = (run: NonNullable<Awaited<ReturnType<MatchingService['matchNeed']>>>) => ({
      recommended: run.recommended,
      borderline: run.borderline,
      excluded: run.excluded,
      notEvaluable: run.notEvaluable,
      exclusionCounts: run.exclusionCounts,
    })
    expect(strip(first!)).toEqual(strip(second!))
  })

  it('deux lancements identiques ne laissent AUCUNE trace de crédit — ni en lecture, ni en écriture', async () => {
    seenSql.length = 0
    savedRows.length = 0

    await service().matchNeed(needRow.id, null, 'user-1', { canReadFinance: true, now: NOW })
    await service().matchNeed(needRow.id, null, 'user-1', { canReadFinance: true, now: NOW })

    for (const sql of seenSql) {
      expect(sql.toLowerCase()).not.toMatch(/credit/)
    }
    for (const row of savedRows) {
      expect(Object.keys(row).some(key => key.toLowerCase().includes('credit'))).toBe(false)
    }
  })

  it('chaque lancement journalise sa PROPRE tentative (un run, pas un dédup d’écriture) — c’est la mesure qui contredit la lecture naïve de #1959.7', async () => {
    savedRows.length = 0

    await service().matchNeed(needRow.id, null, 'user-1', { canReadFinance: true, now: NOW })
    await service().matchNeed(needRow.id, null, 'user-1', { canReadFinance: true, now: NOW })

    const runRows = savedRows.filter(row => 'need_id' in row && 'evaluated_count' in row)
    expect(runRows).toHaveLength(2)
    // Deux tentatives, deux identifiants distincts — jamais rejouées l'une sur l'autre.
    expect(new Set(runRows.map(row => row.id)).size).toBe(2)
  })
})
