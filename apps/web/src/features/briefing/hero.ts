import {
  BRIEFING_SURFACE_STATE_CONTRACT,
  countRepliesToTreat,
  briefingSurfaceStateOf,
  type BriefingSurfaceGesture,
  type BriefingSurfaceState,
  type DailyBriefing,
} from '@bellum/contracts'

/**
 * CE QUE L'EN-TÊTE DE « AUJOURD'HUI » SAIT DIRE (#2113.8 à #2113.10, #2111.49).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX DÉCISIONS, ET CE QU'ELLES REFUSENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. LE RÉSUMÉ NE COMPTE QUE CE QU'IL A. Un segment n'apparaît que si son
 *    compte est strictement positif ET si la source qui le porte a répondu.
 *    « 0 relance » n'est pas une information : c'est « non mesuré » déguisé en
 *    chiffre quand la messagerie est muette, et une ligne de bruit quand elle
 *    ne l'est pas. Dans une LISTE, une absence ne fait AUCUNE ligne — et ce
 *    résumé est une liste (GA-18 / GA-19).
 *
 * 2. LE CTA SUIT L'ÉTAPE QUI MANQUE, pas l'envie de proposer quelque chose.
 *    #2111.49 le dit en une phrase : « CTA principal dépendant de l'étape
 *    manquante ». On prend donc l'état le PIRE des trois sources et on rend le
 *    geste que le contrat d'état a écrit pour lui. Quand tout est servi, le
 *    geste est celui de la journée : commencer par la première priorité.
 *
 * ⚠️ NI L'UN NI L'AUTRE NE DÉPEND DU RÔLE. Décision de Louis du 21/09/2026, qui
 * maintient celle du 16/09 : le rôle change l'ORDRE des cartes
 * (`briefing-role-order.ts`), jamais leur CONTENU. Un en-tête qui retirerait
 * un segment à un recruteur lui cacherait une journée qu'il a le droit de voir,
 * et ce module n'a donc AUCUN paramètre de rôle — ce n'est pas un oubli.
 */

/** Ce qu'un segment du résumé compte. Liste fermée : un segment de plus se décide.
 *  Non exporté : seul ce fichier le nomme, et `knip` refuse une fuite de type. */
type BriefingHeroSegment = {
  key: 'meetings' | 'replies' | 'followUps' | 'overdueTasks' | 'blockers'
  count: number
}

/**
 * LES SEGMENTS DU RÉSUMÉ DYNAMIQUE — seulement ceux qu'on peut prouver.
 *
 * ⚠️ Chaque segment vérifie l'ÉTAT de sa source avant de compter. Une boîte
 * muette ne rend pas « 0 réponse » : elle ne rend rien, et le bandeau des
 * sources dit déjà qu'elle n'a pas répondu. Compter sur une source `partial`
 * reste honnête — la liste est incomplète, pas fausse — et le bloc concerné
 * porte son avis « il me manque une source ».
 */
export function briefingHeroSegments(data: DailyBriefing): BriefingHeroSegment[] {
  const agendaServed = data.agenda.state === 'ready' || data.agenda.state === 'partial'
  const mailServed = data.mail.state === 'ready' || data.mail.state === 'partial'
  const tasksServed = data.tasks.state === 'ready' || data.tasks.state === 'partial'

  // ⚠️ LE CHAÎNAGE OPTIONNEL N'EST PAS DE LA PRUDENCE DÉCORATIVE ICI. Les
  // champs neufs de `dailyBriefingSchema` sont optionnels à défaut vide pour
  // une raison écrite dans le contrat : pendant les minutes qui séparent le
  // déploiement du front de celui de l'API, l'écran reçoit encore la réponse de
  // l'API PRÉCÉDENTE, où ces champs n'existent pas. Un `.length` direct y
  // casserait la page entière — c'est arrivé sur `/actions/chaines` le
  // 05/09/2026. Un compte absent vaut ZÉRO, et zéro ne fait aucun segment.
  const candidates: BriefingHeroSegment[] = [
    { key: 'meetings', count: agendaServed ? (data.agenda.events?.length ?? 0) : 0 },
    { key: 'replies', count: mailServed ? countReplies(data) : 0 },
    { key: 'followUps', count: mailServed ? (data.mail.awaitingReply?.length ?? 0) : 0 },
    { key: 'overdueTasks', count: tasksServed ? (data.tasks.overdueCount ?? 0) : 0 },
    { key: 'blockers', count: data.chainBlockers?.length ?? 0 },
  ]
  return candidates.filter(segment => segment.count > 0)
}

/**
 * Les fils qui ATTENDENT une décision : les réponses favorables, et elles seules.
 * F2-FIX — le non-lu n'y est plus ajouté (« 11 » ici contre « 2 » sur /mailbox, recette du 20/10) :
 * la règle vit dans `countRepliesToTreat` (@bellum/contracts), la MÊME que celle de la messagerie.
 */
function countReplies(data: DailyBriefing): number {
  return countRepliesToTreat(data.mail.positiveReplies)
}

/**
 * L'ORDRE DE GRAVITÉ des états de surface — du plus bloquant au plus servi.
 *
 * Il sert à une seule chose : choisir QUEL état décide du geste principal quand
 * les trois sources ne racontent pas la même histoire. Une messagerie non
 * connectée pèse plus lourd qu'un agenda vide, parce qu'un jour vide se répare
 * en travaillant et qu'une source absente se répare en la branchant.
 */
const SEVERITY: BriefingSurfaceState[] = [
  'error',
  'not_connected',
  'permission_denied',
  'missing_scope',
  'connected_not_synced',
  'unavailable',
  'stale',
  'partial',
  'syncing',
  'ready_empty',
  'ready_with_data',
]

/**
 * OÙ MÈNE CHAQUE GESTE — et `null` quand il ne mène nulle part.
 *
 * ⚠️ `retry` vaut `null` à dessein : le bouton « Actualiser » de l'en-tête FAIT
 * déjà exactement ça, et un second bouton qui relance la même requête serait la
 * même action sous deux libellés (loi 4 du tome 7). Un geste à `null` n'est pas
 * rendu — l'en-tête passe alors à l'alternative de l'état, et s'il n'y en a pas
 * non plus, il ne propose RIEN plutôt qu'un bouton qui n'atterrit nulle part.
 */
const GESTURE_ROUTES: Record<BriefingSurfaceGesture, string | null> = {
  connect: '/integrations',
  reconnect: '/integrations',
  sync: '/integrations',
  retry: null,
  requestAccess: '/settings/team',
  audit: '/settings/profile/audit',
  analyseAccount: '/accounts',
  import: '/settings/mes-donnees',
  discover: '/discover',
  prepareMessage: '/accounts',
}

/** L'état de surface le plus grave des trois sources du brief. */
export function briefingWorstSurfaceState(data: DailyBriefing): BriefingSurfaceState {
  const states: BriefingSurfaceState[] = [
    briefingSurfaceStateOf({ state: data.agenda.state, hasData: (data.agenda.events?.length ?? 0) > 0 }),
    briefingSurfaceStateOf({
      state: data.mail.state,
      hasData: countReplies(data) + (data.mail.awaitingReply?.length ?? 0) > 0,
    }),
    briefingSurfaceStateOf({ state: data.tasks.state, hasData: (data.tasks.tasks?.length ?? 0) > 0 }),
  ]
  // Le premier de l'ordre de gravité qui est présent. `ready_with_data` ferme
  // la liste, donc il y a toujours une réponse — pas de repli à inventer.
  return SEVERITY.find(state => states.includes(state)) ?? 'ready_with_data'
}

/**
 * LE GESTE PRINCIPAL de l'en-tête, ou `null` quand aucun n'atterrit.
 *
 * Il rend le geste du contrat d'état, puis son alternative si le premier ne
 * mène nulle part. Deux essais et pas plus : un troisième repli finirait par
 * proposer un geste qui n'a rien à voir avec ce qui manque.
 */
export function briefingHeroGesture(
  state: BriefingSurfaceState,
): { gesture: BriefingSurfaceGesture; to: string; search?: { tab: 'imports' } } | null {
  const editorial = BRIEFING_SURFACE_STATE_CONTRACT[state]
  if (!editorial) return null
  for (const gesture of [editorial.primary, editorial.alternative]) {
    const to = GESTURE_ROUTES[gesture]
    // #4533.3 — « Importer » ouvre l'onglet Imports de Mes données (l'ancienne page `/settings/import`).
    if (to) return gesture === 'import' ? { gesture, to, search: { tab: 'imports' } } : { gesture, to }
  }
  return null
}
