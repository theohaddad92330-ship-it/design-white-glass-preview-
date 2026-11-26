import { expect, test } from '@playwright/test'
import { fulfillJson, mockSignedInShell, openImportByTool } from './golden-journey-fixtures'

/**
 * #2208.35 (golden journey 4) — IMPORTER 1 000 CONTACTS ET 7 BESOINS.
 *
 * Deux gestes d'un même démarrage de compte :
 *  1. `/settings/import` — l'assistant lit un CSV de 1 000 contacts, SIMULE
 *     (rien n'est écrit), puis importe : le compte de lignes affiché est celui
 *     que le serveur (mocké) rapporte, jamais celui du fichier supposé ;
 *  2. `/projects/needs` — sept fiches de poste déposées d'un coup (sous la
 *     borne de dix par dépôt) : sept extractions, sept besoins prévisualisés,
 *     RIEN créé avant le clic de validation, puis sept `POST /projects/needs`.
 */

const USER_ID = '4b7a4b1e-0004-4a11-9c33-2208350000ab'
const SESSION_ID = 's-e2e-1000-contacts'
const ACCOUNT_ID = 'a1b2c3d4-0004-4a11-8c33-220835000001'

test.describe('#2208.35 — golden journey : importer 1 000 contacts et 7 besoins', () => {
  test('1 000 contacts : simuler d’abord, importer ensuite, la restitution compte ce qui est écrit', async ({
    page,
  }) => {
    await mockSignedInShell(page, { userId: USER_ID, tag: '220835' })
    await page.route('**/import/sources', route =>
      fulfillJson(route, [
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
    )
    let applied = 0
    await page.route('**/import/sessions', route => {
      if (route.request().method() !== 'POST') return fulfillJson(route, [])
      return fulfillJson(route, {
        id: SESSION_ID,
        source: 'contacts_only',
        object_type: 'contact',
        state: 'draft',
        created_at: '2026-10-02T09:00:00.000Z',
        created_count: 0,
        updated_count: 0,
        processed_rows: null,
        total_rows: null,
        failed_at_row: null,
        resume_outcome: null,
        error: null,
      })
    })
    const report = {
      rowsRead: 1000,
      creations: 1000,
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
    await page.route(`**/import/sessions/${SESSION_ID}/dry-run`, route => {
      expect(applied).toBe(0)
      return fulfillJson(route, {
        report,
        proposedMapping: { columns: { email: 'email', first_name: 'first_name' }, ignored: [], disabledRules: [] },
        delimiter: ',',
        detectedSource: { certainty: 'none' },
        columnConfidence: {},
        mappingSuggestions: {},
      })
    })
    await page.route(`**/import/sessions/${SESSION_ID}/apply`, route => {
      applied += 1
      return fulfillJson(route, {
        created: 1000,
        updated: 0,
        skippedUnknownCompany: 0,
        written: true,
        reason: null,
        resumedFromRow: 0,
        stopped: null,
        report,
      })
    })

    await page.goto('/settings/import')
    await openImportByTool(page)
    await page.getByRole('button', { name: 'Choisir cette source' }).click()
    const lines = Array.from({ length: 1000 }, (_, i) => `contact${i}@example.com,Contact${i}`)
    // #4434 Je — /settings/import porte aussi la zone du pack de contexte (input multiple) : viser celle de l'assistant.
    await page.setInputFiles('input[type="file"]:not([multiple])', {
      name: 'contacts-1000.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`email,first_name\n${lines.join('\n')}\n`, 'utf-8'),
    })

    // SIMULER — le rapport annonce 1 000 lignes lues, et RIEN n'est encore écrit.
    await page.getByRole('button', { name: 'Simuler' }).click()
    await expect(page.getByText('1000 ligne(s) lue(s)')).toBeVisible()
    await expect(page.getByText('1000 création(s)')).toBeVisible()
    expect(applied).toBe(0)

    // IMPORTER — l'écriture part une fois, la restitution apparaît.
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.getByTestId('restitution-panel')).toBeVisible()
    expect(applied).toBe(1)
  })

  test('7 besoins : sept fiches de poste extraites, rien créé avant validation, sept créés après', async ({ page }) => {
    await mockSignedInShell(page, { userId: USER_ID, tag: '220835', features: ['needs'] })
    await page.route(/\/accounts\?/, route =>
      fulfillJson(route, {
        data: [{ id: ACCOUNT_ID, company_name: 'TF1' }],
        pagination: { hasNext: false, currentPage: 1, size: 100, totalItems: 1 },
      }),
    )
    await page.route(/\/projects\/needs\?/, route =>
      fulfillJson(route, {
        data: [],
        pagination: { totalItems: 0, hasNext: false, currentPage: 1, size: 20 },
        counters: { total: 0, withoutShortlist: 0, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 },
      }),
    )
    let extractions = 0
    const created: string[] = []
    // `**/rfp` et `**/projects/needs` matchent AUSSI la navigation vers ces pages :
    // seuls les appels `fetch`/`xhr` sont simulés, le document passe tel quel.
    await page.route('**/rfp', route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      if (route.request().method() !== 'POST') return fulfillJson(route, [])
      extractions += 1
      const body = route.request().postDataJSON() as { title: string }
      return fulfillJson(route, {
        rfp: {
          id: `rfp-${extractions}`,
          title: body.title,
          requirements: [{ id: `r-${extractions}`, section: '§2', text: 'React', kind: 'technical' }],
        },
      })
    })
    await page.route('**/projects/needs', route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      if (route.request().method() !== 'POST') return fulfillJson(route, { data: [] })
      const body = route.request().postDataJSON() as { title: string }
      created.push(body.title)
      return fulfillJson(route, { id: `need-${created.length}`, title: body.title, account_id: ACCOUNT_ID })
    })

    // #4344 — « Besoins ouverts » n'est plus un écran : le geste se fait depuis le pipe (/projects).
    await page.route('**/projects/pipeline**', route =>
      fulfillJson(route, {
        columns: [],
        intake: 0,
        signals: 0,
        total_count: 0,
        total_amount_cents: 0,
        total_without_amount: 0,
        signed_count: 0,
        signed_amount_cents: 0,
        signed_without_amount: 0,
        scope: { requested: 'own', applied: 'own', outsideAnyPortfolioCount: 0 },
      }),
    )
    await page.goto('/projects')
    await page.getByRole('button', { name: 'Importer des fiches de poste' }).first().click()

    await page.getByRole('combobox', { name: 'Compte client' }).click()
    await page.getByRole('option', { name: 'TF1' }).click()
    const titles = [
      'Architecte cloud',
      'Dev PHP',
      'Data engineer',
      'Chef de projet SI',
      'DevOps',
      'Product owner',
      'QA lead',
    ]
    await page
      .getByLabel('Choisir des fichiers')
      .setInputFiles(
        titles.map(title => ({ name: `${title}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })),
      )
    await page.getByRole('button', { name: 'Extraire' }).click()

    // Sept besoins prévisualisés, RIEN créé : la validation est un geste distinct.
    await expect(page.getByRole('button', { name: 'Créer 7 besoins' })).toBeVisible({ timeout: 30_000 })
    expect(extractions).toBe(7)
    expect(created).toHaveLength(0)

    await page.getByRole('button', { name: 'Créer 7 besoins' }).click()
    await expect.poll(() => created.length, { timeout: 30_000 }).toBe(7)
    expect([...created].sort()).toEqual([...titles].sort())
  })
})
