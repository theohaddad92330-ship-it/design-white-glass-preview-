import { activeMissionRowSchema } from './account-missions.js'
import { BLOCKER_ACTIONS, INVOICE_BLOCKERS, type InvoiceBlocker } from './invoice-readiness.js'
import { NEED_NEXT_ACTIONS, type NeedNextAction } from './need-next-action.js'
import { ACCOUNT_SPRINT_NEXT_ACTIONS, type AccountSprintNextAction } from './sprint.js'

export { ACCOUNT_SPRINT_NEXT_ACTIONS }

/**
 * LA PROCHAINE ACTION EST UN LIEN — la dérivation UNIQUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, MOT POUR MOT (fiche de lecture des 17 écrans cibles, 26/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 *     « À garder — la colonne "prochaine action" sous forme de LIEN. C'est le
 *      meilleur élément de toutes les images, et ça doit devenir une règle du
 *      produit. »
 *
 * Une colonne qui dit « Typer les compétences » et laisse le lecteur chercher
 * OÙ ça se tape lui coûte trois écrans — et au bout de trois écrans, on ne le
 * fait pas. Le geste nommé et l'écran qui le porte sont la même information :
 * les séparer, c'est livrer la moitié qui ne sert à rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VIT ICI, ET À UN SEUL ENDROIT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * La colonne existe sur SEPT écrans. Sept tables de correspondance
 * « action → écran » divergent au premier ajout : on ajoute la septième action
 * du besoin, six écrans la rendent en texte muet et le septième la lie — et
 * personne ne le voit, parce qu'un texte muet ressemble beaucoup à un texte.
 *
 * Ce module n'INVENTE aucune correspondance qui existe déjà :
 *  - les bloqueurs de facturation portent la leur depuis le 21/08
 *    ({@link BLOCKER_ACTIONS}, `missing_timesheet → /missions/cra`). Ce fichier
 *    la LIT ; le recopier ferait deux vérités pour le même chemin ;
 *  - le vocabulaire d'une mission active se lit sur le SCHÉMA
 *    (`activeMissionRowSchema.shape.nextAction.options`), pas sur une liste
 *    tenue à la main à côté. Une action ajoutée au contrat entre donc dans le
 *    périmètre sans que personne n'ait à y penser — et la garde
 *    `next-action-is-a-link.test.ts` réclame sa destination.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX REFUS, ET ILS COMPTENT PLUS QUE LE RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **« Aucune » n'est pas une action.** `none` (« rien à engager
 *     maintenant ») garde son libellé et n'a AUCUNE destination. Un lien y
 *     promettrait un geste qui n'existe pas ;
 *  2. **Un écran ne se lie pas à lui-même.** `origin` porte la route de l'écran
 *     qui demande. Sur la fiche d'un besoin, « Typer les compétences » se tape
 *     JUSTE LÀ : la dérivation rend `route: null`, et l'écran écrit du texte.
 *     Un lien vers l'endroit où l'on est déjà promet un déplacement qui n'a pas
 *     lieu, et fait douter de tous les autres liens de la page.
 *
 * ⚠️ **Une destination qui n'existe pas reste du TEXTE.** Un lien mort est pire
 * qu'un texte : le texte ne promet rien, le lien promet un geste qui n'aboutit
 * pas. C'est la garde d'architecture qui le prouve, en confrontant
 * {@link nextActionRoutes} à l'ARBRE DE ROUTES réel (`routeTree.gen.ts`) et
 * jamais à une liste écrite à la main — une liste recopiée ne voit jamais ce
 * qui n'y est pas.
 *
 * ⚠️ Ce module ne fait QUE désigner. Il n'exécute aucun geste : c'est à l'écran
 * de destination de le faire, avec sa propre porte d'écriture.
 */

/* ────────────────────────────────────────────────────────────────────────── */
/*  Les vocabulaires — lus à leur source, jamais recopiés                     */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Les actions d'une mission ACTIVE, lues sur le schéma qui les déclare.
 *
 * `activeMissionRowSchema.shape.nextAction` est le `z.enum` du contrat : une
 * valeur ajoutée là-bas apparaît ici sans qu'on y touche. C'est le motif que
 * `propagated-blocks-are-links.test.ts` emploie déjà pour les champs propagés
 * — une liste recopiée ne suit pas, et la garde qui la lirait resterait verte.
 */
export const ACTIVE_MISSION_NEXT_ACTIONS = activeMissionRowSchema.shape.nextAction.options
type ActiveMissionNextAction = (typeof ACTIVE_MISSION_NEXT_ACTIONS)[number]

/* ────────────────────────────────────────────────────────────────────────── */
/*  Ce qu'une prochaine action rend                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Une prochaine action, prête à rendre : son libellé ET sa destination.
 *
 * `route` à `null` n'est pas un échec — c'est le refus documenté ci-dessus
 * (rien à faire, ou l'écran EST déjà la destination). L'appelant rend alors du
 * texte, et c'est la bonne réponse.
 */
export type NextActionLink = {
  /** L'identifiant, tel qu'il est écrit dans son domaine. */
  action: string
  /** La clé i18n COMPLÈTE, namespace inclus. Un écran ne la recompose jamais. */
  labelKey: string
  /** Un chemin de l'application, jamais un lien externe. `null` = du texte. */
  route: string | null
  /** Les paramètres de la route, RÉSOLUS. `{}` pour une route littérale. */
  params: Readonly<Record<string, string>>
}

/**
 * De quelle action on parle, et d'où on la regarde.
 *
 * L'identifiant de l'objet voyage AVEC l'action : sans lui, la destination
 * serait un écran de liste, c'est-à-dire l'endroit d'où l'on vient.
 */
export type NextActionRef = (
  | { domain: 'need'; action: NeedNextAction; needId: string }
  | { domain: 'active_mission'; action: ActiveMissionNextAction; missionId: string }
  | { domain: 'invoice_blocker'; action: InvoiceBlocker }
  // #3257.7b — la prochaine action d'un compte du board d'effort.
  | { domain: 'account_sprint'; action: AccountSprintNextAction; accountId: string }
) & {
  /** La route de l'écran qui demande. Égale à la destination ⇒ pas de lien. */
  origin?: string
}

/** Le namespace i18n où vivent les libellés de chaque domaine. */
export const NEXT_ACTION_LABEL_NAMESPACES = {
  need: 'projects',
  active_mission: 'accountMissions',
  invoice_blocker: 'missions',
  account_sprint: 'sprints',
} as const

/* ────────────────────────────────────────────────────────────────────────── */
/*  Les destinations                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

/** Une destination : un chemin, et le nom du paramètre qu'il attend. */
type Destination = { route: string; param?: 'needId' | 'id' }

/**
 * LE BESOIN — tout se répare sur sa fiche, et c'est vérifié.
 *
 * `/projects/needs/$needId` porte les six onglets qui lèvent les six actions :
 * les compétences et le tarif cible sur l'aperçu, le rapprochement sur
 * « Matching », l'envoi sur « Positionnements », la décision sur l'aperçu. Six
 * destinations distinctes n'existeraient PAS — les onglets sont un état de
 * composant, pas des routes —, et inventer `?tab=matching` fabriquerait une
 * URL que le routeur ne connaît pas.
 */
const NEED_DESTINATIONS: Readonly<Record<NeedNextAction, Destination>> = {
  type_skills: { route: '/projects/needs/$needId', param: 'needId' },
  decide_expired: { route: '/projects/needs/$needId', param: 'needId' },
  decide_stale_start: { route: '/projects/needs/$needId', param: 'needId' },
  answer_unstaffable: { route: '/projects/needs/$needId', param: 'needId' },
  run_matching: { route: '/projects/needs/$needId', param: 'needId' },
  set_target_rate: { route: '/projects/needs/$needId', param: 'needId' },
  send_shortlist: { route: '/projects/needs/$needId', param: 'needId' },
}

/**
 * LA MISSION ACTIVE — le dossier de la mission, où la date de fin et le
 * renouvellement se décident.
 *
 * ⚠️ `none` est `null`, et c'est le cœur de la règle : « rien à engager
 * maintenant » est un CONSTAT. Lui coller un lien ferait de chaque ligne calme
 * une invitation à cliquer pour ne rien trouver.
 */
const ACTIVE_MISSION_DESTINATIONS: Readonly<Record<ActiveMissionNextAction, Destination | null>> = {
  renewal_overdue: { route: '/missions/$id', param: 'id' },
  renew_now: { route: '/missions/$id', param: 'id' },
  renew_soon: { route: '/missions/$id', param: 'id' },
  set_end_date: { route: '/missions/$id', param: 'id' },
  none: null,
}

/**
 * #3257.7b — LE COMPTE DU BOARD D'EFFORT : la tâche ouverte à venir se fait, ou
 * se programme, sur le dossier du compte. Une seule destination, vérifiée
 * contre l'arbre de routes par la garde comme les autres domaines.
 */
const ACCOUNT_SPRINT_DESTINATIONS: Readonly<Record<AccountSprintNextAction, Destination>> = {
  do_next_task: { route: '/accounts/$id', param: 'id' },
  schedule_next_action: { route: '/accounts/$id', param: 'id' },
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  La dérivation                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

function resolve(ref: NextActionRef): { labelKey: string; destination: Destination | null; value: string | null } {
  switch (ref.domain) {
    case 'need':
      return {
        labelKey: `${NEXT_ACTION_LABEL_NAMESPACES.need}:openNeeds.nextAction.${ref.action}`,
        destination: NEED_DESTINATIONS[ref.action],
        value: ref.needId,
      }
    case 'active_mission':
      return {
        labelKey: `${NEXT_ACTION_LABEL_NAMESPACES.active_mission}:active.nextAction.${ref.action}`,
        destination: ACTIVE_MISSION_DESTINATIONS[ref.action],
        value: ref.missionId,
      }
    case 'account_sprint':
      return {
        labelKey: `${NEXT_ACTION_LABEL_NAMESPACES.account_sprint}:nextAction.${ref.action}`,
        destination: ACCOUNT_SPRINT_DESTINATIONS[ref.action],
        value: ref.accountId,
      }
    case 'invoice_blocker': {
      // La table des bloqueurs est la SOURCE : on la lit, on ne la double pas.
      const mapped = BLOCKER_ACTIONS[ref.action]
      return {
        labelKey: `${NEXT_ACTION_LABEL_NAMESPACES.invoice_blocker}:readiness.actions.${mapped.action}`,
        destination: { route: mapped.route },
        value: null,
      }
    }
  }
}

/**
 * Ce qu'une prochaine action DIT et ce vers quoi elle MÈNE.
 *
 * Rend toujours un objet : une action a toujours un libellé. C'est `route` qui
 * porte le refus — `null` quand il n'y a rien à faire, ou quand l'écran qui
 * demande EST la destination.
 */
export function nextActionLink(ref: NextActionRef): NextActionLink {
  const { labelKey, destination, value } = resolve(ref)

  // Rien à faire : le libellé le dit, aucune porte ne s'ouvre.
  if (!destination) return { action: ref.action, labelKey, route: null, params: {} }

  // Déjà sur place : un lien vers soi-même ne mène nulle part.
  if (ref.origin === destination.route) return { action: ref.action, labelKey, route: null, params: {} }

  // ⚠️ Un paramètre attendu et NON fourni ne se devine pas : sans lui, le lien
  // pointerait sur une URL littérale contenant « $needId ». Du texte, alors.
  if (destination.param && !value) return { action: ref.action, labelKey, route: null, params: {} }

  return {
    action: ref.action,
    labelKey,
    route: destination.route,
    params: destination.param && value ? { [destination.param]: value } : {},
  }
}

/**
 * Toutes les destinations de toutes les actions, sans doublon.
 *
 * C'est ce que la garde d'architecture confronte à `routeTree.gen.ts`. Elle est
 * DÉRIVÉE des tables ci-dessus, jamais écrite à côté : une liste recopiée ne
 * voit pas la destination qu'on vient d'ajouter, et reste verte.
 */
export function nextActionRoutes(): string[] {
  const routes = [
    ...NEED_NEXT_ACTIONS.map(action => NEED_DESTINATIONS[action].route),
    ...ACTIVE_MISSION_NEXT_ACTIONS.map(action => ACTIVE_MISSION_DESTINATIONS[action]?.route),
    ...INVOICE_BLOCKERS.map(blocker => BLOCKER_ACTIONS[blocker].route),
    ...ACCOUNT_SPRINT_NEXT_ACTIONS.map(action => ACCOUNT_SPRINT_DESTINATIONS[action].route),
  ].filter((route): route is string => typeof route === 'string')
  return [...new Set(routes)]
}
