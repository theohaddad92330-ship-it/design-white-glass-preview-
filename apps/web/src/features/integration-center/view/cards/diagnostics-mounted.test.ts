import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CHAQUE carte qui reçoit `tools` monte son panneau de diagnostic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI « AU MOINS UN APPELANT » NE SUFFIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La garde de `wired-mutations` vérifie qu'un composant a AU MOINS un appelant.
 * Elle passait au vert avec six montages — pendant que la carte Google
 * Workspace, la plus utilisée de l'écran, n'en avait aucun. Sa structure diffère
 * des autres (elle rend sa propre grille au lieu du composant partagé), si bien
 * que le remplacement qui a monté les six ne l'a jamais touchée, et rien n'a
 * protesté.
 *
 * Trouvé en RECETTE LIVE : la carte affichait un grand vide là où les autres
 * montraient leurs capacités, leurs preuves datées et leurs boutons.
 *
 * La règle vérifiée est celle qui aurait mordu : recevoir `tools` est une
 * PROMESSE de les afficher.
 */

const CARDS = join(__dirname, 'connector-cards.tsx')

/** Les composants qui déstructurent `tools` — donc ceux à qui l'écran en donne. */
function componentsReceivingTools(source: string): string[] {
  return [...source.matchAll(/export function (\w+Card)\(\{([^}]*)\}: ConnectorCardProps\)/g)]
    .filter(match => (match[2] ?? '').includes('tools'))
    .map(match => match[1] as string)
}

/** Le corps d'un composant, jusqu'au suivant. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`)
  const next = source.indexOf('\nexport function ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

describe('les cartes de connecteur montent toutes leur diagnostic', () => {
  const source = readFileSync(CARDS, 'utf8')
  const receivers = componentsReceivingTools(source)

  it('la garde voit bien des cartes — une garde vide passe au vert pour toujours', () => {
    expect(receivers.length).toBeGreaterThanOrEqual(6)
  })

  it('aucune carte ne reçoit `tools` sans les afficher', () => {
    const silent = receivers.filter(name => !/<Diagnostics\b/.test(bodyOf(source, name)))
    if (silent.length > 0) {
      throw new Error(
        `Ces cartes reçoivent \`tools\` et n'affichent aucun diagnostic — l'écran montrera un vide à leur place :\n  ${silent.join('\n  ')}`,
      )
    }
    expect(silent).toEqual([])
  })
})

/**
 * #1443 — `tools` porte DEUX choses, et la seconde manquait.
 *
 * Le diagnostic répond à « est-ce que ça marche ? ». `allowed_actions` répond à
 * « qu'est-ce que ça m'apporte ? », et c'est la question qu'on se pose AVANT de
 * brancher. Elle est renvoyée par `GET /tool-registry` depuis le premier jour et
 * n'atteignait aucun pixel : `grep -rn allowed_actions apps/web/src` ne sortait
 * que des fixtures de test.
 *
 * La vérification porte sur les ENVELOPPES, pas sur les cartes : une carte OAuth
 * ne monte pas le bloc elle-même, elle le reçoit de `OAuthProviderCard`. Chaque
 * chemin est déclaré par CLÉ avec son fichier, et le fichier est lu sur le
 * disque — une liste de noms de composants, elle, ne prouverait rien.
 */
describe('#1443 — chaque enveloppe de carte montre ce que l’outil apporte', () => {
  const ENVELOPPES = [
    { quoi: 'les sept cartes OAuth', fichier: 'OAuthProviderCard.tsx' },
    { quoi: 'les six canaux d’équipe', fichier: 'WebhookBackedCard.tsx' },
    { quoi: 'la carte à formulaire', fichier: 'OdooCard.tsx' },
    { quoi: 'la carte de l’assistant', fichier: 'connector-cards.tsx' },
  ]

  it.each(ENVELOPPES)('$quoi monte le bloc de bénéfice', ({ fichier }) => {
    const source = readFileSync(join(__dirname, fichier), 'utf8')

    // LA GARDE LIT QUELQUE CHOSE : un chemin faux rendrait une chaîne vide, et
    // l'assertion suivante serait verte sur du néant.
    expect(source.length).toBeGreaterThan(500)
    expect(source).toMatch(/<ConnectorBenefits\s+tools=\{tools\}/)
  })

  it('sait dire NON — un bloc monté SANS ses actions ne compte pas', () => {
    expect(/<ConnectorBenefits\s+tools=\{tools\}/.test('<ConnectorBenefits />')).toBe(false)
  })
})
