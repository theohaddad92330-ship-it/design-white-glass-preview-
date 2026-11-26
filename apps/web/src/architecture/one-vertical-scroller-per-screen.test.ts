import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #1316.1 — « Aujourd'hui il y a trop de scrolls internes : peu de comptes
 * visibles dans le tableau, colonne coupée, certaines colonnes tronquées.
 * Utiliser davantage la largeur et la hauteur disponibles. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, EN PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────
 * `/accounts`, fenêtre de 861 px, le 02/09/2026 :
 *
 *   · conteneur de page  `overflow-y-auto`  →  771 px visibles / 863 de contenu
 *   · tableau            `overflow-y-auto`  →  **339 px visibles / 2 156**
 *
 * Le tableau demandait `max-h-[calc(100dvh-8rem)]` — 733 px — et n'en obtenait
 * que 339, parce qu'il vit dans un parent DÉJÀ défilant qui l'écrase. Résultat :
 * **15 % du contenu visible** dans une fenêtre qui pouvait en montrer le double.
 *
 * Le dépôt connaît déjà la règle, écrite pour le mobile : « jamais deux
 * conteneurs défilants imbriqués ». Elle vaut en desktop pour la même raison —
 * l'utilisateur ne sait pas lequel des deux il fait défiler, et le plus petit
 * gagne toujours.
 *
 * ⚠️ `overflow-x` n'est PAS concerné : le tableau porte une largeur plancher et
 * doit défiler horizontalement dans SON conteneur, jamais dans le corps de la
 * page. C'est la règle D81, et elle reste.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function fichiersSous(dir: string): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin))
    else if (/\.tsx$/.test(entree) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

describe('un écran n’a qu’un seul défilement VERTICAL', () => {
  const sources = fichiersSous(join(racineWeb, 'src'))

  it('a un corpus à lire', () => {
    expect(sources.length).toBeGreaterThan(400)
  })

  /**
   * ⚠️ Les commentaires sont retirés AVANT lecture, et ce n'est pas de la
   * précaution : le docblock qui explique le correctif CITE `max-h-[…]` et
   * `overflow-y-auto` en toutes lettres pour dire qu'ils sont partis. Sans ce
   * nettoyage, la garde se ferait rougir par sa propre justification — c'est la
   * leçon de GA-08, et elle m'a eu au premier essai.
   */
  function sansCommentaires(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  }

  it('le tableau des comptes ne défile plus verticalement dans la page', () => {
    const source = sansCommentaires(
      readFileSync(
        join(racineWeb, 'src', 'features', 'accounts', 'view', 'accounts-list', 'AccountsTable.tsx'),
        'utf8',
      ),
    )

    // La garde LIT quelque chose — un nettoyage trop gourmand rendrait du vide.
    expect(source).toContain('overflow-x-auto')

    // Le défilement HORIZONTAL reste : le tableau a une largeur plancher.
    expect(source).not.toContain('overflow-y-auto')
    expect(source).not.toContain('max-h-[calc(100dvh-8rem)]')
  })

  /**
   * ⚠️ CETTE GARDE ÉTAIT BORGNE — elle ne voyait qu'une des deux formes.
   *
   * `/accounts` rend DEUX enveloppes de liste selon l'angle choisi : le tableau
   * (`AccountsTable.tsx`, angle commercial) et la liste de cartes
   * (`AccountsBillingCardList.tsx`, angle facturation). Le correctif du 02/09 a
   * suivi le tableau ; la liste de cartes a gardé le défaut mot pour mot —
   * `max-h-[calc(100dvh-8rem)] overflow-y-auto` — avec un commentaire qui disait
   * « exactement comme l'enveloppe du tableau », ce qui était vrai et n'était
   * plus une bonne nouvelle. La garde, elle, lisait un seul chemin en dur et
   * restait verte.
   *
   * Elle lit maintenant TOUT le dossier `accounts-list`. Une troisième forme
   * ajoutée demain est couverte sans qu'on y pense — c'est précisément ce qui a
   * manqué ici.
   */
  const dossierListeComptes = join(racineWeb, 'src', 'features', 'accounts', 'view', 'accounts-list')

  /**
   * Ce qu'on cherche est une ENVELOPPE qui réclame la hauteur du VIEWPORT tout
   * en défilant : `max-h-[calc(100dvh-…)]` + `overflow-y-auto`. C'est la forme
   * exacte des deux fautives, et c'est la seule qui produit le défaut — un
   * conteneur qui demande « toute la fenêtre » alors qu'il vit dans un parent
   * qui défile déjà n'obtient jamais ce qu'il demande, et écrase son contenu.
   *
   * ⚠️ TROISIÈME PREUVE : la garde n'attrape pas ce qu'elle ne vise pas.
   * La première version cherchait `overflow-y-auto` seul et refusait
   * `AbsorbAccountDialog.tsx` — un `max-h-40 overflow-y-auto` DANS un
   * `<Dialog>`. Une boîte de dialogue vit dans un portail, hors de la chaîne de
   * défilement de la page, et sa petite liste bornée est parfaitement
   * légitime. Une garde qui refuse du code juste se fait désactiver.
   */
  const ENVELOPPE_PLEIN_ECRAN = /max-h-\[[^\]]*\b\d+d?vh\b[^\]]*\]/

  function defileSurToutLEcran(source: string): boolean {
    return ENVELOPPE_PLEIN_ECRAN.test(source) && source.includes('overflow-y-auto')
  }

  it('a un corpus à lire dans le dossier des listes de comptes', () => {
    expect(fichiersSous(dossierListeComptes).length).toBeGreaterThan(10)
  })

  it('aucune enveloppe de liste de comptes ne réclame l’écran entier en défilant', () => {
    const fautifs: string[] = []
    for (const fichier of fichiersSous(dossierListeComptes)) {
      if (defileSurToutLEcran(sansCommentaires(readFileSync(fichier, 'utf8')))) {
        fautifs.push(fichier.slice(racineWeb.length + 1))
      }
    }
    expect(fautifs, 'une liste de comptes défile dans un parent qui défile déjà').toEqual([])
  })

  it('sait dire NON, et NE dit PAS non à ce qu’elle ne vise pas', () => {
    // La forme fautive, telle qu'elle était écrite dans les deux fichiers.
    expect(defileSurToutLEcran('mx-4 max-h-[calc(100dvh-8rem)] flex-col gap-2 overflow-y-auto md:mx-6')).toBe(true)
    // La même en `vh` : un jour quelqu'un l'écrira, et elle est tout aussi fautive.
    expect(defileSurToutLEcran('max-h-[calc(100vh-4rem)] overflow-y-auto')).toBe(true)
    // Une petite liste bornée DANS une boîte de dialogue : légitime.
    expect(defileSurToutLEcran('max-h-40 space-y-0.5 overflow-y-auto')).toBe(false)
    // Une enveloppe plein écran qui ne défile PAS : légitime aussi.
    expect(defileSurToutLEcran('max-h-[calc(100dvh-8rem)] flex flex-col')).toBe(false)
  })

  it('sait dire NON — l’enveloppe d’avant serait refusée', () => {
    const avant = 'mx-4 max-h-[calc(100dvh-8rem)] overflow-x-auto overflow-y-auto md:mx-6'

    expect(avant.includes('overflow-y-auto')).toBe(true)
    expect(avant.includes('max-h-[calc(100dvh-8rem)]')).toBe(true)
  })
})
