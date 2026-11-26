import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import type { AnalysisPlanData } from '@bellum/contracts'
import {
  ACCOUNT_SCORE_GO_MIN,
  COMMERCIAL_OPPORTUNITY_SCORE_MIN,
  deriveCommercialStatusOnComplete,
  parseIdentityMismatchMessage,
} from '@bellum/contracts'
import { isFailure, isSuccess } from '@bellum/utils'
import type { CompanySearchResponse } from '@bellum/contracts'
import { AccountsService } from './accounts.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { SimilarAccountDismissalEntity } from '../../database/entities/similar-account-dismissal.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { IaClient } from '../ia/ia.client'
import { IsNull } from 'typeorm'

// #4731 — le geste sur un compte lit un OU : la ligne de l'espace actif, ou la ligne ANCIENNE
// (`workspace_id` NULL) de son propriétaire. Voir `accountGestureWhere`.
const gestureWhere = (id: string, userId: string) => [
  { id, workspace_id: 'ws-1' },
  { id, workspace_id: IsNull(), user_id: userId },
]

/**
 * Minimal in-memory accounts repository that actually honours the `workspace_id`
 * / `status` predicates, so the multi-user Phase-2 scoping proofs below exercise
 * real filtering (equivalence, write-then-read, cross-tenant) rather than just
 * asserting which clause was issued. Only the surface `AccountsService` touches
 * for the scoped list + create is emulated.
 */
type Row = Record<string, unknown> & { id: string; workspace_id: string | null; status: string; created_at: string }

/** Terminal-failure statuses — mirror of the service's FAILED_ANALYSIS_STATUSES,
 *  used by the in-memory repo to emulate the empty-shell exclusion clause. */
const FAILED_STATUSES = new Set(['error', 'canceled'])

function createInMemoryAccountsRepo(seed: Row[]) {
  const rows: Row[] = seed.map(r => ({ ...r }))
  const makeQb = () => {
    const preds: Array<(r: Row) => boolean> = []
    let orderCol = 'created_at'
    let orderDir: 'ASC' | 'DESC' = 'DESC'
    let off = 0
    let lim = Number.POSITIVE_INFINITY
    const qb = {
      where(_sql: string, params?: Record<string, unknown>) {
        return qb.andWhere(_sql, params)
      },
      andWhere(_sql: string, params?: Record<string, unknown>) {
        if (params && 'workspaceId' in params) preds.push(r => r.workspace_id === params['workspaceId'])
        if (params && 'deletedStatus' in params) preds.push(r => r.status !== params['deletedStatus'])
        if (params && 'status' in params) preds.push(r => r.status === params['status'])
        // PR 12C — le filtre statut est une LISTE (`IN (:...statuses)`) ; une seule valeur reste un filtre exact.
        if (params && Array.isArray(params['statuses']))
          preds.push(r => (params['statuses'] as unknown[]).includes(r.status))
        // Empty-shell exclusion (raw SQL, no params) — a seed row's `_has_data`
        // boolean stands in for the contacts/angles/plans/completed-run EXISTS.
        if (typeof _sql === 'string' && _sql.includes('keep-non-empty-failed')) {
          preds.push(r => !(FAILED_STATUSES.has(String(r.status)) && !r['_has_data']))
        }
        return qb
      },
      orderBy(expression: string, dir: 'ASC' | 'DESC') {
        // Le tri « dernière analyse » n'est plus une colonne mais une
        // expression (sous-requête sur `analysis_runs` + repli sur la date de
        // création d'un dossier `completed`). Le dépôt en mémoire la reconnaît
        // et retombe sur `created_at`, la seule date que ses lignes portent.
        orderCol = expression.includes('analysis_runs') ? 'created_at' : expression.replace('account.', '')
        orderDir = dir
        return qb
      },
      addOrderBy() {
        // Départage stable (`account.id`) : sans effet sur ces jeux de test,
        // dont les dates sont distinctes.
        return qb
      },
      select() {
        return qb
      },
      offset(n: number) {
        off = n
        return qb
      },
      limit(n: number) {
        lim = n
        return qb
      },
      clone() {
        return qb
      },
      async getCount() {
        return rows.filter(r => preds.every(p => p(r))).length
      },
      async getRawMany() {
        return rows
          .filter(r => preds.every(p => p(r)))
          .sort((a, b) =>
            orderDir === 'DESC'
              ? Date.parse(String(b[orderCol])) - Date.parse(String(a[orderCol]))
              : Date.parse(String(a[orderCol])) - Date.parse(String(b[orderCol])),
          )
          .slice(off, off + lim)
      },
    }
    return qb
  }
  return {
    _rows: rows,
    createQueryBuilder: () => makeQb(),
    create: (entity: Partial<Row>) => ({ ...entity }),
    save: async (entity: Partial<Row>) => {
      const row = {
        ...entity,
        id: entity.id ?? `acc-${rows.length + 1}`,
        created_at: (entity.created_at as string) ?? new Date().toISOString(),
      } as Row
      rows.push(row)
      return row
    },
    manager: { query: async () => [] },
  }
}

/** Découpe une expression sur un opérateur, en ignorant ce qui est entre
 *  parenthèses — un sous-`SELECT` n'est pas un opérande de plus. */
function splitTopLevel(expression: string, operator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < expression.length; i += 1) {
    const ch = expression[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (depth === 0 && expression.startsWith(operator, i)) {
      parts.push(expression.slice(start, i))
      i += operator.length - 1
      start = i + 1
    }
  }
  parts.push(expression.slice(start))
  return parts
}

/**
 * Rejoue l'instruction `SET raw_analysis = …` sur une ligne donnée.
 *
 * Le test décisif — « un angle ajouté à la main survit à une relance » — ne se
 * prouve pas en relisant une chaîne de caractères : il se prouve en appliquant
 * l'instruction à un dossier qui porte l'angle. Faute de base de données dans
 * un test unitaire, on évalue l'expression en s'appuyant sur UNE propriété
 * documentée de PostgreSQL : `a || b` fusionne deux objets `jsonb` à plat, et
 * l'opérande de DROITE l'emporte.
 *
 * Chaque opérande doit correspondre à l'une des trois formes attendues, sinon
 * l'évaluateur REFUSE de conclure. C'est ce qui l'empêche de rester vert après
 * avoir cessé de comprendre ce qu'il lit — une réécriture du SQL fait tomber le
 * test au lieu de le rendre muet.
 */
function applyRawAnalysisStatement(
  sql: string,
  params: unknown[],
  stored: Record<string, unknown>,
): Record<string, unknown> {
  // `WHERE id =` et non `WHERE ` : le sous-`SELECT` porte son propre `WHERE`,
  // et s'arrêter au premier amputerait l'expression de son dernier opérande —
  // celui qui protège justement les clés de l'utilisateur.
  const expression = /SET raw_analysis =([\s\S]*?)\n\s*WHERE id = /.exec(sql)?.[1]
  if (!expression) throw new Error("SET raw_analysis introuvable dans l'instruction")

  let out: Record<string, unknown> = {}
  for (const operand of splitTopLevel(expression, '||')) {
    const term = operand.replace(/\s+/g, ' ').trim()
    const literal = /^\$(\d+)::jsonb$/.exec(term)
    const kept = /jsonb_object_agg\(.*= ANY\(\$(\d+)::text\[\]\)/.exec(term)
    if (term === "COALESCE(raw_analysis, '{}'::jsonb)") {
      out = { ...out, ...stored }
    } else if (literal) {
      out = { ...out, ...(JSON.parse(String(params[Number(literal[1]) - 1])) as Record<string, unknown>) }
    } else if (kept) {
      for (const key of params[Number(kept[1]) - 1] as string[]) {
        if (key in stored) out[key] = stored[key]
      }
    } else {
      throw new Error(`Opérande non reconnu, l'évaluateur refuse de conclure : ${term}`)
    }
  }
  return out
}

describe('AccountsService', () => {
  let service: AccountsService
  let repo: MockRepository<AccountEntity>
  let ia: jest.Mocked<Pick<IaClient, 'discoverCompanies' | 'groupAffiliation' | 'searchCompanies'>>
  let workspaceContext: { resolveActiveWorkspace: jest.Mock }
  let esnProfile: { resolveProfileData: jest.Mock }

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    ia = {
      // Signature d'options laissée libre : `IaCallOpts` s'élargit (lecture de
      // l'en-tête de coûts, D19) sans que ce mock ait à suivre.
      discoverCompanies: jest.fn() as unknown as jest.Mocked<Pick<IaClient, 'discoverCompanies'>>['discoverCompanies'],
      // #2165.24 / #2166.3 / #2165.16 — `null` par défaut (IA muette / aucun
      // lien) : chaque test qui veut un rôle l'arme explicitement.
      groupAffiliation: jest.fn().mockResolvedValue(null),
      // #3084 — armé par les tests de `create()` qui tapent un SIREN nu ;
      // muet ailleurs (aucun suffixe de 9 chiffres à résoudre par défaut).
      searchCompanies: jest.fn().mockResolvedValue({ suggestions: [] }),
    }
    // Default: a solo user resolves to their single owned workspace (mirrors the
    // 1-user-=-1-workspace state today). Individual tests override as needed.
    workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
    // Default: empty seller profile → the hybrid ranking is a no-op (discovery
    // order preserved). Scoring tests override with a real profile.
    esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
    service = new AccountsService(repo as never, ia as never, workspaceContext as never, esnProfile as never)
  })

  describe('findAccountsByWorkspace', () => {
    it('returns accounts for a workspace, ordered by the REAL last-analysis date by default', async () => {
      const rows = [
        {
          id: '1',
          company_name: 'SNCF',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-06T00:00:00.000Z',
          recent_signals: [],
        },
      ]
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce(rows as never)
      const result = await service.findAccountsByWorkspace('ws-1')
      // Phase 2: scoped by workspace_id (the team), no longer by user_id.
      expect(repo._qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      // La colonne s'appelle « Dernière analyse » : elle doit trier sur la date
      // de FIN DE RUN, pas sur `created_at`. Un compte canonique n'est créé
      // qu'une fois — relancer son analyse ne bouge pas sa date de création, si
      // bien qu'un dossier ré-analysé aujourd'hui restait enfoui dans la liste.
      //
      // #3666.3 — sur le tri PAR DÉFAUT, un compte EN COURS D'ANALYSE (lui
      // aussi sans date de fin) passe désormais en tête, AVANT la date : c'est
      // le premier `orderBy`, la date devient un `addOrderBy`.
      const [analyzingExpr, analyzingDir] = repo._qb.orderBy.mock.calls[0] as [string, string]
      expect(analyzingExpr).toBe(`(account.status = 'analyzing')`)
      expect(analyzingDir).toBe('DESC')
      const [orderExpression, orderDirection, orderNulls] = repo._qb.addOrderBy.mock.calls[0] as [
        string,
        string,
        string,
      ]
      expect(orderExpression).toContain('analysis_runs')
      expect(orderExpression).toContain('MAX(r.completed_at)')
      expect(orderDirection).toBe('DESC')
      // Un compte sans analyse terminée affiche « — » : il se range à la fin,
      // jamais en tête (il n'est pas « le plus ancien », il n'a pas de date).
      expect(orderNulls).toBe('NULLS LAST')
      // …et un départage stable, sans quoi deux comptes de même date peuvent
      // permuter entre deux pages du défilement infini.
      expect(repo._qb.addOrderBy).toHaveBeenCalledWith('account.id', 'ASC')
      // #4054.2 — les comptes SANS date d'analyse (importés, jamais analysés)
      // se rangent entre eux du plus récent au plus ancien : un import du jour
      // ne s'enfouit pas sous 79 lignes au hasard de l'id.
      const calls = repo._qb.addOrderBy.mock.calls as unknown as Array<[string, string]>
      const createdIdx = calls.findIndex(([e, d]) => e === 'account.created_at' && d === 'DESC')
      expect(createdIdx).toBeGreaterThanOrEqual(0)
      expect(createdIdx).toBeLessThan(calls.findIndex(([e]) => e === 'account.id'))
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status <> :deletedStatus', { deletedStatus: 'deleted' })
      // ⚠️ `counters` est retiré avant la comparaison, et c'est délibéré : ce
      // faux dépôt ne SAIT PAS appliquer les prédicats SQL des compteurs de
      // tête (son `getCount` rend un nombre fixe), donc les chiffres qu'il rend
      // ici ne prouvent rien. Les compteurs ont leur propre garde, sur un faux
      // qui clone VRAIMENT : `accounts.headline-counters.spec.ts`. Les comparer
      // ici ferait passer ce test pour une preuve qu'il n'est pas.
      const { counters: _counters, ...shape } = result
      expect(shape).toEqual({
        data: [
          {
            id: '1',
            company_name: 'SNCF',
            sector: null,
            employees: null,
            // PR 12C — le siège est dans la ligne : `null` quand le compte n'en porte pas.
            headquarters: null,
            priority_score: null,
            status: 'completed',
            created_at: '2026-07-06T00:00:00.000Z',
            last_analyzed_at: null,
            primary_signal: null,
            signal_freshness: { eventDate: null, state: 'none', verifiedAt: null },
            watch_cadence: null,
            signal_preview: null,
            // Personne ne porte ce compte : `null`, jamais un porteur deviné.
            owner: null,
            // #2150.14/.18 — sans `currentUserId` (cet appel ne le passe pas),
            // personne à qui demander « est-ce ton favori » : `false`, jamais deviné.
            is_favorite: false,
            // #2159.26 — aucune étiquette posée : `[]`, jamais `null`.
            tags: [],
            // #2265.14 (épopée #2851) — ce faux dépôt ne rend pas `naf_code` : `null`.
            naf_code: null,
            // #3407.4 — ni action tracée ni plan sur ce faux dépôt : `null`, jamais deviné.
            last_action_at: null,
            next_action_label: null,
            next_action_horizon: null,
            // ⚠️ Ces sept clés valent `undefined`, et PAS `null` : les lignes de
            // ce faux dépôt ne portent simplement pas ces colonnes, et le mappeur
            // les laisse passer telles quelles. La nuance compte — `undefined`
            // disparaît à la sérialisation JSON (le client ne voit pas la clé),
            // là où `null` serait une absence AFFIRMÉE. Elles ont rejoint la
            // liste après la dernière mise à jour de ce contrat de forme, et ce
            // test ne les voyait pas : la CI choisit les tests d'API PAR DIFF, et
            // ce fichier n'était dans aucun des diffs qui les ont ajoutées
            // (mesuré le 29/10/2026 — la suite passait « verte » sans l'exécuter).
            commercial_status: undefined,
            logo_url: undefined,
            siren: undefined,
            sprint: undefined,
            sprint_reason: undefined,
            sprint_review_at: undefined,
            website: undefined,
            // Calculée, elle : aucun run repris sur ce faux dépôt, donc `false`.
            to_resume: false,
          },
        ],
        pagination: { currentPage: 1, size: 25, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false },
      })
    })

    // #2809 (#2293.3) — le SIREN de la ligne voyage désormais avec la liste :
    // lancer un lot d'analyse depuis `/accounts` (source `portfolio`) doit
    // pouvoir résoudre chaque compte sans ré-interroger le registre par nom.
    it('#2809 — sélectionne et mappe le SIREN de la ligne, `null` pour un compte sans SIREN', async () => {
      const rows = [
        {
          id: 'a1',
          company_name: 'SNCF',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-06T00:00:00.000Z',
          recent_signals: [],
          siren: '552049447',
        },
        {
          id: 'a2',
          company_name: 'LEGACY CO',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-06T00:00:00.000Z',
          recent_signals: [],
          siren: null,
        },
      ]
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce(rows as never)
      const result = await service.findAccountsByWorkspace('ws-1')
      const selected = repo._qb.select.mock.calls.at(-1)?.[0] as string[]
      expect(selected).toEqual(expect.arrayContaining(['account.siren AS siren']))
      expect(result.data.map(a => a.siren)).toEqual(['552049447', null])
    })

    it('sélectionne et transporte le NAF, pour dériver le badge « intermédiaire » côté écran (#2265.14)', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a1',
          company_name: 'Michael Page France',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-06T00:00:00.000Z',
          recent_signals: [],
          naf_code: '78.10Z',
        },
      ] as never)
      const result = await service.findAccountsByWorkspace('ws-1')
      const selected = repo._qb.select.mock.calls.at(-1)?.[0] as string[]
      expect(selected).toEqual(expect.arrayContaining(['account.naf_code AS naf_code']))
      expect(result.data[0]).toMatchObject({ naf_code: '78.10Z' })
    })

    // #3407.1 (beta 30/09/2026, #3407) — le niveau d'effort (`sprint`), sa
    // raison et sa date de revue étaient sélectionnés par `GET /sprints`
    // (le board) seul ; la liste (`GET /accounts`) n'en disait rien.
    it('#3407.1 — sélectionne et transporte le niveau d’effort, sa raison et sa date de revue', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a1',
          company_name: 'Société Générale',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-06T00:00:00.000Z',
          recent_signals: [],
          sprint: 'focus',
          sprint_reason: 'Appel d’offres en cours, contact chaud.',
          sprint_review_at: '2026-10-15',
        },
      ] as never)
      const result = await service.findAccountsByWorkspace('ws-1')
      const selected = repo._qb.select.mock.calls.at(-1)?.[0] as string[]
      expect(selected).toEqual(
        expect.arrayContaining([
          'account.sprint AS sprint',
          'account.sprint_reason AS sprint_reason',
          'account.sprint_review_at AS sprint_review_at',
        ]),
      )
      expect(result.data[0]).toMatchObject({
        sprint: 'focus',
        sprint_reason: 'Appel d’offres en cours, contact chaud.',
        sprint_review_at: '2026-10-15',
      })
    })

    it('#3407.1 — un compte sans niveau d’effort rend `null`, jamais un niveau deviné', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a1',
          company_name: 'LEGACY CO',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-06T00:00:00.000Z',
          recent_signals: [],
          sprint: null,
          sprint_reason: null,
          sprint_review_at: null,
        },
      ] as never)
      const result = await service.findAccountsByWorkspace('ws-1')
      expect(result.data[0]).toMatchObject({ sprint: null, sprint_reason: null, sprint_review_at: null })
    })

    // #3407.4 (recette 30/09) — « dernière action » et « prochaine action » :
    // calculées par `portfolioPriorities` (#3209) pour le seul copilote, jamais
    // portées par la ligne de liste. Les MÊMES lectures, une fois par page.
    it('#3407.4 — sélectionne et transporte la dernière action et la prochaine action du plan', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a1',
          company_name: 'Thales',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-06T00:00:00.000Z',
          recent_signals: [],
          last_action_at: '2026-09-20',
          next_action_label: 'Relancer le sponsor',
          next_action_horizon: 'cette semaine',
        },
      ] as never)
      const result = await service.findAccountsByWorkspace('ws-1')
      const selected = repo._qb.select.mock.calls.at(-1)?.[0] as string[]
      expect(selected).toEqual(
        expect.arrayContaining([
          expect.stringContaining('AS last_action_at'),
          expect.stringContaining('AS next_action_label'),
          expect.stringContaining('AS next_action_horizon'),
        ]),
      )
      expect(result.data[0]).toMatchObject({
        last_action_at: '2026-09-20',
        next_action_label: 'Relancer le sponsor',
        next_action_horizon: 'cette semaine',
      })
    })

    it('#3407.4 — sans action ni plan : `null`, jamais une date ou une action devinée', async () => {
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a1',
          company_name: 'LEGACY CO',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-06T00:00:00.000Z',
          recent_signals: [],
        },
      ] as never)
      const result = await service.findAccountsByWorkspace('ws-1')
      expect(result.data[0]).toMatchObject({ last_action_at: null, next_action_label: null, next_action_horizon: null })
    })

    it('attache la VRAIE date de dernière analyse (MAX completed_at), pas created_at', async () => {
      const rows = [
        {
          id: 'a1',
          company_name: 'ALSEDIS',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-07-15T09:00:00.000Z',
          recent_signals: [],
        },
        {
          id: 'a2',
          company_name: 'LEGACY',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'completed',
          created_at: '2026-01-01T00:00:00.000Z',
          recent_signals: [],
        },
      ]
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce(rows as never)
      // a1 a un run terminé aujourd'hui ; a2 (legacy) n'en a aucun.
      repo.manager.query.mockResolvedValueOnce([
        { account_id: 'a1', last_analyzed_at: new Date('2026-07-20T14:30:00.000Z') },
      ])

      const result = await service.findAccountsByWorkspace('ws-1')

      // a1 : la date réelle du run, JAMAIS son created_at du 15 juillet.
      expect(result.data[0]!.last_analyzed_at).toBe('2026-07-20T14:30:00.000Z')
      expect(result.data[0]!.last_analyzed_at).not.toBe(result.data[0]!.created_at)
      // a2 : aucun run → null (le client retombera sur created_at, l'API ne le fait pas).
      expect(result.data[1]!.last_analyzed_at).toBeNull()
      // La requête ne compte QUE les runs terminés avec un completed_at.
      const sql = repo.manager.query.mock.calls[0]![0] as string
      expect(sql).toContain('MAX(completed_at)')
      expect(sql).toContain('completed_at IS NOT NULL')
      expect(sql).toContain("status = 'completed'")
    })

    it('ne compte PAS un run en vol (completed_at NULL exclu par la requête)', async () => {
      // Le run en vol est exclu côté SQL, donc l'account n'est pas dans le
      // résultat → null. Un run en cours n'est jamais « la dernière analyse ».
      repo._qb.getCount.mockResolvedValueOnce(1)
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a1',
          company_name: 'EN COURS',
          sector: null,
          employees: null,
          priority_score: null,
          status: 'analyzing',
          created_at: '2026-07-15T09:00:00.000Z',
          recent_signals: [],
        },
      ] as never)
      repo.manager.query.mockResolvedValueOnce([]) // aucun run terminé

      const result = await service.findAccountsByWorkspace('ws-1')

      expect(result.data[0]!.last_analyzed_at).toBeNull()
    })

    it('resolveLastAnalyzedByAccount: [] ne déclenche aucune requête', async () => {
      const map = await service.resolveLastAnalyzedByAccount([])
      expect(map.size).toBe(0)
      expect(repo.manager.query).not.toHaveBeenCalled()
    })

    it('resolveLastAnalyzedByAccount: un échec de requête dégrade en map vide, jamais une date inventée', async () => {
      repo.manager.query.mockRejectedValueOnce(new Error('db down'))
      const map = await service.resolveLastAnalyzedByAccount(['a1'])
      expect(map.size).toBe(0)
    })

    // Refonte Théo (comptes-liste) — la colonne « Personnes ».
    it('resolvePeopleByAccount: compte les contacts, deux visages au plus, décideur = rôle technique ou économique', async () => {
      repo.manager.query.mockResolvedValueOnce([
        { account_id: 'a1', full_name: 'Maxime Delaunay', decision_role: 'economic' },
        { account_id: 'a1', full_name: 'Camille Aubert', decision_role: 'user' },
        { account_id: 'a1', full_name: 'Paul Roy', decision_role: null },
        { account_id: 'a2', full_name: 'Sophie Lenoir', decision_role: 'influencer' },
      ])
      const map = await service.resolvePeopleByAccount(['a1', 'a2', 'a3'])
      expect(map.get('a1')).toEqual({
        count: 3,
        has_decider: true,
        top: [
          { name: 'Maxime Delaunay', is_decider: true },
          { name: 'Camille Aubert', is_decider: false },
        ],
      })
      expect(map.get('a2')?.has_decider).toBe(false)
      // Un compte sans contact n'a pas d'entrée : l'écran n'écrit jamais « 0 personne ».
      expect(map.has('a3')).toBe(false)
    })

    it('resolvePeopleByAccount: [] ne déclenche aucune requête, un échec dégrade en carte vide', async () => {
      expect((await service.resolvePeopleByAccount([])).size).toBe(0)
      expect(repo.manager.query).not.toHaveBeenCalled()
      repo.manager.query.mockRejectedValueOnce(new Error('db down'))
      expect((await service.resolvePeopleByAccount(['a1'])).size).toBe(0)
    })

    // #3666.3 — la bascule « en cours en tête » ne s'applique QU'au tri PAR
    // DÉFAUT (aucun `sort` explicite) : un tri `date_asc` demandé exprès reste
    // celui que la personne a choisi, sans bascule ajoutée dans son dos.
    it('un tri `date_asc` EXPLICITE ne reçoit pas la bascule « en cours en tête »', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { sort: 'date_asc' })
      const [orderExpression, orderDirection] = repo._qb.orderBy.mock.calls[0] as [string, string]
      expect(orderExpression).toContain('analysis_runs')
      expect(orderDirection).toBe('ASC')
      expect(repo._qb.orderBy.mock.calls.some(c => c[0] === `(account.status = 'analyzing')`)).toBe(false)
    })

    it('applies q (ILIKE) and status filters and the requested sort', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { q: 'lvmh', status: 'completed', sort: 'name_asc' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith(
        expect.stringMatching(/^\(account\.company_name ILIKE :q OR account\.sector ILIKE :q OR EXISTS/),
        {
          q: '%lvmh%',
        },
      )
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status IN (:...statuses)', { statuses: ['completed'] })
      expect(repo._qb.orderBy).toHaveBeenCalledWith('account.company_name', 'ASC', 'NULLS LAST')
    })

    it('#3184.1 — reusableOnly élargit à « completed OU au moins un contact déjà enregistré »', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { reusableOnly: true })
      const call = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes('EXISTS'))
      expect(call?.[0]).toContain("account.status = 'completed'")
      expect(call?.[0]).toContain('SELECT 1 FROM contacts c WHERE c.account_id = account.id')
      // Orthogonal à `status` : ce lot ne l'envoie jamais en même temps.
      expect(repo._qb.andWhere).not.toHaveBeenCalledWith('account.status IN (:...statuses)', expect.anything())
    })

    it('sans reusableOnly, la clause `completed OU contact` n’est jamais posée (chemin byte-identique)', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { q: 'lvmh' })
      expect(repo._qb.andWhere.mock.calls.some(c => String(c[0]).includes("account.status = 'completed' OR"))).toBe(
        false,
      )
    })

    /**
     * #2627.1 — « trier et filtrer le portefeuille par VERDICT, pas score ».
     * Le filtre `score=high/medium/low` mappait déjà GO/PRUDENT/NO-GO en SQL
     * (mêmes coupures que le badge du dossier), mais aucun tri ne l'exposait —
     * seuls `name`/`date` existaient. `NULLS LAST` (déjà posé pour tous les
     * tris) garde les comptes non notés en fin de liste, quel que soit le sens.
     */
    it('sort=score_desc classe par priority_score décroissant, GO en tête', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { sort: 'score_desc' })
      // SIMON-FIX S.19 — l'écran AFFICHE le /25 (`score_25`) : le tri lit ce même nombre d'abord
      // (recette Simon 20/10 : 10,15,15,17,17,17,18,17 — pas monotone), `priority_score` départage.
      expect(repo._qb.orderBy).toHaveBeenCalledWith(expect.stringContaining("'evaluation'"), 'DESC', 'NULLS LAST')
      expect(repo._qb.addOrderBy).toHaveBeenCalledWith('account.priority_score', 'DESC', 'NULLS LAST')
    })

    it('sort=score_asc classe par priority_score croissant', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { sort: 'score_asc' })
      expect(repo._qb.orderBy).toHaveBeenCalledWith(expect.stringContaining("'evaluation'"), 'ASC', 'NULLS LAST')
      expect(repo._qb.addOrderBy).toHaveBeenCalledWith('account.priority_score', 'ASC', 'NULLS LAST')
      // clé secondaire stable : deux comptes de même score ne permutent pas entre deux pages.
      expect(repo._qb.addOrderBy).toHaveBeenCalledWith('account.id', 'ASC')
    })

    /**
     * #1316.3 — « Rechercher un compte, un secteur ou un mot-clé ».
     *
     * Le secteur est une COLONNE de la liste et un filtre à part entière :
     * l'utilisateur lit « Banque » à l'écran, le tape dans la barre, et
     * n'obtient rien. C'est le même défaut que le SIREN au 31/08 — la barre
     * annonce ce qu'elle ne cherche pas.
     */
    it('cherche AUSSI le secteur — le mot est à l’écran, il doit répondre (#1316.3)', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { q: 'banque' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith(
        expect.stringMatching(/^\(account\.company_name ILIKE :q OR account\.sector ILIKE :q OR EXISTS/),
        {
          q: '%banque%',
        },
      )
    })

    it('cherche le secteur EN PLUS du nom, jamais à sa place (#1316.3)', async () => {
      // La garde sait dire NON : remplacer le nom par le secteur ferait
      // disparaître le compte qu'on tape par son nom.
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { q: 'lvmh' })
      const clauses = (repo._qb.andWhere.mock.calls as [string, unknown][]).map(([c]) => String(c))
      expect(clauses.some(c => c.includes('account.company_name ILIKE :q'))).toBe(true)
      expect(clauses.some(c => c.includes('account.sector ILIKE :q'))).toBe(true)
    })

    /* ────────────────────────────────────────────────────────────────────── */
    /*  CHERCHER PAR IDENTIFIANT LÉGAL (31/08/2026)                          */
    /*                                                                       */
    /*  La barre annonçait « SIREN… » et ne cherchait que le nom : taper le   */
    /*  numéro d'une facture rendait zéro résultat, ce qui se lit « ce client */
    /*  n'existe pas » et pousse à le recréer en double.                      */
    /* ────────────────────────────────────────────────────────────────────── */

    /** Le dernier `andWhere` dont la clause contient `account_entities`. */
    function identifierClause(): [string, Record<string, unknown>] | null {
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.filter(([clause]) => String(clause).includes('account_entities')).pop()
      return hit ?? null
    }

    it('cherche AUSSI le SIREN et le SIRET des entités quand la saisie est un numéro', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { q: '420624777' })
      const clause = identifierClause()
      expect(clause).not.toBeNull()
      expect(clause?.[0]).toContain('ae.siren')
      expect(clause?.[0]).toContain('ae.siret')
      // Le nom reste cherché : un numéro ne REMPLACE pas la recherche
      // textuelle, il s'y ajoute.
      expect(clause?.[0]).toContain('account.company_name ILIKE :q')
      expect(clause?.[1]).toMatchObject({ q: '%420624777%', digitsLike: '%420624777%' })
    })

    it('retire les séparateurs de saisie — « 420 624 777 » et « 420624777 » sont le même SIREN', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { q: '420 624 777' })
      expect(identifierClause()?.[1]).toMatchObject({ digitsLike: '%420624777%' })
    })

    it('n’ouvre PAS la branche identifiant sur un nom qui contient un chiffre', async () => {
      // « TF1 » n'est pas une recherche de SIREN. L'ouvrir ferait remonter tous
      // les comptes dont un SIREN contient « 1 » — des faux positifs qu'aucun
      // `OR` ne rattrape.
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { q: 'TF1' })
      expect(identifierClause()).toBeNull()
      expect(repo._qb.andWhere).toHaveBeenCalledWith(
        expect.stringMatching(/^\(account\.company_name ILIKE :q OR account\.sector ILIKE :q OR EXISTS/),
        {
          q: '%TF1%',
        },
      )
    })

    it('n’ouvre PAS la branche identifiant sous trois chiffres — « 42 » ne discrimine rien', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { q: '42' })
      expect(identifierClause()).toBeNull()
    })

    /* ────────────────────────────────────────────────────────────────────── */
    /*  LE TYPE D'ENTITÉ (31/08/2026)                                        */
    /* ────────────────────────────────────────────────────────────────────── */

    it('filtre sur le type d’entité par EXISTS — un compte à trois filiales n’apparaît pas trois fois', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { entityKind: 'subsidiary' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => String(clause).includes('ae.kind IN (:...entityKinds)'))
      expect(hit).toBeDefined()
      expect(String(hit?.[0])).toContain('EXISTS')
      expect(hit?.[1]).toMatchObject({ entityKinds: ['subsidiary'] })
    })

    it("traite entityKind='all' comme l'absence de filtre", async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { entityKind: 'all' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      expect(calls.some(([clause]) => String(clause).includes('ae.kind'))).toBe(false)
    })

    /* ────────────────────────────────────────────────────────────────────── */
    /*  #2159.26 — LES ÉTIQUETTES (19/09/2026)                               */
    /* ────────────────────────────────────────────────────────────────────── */

    // #2159.26 — graphie de la première saisie (décision Louis 19/09) : les
    // étiquettes ne sont plus stockées en minuscules, le filtre compare donc
    // par CLÉ (`lower`), pas par containment `@>` exact.
    it('#2159.26 — filtre sur une étiquette NORMALISÉE : « SAP » et « sap » filtrent pareil', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { tag: '  SAP ' })
      const calls = repo._qb.andWhere.mock.calls as [string, Record<string, unknown>][]
      const hit = calls.find(([clause]) => String(clause).includes('unnest(account.tags)'))
      expect(String(hit?.[0])).toContain('lower(')
      expect(hit?.[1]).toEqual({ tagKeys: ['sap'] })
    })

    it('#2159.26 — la ligne de liste porte ses étiquettes, `[]` quand il n’y en a aucune', async () => {
      repo._qb.getCount.mockResolvedValueOnce(2)
      repo._qb.getRawMany.mockResolvedValueOnce([
        { id: 'a-1', company_name: 'A', tags: ['sap', 'cloud'] },
        { id: 'a-2', company_name: 'B', tags: null },
      ] as never)
      const page = await service.findAccountsByWorkspace('ws-1', {})
      expect(page.data.map(row => row.tags)).toEqual([['sap', 'cloud'], []])
    })

    it("treats status='all' as no filter", async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { status: 'all' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status <> :deletedStatus', { deletedStatus: 'deleted' })
      expect(repo._qb.andWhere).not.toHaveBeenCalledWith('account.status IN (:...statuses)', expect.anything())
    })

    it('allows explicitly filtering deleted accounts', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1', { status: 'deleted' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status IN (:...statuses)', { statuses: ['deleted'] })
    })

    it('returns empty paginated payload on repo failure', async () => {
      repo._qb.getCount.mockRejectedValueOnce(new Error('DB error') as never)
      const result = await service.findAccountsByWorkspace('ws-1')
      expect(result).toEqual({
        data: [],
        pagination: { currentPage: 1, size: 25, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false },
      })
    })
  })

  // ---- Multi-user Phase 2 scoping proofs (the INVARIANT) --------------------
  // Uses a repo that actually honours the workspace_id/status predicates so we
  // prove behaviour is preserved today AND the write-gap is closed.
  describe('workspace scoping (Phase 2 invariant)', () => {
    const seed: Row[] = [
      {
        id: 'a',
        user_id: 'u1',
        workspace_id: 'w1',
        company_name: 'Alpha',
        sector: null,
        employees: null,
        priority_score: null,
        status: 'completed',
        created_at: '2026-07-06T00:00:03.000Z',
        recent_signals: [],
      },
      {
        id: 'b',
        user_id: 'u1',
        workspace_id: 'w1',
        company_name: 'Beta',
        sector: null,
        employees: null,
        priority_score: null,
        status: 'completed',
        created_at: '2026-07-06T00:00:02.000Z',
        recent_signals: [],
      },
      {
        id: 'c',
        user_id: 'u2',
        workspace_id: 'w2',
        company_name: 'Gamma',
        sector: null,
        employees: null,
        priority_score: null,
        status: 'completed',
        created_at: '2026-07-06T00:00:01.000Z',
        recent_signals: [],
      },
    ]

    it('equivalence: workspace scope returns the SAME rows the former user_id scope did (1 user = 1 workspace)', async () => {
      const memRepo = createInMemoryAccountsRepo(seed)
      const svc = new AccountsService(memRepo as never, ia as never, workspaceContext as never, esnProfile as never)

      const underWorkspaceScope = await svc.findAccountsByWorkspace('w1')
      // What per-user scoping returned for u1 (sole member of w1 today):
      const underUserScope = seed
        .filter(r => r.user_id === 'u1')
        .sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))

      expect(underWorkspaceScope.data.map(r => r.id)).toEqual(underUserScope.map(r => r.id))
      expect(underWorkspaceScope.data.map(r => r.id)).toEqual(['a', 'b'])
    })

    it('cross-tenant: a row in another workspace is NOT returned', async () => {
      const memRepo = createInMemoryAccountsRepo(seed)
      const svc = new AccountsService(memRepo as never, ia as never, workspaceContext as never, esnProfile as never)

      const result = await svc.findAccountsByWorkspace('w1')
      expect(result.data.some(r => r.id === 'c')).toBe(false)
    })

    it('write-then-read: an account created via the service is returned by the scoped list (closes the write-gap)', async () => {
      const memRepo = createInMemoryAccountsRepo([])
      // The creator resolves to workspace w1.
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1', role: 'owner' })
      const svc = new AccountsService(memRepo as never, ia as never, workspaceContext as never, esnProfile as never)

      const created = await svc.create('u1', { company_name: 'Delta' })
      expect(isSuccess(created)).toBe(true)

      // Same workspace sees it...
      const inWorkspace = await svc.findAccountsByWorkspace('w1')
      expect(inWorkspace.data.map(r => r.company_name)).toContain('Delta')

      // ...another workspace does not (proves workspace_id was actually stamped).
      const otherWorkspace = await svc.findAccountsByWorkspace('w2')
      expect(otherWorkspace.data).toHaveLength(0)
    })
  })

  // ---- Anti-parasite : coquilles errored/canceled VIDES exclues de la liste ----
  describe('empty errored/canceled shell exclusion (« comptes fantômes score - »)', () => {
    it('adds the keep-non-empty-failed clause to the default portfolio view', async () => {
      repo._qb.getCount.mockResolvedValueOnce(0)
      repo._qb.getRawMany.mockResolvedValueOnce([] as never)
      await service.findAccountsByWorkspace('ws-1')
      expect(repo._qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('keep-non-empty-failed'))
    })

    // ⚠️ « le filtre « Échecs » n'exclut PAS les coquilles » se prouve par le
    // COMPORTEMENT, et plus par un espion sur `andWhere`. Mesuré le 29/10/2026 :
    // ce fichier partage UN SEUL faux query builder (`repo._qb`) entre toutes
    // les requêtes d'un même appel, si bien qu'un
    // `not.toHaveBeenCalledWith(… 'keep-non-empty-failed')` attrapait aussi la
    // requête des COMPTEURS d'espace (`spaceCountersBase`), qui applique la
    // clause à bon droit : les compteurs de tête décrivent la vue par défaut,
    // pas la liste filtrée. Une garde ne doit pas attraper ce qu'elle ne vise
    // pas — et la règle visée est prouvée plus bas, sur un faux dépôt qui
    // honore réellement le prédicat (`_has_data`), pour `error` ET `canceled`.

    // Behavioural proofs with a repo that honours the exclusion (via `_has_data`).
    const seed: Row[] = [
      {
        id: 'ok',
        workspace_id: 'w1',
        company_name: 'Completed Co',
        status: 'completed',
        created_at: '2026-07-06T00:00:03.000Z',
        recent_signals: [],
        _has_data: true,
      },
      {
        id: 'shell',
        workspace_id: 'w1',
        company_name: 'Empty Errored',
        status: 'error',
        created_at: '2026-07-06T00:00:02.000Z',
        recent_signals: [],
        _has_data: false,
      },
      {
        id: 'errored-with-data',
        workspace_id: 'w1',
        company_name: 'Partial Errored',
        status: 'error',
        created_at: '2026-07-06T00:00:01.000Z',
        recent_signals: [],
        _has_data: true,
      },
      {
        id: 'canceled-shell',
        workspace_id: 'w1',
        company_name: 'Empty Canceled',
        status: 'canceled',
        created_at: '2026-07-06T00:00:00.000Z',
        recent_signals: [],
        _has_data: false,
      },
    ]

    it('(d/e) hides EMPTY errored/canceled shells by default but KEEPS errored rows WITH data', async () => {
      const memRepo = createInMemoryAccountsRepo(seed)
      const svc = new AccountsService(memRepo as never, ia as never, workspaceContext as never, esnProfile as never)

      const result = await svc.findAccountsByWorkspace('w1')
      const ids = result.data.map(r => r.id)

      expect(ids).toContain('ok')
      expect(ids).toContain('errored-with-data') // (e) errored WITH data stays visible + kept
      expect(ids).not.toContain('shell') // (d) empty errored shell hidden
      expect(ids).not.toContain('canceled-shell') // empty canceled shell hidden
    })

    it('(d) surfaces the empty shell when explicitly viewing failures (status=error)', async () => {
      const memRepo = createInMemoryAccountsRepo(seed)
      const svc = new AccountsService(memRepo as never, ia as never, workspaceContext as never, esnProfile as never)

      const result = await svc.findAccountsByWorkspace('w1', { status: 'error' })
      const ids = result.data.map(r => r.id)

      // The « Échecs » filter shows every errored row, empty shells included.
      expect(ids).toEqual(expect.arrayContaining(['shell', 'errored-with-data']))
      // canceled is filtered out by the status=error equality itself, not by us.
      expect(ids).not.toContain('canceled-shell')
    })

    // Le jumeau du précédent pour `canceled` — il remplace l'espion retiré
    // plus haut : c'est le seul des deux qui prouve que la coquille REMONTE,
    // au lieu de constater qu'une clause SQL n'a pas été écrite.
    it('(d) surfaces the empty shell when explicitly viewing failures (status=canceled)', async () => {
      const memRepo = createInMemoryAccountsRepo(seed)
      const svc = new AccountsService(memRepo as never, ia as never, workspaceContext as never, esnProfile as never)

      const result = await svc.findAccountsByWorkspace('w1', { status: 'canceled' })
      const ids = result.data.map(r => r.id)

      expect(ids).toContain('canceled-shell')
      // …et l'égalité de statut écarte les lignes en erreur, pas notre prédicat.
      expect(ids).not.toContain('shell')
      expect(ids).not.toContain('errored-with-data')
    })

    it('the hidden shell stays physically in base (idempotence / relance — jamais supprimé au runtime)', async () => {
      const memRepo = createInMemoryAccountsRepo(seed)
      expect(memRepo._rows.some(r => r.id === 'shell')).toBe(true)
      expect(memRepo._rows.some(r => r.id === 'canceled-shell')).toBe(true)
    })
  })

  // ---- Compte canonique unique : lookups de dédup (#494) --------------------
  describe('findReusableFailedByUserAndCompany (canonical dedup, workspace-scoped)', () => {
    it('scopes by the caller active workspace + the error/canceled statuses, newest first', async () => {
      const errored = { id: 'acc-err', status: 'error' } as AccountEntity
      repo._qb.getOne.mockResolvedValueOnce(errored)

      const result = await service.findReusableFailedByUserAndCompany('u-1', 'Decathlon')

      expect(result).toBe(errored)
      expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
      // WORKSPACE-scoped (not per-user) — a teammate's errored shell of the same
      // company is reused, not duplicated (« un seul compte par (workspace, entreprise) »).
      expect(repo._qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      // Reusable shells: the two terminal failures + `prospect` (portfolio
      // account never analysed — analysing it must land on the SAME row, not a
      // duplicate). Never analyzing (layer-2), completed (cache / relance en
      // place), archived, deleted.
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status IN (:...statuses)', {
        statuses: ['error', 'canceled', 'prospect'],
      })
      expect(repo._qb.orderBy).toHaveBeenCalledWith('account.updated_at', 'DESC')
    })

    it('matches company_name case/whitespace-insensitively (lower + trim on both sides) when no id given', async () => {
      await service.findReusableFailedByUserAndCompany('u-1', '  DECATHLON  ')
      const keyCall = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes('LOWER(TRIM(account.company_name))'))
      expect(keyCall?.[0]).toBe('(LOWER(TRIM(account.company_name)) = LOWER(TRIM(:companyName)))')
      expect(keyCall?.[1]).toEqual({ companyName: '  DECATHLON  ' })
    })

    it('fails open (null) on a DB error (getOne throws) — a blip must never block a relaunch', async () => {
      repo._qb.getOne.mockRejectedValueOnce(new Error('DB blip'))
      expect(await service.findReusableFailedByUserAndCompany('u-1', 'Decathlon')).toBeNull()
    })

    it('matches by normalized name OR siren when a siren is given (« re-search par SIREN »)', async () => {
      await service.findReusableFailedByUserAndCompany('u-1', '  DECATHLON ', { siren: '306138900' })
      const call = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes('account.siren = :siren'))
      expect(call?.[0]).toContain('LOWER(TRIM(account.company_name)) = LOWER(TRIM(:companyName))')
      expect(call?.[1]).toEqual(expect.objectContaining({ companyName: '  DECATHLON ', siren: '306138900' }))
    })

    it('matches by (registry_id, registry_country) — international dedup #494', async () => {
      await service.findReusableFailedByUserAndCompany('u-1', 'Nestlé', {
        registryId: 'CHE105944452',
        registryCountry: 'CH',
      })
      const call = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes('account.registry_id = :registryId'))
      expect(call?.[0]).toContain('account.registry_country = :registryCountry')
      expect(call?.[1]).toEqual(expect.objectContaining({ registryId: 'CHE105944452', registryCountry: 'CH' }))
    })

    it('returns the matched row (getOne)', async () => {
      repo._qb.getOne.mockResolvedValueOnce({ id: 'acc-errored' } as never)
      expect(await service.findReusableFailedByUserAndCompany('u-1', 'Decathlon')).toEqual({ id: 'acc-errored' })
    })

    it('fails open (null) when workspace resolution throws — never blocks a relaunch', async () => {
      workspaceContext.resolveActiveWorkspace.mockRejectedValueOnce(new Error('db down'))
      expect(await service.findReusableFailedByUserAndCompany('u-1', 'Decathlon')).toBeNull()
    })
  })

  describe('#4603 — findSameCompanyAccount (quel que soit le statut, espace actif)', () => {
    it('reprend la fiche CRM de la même société sur la clé partagée, lue DANS l’espace', async () => {
      repo.manager.query.mockResolvedValueOnce([
        {
          id: 'acc-crm',
          company_name: 'VEEPEE SAS',
          siren: null,
          status: 'imported',
          has_runs: false,
          updated_at: null,
        },
      ])
      repo.findOne.mockResolvedValueOnce({ id: 'acc-crm' } as never)

      expect(await service.findSameCompanyAccount('u-1', 'Veepee')).toEqual({ id: 'acc-crm' })
      const [sql, params] = repo.manager.query.mock.calls[0]! as [string, unknown[]]
      expect(sql).toContain('a.workspace_id = $1')
      expect(sql).toContain('a.merged_into_id IS NULL')
      expect(params).toEqual(['ws-1', null, 'veepee'])
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'acc-crm', workspace_id: 'ws-1' } })
    })

    it('rend null quand aucun candidat n’a la même clé (« Acme » ≠ « Acme Services »)', async () => {
      repo.manager.query.mockResolvedValueOnce([
        { id: 'x', company_name: 'Acme Services', siren: null, status: 'completed', has_runs: true, updated_at: null },
      ])
      expect(await service.findSameCompanyAccount('u-1', 'Acme')).toBeNull()
    })

    it('fail open (null) sur une erreur de base — un blip ne bloque jamais une analyse', async () => {
      repo.manager.query.mockRejectedValueOnce(new Error('db down'))
      expect(await service.findSameCompanyAccount('u-1', 'Veepee', { siren: '440297785' })).toBeNull()
    })
  })

  describe('#4760 — readSignalLayers (le lecteur de `raw_analysis.signal_layers`)', () => {
    it('nomme les besoins historiques, signaux ET offres, avec leur date réelle', async () => {
      repo.manager.query.mockResolvedValueOnce([
        {
          layers: {
            historical: [{ signal: 'Plan stratégique 2021', date: '2021-03-10', freshness_window_days: 730 }],
            job_offers: { historical: [{ title: 'Architecte cloud', date: '2026-02-01', freshness_window_days: 180 }] },
          },
        },
      ])
      const read = await service.readSignalLayers('acc-1')
      expect(read.historicalSignals).toEqual([{ label: 'Plan stratégique 2021', date: '2021-03-10', windowDays: 730 }])
      expect(read.historicalJobOffers).toEqual([{ label: 'Architecte cloud', date: '2026-02-01', windowDays: 180 }])
      expect(repo.manager.query.mock.calls[0]![0]).toContain("raw_analysis -> 'signal_layers'")
    })

    it('une analyse sans la clé rend « non mesuré » (null), jamais 0', async () => {
      repo.manager.query.mockResolvedValueOnce([{ layers: null }])
      expect((await service.readSignalLayers('acc-1')).historicalCount).toBeNull()
    })
  })

  describe('findAnalyzingByUserAndCompany (canonical, workspace-scoped)', () => {
    it('scopes by workspace + analyzing status + normalized name', async () => {
      await service.findAnalyzingByUserAndCompany('u-1', 'SNCF')
      expect(repo._qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status = :status', { status: 'analyzing' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('LOWER(TRIM(account.company_name)) = LOWER(TRIM(:companyName))', {
        companyName: 'SNCF',
      })
    })

    it('matches by name OR siren when a siren is provided', async () => {
      await service.findAnalyzingByUserAndCompany('u-1', 'SNCF', { siren: '552081317' })
      const call = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes('account.siren = :siren'))
      expect(call?.[1]).toEqual(expect.objectContaining({ companyName: 'SNCF', siren: '552081317' }))
    })

    it('fails open (null) on a workspace-resolution blip', async () => {
      workspaceContext.resolveActiveWorkspace.mockRejectedValueOnce(new Error('blip'))
      expect(await service.findAnalyzingByUserAndCompany('u-1', 'SNCF')).toBeNull()
    })
  })

  // #2704.1 — QUI a lancé un run qu'on rejoint, pour que l'écran de la SECONDE
  // personne le nomme au lieu de rester muet (Bedros/Adel, Apricot Labs,
  // 22/09/2026). Même règle d'auteur que le fil de Laura (#1940.4) :
  // `resolveWorkspaceAuthors`, réutilisée telle quelle.
  describe('workspaceAuthorOf (#2704.1)', () => {
    it('nomme un membre de l’espace, prénom + avatar', async () => {
      repo.manager.query.mockResolvedValueOnce([
        { userId: 'u-bedros', firstName: 'Bedros', avatarUrl: 'https://cdn.example.test/b.png' },
      ])

      const author = await service.workspaceAuthorOf('ws-1', 'u-bedros')

      expect(author).toEqual({ firstName: 'Bedros', avatarUrl: 'https://cdn.example.test/b.png' })
      expect(repo.manager.query).toHaveBeenCalledWith(expect.any(String), ['ws-1', ['u-bedros']])
    })

    it('rend null sans identifiant — rien à nommer', async () => {
      const author = await service.workspaceAuthorOf('ws-1', null)
      expect(author).toBeNull()
      expect(repo.manager.query).not.toHaveBeenCalled()
    })

    it('rend null sur une lecture en échec — jamais un nom deviné', async () => {
      repo.manager.query.mockRejectedValueOnce(new Error('db down'))
      expect(await service.workspaceAuthorOf('ws-1', 'u-bedros')).toBeNull()
    })
  })

  describe('reuseForRelaunch (in place — jamais une 2ᵉ ligne)', () => {
    it('flips the row to analyzing scoped by id (workspace membership already verified by the lookup)', async () => {
      await service.reuseForRelaunch('acc-1', 'u-1', { userContext: 'cible DSI', siren: '552081317' })
      // L'état du run et l'IDENTITÉ sont désormais deux écritures distinctes :
      // la première est inconditionnelle, la seconde ne POSE que sur un dossier
      // qui n'a pas encore d'identité (GA-96, test juste en dessous).
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'acc-1' },
        { status: 'analyzing', error_message: null, user_context: 'cible DSI' },
      )
    })

    it('#4642 — pose le cadrage Laura quand il est fourni, et n’écrit rien sinon', async () => {
      const framing = { framed_by: 'laura' as const, skills: ['Java'] }
      await service.reuseForRelaunch('acc-1', 'u-1', { userContext: null, discoverOriginCriteria: framing })
      expect(repo.update).toHaveBeenCalledWith({ id: 'acc-1' }, { discover_origin_criteria: framing })

      repo.update.mockClear()
      await service.reuseForRelaunch('acc-1', 'u-1', { userContext: null })
      expect(repo.update).toHaveBeenCalledTimes(1)
    })

    it('never overwrites a known siren with null (aucune écriture d’identité quand elle est absente)', async () => {
      await service.reuseForRelaunch('acc-1', 'u-1', { userContext: null })
      expect(repo.update).toHaveBeenCalledTimes(1)
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect('siren' in patch).toBe(false)
      expect(patch).toEqual({ status: 'analyzing', error_message: null, user_context: null })
    })

    /**
     * GA-96 — la seconde serrure.
     *
     * `AnalysisService.start` refuse déjà une relance qui demande une autre
     * société, avant même le débit. Celle-ci tient même si un appelant futur
     * oublie la première : l'identité s'écrit `WHERE siren IS NULL`, donc sur un
     * dossier qui connaît déjà sa société l'écriture ne touche AUCUNE ligne.
     *
     * « Retirer le MOYEN, pas seulement la permission » — un `if` en TypeScript
     * se contourne en appelant la méthode autrement ; une condition dans le
     * `WHERE` ne se contourne pas.
     */
    it('(GA-96) ne POSE l’identité que sur un dossier qui n’en a pas — jamais par-dessus', async () => {
      await service.reuseForRelaunch('acc-1', 'u-1', { userContext: null, siren: '552081317' })

      const identityWrite = repo.update.mock.calls.find(
        ([, patch]) => patch && typeof patch === 'object' && 'siren' in (patch as Record<string, unknown>),
      ) as [Record<string, unknown>, Record<string, unknown>] | undefined

      expect(identityWrite).toBeDefined()
      // La condition porte sur la COLONNE, dans le `WHERE` — pas dans un `if`.
      expect(identityWrite?.[0]).toHaveProperty('siren')
      expect(identityWrite?.[0]?.['id']).toBe('acc-1')
      expect(identityWrite?.[1]).toEqual({ siren: '552081317' })
    })
  })

  describe('findOne', () => {
    it('returns a success result with the account (branches stripped in SQL)', async () => {
      const account = { id: '1', company_name: 'SNCF' } as AccountEntity
      // findOne now drops to raw SQL via `manager.query` so the branches
      // JSONB key is stripped server-side. Mock returns the row Postgres
      // would hand back (already without `branches`).
      repo.manager.query.mockResolvedValueOnce([account])
      const result = await service.findOne('1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual(account)
    })

    it('strips raw_analysis.branches via the `- branches` JSONB operator', async () => {
      // Spec check: the SQL we issue must use `raw_analysis - 'branches'`,
      // otherwise the whole point of moving the slicing to Postgres is lost.
      repo.manager.query.mockResolvedValueOnce([{ id: '1' } as AccountEntity])
      await service.findOne('1', 'user-1')
      const sql = repo.manager.query.mock.calls[0]?.[0] as string
      expect(sql).toMatch(/raw_analysis\s*-\s*'branches'/)
    })

    it('returns a not_found failure when missing', async () => {
      repo.manager.query.mockResolvedValueOnce([])
      const result = await service.findOne('999', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })
  })

  // #3892.1 (ADD-SANOFI-06, retour bêta Sanofi 08/10/2026) — pour que
  // `ChatContextService.loadMemory` étiquette un fait épinglé borné à UN
  // compte avec son NOM, jamais son UUID.
  describe('namesForAccounts (#3892.1)', () => {
    it('resolves names for the given ids, scoped to the workspace, in ONE query', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'a-bpce', company_name: 'BPCE' },
        { id: 'a-sanofi', company_name: 'Sanofi' },
      ])
      const names = await service.namesForAccounts('ws-1', ['a-bpce', 'a-sanofi'])
      expect(repo.find).toHaveBeenCalledTimes(1)
      expect(names.get('a-bpce')).toBe('BPCE')
      expect(names.get('a-sanofi')).toBe('Sanofi')
    })

    it('an id the repository does not return (another workspace, deleted account) is simply ABSENT — never a guessed name', async () => {
      repo.find.mockResolvedValueOnce([{ id: 'a-bpce', company_name: 'BPCE' }])
      const names = await service.namesForAccounts('ws-1', ['a-bpce', 'a-gone'])
      expect(names.has('a-gone')).toBe(false)
    })

    it('an empty id list never queries the repository', async () => {
      const names = await service.namesForAccounts('ws-1', [])
      expect(repo.find).not.toHaveBeenCalled()
      expect(names.size).toBe(0)
    })
  })

  describe('findOneForWorkspace', () => {
    it('scopes the detail read by workspace_id and strips branches in SQL', async () => {
      const account = { id: '1', company_name: 'SNCF' } as AccountEntity
      repo.manager.query.mockResolvedValueOnce([account])
      const result = await service.findOneForWorkspace('1', 'ws-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual(account)
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      // Phase 2: scoped by workspace_id (not user_id) — the whole team can open it.
      expect(sql).toMatch(/a\.workspace_id = \$2/)
      expect(sql).toMatch(/raw_analysis\s*-\s*'branches'/)
      expect(params).toEqual(['1', 'ws-1'])
    })

    it('returns a not_found failure when the account is outside the workspace', async () => {
      repo.manager.query.mockResolvedValueOnce([])
      const result = await service.findOneForWorkspace('999', 'ws-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })

    // #2634.1 — LinkedIn comme source de signaux d'achat, par une voie
    // autorisée (saisie, import, connecteur à venir) — jamais un scraping. Un
    // signal déclaré vit dans sa propre colonne (jamais réécrite par l'IA) et
    // se greffe sur `raw_analysis.recent_signals` À LA LECTURE.
    it('greffe les signaux DÉCLARÉS en tête de raw_analysis.recent_signals', async () => {
      const account = {
        id: '1',
        company_name: 'Decathlon',
        raw_analysis: { recent_signals: [{ signal: 'Détecté par l’IA' }] },
        declared_signals: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            label: 'Poste Lead Data Engineer publié',
            source: 'LinkedIn',
            entryKind: 'manual',
            declaredAt: '2026-09-22T18:00:00.000Z',
            declaredBy: 'user-1',
            declaredByName: 'Louis Schlegel',
          },
        ],
      } as unknown as AccountEntity
      repo.manager.query.mockResolvedValueOnce([account])
      const result = await service.findOneForWorkspace('1', 'ws-1')
      expect(isSuccess(result)).toBe(true)
      if (!isSuccess(result)) return
      const signals = (result.output.raw_analysis as unknown as { recent_signals: Array<{ signal: string | null }> })
        .recent_signals
      expect(signals[0]?.signal).toBe('Poste Lead Data Engineer publié')
      expect(signals[1]?.signal).toBe('Détecté par l’IA')
    })

    it('sans signal déclaré, ne touche PAS raw_analysis — comportement d’avant ce lot, à l’octet près', async () => {
      const account = {
        id: '1',
        company_name: 'SNCF',
        raw_analysis: { recent_signals: [{ signal: 'Détecté par l’IA' }] },
      } as unknown as AccountEntity
      repo.manager.query.mockResolvedValueOnce([account])
      const result = await service.findOneForWorkspace('1', 'ws-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.raw_analysis).toEqual(account.raw_analysis)
    })
  })

  // #2634.1 — LinkedIn comme source de signaux d'achat, par une voie
  // autorisée (saisie manuelle, import, connecteur à venir) — jamais un
  // scraping. `declareSignals` est la SEULE porte d'écriture de
  // `accounts.declared_signals` : `declaredAt`/`declaredBy` sont posés par le
  // serveur, jamais fournis par le client.
  describe('declareSignals', () => {
    it('tamponne declaredAt/declaredBy/declaredByName côté serveur et ajoute au JSONB existant', async () => {
      // 1er appel : résout le nom de l'auteur depuis `profiles`. 2e : l'UPDATE.
      repo.manager.query.mockResolvedValueOnce([{ first_name: 'Louis', last_name: 'Schlegel', email: null }])
      repo.manager.query.mockResolvedValueOnce([{ id: 'acc-1' }])

      const result = await service.declareSignals('acc-1', 'ws-1', 'user-1', {
        source: 'LinkedIn',
        entryKind: 'manual',
        signals: [{ label: 'Poste Lead Data Engineer publié' }],
      })

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output.added).toBe(1)

      const [sql, params] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(sql).toMatch(/UPDATE accounts/)
      expect(sql).toMatch(/declared_signals = COALESCE\(declared_signals, '\[\]'::jsonb\) \|\| \$3::jsonb/)
      expect(sql).toMatch(/WHERE id = \$1 AND workspace_id = \$2/)
      const added = JSON.parse(params[2] as string) as Array<Record<string, unknown>>
      expect(added).toHaveLength(1)
      expect(added[0]?.label).toBe('Poste Lead Data Engineer publié')
      expect(added[0]?.source).toBe('LinkedIn')
      expect(added[0]?.entryKind).toBe('manual')
      expect(added[0]?.declaredBy).toBe('user-1')
      expect(added[0]?.declaredByName).toBe('Louis Schlegel')
      expect(typeof added[0]?.declaredAt).toBe('string')
      // Jamais un champ fourni par le client : declaredAt/declaredBy sont
      // TOUJOURS ceux que le serveur vient de poser, jamais une valeur reçue.
      expect(added[0]?.id).not.toBe(undefined)
    })

    it('rend not_found quand le compte est hors de l’espace — aucune écriture ne fuit vers un autre workspace', async () => {
      repo.manager.query.mockResolvedValueOnce([{ first_name: null, last_name: null, email: null }])
      repo.manager.query.mockResolvedValueOnce([])

      const result = await service.declareSignals('acc-1', 'ws-2', 'user-1', {
        source: 'LinkedIn',
        entryKind: 'import',
        signals: [{ label: 'x' }],
      })

      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    })
  })

  describe('applyPlan', () => {
    it('JSONB-merges the plan under raw_analysis.plan, preserving the research blob', async () => {
      const plan = {
        actionPlan: { strategy: 'Bottom-up', justification: 'Quick wins', phases: [] },
        evaluation: { goNoGo: 'GO', globalScore: 8 },
      } as unknown as AnalysisPlanData
      await service.applyPlan('acc-1', plan)

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      // Shallow JSONB merge (||) so the Phase 1 research keys survive; the
      // plan lands under the 'plan' key the web TabPlan reads, camelCase.
      expect(sql).toMatch(/COALESCE\(raw_analysis[^)]*\)\s*\|\|\s*jsonb_build_object\('plan'/)
      expect(sql).toMatch(/WHERE id = \$2/)
      // No reconciled score on this plan → COALESCE keeps the existing column.
      expect(params).toEqual([JSON.stringify(plan), 'acc-1', null, null])
    })

    it('reconciles the account priority_score from the plan (canonical /25 → /10)', async () => {
      // Phase 4 derives the /10 priorityScore from the /25 verdict; applyPlan
      // must overwrite the column so the bucket matches the verdict.
      const plan = {
        actionPlan: { phases: [] },
        evaluation: { verdict: 'PRUDENT', score: 17 },
        priorityScore: 7,
        priorityJustification: 'CAC40 hors borne taille, fit partiel.',
      } as unknown as AnalysisPlanData
      await service.applyPlan('acc-1', plan)

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/priority_score = COALESCE\(\$3, priority_score\)/)
      expect(sql).toMatch(/priority_justification = COALESCE\(\$4, priority_justification\)/)
      expect(params).toEqual([JSON.stringify(plan), 'acc-1', 7, 'CAC40 hors borne taille, fit partiel.'])
    })

    it('hoists selfConsistency (A1) to the raw_analysis ROOT when the plan carries it', async () => {
      // Self-consistency rides the plan payload; the dossier/chat read it at
      // raw_analysis.selfConsistency (like `judge`), so applyPlan hoists it via
      // a jsonb CASE that merges nothing when the key is absent (kill-switch on
      // / older IA payload → byte-identical write).
      const plan = {
        actionPlan: { phases: [] },
        selfConsistency: { overallConfidence: 'high', sections: {} },
      } as unknown as AnalysisPlanData
      await service.applyPlan('acc-1', plan)

      const [sql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toMatch(/\? 'selfConsistency'/)
      expect(sql).toMatch(/jsonb_build_object\('selfConsistency', \(\$1::jsonb\) -> 'selfConsistency'\)/)
      expect(sql).toMatch(/ELSE '\{\}'::jsonb END/)
    })
  })

  describe('applyOrgChart', () => {
    /**
     * L'écriture est précédée d'une LECTURE depuis #1103 : les personnes
     * déclarées à la main sont regreffées sur le graphe avant qu'il ne parte en
     * base. On cherche donc l'UPDATE par son SQL et non par son rang — un test
     * qui compte les appels casse au premier ajout, et ce qu'il protège n'a
     * jamais été « c'est la première requête ».
     */
    const updateCall = () =>
      repo.manager.query.mock.calls.find(([sql]) => String(sql).includes('UPDATE accounts')) as [string, unknown[]]

    it('hisse graphVersion / rejectedItems du graphe émis vers leurs colonnes (Annexe Organigramme §5)', async () => {
      const org = {
        organigramme: [],
        orgGraph: { graphVersion: 3, rejectedItems: [{ sourceId: 'p-jean-dupont', reason: 'signalé parti' }] },
      }
      await service.applyOrgChart('acc-1', org)

      const [sql, params] = updateCall()
      expect(sql).toMatch(/org_graph_version = GREATEST\(COALESCE\(org_graph_version, 1\), COALESCE\(\$3, 1\)\)/)
      expect(params).toEqual([
        JSON.stringify(org),
        'acc-1',
        3,
        JSON.stringify([{ sourceId: 'p-jean-dupont', reason: 'signalé parti' }]),
      ])
    })

    it("FUSIONNE l'ardoise des rejets au lieu de l'écraser — une IA sans mémoire ne peut pas l'effacer", async () => {
      await service.applyOrgChart('acc-1', { orgGraph: { graphVersion: 1, rejectedItems: [] } })

      const [sql] = updateCall()
      // Union de l'existant et du nouveau, dédoublonnée par sourceId (1re gagne).
      expect(sql).toMatch(/COALESCE\(org_rejected_items, '\[\]'::jsonb\) \|\| \$4::jsonb/)
      expect(sql).toMatch(/DISTINCT ON \(item ->> 'sourceId'\)/)
    })

    it('regreffe les personnes déclarées à la main avant d’écrire le blob (#1103)', async () => {
      // La moitié qui rend la saisie DURABLE : chaque run réécrit
      // `raw_analysis.org.orgGraph` à neuf, si bien qu'une personne saisie
      // tiendrait jusqu'à la réanalyse suivante puis disparaîtrait sans un mot.
      repo.manager.query.mockResolvedValueOnce([
        {
          org_declared_people: [{ fullName: 'Caroline Jaouen', title: 'DSI', declaredAt: '2026-08-26T10:00:00.000Z' }],
        },
      ])

      await service.applyOrgChart('acc-1', {
        orgGraph: {
          graphVersion: 2,
          entities: [],
          people: [],
          hierarchyEdges: [],
          influenceEdges: [],
          buyingCommittee: [],
          uncoveredZones: [],
          recommendedPath: [],
          rejectedItems: [],
        },
      })

      const [, params] = updateCall()
      const written = JSON.parse(String(params[0])) as { orgGraph: { people: Array<{ fullName: string }> } }
      expect(written.orgGraph.people.map(p => p.fullName)).toEqual(['Caroline Jaouen'])
    })

    it('rejoue les corrections humaines encore actives — une correction survit à un rebuild', async () => {
      // Le run a réassemblé le graphe à neuf : le titre est redevenu celui de la
      // source. Sans ce rejeu, le ledger dirait qu'on a corrigé et l'écran
      // afficherait de nouveau la valeur d'avant (OrgGraph FINAL, acceptation 10).
      repo.manager.query.mockResolvedValueOnce([{ org_declared_people: [] }]).mockResolvedValueOnce([
        {
          object_type: 'person',
          object_id: 'p-julien-nicolas',
          field: 'title',
          new_value: 'Directeur des Systèmes d’Information',
          reason: 'Site officiel',
          evidence: { kind: 'official_site', claim: 'title' },
          created_at: '2026-08-29T10:00:00.000Z',
        },
      ])

      await service.applyOrgChart('acc-1', {
        orgGraph: {
          graphVersion: 7,
          entities: [],
          people: [
            {
              id: 'p-julien-nicolas',
              fullName: 'Julien Nicolas',
              title: 'DSI',
              identityStatus: 'classified',
              decisionRoles: [],
              sources: [],
              confidence: 70,
            },
          ],
          hierarchyEdges: [],
          influenceEdges: [],
          buyingCommittee: [],
          uncoveredZones: [],
          recommendedPath: [],
          rejectedItems: [],
        },
      })

      const [, params] = updateCall()
      const written = JSON.parse(String(params[0])) as { orgGraph: { people: Array<{ title?: string }> } }
      expect(written.orgGraph.people[0]?.title).toBe('Directeur des Systèmes d’Information')
    })

    it('ne rejoue PAS une correction annulée — la lecture exclut les pierres tombales', async () => {
      repo.manager.query.mockResolvedValueOnce([{ org_declared_people: [] }])
      await service.applyOrgChart('acc-1', { organigramme: [], orgGraph: { graphVersion: 1, rejectedItems: [] } })
      const select = repo.manager.query.mock.calls.find(([sql]) =>
        String(sql).includes('FROM org_graph_corrections'),
      ) as [string, unknown[]] | undefined
      expect(select).toBeDefined()
      expect(select![0]).toContain('reverted_at IS NULL')
      // #2126.44 — une correction personnelle ne se rejoue jamais dans le graphe
      // partagé ; « je ne sais pas », « pas pertinent », « source ajoutée » non plus.
      expect(select![0]).toContain("scope <> 'personal'")
      expect(select![0]).toContain("motive IN ('corrected', 'obsolete', 'confirmed')")
      // Et dans l'ORDRE où elles ont été posées : la dernière gagne.
      expect(select![0]).toContain('ORDER BY created_at ASC')
    })

    it('laisse les deux colonnes intactes sur un graphe sans ces clés (dossier antérieur)', async () => {
      await service.applyOrgChart('acc-1', { organigramme: [] })

      const [sql, params] = updateCall()
      expect(sql).toMatch(/WHEN \$4::jsonb IS NULL THEN org_rejected_items/)
      expect(params[2]).toBeNull()
      expect(params[3]).toBeNull()
    })

    /**
     * #2554.1 — actualiser un compte doit RE-VÉRIFIER l'organigramme EXISTANT,
     * pas le laisser vieillir en silence : un run complet réécrit le graphe à
     * neuf, et une personne stockée absente du résultat disparaissait sans un
     * mot. #2554.2 — le diff nomme les personnes revérifiées, celle qui a
     * changé de poste, et celle qui n'a pas pu être confirmée — jamais
     * supprimée ni présentée comme à jour.
     */
    const fullPerson = (over: Record<string, unknown>) => ({
      identityStatus: 'enriched',
      decisionRoles: [],
      sources: [],
      confidence: 70,
      ...over,
    })
    const emptyGraphShell = {
      entities: [{ id: 'e1', name: 'ACME', type: 'groupe', status: 'operating', confidence: 90 }],
      hierarchyEdges: [],
      influenceEdges: [],
      buyingCommittee: [],
      uncoveredZones: [],
      recommendedPath: [],
      rejectedItems: [],
    }

    it('revérifie l’organigramme existant : nomme la revérifiée, le poste changé, la non confirmée', async () => {
      repo.manager.query
        .mockResolvedValueOnce([]) // regraftDeclaredPeople : aucune personne déclarée
        .mockResolvedValueOnce([]) // replayOrgCorrections : aucune correction active
        .mockResolvedValueOnce([
          {
            raw_analysis: {
              org: {
                orgGraph: {
                  ...emptyGraphShell,
                  graphVersion: 1,
                  people: [
                    fullPerson({ id: 'p-claire', fullName: 'Claire Perrin', title: 'DSI', entityId: 'e1' }),
                    fullPerson({ id: 'p-marc', fullName: 'Marc Dubois', title: 'Directeur Achats', entityId: 'e1' }),
                  ],
                },
              },
            },
          },
        ])

      await service.applyOrgChart('acc-1', {
        orgGraph: {
          ...emptyGraphShell,
          graphVersion: 2,
          // Marc n'est pas revenu dans ce run ; Claire si, à l'identique.
          people: [fullPerson({ id: 'p-claire', fullName: 'Claire Perrin', title: 'DSI', entityId: 'e1' })],
        },
      })

      const [, params] = updateCall()
      const written = JSON.parse(String(params[0])) as {
        orgGraph: { people: Array<{ id: string; title?: string; notConfirmedSince?: string }> }
        peopleRefreshDiff: {
          reverified: Array<{ personId: string }>
          notConfirmed: Array<{ personId: string }>
        }
      }
      // Jamais supprimée : Marc reste dans le graphe rendu.
      const marc = written.orgGraph.people.find(p => p.id === 'p-marc')
      expect(marc).toBeDefined()
      expect(marc?.notConfirmedSince).toBeTruthy()
      // Jamais présentée comme à jour : son ancien titre n'est pas réaffirmé, juste conservé.
      expect(marc?.title).toBe('Directeur Achats')
      expect(written.peopleRefreshDiff.notConfirmed.map(e => e.personId)).toEqual(['p-marc'])
      expect(written.peopleRefreshDiff.reverified.map(e => e.personId)).toEqual(['p-claire'])
    })

    it('un premier peuplement (rien de stocké) ne produit aucun diff — distinct de #2502', async () => {
      repo.manager.query
        .mockResolvedValueOnce([]) // regraftDeclaredPeople
        .mockResolvedValueOnce([]) // replayOrgCorrections
        .mockResolvedValueOnce([{ raw_analysis: null }]) // aucun graphe stocké

      await service.applyOrgChart('acc-1', {
        orgGraph: {
          ...emptyGraphShell,
          graphVersion: 1,
          people: [fullPerson({ id: 'p-claire', fullName: 'Claire Perrin', title: 'DSI', entityId: 'e1' })],
        },
      })

      const [, params] = updateCall()
      const written = JSON.parse(String(params[0])) as { peopleRefreshDiff?: unknown }
      expect(written.peopleRefreshDiff).toBeUndefined()
    })
  })

  // #2123.46 — la porte HISTORIQUE des actions de plan est retirée : les cinq
  // écrivains du plan écrivent la ligne canonique (`POST /plan-items`) et
  // `raw_analysis.user_plan_actions` n'est plus que LU, comme historique.
  // L'append idempotent reste celui des angles d'attaque, testé ici.
  describe('appendUserAttackAngle (append idempotent de raw_analysis)', () => {
    it('#2123.46 — la porte historique des actions de plan n’existe plus (une seule écriture, GA-26)', () => {
      expect((service as unknown as Record<string, unknown>)['appendUserPlanAction']).toBeUndefined()
    })

    it('appends the angle to a user-owned account and reports it as added', async () => {
      const rawAnalysis = { user_attack_angles: [{ title: 'Angle DORA' }] }
      repo.manager.query.mockResolvedValueOnce([{ raw_analysis: rawAnalysis }])

      const result = await service.appendUserAttackAngle('acc-1', 'user-1', { title: 'Angle DORA' })

      expect(result).toEqual({ raw_analysis: rawAnalysis, added: true })
    })

    it('uses JSONB containment to avoid duplicates', async () => {
      repo.manager.query.mockResolvedValueOnce([{ raw_analysis: {} }])

      await service.appendUserAttackAngle('acc-1', 'user-1', { title: 'Angle DORA' })

      expect(repo.manager.query.mock.calls[0]?.[0]).toMatch(/@>/)
    })

    // « Déjà là » n'est pas une erreur — c'est une information. L'UPDATE ne
    // touche rien (idempotence), la relecture confirme que la ligne existe, et
    // l'appelant apprend `added: false` au lieu de croire qu'il vient d'ajouter.
    it('reports added=false when the angle was ALREADY there', async () => {
      const rawAnalysis = { user_attack_angles: [{ title: 'Angle DORA' }] }
      repo.manager.query.mockResolvedValueOnce([])
      repo.manager.query.mockResolvedValueOnce([{ raw_analysis: rawAnalysis }])

      const result = await service.appendUserAttackAngle('acc-1', 'user-1', { title: 'Angle DORA' })

      expect(result).toEqual({ raw_analysis: rawAnalysis, added: false })
    })

    it('still returns null when the account is not the caller’s', async () => {
      repo.manager.query.mockResolvedValueOnce([])
      repo.manager.query.mockResolvedValueOnce([])

      await expect(service.appendUserAttackAngle('acc-x', 'user-1', { title: 'Angle DORA' })).resolves.toBeNull()
    })
  })

  describe('setApiCost', () => {
    it('persists the USD cost on api_cost_euros with fixed precision', async () => {
      await service.setApiCost('acc-1', 0.81)
      expect(repo.update).toHaveBeenCalledWith({ id: 'acc-1' }, { api_cost_euros: '0.810000' })
    })
  })

  describe('getBranchesForWorkspace', () => {
    it('returns the paginated slice of raw_analysis.branches', async () => {
      const branches = Array.from({ length: 5 }, (_, i) => ({ siret: `${i}` }))
      repo.findOne.mockResolvedValueOnce({ id: 'a-1', raw_analysis: { branches } } as never)
      const result = await service.getBranchesForWorkspace('a-1', 'ws-1', 2, 2)
      // Scoped by workspace_id (Phase 2), merged with the id predicate.
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'a-1', workspace_id: 'ws-1' },
        select: ['id', 'raw_analysis'],
      })
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.data).toEqual([{ siret: '2' }, { siret: '3' }])
        expect(result.output.pagination.totalItems).toBe(5)
        expect(result.output.pagination.currentPage).toBe(2) // floor(2/2)+1
        expect(result.output.pagination.size).toBe(2)
        expect(result.output.pagination.totalPages).toBe(3) // ceil(5/2)
      }
    })

    it('returns an empty slice and zero totals when there are no branches', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'a-1', raw_analysis: {} } as never)
      const result = await service.getBranchesForWorkspace('a-1', 'ws-1', 0, 10)
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) {
        expect(result.output.data).toEqual([])
        expect(result.output.pagination.totalItems).toBe(0)
        expect(result.output.pagination.totalPages).toBe(0)
      }
    })

    it('returns not_found when the account is missing', async () => {
      repo.findOne.mockResolvedValueOnce(null as never)
      const result = await service.getBranchesForWorkspace('ghost', 'ws-1', 0, 10)
      expect(isFailure(result)).toBe(true)
    })
  })

  describe('create', () => {
    it('returns a success result with the created account', async () => {
      const created = { id: 'new-1', company_name: 'AXA', status: 'analyzing' } as AccountEntity
      repo.save.mockResolvedValueOnce(created)
      const result = await service.create('user-1', { company_name: 'AXA' })
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual(created)
    })

    it('stamps workspace_id (resolved from the creator) AND keeps user_id as created-by', async () => {
      // Phase 2 write-path: the account must carry the creator's active
      // workspace so it shows up in the workspace-scoped list, while user_id
      // stays as the created-by attribution.
      workspaceContext.resolveActiveWorkspace.mockResolvedValueOnce({ workspaceId: 'ws-42', role: 'owner' })
      await service.create('user-1', { company_name: 'AXA' })
      expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', workspace_id: 'ws-42', company_name: 'AXA', status: 'analyzing' }),
      )
    })

    it('fails closed (create_failed) and never inserts an unscoped row when no workspace resolves', async () => {
      // `workspace_id` is NOT NULL (migration 1784500000000): every user is
      // guaranteed a workspace (Phase-1 backfill + on_auth_user_created_workspace
      // trigger), so a resolution failure means something is genuinely broken —
      // we must NOT persist an account with a NULL scope (it would violate the
      // constraint and vanish from the workspace-scoped reads).
      workspaceContext.resolveActiveWorkspace.mockRejectedValueOnce(new Error('no workspace'))
      const result = await service.create('user-1', { company_name: 'AXA' })
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('create_failed')
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('returns a create_failed failure on repo error', async () => {
      repo.save.mockRejectedValueOnce(new Error('insert failed'))
      const result = await service.create('user-1', { company_name: 'AXA' })
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('create_failed')
    })

    // #3084 — un SIREN tapé directement dans la barre de recherche (sans passer
    // par l'autocomplétion) partait tel quel comme `company_name` : le dossier
    // gardait les 9 chiffres pour nom. Résolu au point de création, seul endroit
    // que TOUS les appelants traversent (barre d'analyse, MCP, API directe).
    it('resolves the raison sociale when company_name is a bare SIREN typed directly (#3084)', async () => {
      ia.searchCompanies.mockResolvedValueOnce({
        suggestions: [{ name: 'ROCHE', siren: '552012031', city: 'Neuilly-sur-Seine', sector: 'Pharmacie' }],
      })
      await service.create('user-1', { company_name: '552012031' })
      expect(ia.searchCompanies).toHaveBeenCalledWith('552012031', 1)
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'ROCHE', siren: '552012031' }))
    })

    it('leaves the typed SIREN as the name when the registry lookup fails — no name invented', async () => {
      ia.searchCompanies.mockRejectedValueOnce(new Error('pappers down'))
      const result = await service.create('user-1', { company_name: '552012031' })
      expect(isSuccess(result)).toBe(true)
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ company_name: '552012031', siren: null }))
    })

    it('never overrides an already-provided siren/name pair (autocomplete already resolved it)', async () => {
      await service.create('user-1', { company_name: 'AXA', siren: '552012031' })
      expect(ia.searchCompanies).not.toHaveBeenCalled()
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'AXA', siren: '552012031' }))
    })

    // #3914 — la raison calculée côté Découvrir voyage jusqu'à la ligne, pour
    // que l'analyse puisse plus tard citer sur quoi le compte a remonté.
    it('#3914 — persists discover_origin_reason when provided', async () => {
      await service.create('user-1', {
        company_name: 'AXA',
        origin: 'discover',
        discover_origin_reason: '5 postes data ouverts',
      })
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ origin: 'discover', discover_origin_reason: '5 postes data ouverts' }),
      )
    })

    it('#3914 — defaults discover_origin_reason to null, never undefined (no value invented)', async () => {
      await service.create('user-1', { company_name: 'AXA' })
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ discover_origin_reason: null }))
    })

    // #3819 (lot RBB) — les critères de Découvrir sont persistés avec la raison.
    it('#3819 — persists discover_origin_criteria when provided, null otherwise', async () => {
      await service.create('user-1', {
        company_name: 'AXA',
        origin: 'discover',
        discover_origin_criteria: { sectors: ['insurance'], zone: 'Paris' },
      })
      expect(repo.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ discover_origin_criteria: { sectors: ['insurance'], zone: 'Paris' } }),
      )
      await service.create('user-1', { company_name: 'AXA' })
      expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ discover_origin_criteria: null }))
    })
  })

  describe('listSimilarCompaniesToExplore', () => {
    it('seeds ONE NAF-filtered discovery per distinct sector, dedups same-NAF, excludes the portfolio (Théo — pas de faux pairs)', async () => {
      repo.find.mockResolvedValueOnce([
        { company_name: 'BNP Paribas', status: 'completed', sector: 'Banque', naf_code: '64.19Z' },
        // Same NAF as BNP → must NOT seed a second "banque" discovery.
        { company_name: 'Société Générale', status: 'completed', sector: 'Banque', naf_code: '64.19Z' },
        { company_name: 'Doctolib', status: 'completed', sector: 'Programmation informatique', naf_code: '62.01Z' },
        // Deleted → never a seed.
        { company_name: 'EDF', status: 'deleted', sector: 'Énergie', naf_code: '35.11Z' },
      ])
      // #1576 — la seconde lecture est celle de l'EXCLUSION, sur tout le
      // portefeuille : elle ne partage plus la fenêtre bornée de l'amorçage.
      repo.find.mockResolvedValueOnce([
        { company_name: 'BNP Paribas', status: 'completed', siren: null },
        { company_name: 'Société Générale', status: 'completed', siren: null },
        { company_name: 'Doctolib', status: 'completed', siren: null },
        { company_name: 'EDF', status: 'deleted', siren: null },
      ] as never)
      ia.discoverCompanies
        .mockResolvedValueOnce({
          suggestions: [
            { name: 'BNP Paribas', siren: '1', city: 'Paris', sector: 'Banque' }, // in portfolio → excluded
            { name: 'AXA Banque', siren: '2', city: 'Paris', sector: 'Banque' },
          ],
        })
        .mockResolvedValueOnce({
          suggestions: [{ name: 'Payfit', siren: '3', city: 'Paris', sector: 'Programmation informatique' }],
        })

      const result = await service.listSimilarCompaniesToExplore('ws-1')

      expect(repo.find).toHaveBeenCalledWith({
        where: { workspace_id: 'ws-1' },
        select: ['id', 'company_name', 'status', 'sector', 'naf_code'],
        order: { created_at: 'DESC' },
        take: 10,
      })
      // 2 distinct NAF sectors (64.19Z bank deduped to one, 62.01Z IT); deleted skipped.
      expect(ia.discoverCompanies).toHaveBeenCalledTimes(2)
      // Each discovery is NAF-FILTERED (registry precision), not a fuzzy sector-label match.
      expect(ia.discoverCompanies).toHaveBeenCalledWith('banque', 6, expect.objectContaining({ nafCode: '64.19Z' }))
      expect(ia.discoverCompanies).toHaveBeenCalledWith(
        'informatique',
        6,
        expect.objectContaining({ nafCode: '62.01Z' }),
      )
      // Portfolio name excluded; genuine same-sector peers surface.
      expect(result.map(item => item.company_name)).toEqual(['AXA Banque', 'Payfit'])
    })

    /**
     * #1576 — LE DÉFAUT MESURÉ EN PRODUCTION LE 08/09/2026.
     *
     * Trois amorces, et les quatre cartes venaient toutes de la PREMIÈRE : à
     * profil vide les scores valent tous 0, le tri est stable, donc l'ordre
     * final est l'ordre de découverte. L'écran annonçait « bâti sur 3 comptes »
     * en montrant le prolongement d'un seul.
     */
    it('donne sa place à chaque compte d’amorce avant d’en resservir un (#1576)', async () => {
      repo.find.mockResolvedValueOnce([
        {
          id: 'a-nova',
          company_name: 'NOVA LOGISTIQUE',
          status: 'completed',
          sector: 'Logistique',
          naf_code: '52.29A',
        },
        { id: 'a-sncf', company_name: 'SNCF', status: 'completed', sector: 'Transport', naf_code: '49.10Z' },
        { id: 'a-blabla', company_name: 'BlaBlaCar', status: 'completed', sector: 'Données', naf_code: '63.11Z' },
      ])
      ia.discoverCompanies
        .mockResolvedValueOnce({
          suggestions: [
            { name: 'TRANSPOST', siren: '1', city: 'Saintes', sector: 'Entreposage' },
            { name: 'JZOA', siren: '2', city: 'Bagnolet', sector: 'Taxis' },
            { name: 'JAD', siren: '3', city: 'Chartres', sector: 'Fret' },
            { name: 'TRANSPORTS ET LOGISTIQUES', siren: '4', city: 'Susville', sector: 'Fret' },
          ],
        })
        .mockResolvedValueOnce({ suggestions: [{ name: 'KEOLIS', siren: '5', city: 'Lyon', sector: 'Transport' }] })
        .mockResolvedValueOnce({ suggestions: [{ name: 'OVH', siren: '6', city: 'Roubaix', sector: 'Données' }] })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      // Un par amorce d'abord, dans l'ordre du classement, puis la place restante.
      expect(result.map(item => item.company_name)).toEqual(['TRANSPOST', 'KEOLIS', 'OVH', 'JZOA'])
      // Trois cartes sur quatre nomment un compte DIFFÉRENT — c'est ce que le
      // retour demande, et ce que l'écran ne faisait pas.
      expect(result.map(item => item.similarity_headline?.referenceAccount)).toEqual([
        'NOVA LOGISTIQUE',
        'SNCF',
        'BlaBlaCar',
        'NOVA LOGISTIQUE',
      ])
    })

    /**
     * #1576 — LE DÉFAUT TROUVÉ À LA RECETTE DU 08/09/2026, et le JUMEAU de celui
     * que #1632 avait corrigé sur `listSimilarToAccount` deux heures plus tôt.
     *
     * Le portefeuille porte « SNCF » (ce que le commercial a tapé), le registre
     * rend « SOCIETE NATIONALE SNCF » (la raison sociale). Les deux noms ne se
     * rencontrent jamais : le compte se proposait LUI-MÊME comme découverte.
     */
    it('exclut un compte du portefeuille par son SIREN, pas seulement par son nom (#1576)', async () => {
      repo.find
        .mockResolvedValueOnce([
          { id: 'a-sncf', company_name: 'SNCF', status: 'completed', sector: 'Transport', naf_code: '49.10Z' },
        ])
        // La seconde lecture est celle de l'EXCLUSION : tout le portefeuille.
        .mockResolvedValueOnce([{ company_name: 'SNCF', status: 'completed', siren: '552049447' }])
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          { name: 'SOCIETE NATIONALE SNCF', siren: '552049447', city: 'Saint-Denis', sector: 'Transport' },
          { name: 'KEOLIS', siren: '552049448', city: 'Lyon', sector: 'Transport' },
        ],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      expect(result.map(item => item.company_name)).toEqual(['KEOLIS'])
    })

    it('n’exclut PAS une suggestion sans SIREN sous prétexte qu’un compte n’en a pas — la garde sait dire non', async () => {
      repo.find
        .mockResolvedValueOnce([
          { id: 'a-sncf', company_name: 'SNCF', status: 'completed', sector: 'Transport', naf_code: '49.10Z' },
        ])
        // Un compte SANS siren : son `null` ne doit exclure personne.
        .mockResolvedValueOnce([{ company_name: 'SNCF', status: 'completed', siren: null }])
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [{ name: 'ITALO', siren: '', city: 'Roma', sector: 'Transport' }],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      expect(result.map(item => item.company_name)).toEqual(['ITALO'])
    })

    it('lit TOUT le portefeuille pour exclure, pas seulement les dix comptes d’amorce (#1576)', async () => {
      repo.find
        .mockResolvedValueOnce([
          { id: 'a-sncf', company_name: 'SNCF', status: 'completed', sector: 'Transport', naf_code: '49.10Z' },
        ])
        .mockResolvedValueOnce([
          { company_name: 'SNCF', status: 'completed', siren: '1' },
          // Onzième compte, hors de la fenêtre d'amorçage : il doit exclure quand même.
          { company_name: 'KEOLIS', status: 'completed', siren: '2' },
        ])
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          { name: 'KEOLIS', siren: '2', city: 'Lyon', sector: 'Transport' },
          { name: 'ITALO', siren: '3', city: 'Roma', sector: 'Transport' },
        ],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      expect(result.map(item => item.company_name)).toEqual(['ITALO'])
      // La lecture d'exclusion porte sur l'espace entier — aucune borne.
      expect(repo.find).toHaveBeenLastCalledWith({
        where: { workspace_id: 'ws-1' },
        select: ['company_name', 'status', 'siren'],
      })
    })

    it('pose la raison la plus faible — la PROVENANCE — et nomme le compte d’amorce (#1576)', async () => {
      repo.find.mockResolvedValueOnce([
        { id: 'a-sncf', company_name: 'SNCF', status: 'completed', sector: 'Transport', naf_code: '49.10Z' },
      ])
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [{ name: 'KEOLIS', siren: '5', city: 'Lyon', sector: 'Transport' }],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      expect(result[0]!.similarity_headline).toEqual({ kind: 'sector', referenceAccount: 'SNCF' })
    })

    it('falls back to a sector/name text seed (no NAF filter) for legacy accounts without a naf_code', async () => {
      repo.find.mockResolvedValueOnce([{ company_name: 'Orange', status: 'completed', sector: 'Télécom' }])
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [{ name: 'Bouygues Telecom', siren: '9', city: 'Meudon', sector: 'Télécommunications' }],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1')

      expect(ia.discoverCompanies).toHaveBeenCalledTimes(1)
      expect(ia.discoverCompanies).toHaveBeenCalledWith('Telecom', 6, expect.objectContaining({ nafCode: undefined }))
      expect(result.map(item => item.company_name)).toEqual(['Bouygues Telecom'])
    })

    // ── Scoring hybride (addendum Théo p.5/18) — secteur(3) + géo(2) + taille(2)

    const bankPortfolio = [{ company_name: 'BNP Paribas', status: 'completed', sector: 'Banque', naf_code: '64.19Z' }]

    it('NAF seul : sans profil vendeur, l’ordre de découverte Pappers est conservé à l’identique', async () => {
      repo.find.mockResolvedValueOnce(bankPortfolio as never)
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          { name: 'AXA Banque', siren: '2', city: 'Paris', sector: 'Banque' },
          { name: 'Crédit Coopératif', siren: '3', city: 'Nanterre', sector: 'Banque' },
        ],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('user-1')
      expect(result.map(item => item.company_name)).toEqual(['AXA Banque', 'Crédit Coopératif'])
      // Aucun critère matché → pas de score exposé (rien d'inventé).
      expect(result.every(item => item.score_similarity === undefined)).toBe(true)
    })

    it('NAF + taille : la tranche d’effectifs registre qui recoupe les types ciblés remonte en tête', async () => {
      esnProfile.resolveProfileData.mockResolvedValueOnce({ targetCompanyTypes: ['ETI (500-5 000 salariés)'] })
      repo.find.mockResolvedValueOnce(bankPortfolio as never)
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          // Sans effectifs registre → critère taille non scoré (pas inventé).
          { name: 'Petite Banque', siren: '2', city: 'Paris', sector: 'Banque' },
          // 800 salariés ∈ [500, 5000] → +2 (taille) → passe devant.
          {
            name: 'Banque Régionale',
            siren: '3',
            city: 'Nantes',
            sector: 'Banque',
            employees_min: 500,
            employees_max: 999,
          },
        ],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      expect(result.map(item => item.company_name)).toEqual(['Banque Régionale', 'Petite Banque'])
      // #2040.18 — LE CLASSEMENT TIENT, LE SCORE NE SE PUBLIE PAS.
      //
      // Ce questionnaire n'a répondu qu'à UN des trois axes (la taille cible) :
      // publier 2/7 dirait « moyennement proche » alors que ni le secteur ni la
      // zone n'ont jamais été demandés. Sous trois axes évalués, il n'y a pas de
      // score — la carte garde son critère matché et reçoit le nom de ce qui
      // n'a pas pu être jugé.
      expect(result[0]?.score_similarity).toBeUndefined()
      expect(result[1]?.score_similarity).toBeUndefined()
      expect(result[0]?.similarity_confidence).toBe('partielle')
      expect(result[0]?.similarity_reasons).toEqual(['size'])
      expect(result[0]?.similarity_unevaluated).toEqual(['sector', 'geo'])
    })

    it('tout : secteur cible + géo (dept→région) + taille cumulés dominent le classement', async () => {
      esnProfile.resolveProfileData.mockResolvedValueOnce({
        sectors: ['Assurance & Mutuelles'],
        geoZone: 'Lyon & Auvergne-Rhône-Alpes',
        targetCompanyTypes: ['ETI (500-5 000 salariés)'],
      })
      repo.find.mockResolvedValueOnce(bankPortfolio as never)
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          // Premier dans l'ordre Pappers, mais 0 critère matché.
          { name: 'Banque Parisienne', siren: '2', city: 'Paris', sector: 'Banque de détail' },
          // Secteur ("assurance" ∈ secteurs cibles) → +3.
          { name: 'Assur Mutuelle', siren: '3', city: 'Bordeaux', sector: 'Assurance vie' },
          // Secteur (+3) + géo (38 = Isère → Auvergne-Rhône-Alpes, +2) + taille (+2) = 7/7.
          {
            name: 'Assurances Alpines',
            siren: '4',
            city: 'Grenoble',
            sector: 'Assurance',
            postal_code: '38000',
            employees_min: 1000,
            employees_max: 1999,
          },
        ],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      expect(result.map(item => item.company_name)).toEqual([
        'Assurances Alpines',
        'Assur Mutuelle',
        'Banque Parisienne',
      ])
      expect(result[0]?.score_similarity).toBeCloseTo(1)
      expect(result[1]?.score_similarity).toBeCloseTo(3 / 7)
      // #2040.18 — les trois axes étaient évaluables : le score a un sens, il
      // est publié, et il n'y a rien à nommer en creux.
      expect(result[0]?.similarity_confidence).toBe('etayee')
      expect(result[0]?.similarity_unevaluated).toBeUndefined()
    })

    it('reste servi (ordre découverte) si la résolution du profil vendeur échoue', async () => {
      esnProfile.resolveProfileData.mockRejectedValueOnce(new Error('profil KO'))
      repo.find.mockResolvedValueOnce(bankPortfolio as never)
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [{ name: 'AXA Banque', siren: '2', city: 'Paris', sector: 'Banque' }],
      })

      const result = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

      expect(result.map(item => item.company_name)).toEqual(['AXA Banque'])
    })
  })

  describe('listSimilarToAccount (Théo p.41)', () => {
    it('seeds discovery with the account NAF code and excludes portfolio + self', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        company_name: 'Doctolib',
        sector: 'Programmation informatique',
        naf_code: '62.01Z',
      } as never)
      repo.find.mockResolvedValueOnce([
        { company_name: 'Doctolib', status: 'completed' },
        { company_name: 'Alan', status: 'completed' },
      ] as never)
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          { name: 'Doctolib', siren: '1', city: 'Paris', sector: 'Programmation informatique' }, // self → excluded
          { name: 'Alan', siren: '2', city: 'Paris', sector: 'Programmation informatique' }, // in portfolio → excluded
          { name: 'Payfit', siren: '3', city: 'Paris', sector: 'Programmation informatique' },
        ],
      })

      const result = await service.listSimilarToAccount('acc-1', 'ws-1')

      // The NAF code drives the filter + a sector-appropriate recall seed
      // (division 62 → "informatique"), not the abstract sector label.
      expect(ia.discoverCompanies).toHaveBeenCalledWith(
        'informatique',
        6,
        expect.objectContaining({ nafCode: '62.01Z' }),
      )
      expect(result.map(r => r.company_name)).toEqual(['Payfit'])
    })

    it('#2127.26 / .27 — nomme la zone et la taille PARTAGÉES avec le compte ouvert, rien d’autre', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        company_name: 'Doctolib',
        sector: 'Programmation informatique',
        naf_code: '62.01Z',
        headquarters: '75008 Paris',
        employees: '2 000 - 4 999',
      } as never)
      repo.find.mockResolvedValueOnce([{ company_name: 'Doctolib', status: 'completed' }] as never)
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          {
            name: 'Payfit',
            siren: '3',
            city: 'PARIS',
            postal_code: '75002',
            employees_min: 2000,
            employees_max: 4999,
            sector: 'Programmation informatique',
          },
          { name: 'Qonto', siren: '4', city: 'LYON', sector: 'Programmation informatique' },
        ],
      } as never)

      const result = await service.listSimilarToAccount('acc-1', 'ws-1')

      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.arrayContaining(['headquarters', 'employees']) }),
      )
      expect(result.find(r => r.company_name === 'Payfit')?.reference_shared).toEqual(['geo', 'size'])
      // Rien de vérifié → pas de champ : un tableau vide se lirait « rien en commun ».
      expect(result.find(r => r.company_name === 'Qonto')).not.toHaveProperty('reference_shared')
    })

    it('returns [] for an account outside the workspace', async () => {
      repo.findOne.mockResolvedValueOnce(null as never)
      const result = await service.listSimilarToAccount('ghost', 'ws-1')
      expect(result).toEqual([])
      expect(ia.discoverCompanies).not.toHaveBeenCalled()
    })

    /**
     * #1632 — LE COMPTE NE SE PROPOSE PLUS LUI-MÊME.
     *
     * Mesuré en production le 08/09/2026 : le dossier SNCF (SIREN 552049447)
     * listait « SOCIETE NATIONALE SNCF », SIREN 552049447 — LUI-MÊME — en tête
     * de « Comptes du même secteur ».
     *
     * La cause est une divergence entre deux lectures du même objet :
     * l'exclusion se faisait sur le NOM D'AFFICHAGE (« sncf »), l'identité
     * d'une entreprise est son SIREN. Le nom du portefeuille est celui que le
     * commercial a tapé ; celui que le registre rend est la raison sociale
     * complète. Les deux ne se rencontrent jamais.
     *
     * ⚠️ Le test qui existait au-dessus affirme « excludes portfolio + self »
     * et il était VERT — parce que son cas « self » emploie le MÊME nom des
     * deux côtés (`Doctolib` / `Doctolib`). Il prouvait que la comparaison de
     * noms fonctionne, pas que le compte s'exclut. C'est pour ça que ce cas-ci
     * lui est ajouté au lieu d'être fondu dedans : il faut que les deux noms
     * DIFFÈRENT pour que la garde lise quelque chose.
     */
    it('exclut le compte lui-même par son SIREN, même sous une autre raison sociale', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        company_name: 'SNCF',
        sector: 'Transport ferroviaire interurbain de voyageurs',
        naf_code: '49.10Z',
        siren: '552049447',
      } as never)
      repo.find.mockResolvedValueOnce([{ company_name: 'SNCF', status: 'completed', siren: '552049447' }] as never)
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          // Le compte lui-même, sous sa raison sociale de registre : le nom ne
          // matche pas, le SIREN si.
          { name: 'SOCIETE NATIONALE SNCF', siren: '552049447', city: 'Saint-Denis', sector: 'Transport ferroviaire' },
          { name: 'ITALO - NUOVO TRASPORTO VIAGGIATORI S.P.A.', siren: '943293993', city: 'Roma', sector: 'Transport' },
        ],
      })

      const result = await service.listSimilarToAccount('acc-1', 'ws-1')

      expect(result.map(r => r.company_name)).toEqual(['ITALO - NUOVO TRASPORTO VIAGGIATORI S.P.A.'])
    })

    /**
     * LE TÉMOIN — la garde ne doit pas attraper ce qu'elle ne vise pas.
     *
     * Un SIREN ABSENT des deux côtés ne rapproche personne : deux entreprises
     * étrangères sans SIREN ne sont pas la même. Sans ce cas, un `Set` qui
     * accueille `null` exclurait toutes les suggestions hors de France dès
     * qu'un seul compte du portefeuille n'a pas de SIREN — c'est-à-dire
     * presque toujours.
     */
    it('deux SIREN absents ne valent pas une identité', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        company_name: 'Acme GmbH',
        sector: 'Programmation informatique',
        naf_code: '62.01Z',
        siren: null,
      } as never)
      repo.find.mockResolvedValueOnce([{ company_name: 'Acme GmbH', status: 'completed', siren: null }] as never)
      ia.discoverCompanies.mockResolvedValueOnce({
        suggestions: [
          { name: 'Globex AG', siren: '', city: 'Zürich', sector: 'Programmation informatique' },
          { name: 'Initech BV', siren: '', city: 'Amsterdam', sector: 'Programmation informatique' },
        ],
      })

      const result = await service.listSimilarToAccount('acc-1', 'ws-1')

      expect(result.map(r => r.company_name)).toEqual(['Globex AG', 'Initech BV'])
    })

    /**
     * #2127.37 — UNE SUGGESTION MASQUÉE NE RÉAPPARAÎT PAS, MÊME APRÈS RECALCUL.
     *
     * C'est le test que personne n'écrit et qui casse en production (brief) :
     * la découverte est relancée en LIVE à chaque appel (Pappers), donc rien ne
     * garantit qu'un simple filtre en mémoire survive à un second appel — seule
     * une lecture de la table de masquage, à CHAQUE réponse, le garantit.
     */
    it('exclut une suggestion masquée par CETTE personne sur CE compte — même après un second appel (recalcul)', async () => {
      const dismissals = createMockRepository<SimilarAccountDismissalEntity>()
      dismissals.find.mockResolvedValue([{ candidate_siren: '3' }] as never)
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        dismissals as never,
      )
      repo.findOne.mockResolvedValue({
        id: 'acc-1',
        company_name: 'Doctolib',
        sector: 'Programmation informatique',
        naf_code: '62.01Z',
      } as never)
      repo.find.mockResolvedValue([{ company_name: 'Doctolib', status: 'completed' }] as never)
      ia.discoverCompanies.mockResolvedValue({
        suggestions: [{ name: 'Payfit', siren: '3', city: 'Paris', sector: 'Programmation informatique' }],
      })

      const first = await svc.listSimilarToAccount('acc-1', 'ws-1', 'user-1')
      const second = await svc.listSimilarToAccount('acc-1', 'ws-1', 'user-1')

      expect(first).toEqual([])
      expect(second).toEqual([])
      expect(dismissals.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspace_id: 'ws-1', user_id: 'user-1', account_id: 'acc-1' }),
        }),
      )
    })

    it('ne masque rien sans `userId` — comportement identique à avant ce lot', async () => {
      const dismissals = createMockRepository<SimilarAccountDismissalEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        dismissals as never,
      )
      repo.findOne.mockResolvedValue({
        id: 'acc-1',
        company_name: 'Doctolib',
        sector: 'Programmation informatique',
        naf_code: '62.01Z',
      } as never)
      repo.find.mockResolvedValue([{ company_name: 'Doctolib', status: 'completed' }] as never)
      ia.discoverCompanies.mockResolvedValue({
        suggestions: [{ name: 'Payfit', siren: '3', city: 'Paris', sector: 'Programmation informatique' }],
      })

      const result = await svc.listSimilarToAccount('acc-1', 'ws-1')

      expect(result.map(r => r.company_name)).toEqual(['Payfit'])
      expect(dismissals.find).not.toHaveBeenCalled()
    })
  })

  describe('dismissSimilarSuggestion / restoreSimilarSuggestion (#2127.37)', () => {
    it('masque : upsert sur la clé composite, `dismissed_at` posé', async () => {
      const dismissals = createMockRepository<SimilarAccountDismissalEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        dismissals as never,
      )

      await svc.dismissSimilarSuggestion('ws-1', 'user-1', 'acc-1', '3')

      expect(dismissals.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          user_id: 'user-1',
          account_id: 'acc-1',
          candidate_siren: '3',
          dismissed_at: expect.any(Date),
        }),
        ['workspace_id', 'user_id', 'account_id', 'candidate_siren'],
      )
    })

    it('démasque : `dismissed_at` repasse à `null` — la ligne n’est jamais supprimée', async () => {
      const dismissals = createMockRepository<SimilarAccountDismissalEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        dismissals as never,
      )

      await svc.restoreSimilarSuggestion('ws-1', 'user-1', 'acc-1', '3')

      expect(dismissals.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          user_id: 'user-1',
          account_id: 'acc-1',
          candidate_siren: '3',
          dismissed_at: null,
        }),
        ['workspace_id', 'user_id', 'account_id', 'candidate_siren'],
      )
      expect(dismissals.delete).not.toHaveBeenCalled()
    })

    it('sans repository (@Optional absent) : NO-OP silencieux, jamais une erreur', async () => {
      await expect(service.dismissSimilarSuggestion('ws-1', 'user-1', 'acc-1', '3')).resolves.toBeUndefined()
      await expect(service.restoreSimilarSuggestion('ws-1', 'user-1', 'acc-1', '3')).resolves.toBeUndefined()
    })
  })

  describe('archive', () => {
    it('returns a success result on archive', async () => {
      const result = await service.archive('1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual({ archived: true })
      expect(repo.update).toHaveBeenCalledWith(gestureWhere('1', 'user-1'), {
        status: 'archived',
        commercial_status: 'archived',
        error_message: null,
      })
    })

    it('returns an archive_failed failure on query builder error', async () => {
      repo.update.mockRejectedValueOnce(new Error('archive failed') as never)
      const result = await service.archive('1', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('archive_failed')
    })
  })

  // Théo A comptes-fiche-reference.A2 — la copie de travail d'une archive figée.
  describe('createWorkingCopy', () => {
    const archive = {
      id: 'acc-archive',
      user_id: 'user-0',
      workspace_id: 'ws-1',
      company_name: 'Groupe BPCE',
      siren: null,
      raw_analysis: {
        reference_archive: {
          label: 'Archive du dépôt fourni',
          period_from: '2026-09-30',
          period_to: '2026-10-01',
          scope_note: 'périmètre France',
          verified_online: false,
        },
      },
    }
    let query: jest.Mock
    let txQuery: jest.Mock
    let saved: jest.Mock

    beforeEach(() => {
      query = jest.fn().mockResolvedValue([])
      txQuery = jest.fn().mockResolvedValue([])
      saved = jest.fn().mockResolvedValue({ id: 'acc-copy' })
      const txRepo = { create: jest.fn((fields: unknown) => fields), save: saved }
      const manager = {
        query,
        transaction: jest.fn(async (work: (runner: unknown) => Promise<unknown>) =>
          work({ getRepository: () => txRepo, query: txQuery }),
        ),
      }
      ;(repo as unknown as { manager: unknown }).manager = manager
    })

    it('crée la copie, nomme son origine et hérite des notes', async () => {
      repo.findOne.mockResolvedValueOnce(archive as never)
      const result = await service.createWorkingCopy('acc-archive', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual({ id: 'acc-copy', created: true })
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          raw_analysis: expect.objectContaining({ working_copy_of: 'acc-archive' }),
        }),
      )
      expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notes'), [
        'acc-archive',
        'acc-copy',
        'ws-1',
      ])
    })

    it('rend la copie déjà ouverte au lieu d’en créer une seconde', async () => {
      repo.findOne.mockResolvedValueOnce(archive as never)
      query.mockResolvedValueOnce([{ id: 'acc-copy-existing' }])
      const result = await service.createWorkingCopy('acc-archive', 'user-1')
      if (isSuccess(result)) expect(result.output).toEqual({ id: 'acc-copy-existing', created: false })
      expect(saved).not.toHaveBeenCalled()
    })

    it('refuse un compte qui n’est pas une archive', async () => {
      repo.findOne.mockResolvedValueOnce({ ...archive, raw_analysis: {} } as never)
      const result = await service.createWorkingCopy('acc-archive', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('invalid_input')
      expect(saved).not.toHaveBeenCalled()
    })

    it('compte introuvable → not_found', async () => {
      repo.findOne.mockResolvedValueOnce(null as never)
      const result = await service.createWorkingCopy('nope', 'user-1')
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
      expect(isFailure(result)).toBe(true)
    })
  })

  describe('commercial lifecycle (Théo p.39)', () => {
    it('setCommercialStatus writes only commercial_status for non-archive moves', async () => {
      await service.setCommercialStatus('1', 'user-1', 'opportunity')
      expect(repo.update).toHaveBeenCalledWith(gestureWhere('1', 'user-1'), { commercial_status: 'opportunity' })
    })

    // #3490 — « désarchiver » n'avait aucun effet : le tri commercial changeait
    // mais `status` restait `archived`, donc le compte restait hors du
    // balayage des doublons et hors des listes. Le geste de recette « désarchiver
    // la fiche SG » doit RENDRE le dossier.
    it('setCommercialStatus out of archived reactivates the analysis status (#3490)', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: '1',
        status: 'archived',
        commercial_status: 'archived',
        company_name: 'Societe Generale',
      } as never)
      await service.setCommercialStatus('1', 'user-1', 'inbox')
      expect(repo.update).toHaveBeenCalledWith(gestureWhere('1', 'user-1'), {
        commercial_status: 'inbox',
        status: 'completed',
      })
    })

    it('setCommercialStatus on a live account never touches the analysis status (#3490)', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: '1',
        status: 'error',
        commercial_status: 'inbox',
        company_name: 'Societe Generale',
      } as never)
      await service.setCommercialStatus('1', 'user-1', 'opportunity')
      expect(repo.update).toHaveBeenCalledWith(gestureWhere('1', 'user-1'), { commercial_status: 'opportunity' })
    })

    it('setCommercialStatus to archived also flips analysis status', async () => {
      // #2117.23 — « Hors priorité » est un statut de SORTIE : le motif est
      // exigé par `commercialStatusWriteRefusal`, donc ce cas le fournit. Le
      // refus sans motif est couvert par son propre test, plus bas.
      await service.setCommercialStatus('1', 'user-1', 'archived', 'repris par un concurrent')
      expect(repo.update).toHaveBeenCalledWith(gestureWhere('1', 'user-1'), {
        commercial_status: 'archived',
        status: 'archived',
      })
    })

    // `deal_signed` était LU par les KPIs d'équipe et écrit par PERSONNE. Le
    // geste existait pourtant — le commercial déplace le compte en « Client » —
    // il ne laissait simplement aucune trace.
    it('consigne « affaire signée » au journal quand un compte passe en client', async () => {
      const userActions = createMockRepository<UserActionEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        userActions as never,
      )
      repo.findOne.mockResolvedValueOnce({
        id: '1',
        commercial_status: 'opportunity',
        company_name: 'SNCF',
      } as never)

      await svc.setCommercialStatus('1', 'user-1', 'customer')

      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'deal_signed',
          account_id: '1',
          user_id: 'user-1',
          // Déclaration du commercial : Bellum ne lit aucun contrat.
          metadata: expect.objectContaining({ via: 'declaration', previous_status: 'opportunity' }),
        }),
      )
    })

    it('ne consigne RIEN quand le compte était DÉJÀ client — on ne signe pas deux fois', async () => {
      const userActions = createMockRepository<UserActionEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        userActions as never,
      )
      repo.findOne.mockResolvedValueOnce({ id: '1', commercial_status: 'customer', company_name: 'SNCF' } as never)

      await svc.setCommercialStatus('1', 'user-1', 'customer')

      expect(userActions.save).not.toHaveBeenCalled()
    })

    // #2117.24 — l'historique n'était écrit que vers « Client » (`deal_signed`).
    // Chaque TRANSITION écrit désormais une entrée horodatée : qui (`user_id`),
    // de → vers, et le motif quand il y en a un (#2117.23).
    it('#2117.24 — chaque transition écrit une entrée d’historique : qui, de → vers, motif', async () => {
      const userActions = createMockRepository<UserActionEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        userActions as never,
      )
      repo.findOne.mockResolvedValueOnce({ id: '1', commercial_status: 'watching', company_name: 'SNCF' } as never)

      await svc.setCommercialStatus('1', 'user-1', 'archived', 'Pas de budget avant 2027')

      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'commercial_status_changed',
          account_id: '1',
          user_id: 'user-1',
          metadata: expect.objectContaining({
            from: 'watching',
            to: 'archived',
            reason: 'Pas de budget avant 2027',
          }),
        }),
      )
    })

    it('#2117.24 — une transition SANS motif s’écrit aussi, motif `null` — jamais un motif inventé', async () => {
      const userActions = createMockRepository<UserActionEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        userActions as never,
      )
      repo.findOne.mockResolvedValueOnce({ id: '1', commercial_status: 'inbox', company_name: 'SNCF' } as never)

      await svc.setCommercialStatus('1', 'user-1', 'opportunity')

      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'commercial_status_changed',
          metadata: expect.objectContaining({ from: 'inbox', to: 'opportunity', reason: null }),
        }),
      )
    })

    it('#2117.24 — re-cliquer le statut COURANT n’écrit aucune entrée : ce n’est pas une transition', async () => {
      const userActions = createMockRepository<UserActionEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        userActions as never,
      )
      repo.findOne.mockResolvedValueOnce({ id: '1', commercial_status: 'watching', company_name: 'SNCF' } as never)

      await svc.setCommercialStatus('1', 'user-1', 'watching')

      expect(userActions.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'commercial_status_changed' }),
      )
    })

    /**
     * #2117.21 — « En veille » n'est vraie que parce qu'un commercial l'a dite.
     *
     * Le défaut de `origin` est `system` : un appelant qui ne se déclare pas
     * (routine, worker d'analyse, import, outil de Laura, script) est refusé.
     * C'est le sens de ces trois tests — ils cassent si quelqu'un remet un
     * défaut permissif, ou fait sauter la porte.
     */
    it('#2117.21 — un chemin SYSTÈME qui tente « En veille » est REFUSÉ, motif ou pas', async () => {
      const userActions = createMockRepository<UserActionEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        userActions as never,
      )
      repo.update.mockClear()
      repo.findOne.mockClear()

      await expect(
        svc.setCommercialStatus('1', 'user-1', 'dormant', 'sans nouvelles depuis 90 jours', 'system'),
      ).rejects.toThrow(/human_only/)
      // Le défaut de l'argument est le même refus : ne rien passer ne vaut pas
      // accord. C'est ce qui protège l'appelant qu'on n'a pas encore écrit.
      await expect(svc.setCommercialStatus('1', 'user-1', 'dormant', 'silence')).rejects.toThrow(/human_only/)

      // Rien n'a été lu, rien n'écrit, aucune entrée d'historique : un refus ne
      // laisse pas de trace qui ferait croire au geste.
      expect(repo.update).not.toHaveBeenCalled()
      expect(repo.findOne).not.toHaveBeenCalled()
      expect(userActions.save).not.toHaveBeenCalled()
    })

    it('#2117.21 / #2117.23 — un geste HUMAIN sans motif est refusé, pour « En veille » comme pour « Hors priorité »', async () => {
      repo.update.mockClear()
      await expect(service.setCommercialStatus('1', 'user-1', 'dormant', undefined, 'human')).rejects.toThrow(
        /reason_required/,
      )
      await expect(service.setCommercialStatus('1', 'user-1', 'archived', '   ', 'human')).rejects.toThrow(
        /reason_required/,
      )
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('#2117.21 — le geste humain MOTIVÉ écrit « En veille » et son motif au journal', async () => {
      const userActions = createMockRepository<UserActionEntity>()
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        undefined,
        undefined,
        undefined,
        undefined,
        userActions as never,
      )
      repo.findOne.mockResolvedValueOnce({ id: '1', commercial_status: 'watching', company_name: 'SNCF' } as never)

      await svc.setCommercialStatus('1', 'user-1', 'dormant', 'Budget gelé jusqu’au prochain exercice', 'human')

      expect(repo.update).toHaveBeenCalledWith(gestureWhere('1', 'user-1'), { commercial_status: 'dormant' })
      expect(userActions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'commercial_status_changed',
          metadata: expect.objectContaining({
            from: 'watching',
            to: 'dormant',
            reason: 'Budget gelé jusqu’au prochain exercice',
          }),
        }),
      )
    })

    it('#2117.19 — « En cours d’ouverture » est un statut de pipe : aucun motif exigé, aucune origine exigée', async () => {
      repo.findOne.mockResolvedValueOnce({ id: '1', commercial_status: 'opportunity', company_name: 'SNCF' } as never)

      await expect(service.setCommercialStatus('1', 'user-1', 'opening')).resolves.toBeUndefined()
    })

    it('markCompleted pré-classe le tri commercial depuis inbox, sans écraser un tri manuel', async () => {
      repo.manager.query.mockResolvedValue([{ priority_score: 9 }])
      await service.markCompleted('1')
      // Deux requêtes : la lecture du score, puis l'écriture. La bande de score
      // vit dans `deriveCommercialStatusOnComplete` (D53), plus dans le SQL —
      // le détail de l'équivalence est prouvé par `mark-completed-derivation`.
      const [selectSql] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(selectSql).toContain('SELECT priority_score')
      const [sql, params] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(sql).toContain("status = 'completed'")
      // N'écrit commercial_status QUE s'il vaut encore 'inbox'.
      expect(sql).toContain("COALESCE(commercial_status, 'inbox') = 'inbox'")
      expect(params).toEqual(['1', 'opportunity'])
    })

    /**
     * D44 · 26/08 puis D53 · 26/08 — la coupure du tri commercial EST la bande
     * de score, et elle a fini par quitter le SQL tout à fait.
     *
     * D44 l'a d'abord LIÉE en paramètre, pour qu'elle cesse de dériver ; D53 a
     * branché `deriveCommercialStatusOnComplete`, qui la possède, et le SQL ne
     * reçoit plus que le VERDICT. Ce test garde donc quelque chose de plus
     * fort qu'avant : il n'y a plus aucune coupure dans cette requête, ni
     * écrite, ni liée.
     */
    it('markCompleted n’écrit AUCUNE coupure de score dans son SQL', async () => {
      repo.manager.query.mockResolvedValue([{ priority_score: 9 }])
      await service.markCompleted('1')
      const [sql, params] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(sql).not.toMatch(/priority_score\s*>=/)
      // Ce qui voyage est le verdict, calculé par la seule dérivation qui
      // connaisse la bande — jamais un nombre que le SQL comparerait.
      expect(params[1]).toBe(deriveCommercialStatusOnComplete('inbox', 9))
    })

    /**
     * Le cas limite exact : 7,0 est « GO » à l'écran, donc il se range du côté
     * « GO » ; 6,9 n'est ni l'un ni l'autre. Le SQL et le miroir TypeScript
     * répondent la même chose parce qu'ils lisent la même constante.
     */
    it('un compte noté 7 se range en opportunité, un compte noté 6,9 non', () => {
      expect(deriveCommercialStatusOnComplete('inbox', ACCOUNT_SCORE_GO_MIN)).toBe('opportunity')
      expect(deriveCommercialStatusOnComplete('inbox', ACCOUNT_SCORE_GO_MIN - 0.1)).toBe('watching')
    })
  })

  // #2165.13 — la SOURCE réelle du preset Découvrir « Proches de mes
  // meilleures références », en remplacement de la tranche 250-999/3-10 ans
  // fixe qu'il posait avant (jamais reliée à une vraie référence).
  describe('#2165.13 — meilleure référence', () => {
    it('setBestReference écrit is_best_reference, scopé WORKSPACE (pas user_id)', async () => {
      await service.setBestReference('acc-1', 'workspace-1', true)
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'acc-1', workspace_id: 'workspace-1' },
        { is_best_reference: true },
      )
    })

    it('#3245 setBetProfile écrit SEULEMENT les champs donnés et retire avec null', async () => {
      await service.setBetProfile('acc-1', 'workspace-1', { horizon: 'long', resource: '  ', access: null })
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'acc-1', workspace_id: 'workspace-1' },
        { bet_horizon: 'long', bet_resource: null, bet_access: null },
      )
    })

    it('#3245 listBetProfiles rend UNE ligne par dossier, déclarations en tête, cloisonnée par unité', async () => {
      const qb = repo.createQueryBuilder()
      qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'acc-1',
          company_name: 'SNCF',
          bet_horizon: 'long',
          bet_size: null,
          bet_access: 'open',
          bet_resource: 'Équipe data',
        },
        { id: 'acc-2', company_name: 'RATP', bet_horizon: null, bet_size: null, bet_access: null, bet_resource: null },
      ])

      const result = await service.listBetProfiles('workspace-1')

      expect(qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'workspace-1' })
      // Un dossier supprimé n'est pas un pari à déclarer.
      expect(qb.andWhere).toHaveBeenCalledWith("account.status != 'deleted'")
      expect(qb.limit).toHaveBeenCalledWith(100)
      // Non déclaré reste `null` (jamais « court » ou « ouvert » par défaut).
      expect(result).toEqual([
        { id: 'acc-1', name: 'SNCF', horizon: 'long', size: null, access: 'open', resource: 'Équipe data' },
        { id: 'acc-2', name: 'RATP', horizon: null, size: null, access: null, resource: null },
      ])
    })

    it('listBestReferenceSectors ne rend que les comptes marqués, avec leur secteur brut', async () => {
      // #2084.24 — écrite en QueryBuilder depuis le 20/09/2026 (et non plus en
      // `find({ where })`) : le cloisonnement d'unité s'exprime en SQL, et le
      // traduire en objet TypeORM aurait été une seconde écriture de la règle.
      // Ce test assertait la forme du `find` ; il asserte maintenant les deux
      // clauses de la requête — il prouve exactement la même chose.
      const qb = repo.createQueryBuilder()
      qb.getRawMany.mockResolvedValueOnce([
        { id: 'acc-1', company_name: 'Orange', sector: 'Télécoms' },
        { id: 'acc-2', company_name: 'RATP', sector: null },
      ])

      const result = await service.listBestReferenceSectors('workspace-1')

      expect(qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'workspace-1' })
      expect(qb.andWhere).toHaveBeenCalledWith('account.is_best_reference = true')
      expect(qb.limit).toHaveBeenCalledWith(50)
      // #2165.13 — un secteur ABSENT n'est jamais filtré en silence : c'est à
      // l'appelant (l'écran) de dire « référence marquée, secteur inconnu ».
      expect(result).toEqual([
        { id: 'acc-1', name: 'Orange', sector: 'Télécoms' },
        { id: 'acc-2', name: 'RATP', sector: null },
      ])
    })
  })

  describe('delete', () => {
    it('returns a success result on delete', async () => {
      const result = await service.delete('1', 'user-1')
      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual({ deleted: true })
      expect(repo.update).toHaveBeenCalledWith(gestureWhere('1', 'user-1'), { status: 'deleted', error_message: null })
    })

    it('returns a delete_failed failure on query builder error', async () => {
      repo.update.mockRejectedValueOnce(new Error('delete failed') as never)
      const result = await service.delete('1', 'user-1')
      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('delete_failed')
    })
  })

  describe('markCancelled', () => {
    it('sets status=canceled with the cancellation message scoped by the workspace of the caller (#4731)', async () => {
      await service.markCancelled('a-1', 'u-1')
      expect(repo.update).toHaveBeenCalledWith(gestureWhere('a-1', 'u-1'), {
        status: 'canceled',
        error_message: "Analyse annulée par l'utilisateur.",
      })
    })
  })

  describe('applyResearch', () => {
    const baseResearch = {
      sector: 'Banque',
      employees: '100k',
      revenue: '25 Md€',
      headquarters: 'Paris',
      website: 'https://socgen.com',
      subsidiaries: [],
      itChallenges: [],
      recentSignals: [],
      priorityScore: 8,
      priorityJustification: 'Top target',
      angles: [],
    }

    /**
     * L'écriture du blob d'analyse. Elle ne voyage plus dans le patch d'`UPDATE`
     * — qui REMPLAÇAIT la colonne entière — mais dans une fusion JSONB dédiée,
     * repérée par son SQL et non par son rang (`applyResearch` émet d'autres
     * requêtes : archivage SIREN, partenaires détectés, faits d'accès).
     */
    const rawAnalysisWrite = (): [string, unknown[]] =>
      repo.manager.query.mock.calls.find(([sql]) => String(sql).includes('SET raw_analysis')) as [string, unknown[]]
    const writtenRawAnalysis = (): Record<string, unknown> =>
      JSON.parse(String(rawAnalysisWrite()[1][1])) as Record<string, unknown>

    // #3671 — un fait corrigé ne revient pas tel quel ; une préférence ne retire rien.
    describe('fait corrigé : ne réapparaît pas tel quel (#3671)', () => {
      const feedbackRow = (verdict: string, targetRef: string, created = '2026-09-01T10:00:00Z') => ({
        target: 'signal',
        target_ref: targetRef,
        verdict,
        created_at: new Date(created),
      })
      const serviceWithFeedback = (rows: unknown[]) => {
        const accountFeedback = { find: jest.fn().mockResolvedValue(rows) }
        const svc = new AccountsService(
          repo as never,
          ia as never,
          workspaceContext as never,
          esnProfile as never,
          ...(Array(8).fill(undefined) as []),
          accountFeedback as never,
        )
        return { svc, accountFeedback }
      }
      const research = (signals: Array<Record<string, unknown>>) => ({ ...baseResearch, recentSignals: signals })
      const writtenSignals = () =>
        (repo.update.mock.calls[0] as [unknown, Record<string, unknown>])[1]['recent_signals']

      it('écarte un signal déclaré faux, dans la colonne ET dans le blob', async () => {
        const { svc, accountFeedback } = serviceWithFeedback([feedbackRow('faux', 'Levée de fonds')])
        await svc.applyResearch(
          'acc-1',
          research([{ signal: 'Levée de fonds' }, { signal: 'Nouveau DSI' }]) as never,
          undefined,
          {
            workspaceId: 'ws-1',
          },
        )
        expect(writtenSignals()).toEqual([{ signal: 'Nouveau DSI' }])
        expect(JSON.stringify(writtenRawAnalysis())).not.toContain('Levée de fonds')
        // borné à l'espace ET au dossier : jamais la correction d'une autre ESN
        expect(accountFeedback.find).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ account_id: 'acc-1', workspace_id: 'ws-1' }) }),
        )
      })

      it('« inutile » est une préférence : le fait reste écrit', async () => {
        const { svc } = serviceWithFeedback([feedbackRow('inutile', 'Levée de fonds')])
        await svc.applyResearch('acc-1', research([{ signal: 'Levée de fonds' }]) as never, undefined, {
          workspaceId: 'ws-1',
        })
        expect(writtenSignals()).toEqual([{ signal: 'Levée de fonds' }])
      })

      // #4294.6 — fiche Veolia : les mêmes faits écrits deux fois par deux passes ne s'écrivent qu'une fois.
      it('#4294.6 — deux signaux quasi identiques (même titre normalisé, même source) ne s’écrivent qu’une fois', async () => {
        await service.applyResearch(
          'acc-1',
          research([
            { signal: 'Veolia : après 20 % de baisse…', source: 'Les Échos' },
            { signal: 'VEOLIA: apres 20% de baisse', source: 'les echos' },
            { signal: 'Nouveau DSI' },
          ]) as never,
        )
        expect(writtenSignals()).toEqual([
          { signal: 'Veolia : après 20 % de baisse…', source: 'Les Échos' },
          { signal: 'Nouveau DSI' },
        ])
        expect(JSON.stringify(writtenRawAnalysis())).not.toContain('apres 20% de baisse')
      })

      // #4616 — sous la transaction de `saveResearch`, la lecture des corrections passe par SA connexion :
      // sur le dépôt global, elle en prenait une deuxième pendant que la première était tenue.
      it('#4616 — avec un manager, les corrections se lisent sur lui, jamais sur le pool global', async () => {
        const { svc, accountFeedback } = serviceWithFeedback([feedbackRow('faux', 'Levée de fonds')])
        const txFeedback = { find: jest.fn().mockResolvedValue([feedbackRow('faux', 'Levée de fonds')]) }
        const manager = {
          getRepository: jest.fn((entity: unknown) => (entity === AccountFeedbackEntity ? txFeedback : repo)),
          transaction: jest.fn(async (run: (m: unknown) => Promise<unknown>) => run(manager)),
          query: repo.manager.query,
        }
        await svc.applyResearch(
          'acc-1',
          research([{ signal: 'Levée de fonds' }, { signal: 'Nouveau DSI' }]) as never,
          manager as never,
          { workspaceId: 'ws-1' },
        )
        expect(accountFeedback.find).not.toHaveBeenCalled()
        expect(txFeedback.find).toHaveBeenCalledTimes(1)
        expect(writtenSignals()).toEqual([{ signal: 'Nouveau DSI' }])
      })

      it('sans espace, aucune lecture de correction (no-op strict)', async () => {
        const { svc, accountFeedback } = serviceWithFeedback([feedbackRow('faux', 'Levée de fonds')])
        await svc.applyResearch('acc-1', research([{ signal: 'Levée de fonds' }]) as never)
        expect(accountFeedback.find).not.toHaveBeenCalled()
        expect(writtenSignals()).toEqual([{ signal: 'Levée de fonds' }])
      })
    })

    /**
     * Le seul objet du dossier que l'utilisateur CRÉE de sa main — un angle
     * d'attaque, une action de plan — vit dans `raw_analysis`, et rien dans le
     * pipeline ne le reproduit. Le blob partait en `UPDATE … SET raw_analysis =
     * $1` : chaque « Actualiser l'analyse » l'effaçait, sans un mot.
     */
    describe('les ajouts de l’utilisateur survivent à une relance', () => {
      it('n’écrit plus `raw_analysis` par REMPLACEMENT dans le patch d’UPDATE', async () => {
        await service.applyResearch('acc-1', baseResearch)
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect('raw_analysis' in patch).toBe(false)
      })

      it('fusionne le blob et laisse les clés écrites par l’utilisateur du côté GAGNANT du `||`', async () => {
        await service.applyResearch('acc-1', baseResearch)
        const [sql, params] = rawAnalysisWrite()

        // L'ordre est la moitié du correctif : en SQL `a || b` donne la
        // priorité à `b`. Le stock passe en premier (il ne doit pas gagner sur
        // du frais), la recherche fraîche ensuite, et les clés d'origine
        // HUMAINE en DERNIER — sinon le pipeline les réécrit et rien n'est
        // corrigé.
        const merge = /SET raw_analysis = ([\s\S]*?)\n\s*WHERE id = \$1/.exec(sql)?.[1] ?? ''
        const stored = merge.indexOf("COALESCE(raw_analysis, '{}'::jsonb)")
        const fresh = merge.indexOf('$2::jsonb')
        const preserved = merge.indexOf('$3::text[]')
        expect(stored).toBeGreaterThanOrEqual(0)
        expect(fresh).toBeGreaterThan(stored)
        expect(preserved).toBeGreaterThan(fresh)
        expect(params[0]).toBe('acc-1')
      })

      it('nomme exactement les clés d’origine humaine, dans la forme RÉELLEMENT stockée (snake_case)', async () => {
        await service.applyResearch('acc-1', baseResearch)
        const [, params] = rawAnalysisWrite()
        // `toSnakeCaseKeys` passe sur tout le blob : les clés préservées se
        // lisent donc en snake_case, comme la colonne les porte.
        expect(params[2]).toEqual(['user_plan_actions', 'user_attack_angles'])
      })

      it('un angle ajouté à la main est TOUJOURS là après une relance d’analyse', async () => {
        // Le dossier TEL QU'IL EST en base au moment de la relance : un angle
        // écrit par le commercial, et le plan produit par la phase 4 — deux
        // choses que la phase 1 ne reproduit pas.
        const stored = {
          sector: 'Assurance',
          user_attack_angles: [{ title: 'Refonte du socle data', recommended: false }],
          user_plan_actions: [{ text: 'Rappeler la DSI en septembre' }],
          plan: { actionPlan: { phases: [] } },
        }

        await service.applyResearch('acc-1', baseResearch)
        const [sql, params] = rawAnalysisWrite()
        const after = applyRawAnalysisStatement(sql, params, stored)

        expect(after['user_attack_angles']).toEqual(stored['user_attack_angles'])
        expect(after['user_plan_actions']).toEqual(stored['user_plan_actions'])
        // Le plan aussi : « Actualiser l'analyse » ne rejoue que la phase 1 et
        // vidait pourtant l'onglet Plan, l'organigramme et le verdict.
        expect(after['plan']).toEqual(stored['plan'])
        // Et la recherche fraîche garde la main sur ce qu'elle, elle, produit.
        expect(after['sector']).toBe('Banque')
      })

      it('la liste de l’utilisateur gagne même si la charge fraîche porte la même clé', async () => {
        // Le cas où l'ORDRE des opérandes tranche vraiment : une charge utile
        // qui renverrait `user_attack_angles` (un profil renvoyé en écho, un
        // format futur) ne doit pas pouvoir remplacer la liste du commercial.
        // Une fusion dont l'humain n'est pas le dernier opérande ne corrige rien.
        const stored = { user_attack_angles: [{ title: 'Écrit par le commercial' }] }
        await service.applyResearch('acc-1', {
          ...baseResearch,
          userAttackAngles: [{ title: 'Écrasé par le pipeline' }],
        } as unknown as typeof baseResearch)

        const [sql, params] = rawAnalysisWrite()
        expect(JSON.parse(String(params[1]))['user_attack_angles']).toBeDefined()
        expect(applyRawAnalysisStatement(sql, params, stored)['user_attack_angles']).toEqual(
          stored['user_attack_angles'],
        )
      })
    })

    /**
     * Le pipeline écrivait les colonnes de fiche en direct : une correction
     * humaine était écrasée à chaque réanalyse, sans un mot. Les CONTACTS
     * passaient déjà par l'arbitre — pas les COMPTES.
     */
    describe('provenance — la correction humaine tient', () => {
      const withProvenance = (sources: Record<string, string>, current: Record<string, unknown>) => {
        const rows = Object.entries(sources).map(([field, source]) => ({
          entity_type: 'account',
          entity_id: 'acc-1',
          field,
          source,
        }))
        const fieldProvenance = { find: jest.fn().mockResolvedValue(rows) }
        repo.findOne.mockResolvedValue(current as never)
        const svc = new AccountsService(
          repo as never,
          ia as never,
          workspaceContext as never,
          esnProfile as never,
          undefined,
          undefined,
          undefined,
          fieldProvenance as never,
        )
        return { svc, fieldProvenance }
      }

      it('ne réécrit pas un champ corrigé à la main', async () => {
        const { svc } = withProvenance({ sector: 'human' }, { id: 'acc-1', sector: 'Assurance', employees: '90k' })
        await svc.applyResearch('acc-1', baseResearch)
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect('sector' in patch).toBe(false)
      })

      // #219.6 (#3231, lot X50) — les filiales DÉCLARÉES à la main ne sont pas
      // réécrites par l'analyse (qu'elle en rapporte d'autres ou aucune).
      it('ne réécrit pas les filiales déclarées à la main', async () => {
        const { svc } = withProvenance(
          { subsidiaries: 'human' },
          { id: 'acc-1', subsidiaries: ['Boursorama', 'Treezor'] },
        )
        await svc.applyResearch('acc-1', { ...baseResearch, subsidiaries: ['Autre filiale'] } as never)
        expect('subsidiaries' in (repo.update.mock.calls[0] as [unknown, Record<string, unknown>])[1]).toBe(false)

        repo.update.mockClear()
        await svc.applyResearch('acc-1', baseResearch)
        expect('subsidiaries' in (repo.update.mock.calls[0] as [unknown, Record<string, unknown>])[1]).toBe(false)
      })

      it('écrit quand même les champs que personne n’a corrigés', async () => {
        // La protection est CHAMP par champ : une correction sur le secteur ne
        // gèle pas le reste du dossier.
        const { svc } = withProvenance({ sector: 'human' }, { id: 'acc-1', sector: 'Assurance', employees: '90k' })
        await svc.applyResearch('acc-1', baseResearch)
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect(patch['employees']).toBe('100k')
        // Le blob part par la fusion JSONB, pas par le patch d'`UPDATE`.
        expect(writtenRawAnalysis()['sector']).toBe('Banque')
      })

      it('ne lit rien de plus quand aucune correction humaine n’est enregistrée', async () => {
        // Le coût de l'arbitrage est nul sur le cas courant : sans provenance
        // humaine, il n'y a rien à protéger et le patch part tel quel.
        const { svc } = withProvenance({ sector: 'pipeline' }, { id: 'acc-1' })
        await svc.applyResearch('acc-1', baseResearch)
        expect(repo.findOne).not.toHaveBeenCalled()
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect(patch['sector']).toBe('Banque')
      })

      it('laisse passer le patch entier quand l’arbitre est absent', async () => {
        // `@Optional()` : sans le module de provenance, aucune correction
        // humaine n'est ENREGISTRÉE — donc il n'y a rien à protéger.
        await service.applyResearch('acc-1', baseResearch)
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect(patch['sector']).toBe('Banque')
      })
    })

    it('persists the SIREN onto the account when present', async () => {
      await service.applyResearch('acc-1', { ...baseResearch, siren: '552120222' })
      const [where, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(where).toEqual({ id: 'acc-1' })
      expect(patch['siren']).toBe('552120222')
    })

    it('does NOT write a siren key when the research payload has none', async () => {
      await service.applyResearch('acc-1', baseResearch)
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect('siren' in patch).toBe(false)
    })

    // #2543.7 — `signals_collected_at` est la date que le ciblage du
    // rattrapage (#2543) comparera à une future capacité datée sur le segment
    // signaux. `applyResearch` est LE point de passage commun à tous les
    // chemins de rafraîchissement — la stamper ici la stampe pour chacun,
    // pipeline complet COMME « Actualiser », sans rien réécrire ailleurs.
    it('stampe signals_collected_at à chaque recherche réellement écrite', async () => {
      await service.applyResearch('acc-1', baseResearch)
      const call = repo.manager.query.mock.calls.find(([sql]) => String(sql).includes('SET signals_collected_at'))
      expect(call).toBeDefined()
      const [, params] = call as [string, unknown[]]
      expect(params[0]).toBeInstanceOf(Date)
      expect(params[1]).toBe('acc-1')
    })

    // #3219 (#190.2, lot P02 07/10) — le premier écrivain RÉEL de `scope` :
    // `applyResearch` rend la claim à son appelant (`AnalysisPersistenceService`,
    // qui seul peut journaliser via `ProvenanceService`, hors du périmètre
    // GA-07 de ce module). Sans `scopeMode` (l'immense majorité des runs
    // aujourd'hui) : aucune lecture supplémentaire, aucune claim — byte
    // identique à avant ce lot.
    describe('employeesScopeClaim (#3219)', () => {
      it('sans scopeMode, ne lit rien de plus et ne rend aucune claim', async () => {
        const result = await service.applyResearch('acc-1', baseResearch)
        expect(repo.findOne).not.toHaveBeenCalled()
        expect(result?.employeesScopeClaim).toBeUndefined()
      })

      it('avec un scopeMode connu et un effectif qui change, rend la claim avant/après', async () => {
        repo.findOne.mockResolvedValueOnce({ employees: '500 000' } as never)
        const result = await service.applyResearch('acc-1', { ...baseResearch, scopeMode: 'business_unit' } as never)
        expect(result?.employeesScopeClaim).toEqual({
          oldValue: '500 000',
          newValue: '100k',
          scope: 'Business unit',
        })
      })

      it('un effectif inchangé ne rend aucune claim (rien de neuf à journaliser)', async () => {
        repo.findOne.mockResolvedValueOnce({ employees: '100k' } as never)
        const result = await service.applyResearch('acc-1', { ...baseResearch, scopeMode: 'groupe' } as never)
        expect(result?.employeesScopeClaim).toBeUndefined()
      })

      it('un scopeMode hors vocabulaire ne rend aucune claim (jamais un libellé inventé)', async () => {
        repo.findOne.mockResolvedValueOnce({ employees: '500 000' } as never)
        const result = await service.applyResearch('acc-1', { ...baseResearch, scopeMode: 'n’importe quoi' } as never)
        expect(result?.employeesScopeClaim).toBeUndefined()
      })
    })

    /**
     * GA-96 — un dossier ne change JAMAIS de société.
     *
     * Reproduit le défaut du 30/08/2026 mesuré en production : le compte ROCHE
     * portait `552012031` (le laboratoire pharmaceutique) ; « Actualiser
     * l'analyse » a relancé une résolution PAR NOM, le registre a rendu
     * `493229280` (ROCHE BOBOIS, distributeur de meubles), et `applyResearch`
     * l'a estampillé sur le MÊME dossier — avec les contacts et les angles du
     * laboratoire fusionnés dedans.
     *
     * `applyResearch` est le DERNIER point de passage commun à tous les chemins
     * de rafraîchissement (relance depuis la fiche, depuis la liste, reprise,
     * rafraîchissement par dimension, MCP, opérateur en `force`). C'est donc ici
     * que le refus doit vivre — un refus posé plus haut ne garderait qu'un
     * appelant sur six.
     */
    describe("l'identité d'un dossier ne se réécrit pas (GA-96)", () => {
      /** Le dossier tel qu'il est en base AVANT le run qu'on relance. */
      const dossierPortant = (siren: string | null) => {
        repo.findOne.mockResolvedValue({ id: 'acc-1', company_name: 'ROCHE', siren } as never)
      }

      it("REFUSE d'écrire un SIREN différent de celui du dossier, et NE touche à RIEN", async () => {
        dossierPortant('552012031') // ROCHE — le laboratoire

        await expect(
          // Ce que la résolution par nom a rendu : ROCHE BOBOIS.
          service.applyResearch('acc-1', { ...baseResearch, siren: '493229280' }),
        ).rejects.toThrow(/identity_mismatch/)

        // Le refus est TOTAL : ni le SIREN, ni le secteur, ni le blob d'analyse
        // de l'autre société n'ont été écrits. Fusionner « juste les faits »
        // serait le même défaut en plus discret.
        expect(repo.update).not.toHaveBeenCalled()
        expect(repo.manager.query.mock.calls.some(([sql]) => String(sql).includes('SET raw_analysis'))).toBe(false)
      })

      it("n'ARCHIVE pas le dossier de l'autre société quand il refuse", async () => {
        // La requête d'archivage est l'arme la plus dangereuse de ce chemin :
        // elle passe `status = 'archived'` sur TOUT compte de l'espace portant
        // le SIREN entrant. Déclenchée sur une identité refusée, elle mettrait
        // au rebut le dossier LÉGITIME de Roche Bobois pour laisser la place à
        // une usurpation qu'on est justement en train de refuser.
        dossierPortant('552012031')

        await expect(service.applyResearch('acc-1', { ...baseResearch, siren: '493229280' })).rejects.toThrow()

        const archivages = repo.manager.query.mock.calls.filter(([sql]) =>
          String(sql).includes("SET status = 'archived'"),
        )
        expect(archivages).toHaveLength(0)
      })

      it('nomme les DEUX identités dans le refus, pour que le message soit lisible', async () => {
        dossierPortant('552012031')

        const refus = await service
          .applyResearch('acc-1', { ...baseResearch, siren: '493229280' })
          .then(() => null)
          .catch((err: Error) => err)

        expect(refus).toBeInstanceOf(Error)
        // La forme est celle du contrat partagé — écrite et relue au même
        // endroit, donc le front ne peut pas diverger.
        expect(parseIdentityMismatchMessage((refus as Error).message)).toEqual({
          expected: '552012031',
          resolved: '493229280',
        })
      })

      it('ACCEPTE le même SIREN écrit autrement (« 552 012 031 » n’est pas une autre société)', async () => {
        // Un refus qui se déclenche sur une mise en forme perdrait en un jour
        // toute la confiance qu'on lui accorde : Pappers rend le SIREN espacé,
        // la colonne le stocke compact.
        dossierPortant('552 012 031')

        await expect(service.applyResearch('acc-1', { ...baseResearch, siren: '552012031' })).resolves.toEqual({
          employeesScopeClaim: undefined,
        })
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect(patch['siren']).toBe('552012031')
      })

      it("ACCEPTE de POSER une identité sur un dossier qui n'en a pas encore", async () => {
        // Le cas légitime : un compte créé à la main, ou une première analyse.
        // Le refus porte sur le REMPLACEMENT d'une identité, jamais sur sa pose.
        dossierPortant(null)

        await expect(service.applyResearch('acc-1', { ...baseResearch, siren: '493229280' })).resolves.toEqual({
          employeesScopeClaim: undefined,
        })
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect(patch['siren']).toBe('493229280')
      })
    })

    /**
     * #2671 — revue sécurité du cloisonnement par espace : ces trois lectures
     * de compte par id (`refuseIdentityRewrite`, `arbitrate`, `getPriorityScore`)
     * n'étaient pas bornées par `workspace_id`. La chaîne d'appel de chacune
     * passe déjà par un `findOne(id, userId)` scopé AVANT d'atteindre ce point
     * (aucune exploitation démontrée) — mais la garantie tenait sur la
     * discipline de CHAQUE appelant, jamais sur la fonction elle-même.
     *
     * Un test qui vérifie seulement que le cas normal marche encore ne prouve
     * rien : ces trois-là posent DEUX espaces et prouvent que lire l'id d'un
     * dossier de l'espace A depuis l'espace B ne rend RIEN.
     */
    describe('#2671 — les trois lectures de compte portent leur borne d’espace', () => {
      /** Simule la contrainte réelle : la ligne n'existe QUE pour son vrai `workspace_id`. */
      const workspaceScopedFindOne = (row: Record<string, unknown>, ownerWorkspaceId: string) =>
        jest.fn((query: { where: { workspace_id?: unknown } }) =>
          Promise.resolve(query.where.workspace_id === ownerWorkspaceId ? row : null),
        )

      it('refuseIdentityRewrite : le dossier ROCHE de l’espace A est invisible depuis l’espace B — le refus ne se déclenche pas sur une identité qu’on n’a pas pu lire', async () => {
        repo.findOne.mockImplementation(
          workspaceScopedFindOne({ id: 'acc-1', company_name: 'ROCHE', siren: '552012031' }, 'ws-A') as never,
        )

        // Espace A (le vrai propriétaire) : l'identité entrante diffère → REFUS.
        await expect(
          service.applyResearch('acc-1', { ...baseResearch, siren: '493229280' }, undefined, { workspaceId: 'ws-A' }),
        ).rejects.toThrow(/identity_mismatch/)

        // Espace B, SUR LE MÊME id : la lecture rend `null` (borne d'espace
        // absente du dossier). La comparaison ne peut matériellement pas avoir
        // lieu, donc AUCUN refus ne se déclenche — la preuve que la lecture est
        // bien bornée, pas seulement que le refus marche.
        await expect(
          service.applyResearch('acc-1', { ...baseResearch, siren: '493229280' }, undefined, { workspaceId: 'ws-B' }),
        ).resolves.toEqual({ employeesScopeClaim: undefined })
      })

      it('arbitrate : une correction humaine du dossier de l’espace A ne protège RIEN quand on arbitre depuis l’espace B', async () => {
        const fieldProvenance = {
          find: jest
            .fn()
            .mockResolvedValue([{ entity_type: 'account', entity_id: 'acc-1', field: 'sector', source: 'human' }]),
        }
        const scopedRepo = createMockRepository<AccountEntity>()
        scopedRepo.findOne.mockImplementation(
          workspaceScopedFindOne({ id: 'acc-1', sector: 'Assurance', employees: '90k' }, 'ws-A') as never,
        )
        const svc = new AccountsService(
          scopedRepo as never,
          ia as never,
          workspaceContext as never,
          esnProfile as never,
          undefined,
          undefined,
          undefined,
          fieldProvenance as never,
        )

        // Espace A : la correction humaine est lue, le champ `sector` est protégé.
        await svc.applyResearch('acc-1', baseResearch, undefined, { workspaceId: 'ws-A' })
        const [, patchA] = scopedRepo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect('sector' in patchA).toBe(false)

        // Espace B, MÊME id : la lecture du dossier courant rend `null` —
        // l'arbitre ne peut PAS protéger un champ qu'il n'a pas pu lire, et
        // laisse passer le patch frais tel quel.
        await svc.applyResearch('acc-1', baseResearch, undefined, { workspaceId: 'ws-B' })
        const [, patchB] = scopedRepo.update.mock.calls[1] as [unknown, Record<string, unknown>]
        expect(patchB['sector']).toBe('Banque')
      })

      it('getPriorityScore : le score du dossier de l’espace A est illisible depuis l’espace B', async () => {
        repo.findOne.mockImplementation(workspaceScopedFindOne({ priority_score: 17 }, 'ws-A') as never)

        await expect(service.getPriorityScore('acc-1', 'ws-A')).resolves.toBe(17)
        await expect(service.getPriorityScore('acc-1', 'ws-B')).resolves.toBeNull()
      })
    })

    it('persists the SEC/EDGAR (US) financials into raw_analysis.us_sec_financials (snake_case passthrough)', async () => {
      await service.applyResearch('acc-1', {
        ...baseResearch,
        usSecFinancials: {
          cik: '0001352010',
          filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010&type=10-K',
          detailUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010',
          revenues: [{ end: '2025-12-31', val: 5457056000, filed: '2026-02-26' }],
          netIncome: [{ end: '2025-12-31', val: 377678000, filed: '2026-02-26' }],
          sharesOutstanding: { end: '2026-04-30', val: 52244451, filed: '2026-02-26' },
          filings: [
            {
              form: '10-K',
              date: '2026-02-26',
              title: 'SEC 10-K du 2026-02-26',
              url: 'https://www.sec.gov/Archives/edgar/data/1352010/x.htm',
            },
          ],
        },
      })
      const sec = writtenRawAnalysis()['us_sec_financials'] as Record<string, unknown>
      expect(sec).toBeDefined()
      expect(sec['cik']).toBe('0001352010')
      expect(sec['filing_url']).toContain('type=10-K')
      expect(sec['detail_url']).toContain('CIK=0001352010')
      expect(sec['revenues']).toEqual([{ end: '2025-12-31', val: 5457056000, filed: '2026-02-26' }])
      expect(sec['net_income']).toEqual([{ end: '2025-12-31', val: 377678000, filed: '2026-02-26' }])
      expect(sec['shares_outstanding']).toEqual({ end: '2026-04-30', val: 52244451, filed: '2026-02-26' })
      expect((sec['filings'] as Array<Record<string, unknown>>)[0]?.['url']).toContain('/Archives/edgar/data/1352010/')
    })

    it('does NOT add a us_sec_financials key on a run without SEC financials (FR / private company)', async () => {
      await service.applyResearch('acc-1', baseResearch)
      expect('us_sec_financials' in writtenRawAnalysis()).toBe(false)
    })

    it('persists the NAF code when present, skips the key otherwise (Théo p.41)', async () => {
      await service.applyResearch('acc-1', { ...baseResearch, nafCode: '64.19Z' })
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(patch['naf_code']).toBe('64.19Z')

      repo.update.mockClear()
      await service.applyResearch('acc-1', baseResearch)
      const [, patch2] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect('naf_code' in patch2).toBe(false)
    })

    it('persists actor_type + is_intermediary when present, skips both otherwise (#2265.14)', async () => {
      await service.applyResearch('acc-1', {
        ...baseResearch,
        actorType: 'cabinet de recrutement',
        isIntermediary: true,
      })
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(patch['actor_type']).toBe('cabinet de recrutement')
      expect(patch['is_intermediary']).toBe(true)

      repo.update.mockClear()
      await service.applyResearch('acc-1', baseResearch)
      const [, patch2] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect('actor_type' in patch2).toBe(false)
      expect('is_intermediary' in patch2).toBe(false)
    })

    it('never invents `false` for is_intermediary when actorType names a client final (absent flag)', async () => {
      await service.applyResearch('acc-1', { ...baseResearch, actorType: 'client final' })
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(patch['actor_type']).toBe('client final')
      expect(patch['is_intermediary']).toBe(false)
    })

    it('persists the Apollo enrichment block + lifts the real logo onto logo_url', async () => {
      await service.applyResearch('acc-1', {
        ...baseResearch,
        apolloEnrichment: {
          domain: 'socgen.com',
          logoUrl: 'https://cdn.apollo.io/logos/socgen.png',
          estimatedNumEmployees: 117000,
          industry: 'banking',
          foundedYear: 1864,
          technologies: ['Salesforce', 'AWS'],
        },
      })
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(patch['logo_url']).toBe('https://cdn.apollo.io/logos/socgen.png')
      expect(patch['apollo_enrichment']).toEqual(
        expect.objectContaining({ industry: 'banking', estimatedNumEmployees: 117000 }),
      )
    })

    it('does NOT write logo_url when the Apollo block carries no logo', async () => {
      await service.applyResearch('acc-1', {
        ...baseResearch,
        apolloEnrichment: { domain: 'socgen.com', industry: 'banking' },
      })
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect('logo_url' in patch).toBe(false)
      expect(patch['apollo_enrichment']).toEqual(expect.objectContaining({ industry: 'banking' }))
    })

    it('does NOT erase a stored enrichment when a later research pass omits the block', async () => {
      await service.applyResearch('acc-1', baseResearch)
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect('apollo_enrichment' in patch).toBe(false)
      expect('logo_url' in patch).toBe(false)
    })

    it('archives an older same-siren account in the workspace before stamping the SIREN (Théo p.18)', async () => {
      await service.applyResearch('acc-1', { ...baseResearch, siren: '552120222' })
      const dedup = repo.manager.query.mock.calls.find(c => String(c[0]).includes("SET status = 'archived'"))
      expect(dedup).toBeTruthy()
      expect(dedup?.[1]).toEqual(['552120222', 'acc-1'])
    })

    it('does NOT run the dedup query when no siren is resolved', async () => {
      await service.applyResearch('acc-1', baseResearch)
      const dedup = repo.manager.query.mock.calls.find(c => String(c[0]).includes("SET status = 'archived'"))
      expect(dedup).toBeFalsy()
    })

    // #2165.24 / #2166.3 / #2165.16 — lien capitalistique, dérivé du même
    // graphe Pappers que la recherche Phase 1 a déjà chargé (aucun appel
    // supplémentaire dans l'immense majorité des cas).
    describe('group affiliation (#2165.24 / #2166.3 / #2165.16)', () => {
      it('persists the role + head SIREN when the IA resolved one', async () => {
        ia.groupAffiliation.mockResolvedValueOnce({ role: 'filiale', headSiren: '222222222', headName: 'BOUYGUES' })
        await service.applyResearch('acc-1', { ...baseResearch, siren: '326300159' })
        expect(ia.groupAffiliation).toHaveBeenCalledWith('326300159')
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect(patch['group_head_siren']).toBe('222222222')
        expect(patch['group_role']).toBe('filiale')
        expect(patch['group_link_source']).toBe('pappers')
        expect(patch['group_link_observed_at']).toBeInstanceOf(Date)
      })

      it('does NOT call the IA and does NOT write group columns when no siren is resolved', async () => {
        await service.applyResearch('acc-1', baseResearch)
        expect(ia.groupAffiliation).not.toHaveBeenCalled()
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect('group_head_siren' in patch).toBe(false)
        expect('group_role' in patch).toBe(false)
      })

      it('does NOT erase a stored link when the IA cannot resolve one this time (never a devinée false negative)', async () => {
        ia.groupAffiliation.mockResolvedValueOnce(null)
        await service.applyResearch('acc-1', { ...baseResearch, siren: '326300159' })
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect('group_head_siren' in patch).toBe(false)
        expect('group_role' in patch).toBe(false)
        expect('group_link_source' in patch).toBe(false)
        expect('group_link_observed_at' in patch).toBe(false)
      })

      // #4616 — l'appel HTTP à l'IA (jusqu'à 5 s) partait SOUS la transaction de `saveResearch` : la connexion
      // restait tenue pour rien. L'appelant le fait désormais AVANT et passe la réponse.
      it('#4616 — affiliation déjà lue par l’appelant : écrite, et l’IA n’est PAS rappelée', async () => {
        await service.applyResearch('acc-1', { ...baseResearch, siren: '326300159' }, undefined, {
          groupAffiliation: { role: 'filiale', headSiren: '222222222', headName: 'BOUYGUES' },
        })
        expect(ia.groupAffiliation).not.toHaveBeenCalled()
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect(patch['group_head_siren']).toBe('222222222')
        expect(patch['group_role']).toBe('filiale')
      })

      it('#4616 — affiliation lue et vide (null) : rien d’écrit, l’IA n’est PAS rappelée', async () => {
        await service.applyResearch('acc-1', { ...baseResearch, siren: '326300159' }, undefined, {
          groupAffiliation: null,
        })
        expect(ia.groupAffiliation).not.toHaveBeenCalled()
        const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
        expect('group_head_siren' in patch).toBe(false)
      })
    })
  })

  describe('applyResearch — registre international (registry_id / registry_country)', () => {
    const baseResearch = {
      sector: 'IT services',
      employees: '50k',
      revenue: '4,8 Md$',
      headquarters: 'Newtown, PA',
      website: 'https://epam.com',
      subsidiaries: [],
      itChallenges: [],
      recentSignals: [],
      priorityScore: 8,
      priorityJustification: 'Top target',
      angles: [],
    }

    it('persists the CANONICAL registry id when a non-FR pack resolved one (CH display form)', async () => {
      await service.applyResearch('acc-1', { ...baseResearch, registryId: 'CHE-105.944.452', registryCountry: 'CH' })
      const [where, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect(where).toEqual({ id: 'acc-1' })
      expect(patch['registry_id']).toBe('CHE105944452')
      expect(patch['registry_country']).toBe('CH')
    })

    it('même CIK → même compte canonique : archives the older same-CIK account of the workspace (US)', async () => {
      // Two runs resolving the same SEC registrant collapse to ONE active
      // canonical account per workspace: the older row is archived before the
      // newest run stamps the (canonicalised, zero-padded) CIK.
      await service.applyResearch('acc-2', { ...baseResearch, registryId: 'CIK 1352010', registryCountry: 'US' })
      const dedup = repo.manager.query.mock.calls.find(c => String(c[0]).includes('a.registry_id = $2'))
      expect(dedup).toBeTruthy()
      expect(String(dedup?.[0])).toContain("SET status = 'archived'")
      expect(dedup?.[1]).toEqual(['US', '0001352010', 'acc-2'])
    })

    it('même UID → même compte canonique : dedup keyed on (registry_country, registry_id) (CH)', async () => {
      await service.applyResearch('acc-3', { ...baseResearch, registryId: 'CHE-105.944.452', registryCountry: 'CH' })
      const dedup = repo.manager.query.mock.calls.find(c => String(c[0]).includes('a.registry_country = $1'))
      expect(dedup?.[1]).toEqual(['CH', 'CHE105944452', 'acc-3'])
    })

    it('skips persistence AND dedup on a malformed identifier (never a mangled id)', async () => {
      await service.applyResearch('acc-1', { ...baseResearch, registryId: 'not-a-cik', registryCountry: 'US' })
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect('registry_id' in patch).toBe(false)
      expect('registry_country' in patch).toBe(false)
      expect(repo.manager.query.mock.calls.find(c => String(c[0]).includes('registry_id'))).toBeFalsy()
    })

    it('refuses to route FR through the registry columns (the siren path owns FR)', async () => {
      await service.applyResearch('acc-1', { ...baseResearch, registryId: '552120222', registryCountry: 'FR' })
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      expect('registry_id' in patch).toBe(false)
      expect(repo.manager.query.mock.calls.find(c => String(c[0]).includes('registry_id'))).toBeFalsy()
    })

    it('création/écriture FR inchangée byte-identique : a SIREN-only payload produces the exact legacy patch', async () => {
      await service.applyResearch('acc-1', { ...baseResearch, siren: '552120222' })
      const [, patch] = repo.update.mock.calls[0] as [unknown, Record<string, unknown>]
      // The exact legacy key set — no registry_* key may appear on the FR path.
      // `raw_analysis` n'y figure plus : le blob part par une FUSION JSONB, et
      // c'est tout le correctif — le patch le REMPLAÇAIT.
      expect(Object.keys(patch).sort()).toEqual([
        'employees',
        'headquarters',
        'it_challenges',
        'priority_justification',
        'priority_score',
        'recent_signals',
        'revenue',
        'sector',
        'siren',
        'subsidiaries',
        'website',
      ])
      // And exactly ONE archive statement fired: the legacy siren dedup.
      const archives = repo.manager.query.mock.calls.filter(c => String(c[0]).includes("SET status = 'archived'"))
      expect(archives).toHaveLength(1)
      expect(archives[0]?.[1]).toEqual(['552120222', 'acc-1'])
    })
  })

  describe('findCompletedByUserAndCompany', () => {
    it('returns the most recent completed account for the user+company within the window', async () => {
      const fresh = { id: 'acc-fresh', status: 'completed' } as AccountEntity
      repo._qb.getOne.mockResolvedValueOnce(fresh)
      const result = await service.findCompletedByUserAndCompany('u-1', 'Société Générale')
      expect(result).toBe(fresh)
      // Scoped by WORKSPACE (a teammate's fresh dossier is reused) and status=completed.
      expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
      expect(repo._qb.where).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status = :status', { status: 'completed' })
      // Case-insensitive company match (free-text form may differ in case).
      expect(repo._qb.andWhere).toHaveBeenCalledWith('LOWER(account.company_name) = LOWER(:companyName)', {
        companyName: 'Société Générale',
      })
      // Freshness window on updated_at (reused as refreshed_at).
      const cutoffCall = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes('updated_at'))
      expect(cutoffCall).toBeDefined()
    })

    it('matches by SIREN when one is provided (preferred over company name)', async () => {
      const fresh = { id: 'acc-siren', status: 'completed' } as AccountEntity
      repo._qb.getOne.mockResolvedValueOnce(fresh)
      const result = await service.findCompletedByUserAndCompany('u-1', 'Société Générale', { siren: '552120222' })
      expect(result).toBe(fresh)
      const sirenCall = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes('account.siren'))
      expect(sirenCall).toEqual(['account.siren = :siren', { siren: '552120222' }])
    })

    it('returns null when nothing matches', async () => {
      repo._qb.getOne.mockResolvedValueOnce(null)
      const result = await service.findCompletedByUserAndCompany('u-1', 'Ghost Corp')
      expect(result).toBeNull()
    })

    it('fails open (returns null) on a DB error', async () => {
      repo._qb.getOne.mockRejectedValueOnce(new Error('DB blip'))
      const result = await service.findCompletedByUserAndCompany('u-1', 'Société Générale')
      expect(result).toBeNull()
    })

    // #2284.20 / #2284.1 — le DOMAINE comme clé de résolution, AVANT la création :
    // taper « thalesgroup.com » retrouve le compte dont le site est ce domaine,
    // au lieu d'empiler un second dossier « thalesgroup.com ».
    it('#2284.20 — une saisie qui EST un domaine se résout aussi par le site du compte', async () => {
      repo._qb.getOne.mockResolvedValueOnce(null)
      await service.findCompletedByUserAndCompany('u-1', 'https://www.thalesgroup.com/fr')
      const domainCall = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes(':domain'))
      expect(domainCall?.[1]).toMatchObject({ domain: 'thalesgroup.com' })
      expect(String(domainCall?.[0])).toContain('account.website')
    })

    it('#2284.20 — un nom n’est jamais pris pour un domaine (aucun rapprochement par site)', async () => {
      repo._qb.getOne.mockResolvedValueOnce(null)
      await service.findCompletedByUserAndCompany('u-1', 'Capgemini S.A.')
      expect(repo._qb.andWhere.mock.calls.some(c => String(c[0]).includes(':domain'))).toBe(false)
    })
  })

  describe('findAnalyzingByUserAndCompany — #2284.20', () => {
    it('une saisie qui EST un domaine retrouve aussi l’analyse en vol par le site du compte', async () => {
      repo._qb.getOne.mockResolvedValueOnce(null)
      await service.findAnalyzingByUserAndCompany('u-1', 'thalesgroup.com')
      const domainCall = repo._qb.andWhere.mock.calls.find(c => String(c[0]).includes(':domain'))
      expect(domainCall?.[1]).toMatchObject({ domain: 'thalesgroup.com' })
    })
  })

  describe('listActiveAnalysisRuns (#2145.9, #2100.9 — le job en cours, mis en avant)', () => {
    const seed: Row[] = [
      {
        id: 'running-old',
        user_id: 'u1',
        workspace_id: 'w1',
        company_name: 'Thales',
        status: 'analyzing',
        created_at: '2026-09-26T07:00:00.000Z',
        updated_at: '2026-09-26T07:00:00.000Z',
      },
      {
        id: 'running-new',
        user_id: 'u1',
        workspace_id: 'w1',
        company_name: 'Orange',
        status: 'analyzing',
        created_at: '2026-09-26T08:30:00.000Z',
        updated_at: '2026-09-26T08:30:00.000Z',
      },
      {
        id: 'done',
        user_id: 'u1',
        workspace_id: 'w1',
        company_name: 'Capgemini',
        status: 'completed',
        created_at: '2026-09-25T00:00:00.000Z',
        updated_at: '2026-09-25T00:00:00.000Z',
      },
      {
        id: 'other-workspace',
        user_id: 'u2',
        workspace_id: 'w2',
        company_name: 'Sopra',
        status: 'analyzing',
        created_at: '2026-09-26T08:00:00.000Z',
        updated_at: '2026-09-26T08:00:00.000Z',
      },
    ]

    it('ne rend que les comptes EN ANALYSE de MON espace, le plus ancien job en tête', async () => {
      const memRepo = createInMemoryAccountsRepo(seed)
      const svc = new AccountsService(memRepo as never, ia as never, workspaceContext as never, esnProfile as never)

      const result = await svc.listActiveAnalysisRuns('w1')

      expect(result.map(r => r.id)).toEqual(['running-old', 'running-new'])
      expect(result.every(r => r.company_name !== 'Capgemini')).toBe(true)
      expect(result.some(r => r.company_name === 'Sopra')).toBe(false)
    })

    it('ne pose aucune ligne quand aucun job ne tourne dans l’espace — jamais une donnée inventée', async () => {
      const memRepo = createInMemoryAccountsRepo(seed.filter(r => r.status !== 'analyzing'))
      const svc = new AccountsService(memRepo as never, ia as never, workspaceContext as never, esnProfile as never)

      expect(await svc.listActiveAnalysisRuns('w1')).toEqual([])
    })
  })

  describe('computeAgeDays', () => {
    it('returns whole days elapsed since refreshedAt', () => {
      const refreshedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      expect(service.computeAgeDays(refreshedAt)).toBe(3)
    })

    it('returns 0 for a just-refreshed account', () => {
      expect(service.computeAgeDays(new Date())).toBe(0)
    })

    it('returns null when no date is available', () => {
      expect(service.computeAgeDays(null)).toBeNull()
    })
  })

  describe('refreshResearch', () => {
    it('persists fresh research and bumps updated_at via applyResearch + markCompleted', async () => {
      // applyResearch is delegated; refreshResearch re-uses it then re-flips
      // status to completed so updated_at (refreshed_at) is bumped.
      const applySpy = jest.spyOn(service, 'applyResearch').mockResolvedValue({})
      const markSpy = jest.spyOn(service, 'markCompleted').mockResolvedValue(undefined)
      const data = {
        sector: 'Banque',
        employees: '100k',
        revenue: '',
        headquarters: '',
        website: '',
        subsidiaries: [],
        itChallenges: [],
        recentSignals: [],
        priorityScore: 8,
        priorityJustification: '',
        angles: [],
        siren: '552120222',
      }
      await service.refreshResearch('acc-1', data, 'ws-1')
      // Research-only refresh must NOT rewrite priority_score (phase 4 didn't
      // re-run) so it can't revert the reconciled /25-derived column.
      // #2671 — `workspaceId` voyage jusqu'aux deux lectures internes.
      expect(applySpy).toHaveBeenCalledWith('acc-1', data, undefined, { writePriority: false, workspaceId: 'ws-1' })
      expect(markSpy).toHaveBeenCalledWith('acc-1')
    })
  })

  describe('listPersonalAccounts (personal cockpit)', () => {
    it('scopes to accounts I OWN (assigned_to) inside my workspace and maps them', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          id: 'a1',
          company_name: 'ACME',
          sector: 'IT',
          employees: 100,
          priority_score: 8,
          priority_justification: 'Gros budget',
          recent_signals: [],
          status: 'completed',
          created_at: '2026-07-01T00:00:00.000Z',
        },
      ] as never)

      const result = await service.listPersonalAccounts('user-1', 'ws-1')

      // ⚠️ #1408 — MON PORTEFEUILLE, c'est-à-dire ce dont je suis RESPONSABLE
      // (`assigned_to`), et non ce que j'ai créé (`user_id`). Ce test attendait
      // le créateur, et il avait raison de le faire : c'était la portée du jour
      // où il a été écrit. Le défaut n'était pas ici — il était plus bas, dans
      // une création de compte qui ne posait jamais de responsable, si bien que
      // le cockpit et `/comptes` répondaient deux populations sous un seul mot.
      expect(repo._qb.where).toHaveBeenCalledWith('account.assigned_to = :userId', { userId: 'user-1' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status <> :deletedStatus', { deletedStatus: 'deleted' })
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ id: 'a1', company_name: 'ACME', priority_justification: 'Gros budget' })
    })

    it('fails soft to [] on a query error', async () => {
      repo._qb.getRawMany.mockRejectedValueOnce(new Error('boom'))
      await expect(service.listPersonalAccounts('user-1', 'ws-1')).resolves.toEqual([])
    })
  })

  describe('accountsAssignedTo — #3094 les comptes d’un membre NOMMÉ (« quels sont les comptes de <membre> ? »)', () => {
    it('reuses the SAME scope as "mes comptes" (assigned_to), for an arbitrary member', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([{ id: 'a1', company_name: 'ACME', sector: 'IT' }] as never)

      const result = await service.accountsAssignedTo('member-2', 'ws-1', 10)

      expect(repo._qb.where).toHaveBeenCalledWith('account.assigned_to = :userId', { userId: 'member-2' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.status <> :deletedStatus', { deletedStatus: 'deleted' })
      expect(repo._qb.limit).toHaveBeenCalledWith(10)
      expect(result).toEqual([{ id: 'a1', company_name: 'ACME', sector: 'IT' }])
    })
  })

  describe('logo projection on the cockpit lists', () => {
    // `dashboardAccountInsightSchema` already carries `logo_url`/`website` (inherited
    // from `accountListItemSchema`), but the two cockpit queries never selected
    // them — so the Cockpit card rendered initials while the accounts list
    // showed the real logo. Same columns, same query: no extra round-trip.
    const row = {
      id: 'a1',
      company_name: 'ACME',
      sector: 'IT',
      employees: 100,
      priority_score: 8,
      priority_justification: 'Gros budget',
      recent_signals: [],
      status: 'completed',
      created_at: '2026-07-01T00:00:00.000Z',
      logo_url: 'https://zenprospect-production.s3.amazonaws.com/uploads/a/logo.png',
      website: 'https://acme.com',
    }

    it('selects and maps the logo columns for the team cockpit', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([row] as never)
      const result = await service.listDashboardAccounts('user-1')
      const selected = repo._qb.select.mock.calls.at(-1)?.[0] as string[]
      expect(selected).toEqual(expect.arrayContaining(['account.logo_url AS logo_url', 'account.website AS website']))
      expect(result[0]).toMatchObject({ logo_url: row.logo_url, website: row.website })
    })

    it('selects and maps the logo columns for the personal cockpit', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([row] as never)
      const result = await service.listPersonalAccounts('user-1', 'ws-1')
      const selected = repo._qb.select.mock.calls.at(-1)?.[0] as string[]
      expect(selected).toEqual(expect.arrayContaining(['account.logo_url AS logo_url', 'account.website AS website']))
      expect(result[0]).toMatchObject({ logo_url: row.logo_url, website: row.website })
    })

    it('leaves the fields null when the account has no logo — never invents one', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([{ ...row, logo_url: null, website: null }] as never)
      const result = await service.listDashboardAccounts('user-1')
      expect(result[0]).toMatchObject({ logo_url: null, website: null })
    })
  })

  // Historique de signal (restitution V2 §11) : le flux de veille porte la DATE
  // DE PREMIÈRE DÉTECTION par Bellum, pas seulement la date de la nouvelle.
  describe('listAccountSignals', () => {
    const accountRow = {
      id: 'acc-1',
      company_name: 'SNCF',
      sector: 'Transport',
      priority_score: 8,
      created_at: '2026-01-05T00:00:00.000Z',
      recent_signals: [{ signal: 'Levée de fonds', date: '2026-07-02', source: 'Les Échos', type: 'funding' }],
    }

    function serviceWithHistory(rows: unknown[]): AccountsService {
      const signalHistory = { listForWorkspace: jest.fn().mockResolvedValue(rows) }
      return new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        signalHistory as never,
      )
    }

    // P5 (29/09) — `GET /accounts/signals` mesuré à 1,4-1,8 s : profil vendeur,
    // lecture des comptes et historique des signaux s'enchaînaient. Plafond : 3
    // lectures, en vol ENSEMBLE (pic 3 ; l'ancien code donnait 1).
    it('P5 — profil, comptes et historique en vol ensemble (3 lectures, pic 3)', async () => {
      let inFlight = 0
      let peak = 0
      let started = 0
      const flight = async <T>(value: T): Promise<T> => {
        started += 1
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise(resolve => setImmediate(resolve))
        inFlight -= 1
        return value
      }
      repo._qb.getRawMany.mockImplementationOnce(() => flight([accountRow] as never))
      esnProfile.resolveProfileData.mockImplementationOnce(() => flight({}))
      const signalHistory = { listForWorkspace: jest.fn(() => flight([])) }
      const svc = new AccountsService(
        repo as never,
        ia as never,
        workspaceContext as never,
        esnProfile as never,
        signalHistory as never,
      )

      await svc.listAccountSignals('ws-1', 'user-1')

      expect(started).toBe(3)
      expect(peak).toBe(3)
    })

    // #3915.decp — un marché public attribué lu en continu pour le SIREN du compte est un signal
    // daté de la Veille, donc de Laura (`get_account_signals` lit cette liste) — sans second moteur.
    it('#3915.decp — ajoute les marchés publics attribués du SIREN, datés, source nommée par sa nature', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([{ ...accountRow, siren: '552049447' }] as never)
      repo.manager.query.mockResolvedValueOnce([
        {
          siren: '552049447',
          source: 'decp',
          kind: 'award',
          family_label: 'TMA billettique',
          label: 'Acme SA',
          published_on: new Date().toISOString().slice(0, 10),
          url: null,
          tribunal: null,
        },
      ] as never)
      const svc = serviceWithHistory([])

      const items = await svc.listAccountSignals('ws-1')

      expect(items.map(i => [i.label, i.source])).toEqual(
        expect.arrayContaining([
          ['Marché attribué — TMA billettique (titulaire : Acme SA)', 'Marchés publics attribués'],
        ]),
      )
      const where = repo._qb.andWhere.mock.calls.map(call => String(call[0])).join(' ')
      expect(where).toContain("r.source = 'decp'")
    })

    it('attaches the persisted history to the matching signal', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)
      const svc = serviceWithHistory([
        {
          account_id: 'acc-1',
          // Identité = libellé normalisé : la casse du blob n'empêche pas la jointure.
          signal_key: 'levée de fonds',
          first_detected_at: new Date('2026-06-01T08:00:00.000Z'),
          first_detection_exact: true,
          last_seen_at: new Date('2026-07-20T05:20:00.000Z'),
          last_changed_at: null,
          change_count: 2,
          status: 'active',
          resolved_at: null,
        },
      ])

      const [signal] = await svc.listAccountSignals('ws-1')

      expect(signal).toMatchObject({
        // La date DE LA NOUVELLE reste ce que l'IA a produit…
        date: '2026-07-02',
        // …et la date de PREMIÈRE DÉTECTION vient de l'historique.
        first_detected_at: '2026-06-01T08:00:00.000Z',
        first_detection_exact: true,
        last_seen_at: '2026-07-20T05:20:00.000Z',
        change_count: 2,
        history_status: 'active',
      })
    })

    // Théo L1 — sélecteur avancé — l'identifiant de la ligne voyage : c'est par
    // lui qu'une offre d'emploi se désigne comme périmètre de Laura.
    it('attaches the history row id (Théo L1 — job_offer scope)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)
      const svc = serviceWithHistory([
        {
          id: '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11',
          account_id: 'acc-1',
          signal_key: 'levée de fonds',
          first_detected_at: new Date('2026-06-01T08:00:00.000Z'),
          first_detection_exact: true,
          last_seen_at: new Date('2026-07-20T05:20:00.000Z'),
          last_changed_at: null,
          change_count: 0,
          status: 'active',
          resolved_at: null,
        },
      ])

      const [signal] = await svc.listAccountSignals('ws-1')

      expect(signal).toMatchObject({ history_id: '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11' })
    })

    it('attaches last_verified_at when the signal has been verified (#3206.2 partiel, épopée #3240)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)
      const svc = serviceWithHistory([
        {
          account_id: 'acc-1',
          signal_key: 'levée de fonds',
          first_detected_at: new Date('2026-06-01T08:00:00.000Z'),
          first_detection_exact: true,
          last_seen_at: new Date('2026-07-20T05:20:00.000Z'),
          last_changed_at: null,
          change_count: 2,
          status: 'active',
          resolved_at: null,
          last_verified_at: new Date('2026-07-25T09:00:00.000Z'),
        },
      ])

      const [signal] = await svc.listAccountSignals('ws-1')
      expect(signal).toMatchObject({ last_verified_at: '2026-07-25T09:00:00.000Z' })
    })

    it('leaves a signal untouched when it has no history row — never a guessed date', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)
      const svc = serviceWithHistory([
        {
          account_id: 'acc-1',
          signal_key: 'un autre signal',
          first_detected_at: new Date('2026-06-01T08:00:00.000Z'),
          first_detection_exact: true,
          last_seen_at: new Date('2026-06-01T08:00:00.000Z'),
          last_changed_at: null,
          change_count: 0,
          status: 'active',
          resolved_at: null,
        },
      ])

      const [signal] = await svc.listAccountSignals('ws-1')
      expect(signal?.first_detected_at).toBeUndefined()
    })

    it('still lists signals when the history module is absent (autonomous module, rule #7)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)
      const [signal] = await service.listAccountSignals('ws-1')
      expect(signal).toMatchObject({ label: 'Levée de fonds', account_id: 'acc-1' })
    })

    /**
     * #1424 — la LECTURE COMMERCIALE du signal voyage jusqu'à la Veille.
     *
     * Elle est produite par l'analyse, stockée dans `recent_signals`, semée en
     * démo, affichée sur la fiche compte et dans le PDF — et la projection de
     * `/accounts/signals` n'en retenait pas un mot. `/watchlist` affichait donc
     * la même phrase statique sous les deux cents signaux de l'espace.
     */
    it('projects the sales reading of the signal (#1424)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          ...accountRow,
          recent_signals: [
            {
              signal: 'Levée de fonds',
              date: '2026-07-02',
              sales_implication: 'Un tour de table finance des projets, pas des intentions.',
            },
          ],
        },
      ] as never)

      const [signal] = await service.listAccountSignals('ws-1')

      expect(signal?.sales_implication).toBe('Un tour de table finance des projets, pas des intentions.')
    })

    /**
     * #4756 — le lieu de l'offre voyage jusqu'au filtre « zone » de l'onglet Historique ; sans lieu publié, `null`
     * (jamais une ville devinée).
     */
    it('projects the location of an offer, null when the collector read none (#4756)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          ...accountRow,
          recent_signals: [
            { signal: 'Développeur Java', type: 'recrutement', location: 'Lille (59)' },
            { signal: 'Développeur PHP', type: 'recrutement' },
          ],
        },
      ] as never)

      const items = await service.listAccountSignals('ws-1')

      expect(items.map(item => item.location)).toEqual(['Lille (59)', null])
    })

    it('reads the camelCase spelling the IA also produces (#1424)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          ...accountRow,
          recent_signals: [{ signal: 'Levée de fonds', salesImplication: 'Budget IT en hausse.' }],
        },
      ] as never)

      const [signal] = await service.listAccountSignals('ws-1')

      expect(signal?.sales_implication).toBe('Budget IT en hausse.')
    })

    it('leaves the sales reading null when the signal carries none — never a filler sentence', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)

      const [signal] = await service.listAccountSignals('ws-1')

      expect(signal?.sales_implication).toBeNull()
    })

    /**
     * #2107.31 — l'ampleur business du signal, distincte de #1424
     * (`sales_implication`). Même discipline de lecture, même contrat.
     */
    it('projects the business impact of the signal, distinct from the sales reading (#2107.31)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          ...accountRow,
          recent_signals: [
            {
              signal: '3 300 recrutements annoncés en France pour 2026',
              sales_implication: 'Renfort recrutement/formation IT à proposer.',
              impact: "Transformation à l'échelle du groupe, pas d'une seule direction.",
            },
          ],
        },
      ] as never)

      const [signal] = await service.listAccountSignals('ws-1')

      expect(signal?.impact).toBe("Transformation à l'échelle du groupe, pas d'une seule direction.")
      expect(signal?.impact).not.toBe(signal?.sales_implication)
    })

    it('leaves the impact null when the analysis evaluated none — never a filler sentence', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)

      const [signal] = await service.listAccountSignals('ws-1')

      expect(signal?.impact).toBeNull()
    })

    /** #3922.2 — l'URL de la source voyage de la base à la liste : sans elle, aucun
     *  écran (Veille, Mes cibles, Laura) ne peut rendre « Voir l'annonce BODACC ». */
    it('transports the verified source url and kind of each signal, null when absent (#3922.2)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          ...accountRow,
          recent_signals: [
            { signal: 'Procédure de sauvegarde', url: 'https://www.bodacc.fr/a?id=1', source_kind: 'bodacc' },
            { signal: 'Signal collecté avant le lien', source: 'Communiqué de presse' },
            { signal: 'Lien non http', url: 'javascript:alert(1)', source_kind: 'press' },
          ],
        },
      ] as never)

      const items = await service.listAccountSignals('ws-1')
      const byLabel = new Map(items.map(item => [item.label, item]))

      expect(byLabel.get('Procédure de sauvegarde')).toMatchObject({
        source_url: 'https://www.bodacc.fr/a?id=1',
        source_kind: 'bodacc',
      })
      expect(byLabel.get('Signal collecté avant le lien')?.source_url).toBeNull()
      expect(byLabel.get('Lien non http')?.source_url).toBeNull()
    })

    /** #4182.5 — le demandeur d'une offre (lu dans son texte par la collecte) voyage jusqu'à Mes cibles. */
    it('transports the offer requester of a job signal, null when the collection did not compose one (#4182.5)', async () => {
      const requester = { status: 'a_identifier', author: { kind: 'rh' }, method: ['lire_offre'] }
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          ...accountRow,
          recent_signals: [{ signal: 'Développeur Java', source_kind: 'job', requester }, { signal: 'Levée de fonds' }],
        },
      ] as never)

      const items = await service.listAccountSignals('ws-1')
      const byLabel = new Map(items.map(item => [item.label, item]))

      expect(byLabel.get('Développeur Java')?.requester).toEqual(requester)
      expect(byLabel.get('Levée de fonds')?.requester).toBeNull()
    })

    /** #4437.5 — le rattachement d'une offre (compétence, famille, type de fait) voyage jusqu'à Mes cibles. */
    it('transports the offer attachment of a job signal, null when the collection did not stamp one (#4437.5)', async () => {
      const offer_attachment = {
        status: 'attached',
        fact_type: 'hiring',
        skills: ['React'],
        job_family: 'developpement',
        extract: 'Développeur React',
      }
      repo._qb.getRawMany.mockResolvedValueOnce([
        {
          ...accountRow,
          recent_signals: [
            { signal: 'Développeur React', source_kind: 'job', offer_attachment },
            { signal: 'Levée de fonds' },
          ],
        },
      ] as never)

      const items = await service.listAccountSignals('ws-1')
      const byLabel = new Map(items.map(item => [item.label, item]))

      expect(byLabel.get('Développeur React')?.offer_attachment).toEqual(offer_attachment)
      expect(byLabel.get('Levée de fonds')?.offer_attachment).toBeNull()
    })

    it('transports the signals collection date so the screen can say « collecte antérieure » (#3922.3)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        { ...accountRow, signals_collected_at: new Date('2026-10-05T08:00:00.000Z') },
      ] as never)
      const [signal] = await service.listAccountSignals('ws-1')
      expect(signal?.signals_collected_at).toBe('2026-10-05T08:00:00.000Z')

      repo._qb.getRawMany.mockResolvedValueOnce([{ ...accountRow, signals_collected_at: null }] as never)
      const [undated] = await service.listAccountSignals('ws-1')
      expect(undated?.signals_collected_at).toBeNull()
    })

    /** #1423 — une liste d'entreprises se reconnaît. Le logo est en base
     *  (`accounts.logo_url`), la requête ne le sélectionnait pas. */
    it('carries the account logo and website so the feed can show them (#1423)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([
        { ...accountRow, logo_url: 'https://logo.example/sncf.png', website: 'https://sncf.example' },
      ] as never)

      const [signal] = await service.listAccountSignals('ws-1')

      expect(signal).toMatchObject({
        logo_url: 'https://logo.example/sncf.png',
        website: 'https://sncf.example',
      })
    })

    it('selects the two columns the logo needs (#1423)', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)
      await service.listAccountSignals('ws-1')

      const selected = repo._qb.select.mock.calls.at(-1)?.[0] as string[]
      expect(selected).toEqual(expect.arrayContaining(['account.logo_url AS logo_url', 'account.website AS website']))
    })

    /**
     * #3919 — « qu'est-ce qui bouge chez CE compte ? » restreint la MÊME lecture
     * à un compte, jamais un second moteur (GA-26) : même requête, même
     * historique, même tri de pertinence que la Veille du portefeuille.
     */
    it('#3919 — accountId restreint la requête au compte demandé, sans toucher au tri', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)
      await service.listAccountSignals('ws-1', undefined, null, 'acc-1')

      expect(repo._qb.andWhere).toHaveBeenCalledWith('account.id = :accountId', { accountId: 'acc-1' })
    })

    it('#3919 — sans accountId, aucun filtre de compte n’est posé', async () => {
      repo._qb.getRawMany.mockResolvedValueOnce([accountRow] as never)
      await service.listAccountSignals('ws-1')

      const calls = repo._qb.andWhere.mock.calls as Array<[string, Record<string, unknown>?]>
      expect(calls.some(([sql]) => sql === 'account.id = :accountId')).toBe(false)
    })
  })
})

/**
 * « Ajouter à mon portefeuille » (décision produit D6) — le geste qui ATTRIBUE
 * vraiment. Avant, « Suivre » n'était qu'une liste locale : rien côté serveur.
 * Ce qui est vérifié ici, c'est ce qui ferait mal en prod : un doublon de compte,
 * un dossier vide qui passerait pour une analyse, ou un dossier réel détruit
 * parce qu'on décoche une carte.
 */
describe('AccountsService — portefeuille (D6)', () => {
  let service: AccountsService
  let repo: MockRepository<AccountEntity>

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    }
    service = new AccountsService(repo as never, {} as never, workspaceContext as never, {} as never)
  })

  const assertOk = <T>(result: { type: string; output?: T }): T => {
    expect(result.type).toBe('success')
    return result.output as T
  }

  it('crée un compte JAMAIS analysé et l’attribue à son commercial', async () => {
    repo.findOne.mockResolvedValue(null)
    repo.create.mockImplementation((v: unknown) => v as never)
    repo.save.mockImplementation(async (v: unknown) => v as never)

    const out = assertOk(await service.addToPortfolio('u1', { company_name: 'Qonto', siren: '123456789' }))

    expect(out.created).toBe(true)
    // `prospect` = jamais analysé : on ne fabrique pas un dossier vide.
    expect(out.account.status).toBe('prospect')
    expect(out.account.assigned_to).toBe('u1')
    expect(out.account.commercial_status).toBe('watching')
    expect(out.account.workspace_id).toBe('ws-1')
  })

  it('ne duplique pas : un SIREN déjà connu est RÉATTRIBUÉ', async () => {
    const existing = { id: 'a1', siren: '123456789', status: 'completed', assigned_to: null } as never
    repo.findOne.mockResolvedValue(existing)
    repo.save.mockImplementation(async (v: unknown) => v as never)

    const out = assertOk(await service.addToPortfolio('u1', { company_name: 'Qonto', siren: '123456789' }))

    expect(out.created).toBe(false)
    expect(repo.create).not.toHaveBeenCalled()
    expect(out.account.assigned_to).toBe('u1')
    // Un compte analysé garde son statut : on n'écrase pas une histoire réelle.
    expect(out.account.status).toBe('completed')
  })

  // #3666.2 (recette prod 09/10, écriture) — un compte réellement analysé puis
  // retiré du portefeuille (`deleted`) garde son `priority_score` en base tant
  // qu'il n'est pas détruit ; le réattribuer le fait revenir en `prospect`
  // (« jamais analysé »), mais le score de l'ancienne analyse restait écrit —
  // la fiche affichait un score inventé sur un compte que son propre statut dit
  // n'avoir jamais analysé (doctrine « non mesuré n'est jamais 0 »).
  it('ranime un prospect SUPPRIMÉ et efface le score de l’ancienne analyse — « prospect » veut dire « jamais analysé »', async () => {
    const existing = {
      id: 'a3',
      siren: '555',
      status: 'deleted',
      assigned_to: null,
      priority_score: 5,
      priority_justification: 'ancienne analyse, avant suppression',
    } as never
    repo.findOne.mockResolvedValue(existing)
    repo.save.mockImplementation(async (v: unknown) => v as never)

    const out = assertOk(await service.addToPortfolio('u1', { company_name: 'Decathlon', siren: '555' }))

    expect(out.account.status).toBe('prospect')
    expect(out.account.priority_score).toBeNull()
    expect(out.account.priority_justification).toBeNull()
  })

  it('retirer un prospect jamais analysé le supprime — pas de coquille sans responsable', async () => {
    const prospect = { id: 'a2', siren: '999', status: 'prospect', assigned_to: 'u1' } as never
    repo.findOne.mockResolvedValue(prospect)
    repo.save.mockImplementation(async (v: unknown) => v as never)

    assertOk(await service.removeFromPortfolio('u1', '999'))

    const saved = repo.save.mock.calls[0][0] as { status: string; assigned_to: string | null }
    expect(saved.status).toBe('deleted')
    expect(saved.assigned_to).toBeNull()
  })

  it('retirer un compte ANALYSÉ relâche seulement le responsable — jamais de perte de données', async () => {
    const analysed = { id: 'a3', siren: '888', status: 'completed', assigned_to: 'u1' } as never
    repo.findOne.mockResolvedValue(analysed)
    repo.save.mockImplementation(async (v: unknown) => v as never)

    assertOk(await service.removeFromPortfolio('u1', '888'))

    const saved = repo.save.mock.calls[0][0] as { status: string; assigned_to: string | null }
    expect(saved.status).toBe('completed')
    expect(saved.assigned_to).toBeNull()
  })

  it('retirer un compte inconnu ne casse rien', async () => {
    repo.findOne.mockResolvedValue(null)
    const out = assertOk(await service.removeFromPortfolio('u1', 'inconnu'))
    expect(out.removed).toBe(false)
    expect(repo.save).not.toHaveBeenCalled()
  })

  // #2259.32 — le nombre de comptes rattachés à une BU, un COMPTE (jamais une
  // liste), scopé aux DEUX bornes : l'espace ET la BU. `0` est une mesure
  // réelle (une BU peut réellement n'avoir aucun compte).
  it('#2259.32 — compte les comptes rattachés à une BU, scopé par espace ET BU', async () => {
    repo.count.mockResolvedValue(3)
    const n = await service.countByBusinessUnit('ws-1', 'bu-1')
    expect(n).toBe(3)
    expect(repo.count).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', business_unit_id: 'bu-1' } })
  })

  it('#2259.32 — une BU sans compte rend 0, une mesure réelle', async () => {
    repo.count.mockResolvedValue(0)
    const n = await service.countByBusinessUnit('ws-1', 'bu-2')
    expect(n).toBe(0)
  })

  /**
   * #2159.26 — le filtre « Étiquette » regroupe SANS tenir compte de la casse
   * (décision Louis 19/09). Si « SAP » est posé sur une fiche et « sap » sur
   * une autre, le filtre ne propose qu'UNE option : la graphie la plus
   * fréquente, à égalité la première rencontrée (la fiche la plus ancienne).
   */
  describe('listTags (#2159.26)', () => {
    it('une clé, une option — la graphie la plus fréquente gagne, triée alphabétiquement', async () => {
      // 2 comptes portent « SAP », 1 seul porte « sap » : « SAP » gagne.
      repo.query.mockResolvedValueOnce([{ tag: 'SAP' }, { tag: 'cloud' }, { tag: 'sap' }, { tag: 'SAP' }] as never)
      const tags = await service.listTags('ws-1')
      expect(tags).toEqual(['cloud', 'SAP'])
    })

    it('interroge dans l’ordre de création — la clé du départage par « première rencontrée »', async () => {
      await service.listTags('ws-1')
      expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY a.created_at ASC'), ['ws-1', 'deleted'])
    })

    it('une erreur de requête rend [] plutôt que de casser l’écran', async () => {
      repo.query.mockRejectedValueOnce(new Error('boom'))
      expect(await service.listTags('ws-1')).toEqual([])
    })
  })

  /**
   * #3245 (reste de #3209.3) — le budget d'effort réel : cinq mesures, quatre
   * lectures indépendantes + `portfolioPriorities` déjà testée ailleurs
   * (`portfolio-priorities.spec.ts`). Rien n'est recalculé, tout est lu.
   */
  describe('effortBudget (#3245, reste de #3209.3)', () => {
    it('assemble les cinq mesures depuis leur source réelle', async () => {
      repo.manager.query
        .mockResolvedValueOnce([{ weekly_available_hours: 32 }]) // réglage d'espace
        .mockResolvedValueOnce([{ count: '4' }]) // appels journalisés (7j)
        .mockResolvedValueOnce([{ count: '2' }]) // crédits d'analyse consommés (7j)
        .mockResolvedValueOnce([{ count: '17' }]) // volume de contacts
        .mockResolvedValueOnce([]) // portfolioPriorities : aucun compte

      const budget = await service.effortBudget('ws-1')
      expect(budget).toEqual({
        weeklyAvailableHours: 32,
        callsLast7Days: 4,
        paidAnalysesLast7Days: 2,
        workableAccounts: 0,
        contactsVolume: 17,
      })
    })

    it('heures disponibles NON RENSEIGNÉES restent `null` — jamais 0 heure (GA-18/GA-19)', async () => {
      repo.manager.query
        .mockResolvedValueOnce([]) // aucune ligne de réglage
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([])

      const budget = await service.effortBudget('ws-1')
      expect(budget.weeklyAvailableHours).toBeNull()
    })

    it('« comptes travaillables » exclut « à ne pas travailler » — jamais un second calcul du score', async () => {
      repo.manager.query
        .mockResolvedValueOnce([{ weekly_available_hours: null }])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([
          {
            id: 'a',
            company_name: 'A',
            sprint: 'focus',
            sprint_exit_reason: null,
            priority_gate: 'pending',
            priority_score: 80,
            priority_justification: null,
            commercial_status: 'watching',
            group_head_siren: null,
            last_action_at: null,
            movement_rationale: null,
            first_action_label: null,
            first_action_horizon: null,
          },
          {
            id: 'b',
            company_name: 'B',
            sprint: 'no_go',
            sprint_exit_reason: 'Concurrent en place.',
            priority_gate: 'pending',
            priority_score: 90,
            priority_justification: null,
            commercial_status: 'watching',
            group_head_siren: null,
            last_action_at: null,
            movement_rationale: null,
            first_action_label: null,
            first_action_horizon: null,
          },
        ])

      const budget = await service.effortBudget('ws-1')
      // « a » (focus → maintenant) compte, « b » (no_go → à ne pas travailler) non.
      expect(budget.workableAccounts).toBe(1)
    })
  })

  /**
   * #3182.2 (épopée #3248, reste "disponibilité de l'équipe commerciale") —
   * le modèle d'équipe MINIMAL : la charge DÉJÀ déclarée (Réglages › Charge
   * commerciale) croisée avec le compte RÉEL de dossiers suivis par le
   * commercial qui s'apprête à ouvrir ce compte. Jamais un second modèle
   * d'équipe multi-utilisateur, qui n'existe pas dans ce produit.
   */
  describe("commercialLoadCapacity (#3182.2, reste de l'épopée #3248)", () => {
    it('nomme le consultant et compare son plafond déclaré au compte réel de dossiers suivis', async () => {
      repo.manager.query
        .mockResolvedValueOnce([{ max_tracked_accounts: 40, weekly_available_hours: 32 }])
        .mockResolvedValueOnce([{ count: '12' }])
      repo.query.mockResolvedValueOnce([{ userId: 'user-1', firstName: 'Sarah', lastName: 'Martin', email: null }])

      const capacity = await service.commercialLoadCapacity('ws-1', 'user-1')
      expect(capacity).toEqual({
        consultant: { user_id: 'user-1', name: 'Sarah Martin' },
        maxTrackedAccounts: 40,
        trackedAccountsCount: 12,
        weeklyAvailableHours: 32,
      })
    })

    it('plafond et heures NON RENSEIGNÉS restent `null`, jamais 0 (GA-18/GA-19)', async () => {
      repo.manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }])
      repo.query.mockResolvedValueOnce([])

      const capacity = await service.commercialLoadCapacity('ws-1', 'user-1')
      expect(capacity.maxTrackedAccounts).toBeNull()
      expect(capacity.weeklyAvailableHours).toBeNull()
      expect(capacity.trackedAccountsCount).toBe(0)
      // Profil introuvable (membre parti) : `null`, jamais un uuid affiché.
      expect(capacity.consultant).toBeNull()
    })
  })
})

// #4070.1 — « pourquoi maintenant » des comptes de « maintenant » lit les faits décotés du lecteur unique.
describe('AccountsService.portfolioPriorities — pourquoi maintenant (#4070.1)', () => {
  const focusRow = {
    id: 'acc-1',
    company_name: 'Aubrac',
    sprint: 'focus',
    sprint_exit_reason: null,
    priority_gate: 'go',
    priority_score: 80,
    priority_justification: 'En focus',
    commercial_status: 'watching',
    group_head_siren: null,
    last_action_at: null,
    movement_rationale: null,
    first_action_label: null,
    first_action_horizon: null,
    bet_horizon: null,
    bet_size: null,
    bet_access: null,
    bet_resource: null,
    headquarters: null,
    imported: false,
    interlocutor_candidates: [],
  }
  const build = (reader?: { forAccount: jest.Mock }) => {
    const repo = createMockRepository<AccountEntity>()
    repo.manager.query.mockResolvedValue([focusRow])
    const padding = Array.from({ length: 9 }, () => undefined)
    const service = new AccountsService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      ...(padding as never[]),
      reader as never,
    )
    return service
  }

  it('attache les faits décotés (date du fait, âge) aux comptes de « maintenant »', async () => {
    const forAccount = jest.fn().mockResolvedValue({
      asOf: '2026-10-15T00:00:00.000Z',
      facts: [{ date: '2026-09-30', kind: 'hiring', label: '4 ingénieurs PLM', weight: 0.8, ageDays: 15 }],
    })
    const out = await build({ forAccount }).portfolioPriorities('ws-1', 'u1')
    expect(forAccount).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'u1', accountId: 'acc-1' })
    expect(out.now[0]?.whyNow).toEqual([{ date: '2026-09-30', kind: 'hiring', label: '4 ingénieurs PLM', ageDays: 15 }])
  })

  it('sans utilisateur, sans lecteur ou sur lecture en échec : la répartition est celle d’avant', async () => {
    const forAccount = jest.fn().mockRejectedValue(new Error('boom'))
    expect((await build({ forAccount }).portfolioPriorities('ws-1', 'u1')).now[0]).not.toHaveProperty('whyNow')
    expect((await build({ forAccount }).portfolioPriorities('ws-1')).now[0]).not.toHaveProperty('whyNow')
    expect((await build().portfolioPriorities('ws-1', 'u1')).now[0]).not.toHaveProperty('whyNow')
  })
})

/**
 * #3212.5 (LAU-FINAL-218) — à données identiques, le même premier compte. Deux comptes à
 * score ET date de mise à jour égaux (un import en masse) sortaient dans l'ordre que
 * PostgreSQL voulait bien rendre, et `LIMIT` pouvait en couper un différent à chaque
 * lecture. Le départage final est l'identifiant : un ordre TOTAL.
 */
describe('AccountsService — classements de comptes à ordre total (#3212.5)', () => {
  const build = () => {
    const repo = createMockRepository<AccountEntity>()
    repo.manager.query.mockResolvedValue([])
    const service = new AccountsService(repo as never, {} as never, {} as never, {} as never)
    return { service, sqls: () => repo.manager.query.mock.calls.map(([sql]) => String(sql)) }
  }

  it('les comptes à traiter se départagent par identifiant après le score et la date', async () => {
    const { service, sqls } = build()
    await service.accountsAwaitingAction('ws-1', 30, 6)
    expect(sqls().join('\n')).toMatch(/ORDER BY a\.priority_score DESC NULLS LAST, a\.updated_at DESC, a\.id\s/)
  })

  it('le portefeuille et ses interlocuteurs candidats se départagent par identifiant', async () => {
    const { service, sqls } = build()
    await service.portfolioPriorities('ws-1')
    const sql = sqls().join('\n')
    expect(sql).toMatch(/ORDER BY a\.priority_score DESC NULLS LAST, a\.updated_at DESC, a\.id$/m)
    expect(sql).toMatch(
      /OVER \(ORDER BY c\.contact_score DESC NULLS LAST, c\.priority ASC NULLS LAST, c\.full_name, c\.id\)/,
    )
    expect(sql).toMatch(/c\.priority ASC NULLS LAST, c\.full_name, c\.id\s+LIMIT 5/)
  })
})
