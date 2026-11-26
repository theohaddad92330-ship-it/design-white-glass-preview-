import type { GuideAbsenceReason, GuideStepRequirements } from '@bellum/contracts'

/**
 * #2212.32/.33/.34/.35 — LES CINQ PORTES D'UNE ÉTAPE DE GUIDE, EN UNE FONCTION PURE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PURE, ET POURQUOI SÉPARÉE DU DOM
 * ─────────────────────────────────────────────────────────────────────────────
 * Décider si une étape a un sens ne demande aucun DOM : ça demande de savoir où
 * on est, ce qu'on a le droit de faire, quelle largeur d'écran, quelle donnée et
 * quels drapeaux. Mélanger cette décision avec la recherche de l'élément dans la
 * page produirait la seule chose qu'on ne peut pas tester : « l'étape ne s'est
 * pas affichée » sans savoir si c'est parce qu'elle n'avait pas le droit ou
 * parce que le nœud n'était pas encore là.
 *
 * Ici, une porte fermée rend une RAISON. C'est tout. Personne n'affiche, personne
 * n'attend, rien n'est deviné.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DES PORTES EST UNE PROMESSE FAITE À LA MESURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Route → permission → largeur → donnée → drapeau. Quand deux portes sont
 * fermées, la raison rendue est TOUJOURS la même, et c'est ce qui rend l'agrégat
 * « pourquoi ce pas ne s'affiche pas » exploitable. L'ordre suit celui dans
 * lequel un humain diagnostique : d'abord *où suis-je*, ensuite *ai-je le
 * droit*, ensuite *y a-t-il la place*, enfin *y a-t-il de quoi parler*.
 *
 * ⚠️ L'agrégation se fait par ÉCRAN / FONCTION / PARCOURS, jamais par personne
 * (doctrine analytique produit, GA-240/241) : cette fonction ne reçoit donc
 * aucune identité, et n'en veut aucune. Elle ne prend pas d'`userId` — si un
 * jour quelqu'un veut en ajouter un ici, c'est le signe qu'on est en train de
 * mesurer la personne.
 */

/**
 * Ce que le guide doit savoir du monde pour décider. Rien de plus — et
 * surtout rien qui identifie qui que ce soit.
 */
export type GuideStepContext = {
  /** La route courante, telle que le routeur la donne. */
  route: string
  /** Les permissions effectives de la session, par leur nom. */
  permissions: readonly string[]
  /** La largeur utile en pixels CSS. */
  viewportWidth: number
  /** Les jeux de données présents à l'écran (`account.any`, `mission.any`…). */
  availableData: readonly string[]
  /** Les drapeaux de fonctionnalité activés. */
  enabledFlags: readonly string[]
}

/**
 * Une route exigée couvre ses ENFANTS : une étape qui vise `/comptes` a du sens
 * sur `/comptes/42`. Le test de préfixe se fait sur un séparateur, sinon
 * `/comptes` attraperait `/comptes-archives` — deux écrans différents.
 */
export function routeMatches(required: string, current: string): boolean {
  if (current === required) return true
  const normalised = required.endsWith('/') ? required : `${required}/`
  return current.startsWith(normalised)
}

/**
 * Rend la RAISON de la première porte fermée, ou `null` si l'étape peut se
 * montrer. Ne lève jamais : un contexte incomplet ferme la porte (#2212.38/.39,
 * « ne bloque jamais l'application », « ne fait jamais planter la page »). Une
 * largeur illisible n'est pas « assez large par défaut » — ce serait inventer.
 */
export function closedGuideGate(
  requirements: GuideStepRequirements,
  context: GuideStepContext,
): GuideAbsenceReason | null {
  // #2212.32 — la route : une étape hors de son écran ne montre rien.
  if (requirements.route && !routeMatches(requirements.route, context.route ?? '')) return 'route'

  // #2212.33 — la permission : montrer un geste interdit est pire que se taire.
  if (requirements.permission && !(context.permissions ?? []).includes(requirements.permission)) return 'permission'

  // #2212.34 — la largeur : la surface visée n'existe pas à toutes les tailles
  // (GA-28, la borne du produit est 768 px). Une largeur non mesurable ferme.
  if (requirements.minViewportWidth !== undefined) {
    const width = context.viewportWidth
    if (!Number.isFinite(width) || width < requirements.minViewportWidth) return 'viewport'
  }

  // #2212.35 — la donnée : un guide qui montre « enrichir ce compte » sans
  // compte parle dans le vide.
  if (requirements.requiresData && !(context.availableData ?? []).includes(requirements.requiresData)) return 'data'

  // #2212.35 — le drapeau de fonctionnalité.
  if (requirements.featureFlag && !(context.enabledFlags ?? []).includes(requirements.featureFlag)) return 'flag'

  return null
}
