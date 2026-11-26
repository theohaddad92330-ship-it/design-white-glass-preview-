import { expect, test } from '@playwright/test'
import { fulfillJson, mockSignedInShell, openImportByTool } from './golden-journey-fixtures'

/**
 * #2958.106 (GO #2208, lot P04 09/10) — RECETTE ANTOINE, signée par ce
 * scénario (décision Louis 09/10 : vert en CI = signé).
 *
 * QUI EST ANTOINE ICI
 * ───────────────────
 * Le registre de tri du 14/09 (#2167.42/.43/.96) le définit : Antoine arrive
 * avec l'EXPORT DE SON CRM (927 contacts) et doit RETROUVER ses contacts dans
 * l'annuaire. Rien de plus : pas d'analyse payante, pas d'URL connue.
 *
 * RÈGLES DU SCÉNARIO
 * ──────────────────
 *  - UNE seule URL tapée : `/contacts`, destination de la navigation, vide ;
 *  - on ne clique que ce que l'écran propose (porte de l'état vide, bouton
 *    de l'assistant, entrée de la navigation) ;
 *  - chaque écriture est VÉRIFIÉE : la simulation n'écrit rien, l'import part
 *    UNE fois, et l'annuaire relu affiche le total que le serveur rapporte.
 */

const USER_ID = '4b7a4b1e-0106-4a11-9c33-295810600001'
const SESSION_ID = 's-e2e-antoine-927'
const ANTOINE_TOTAL = 927

function contactRow(i: number): Record<string, unknown> {
  return {
    id: `c0000000-0106-4000-8000-${String(i).padStart(12, '0')}`,
    first_name: `Contact${i}`,
    last_name: 'Antoine',
    full_name: `Contact${i} Antoine`,
    email: `contact${i}@client-antoine.fr`,
    title: null,
    company_name: null,
    account_id: null,
    source: 'import',
    created_at: '2026-10-09T09:00:00.000Z',
    updated_at: '2026-10-09T09:00:00.000Z',
  }
}

test.describe('#2958.106 — recette Antoine : son export CRM devient son annuaire', () => {
  test('de l’annuaire vide à ses 927 contacts, sans URL connue ni écriture muette', async ({ page }) => {
    test.setTimeout(120_000)
    await mockSignedInShell(page, { userId: USER_ID, tag: '2958106', features: ['accounts'] })

    let applied = 0
    let dryRuns = 0
    // Le serveur simulé est À ÉTAT : l'annuaire est vide AVANT l'import, plein APRÈS.
    await page.route(/\/contacts(\?|$)/, route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      const rows = applied > 0 ? Array.from({ length: 25 }, (_, i) => contactRow(i)) : []
      const total = applied > 0 ? ANTOINE_TOTAL : 0
      // La forme du contrat (`paginationSchema`) : le total est `totalItems`, jamais `total`.
      return fulfillJson(route, {
        data: rows,
        pagination: {
          currentPage: 1,
          size: 25,
          totalItems: total,
          totalPages: Math.ceil(total / 25),
          hasNext: total > 25,
          hasPrev: false,
        },
      })
    })
    await page.route('**/import/sources', route =>
      fulfillJson(route, [
        {
          key: 'hubspot_export',
          objects: ['account', 'contact', 'project', 'activity'],
          format: 'csv',
          readable: true,
          tier: 'mvp',
          imports: ['Entreprises, contacts, affaires'],
          skips: ['Pièces jointes'],
          howTo: 'Exporte tes contacts en CSV depuis ton CRM.',
          required: ['email'],
          fields: ['email', 'first_name', 'last_name'],
        },
      ]),
    )
    await page.route('**/import/sessions', route => {
      if (route.request().method() !== 'POST') return fulfillJson(route, [])
      return fulfillJson(route, {
        id: SESSION_ID,
        source: 'hubspot_export',
        object_type: 'contact',
        state: 'draft',
        created_at: '2026-10-09T09:00:00.000Z',
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
      rowsRead: ANTOINE_TOTAL,
      creations: ANTOINE_TOTAL,
      updates: 0,
      overwrittenFields: 0,
      duplicates: [],
      skipped: [],
      mappedColumns: ['email', 'first_name', 'last_name'],
      ignoredColumns: [],
      missingRequiredColumns: [],
      withoutLegalBasis: 0,
      truncated: false,
      errors: [],
      sensitiveColumns: [],
      possibleDuplicates: [],
    }
    await page.route(`**/import/sessions/${SESSION_ID}/dry-run`, route => {
      dryRuns += 1
      return fulfillJson(route, {
        report,
        proposedMapping: {
          columns: { email: 'email', first_name: 'first_name', last_name: 'last_name' },
          ignored: [],
          disabledRules: [],
        },
        delimiter: ',',
        detectedSource: { certainty: 'none' },
        columnConfidence: {},
        mappingSuggestions: {},
      })
    })
    await page.route(`**/import/sessions/${SESSION_ID}/apply`, route => {
      applied += 1
      return fulfillJson(route, {
        created: ANTOINE_TOTAL,
        updated: 0,
        skippedUnknownCompany: 0,
        written: true,
        reason: null,
        resumedFromRow: 0,
        stopped: null,
        report,
      })
    })

    // La seule URL : l'annuaire, vide.
    await page.goto('/contacts')
    // L'en-tête de l'annuaire propose l'import, sans passer par une analyse payante.
    await page.getByRole('link', { name: 'Importer mes contacts' }).click({ timeout: 30_000 })

    await openImportByTool(page)
    await page.getByRole('button', { name: 'Choisir cette source' }).click({ timeout: 30_000 })
    const lines = Array.from({ length: ANTOINE_TOTAL }, (_, i) => `contact${i}@client-antoine.fr,Contact${i},Antoine`)
    // #4434 Je — /settings/import porte aussi la zone du pack de contexte (input multiple) : viser celle de l'assistant.
    await page.setInputFiles('input[type="file"]:not([multiple])', {
      name: 'export-crm-antoine.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`email,first_name,last_name\n${lines.join('\n')}\n`, 'utf-8'),
    })

    // SIMULER n'écrit rien : le rapport annonce les 927 lignes, l'import n'est pas parti.
    await page.getByRole('button', { name: 'Simuler' }).click()
    await expect(page.getByText(`${ANTOINE_TOTAL} ligne(s) lue(s)`)).toBeVisible()
    expect(dryRuns).toBe(1)
    expect(applied).toBe(0)

    // IMPORTER part une fois, et la restitution nomme CE qui a été écrit.
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    const restitution = page.getByTestId('restitution-panel')
    await expect(restitution).toContainText(`${ANTOINE_TOTAL} contacts retrouvés.`)
    await expect(restitution).not.toContainText('comptes retrouvés')
    expect(applied).toBe(1)

    // #2958.106 — retrouver ses contacts par le geste que la restitution propose.
    await restitution.getByRole('link', { name: 'Voir les données' }).click()
    await expect(page).toHaveURL(/\/contacts/)
    await expect(page.getByText('Contact0 Antoine').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(String(ANTOINE_TOTAL)).first()).toBeVisible()
  })
})
