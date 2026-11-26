import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #1321.1 — « Supprimer "Commandes" comme onglet/page principale séparée.
 * Conserver tout le catalogue backend, mais l'intégrer directement dans
 * Conversation. »
 *
 * Décision de Louis le 02/09 : **tiroir dans le chat, route redirigée.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Ton diagnostic : « en faire une page séparée pleine de grandes cartes crée
 * une rupture avec la conversation et donne l'impression d'une bibliothèque de
 * formulaires ». Et le risque de fond : « une deuxième interface concurrente »
 * — c'est-à-dire deux endroits où demander la même chose à Laura.
 *
 * Le catalogue ne bouge pas. Il change d'endroit : un tiroir ouvert depuis la
 * ligne d'outils du composer, là où l'on est déjà en train d'écrire.
 *
 * ⚠️ La route REDIRIGE au lieu de disparaître : elle a des liens entrants et
 * des favoris. C'est la forme que Louis a choisie entre les trois proposées.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lire = (...p: string[]) => readFileSync(join(racineWeb, 'src', ...p), 'utf8')

describe('les commandes vivent DANS la conversation', () => {
  it('un déclencheur ouvre le catalogue depuis la ligne d’outils du composer', () => {
    const chat = lire('features', 'chat', 'view', 'Chat.tsx')

    // La garde LIT quelque chose.
    expect(chat).toContain('ScopeButton')
    expect(chat).toContain('CommandDrawerButton')
  })

  it('le catalogue reste UN seul catalogue — le tiroir lit la même source', () => {
    const tiroir = lire('features', 'chat-commands', 'view', 'CommandDrawerButton.tsx')

    // `useCommandLibrary` est la SEULE lecture du catalogue. Le tiroir n'a pas
    // sa propre requête : deux sources afficheraient deux catalogues.
    expect(tiroir).toContain('useCommandLibrary')
    // Et l'ordre des moments vient du CONTRAT, pas d'une copie — deux listes
    // divergent le jour où un moment s'ajoute. #5043 : la vue par domaine (et
    // `categories.ts`, son ordre) est partie ; les moments sont le seul rangement.
    expect(tiroir).toContain('COMMAND_MOMENTS')
    expect(tiroir).toContain("from '@bellum/contracts'")
  })

  it('l’ancienne route n’existe plus — #4359, la page « introuvable » répond à ce lien', () => {
    expect(() => lire('routes', 'chat', 'commandes.tsx')).toThrow()
  })

  it('l’onglet a quitté la barre de navigation', () => {
    const nav = lire('components', 'navigation', 'sections.ts')

    // La garde LIT le fichier — sans ceci, un chemin faux la rendrait verte.
    expect(nav).toContain("labelKey: 'tabs.today'")
    expect(nav).not.toMatch(/\{\s*to:\s*'\/chat\/commandes'/)
  })

  it('sait dire NON — l’entrée de nav d’avant serait attrapée', () => {
    const avant = "{ to: '/chat/commandes', labelKey: 'tabs.commands' },"

    expect(/\{\s*to:\s*'\/chat\/commandes'/.test(avant)).toBe(true)
  })
})
