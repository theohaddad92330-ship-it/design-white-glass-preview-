// Le fil des dernières actions : ce que la personne a cliqué et où elle est
// passée avant de signaler.
//
// Une capture d'écran dit à quoi ressemblait l'écran ; elle ne dit pas comment
// on y est arrivé. « J'ai ouvert un compte, cliqué Enrichir, puis c'est parti en
// vrille » est exactement l'information qui manque pour REPRODUIRE — et c'est
// aussi celle qu'un rapporteur n'écrit jamais, parce qu'elle lui semble évidente.

/**
 * ⚠️ NON exporté, contrairement à l'app cliente.
 *
 * Le widget du back-office envoie ces objets tels quels, sans jamais nommer
 * leur type — la forme qui TRANCHE vit au contrat de l'API. Un type exporté
 * que personne n'importe est ce que `pnpm lint:exports:types` refuse, et il
 * ferait une seconde déclaration à côté de celle qui décide.
 */
type Breadcrumb = { time: string; type: 'click' | 'navigation'; label: string }

const MAX_ENTRIES = 40
/** Ce qu'on joint au rapport : les derniers gestes, pas la session entière. */
const REPORTED = 15
const MAX_LABEL = 120

const trail: Breadcrumb[] = []
let installed = false

export function installBreadcrumbs(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  // En phase de CAPTURE : un clic sur un bouton qui s'enlève du DOM (fermeture
  // d'un panneau, navigation) ne remonterait jamais en phase bouillonnante.
  document.addEventListener(
    'click',
    event => {
      const target = event.target
      if (!(target instanceof Element)) return
      // Le rapporteur de bug lui-même n'est pas une action de l'utilisateur : sans
      // ce filtre, les trois derniers gestes seraient toujours « bouton signaler,
      // élément pointé, envoyer », et le fil ne servirait plus à rien.
      if (target.closest('[data-bellum-capture-ignore]')) return
      push('click', describe(target))
    },
    true,
  )

  installNavigationProbe()
}

/** Les derniers gestes, du plus ancien au plus récent. */
export function getRecentBreadcrumbs(): Breadcrumb[] {
  return trail.slice(-REPORTED)
}

/**
 * Les changements d'URL du routeur. `pushState`/`replaceState` n'émettent aucun
 * événement — sans ce patch, une navigation interne (l'essentiel des
 * déplacements dans une SPA) serait invisible ; seul le bouton Retour du
 * navigateur apparaîtrait, ce qui donnerait un fil trompeur.
 */
function installNavigationProbe(): void {
  const { history } = window
  const wrap = (method: 'pushState' | 'replaceState') => {
    const original = history[method].bind(history)
    history[method] = (...args: Parameters<History['pushState']>) => {
      const result = original(...args)
      push('navigation', location.pathname + location.search)
      return result
    }
  }
  wrap('pushState')
  wrap('replaceState')
  window.addEventListener('popstate', () => push('navigation', location.pathname + location.search))
}

function push(type: Breadcrumb['type'], label: string): void {
  try {
    const last = trail[trail.length - 1]
    // Un routeur qui remplace l'URL par la même valeur, un double-clic : deux
    // lignes identiques d'affilée n'ajoutent rien et poussent dehors un geste utile.
    if (last?.type === type && last.label === label) return
    trail.push({ time: new Date().toISOString(), type, label })
    if (trail.length > MAX_ENTRIES) trail.shift()
  } catch {
    // Observer ne doit jamais casser.
  }
}

/**
 * Nomme l'élément cliqué comme un humain le nommerait : son libellé
 * d'accessibilité, sinon son texte, sinon sa balise — suivi de la ligne de code
 * que le build a estampillée, quand elle existe.
 */
function describe(target: Element): string {
  const actionable = target.closest('button, a, [role="button"], input, select, textarea, label') ?? target
  const aria = actionable.getAttribute('aria-label')?.trim()
  const text = actionable.textContent?.replace(/\s+/g, ' ').trim()
  const name = aria || text || `<${actionable.tagName.toLowerCase()}>`
  const source = actionable.closest('[data-bellum-src]')?.getAttribute('data-bellum-src')
  const label = source ? `${name} (${source})` : name
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL)}…` : label
}
