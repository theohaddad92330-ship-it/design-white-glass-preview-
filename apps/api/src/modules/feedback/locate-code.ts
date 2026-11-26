/**
 * Les commandes prêtes à coller pour retrouver le code derrière un retour.
 *
 * L'estampille de build (`fichier:ligne`) est la meilleure piste quand elle
 * existe — mais elle manque dès qu'on pointe un composant tiers, un nœud rendu
 * par `@bellum/ui`, ou quand `VITE_SOURCE_TAGS=false`. Et même quand elle est
 * là, elle donne le fichier, pas toujours le bon endroit dedans.
 *
 * D'où ce bloc, repris du moteur de retours de Dirigo : quelques `rg` qui
 * partent de ce qu'on SAIT de l'élément. L'ordre n'est pas cosmétique — les noms
 * de composants d'abord, les textes ensuite : un libellé peut être traduit,
 * dupliqué ou construit dynamiquement, un nom de composant désigne son fichier
 * presque à coup sûr.
 *
 * Pur → testable sans réseau ni DOM.
 */

/** Un segment qui change d'une visite à l'autre : id, uuid, slug numérique. */
const DYNAMIC_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i
const MAX_COMPONENTS = 2
const MAX_TOKENS = 3
/** Le nom d'un composant réel, pas un fragment de balise. */
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9_]{2,}$/

type LocateInput = {
  /** Chemin de la route affichée (`/accounts/9d35…/plan`). */
  route: string | null
  componentStack: string[]
  grepTokens: string[]
  /**
   * D'OÙ VIENT LE SIGNALEMENT — `web` (défaut) ou `backoffice`.
   *
   * ⚠️ Les commandes visaient `apps/web/src` en dur. Un retour d'opérateur
   * envoyait donc chercher dans l'application CLIENTE le composant d'un écran
   * du back-office : trois commandes qui ne rendent jamais rien, et le genre de
   * silence qui fait conclure « le code n'existe pas ». C'est le même défaut
   * que le `createFileRoute` non normalisé, un cran plus haut.
   */
  origin?: 'web' | 'backoffice'
}

/**
 * Où chercher, selon l'application d'où vient le retour.
 *
 * Le back-office est une app Next : ses routes sont des DOSSIERS sous
 * `src/app`, pas des `createFileRoute` — la commande de route n'a donc pas de
 * sens là-bas, et on cherche le segment de chemin dans l'arborescence.
 */
const ROOTS = {
  web: { code: 'apps/web/src packages/ui/src', routes: 'apps/web/src/routes' },
  backoffice: { code: 'apps/dashboard-manager/src', routes: 'apps/dashboard-manager/src/app' },
} as const

/**
 * Rend les commandes, de la plus ciblée à la plus large. Vide quand on ne sait
 * rien de l'élément : un bloc de commandes qui ne cherchent rien fait perdre
 * plus de temps qu'il n'en gagne.
 */
export function buildLocateCommands(input: LocateInput): string[] {
  const commands: string[] = []
  const roots = ROOTS[input.origin ?? 'web']
  const backoffice = (input.origin ?? 'web') === 'backoffice'

  const route = normaliseRoute(input.route)
  if (route) {
    commands.push(
      backoffice
        ? // Une route Next est un dossier : on la LISTE plutôt que de chercher
          // un appel de fonction qui n'existe nulle part dans cette app.
          `ls ${roots.routes}${route}`
        : `rg -n ${quote(`createFileRoute('${route}')`)} ${roots.routes}`,
    )
  }

  for (const component of input.componentStack.filter(isComponentName).slice(0, MAX_COMPONENTS)) {
    commands.push(`rg -n ${quote(`function ${component}`)} ${roots.code}`)
  }

  for (const token of input.grepTokens.slice(0, MAX_TOKENS)) {
    commands.push(`rg -n ${quote(token)} ${roots.code}`)
  }

  return commands
}

/**
 * Le chemin de route tel que TanStack l'écrit : les segments variables
 * redeviennent `$`. Chercher `createFileRoute('/accounts/9d35…')` ne rendrait
 * jamais rien — c'est le genre de commande qui fait conclure « le code n'existe
 * pas ».
 */
function normaliseRoute(pathname: string | null): string | null {
  if (!pathname) return null
  const path = pathname.split('?')[0]?.split('#')[0] ?? ''
  const segments = path.split('/').filter(Boolean)
  if (!segments.length) return '/'
  return `/${segments.map(segment => (DYNAMIC_SEGMENT.test(segment) ? '$' : segment)).join('/')}`
}

function isComponentName(name: string): boolean {
  return COMPONENT_NAME.test(name)
}

/** Guillemets d'un argument shell : le texte d'un bouton contient des apostrophes. */
function quote(value: string): string {
  return JSON.stringify(value)
}
