import { expect, test } from '@playwright/test'
import { fulfillJson, mockSignedInShell, mockVivierList, talentRow } from './golden-journey-fixtures'

/**
 * #2208.32 (golden journey 1) — IMPORTER 800 CV.
 *
 * Huit cents CV ne tiennent ni dans la borne du transport en ligne (20 Mo,
 * 300 fichiers) : le geste réel est l'import VOLUMINEUX (dépôt direct par
 * morceaux, puis traitement en tâche de fond, jusqu'à 2 000 fichiers). Le
 * parcours : ouvrir le Vivier → choisir l'archive → l'écran DIT que c'est un
 * dépôt volumineux avant tout envoi → confirmer → voir la progression
 * (« n / 800 ») → lire un rapport qui compte les 800 fichiers, jamais un OK muet.
 *
 * Le protocole de reprise (TUS) est simulé au plus près du réel : `POST` de
 * création (201 + `Location`), puis `PATCH` (204 + `Upload-Offset` = taille).
 * Le contrat serveur n'est pas prouvé ici — seul le CLIENT l'est.
 */

const USER_ID = '4b7a4b1e-0001-4a11-9c33-2208320000ab'
const JOB_ID = 'job-800-cv'
const ARCHIVE_BYTES = 21 * 1024 * 1024
const STORAGE_ORIGIN = 'https://storage.e2e.invalid'

test.describe('#2208.32 — golden journey : importer 800 CV', () => {
  test('dépose une archive de 800 CV, suit la progression, lit un rapport complet', async ({ page }) => {
    // Le test entier (chargement du Vivier, archive de 21 Mo, deux sondages espacés de
    // 2 s, rapport) dépasse la borne PAR DÉFAUT de 30 s sur le runner de CI (33,3 s
    // mesurées) alors que l'étape 4 s'attend elle-même jusqu'à 30 s : le test est
    // coupé AVANT son assertion, d'où « élément introuvable » à tort.
    test.setTimeout(120_000)
    await mockSignedInShell(page, { userId: USER_ID, tag: '220832', features: ['talent_pool'] })
    await mockVivierList(page, [talentRow({ id: '11111111-1111-4111-8111-111111111111', fullName: 'Bastien Colin' })])

    let started = 0
    let polls = 0
    await page.route('**/talents/intake/zip/large-upload-url', route =>
      fulfillJson(route, {
        uploadUrl: `${STORAGE_ORIGIN}/object/upload`,
        path: 'cv-zip/e2e/800-cv.zip',
        token: 'e2e-token',
        bucket: 'cv-zip',
        resumableEndpoint: `${STORAGE_ORIGIN}/upload/resumable`,
      }),
    )
    await page.route(`${STORAGE_ORIGIN}/upload/resumable**`, route => {
      const method = route.request().method()
      const headers = {
        'Tus-Resumable': '1.0.0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': '*',
      }
      if (method === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: { ...headers, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' },
        })
      }
      if (method === 'POST') {
        return route.fulfill({
          status: 201,
          headers: { ...headers, Location: `${STORAGE_ORIGIN}/upload/resumable/e2e-1` },
        })
      }
      return route.fulfill({ status: 204, headers: { ...headers, 'Upload-Offset': String(ARCHIVE_BYTES) } })
    })
    await page.route(`${STORAGE_ORIGIN}/upload/resumable/**`, route => {
      const headers = {
        'Tus-Resumable': '1.0.0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': '*',
      }
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: { ...headers, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' },
        })
      }
      return route.fulfill({ status: 204, headers: { ...headers, 'Upload-Offset': String(ARCHIVE_BYTES) } })
    })
    await page.route('**/talents/intake/zip/large', route => {
      started += 1
      return fulfillJson(route, { job_id: JOB_ID, state: 'queued' })
    })
    await page.route(`**/talents/intake/zip/large/${JOB_ID}`, route => {
      polls += 1
      if (polls < 2)
        return fulfillJson(route, { state: 'running', jobId: JOB_ID, progress: { processed: 412, total: 800 } })
      return fulfillJson(route, {
        state: 'done',
        jobId: JOB_ID,
        result: {
          total: 800,
          summary: { created: 700, auto_updated: 60, exception: 25, too_big: 0, failed: 10, ignored: 5 },
          outcomes: [
            { status: 'exception', file: 'dupont-jean.pdf', consultantId: 'c-1', state: 'ambiguous', conflicts: [] },
            { status: 'failed', file: 'scan-martin.pdf', reason: 'Format illisible' },
          ],
        },
      })
    })

    await page.goto('/consultants')
    await expect(page.getByRole('heading', { name: 'Ton vivier' })).toBeVisible()

    // ÉTAPE 1 — l'entrée « archive ZIP » s'ouvre. Le paragraphe des plafonds a été retiré
    // du dialogue (#3598) : l'écran n'annonce plus « 300 fichiers par archive », on attend
    // donc le sélecteur d'archive lui-même.
    // L'import vit dans le menu « Importer » du Vivier : on choisit la source d'abord.
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await page.getByRole('button', { name: 'Importer une archive ZIP' }).click()
    await expect(page.getByLabel('Choisir une archive .zip')).toBeAttached()

    // ÉTAPE 2 — une archive de 21 Mo : l'écran la dit « volumineuse », rien n'est encore envoyé.
    await page.getByLabel('Choisir une archive .zip').setInputFiles({
      name: 'CV-800.zip',
      mimeType: 'application/zip',
      buffer: Buffer.alloc(ARCHIVE_BYTES, 0),
    })
    await expect(page.getByText(/Archive volumineuse \(21 Mo\)/)).toBeVisible()
    expect(started).toBe(0)

    // ÉTAPE 3 — confirmer lance l'import et la progression est LUE, pas devinée.
    await page.getByRole('button', { name: 'Importer (volumineux)' }).click()
    await expect(page.getByText('Traitement en cours… 412 / 800 fichier(s)')).toBeVisible({ timeout: 15_000 })
    expect(started).toBe(1)

    // ÉTAPE 4 — le rapport compte les 800 fichiers par issue.
    await expect(page.getByText(/700 créée\(s\)/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/60 mise\(s\) à jour/)).toBeVisible()
    await expect(page.getByText(/25 à revoir/)).toBeVisible()
    await expect(page.getByText(/5 ignoré\(s\) \(pas un CV\)/)).toBeVisible()
  })
})
