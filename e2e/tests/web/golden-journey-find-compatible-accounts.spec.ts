import { expect, test } from '@playwright/test'
import { fulfillJson, mockSignedInShell } from './golden-journey-fixtures'

/**
 * #2208.39 (golden journey 8) — TROUVER LES COMPTES COMPATIBLES.
 *
 * Un comportement de Laura ne se ferme que sur une réponse OBSERVÉE dans
 * `/chat` (décision Louis 30/09) : ce test rejoue le tour entier — la
 * suggestion de l'accueil → la question réellement envoyée à `POST /ia/chat`
 * → la réponse diffusée en SSE, affichée dans le fil.
 *
 * Ce que le test prouve du CLIENT : le clic sur la suggestion prépare le texte
 * exact dans le champ sans rien envoyer, puis « Envoyer » le fait PARTIR (une
 * requête, ce texte) ; la réponse arrive dans le fil, comptes nommés. Le contenu
 * serveur (quels comptes, d'après quelles sources) n'est pas prouvé ici.
 *
 * Question exacte à poser en recette sur prod : « Trouve-moi des comptes
 * compatibles avec mon offre, dans mon secteur cible. » — vérifier que Laura
 * nomme des comptes réels de l'espace, avec le critère de compatibilité, et
 * qu'elle ne répond jamais par une liste générique de grands comptes.
 */

const USER_ID = '4b7a4b1e-0008-4a11-9c33-2208390000ab'
const PROMPT = 'Trouve-moi des comptes compatibles avec mon offre, dans mon secteur cible.'
const REPLY_TEXT =
  'Voici deux comptes compatibles avec ton offre : Nova Conseil (secteur énergie, besoin Java ouvert) et Orion SI (secteur énergie, 3 contacts décideurs).'

function sseFrame(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

test.describe('#2208.39 — golden journey : trouver les comptes compatibles', () => {
  test('la suggestion de l’accueil envoie la question et affiche la réponse de Laura', async ({ page }) => {
    await mockSignedInShell(page, { userId: USER_ID, tag: '220839', features: ['chat_ai'] })
    await page.route('**/profiles/me', route =>
      fulfillJson(route, {
        id: '9b1c2d3e-2208-4a61-8b72-220839000a',
        user_id: USER_ID,
        email: 'e2e-220839@bellum-ai.com',
        first_name: 'Golden',
        last_name: 'Journey',
        avatar_url: null,
        timezone: 'Europe/Paris',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        auth_created_at: '2026-01-01T00:00:00.000Z',
        auth_last_sign_in_at: '2026-10-01T08:00:00.000Z',
      }),
    )
    await page.route('**/accounts?*', route =>
      fulfillJson(route, {
        data: [],
        pagination: { currentPage: 1, size: 25, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false },
      }),
    )
    await page.route('**/tool-registry', route => fulfillJson(route, []))
    await page.route('**/ia/chat/history*', route => fulfillJson(route, { items: [] }))
    await page.route('**/ia/chat/messages*', route => {
      if (route.request().method() === 'GET') return fulfillJson(route, { messages: [] })
      const posted = route.request().postDataJSON() as { role?: string; content?: string }
      return fulfillJson(route, {
        message: {
          id: `e2e-220839-${posted.role ?? 'msg'}`,
          role: posted.role ?? 'user',
          content: posted.content ?? '',
          created_at: new Date().toISOString(),
        },
      })
    })
    const turns: string[] = []
    await page.route('**/ia/chat', route => {
      turns.push(route.request().postData() ?? '')
      return route.fulfill({
        contentType: 'text/event-stream',
        body: [
          sseFrame({ type: 'step', label: 'Recherche de comptes compatibles…' }),
          sseFrame({ type: 'delta', text: REPLY_TEXT }),
          sseFrame({ type: 'done', success: true, data: { reply: REPLY_TEXT, turn_id: 'turn-e2e-220839' } }),
        ].join(''),
      })
    })

    await page.goto('/chat')
    await expect(page.getByRole('textbox', { name: 'Message à Laura' })).toBeVisible()
    expect(turns).toHaveLength(0)

    // Le clic PRÉPARE la question dans le champ — il n'envoie rien (Laura prépare, le commercial envoie).
    await page.getByRole('button', { name: 'Trouver des comptes compatibles' }).click()
    await expect(page.getByRole('textbox', { name: 'Message à Laura' })).toHaveValue(PROMPT)
    expect(turns).toHaveLength(0)

    // L'envoi est un geste distinct : la question réellement envoyée est celle de la suggestion.
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
    await expect.poll(() => turns.length).toBe(1)
    expect(turns[0]).toContain(PROMPT)
    // Et la réponse arrive dans le fil, comptes nommés.
    await expect(page.getByText(REPLY_TEXT)).toBeVisible()
  })
})
