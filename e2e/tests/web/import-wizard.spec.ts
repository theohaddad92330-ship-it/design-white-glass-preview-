import { expect, test, type Page } from '@playwright/test'
import { openImportByTool } from './golden-journey-fixtures'

/**
 * #2773/#2085.38 (Import) — le parcours de l'assistant d'import, LEVÉ dans ce
 * lot après huit lots de suite à « `ImportWizard.tsx` fait 1 454 lignes, même
 * famille de risque que `Chat.tsx`, non cartographié ».
 *
 * ⚠️ Ce test prouve le CÂBLAGE de l'assistant (choisir une source → déposer un
 * fichier → simuler → importer → restitution), pas le jalon d'analytique
 * `data_imported` du corps de #2085.38 : ce dernier n'a de sens que sur une
 * ÉCRITURE SERVEUR réelle (`outcome.written`), qu'aucun mock ne peut prouver
 * sans reproduire le serveur — voir le docblock de
 * `onboarding/first-value-milestones.spec.ts`, où ce point reste `test.skip`.
 * Ici, la question posée est différente et bien plus modeste : la page
 * rend-elle, chaque étape déclenche-t-elle le bon appel, et l'écran
 * réagit-il correctement à CE QUE LE SERVEUR (mocké) répond ? C'est la même
 * distinction que #2078.25 sur la carte connecteur — un mock est une preuve
 * légitime du CLIENT, jamais du contrat serveur lui-même.
 *
 * Chemin d'entrée COURT retenu (même méthode que #2446.14/#2085.36) : une
 * seule source (« Contacts seuls »), un fichier de deux lignes, aucune
 * correction de correspondance — le mapping proposé par le (faux) serveur est
 * accepté tel quel. Les deux lectures optionnelles de la restitution
 * (`GET .../restitution/consultants-total`, `GET /import/restitution`)
 * restent volontairement NON mockées : `RestitutionPanel` dégrade déjà en
 * « non mesuré » sur un échec réseau (son propre docblock), et ce socle Tier 2
 * pointe sur un port mort — même tolérance que documentée dans
 * `e2e/README.md` pour le tier mobile.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '9a1b2c3d-2085-38ee-8f33-2085380000fc'
const SESSION_ID = 's-e2e-import-1'

async function mockImportShell(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-import-wizard@bellum-ai.com',
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
        workspace: { id: 'w-e2e-import', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [] }) }),
  )
  await page.route('**/profiles/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'p-e2e-import',
        user_id: USER_ID,
        email: 'e2e-import-wizard@bellum-ai.com',
        first_name: 'Golden',
        last_name: 'Journey',
        avatar_url: null,
        timezone: 'Europe/Paris',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        auth_created_at: '2026-01-01T00:00:00.000Z',
        auth_last_sign_in_at: '2026-09-27T08:00:00.000Z',
      }),
    }),
  )
  await page.route('**/banners?*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ banners: [] }) }),
  )

  // Le catalogue : UNE source lisible, « Contacts seuls » — le chemin le
  // plus court, aucun objet parent à importer avant.
  await page.route('**/import/sources', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          key: 'contacts_only',
          objects: ['contact'],
          format: 'csv',
          readable: true,
          tier: 'mvp',
          imports: ['Nom, prénom, e-mail'],
          skips: ['Historique CRM'],
          howTo: 'Exporte un fichier CSV depuis ton outil.',
          required: ['email'],
          fields: ['email', 'first_name', 'last_name'],
        },
      ]),
    }),
  )
  // ⚠️ `**/import/sessions` matche AUSSI `POST /import/sessions` (créer) ET
  // `GET /import/sessions` (l'historique) — même piège que `**/integrations`
  // sur la carte connecteur (#2085.38 Connecteur, ce lot) : distingué ici par
  // MÉTHODE, jamais par chemin.
  await page.route('**/import/sessions', route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: SESSION_ID,
          source: 'contacts_only',
          object_type: 'contact',
          state: 'draft',
          created_at: '2026-09-28T09:00:00.000Z',
          created_count: 0,
          updated_count: 0,
          processed_rows: null,
          total_rows: null,
          failed_at_row: null,
          resume_outcome: null,
          error: null,
        }),
      })
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })

  const report = {
    rowsRead: 2,
    creations: 2,
    updates: 0,
    overwrittenFields: 0,
    duplicates: [],
    skipped: [],
    mappedColumns: ['email', 'first_name'],
    ignoredColumns: [],
    missingRequiredColumns: [],
    withoutLegalBasis: 0,
    truncated: false,
    errors: [],
    sensitiveColumns: [],
    possibleDuplicates: [],
  }

  await page.route(`**/import/sessions/${SESSION_ID}/dry-run`, route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        report,
        proposedMapping: { columns: { email: 'email', first_name: 'first_name' }, ignored: [], disabledRules: [] },
        delimiter: ',',
        detectedSource: { certainty: 'none' },
        columnConfidence: {},
        mappingSuggestions: {},
      }),
    }),
  )
  await page.route(`**/import/sessions/${SESSION_ID}/apply`, route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        created: 2,
        updated: 0,
        skippedUnknownCompany: 0,
        written: true,
        reason: null,
        resumedFromRow: 0,
        stopped: null,
        report: { ...report, errors: [] },
      }),
    }),
  )
}

test('assistant d’import : choisir une source, déposer un fichier, simuler, importer — jusqu’à la restitution', async ({
  page,
}) => {
  await mockImportShell(page)
  await page.goto('/settings/import')
  await openImportByTool(page)

  // ÉTAPE 1 — choisir la source. `.first()` : le nom de la source apparaît
  // aussi dans la description/le catalogue avant le bouton lui-même.
  await expect(page.getByText('Contacts seuls').first()).toBeVisible()
  await page.getByRole('button', { name: 'Choisir cette source' }).click()

  // ÉTAPE 2 — déposer un fichier. Décodé côté NAVIGATEUR (`decodeFile`,
  // `FileReader`) : aucun réseau à ce geste, contrairement au reste du
  // parcours.
  // #4434 Je — /settings/import porte aussi la zone du pack de contexte (input multiple) : viser celle de l'assistant.
  await page.setInputFiles('input[type="file"]:not([multiple])', {
    name: 'contacts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('email,first_name\njane@example.com,Jane\njohn@example.com,John\n', 'utf-8'),
  })

  // ÉTAPES 4-6 — simuler (dry-run). Le mapping proposé par le (faux) serveur
  // s'affiche, ACCEPTÉ tel quel — aucune correction dans ce chemin court.
  await page.getByRole('button', { name: 'Simuler' }).click()
  await expect(page.getByText('2 ligne(s) lue(s)')).toBeVisible()
  await expect(page.getByText('2 création(s)')).toBeVisible()

  // ÉTAPE 7 — importer (écriture, mockée `written: true`). La restitution
  // apparaît : « BellumAI ne repart pas de zéro », comptée sur ce que
  // l'ÉCRITURE (mockée) a produit — jamais ce que la simulation annonçait.
  await page.getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(page.getByTestId('restitution-panel')).toBeVisible()
})
