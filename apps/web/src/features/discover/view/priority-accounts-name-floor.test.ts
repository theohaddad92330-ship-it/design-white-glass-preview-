import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3082 (recette N, 27/09/2026) — bloc « Comptes prioritaires » de /discover :
 * mesuré en Chrome, `getComputedStyle(wrapper).minWidth` valait `0px` sur la
 * case identité (avatar + nom) de `CandidateRow`, alors que sa classe portait
 * `min-w-[220px] flex-1 flex-wrap`. Conséquence : un nom long s'écrase à
 * 49 px de large, un mot par ligne, sur 3 cartes prioritaires sur 5.
 *
 * Cause trouvée : `apps/web/src/index.css` pose un reset global
 * `:where(.flex, .inline-flex, .grid, .inline-grid) > * { min-width: 0 }`
 * pour tout enfant direct d'un conteneur flex/grid. Ce reset écrit des noms
 * de classes Tailwind BRUTS (`.flex`, `.grid`…) dans son sélecteur — Tailwind
 * les traite alors comme des candidats et régénère, pour CE sélecteur, un
 * jumeau par variante réellement utilisée ailleurs dans le dépôt
 * (`sm:`, `md:`, `lg:`, `pointer-coarse:`, `pointer-fine:`, et un jumeau
 * `!important` pour `.grid` à cause d'une négation JS « point
 * d'exclamation + grid » scannée dans `braille-loader.tsx`, prise pour la
 * classe Tailwind important). Le résultat mesuré en Chrome ne suit plus la spécificité CSS
 * attendue (`.min-w-\[220px\]` devrait battre `:where()`, spécificité 0) —
 * poser le plancher par une classe Tailwind arbitraire sur CETTE case reste
 * fragile face à ce reset. `style={{ minWidth: '220px' }}` (comme le
 * correctif manuel qui a confirmé le diagnostic : 936 px après forçage)
 * l'impose sans dépendre de cette course de spécificité.
 *
 * `bef5f6b649` (#3082, tour précédent) avait seulement protégé le `<span>`
 * du nom contre le débordement (`max-w-full break-words`) — jamais la case
 * (le `<div>` parent) qui porte le plancher de largeur. La classe manquante
 * lui a survécu.
 */
describe('#3082 — la case identité de CandidateRow impose son plancher de largeur', () => {
  it('porte minWidth: 220px en style inline (pas seulement en classe Tailwind)', () => {
    const source = readFileSync(join(__dirname, 'CandidateRow.tsx'), 'utf8')
    const match = source.match(
      /data-testid="candidate-zone-identity"\s+className="flex min-w-0 items-(?:start|center) gap-3"\s+style=\{\{[^}]*minWidth:\s*['"]220px['"][^}]*\}\}/,
    )
    expect(match).not.toBeNull()
  })
})

/**
 * #3082 (recette R9, 27/09/2026) — la cause racine, mesurée en production :
 * la règle servie était `:where(.flex, …, <grid important>, …) > * { min-width: 0
 * !important }` — le jumeau `!important` englobait AUSSI `.flex` et battait le
 * `style` inline (220 px posés, 0 px calculés sur 5 cartes sur 5). Il naissait
 * d'une négation JavaScript dans `packages/ui/src/loaders/braille-loader.tsx`.
 * Cette garde refuse le jeton dans les sources que Tailwind scanne.
 */
describe('#3082 — aucun jeton « important + grid/flex » dans les sources scannées', () => {
  it('braille-loader.tsx ne porte plus la négation collée', () => {
    const source = readFileSync(join(__dirname, '../../../../../../packages/ui/src/loaders/braille-loader.tsx'), 'utf8')
    expect(source).not.toMatch(new RegExp('!(grid|flex|inline-flex|inline-grid)\\b'))
  })

  it('sait dire NON : le jeton est bien attrapé', () => {
    expect('const x = ' + '!' + 'grid ? a : b').toMatch(new RegExp('!(grid|flex|inline-flex|inline-grid)\\b'))
  })
})
