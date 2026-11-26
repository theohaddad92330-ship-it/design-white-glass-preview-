import type { Page, Route } from '@playwright/test'

/**
 * Socle partagé des parcours dorés `golden-journey-*.spec.ts` ajoutés par le
 * lot X40 (#2958, parcours 1-4 et 8-20) — extrait pour que dix-sept fichiers
 * ne recopient pas dix-sept fois la même session simulée (GA-26 : un seul
 * endroit sait comment simuler le « shell » connecté). Même raison que
 * `briefing-fixtures.ts` : Playwright refuse qu'un test en importe un autre.
 *
 * Tout ce qui n'est pas simulé part vers le port mort 4599 : l'écran dégrade
 * alors comme en production sur un échec réseau, jamais sur une donnée inventée.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'

export function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

/** Session connectée, onboarding terminé, espace « ESN e2e » dont on est propriétaire. */
export async function mockSignedInShell(
  page: Page,
  options: { userId: string; tag: string; features?: readonly string[] },
): Promise<void> {
  const { userId, tag, features = [] } = options
  await page.context().addCookies([{ name: `loggedIn:${userId}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    fulfillJson(route, {
      user: {
        id: userId,
        email: `e2e-${tag}@bellum-ai.com`,
        created_at: '2026-01-01T00:00:00.000Z',
        roles: ['customer'],
      },
    }),
  )
  await page.route('**/onboarding/state', route =>
    fulfillJson(route, {
      id: userId,
      status: 'completed',
      current_stage_code: null,
      stages: [],
      answers: {},
      skipped_at: null,
      inherited_answer_keys: [],
      active_import_session_id: null,
      joined_workspace: null,
      effectif_observed_at: {},
    }),
  )
  await page.route('**/workspaces/me', route =>
    fulfillJson(route, {
      workspace: {
        id: `9b1c2d3e-4f50-4a61-8b72-${tag.padEnd(12, '0').slice(0, 12)}`,
        name: 'ESN e2e',
        role: 'owner',
        memberCount: 1,
      },
      members: [],
    }),
  )
  await page.route('**/credits', route => fulfillJson(route, { features }))
  await page.route('**/banners?*', route => fulfillJson(route, { banners: [] }))
}

export type TalentRow = Record<string, unknown> & { id: string; fullName: string | null }

/** Une ligne de `GET /talents` — mêmes champs que la liste réelle, rien d'inventé hors du nom et du poste. */
export function talentRow(overrides: Record<string, unknown>): TalentRow {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    kind: 'consultant',
    fullName: null,
    title: null,
    seniority: 'inconnu',
    declaredAvailability: 'unknown',
    staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: null,
    minTjmCents: null,
    costCents: null,
    financeVisible: false,
    contractType: 'inconnu',
    engagementKind: 'inconnu',
    zones: [],
    lastMission: null,
    submissions: { open: 0, total: 0 },
    source: null,
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: [],
    skillCount: 0,
    hasCv: true,
    workMode: null,
    photoUrl: null,
    updatedAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  } as TalentRow
}

/** Le Vivier (`GET /talents?…`) + la propagation — le minimum pour que `/consultants` se rende. */
export async function mockVivierList(page: Page, rows: readonly TalentRow[]): Promise<void> {
  await page.route(/\/talents\?/, route => fulfillJson(route, { items: rows, total: rows.length, page: 1, limit: 20 }))
  await page.route('**/delivery/propagation', route =>
    fulfillJson(route, { accounts: [], contacts: [], consultants: [] }),
  )
}

type CvZipReport = {
  total: number
  summary: Record<'created' | 'auto_updated' | 'exception' | 'too_big' | 'failed' | 'ignored', number>
  outcomes: unknown[]
}

/**
 * L'import ZIP EN LIGNE (archive ≤ 20 Mo) : manifeste, dépôt du job, puis un
 * suivi qui rend tout de suite `done` avec `report`. Rend un compteur des
 * envois réels (le manifeste n'écrit rien, seul `POST …/jobs` compte).
 */
export async function mockInlineCvZipImport(page: Page, report: CvZipReport): Promise<{ jobsStarted: () => number }> {
  let started = 0
  await page.route('**/talents/intake/zip/manifest', route =>
    fulfillJson(route, { totalFiles: report.total, duplicateFiles: 0, overLimit: false, max: 300 }),
  )
  await page.route('**/talents/intake/zip/jobs', route => {
    started += 1
    return fulfillJson(route, { jobId: 'job-zip-inline', total: report.total })
  })
  // `processing` puis `done` : le Vivier ne se relit que sur la TRANSITION
  // d'un job en vol vers `done` (`useCvBatchImportJobStatus`), comme en production.
  let polls = 0
  await page.route('**/talents/intake/jobs/job-zip-inline', route => {
    polls += 1
    const done = polls > 1
    return fulfillJson(route, {
      id: 'job-zip-inline',
      kind: 'zip',
      status: done ? 'done' : 'processing',
      total: report.total,
      processed: done ? report.total : 1,
      summary: done ? report.summary : {},
      outcomes: done ? report.outcomes : [],
      error: null,
      etaSeconds: null,
    })
  })
  return { jobsStarted: () => started }
}

/**
 * #4426.1 — `/settings/import` n'a plus qu'une entrée : la zone « Dépose tes documents ». L'assistant d'import par
 * outil (choix de source, reprise d'un import interrompu) reste, mais REPLIÉ dans `import-by-tool` : un parcours qui
 * veut le voir l'ouvre d'abord, comme le fait l'utilisateur.
 */
export async function openImportByTool(page: Page): Promise<void> {
  const details = page.getByTestId('import-by-tool')
  await details.waitFor({ state: 'attached', timeout: 30_000 })
  if (!(await details.evaluate(el => (el as HTMLDetailsElement).open))) {
    await details.locator('summary').click()
  }
}
