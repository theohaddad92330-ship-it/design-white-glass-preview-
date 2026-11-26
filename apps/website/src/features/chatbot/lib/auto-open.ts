/**
 * Quand Laura s'ouvre toute seule — §4.4 du PDF 10 (ticket BEL-LAU-901).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE LEVIER, ET SON RISQUE
 * ─────────────────────────────────────────────────────────────────────────
 * Le §4.4 appelle l'ouverture automatique « le levier de conversion le plus
 * direct », et le défaut n°2 du transcript est qu'il n'existe pas : le widget ne
 * s'ouvre jamais qu'au clic. Mais un chatbot qui s'ouvre au mauvais moment coûte
 * plus de visiteurs qu'il n'en convertit — d'où les sept règles du §4.4, qui
 * sont toutes des règles de RETENUE.
 *
 * La fonction est PURE, et c'est ce qui rend ces sept règles vérifiables une par
 * une. Le widget ne décide de rien : il observe (le chemin, la session, la
 * taille d'écran) et exécute le plan.
 *
 * ⚠️ **Cette table ne contient que des chemins qui EXISTENT.** Le map d'accroche
 * historique portait des alias français (`tarifs`, `produit`, `cas-usage`) que
 * le site ne sert pas : il rend le français à la racine, sans traduire ses
 * chemins. Résultat trouvé en recette live — Laura s'ouvrait **en grand sur une
 * page 404**, parce que le segment ressemblait à une page connue. Un alias mort
 * ne coûte rien tant qu'il ne déclenche rien ; dès qu'il ouvre un panneau, il
 * coûte un visiteur.
 *
 * ⚠️ **Une page inconnue est SILENCIEUSE**, jamais générique. C'était déjà la
 * règle de l'accroche, et elle compte double ici : s'ouvrir en grand sur une
 * page qu'on n'a pas prévue, c'est interrompre quelqu'un sans savoir ce qu'il
 * lit. Le §4.4 mentionne un « Blog / ressources » que le site n'a pas encore ;
 * le jour où il existera, il sera silencieux jusqu'à ce qu'on l'inscrive ici —
 * c'est le bon sens de l'erreur.
 */

import { routing } from '@/i18n/routing'
import { pageSegment } from './proactive'

/** Ce que fait Laura sur cette page. `bubble` = l'accroche seule, sans ouvrir. */
type AutoOpenBehaviour = 'full' | 'bubble' | 'silent'

/** Quel message d'ouverture. Trois, et jamais interchangeables : accueillir
 *  quelqu'un qui revient par « Qu'est-ce qui t'amène ? » efface la seule chose
 *  qu'on savait de lui. */
export type AutoOpenMessage = 'first' | 'return' | 'exit'

type AutoOpenPlan = {
  /** `true` = le panneau s'ouvre ; `false` = seulement la bulle d'accroche. */
  open: boolean
  delayMs: number
  message: AutoOpenMessage
}

export type Viewport = 'desktop' | 'mobile'

/** Ce que le navigateur sait de la session en cours et des précédentes. */
export type VisitState = {
  /** Une ouverture automatique a déjà eu lieu dans CETTE session. */
  autoOpened: boolean
  /** Le visiteur a fermé le widget lui-même. Fermée = fermée. */
  dismissed: boolean
  /** Le nombre de visites sur 30 jours, celle-ci comprise. */
  visitCount: number
}

export type AutoOpenInput = {
  pathname: string
  visit: VisitState
  viewport: Viewport
  /** Le curseur part vers le haut de la page — desktop uniquement. */
  exitIntent?: boolean
}

/** Le tableau du §4.4, en millisecondes. Les pages absentes de cette table sont
 *  silencieuses, y compris les pages légales — qui y figurent quand même, parce
 *  qu'un silence VOULU doit se lire dans le code et pas s'en déduire. */
const PAGE_RULES: Readonly<Record<string, { behaviour: AutoOpenBehaviour; delayMs: number }>> = {
  // Accueil : le visiteur a eu le temps de voir le héros.
  '': { behaviour: 'full', delayMs: 4_000 },
  // Tarifs : quelqu'un sur les tarifs a une intention forte.
  pricing: { behaviour: 'full', delayMs: 2_000 },
  // Produit et cas d'usage : il lit, on le laisse commencer.
  product: { behaviour: 'full', delayMs: 8_000 },
  'use-cases': { behaviour: 'full', delayMs: 8_000 },
  // Démo et bêta : intention très forte.
  demo: { behaviour: 'full', delayMs: 3_000 },
  beta: { behaviour: 'full', delayMs: 3_000 },
  // Curiosité, pas achat.
  about: { behaviour: 'bubble', delayMs: 12_000 },
  webinar: { behaviour: 'bubble', delayMs: 12_000 },
  // Silence total : quelqu'un qui évalue la confiance ne veut pas qu'on lui
  // vende. C'est la règle la plus rentable du §4.4, et elle ne se voit pas.
  legal: { behaviour: 'silent', delayMs: 0 },
  privacy: { behaviour: 'silent', delayMs: 0 },
  cookies: { behaviour: 'silent', delayMs: 0 },
  cgu: { behaviour: 'silent', delayMs: 0 },
  cgv: { behaviour: 'silent', delayMs: 0 },
  dpa: { behaviour: 'silent', delayMs: 0 },
  status: { behaviour: 'silent', delayMs: 0 },
}

/** Règle n°2 : on attend l'immobilité. Ouvrir pendant qu'on défile fait sauter
 *  la lecture, et le premier geste devient « fermer ». */
export const SCROLL_IDLE_MS = 1_500

/** Règle n°4 : jamais sur mobile en dessous de trois secondes de présence —
 *  l'écran y est déjà pris en entier par le panneau. */
export const MOBILE_MIN_PRESENCE_MS = 3_000

/** La mémoire du §4.4 règle n°7 : trente jours, et jamais de rejeu du même
 *  message. */
export const VISIT_MEMORY_DAYS = 30

/** Le comportement prévu pour cette page, sans tenir compte de la session. */
export function behaviourFor(pathname: string): AutoOpenBehaviour {
  return PAGE_RULES[pageSegment(pathname)]?.behaviour ?? 'silent'
}

/**
 * Le plan d'ouverture, ou `null` pour ne rien faire du tout.
 *
 * L'ordre des règles est celui de la retenue : ce qui INTERDIT est évalué avant
 * ce qui déclenche. Une page légale gagne sur une sortie d'intention, et une
 * fermeture manuelle gagne sur tout le reste — c'est la seule lecture possible
 * de « fermée = fermée, on n'insiste jamais deux fois ».
 */
export function shouldAutoOpen(input: AutoOpenInput): AutoOpenPlan | null {
  const rule = PAGE_RULES[pageSegment(input.pathname)]
  if (!rule || rule.behaviour === 'silent') return null

  // Règle n°1. Fermée = fermée, et une seule ouverture automatique par session.
  if (input.visit.dismissed || input.visit.autoOpened) return null

  const mobile = input.viewport === 'mobile'

  // Règle n°5. La sortie d'intention n'existe pas au doigt : sur mobile, un
  // curseur qui « part vers le haut » ne veut rien dire.
  if (input.exitIntent && !mobile) {
    return { open: true, delayMs: 0, message: 'exit' }
  }

  // Règle n°6. Quelqu'un qui revient a déjà passé la porte : on ne le fait pas
  // attendre, et on ne lui redemande pas ce qu'il est venu chercher.
  if (input.visit.visitCount >= 2) {
    return { open: rule.behaviour === 'full', delayMs: mobile ? MOBILE_MIN_PRESENCE_MS : 0, message: 'return' }
  }

  return {
    open: rule.behaviour === 'full',
    delayMs: mobile ? Math.max(rule.delayMs, MOBILE_MIN_PRESENCE_MS) : rule.delayMs,
    message: 'first',
  }
}

/**
 * Le moment est-il venu ? — les règles n°2 et n°3, qui ne dépendent pas de la
 * page mais de ce que le visiteur est en train de faire.
 *
 * Elles REPORTENT, elles n'annulent pas : quelqu'un qui défile finira par
 * s'arrêter, quelqu'un qui remplit un formulaire finira par le soumettre. Les
 * traiter comme des refus reviendrait à ne jamais s'ouvrir sur les visiteurs
 * les plus actifs, c'est-à-dire exactement les mauvais.
 */
export function canFireNow(activity: { scrolling: boolean; typing: boolean }): boolean {
  return !activity.scrolling && !activity.typing
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * L'A/B DU MOMENT D'OUVERTURE — 8 s / 15 s / au défilement (§11, P1)
 * ─────────────────────────────────────────────────────────────────────────
 * Le rapport du 17/08 demande de MESURER le moment plutôt que de le décréter.
 * Le tableau du §4.4, lui, porte des délais réglés page par page, et il a ses
 * raisons (2 s sur les tarifs, 8 s sur une page qu'on lit). Les deux ne se
 * contredisent pas si l'on est précis sur ce que l'expérience remplace :
 *
 *   · elle remplace le DÉLAI d'une ouverture en grand, sur une PREMIÈRE visite ;
 *   · elle ne touche à rien d'autre.
 *
 * Ce qui est donc préservé, et testé comme tel :
 *   · une page silencieuse reste silencieuse — la retenue gagne toujours ;
 *   · une accroche en bulle reste une bulle — ce n'est pas une ouverture ;
 *   · une sortie d'intention reste immédiate — son déclencheur n'est pas le
 *     temps, c'est le geste ;
 *   · un visiteur qui revient n'attend pas — il a déjà passé la porte ;
 *   · le plancher mobile de trois secondes tient, y compris au défilement.
 *
 * Autrement dit : **la mesure ne casse pas ce qu'elle mesure.**
 */

/** Ce qui déclenche l'ouverture : le temps, ou la profondeur de lecture. */
type OpenTrigger = 'timer' | 'scroll'

type TimedAutoOpenPlan = AutoOpenPlan & { trigger: OpenTrigger }

/** La variante « au défilement » attend d'avoir vu la moitié de la page : plus
 *  tôt, on interrompt quelqu'un qui n'a encore rien lu. */
export const SCROLL_OPEN_DEPTH = 0.5

/** Les deux délais nommés du §11. */
const TIMING_DELAY_MS: Readonly<Record<string, number>> = { at8s: 8_000, at15s: 15_000 }

/**
 * Le plan, une fois la variante appliquée.
 *
 * Rend `null` quand il n'y avait rien à faire : une expérience ne fabrique
 * jamais une ouverture là où les règles de retenue en refusaient une.
 */
export function applyOpenTiming(
  plan: AutoOpenPlan | null,
  variant: string,
  viewport: Viewport,
): TimedAutoOpenPlan | null {
  if (!plan) return null

  // Hors du cas testé : première visite, ouverture en grand. Tout le reste
  // garde le comportement que les sept règles lui ont donné.
  if (!plan.open || plan.message !== 'first') return { ...plan, trigger: 'timer' }

  const floor = viewport === 'mobile' ? MOBILE_MIN_PRESENCE_MS : 0

  if (variant === 'onScroll') return { ...plan, delayMs: floor, trigger: 'scroll' }

  const delay = TIMING_DELAY_MS[variant]
  if (delay === undefined) return { ...plan, trigger: 'timer' }
  return { ...plan, delayMs: Math.max(delay, floor), trigger: 'timer' }
}

/** Le chemin de la page sans son préfixe de langue — réexporté pour que le
 *  widget n'ait pas à connaître deux modules pour une seule question. */
export function isLocalePrefixed(pathname: string): boolean {
  const first = pathname.split('/').filter(Boolean)[0]
  return first !== undefined && (routing.locales as readonly string[]).includes(first)
}
