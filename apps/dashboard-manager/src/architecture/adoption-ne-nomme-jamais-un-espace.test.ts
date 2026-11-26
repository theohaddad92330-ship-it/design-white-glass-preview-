import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * issue 1657.2 / issue 1685 — `/produit/adoption` N'AGRÈGE JAMAIS PAR ESPACE
 * NOMMÉ, SEULEMENT PAR FONCTION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI C'EST PIÉGEUX ICI PRÉCISÉMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Règle 5 de `c64_analytique_produit` : « rien de comportemental par espace
 * client NOMMÉ dans le back-office ». `/produit` a déjà sa garde
 * (`produit-ne-croise-pas-comportement-et-espace.test.ts`), scopée au flux
 * COMPORTEMENTAL (`@/lib/product-analytics`). Cet écran-ci ne lit PAS ce flux
 * — il lit le catalogue de plans (`@/lib/admin`) — donc les marqueurs de cette
 * garde-là (`screen_viewed`, `RapportEcrans`…) ne le verraient jamais passer.
 *
 * Le risque est ailleurs, et il est nommé dans l'issue : « quelles fonctions
 * CE CLIENT n'utilise pas » est EXACTEMENT l'argument commercial qui dérape en
 * reproche. `@/lib/admin` et `@/lib/tool-registry` exposent tous deux des
 * fonctions PAR ESPACE (`fetchAdminWorkspace`, `fetchWorkspaceRegistry`, les
 * types `AdminWorkspace`/`WorkspaceTool` qui portent un nom, un email, un
 * `last_sync`) — exactement la tentation qu'un futur lot de cet écran pourrait
 * suivre pour « aller plus loin » sur l'usage. Cette garde l'interdit,
 * nommément : le dossier n'importe QUE l'agrégat (`fetchAdminOverview`,
 * `fetchAdminPlans`), jamais le détail par espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Un accès par espace introduit sous un chemin qu'aucun des marqueurs
 * ci-dessous ne couvre (ex. une route interne toute neuve, jamais vue ici).
 * Le corpus délibérément étroit (`app/produit/adoption/**` seulement)
 * compense en partie : ce dossier n'a aujourd'hui aucune raison de lire un
 * détail par espace, quel que soit son nom.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES COMMENTAIRES SORTENT DU CORPUS AVANT LA MESURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Même défaut que `couleurs-passent-par-un-token.test.ts` (§ son docblock) :
 * `feature-adoption.logic.ts` NOMME `fetchWorkspaceRegistry`/`WorkspaceTool`/
 * `AdminWorkspace` dans son propre docblock, pour EXPLIQUER pourquoi ce
 * fichier ne les importe pas — une garde naïve confondrait cette explication
 * avec l'infraction qu'elle raconte. `sansCommentaires` (même implémentation)
 * retire les commentaires avant de chercher les marqueurs.
 */

const DOSSIER = fileURLToPath(new URL('../app/produit/adoption', import.meta.url))

function fichiersSource(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) fichiersSource(chemin, out)
    else if (entree.endsWith('.ts') || entree.endsWith('.tsx')) out.push(chemin)
  }
  return out
}

/** Les accès PAR ESPACE que ce dossier n'a aucune raison de lire — qu'ils
 *  viennent de `@/lib/admin` (le détail d'UN espace) ou de
 *  `@/lib/tool-registry` (le registre d'outils d'UN espace, avec son
 *  `last_sync`). `AdminWorkspace` attrape aussi `AdminWorkspaceDetail` et
 *  `AdminWorkspaceMember` (sous-chaîne) — les deux sont, eux aussi, des
 *  données PAR espace nommé, donc à raison. */
const MARQUEURS_PAR_ESPACE = [
  'fetchAdminWorkspace',
  'AdminWorkspace',
  'fetchToolCatalog',
  'fetchWorkspaceRegistry',
  'WorkspaceTool',
  'ownerEmail',
]

/** Les commentaires sortent du corpus AVANT la mesure — même implémentation
 *  que `couleurs-passent-par-un-token.test.ts` (voir le docblock de tête).
 *  Seules les lignes qui COMMENCENT par `//` sont retirées, pas celles où
 *  `//` apparaît en cours de ligne. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/** Ce que la garde reproche à une source — isolée pour vérifier qu'elle sait
 *  dire NON. */
function accedeParEspace(source: string): string[] {
  return MARQUEURS_PAR_ESPACE.filter(marqueur => sansCommentaires(source).includes(marqueur))
}

describe('issue 1657.2 / issue 1685 — /produit/adoption n’agrège jamais par espace nommé', () => {
  it('LIT quelque chose — le corpus n’est pas vide, et porte bien l’agrégat autorisé', () => {
    const fichiers = fichiersSource(DOSSIER)
    expect(fichiers.length).toBeGreaterThan(3)
    // Contrôle positif : `page.tsx` lit bien `fetchAdminOverview`/`fetchAdminPlans`
    // — les DEUX seules portes admin que cet écran utilise.
    const page = readFileSync(join(DOSSIER, 'page.tsx'), 'utf8')
    expect(page).toContain('fetchAdminOverview')
    expect(page).toContain('fetchAdminPlans')
  })

  it('sait dire NON — une source fabriquée qui lit le détail PAR espace est reprochée', () => {
    const fautif = `
      import { fetchAdminWorkspace } from '@/lib/admin'
      const detail = await fetchAdminWorkspace(id)
      console.log(detail.workspace.name)
    `
    expect(accedeParEspace(fautif)).toEqual(expect.arrayContaining(['fetchAdminWorkspace', 'AdminWorkspace']))
  })

  it('n’attrape pas ce qu’elle ne vise pas — l’agrégat par palier (aucun nom d’espace) ne déclenche rien', () => {
    const legitime = `
      import { fetchAdminOverview, fetchAdminPlans } from '@/lib/admin'
      const totalAbonnements = Object.values(overview.plans).reduce((a, b) => a + b, 0)
    `
    expect(accedeParEspace(legitime)).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — le mot « espace » seul, dans un libellé, ne déclenche rien', () => {
    const legitime = `return 'aucun espace éligible aujourd’hui'`
    expect(accedeParEspace(legitime)).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un COMMENTAIRE qui nomme l’interdit pour l’EXPLIQUER n’est pas fautif', () => {
    // Exactement le cas réel de `feature-adoption.logic.ts` : son docblock
    // nomme `fetchWorkspaceRegistry`/`AdminWorkspace` pour dire pourquoi ce
    // fichier ne les importe PAS — la ligne de code, elle, est propre.
    const documente = `
      // Recherché et écarté : \`fetchWorkspaceRegistry\` et \`AdminWorkspace\`
      // exposent un détail PAR espace ; ce fichier n'importe que l'agrégat.
      /** Jamais \`WorkspaceTool\` ici — voir le docblock de tête. */
      import { fetchAdminOverview, fetchAdminPlans } from '@/lib/admin'
    `
    expect(accedeParEspace(documente)).toEqual([])
  })

  it('aucun fichier de /produit/adoption ne lit un accès PAR espace nommé', () => {
    const fautifs = fichiersSource(DOSSIER)
      .map(chemin => ({ chemin, marqueurs: accedeParEspace(readFileSync(chemin, 'utf8')) }))
      .filter(({ marqueurs }) => marqueurs.length > 0)

    expect(
      fautifs,
      [
        'Un fichier de /produit/adoption lit un accès PAR ESPACE (nom, e-mail,',
        'détail d’un workspace précis) — règle 5 de c64_analytique_produit',
        '(« rien de comportemental par espace client nommé dans le back-office »).',
        '',
        ...fautifs.map(f => `${f.chemin} — ${f.marqueurs.join(', ')}`),
      ].join('\n'),
    ).toEqual([])
  })
})
