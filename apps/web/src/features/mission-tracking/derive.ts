import type { InvoiceBlocker, InvoiceReadiness } from '@bellum/contracts'
import { BLOCKER_ACTIONS, isInvoicedState } from '@bellum/contracts'
import type { TimesheetLine } from '@/features/missions/api'
import { collectionStatus, nextCollectionAction, type CollectionStatus } from '@/features/missions/collections'

/**
 * LES DÉRIVATIONS DE « SUIVI, FACTURATION & AUTOMATISATIONS ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS (GA-26)
 * ─────────────────────────────────────────────────────────────────────────
 * Il ne recalcule AUCUN bloqueur de facturation, AUCUN retard d'encaissement.
 * Ces règles vivent dans `/delivery/invoice-readiness` (le `state` et les
 * `blockers` d'une ligne) et dans `@/features/missions/collections`
 * (`collectionStatus`, `nextCollectionAction`) — ce fichier les LIT et les
 * COMPOSE, mission par mission, pour la grande table que D-22-2 refusait
 * précisément parce qu'elle n'existait nulle part. Deux chemins qui
 * referaient le même retard divergeraient (c'est l'objection de D-22-2, et
 * elle reste vraie) : la réponse n'est pas de recalculer ailleurs, c'est de
 * COMPOSER sans dérivation neuve.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TRAVERSE LES TROIS COLONNES
 * ─────────────────────────────────────────────────────────────────────────
 * « sans objet » (le concept ne s'applique pas à cette ligne — un forfait n'a
 * pas de CRA, un mois non dû n'a pas de paiement) n'est ni « à faire » (une
 * action attend) ni « non mesuré » (on n'a simplement pas la donnée sous la
 * main). Les trois se distinguent PARTOUT dans ce fichier, jamais compressés
 * l'un sur l'autre.
 */

// ─────────────────────────────────────────────────────────────────────────
// CRA — un statut PAR MISSION, choisi parmi les relevés (un par consultant)
// du mois ouvert. Le statut de chaque LIGNE est lu tel quel sur `status` —
// c'est le serveur qui a déjà décidé s'il bloque ou non.
// ─────────────────────────────────────────────────────────────────────────
export type CraStatus = 'validated' | 'pending_validation' | 'action_needed' | 'not_applicable' | 'unknown'

/** Les statuts qui appellent un geste — ceux que `TimesheetsPage` peint en
 *  avertissement, moins `not_required` (sans objet) et `validated` (réglé). */
const CRA_ACTION_NEEDED: ReadonlySet<string> = new Set(['missing', 'draft', 'expected', 'rejected', 'disputed'])

/**
 * `lines` = les relevés de CE mois pour CETTE mission (zéro, un, ou un par
 * consultant affecté). `unknown` quand la liste est vide : une mission dont on
 * n'a AUCUN relevé sous la main — parce que le mois demandé ne la couvre pas —
 * n'est pas « à faire », elle est simplement hors de portée de ce calcul.
 */
export function deriveCraStatus(lines: readonly TimesheetLine[]): CraStatus {
  if (lines.length === 0) return 'unknown'
  if (lines.some(line => CRA_ACTION_NEEDED.has(line.status))) return 'action_needed'
  if (lines.some(line => line.status === 'submitted')) return 'pending_validation'
  if (lines.every(line => line.status === 'not_required')) return 'not_applicable'
  if (lines.some(line => line.status === 'validated')) return 'validated'
  return 'unknown'
}

// ─────────────────────────────────────────────────────────────────────────
// FACTURATION — l'état SERVEUR, tel quel. Rien à dériver : `blocked | ready |
// invoiced | not_due` sont les quatre valeurs que la readiness calcule déjà.
// ─────────────────────────────────────────────────────────────────────────
export type InvoicingStatus = InvoiceReadiness['state'] | 'unknown'

/** `undefined` = aucune ligne de readiness pour cette mission sur le mois
 *  interrogé : « non mesuré », jamais confondu avec `blocked`. */
export function deriveInvoicingStatus(row: InvoiceReadiness | undefined): InvoicingStatus {
  return row ? row.state : 'unknown'
}

// ─────────────────────────────────────────────────────────────────────────
// PAIEMENT — dérivé du MÊME row de facturation, jamais recalculé.
// ─────────────────────────────────────────────────────────────────────────
export type PaymentStatus = CollectionStatus | 'not_applicable' | 'not_invoiced' | 'unknown'

/**
 * QUATRE états, et le troisième est celui que #1382 réclame.
 *
 * Un mois `not_due` (jalon, forfait) n'aura JAMAIS de paiement à suivre :
 * `not_applicable`, un état différent de `unknown` — celui-ci se répare en
 * regardant, celui-là ne se répare pas.
 *
 * Un mois FACTURÉ réutilise `collectionStatus`, la dérivation exacte de
 * `/missions/encaissements` : recalculer un second retard ici ferait diverger
 * les deux écrans.
 *
 * ⚠️ **`not_invoiced` — ce que ce lot corrige (#1382).** Un mois `blocked` ou
 * `ready` rendait `unknown`, c'est-à-dire « non mesuré ». C'était FAUX, et
 * c'est la cause racine « cassé et non mesurable se ressemblent », prise à
 * l'envers : on SAIT parfaitement pourquoi il n'y a pas de paiement — la
 * facture n'est pas partie. « Éviter "non mesuré" sans explication », dit le
 * retour ; la réponse n'est pas d'ajouter une phrase à côté d'un état faux,
 * c'est de nommer l'état vrai.
 *
 * `unknown` garde son seul cas légitime : AUCUNE ligne de facturation pour ce
 * mois — là, on n'a effectivement pas regardé.
 */
export function derivePaymentStatus(row: InvoiceReadiness | undefined, now: Date): PaymentStatus {
  if (!row) return 'unknown'
  if (row.state === 'not_due') return 'not_applicable'
  if (!isInvoicedState(row.state)) return 'not_invoiced'
  return collectionStatus(row, now)
}

// ─────────────────────────────────────────────────────────────────────────
// PROCHAINE ACTION — LE LIEN. C'est la colonne que la fiche de lecture du
// 26/08 note comme le meilleur élément de toutes les maquettes : elle ne dit
// pas seulement quoi faire, elle MÈNE à l'écran qui répare.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Une action de facturation : le bloqueur le plus grave de la ligne (ils sont
 * ordonnés par gravité dans `INVOICE_BLOCKERS`).
 *
 * ⚠️ Le bloqueur SEUL, depuis #1383. Cette forme portait aussi `actionKey` et
 * `route`, recopiés de `BLOCKER_ACTIONS` — et l'écran s'en servait pour
 * réassembler la clé i18n et le lien à la main. C'est exactement le geste que
 * `nextActionLink` existe pour supprimer : la correspondance
 * bloqueur → libellé → destination vit à UN seul endroit (GA-26), et deux
 * copies divergent au premier bloqueur ajouté.
 */
type BlockerNextAction = { kind: 'blocker'; blocker: InvoiceBlocker }
/** Une relance d'encaissement due, au rang `index` de la cadence. */
type ReminderNextAction = { kind: 'reminder'; index: number }
/** Un geste d'encaissement qui n'est pas une relance datée. */
type CollectionNextAction = {
  kind: 'collection'
  actionKey: 'resolve_dispute' | 'set_due_date' | 'escalate_to_human'
}
export type NextAction = BlockerNextAction | ReminderNextAction | CollectionNextAction | null

/**
 * Priorité : un bloqueur de facturation d'abord (rien ne sert de relancer un
 * paiement sur une facture qui n'est même pas prête). À défaut, si le mois
 * est facturé, le geste d'encaissement dû aujourd'hui. Sinon, rien à faire —
 * et « rien à faire » (state `ready`/`not_due`, ou `wait` côté encaissement)
 * rend `null`, jamais un lien mort.
 *
 * ⚠️ Elle ne fait QUE désigner la destination : comme `BLOCKER_ACTIONS` déjà
 * utilisé en texte sur sept écrans du dépôt, elle n'exécute jamais le geste
 * elle-même — c'est à l'écran de destination de le faire, avec sa propre
 * porte d'écriture.
 */
export function deriveNextAction(row: InvoiceReadiness | undefined, now: Date): NextAction {
  if (!row) return null
  if (row.blockers.length > 0) {
    const blocker = row.blockers[0] as InvoiceBlocker
    // ⚠️ On vérifie que le bloqueur est CONNU de la table, sans en recopier le
    // contenu : un bloqueur qu'aucune réparation ne couvre ne doit pas produire
    // un lien mort. La table reste la source, `nextActionLink` la relit.
    if (!BLOCKER_ACTIONS[blocker]) return null
    return { kind: 'blocker', blocker }
  }
  if (isInvoicedState(row.state)) {
    const action = nextCollectionAction(row, now)
    if (!action || action.kind === 'wait') return null
    if (action.kind === 'remind') return { kind: 'reminder', index: action.index }
    return { kind: 'collection', actionKey: action.kind }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// LA GRANDE TABLE — une ligne par mission, les trois colonnes composées.
// ─────────────────────────────────────────────────────────────────────────
export type MissionTrackingRow<Mission extends { id: string }> = {
  mission: Mission
  cra: CraStatus
  invoicing: InvoicingStatus
  payment: PaymentStatus
  nextAction: NextAction
  readiness: InvoiceReadiness | undefined
}

/**
 * Le JOIN, en mémoire, par `missionId` — la seule dérivation neuve de ce lot,
 * et elle ne fait QUE composer des faits déjà calculés ailleurs.
 */
export function buildMissionTrackingRows<Mission extends { id: string }>(
  missions: readonly Mission[],
  timesheetLines: readonly TimesheetLine[],
  readinessRows: readonly InvoiceReadiness[],
  now: Date,
): MissionTrackingRow<Mission>[] {
  const linesByMission = new Map<string, TimesheetLine[]>()
  for (const line of timesheetLines) {
    const bucket = linesByMission.get(line.missionId)
    if (bucket) bucket.push(line)
    else linesByMission.set(line.missionId, [line])
  }
  const readinessByMission = new Map(readinessRows.map(row => [row.missionId, row]))

  return missions.map(mission => {
    const lines = linesByMission.get(mission.id) ?? []
    const readiness = readinessByMission.get(mission.id)
    return {
      mission,
      cra: deriveCraStatus(lines),
      invoicing: deriveInvoicingStatus(readiness),
      payment: derivePaymentStatus(readiness, now),
      nextAction: deriveNextAction(readiness, now),
      readiness,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// LA FILE À TRAITER — #1378
// ─────────────────────────────────────────────────────────────────────────

/**
 * POURQUOI CETTE DÉRIVATION EXISTE.
 *
 * #1377 et #1378 disent la même chose par deux bouts : « ne pas faire de Suivi
 * une deuxième liste de missions actives — cette fonction existe déjà dans
 * Missions > En cours », et « les missions totalement saines ne doivent pas
 * noyer la file de travail ». L'écran répondait « qu'est-ce qui se passe ? » ;
 * il doit répondre « qu'est-ce qui BLOQUE ? ».
 *
 * ⚠️ Elle ne calcule AUCUN état neuf. Elle LIT les quatre déjà dérivés
 * au-dessus et dit lesquels appellent un geste — c'est la règle qui gouverne
 * tout ce fichier, et elle vaut pour ce bloc comme pour les autres (GA-26).
 *
 * ⚠️ **« sans objet » et « non mesuré » ne sont jamais des motifs.** Un forfait
 * n'a pas de CRA à corriger et un mois qu'on n'a pas lu n'est pas un mois en
 * retard : les faire entrer dans la file remplirait « À traiter » de lignes
 * sur lesquelles il n'y a rien à faire, c'est-à-dire reconstruirait exactement
 * le bruit que #1378 demande de retirer.
 *
 * ⚠️ NON exporté : il ne sert qu'ici et dans les tests de ce fichier. Un type
 * exporté sans consommateur externe est une promesse d'API que personne ne
 * tient — `knip` la refuse, et il a raison. Les appelants l'INFÈRENT depuis
 * `trackingConcerns`.
 */
type TrackingConcern =
  | 'payment_overdue'
  | 'payment_disputed'
  | 'invoicing_blocked'
  | 'cra_action'
  | 'invoicing_ready'
  | 'cra_pending'
  | 'next_action'

/**
 * L'ordre est celui de l'urgence RÉELLE, et il se lit comme une phrase : de
 * l'argent déjà en retard, puis de l'argent bloqué, puis ce qui le débloque,
 * puis de l'argent prêt à partir, puis ce qui attend un tiers.
 *
 * `next_action` ferme la marche : c'est le motif de dernier recours, celui qui
 * dit « Action OS a quelque chose d'ouvert » quand aucune des trois colonnes
 * ne l'explique déjà.
 */
const CONCERNS_IN_URGENCY_ORDER: readonly TrackingConcern[] = [
  'payment_overdue',
  'payment_disputed',
  'invoicing_blocked',
  'cra_action',
  'invoicing_ready',
  'cra_pending',
  'next_action',
]

/**
 * Tous les motifs d'une ligne, du plus urgent au moins urgent. Tableau VIDE =
 * rien à traiter — jamais un motif de remplissage.
 *
 * ⚠️ `next_action` n'est ajouté QUE si aucune colonne ne l'explique déjà. Une
 * facture bloquée porte presque toujours une action Action OS : la compter en
 * plus afficherait deux fois le même geste sur la même ligne (loi 4 du tome 7).
 */
export function trackingConcerns<Mission extends { id: string }>(row: MissionTrackingRow<Mission>): TrackingConcern[] {
  const concerns: TrackingConcern[] = []
  if (row.payment === 'overdue') concerns.push('payment_overdue')
  if (row.payment === 'disputed') concerns.push('payment_disputed')
  if (row.invoicing === 'blocked') concerns.push('invoicing_blocked')
  if (row.cra === 'action_needed') concerns.push('cra_action')
  if (row.invoicing === 'ready') concerns.push('invoicing_ready')
  if (row.cra === 'pending_validation') concerns.push('cra_pending')
  if (concerns.length === 0 && row.nextAction !== null) concerns.push('next_action')
  return concerns
}

/** « Cette mission a-t-elle réellement quelque chose à traiter ? » (#1378) */
export function isToAct<Mission extends { id: string }>(row: MissionTrackingRow<Mission>): boolean {
  return trackingConcerns(row).length > 0
}

/** Le rang d'urgence d'une ligne. Une ligne saine passe après TOUTES les autres. */
function urgencyRank<Mission extends { id: string }>(row: MissionTrackingRow<Mission>): number {
  const first = trackingConcerns(row)[0]
  return first === undefined ? CONCERNS_IN_URGENCY_ORDER.length : CONCERNS_IN_URGENCY_ORDER.indexOf(first)
}

/**
 * L'ordre de lecture de la file (#1378).
 *
 * ⚠️ Trier n'est pas filtrer : une ligne saine descend, elle ne disparaît pas —
 * c'est « Tout le suivi » qui la montre, et la vue « À traiter » qui la retire.
 * Les deux vues lisent donc la MÊME liste triée, ce qui évite deux ordres qui
 * divergeraient.
 *
 * À égalité de motif, le nom départage : sans lui l'ordre dépendrait de celui
 * que le serveur a renvoyé, et la file se réordonnerait à chaque rechargement
 * sans que rien n'ait changé.
 */
export function sortByUrgency<Mission extends { id: string; label?: string | null }>(
  rows: readonly MissionTrackingRow<Mission>[],
): MissionTrackingRow<Mission>[] {
  return [...rows].sort((a, b) => {
    const rank = urgencyRank(a) - urgencyRank(b)
    if (rank !== 0) return rank
    return (a.mission.label ?? '').localeCompare(b.mission.label ?? '', 'fr')
  })
}

// ─────────────────────────────────────────────────────────────────────────
// L'AUTOMATISATION QUI AURAIT DÛ SE DÉCLENCHER — #1380
// ─────────────────────────────────────────────────────────────────────────

/**
 * « Sur Suivi, ne montrer directement qu'une automatisation si elle est liée à
 * un problème visible. Exemple : "1 CRA manquant aurait dû déclencher une
 * relance." » — #1380.
 *
 * ⚠️ **Deux correspondances, et pas quatre.** Le rail porte quatre routines de
 * mission, mais seules deux couvrent un motif que CETTE table voit :
 * `timesheet_chase` relance les relevés manquants (`cra_action`) et
 * `invoice_readiness` signale ce qui bloque la facturation
 * (`invoicing_blocked`). `mission_ending` (fins à 30 jours) et `margin_alert`
 * (marge sous le seuil) portent sur des faits que cette table ne lit pas :
 * les rattacher à un motif voisin serait une correspondance inventée, et elle
 * accuserait une routine de n'avoir pas fait un travail qui n'est pas le sien.
 *
 * ⚠️ **Un état inconnu ne produit AUCUN manque.** Une routine absente de la
 * carte — les routines n'ont pas chargé, ou l'espace n'a pas d'abonnement lu —
 * n'est pas « inactive » : conclure un verdict d'un silence est une cause
 * racine de ce dépôt.
 */
const AUTOMATION_COVERAGE: readonly { routine: string; concern: TrackingConcern }[] = [
  { routine: 'invoice_readiness', concern: 'invoicing_blocked' },
  { routine: 'timesheet_chase', concern: 'cra_action' },
]

export type AutomationGap = { routine: string; count: number }

/**
 * Les garde-fous ÉTEINTS que la file rend visibles, dans l'ordre de l'urgence
 * du motif qu'ils couvrent.
 *
 * `enabledByRoutine` : `true` actif, `false` inactif, ABSENT = on ne sait pas.
 */
export function automationGaps<Mission extends { id: string }>(
  rows: readonly MissionTrackingRow<Mission>[],
  enabledByRoutine: ReadonlyMap<string, boolean>,
): AutomationGap[] {
  const gaps: AutomationGap[] = []
  for (const { routine, concern } of AUTOMATION_COVERAGE) {
    if (enabledByRoutine.get(routine) !== false) continue
    const count = rows.filter(row => trackingConcerns(row).includes(concern)).length
    if (count > 0) gaps.push({ routine, count })
  }
  return gaps
}

/**
 * LES DEUX VUES DE L'ÉCRAN — #1378.
 *
 * « À traiter » d'abord : c'est la réponse à « qu'est-ce qui bloque aujourd'hui
 * entre l'exécution d'une mission, son CRA, sa facturation et son paiement ? »
 * (#1377). « Tout le suivi » garde le portefeuille accessible — trier n'est pas
 * jeter, et une mission saine doit rester consultable.
 */
export const TRACKING_VIEWS = ['toAct', 'all'] as const
export type TrackingView = (typeof TRACKING_VIEWS)[number]
