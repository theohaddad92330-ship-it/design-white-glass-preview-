/**
 * #2385.2 (épopée #2877 — moteur d'apprentissage des messages, absent).
 *
 * Le registre du 24/09 constate : `outreach_transitions` (#2366.8) trace déjà
 * qu'un brouillon passe à `approved` ou `cancelled`, mais rien ne CLASSE cette
 * transition comme un signal EXPRESS de learning au sens de la spec (« valide
 * / modifie / rejette / change ton / CTA / épingle template »). Ce fichier ne
 * fait QUE cette classification, en lecture seule — pas de règle proposée, pas
 * de règle appliquée : le NO-GO (#2385.11 — Laura n'affirme jamais avoir
 * appris sans règle versionnée et réversible) tient par construction, parce
 * qu'aucune règle n'existe encore ici.
 *
 * Passe 2 (26/09) — « modifie » distingué de « valide tel quel » :
 * `outreach_message_versions.kind = 'user_edit'` (posé par
 * `outreach-message.service.ts` à CHAQUE édition réelle, déjà lu pour dériver
 * `edited_by_user` dans `outreach-canonical.ts`) dit qu'un humain a réécrit le
 * brouillon AVANT son approbation. `approvedAfterEdit` compte cela.
 *
 * Ce qui RESTE hors de cette tranche, nommé plutôt que tu : LEQUEL des trois
 * sous-signaux (change le ton / change le CTA / épingle un template) reste
 * indistinguable — `kind` dit QU'une édition a eu lieu, jamais sa NATURE, et
 * la distinguer supposerait de lire le CORPS du message, que la doctrine
 * interdit d'exposer (même à une classification). Les signaux comportementaux
 * (#2385.3), les 5 niveaux d'apprentissage (#2385.5) et la proposition de
 * règle elle-même dépendent toujours d'un moteur qui n'existe pas — épopée
 * #2877.
 */

import type {
  MessageLearningRuleScope,
  MessageLearningRuleSnapshotStatus,
  MessageLearningSummary,
} from '@bellum/contracts'

type ExpressMessageSignal = 'approved' | 'rejected'

export type MessageLearningSignals = {
  /** Le brouillon a été approuvé, édité ou non — `approvedWithoutEdit + approvedAfterEdit`. */
  approved: number
  /** Approuvé SANS édition détectée avant l'approbation. */
  approvedWithoutEdit: number
  /** Approuvé APRÈS au moins une édition (`outreach_message_versions.kind = 'user_edit'`) — nature de l'édition non distinguée, voir docblock de tête. */
  approvedAfterEdit: number
  /** Le brouillon a été écarté avant tout envoi. */
  rejected: number
  /** Sur combien de transitions ce décompte est bâti. Zéro ⇒ rien à mesurer. */
  sample: number
}

/**
 * Classe une transition de message en signal EXPRESS, ou `null` quand l'état
 * ne dit rien du jugement de l'utilisateur sur le TEXTE du message —
 * #2385.6 : un `bounced`/`expired`/`failed` vient du timing, du compte ou du
 * canal, jamais du message lui-même, donc il ne devient pas un signal.
 */
export function classifyExpressMessageSignal(transition: { to_state: string }): ExpressMessageSignal | null {
  if (transition.to_state === 'approved') return 'approved'
  if (transition.to_state === 'cancelled') return 'rejected'
  return null
}

export function computeExpressMessageLearningSignals(
  transitions: readonly { to_state: string; subject_id?: string }[],
  /** Les `message_id` (= `subject_id`) portant au moins une version `user_edit`. */
  editedMessageIds: ReadonlySet<string> = new Set(),
): MessageLearningSignals {
  let approvedWithoutEdit = 0
  let approvedAfterEdit = 0
  let rejected = 0
  for (const transition of transitions) {
    const signal = classifyExpressMessageSignal(transition)
    if (signal === 'approved') {
      if (transition.subject_id && editedMessageIds.has(transition.subject_id)) approvedAfterEdit += 1
      else approvedWithoutEdit += 1
    } else if (signal === 'rejected') {
      rejected += 1
    }
  }
  const approved = approvedWithoutEdit + approvedAfterEdit
  return { approved, approvedWithoutEdit, approvedAfterEdit, rejected, sample: approved + rejected }
}

/**
 * #2385.3 (épopée #2877, lot g20 26/09, complété LOT écrivain 28/09) — les
 * signaux COMPORTEMENTAUX. Le registre notait que les faits existent déjà
 * séparément (`outreach_transitions`) mais que rien ne les agrège en signal
 * DATÉ.
 *
 * Cette fonction agrège CINQ faits depuis LE MÊME journal que le signal
 * express, sans nouvelle table — envoi, réponse, refus (`bounced`/`failed` :
 * le message n'est jamais arrivé ou a échoué), délai — PLUS DEUX faits
 * REJOINTS depuis d'autres tables, en DEUX ENSEMBLES DÉJÀ RÉSOLUS par
 * l'appelant (`MessageLearningSignalsService`) : `optOut` (`contact_stops`,
 * fait le plus simple à rejoindre : un contact arrêté REND CAUSE, jamais
 * DEVINÉ) et `meetingBooked` (`user_actions.action_type = 'rdv_obtained'`).
 * Cette fonction reste PURE : elle ne fait AUCUNE requête, seulement
 * l'intersection entre les messages du journal et les deux ensembles reçus.
 *
 * #2385.1 — LA MÊME DISCIPLINE QUE `medianReplyDelayHours` S'APPLIQUE ICI :
 * `optOut`/`meetingBooked` restent des COMPTES, jamais une conclusion. Rien
 * ici n'affirme qu'UN message a CAUSÉ un opt-out ou un RDV — associer un
 * contact à SON dernier message ne distingue pas le timing, le compte ou le
 * canal (#2385.6), et rapprocher les deux resterait une corrélation sur UN
 * SEUL évènement par contact, jamais une preuve. Le NO-GO (#2385.11) tient
 * par construction : personne n'affirme un apprentissage depuis ces deux
 * chiffres, aucune règle n'en sort.
 *
 * #2385.6 tient par construction : `bounced`/`failed`/`expired` ne sont jamais
 * lus comme un jugement sur le MESSAGE (aucun champ ne les nomme « mauvais »),
 * exactement la même discipline que `classifyExpressMessageSignal`.
 *
 * `medianReplyDelayHours` : `null` quand aucune paire (sent → replied) n'est
 * mesurable sur le même sujet — un délai non mesuré n'est jamais zéro.
 */
export type BehavioralMessageLearningSignals = {
  sent: number
  delivered: number
  replied: number
  bounced: number
  failed: number
  expired: number
  /** `null` = aucune paire sent→replied mesurable, jamais 0. */
  medianReplyDelayHours: number | null
  /** Messages de l'échantillon dont le CONTACT a depuis arrêté tout envoi (`contact_stops`). */
  optOut: number
  /** Messages de l'échantillon dont le CONTACT porte un RDV obtenu (`user_actions.action_type = 'rdv_obtained'`). */
  meetingBooked: number
  sample: number
}

const _BEHAVIORAL_STATES = ['sent', 'delivered', 'replied', 'bounced', 'failed', 'expired'] as const
type BehavioralState = (typeof _BEHAVIORAL_STATES)[number]

function isBehavioralState(state: string): state is BehavioralState {
  return (_BEHAVIORAL_STATES as readonly string[]).includes(state)
}

export function computeBehavioralMessageLearningSignals(
  transitions: readonly { to_state: string; subject_id: string; occurred_at: Date | string }[],
  /**
   * Les `subject_id` (= `message_id`) dont le CONTACT apparaît déjà dans
   * l'ensemble correspondant — résolus par l'appelant, jamais devinés ici.
   * Absents (comportement d'avant ce lot) : les deux compteurs restent à 0.
   */
  outcomes: { stoppedMessageIds?: ReadonlySet<string>; meetingBookedMessageIds?: ReadonlySet<string> } = {},
): BehavioralMessageLearningSignals {
  const counts: Record<BehavioralState, number> = {
    sent: 0,
    delivered: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
    expired: 0,
  }
  const sentAt = new Map<string, number>()
  const repliedAt = new Map<string, number>()
  const sampledSubjects = new Set<string>()
  for (const transition of transitions) {
    if (!isBehavioralState(transition.to_state)) continue
    counts[transition.to_state] += 1
    sampledSubjects.add(transition.subject_id)
    const stamp = new Date(transition.occurred_at).getTime()
    if (!Number.isFinite(stamp)) continue
    if (transition.to_state === 'sent' && !sentAt.has(transition.subject_id)) sentAt.set(transition.subject_id, stamp)
    if (transition.to_state === 'replied' && !repliedAt.has(transition.subject_id)) {
      repliedAt.set(transition.subject_id, stamp)
    }
  }
  const delaysHours: number[] = []
  for (const [subjectId, sentStamp] of sentAt) {
    const replyStamp = repliedAt.get(subjectId)
    if (replyStamp === undefined || replyStamp < sentStamp) continue
    delaysHours.push((replyStamp - sentStamp) / 3_600_000)
  }
  delaysHours.sort((a, b) => a - b)
  const medianReplyDelayHours = delaysHours.length
    ? delaysHours.length % 2 === 1
      ? delaysHours[(delaysHours.length - 1) / 2]
      : (delaysHours[delaysHours.length / 2 - 1] + delaysHours[delaysHours.length / 2]) / 2
    : null
  let optOut = 0
  let meetingBooked = 0
  for (const subjectId of sampledSubjects) {
    if (outcomes.stoppedMessageIds?.has(subjectId)) optOut += 1
    if (outcomes.meetingBookedMessageIds?.has(subjectId)) meetingBooked += 1
  }
  return {
    ...counts,
    medianReplyDelayHours,
    optOut,
    meetingBooked,
    sample: counts.sent + counts.delivered + counts.replied + counts.bounced + counts.failed + counts.expired,
  }
}

/**
 * #2385.5 (épopée #2877) — la PLUS PETITE tranche prouvable des « 5 niveaux
 * d'apprentissage, gouvernés, jamais confondus » : un CANDIDAT de règle au
 * niveau WORKSPACE (le seul niveau que les signaux déjà calculés permettent
 * d'agréger sans deviner), gouverné par `messageLearningRuleScopeSchema`
 * (`@bellum/contracts`) — structurellement incapable de porter un autre
 * niveau que `workspace`.
 *
 * Ce n'est PAS le moteur entier : rien n'est PERSISTÉ, rien n'est APPLIQUÉ,
 * `version` reste toujours `1` (aucune historisation de versions
 * successives). Le NO-GO #2385.11 (jamais affirmer un apprentissage sans
 * règle versionnée et réversible CRÉÉE) tient par construction : `status`
 * reste `'proposed'`, ceci est un candidat calculé à la volée pour le
 * back-office, jamais une règle créée. Les niveaux message/campagne/
 * utilisateur/global restent hors de cette tranche — le schéma les gouverne
 * déjà, aucun code ne les peuple encore.
 *
 * #2385.1 tient ici aussi : le résumé rapporte des COMPTES mesurés
 * (`approvedWithoutEdit`/`approvedAfterEdit`), jamais un taux ni une
 * probabilité (doctrine — aucune probabilité affichée).
 */
export const MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE = 5

export type MessageLearningRuleCandidate = {
  scope: MessageLearningRuleScope
  version: 1
  status: 'proposed'
  summary: string
  basedOnSample: number
}

/** Le résumé, IDENTIQUE quel que soit le niveau — seul le `scope` distingue un candidat d'un autre (#2385.5). */
function buildMessageLearningRuleCandidate(
  scope: MessageLearningRuleScope,
  express: MessageLearningSignals,
  behavioral: BehavioralMessageLearningSignals,
): MessageLearningRuleCandidate | null {
  if (express.sample < MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE) return null

  const summary =
    `Sur ${express.approved} messages approuvés (échantillon de ${express.sample}), ` +
    `${express.approvedWithoutEdit} validés tels quels et ${express.approvedAfterEdit} édités avant validation` +
    (behavioral.sample > 0 ? `. ${behavioral.optOut} messages liés à un contact depuis arrêté.` : '.')

  return { scope, version: 1, status: 'proposed', summary, basedOnSample: express.sample }
}

/**
 * #2385.5 (épopée #2877, lot SRC4 28/09) — le niveau MESSAGE, le seul des 5
 * niveaux gouvernés à n'avoir jamais été peuplé : huit lots précédents l'ont
 * jugé « sans sens produit distinct du signal express déjà exposé » et l'ont
 * laissé de côté — un jugement, pas un blocage technique, tranché ici sans
 * Louis dans l'autre sens : le schéma le gouverne DÉJÀ
 * (`messageLearningRuleScopeSchema`), et ne pas le peupler laissait un niveau
 * gouverné sans aucun appelant qui le prouve.
 *
 * MÊME construction que les trois autres niveaux peuplés
 * (`buildMessageLearningRuleCandidate`), scopée à `messageId` — et c'est
 * justement ce qui referme #2385.1 pour ce niveau EXPLICITEMENT : le signal
 * express d'UN SEUL message est terminal (approuvé OU rejeté, une fois), son
 * `sample` ne peut structurellement pas atteindre
 * `MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE` en usage réel — ce niveau ne
 * proposera donc quasiment jamais de candidat, et c'est le comportement
 * CORRECT : une « règle » dérivée d'un seul message serait exactement le cas
 * isolé que #2385.1 interdit de transformer en règle. Le peupler rend ce
 * refus VÉRIFIABLE (testé) au lieu d'implicite.
 */
export function proposeMessageMessageLearningRule(
  messageId: string,
  express: MessageLearningSignals,
  behavioral: BehavioralMessageLearningSignals,
): MessageLearningRuleCandidate | null {
  return buildMessageLearningRuleCandidate({ level: 'message', messageId }, express, behavioral)
}

export function proposeWorkspaceMessageLearningRule(
  workspaceId: string,
  express: MessageLearningSignals,
  behavioral: BehavioralMessageLearningSignals,
): MessageLearningRuleCandidate | null {
  return buildMessageLearningRuleCandidate({ level: 'workspace', workspaceId }, express, behavioral)
}

/**
 * #2385.5 (LOT écrivain 28/09, passe 2) — le niveau UTILISATEUR, le second des
 * 5 niveaux gouvernés à se peupler après `workspace`. Même donnée déjà lue par
 * `expressSignals`/`behavioralSignals` (`outreach_transitions.user_id` porte
 * déjà QUI a approuvé ou rejeté chaque message, #2366.8) — filtrée en plus par
 * utilisateur au lieu d'agrégée sur tout l'espace. Un utilisateur reste
 * rattaché à SON espace (pas de candidat cross-workspace) : même discipline
 * que #2385.10, jamais un utilisateur agrégé à travers plusieurs espaces.
 */
export function proposeUserMessageLearningRule(
  userId: string,
  express: MessageLearningSignals,
  behavioral: BehavioralMessageLearningSignals,
): MessageLearningRuleCandidate | null {
  return buildMessageLearningRuleCandidate({ level: 'user', userId }, express, behavioral)
}

/**
 * #2385.5 (LOT écrivain 28/09, passe 2) — le niveau CAMPAGNE, le troisième à
 * se peupler. `campaign_label` (`outreach_sequences.campaign_label`, c74 —
 * doctrine mono-contact du 16/09/2026) est l'étiquette PARTAGÉE par plusieurs
 * séquences lancées ensemble : donnée déjà posée, jamais recalculée ici.
 */
export function proposeCampaignMessageLearningRule(
  campaignId: string,
  express: MessageLearningSignals,
  behavioral: BehavioralMessageLearningSignals,
): MessageLearningRuleCandidate | null {
  return buildMessageLearningRuleCandidate({ level: 'campaign', campaignId }, express, behavioral)
}

/**
 * #2877 (#2385.5, niveau GLOBAL — Louis 11/10/2026 : « sers-toi d'un max de
 * data possible et juste anonymise au besoin ») — le CINQUIÈME niveau, le
 * dernier à se peupler. Huit lots l'avaient laissé de côté au nom de GA-43 et
 * de #2385.10 ; la décision du 11/10 (élargissement daté de c92,
 * `c94_base_commune_capitalise_tout`) l'ouvre, ANONYMISÉ : il ne lit que les
 * cellules communes `shared_message_learning_aggregates` (k ≥ 3 espaces, un
 * jeton par signal, aucun identifiant d'espace, jamais le corps d'un message).
 *
 * MÊME construction que les quatre autres niveaux
 * (`buildMessageLearningRuleCandidate`) : un candidat `proposed`, jamais
 * appliqué seul (#2385.11). Un signal absent des cellules (sous le seuil)
 * compte zéro dans l'échantillon — il n'y a aucun taux à fausser, seulement
 * des comptes rapportés.
 */
export function globalMessageLearningSignals(cells: readonly { signal: string; count: number }[]): {
  express: MessageLearningSignals
  behavioral: BehavioralMessageLearningSignals
} {
  const count = (signal: string): number => cells.find(cell => cell.signal === signal)?.count ?? 0
  const approvedWithoutEdit = count('approved_without_edit')
  const approvedAfterEdit = count('approved_after_edit')
  const rejected = count('rejected')
  const approved = approvedWithoutEdit + approvedAfterEdit
  const sent = count('sent')
  const replied = count('replied')
  const bounced = count('bounced')
  return {
    express: { approved, approvedWithoutEdit, approvedAfterEdit, rejected, sample: approved + rejected },
    behavioral: {
      sent,
      delivered: 0,
      replied,
      bounced,
      failed: 0,
      expired: 0,
      // Un délai ne se mutualise pas en compte : non mesuré au niveau global.
      medianReplyDelayHours: null,
      optOut: 0,
      meetingBooked: 0,
      sample: sent + replied + bounced,
    },
  }
}

export function proposeGlobalMessageLearningRule(
  express: MessageLearningSignals,
  behavioral: BehavioralMessageLearningSignals,
): MessageLearningRuleCandidate | null {
  return buildMessageLearningRuleCandidate({ level: 'global' }, express, behavioral)
}

/**
 * #2385.5 (épopée #2877, LOT écrivain 28/09 passe 2) — la persistance
 * VERSIONNÉE et RÉVERSIBLE du candidat ci-dessus, la part restée hors de la
 * tranche précédente (« rien n'est PERSISTÉ, version reste toujours 1 »). Un
 * snapshot est un GESTE explicite (`POST .../proposed-rule/snapshot`), jamais
 * un effet de bord d'une lecture — chaque appel ajoute une ligne, n'écrase
 * jamais la précédente (`MessageLearningRuleProposalSnapshotEntity`,
 * contrainte SQL `(workspace_id, version)` unique).
 */
/**
 * #2385.1 (migration `1796405091234`) — `status` avance au-delà de
 * `'proposed'` seulement par une décision explicite et séparée : `decidedAt`
 * reste `null` tant qu'aucune décision n'a été prise.
 */
export type MessageLearningRuleSnapshot = {
  version: number
  status: MessageLearningRuleSnapshotStatus
  summary: string
  basedOnSample: number
  createdAt: string
  decidedAt: string | null
}

/**
 * #2385.4 (épopée #2877, lot P06 30/09) — les signaux QUALITÉ DÉCLARÉS : le
 * relecteur a dit « faux fait », « CTA incorrect » ou « persona incorrect »
 * (`outreach_message_quality_flags`). Rien n'est DEVINÉ en lisant le corps du
 * message (doctrine : le corps ne sort jamais vers une classification).
 *
 * Des COMPTES par nature, jamais un taux ni un « mauvais message » (#2385.6) :
 * une déclaration dit ce que le relecteur a vu, pas pourquoi un refus est
 * venu. `flaggedMessages` compte les messages DISTINCTS (un message signalé
 * deux fois pour deux natures ne compte qu'une fois). Zéro veut dire « aucune
 * DÉCLARATION », jamais « aucun faux fait » : ce qu'un relecteur n'a pas dit
 * n'est pas mesuré (GA-18/19).
 */
export type QualityFlagSignals = {
  wrongFact: number
  wrongCta: number
  wrongPersona: number
  flaggedMessages: number
}

export function computeQualityFlagSignals(rows: readonly { kind: string; message_id: string }[]): QualityFlagSignals {
  const flagged = new Set<string>()
  const counts = { wrongFact: 0, wrongCta: 0, wrongPersona: 0 }
  for (const row of rows) {
    if (row.kind === 'wrong_fact') counts.wrongFact += 1
    else if (row.kind === 'wrong_cta') counts.wrongCta += 1
    else if (row.kind === 'wrong_persona') counts.wrongPersona += 1
    else continue
    flagged.add(row.message_id)
  }
  return { ...counts, flaggedMessages: flagged.size }
}

/**
 * #2877 (recette prod 02/10) — l'écran agrégat : ce que l'ESPACE lit des
 * quatre lectures déjà calculées. Un bloc sans échantillon sort `null` (on
 * n'affiche pas ce qu'on n'a pas) ; aucun taux, aucun corps de message.
 */
export function buildMessageLearningSummary(input: {
  express: MessageLearningSignals
  behavioral: BehavioralMessageLearningSignals
  quality: QualityFlagSignals
  proposedRule: MessageLearningRuleCandidate | null
  /** #2877.1 — le candidat GLOBAL (base commune) ; absent = aucune règle commune. */
  globalRule?: MessageLearningRuleCandidate | null
  history: readonly MessageLearningRuleSnapshot[]
}): MessageLearningSummary {
  const { express, behavioral, quality, proposedRule, globalRule, history } = input
  return {
    express:
      express.sample > 0
        ? {
            approvedWithoutEdit: express.approvedWithoutEdit,
            approvedAfterEdit: express.approvedAfterEdit,
            rejected: express.rejected,
            sample: express.sample,
          }
        : null,
    behavioral:
      behavioral.sample > 0
        ? {
            sent: behavioral.sent,
            replied: behavioral.replied,
            meetingBooked: behavioral.meetingBooked,
            optOut: behavioral.optOut,
            bounced: behavioral.bounced,
            medianReplyDelayHours: behavioral.medianReplyDelayHours,
            sample: behavioral.sample,
          }
        : null,
    quality: quality.flaggedMessages > 0 ? { ...quality } : null,
    proposedRule: proposedRule ? { summary: proposedRule.summary, basedOnSample: proposedRule.basedOnSample } : null,
    // #2877.1 — texte et échantillon seulement : la portée reste interne.
    globalRule: globalRule ? { summary: globalRule.summary, basedOnSample: globalRule.basedOnSample } : null,
    history: history.map(snapshot => ({ ...snapshot })),
  }
}
