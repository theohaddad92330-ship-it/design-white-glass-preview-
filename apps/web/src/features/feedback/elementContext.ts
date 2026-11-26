// Turns a clicked DOM node into everything a developer needs to find the code
// behind it: the source location stamped at build time by the `bellum-source-tag`
// Vite plugin, the React component stack, a CSS selector, and the visible text.

export type ElementContext = {
  /** `apps/web/src/…/File.tsx:120:7` for the element itself, when stamped. */
  sourceFile: string | null
  /** Stamped ancestors, nearest first — the owner when the node comes from @bellum/ui. */
  sourceChain: string[]
  /** React component names, nearest first. */
  componentStack: string[]
  selector: string
  tagName: string
  elementId: string | null
  classes: string | null
  role: string | null
  ariaLabel: string | null
  text: string | null
  href: string | null
  /** `tag#id.classe[role][data-*][aria-*]` — l'identité de l'élément en une ligne. */
  descriptor: string
  /** `outerHTML` tronqué : le markup RÉEL, pas sa description. */
  html: string | null
  /**
   * #3895.1 — vrai quand `html` est un EXTRAIT (le markup réel dépassait
   * `MAX_HTML`), jamais deviné côté lecteur. Un extrait de recette doit se
   * nommer comme tel : sur un conteneur long (fil de conversation, tableau),
   * la coupe ne doit jamais se lire comme l'élément complet.
   */
  htmlTruncated: boolean
  /** Chaînes distinctives à chercher dans le code pour retrouver le composant. */
  grepTokens: string[]
  rect: { x: number; y: number; width: number; height: number }
  viewport: { width: number; height: number; dpr: number }
}

const SOURCE_ATTRIBUTE = 'data-bellum-src'
const MAX_TEXT = 200
const MAX_CHAIN = 5
const MAX_COMPONENTS = 8
const MAX_HTML = 1200
const MAX_TOKENS = 5

/**
 * #2759 — un avatar (`packages/ui/src/assets/laura-face.tsx`, mais aussi tout
 * aperçu d'image posé en `data:` URI) SE SERT EN PREMIER dans `outerHTML` dès
 * qu'il précède le contenu dans le DOM. Ses octets de base64 — plusieurs Ko
 * pour un simple JPEG — noient `MAX_HTML` avant d'atteindre le moindre texte
 * réel : le rapport de bug capturait le conteneur du fil de `/chat`, et ne
 * montrait jamais la réponse de Laura qui suivait l'avatar. Remplacée par un
 * jeton court AVANT la troncature, la data URI ne mange plus le budget —
 * même défaut sur N'IMPORTE QUEL écran qui inline une image (avatar, aperçu
 * de pièce jointe, graphe exporté en image).
 */
const DATA_URI_PATTERN = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/gi

function stripDataUris(html: string): string {
  return html.replace(DATA_URI_PATTERN, 'data:…')
}

export function buildElementContext(element: Element): ElementContext {
  const rect = element.getBoundingClientRect()
  const text = visibleText(element)
  const classes = typeof element.className === 'string' ? element.className.trim() : null
  const cleanedHtml = stripDataUris(element.outerHTML ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    descriptor: describeElement(element),
    html: cleanedHtml.slice(0, MAX_HTML) || null,
    htmlTruncated: cleanedHtml.length > MAX_HTML,
    grepTokens: collectGrepTokens(element, text),
    sourceFile: element.getAttribute(SOURCE_ATTRIBUTE),
    sourceChain: collectSourceChain(element),
    componentStack: collectComponentStack(element),
    selector: cssPath(element),
    tagName: element.tagName.toLowerCase(),
    elementId: element.id || null,
    classes: classes || null,
    role: element.getAttribute('role'),
    ariaLabel: element.getAttribute('aria-label'),
    text: text || null,
    href: element.getAttribute('href'),
    rect: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 },
  }
}

/**
 * Le texte VISIBLE de l'élément, débarrassé de ce qui n'est pas un libellé.
 *
 * `textContent` brut sur un graphe ou un tableau rend « 04/0705/0706/07… » —
 * une bouillie de données collées qui ne se retrouve dans aucun fichier source
 * et qui, mise dans une commande de recherche, ne rend jamais rien. Quand le
 * texte propre est illisible, on préfère le titre le plus proche au-dessus :
 * c'est ce qu'un humain citerait pour désigner l'élément.
 */
function visibleText(element: Element): string {
  const raw = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (raw && !isDenseText(raw)) return raw.slice(0, MAX_TEXT)
  return (nearestLabel(element) ?? '').slice(0, MAX_TEXT)
}

/** Un texte « dense » n'est pas un libellé : c'est de la donnée agglutinée. */
function isDenseText(text: string): boolean {
  if (text.length <= 12) return false
  const longestWord = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0)
  if (longestWord > 18) return true
  const dataChars = (text.match(/[0-9/:.,%€°-]/g) ?? []).length
  return dataChars / text.length > 0.6
}

/** Premier texte court et lisible en remontant les ancêtres (titre de la carte). */
function nearestLabel(element: Element): string | null {
  let current: Element | null = element.parentElement
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const own = ownText(current)
    if (own.length >= 2 && !isDenseText(own)) return own
    current = current.parentElement
  }
  return null
}

/** Texte porté DIRECTEMENT par un nœud (hors descendants). */
function ownText(element: Element): string {
  let text = ''
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? ''
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** `tag#id.classe[role][data-*][aria-*]` — l'identité de l'élément en une ligne. */
function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const classes =
    typeof element.className === 'string'
      ? element.className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 6)
          .map(cls => `.${cls}`)
          .join('')
      : ''
  const attributes = Array.from(element.attributes)
    .filter(a => a.name === 'role' || a.name.startsWith('data-') || a.name.startsWith('aria-'))
    .filter(a => a.name !== SOURCE_ATTRIBUTE)
    .slice(0, 10)
    .map(a => `[${a.name}="${a.value}"]`)
    .join('')
  return `${tag}${id}${classes}${attributes}`
}

/**
 * Les chaînes qu'on peut CHERCHER dans le code pour retrouver le composant.
 *
 * Utile même quand l'estampille de build existe — elle donne le fichier, pas
 * toujours le bon endroit dedans — et indispensable quand elle manque
 * (composant tiers, `VITE_SOURCE_TAGS=false`). Les classes utilitaires sont
 * écartées : `flex items-center` est dans mille fichiers.
 */
function collectGrepTokens(element: Element, text: string): string[] {
  const tokens = new Set<string>()
  const add = (value: string | null | undefined): void => {
    const cleaned = (value ?? '').replace(/\s+/g, ' ').trim()
    if (cleaned.length >= 3 && cleaned.length <= 40 && /[a-zA-ZÀ-ÿ]/.test(cleaned)) tokens.add(cleaned)
  }
  add(element.getAttribute('data-testid'))
  if (element.id) add(element.id)
  add(element.getAttribute('aria-label'))
  add(text)
  return Array.from(tokens).slice(0, MAX_TOKENS)
}

/**
 * Source locations of the stamped ancestors. A click often lands on a node
 * rendered inside a shared UI package, which carries no stamp of its own — the
 * nearest stamped ancestor is the app code that put it there.
 */
function collectSourceChain(element: Element): string[] {
  const chain: string[] = []
  let current: Element | null = element.parentElement
  while (current && chain.length < MAX_CHAIN) {
    const source = current.getAttribute(SOURCE_ATTRIBUTE)
    if (source) chain.push(source)
    current = current.parentElement
  }
  return chain
}

type Fiber = {
  return: Fiber | null
  type: unknown
  elementType: unknown
}

/**
 * Walks React's internal fiber tree upward to name the components that rendered
 * the node. Best-effort by design: React exposes no public API for this, so a
 * missing or renamed internal simply yields an empty stack.
 */
function collectComponentStack(element: Element): string[] {
  const key = Object.keys(element).find(k => k.startsWith('__reactFiber$'))
  if (!key) return []
  let fiber = (element as unknown as Record<string, Fiber | undefined>)[key] ?? null
  const names: string[] = []
  while (fiber && names.length < MAX_COMPONENTS) {
    const name = componentName(fiber.elementType ?? fiber.type)
    if (name && names[names.length - 1] !== name) names.push(name)
    fiber = fiber.return
  }
  return names
}

function componentName(type: unknown): string | null {
  if (typeof type === 'function')
    return (type as { displayName?: string; name?: string }).displayName || type.name || null
  if (type && typeof type === 'object') {
    const wrapped = type as { displayName?: string; render?: unknown; type?: unknown }
    if (wrapped.displayName) return wrapped.displayName
    // memo()/forwardRef() wrappers keep the real component one level down.
    return componentName(wrapped.render ?? wrapped.type)
  }
  return null
}

/** Short, stable-ish CSS path: `#id` when available, else nth-of-type steps. */
function cssPath(element: Element): string {
  const steps: string[] = []
  let current: Element | null = element
  while (current && current.nodeType === Node.ELEMENT_NODE && steps.length < 6) {
    if (current.id) {
      steps.unshift(`#${CSS.escape(current.id)}`)
      break
    }
    const tag = current.tagName.toLowerCase()
    if (tag === 'html' || tag === 'body') {
      steps.unshift(tag)
      break
    }
    const parent: Element | null = current.parentElement
    const siblings = parent ? Array.from(parent.children).filter(child => child.tagName === current!.tagName) : []
    steps.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag)
    current = parent
  }
  return steps.join(' > ')
}

function round(value: number): number {
  return Math.round(value)
}

/** Human-readable block for the GitHub issue body. */
export function formatElementContext(context: ElementContext): string {
  const lines = [
    `- Source : ${context.sourceFile ?? '—'}`,
    context.sourceChain.length ? `- Parents (source) : ${context.sourceChain.join(' ← ')}` : null,
    context.componentStack.length ? `- Composants : ${context.componentStack.join(' ← ')}` : null,
    `- Sélecteur : \`${context.selector}\``,
    `- Élément : \`<${context.tagName}>\`${context.elementId ? ` #${context.elementId}` : ''}`,
    context.classes ? `- Classes : \`${context.classes}\`` : null,
    context.role || context.ariaLabel
      ? `- Accessibilité : role=${context.role ?? '—'} aria-label=${context.ariaLabel ?? '—'}`
      : null,
    context.href ? `- Lien : ${context.href}` : null,
    context.text ? `- Texte : « ${context.text} »` : null,
    `- Position : ${context.rect.width}×${context.rect.height} @ (${context.rect.x}, ${context.rect.y})`,
    `- Viewport : ${context.viewport.width}×${context.viewport.height} @${context.viewport.dpr}x`,
    // #3895.1 — un extrait se nomme : sans cette ligne, un markup coupé à
    // `MAX_HTML` se lisait comme l'élément complet (le cas d'un long fil de
    // conversation ou d'un tableau, jamais signalé jusqu'ici).
    context.htmlTruncated ? "- ⚠️ Markup tronqué : l'extrait ci-dessus ne porte pas l'élément complet." : null,
  ]
  return lines.filter((line): line is string => line !== null).join('\n')
}
