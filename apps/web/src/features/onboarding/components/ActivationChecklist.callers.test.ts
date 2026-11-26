import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2077.2 — « INTÉGRER LES ÉTAPES DANS LAURA ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE LIT DES FICHIERS PLUTÔT QUE DE MONTER UN ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 * Ce que le point mesure n'est pas un rendu, c'est un APPELANT : la liste
 * d'étapes existait, testée, et ne vivait que sur le tableau de bord —
 * l'écran que personne n'ouvre en premier depuis que Laura est l'arrivée
 * (et, en mobile, le premier onglet). Du code juste que personne n'appelle là
 * où il compte.
 *
 * Et elle vit dans la ROUTE, jamais dans `Chat` : `routes/chat/index.tsx` le
 * dit déjà mot pour mot pour `LauncherProvider` — ce qui lit react-query reste
 * au-dessus, sinon la dépendance descend dans les treize suites unitaires du
 * copilote, qui n'ont pas de `QueryClientProvider`. Monter l'écran ici pour
 * prouver un appelant reviendrait donc à recréer le problème que la structure
 * évite.
 *
 * Les trois preuves qu'une garde doit donner :
 *  - elle LIT quelque chose : le corpus est vérifié non vide avant toute
 *    assertion (un `readFileSync` qui rendrait une chaîne vide passerait
 *    silencieusement un `not.toContain`) ;
 *  - elle sait dire NON : retirer `<ActivationChecklist />` de l'un des deux
 *    fichiers fait rougir la ligne qui le nomme ;
 *  - elle n'attrape pas ce qu'elle ne vise pas : le témoin ci-dessous vérifie
 *    qu'elle ne se contente PAS de trouver le mot quelque part — l'import seul
 *    ne suffit jamais, c'est la BALISE rendue qu'elle exige.
 */
const ROOT = join(__dirname, '..', '..', '..')

function source(relative: string): string {
  const text = readFileSync(join(ROOT, relative), 'utf8')
  // Le corpus n'est pas vide : sans cette ligne, un chemin devenu faux
  // rendrait une garde verte qui ne lit rien.
  expect(text.length).toBeGreaterThan(200)
  return text
}

describe('#2077.2 — les étapes d’activation ont un appelant sur Laura ET sur le tableau de bord', () => {
  it('la route de Laura REND la liste d’étapes', () => {
    const chatRoute = source('routes/chat/index.tsx')
    expect(chatRoute).toContain('<ActivationChecklist />')
  })

  it('le tableau de bord la rend toujours — l’un ne remplace pas l’autre', () => {
    const dashboard = source('features/dashboard/view/DashboardContent.tsx')
    expect(dashboard).toContain('<ActivationChecklist />')
  })

  it('LE TÉMOIN — un import sans rendu ne compte pas pour un appelant', () => {
    // Le composant lui-même s'importe partout ; ce qui prouve l'appelant est
    // la balise. On vérifie donc que la garde distingue les deux, sur un
    // fichier qui NOMME `ActivationChecklist` en commentaire sans le rendre.
    const preferences = source('features/settings/view/HelpAndAboutGroups.tsx')
    expect(preferences).toContain('ActivationChecklist')
    expect(preferences).not.toContain('<ActivationChecklist />')
  })
})
