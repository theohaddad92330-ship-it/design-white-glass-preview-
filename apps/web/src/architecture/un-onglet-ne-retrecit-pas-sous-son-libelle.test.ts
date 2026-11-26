import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-290 — un onglet ne rétrécit jamais sous son propre libellé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ — #1882 (11/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Bug sur les éléments sélectionnés, ils débordent sur ceux qui les
 * entourent, l'UI est buggé ici. » Retour de Louis sur `/accounts/:id?tab=veille`,
 * la barre de filtres de la veille (`WatchFilters.tsx`).
 *
 * Mesuré dans le navigateur, sur la production, pas déduit des classes :
 *
 *   liste  ..................... 394,6 × 36 px
 *   Tous ........... x=284,0  w=77,7   libellé  30,5 px  → tient
 *   Recrutements ... x=361,7  w=77,7   libellé  92,5 px  → DÉBORDE de 32,5 px
 *   Projets ........ x=439,4  w=77,7   libellé  46,5 px
 *   Achats ......... x=517,2  w=77,7   libellé  45,5 px
 *   Organisation ... x=594,9  w=77,7   libellé  83,6 px  → DÉBORDE de 23,5 px
 *   `getComputedStyle(trigger).minWidth` ......................... « 0px »
 *
 * Cinq boutons EXACTEMENT de la même largeur (389 / 5 = 77,7), chacun plus
 * étroit que son libellé, et `whitespace-nowrap` interdit le retour à la ligne :
 * le texte sort de sa boîte et se pose sur celle du voisin. Le dernier libellé
 * finissait au pixel près sur le bord de la liste, ses 8 px de `px-2` mangés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CAUSE — DEUX RÈGLES JUSTES QUI SE DÉFONT L'UNE L'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `TabsTrigger` porte `flex-1`, donc `flex: 1 1 0%` : base zéro, part égale.
 * En amont (shadcn), rien ne casse, parce qu'un enfant de flex a
 * `min-width: auto` — sa taille minimale AUTOMATIQUE est celle de son contenu,
 * et c'est ce plancher qui empêche la part égale de descendre sous le libellé.
 *
 * Ce dépôt retire ce plancher PARTOUT, exprès :
 *
 *   apps/web/src/index.css:213 — :where(.flex, .inline-flex, .grid, .inline-grid) > * { min-width: 0 }
 *
 * Cette règle-là est juste aussi : `min-width: auto` est la cause n°1 de
 * débordement horizontal d'une interface responsive (trois occurrences le
 * 23/08/2026). Elle a une spécificité NULLE pour qu'une classe explicite
 * l'emporte — mais encore faut-il que quelqu'un l'écrive.
 *
 * Donc : le plancher que `flex-1` suppose doit être REMIS à la main, là où
 * `flex-1` est écrit. C'est ce que cette garde exige.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS LA PREMIÈRE FOIS — ET C'EST POUR ÇA QU'ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 31/08/2026, le MÊME défaut a été mesuré sur la fiche d'un talent : dix
 * onglets superposés, illisibles. Le diagnostic est écrit mot pour mot dans
 * `features/consultants/view/detail/TalentDetailPage.tsx` (§ « POURQUOI `TabNav`
 * ET NON `Tabs` »). L'écran a changé de composant ; la primitive, elle, est
 * restée cassée pour le suivant — qui est arrivé onze jours plus tard.
 *
 * Réparer l'écran deux fois sans réparer la primitive garantit une troisième
 * fois. La garde tient la primitive.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROUVE D'ELLE-MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois preuves, comme toute garde du dépôt : elle LIT quelque chose (le corpus
 * n'est pas vide), elle sait dire NON (on casse volontairement la chaîne
 * qu'elle protège), et elle n'attrape PAS ce qu'elle ne vise pas (`TabsList`,
 * qui ne porte pas `flex-1`, n'a rien à déclarer).
 */

const TABS = join(__dirname, '../../../../packages/ui/src/components/tabs.tsx')

/**
 * Les classes d'un composant de `tabs.tsx` — le LITTÉRAL passé à `cn(...)`, et
 * rien d'autre.
 *
 * ⚠️ La première version de cette fonction rendait le corps entier de la
 * fonction, du `function X(` au suivant. Elle a mordu au premier essai : le
 * docblock qui RACONTE ce défaut, écrit juste au-dessus de `TabsTrigger`, tombe
 * entre les deux et contient le mot `flex-1`. Le témoin de cas légitime (« la
 * liste ne partage pas la part égale ») est passé au rouge sur du code juste.
 * C'est le motif connu « une garde qui lit un commentaire », dans son sens
 * inverse : ici il fait échouer au lieu de faire passer, mais la cause est la
 * même — le corpus était plus large que la cible.
 */
function classesOf(component: 'TabsList' | 'TabsTrigger'): string {
  const source = readFileSync(TABS, 'utf8')
  const start = source.indexOf(`function ${component}(`)
  expect(start, `${component} introuvable dans tabs.tsx`).toBeGreaterThan(-1)
  const call = source.indexOf('cn(', start)
  expect(call, `le cn(...) de ${component} est introuvable`).toBeGreaterThan(start)
  const opening = source.slice(call + 3).search(/['"]/)
  const quote = source[call + 3 + opening]
  const from = call + 4 + opening
  const closing = source.indexOf(quote, from)
  expect(closing, `le littéral de classes de ${component} n'est pas fermé`).toBeGreaterThan(from)
  return source.slice(from, closing)
}

/** Un plancher de largeur EXPLICITE — ce que `min-width: auto` donnait tout seul. */
const FLOOR = /\bmin-w-(min|fit|max)\b/

describe('GA-290 — un onglet ne rétrécit pas sous son libellé', () => {
  it('lit bien quelque chose — un corpus vide serait vert pour toujours', () => {
    const trigger = classesOf('TabsTrigger')
    expect(trigger.length).toBeGreaterThan(400)
    // Les deux moitiés du défaut : la part égale, et l'interdiction de replier.
    expect(trigger).toContain('flex-1')
    expect(trigger).toContain('whitespace-nowrap')
  })

  it('`TabsTrigger` porte un plancher de largeur explicite', () => {
    const trigger = classesOf('TabsTrigger')
    expect(trigger).toMatch(FLOOR)
    // `min-w-0` re-poserait exactement le zéro que la règle globale pose déjà.
    expect(trigger).not.toMatch(/\bmin-w-0\b/)
  })

  it('sait dire NON : sans le plancher, l’assertion échoue', () => {
    const withoutFloor = classesOf('TabsTrigger').replace(FLOOR, '')
    expect(withoutFloor).not.toMatch(FLOOR)
  })

  it('n’attrape PAS ce qu’elle ne vise pas : `TabsList` ne partage pas la part égale', () => {
    const list = classesOf('TabsList')
    expect(list.length).toBeGreaterThan(80)
    expect(list).toContain('inline-flex')
    // Pas de `flex-1` sur la liste : elle n'a donc aucun plancher à déclarer,
    // et la garde ne doit rien lui demander.
    expect(list).not.toContain('flex-1')
  })
})
