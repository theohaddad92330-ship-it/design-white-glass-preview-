import { expect, test, type Page } from '@playwright/test'
import { openImportByTool } from './golden-journey-fixtures'

/**
 * #2208.70 (golden journey 39) — REPRENDRE UN JOB INTERROMPU.
 *
 * Le tri du 28/09 (`TRI-RESTES-28-09.md`, #2958.32-.70) classe ce parcours
 * « aucun scénario dédié trouvé » — le mécanisme existe (`ImportWizard.tsx`,
 * doctrine « un timeout n'est pas un échec » : `unknown` ARRÊTE la reprise),
 * mais rien ne prouvait qu'un VRAI clic sur « Reprendre cet import », depuis
 * l'historique RÉEL de `/settings/import`, rouvre bien LA session interrompue
 * — jamais une nouvelle qui rejouerait tout depuis le début.
 *
 * `GET /import/sessions` porte une session `state: 'partial'` : c'est le
 * SEUL état qui affiche le bouton de reprise (`ImportWizard.tsx:802-805`).
 * Deux parcours couverts : la ligne interrompue avec une cause CONNUE
 * (`resume_outcome: 'failed'`, rejouable) et la cause INCONNUE
 * (`resume_outcome: 'unknown'`, un humain tranche — jamais une reprise
 * automatique qui devinerait).
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '4b7a4b1e-3939-4a11-9c33-2208700000ab'
const SOURCE_KEY = 'crm_generic_export'

type Session = {
  id: string
  source: string
  object_type: string
  state: string
  created_at: string
  created_count: number
  updated_count: number
  processed_rows: number | null
  total_rows: number | null
  failed_at_row: number | null
  resume_outcome: 'failed' | 'unknown' | null
  error: string | null
}

const SOURCE_CARD = {
  key: SOURCE_KEY,
  objects: ['account'],
  format: 'csv',
  readable: true,
  tier: 'mvp',
  imports: ['Comptes'],
  skips: [],
  howTo: 'Exporte ton CRM au format CSV, dépose-le ici.',
  required: ['company_name'],
  fields: ['company_name'],
}

function session(overrides: Partial<Session>): Session {
  return {
    id: '2208700000-0000-4000-8000-000000000001',
    source: SOURCE_KEY,
    object_type: 'account',
    state: 'partial',
    created_at: '2026-09-27T22:14:00.000Z',
    created_count: 3184,
    updated_count: 96,
    processed_rows: 3280,
    total_rows: 4000,
    failed_at_row: 3280,
    resume_outcome: 'failed',
    error: 'La connexion réseau a été coupée pendant l’écriture.',
    ...overrides,
  }
}

async function mockImportSettings(page: Page, sessions: readonly Session[]): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-2208-70@bellum-ai.com',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    }),
  )
  await page.route('**/onboarding/state', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: USER_ID,
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
    }),
  )
  await page.route('**/workspaces/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-220870000001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [] }) }),
  )
  await page.route('**/import/sources', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([SOURCE_CARD]) }),
  )
  await page.route('**/import/sessions', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(sessions) }),
  )
}

test.describe('#2208.70 — golden journey : reprendre un job interrompu', () => {
  test('rouvre SA session interrompue — la cause est connue, la reprise est proposée', async ({ page }) => {
    const partial = session({ resume_outcome: 'failed' })
    await mockImportSettings(page, [partial])

    await page.goto('/settings/import')
    await openImportByTool(page)

    // ÉCRAN 1 — l'historique dit VRAIMENT que cet import s'est interrompu.
    await expect(page.getByText('Export CRM générique — interrompu · 3184 créé(s), 96 mis à jour')).toBeVisible()

    // LE CLIC — reprendre rouvre SA session, jamais une nouvelle simulation à vide.
    await page.getByRole('button', { name: 'Reprendre cet import' }).click()

    // ÉCRAN 2 — le panneau de reprise dit CE QU'ON SAIT avant de redemander le
    // fichier. Scopé au panneau : l'historique EN DESSOUS redit la même ligne
    // d'arrêt (`StoppedLine`, partagée), donc un `getByText` non scopé la
    // trouverait deux fois.
    const resumePanel = page.getByTestId('import-resume-panel')
    await expect(resumePanel.getByText('Reprendre là où ça s’est arrêté')).toBeVisible()
    await expect(
      resumePanel.getByText(
        '3280 ligne(s) sur 4000 ont été écrites — 3184 créé(s), 96 mis à jour. Elles sont en base.',
      ),
    ).toBeVisible()
    await expect(resumePanel.getByText('La connexion n’a jamais abouti')).toBeVisible()
    // La bonne cause s'affiche, jamais celle de l'autre chemin (« unknown »).
    await expect(resumePanel.getByText('La requête est partie sans que la réponse revienne.')).not.toBeVisible()

    // Le mot d'ordre de la reprise : le MÊME fichier, jamais un autre — un
    // fichier différent au même numéro de ligne sauterait en silence.
    await expect(resumePanel.getByText('Redépose EXACTEMENT le même fichier')).toBeVisible()
  })

  test('cause INCONNUE — la reprise s’arrête et demande un arbitrage humain, jamais une reprise devinée', async ({
    page,
  }) => {
    const uncertain = session({
      id: '2208700000-0000-4000-8000-000000000002',
      resume_outcome: 'unknown',
      failed_at_row: 3280,
      error: null,
    })
    await mockImportSettings(page, [uncertain])

    await page.goto('/settings/import')
    await openImportByTool(page)
    await page.getByRole('button', { name: 'Reprendre cet import' }).click()

    // ÉCRAN — « un timeout n'est pas un échec » : la question reste ouverte,
    // jamais une reprise silencieuse qui devinerait le sort de la ligne 3281.
    const resumePanel = page.getByTestId('import-resume-panel')
    await expect(resumePanel.getByText('La requête est partie sans que la réponse revienne.')).toBeVisible()
    await expect(
      resumePanel.getByText('La ligne 3281 est partie sans réponse. Que veux-tu que j’en fasse ?'),
    ).toBeVisible()
    await expect(resumePanel.getByRole('button', { name: 'Réécrire la ligne 3281' })).toBeVisible()
    await expect(resumePanel.getByRole('button', { name: 'Sauter la ligne 3281' })).toBeVisible()
  })
})
