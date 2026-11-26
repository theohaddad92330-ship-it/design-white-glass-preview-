import { expect, test } from '@playwright/test'
import { fulfillJson, mockSignedInShell } from './golden-journey-fixtures'

/**
 * #2958.107 (GO #2208, lot P04 09/10) — RECETTE HERVÉ, signée par ce scénario
 * (décision Louis 09/10 : vert en CI = signé).
 *
 * QUI EST HERVÉ ICI
 * ─────────────────
 * Le persona NON FORMÉ des registres de tri (#2115.48, #2155.29, #2436.13) :
 * il doit comprendre chaque section sans formation, un objectif par écran, un
 * geste nommé par résultat, aucun jargon laissé sans définition.
 *
 * RÈGLES DU SCÉNARIO
 * ──────────────────
 *  - UNE seule URL tapée : l'accueil ;
 *  - on ne clique que ce que l'écran propose (navigation, aide de vocabulaire,
 *    porte du pipe vide, bouton du formulaire) ;
 *  - l'écriture est VÉRIFIÉE : rien ne part tant que le formulaire est
 *    incomplet, UNE création part ensuite, avec exactement ce qui a été saisi.
 */

const USER_ID = '4b7a4b1e-0107-4a11-9c33-295810700001'
const ACCOUNT_ID = 'a1b2c3d4-0107-4a11-8c33-295810700001'
const NEW_PROJECT_ID = '29581070-0000-4000-8000-000000000001'

test.describe('#2958.107 — recette Hervé : il comprend où il est et ouvre sa première affaire sans formation', () => {
  test('de l’accueil à sa première opportunité, chaque mot du pipe défini', async ({ page }) => {
    test.setTimeout(120_000)
    await mockSignedInShell(page, { userId: USER_ID, tag: '2958107', features: ['needs', 'pipe'] })
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
    await page.route(/\/accounts\?/, route =>
      fulfillJson(route, {
        data: [{ id: ACCOUNT_ID, company_name: 'Banque Rhône-Alpes' }],
        pagination: { hasNext: false, currentPage: 1, size: 100, totalItems: 1 },
      }),
    )
    const created: Array<Record<string, unknown>> = []
    await page.route(/\/projects(\?|$)/, route => {
      if (route.request().resourceType() === 'document') return route.fallback()
      if (route.request().method() !== 'POST') return fulfillJson(route, [])
      created.push(route.request().postDataJSON() as Record<string, unknown>)
      return fulfillJson(route, {
        project: { id: NEW_PROJECT_ID, label: 'Refonte du poste de travail' },
        renewal_linked: false,
      })
    })

    // La seule URL : l'accueil.
    await page.goto('/')
    await page.getByRole('link', { name: 'Affaires', exact: true }).click({ timeout: 30_000 })

    // L'écran dit ce qu'il est, en une phrase, et nomme ses portes (appels d'offres, besoins à pourvoir).
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ton activité commerciale', {
      timeout: 30_000,
    })
    await expect(page.getByText('Vois ce qui avance, ce qui bloque')).toBeVisible()
    // #4340 / #4341 / #4344 (décision Louis 19/10) — Affaires = le pipe seul : plus de barre
    // Pipe · Pistes · Appels d'offres, et l'entête du pipe ne porte plus « Appels d'offres » ni
    // « Besoins à pourvoir » (garde `tabs-removed-19-10`). Les pistes vivent dans Signaux, l'appel
    // d'offres part d'une affaire (« Répondre à un appel d'offres »), les besoins se lisent dans le pipe.
    await expect(page.getByRole('tab', { name: /^Pistes$/ })).toHaveCount(0)
    for (const door of [/^Appels d['’]offres$/, /^Besoins à pourvoir$/]) {
      await expect(page.getByRole('button', { name: door }).or(page.getByRole('link', { name: door }))).toHaveCount(0)
    }

    // #4198 — « Ces mots, précisément » est supprimé : l'écran n'emploie plus de jargon à définir.

    // Le pipe vide propose ses portes, chacune nommée par son résultat.
    await expect(page.getByText(/Ton pipe est vide/)).toBeVisible()
    await page.getByRole('link', { name: 'Créer une première opportunité' }).click()

    // Rien ne part tant que le compte et le nom manquent.
    const submit = page.getByRole('button', { name: /Créer l.affaire/ })
    await expect(submit).toBeDisabled()
    await page.getByRole('combobox', { name: 'Compte' }).click()
    await page.getByRole('option', { name: 'Banque Rhône-Alpes' }).click()
    await expect(submit).toBeDisabled()
    expect(created).toHaveLength(0)
    await page.getByLabel(/Nom de l.affaire/).fill('Refonte du poste de travail')
    await submit.click()

    // UNE création, exactement ce qui a été saisi ; un montant non saisi reste inconnu, jamais 0 €.
    await expect(page.getByText('Affaire créée')).toBeVisible()
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      account_id: ACCOUNT_ID,
      label: 'Refonte du poste de travail',
      estimated_amount: null,
    })
  })
})
