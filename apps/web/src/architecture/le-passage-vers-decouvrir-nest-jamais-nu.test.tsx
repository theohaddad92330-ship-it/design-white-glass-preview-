import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { linkableRoutes } from '@/components/navigation/known-routes'
import { DISCOVER_ROUTE, DiscoverHandoff, discoverCriteriaOfReply } from '@/features/chat/view/discover-handoff'
import { renderMarkdown } from '@/features/chat/view/markdown'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #2472 — UN PASSAGE DU CHAT VERS DÉCOUVRIR N'ARRIVE JAMAIS NU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour du 16/09/2026 : « quand je clique sur découvrir la requete de
 * decouvrir est pas préremplie ». Deux chemins mènent de la réponse de Laura à
 * l'écran Découvrir — la carte de proposition (`PendingActions`) et le lien
 * qu'elle écrit dans son TEXTE (`markdown.tsx`, que son prompt lui demande
 * d'écrire). Le premier emportait les critères, le second partait nu : même
 * bulle, mêmes critères sous les yeux, écran d'arrivée vierge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES QU'UNE GARDE DOIT FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Elle LIT quelque chose.** Deux corpus réels, tous deux comptés :
 *    `linkableRoutes()` (les écrans vers lesquels Laura a le droit d'envoyer,
 *    dérivés de la navigation) et les sources de `apps/web/src`.
 *  · **Elle sait dire NON.** MESURÉ le 16/09/2026 : retirer les critères du
 *    chemin dans `InternalLink` (`href={href}` → `href={to}` et
 *    `void navigate({ to: href })` → `void navigate({ to })`) la fait rougir, sur
 *    ce message exactement :
 *
 *        AssertionError: expected '/discover' to match /^\/discover\?/
 *
 *    Déballer la bulle (`<StructuredReply>` sorti de `<DiscoverHandoff>` dans
 *    `Chat.tsx`) la fait rougir aussi, sur le corpus de sources.
 *  · **Elle n'attrape pas ce qu'elle ne vise pas.** Deux témoins : AUCUN des
 *    autres écrans linkables ne reçoit ces paramètres (ils ne les lisent pas —
 *    ce serait un filtre fantôme), et une réponse SANS proposition laisse le
 *    lien « Découvrir » exactement tel qu'il était avant ce lot.
 */

const WEB_SRC = join(__dirname, '..')
const CHAT_VIEW = join(WEB_SRC, 'features', 'chat', 'view')

const CRITERIA = discoverCriteriaOfReply([{ action: 'find_accounts', sectors: ['it'], department: '31' }])

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourcesUnder(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

/** Les commentaires ne sont pas du code : les compter ferait mentir la garde. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function renderReply(text: string, criteria: Readonly<Record<string, string>> | null) {
  return renderWithRouter(<DiscoverHandoff criteria={criteria}>{renderMarkdown(text)}</DiscoverHandoff>)
}

describe('#2472 — la garde lit de vrais corpus', () => {
  it('les écrans que Laura peut proposer forment un corpus non vide, et Découvrir en fait partie', () => {
    const routes = linkableRoutes()
    expect(routes.length).toBeGreaterThan(10)
    expect(routes).toContain(DISCOVER_ROUTE)
  })

  it('les sources du web forment un corpus non vide', () => {
    expect(sourcesUnder(WEB_SRC).length).toBeGreaterThan(500)
  })

  it('les critères de référence existent — sinon tout ce qui suit serait vert pour rien', () => {
    // #2165.64 — `laura: '1'` marque l'origine CONVERSATION (voir discover-handoff.tsx).
    expect(CRITERIA).toEqual({ sectors: 'it', department: '31', laura: '1' })
  })
})

describe('#2472 — les critères voyagent vers Découvrir, et nulle part ailleurs', () => {
  it('le lien écrit dans le texte de la réponse emporte les critères préparés', async () => {
    renderReply('Regarde [Découvrir](/discover) pour la suite.', CRITERIA)
    const href = (await screen.findByRole('link', { name: 'Découvrir' })).getAttribute('href') ?? ''
    expect(href).toMatch(/^\/discover\?/)
    expect(href).toContain('sectors=it')
    expect(href).toContain('department=')
  })

  it('témoin — AUCUN autre écran linkable ne reçoit ces paramètres', async () => {
    const others = linkableRoutes().filter(route => route !== DISCOVER_ROUTE)
    expect(others.length).toBeGreaterThan(10)
    for (const route of others) {
      const { unmount } = renderReply(`Ouvre [là](${route}).`, CRITERIA)
      expect(await screen.findByRole('link', { name: 'là' })).toHaveAttribute('href', route)
      unmount()
    }
  })

  it('témoin — sans proposition, le lien « Découvrir » reste celui d’avant ce lot', async () => {
    renderReply('- **[Découvrir](/discover)** : pour en trouver de nouveaux', null)
    expect(await screen.findByRole('link', { name: 'Découvrir' })).toHaveAttribute('href', DISCOVER_ROUTE)
  })
})

describe('#2472 — une seule dérivation, et elle est branchée à la bulle', () => {
  it('`discoverSearch` n’est DÉFINIE qu’à un seul endroit (GA-26)', () => {
    const sources = sourcesUnder(WEB_SRC)
    expect(sources.length).toBeGreaterThan(500)
    const definers = sources
      .filter(file => /function discoverSearch\s*\(/.test(stripComments(readFileSync(file, 'utf8'))))
      .map(file => relative(WEB_SRC, file))
    expect(definers).toEqual(['features/chat/view/discover-handoff.tsx'])
  })

  it('la carte de proposition appelle CETTE dérivation plutôt que la sienne', () => {
    const source = stripComments(readFileSync(join(CHAT_VIEW, 'PendingActions.tsx'), 'utf8'))
    expect(source).toContain("import { discoverSearch } from './discover-handoff'")
    // #1933.8 a depuis mêlé `returnToConversationSearch(conversationId)` au même
    // objet `search` (le lien « Revenir à la conversation ») : la dérivation des
    // CRITÈRES doit rester `discoverSearch(action)`, peu importe ce qui l'entoure.
    expect(source).toMatch(/to:\s*'\/discover',[\s\S]{0,200}discoverSearch\(action\)/)
  })

  it('la bulle FOURNIT les critères au texte de la réponse', () => {
    const source = stripComments(readFileSync(join(CHAT_VIEW, 'Chat.tsx'), 'utf8'))
    // La bulle reçoit les critères du fil…
    expect(source).toMatch(/discoverCriteria=\{/)
    // … et le texte de la réponse est rendu DANS le fournisseur, pas à côté.
    const opened = source.indexOf('<DiscoverHandoff')
    const closed = source.indexOf('</DiscoverHandoff>')
    expect(opened).toBeGreaterThan(-1)
    expect(closed).toBeGreaterThan(opened)
    expect(source.slice(opened, closed)).toContain('<StructuredReply')
  })
})
