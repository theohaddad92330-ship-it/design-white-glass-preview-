import { z } from 'zod'
import { OUTREACH_QUALITY_FLAG_KINDS } from './outreach-quality-flag.js'
import type { OutreachDisplayStatus, OutreachSequenceStatus } from './outreach-sequence.js'

/**
 * #2366 — LE modèle canonique de l'outreach (LAU-FINAL-081), tranché par Louis
 * le 22/09 soir (decisions-louis-22-09-soir.md §3 : lot de conception qui
 * ÉTEND l'existant sans rien casser).
 *
 * Ce qui existait déjà et reste la vérité, sans renommage :
 *  - SEQUENCE / SEQUENCE_ENROLLMENT → `outreach_sequences` (mono-contact, c74 :
 *    une séquence EST l'inscription d'un contact) ;
 *  - APPROVAL_REQUEST (écritures CRM/ERP) → `outbound_write_requests` ;
 *  - SUPPRESSION / OPT-OUT → `email_suppressions` + `ContactStopService`.
 *
 * Ce qui naît ici, parce que rien ne le portait :
 *  - MESSAGE_DRAFT → `outreach_messages` + `outreach_message_versions` (un
 *    texte modifié crée une version, il n'écrase jamais) ;
 *  - CALL_TASK → `outreach_call_tasks` ;
 *  - TRANSITION → `outreach_transitions` (journal append-only, les dix champs
 *    de la spec : ancien/nouvel état, date, auteur, cause, preuve, outil,
 *    permission, résultat, erreur).
 *
 * Les machines sont PURES et vivent ici, au contrat : l'API les applique, l'écran
 * les lit, et personne ne réécrit une seconde table d'états.
 */

/* --------------------------------- intents -------------------------------- */

/** Le travail commercial demandé (OUTREACH_INTENT) — liste fermée de la spec. */
export const OUTREACH_INTENTS = [
  'open_relationship',
  'qualify_context',
  'ask_orientation',
  'reactivate',
  'get_introduction',
  'push_profile',
  'follow_meeting',
  'follow_up',
  'nurture',
  'get_feedback',
  'prepare_partnership',
  'clarify_need',
  // #2947/#2204.28 — « Référencement » : demander à être RECOMMANDÉ auprès
  // d'un tiers, distinct de `get_introduction` (qui vise CE contact-là) et de
  // `get_feedback` (un retour, pas une mise en relation). Ajouté EN FIN
  // (GA-08) ; la contrainte SQL est élargie AVANT ce commit (GA-11/GA-12,
  // migration `OutreachIntentReferral1796321401203`).
  'get_referral',
] as const
export const outreachIntentSchema = z.enum(OUTREACH_INTENTS)
export type OutreachIntent = z.infer<typeof outreachIntentSchema>

/**
 * #2366.1 — les dix surfaces qui préparent de l'outreach. Toutes écrivent LE
 * MÊME objet ; `source` dit d'où il est parti, jamais une copie propre à la
 * surface.
 */
export const OUTREACH_SURFACES = [
  'laura',
  'contacts',
  'targets',
  'accounts',
  'opportunities',
  'needs',
  'pool',
  'actions',
  'sequences',
  'today',
  // Lot L-D1 (#4167) — préparé par une AUTOMATISATION (règle « quand signal → alors … »), jamais envoyé seul.
  'automation',
] as const
export const outreachSurfaceSchema = z.enum(OUTREACH_SURFACES)
export type OutreachSurface = z.infer<typeof outreachSurfaceSchema>

// #2947/#2204.41 — « Voicemail/note d'appel » : un message laissé quand
// l'appel n'aboutit pas, distinct de `phone` (qui suppose un échange en
// direct). Ajouté EN FIN (GA-08) ; les deux contraintes SQL qui lisent cet
// enum (`outreach_messages_channel_check`, `message_style_templates_channel_check`
// — même vocabulaire, GA-26) sont élargies AVANT (GA-11/GA-12, migration
// `OutreachChannelVoicemail1796321401516`).
//
// #2947/#2204.40 — « Message de recommandation » : demander/rédiger une
// recommandation (LinkedIn ou équivalent), distinct de `get_referral`
// (`OUTREACH_INTENTS` — un OBJECTIF, « être recommandé auprès d'un tiers »)
// qui peut se poursuivre par n'importe quel canal existant. `recommendation`
// est un CANAL au sens de cette liste : le FORMAT du message lui-même diffère
// (un texte d'appui, pas une ouverture de conversation). Même discipline
// GA-11/GA-12 que `voicemail` : les deux contraintes SQL sont élargies AVANT
// (migration `OutreachChannelRecommendation1796321998542`). Comme pour
// `voicemail`, seul le CONTRAT est livré ici — aucun écran ni générateur de
// contenu ne lit encore `OUTREACH_MESSAGE_CHANNELS` (vérifié par `git grep`),
// donc aucune parité démo/i18n n'est due pour cette tranche.
//
// #2370 (épopée #2947, lot V10-F 17/10) — les huit canaux qui manquaient : SMS,
// WhatsApp, tâche/note, demande d'introduction, message partenaire, e-mail de
// suivi, push de profil consultant, note de connexion LinkedIn. Ajoutés EN FIN
// (GA-08), les cinq contraintes SQL de canal élargies AVANT (migration
// `OutreachChannelsSmsWhatsappAndPrepared1796560200370`, GA-11/GA-12). Chacun a
// sa règle de forme côté IA (`bellum_outreach.py` `_CHANNEL_RULES` — garde
// `test_outreach_channel_contract.py` : un canal d'ici sans règle IA échoue).
// Laura les PRÉPARE, le commercial envoie : aucun n'entre dans le balayeur
// d'envoi (`outreach-send.sweeper.ts` ne connaît que `email`).
export const OUTREACH_MESSAGE_CHANNELS = [
  'email',
  'linkedin',
  'phone',
  'manual',
  'voicemail',
  'recommendation',
  // #2370.sms … #2370.linkedin_connection_note — voir le bloc ci-dessus.
  'sms',
  'whatsapp',
  'task',
  'introduction_request',
  'partner_message',
  'follow_up_email',
  'profile_push',
  'linkedin_connection_note',
] as const
export const outreachMessageChannelSchema = z.enum(OUTREACH_MESSAGE_CHANNELS)
export type OutreachMessageChannel = z.infer<typeof outreachMessageChannelSchema>

/* --------------------------------- états ---------------------------------- */

// #2366.4 — les quinze états du message, dans l'ordre de la spec.
export const OUTREACH_MESSAGE_STATUSES = [
  'idea',
  'drafting',
  'drafted',
  'needs_review',
  'approved',
  'scheduled',
  'sending',
  'sent',
  'delivered',
  'bounced',
  'replied',
  'failed',
  'cancelled',
  'expired',
  'copied_manual',
] as const
export const outreachMessageStatusSchema = z.enum(OUTREACH_MESSAGE_STATUSES)
export type OutreachMessageStatus = z.infer<typeof outreachMessageStatusSchema>

// #2366.5 — les douze états d'une tâche d'appel, DISTINCTS du message.
export const OUTREACH_CALL_TASK_STATUSES = [
  'proposed',
  'ready',
  'scheduled',
  'due',
  'started',
  'completed',
  'no_answer',
  'wrong_person',
  'callback',
  'qualified',
  'refused',
  'cancelled',
] as const
export const outreachCallTaskStatusSchema = z.enum(OUTREACH_CALL_TASK_STATUSES)
export type OutreachCallTaskStatus = z.infer<typeof outreachCallTaskStatusSchema>

// #2366.6 — les onze états canoniques d'une séquence.
export const outreachSequenceCanonicalStatusSchema = z.enum([
  'draft',
  'needs_review',
  'ready',
  'waiting_for_connection',
  'scheduled',
  'active',
  'paused',
  'completed',
  'stopped',
  'failed',
  'archived',
])
export type OutreachSequenceCanonicalStatus = z.infer<typeof outreachSequenceCanonicalStatusSchema>

/**
 * #2366.6 — le statut canonique d'une séquence, LU depuis ce qui est stocké
 * (4 états) et ce qui est dérivé à l'affichage (10 états). Il COEXISTE avec
 * `awaiting_connection` au lieu de le renommer (reco du registre, tranchée
 * 22/09 soir §1) : `sequences-cockpit.ts` et `ChannelsBlock` lisent toujours
 * l'ancien nom, rien ne casse.
 *
 * `draft` et `archived` n'ont pas encore de chemin d'écriture : une séquence
 * naît armée et ne s'archive pas aujourd'hui. Ils sont nommés pour que le jour
 * où ils en ont un, le vocabulaire ne bouge pas.
 */
export function canonicalSequenceStatus(
  stored: OutreachSequenceStatus,
  display: OutreachDisplayStatus,
): OutreachSequenceCanonicalStatus {
  if (stored === 'paused') return 'paused'
  if (stored === 'completed') return 'completed'
  if (stored === 'cancelled') return 'stopped'
  switch (display) {
    case 'prepared':
      return 'ready'
    case 'scheduled':
      return 'scheduled'
    case 'awaiting_connection':
      return 'waiting_for_connection'
    case 'awaiting_validation':
      return 'needs_review'
    // Le contact a répondu : la séquence s'est arrêtée d'elle-même.
    case 'responded':
      return 'stopped'
    case 'failed':
      return 'failed'
    case 'completed':
      return 'completed'
    case 'paused':
      return 'paused'
    case 'cancelled':
      return 'stopped'
    // #2202.48/#2202.51 — deux causes d'arrêt plus précises que « cancelled »
    // à l'écran (`deriveOutreachDisplayStatus`), mais qui restent le même
    // état CANONIQUE : ni l'une ni l'autre ne reprend, comme tout arrêt.
    case 'refused':
      return 'stopped'
    case 'bounced':
      return 'stopped'
    case 'ready_to_copy':
      return 'active'
  }
}

/* ------------------------------ transitions ------------------------------- */

const MESSAGE_TRANSITIONS: Record<OutreachMessageStatus, readonly OutreachMessageStatus[]> = {
  idea: ['drafting', 'drafted', 'cancelled'],
  drafting: ['drafted', 'failed', 'cancelled'],
  drafted: ['drafting', 'needs_review', 'cancelled', 'expired'],
  // « Demander une autre version » = retour à `drafted`.
  needs_review: ['approved', 'drafted', 'cancelled', 'expired'],
  // « Validé n'est jamais exécuté » : aucune flèche approved → sent.
  // Une modification substantielle renvoie en `needs_review` (#2382.6).
  approved: ['scheduled', 'sending', 'copied_manual', 'needs_review', 'cancelled', 'expired'],
  scheduled: ['sending', 'needs_review', 'cancelled', 'expired'],
  sending: ['sent', 'failed'],
  // « Exécuté n'est jamais livré » : `delivered` exige une preuve (reçu).
  sent: ['delivered', 'bounced', 'replied'],
  delivered: ['replied'],
  bounced: [],
  replied: [],
  // Un retry repasse par `sending` — jamais directement `sent`.
  failed: ['sending', 'needs_review', 'cancelled'],
  cancelled: [],
  expired: [],
  copied_manual: ['replied'],
}

const CALL_TASK_TRANSITIONS: Record<OutreachCallTaskStatus, readonly OutreachCallTaskStatus[]> = {
  proposed: ['ready', 'cancelled'],
  ready: ['scheduled', 'due', 'started', 'cancelled'],
  scheduled: ['due', 'started', 'cancelled'],
  due: ['started', 'cancelled'],
  started: ['completed', 'no_answer', 'wrong_person', 'callback', 'qualified', 'refused'],
  // Sans réponse : on replanifie, on rappelle ou on abandonne.
  no_answer: ['due', 'scheduled', 'started', 'cancelled'],
  callback: ['scheduled', 'due', 'started', 'cancelled'],
  completed: [],
  wrong_person: [],
  qualified: [],
  refused: [],
  cancelled: [],
}

/** #2366.5 — les états qu'un appel peut atteindre depuis `from` : ce que
 *  l'écran « Appels à passer » offre en gestes, lu à la MÊME table que le
 *  serveur, jamais une seconde liste. */
export function callTaskNextStatuses(from: OutreachCallTaskStatus): readonly OutreachCallTaskStatus[] {
  return CALL_TASK_TRANSITIONS[from] ?? []
}

/** Qui produit la transition. `model` = Laura seule, sans geste humain. */
export const OUTREACH_ACTOR_KINDS = ['user', 'system', 'model'] as const
export const outreachActorKindSchema = z.enum(OUTREACH_ACTOR_KINDS)
export type OutreachActorKind = z.infer<typeof outreachActorKindSchema>

export type OutreachMachine = 'message' | 'call_task'

/**
 * #2366.8 — « Aucune transition sensible n'est produite uniquement par le
 * modèle. » Laura prépare : elle peut faire naître une idée, rédiger, soumettre
 * à relecture. Tout le reste attend un humain (ou un reçu système).
 */
const MODEL_ALLOWED_TARGETS: ReadonlySet<string> = new Set(['idea', 'drafting', 'drafted', 'needs_review', 'proposed'])

/**
 * États qu'on n'atteint que sur PREUVE externe ou interne (DELIVERY_RECEIPT).
 * `copied_manual` n'y est PAS : copier est un geste déclaratif, et « Fait » ne
 * porte jamais de preuve d'envoi (doctrine, Louis 21/09/2026).
 */
const PROOF_REQUIRED_TARGETS: ReadonlySet<string> = new Set(['sent', 'delivered', 'bounced', 'replied'])

export type OutreachTransitionCheck =
  | { ok: true }
  | { ok: false; reason: 'unknown_state' | 'not_allowed' | 'model_forbidden' | 'proof_required' }

export function checkOutreachTransition(
  machine: OutreachMachine,
  from: string,
  to: string,
  actor: OutreachActorKind,
  proof?: Record<string, unknown> | null,
): OutreachTransitionCheck {
  const table: Record<string, readonly string[]> = machine === 'message' ? MESSAGE_TRANSITIONS : CALL_TASK_TRANSITIONS
  const allowed = table[from]
  if (!allowed || !(to in table)) return { ok: false, reason: 'unknown_state' }
  if (!allowed.includes(to)) return { ok: false, reason: 'not_allowed' }
  if (actor === 'model' && !MODEL_ALLOWED_TARGETS.has(to)) return { ok: false, reason: 'model_forbidden' }
  if (machine === 'message' && PROOF_REQUIRED_TARGETS.has(to) && (!proof || Object.keys(proof).length === 0)) {
    return { ok: false, reason: 'proof_required' }
  }
  return { ok: true }
}

/** Les états d'un message qu'on ne réécrit plus : il est parti (#2366.10). */
export const OUTREACH_MESSAGE_FROZEN_STATES: ReadonlySet<OutreachMessageStatus> = new Set([
  'sending',
  'sent',
  'delivered',
  'bounced',
  'replied',
  'copied_manual',
  'cancelled',
  'expired',
])

// #2381 — `sequence` étend le journal aux ARRÊTS/PAUSES d'`outreach_sequences`
// (`outreach-sequence-events.ts`) : même table, même contrat, pas de second
// journal (GA-26). Ajouté en FIN de liste (GA-08 : un enum ne réordonne jamais
// ses valeurs existantes) ; la contrainte SQL est élargie AVANT ce code
// (GA-11/GA-12, migration `OutreachSequenceTransitions`).
export const OUTREACH_TRANSITION_SUBJECTS = ['message', 'call_task', 'sequence'] as const
export const OUTREACH_TRANSITION_RESULTS = ['applied', 'refused'] as const

/** #2366.8 — une ligne du journal de transitions, les dix champs de la spec. */
export const outreachTransitionSchema = z.object({
  id: z.string().guid(),
  subject_kind: z.enum(OUTREACH_TRANSITION_SUBJECTS),
  subject_id: z.string().guid(),
  from_state: z.string().nullable(),
  to_state: z.string(),
  occurred_at: z.string().datetime(),
  actor: z.string().guid().nullable(),
  actor_kind: outreachActorKindSchema,
  cause: z.string(),
  proof: z.record(z.string(), z.unknown()).nullable(),
  tool: z.string().nullable(),
  permission: z.string().nullable(),
  result: z.enum(OUTREACH_TRANSITION_RESULTS),
  error: z.string().nullable(),
})
export type OutreachTransition = z.infer<typeof outreachTransitionSchema>

/* ------------------------------- révisions -------------------------------- */

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * #2382.6 — « Une modification mineure définie par policy peut rester
 * approuvée. » La policy retenue est la plus étroite possible : seuls les
 * espaces et sauts de ligne changent. Un seul mot différent est substantiel et
 * invalide l'approbation.
 */
export const OUTREACH_EDIT_POLICY = 'whitespace_only_is_minor'

export function isMinorOutreachEdit(
  previous: { subject: string | null; body: string },
  next: { subject: string | null; body: string },
): boolean {
  return (
    normalize(previous.subject ?? '') === normalize(next.subject ?? '') &&
    normalize(previous.body) === normalize(next.body)
  )
}

/** #2382.3 — diff ligne à ligne (LCS), pour surligner ce qui entre et sort. */
export type OutreachDiffLine = { op: 'same' | 'added' | 'removed'; text: string }

export function outreachTextDiff(before: string, after: string): OutreachDiffLine[] {
  const a = before
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
  const b = after
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const out: OutreachDiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i]! })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: 'removed', text: a[i]! })
      i++
    } else {
      out.push({ op: 'added', text: b[j]! })
      j++
    }
  }
  while (i < a.length) out.push({ op: 'removed', text: a[i++]! })
  while (j < b.length) out.push({ op: 'added', text: b[j++]! })
  return out
}

/* -------------------------- centre d'approbation -------------------------- */

/**
 * #2382 — les RÈGLES BLOQUANTES que le serveur sait MESURER. Les autres de la
 * spec (destinataire ambigu, pièce manquante, consentement Talent, contexte
 * privé) n'ont aujourd'hui aucune lecture fiable : on ne les devine pas,
 * elles ne figurent pas ici.
 *
 * #3419/#3420 (30/09/2026, lot C16) — cinq bloquants AJOUTÉS en fin de liste
 * (GA-08), tous mesurés sur le TEXTE du message par {@link outreachContentBlockers}.
 * « Donnée fausse » et « promesse non prouvée » : un sous-ensemble ÉTROIT et
 * catalogué (les tournures citées mot pour mot par les deux retours bêta) est
 * mesurable, donc bloquant. Tranché sans Louis : catalogues étroits (proches
 * du libellé exact des retours), jamais un mot-clé seul — un mot-clé seul
 * aurait fait déborder des messages légitimes existants (ex. « Votre DSI
 * recrute » sans le mot « projet »).
 *
 * #3420 (lot Q06, 30/09) — les huit critères qui restaient (bon interlocuteur,
 * scénario relationnel, périmètre, prochaine étape, historique, cohérence de
 * séquence, longueur par canal, rendez-vous imposé) ne se lisent pas dans le
 * texte seul mais dans le CONTEXTE que le serveur détient : voir
 * {@link outreachContextBlockers}, qui les mesure sur des faits structurés et
 * NE JUGE PAS quand le fait manque.
 */
export const outreachBlockerSchema = z.enum([
  'opted_out',
  'missing_channel_address',
  'empty_message',
  // #3419.2/#3419.4 — une affirmation de RELATION non prouvée (client déjà en
  // place, référencement achats, recommandation nominative, concurrent encore
  // en poste) : la mémoire marché ne doit jamais la produire seule (doctrine).
  'unverified_relationship_claim',
  // #3419.2/#3419.3 — une affirmation FACTUELLE non prouvée (recrutement d'un
  // projet nommé, disponibilité d'un consultant) : tant qu'aucune preuve n'est
  // posée, la porte propose une autre accroche ou laisse « à compléter »,
  // jamais l'envoi tel quel.
  'unverifiable_claim',
  // #3420.2 — le test de généricité mot pour mot : si substituer le nom de
  // l'entreprise laisserait le message valable, il est trop générique. Mesuré
  // : ni le compte ni le contact ne sont nommés dans le corps.
  'generic_message',
  // #3420 — « une seule question facile », « un seul objectif » : mesuré par
  // le nombre de points d'interrogation (leur difficulté ne se mesure pas).
  'multiple_asks',
  // #3420 — « absence de jargon », « présentation corporate générique »,
  // « fausse proximité » : un seul catalogue, les trois se lisent pareil (un
  // tour de phrase fait, jamais une nuance de ton).
  'corporate_jargon',
  // #3420 (lot Q06, 30/09) — les huit critères qui restaient, mesurés sur le
  // CONTEXTE que le serveur connaît (destinataire, historique, séquence,
  // canal), ajoutés EN FIN (GA-08) : voir {@link outreachContextBlockers}.
  'wrong_recipient',
  'relationship_scenario_mismatch',
  'scope_unclear',
  'no_next_step',
  'contradicts_history',
  'sequence_inconsistent',
  'too_long_for_channel',
  'forced_meeting',
  // #3419.2 — « vous utilisez telle technologie » sans que l'enrichissement du
  // compte ne confirme cette technologie (lot Z08, 02/10).
  'unverified_tech_claim',
])
export type OutreachBlocker = z.infer<typeof outreachBlockerSchema>

/**
 * #2382.2 — les RISQUES, nommés et factuels, jamais une note (doctrine : aucun
 * nombre deviné). Chacun se lit sur une colonne réelle.
 */
export const outreachRiskSchema = z.enum([
  /** L'employeur détecté ne correspond plus au compte (badge RISQUE). */
  'stale_contact',
  /** Le texte a été modifié à la main après génération. */
  'edited_by_user',
])
export type OutreachRisk = z.infer<typeof outreachRiskSchema>

// #2382.1 — les sept vues, dans l'ordre de la spec.
export const OUTREACH_APPROVAL_VIEWS = [
  'to_review',
  'modified',
  'blocked',
  'ready',
  'scheduled',
  'executed',
  'failed',
] as const
export const outreachApprovalViewSchema = z.enum(OUTREACH_APPROVAL_VIEWS)
export type OutreachApprovalView = z.infer<typeof outreachApprovalViewSchema>

/**
 * Range un message dans UNE vue. Un bloquant l'emporte sur tout état encore
 * validable ; ce qui est parti ne redevient jamais « bloqué ». `null` = hors du
 * centre (idée, rédaction, annulé) : on n'affiche pas ce qui n'est pas à juger.
 */
export function outreachApprovalView(input: {
  status: OutreachMessageStatus
  blockers: readonly OutreachBlocker[]
  edited_by_user: boolean
}): OutreachApprovalView | null {
  const reviewable = input.status === 'drafted' || input.status === 'needs_review'
  if ((reviewable || input.status === 'approved' || input.status === 'scheduled') && input.blockers.length > 0) {
    return 'blocked'
  }
  if (reviewable) return input.edited_by_user ? 'modified' : 'to_review'
  switch (input.status) {
    case 'approved':
      return 'ready'
    case 'scheduled':
      return 'scheduled'
    case 'sending':
    case 'sent':
    case 'delivered':
    case 'replied':
    case 'copied_manual':
      return 'executed'
    case 'failed':
    case 'bounced':
    case 'expired':
      return 'failed'
    default:
      return null
  }
}

/* ------------------- #3419/#3420 — qualité du message (30/09) ------------------- */

// #3419.2 — les cinq tournures citées par le retour, une RELATION affirmée
// sans preuve (« nous travaillons déjà avec vous », « nous sommes référencés »,
// une recommandation nominative, un concurrent toujours en place, une
// référence comparable donnée comme un fait).
const UNVERIFIED_RELATIONSHIP_CLAIM_PATTERNS: readonly RegExp[] = [
  /travaill(?:ons|e)\s+d[ée]j[àa]\s+avec/i,
  /sommes\s+r[ée]f[ée]renc[ée]s/i,
  /m['’]a\s+recommand[ée]\s+de\s+(?:vous\s+)?contacter/i,
  /intervient?\s+encore\s+chez\s+vous/i,
  /(?:une\s+)?r[ée]f[ée]rence\s+comparable/i,
]

// #3419.2 — les deux tournures FACTUELLES citées, un recrutement nommé
// (« projet » exigé — un simple « X recrute » ne suffit pas, GA-08 : catalogue
// étroit) et une disponibilité de consultant affirmée sans preuve.
const UNVERIFIABLE_CLAIM_PATTERNS: readonly RegExp[] = [
  /votre\s+projet\s+\S+\s+recrute/i,
  /notre\s+consultant\s+est\s+disponible/i,
]

// #3420 — jargon, présentation corporate générique, fausse proximité : un
// catalogue, pas une échelle de ton.
const CORPORATE_JARGON_PATTERNS: readonly RegExp[] = [
  /leader\s+(?:du|sur\s+le)\s+march[ée]/i,
  /expert\s+reconnu/i,
  /solution\s+innovante/i,
  /acteur\s+incontournable/i,
  /j['’]esp[èe]re\s+que\s+vous\s+allez\s+bien/i,
  /comme\s+vous\s+le\s+savez\s+(?:sans\s+doute|probablement)/i,
]

function matchesAny(body: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(p => p.test(body))
}

/**
 * #3420.2 — le test de généricité mot pour mot du retour : « si je remplace
 * le nom de l'entreprise par une autre et que le message reste valable, il
 * est trop générique. » Mesuré à l'identique : ni le compte ni le contact ne
 * sont nommés dans le corps — un message qui ne nomme personne conviendrait
 * à n'importe quel destinataire.
 */
function isGenericMessage(body: string, accountName: string | null, contactName: string | null): boolean {
  const tokens = [accountName, ...(contactName ? contactName.split(/\s+/) : [])].filter(
    (n): n is string => !!n && n.trim().length > 1,
  )
  if (tokens.length === 0) return false
  const normalized = body.toLocaleLowerCase('fr')
  return !tokens.some(token => normalized.includes(token.toLocaleLowerCase('fr')))
}

/**
 * #3419/#3420 — les cinq bloquants mesurables sur le seul TEXTE d'un message,
 * sans base de données (`blockersOf`, côté API, les combine à `opted_out` /
 * `missing_channel_address` / `empty_message`, qui dépendent du contact).
 * Pure, donc testée ici sans repository.
 */
export function outreachContentBlockers(input: {
  body: string
  accountName: string | null
  contactName: string | null
}): OutreachBlocker[] {
  const out: OutreachBlocker[] = []
  if (matchesAny(input.body, UNVERIFIED_RELATIONSHIP_CLAIM_PATTERNS)) out.push('unverified_relationship_claim')
  if (matchesAny(input.body, UNVERIFIABLE_CLAIM_PATTERNS)) out.push('unverifiable_claim')
  if (isGenericMessage(input.body, input.accountName, input.contactName)) out.push('generic_message')
  if ((input.body.match(/\?/g) ?? []).length > 1) out.push('multiple_asks')
  if (matchesAny(input.body, CORPORATE_JARGON_PATTERNS)) out.push('corporate_jargon')
  return out
}

/* ---------- #3420 (lot Q06) — les critères mesurés sur le CONTEXTE ---------- */

/**
 * #3420.11 — « longueur adaptée au canal » : LE tableau, à un seul endroit
 * (GA-26). Tranché sans Louis : en mots, parce que le corps d'un message
 * s'écrit en mots et qu'un plafond en caractères dépend de la langue ; des
 * plafonds d'usage commercial (un e-mail de prospection se lit en moins d'une
 * minute, un message LinkedIn tient sur un écran de téléphone). `null` = pas
 * de plafond (canal manuel, recommandation : le format n'est pas un message).
 */
export const OUTREACH_CHANNEL_MAX_WORDS: Readonly<Record<OutreachMessageChannel, number | null>> = {
  email: 150,
  linkedin: 90,
  phone: 120,
  voicemail: 60,
  manual: null,
  recommendation: null,
  // #2370.sms — un SMS se lit d'un coup d'œil (le plafond DUR est en caractères, ci-dessous).
  sms: 30,
  // #2370.whatsapp — une bulle de messagerie, plus courte qu'un message LinkedIn.
  whatsapp: 70,
  // #2370.task — une tâche ne s'envoie pas : pas un message, pas de plafond.
  task: null,
  // #2370.introduction_request — on écrit à l'INTERMÉDIAIRE, avec un paragraphe transférable.
  introduction_request: 150,
  // #2370.partner_message — à un partenaire : le contexte commun d'abord, une demande.
  partner_message: 130,
  // #2370.follow_up_email — un suivi tient en moins qu'un premier e-mail.
  follow_up_email: 120,
  // #2370.profile_push — un profil de consultant poussé : trois atouts, une disponibilité, une question.
  profile_push: 150,
  // #2370.linkedin_connection_note — la limite LinkedIn est en caractères (ci-dessous).
  linkedin_connection_note: 50,
}

/**
 * #2370 — les canaux dont la plateforme impose un plafond DUR en caractères :
 * la note de connexion LinkedIn (300 caractères, au-delà LinkedIn la coupe) et
 * le SMS (un segment, 160 caractères — au-delà le message part en plusieurs
 * morceaux, et il cesse d'être court). Absent = aucun plafond en caractères,
 * seul celui en mots s'applique.
 */
export const OUTREACH_CHANNEL_MAX_CHARS: Readonly<Partial<Record<OutreachMessageChannel, number>>> = {
  sms: 160,
  linkedin_connection_note: 300,
}

/**
 * Ce que le serveur sait d'un message au moment de le juger. Tout champ qui
 * manque rend son critère NON ÉVALUABLE — il ne bloque rien (jamais un
 * verdict deviné) : `contactName: null` désactive le destinataire,
 * `accountAnchors: []` désactive le périmètre, `sequencePosition: null` la
 * cohérence de séquence.
 */
export type OutreachContextInput = {
  body: string
  channel: OutreachMessageChannel
  intent: OutreachIntent
  contactName: string | null
  /** `contacts.user_status` : new, contacted, replied, meeting, refused, silence. */
  contactStatus: string | null
  /** Messages déjà PARTIS vers ce contact (hors celui-ci). */
  priorContactedCount: number
  /** Ce qu'on sait du compte (signaux, secteur, raison de la prise de contact). */
  accountAnchors: readonly string[]
  /** Les autres messages de la même séquence. */
  siblingBodies: readonly string[]
  /** Rang (0 = première étape) dans la séquence ; `null` hors séquence. */
  sequencePosition: number | null
  /**
   * #3419.2 — technologies CONFIRMÉES du compte (enrichissement : stack détectée,
   * stack déclarée). `[]` = rien de confirmé : toute technologie affirmée comme
   * fait est alors sans preuve et bloque.
   */
  verifiedTechStack: readonly string[]
}

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')

const tokensOf = (text: string): string[] =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

const GREETING_RE =
  /^\s*(?:bonjour|bonsoir|salut|hello|hi|dear|cher|ch[èe]re)\s+(?:monsieur|madame|mme|mr|m\.)?\s*([\p{L}][\p{L}'’-]*)/iu
const GREETING_NON_NAMES = new Set(['a', 'tous', 'toutes', 'all', 'team', 'equipe', 'vous', 'monsieur', 'madame'])

// #3420.1 — un salut qui nomme un prénom ou un nom ne correspondant pas à la
// personne visée : le message est parti pour une autre.
function greetsSomeoneElse(body: string, contactName: string | null): boolean {
  if (!contactName) return false
  const greeted = GREETING_RE.exec(body.split('\n').find(line => line.trim()) ?? '')?.[1]
  if (!greeted) return false
  const name = fold(greeted)
  if (GREETING_NON_NAMES.has(name)) return false
  return !tokensOf(contactName).includes(name)
}

const COLD_OPENING_INTENTS: readonly OutreachIntent[] = ['open_relationship', 'qualify_context']
const REOPENING_INTENTS: readonly OutreachIntent[] = ['follow_up', 'reactivate']

// #3420.8 — une prochaine étape se lit : une question, ou un verbe d'appel à
// réponse / d'envoi proposé.
const NEXT_STEP_RE =
  /\?|je\s+vous\s+(?:propose|envoie|adresse|partage|rappelle|recontacte)|n['’]h[ée]sitez|dites-moi|faites-moi|r[ée]pondez|retour\s+de\s+votre\s+part|je\s+reviens\s+vers\s+vous|let\s+me\s+know|happy\s+to|feel\s+free/i

// #3420.9 — un échange antérieur invoqué.
const PRIOR_EXCHANGE_RE =
  /suite\s+[àa]\s+(?:notre|nos|mon|mes|votre|vos)\s+(?:[ée]change|appel|rendez-vous|rencontre|conversation|message|mail|e-?mail|pr[ée]c[ée]dent)|comme\s+convenu|comme\s+nous\s+(?:en\s+)?avons\s+(?:parl[ée]|discut[ée])|as\s+(?:we\s+)?discussed|following\s+our\s+(?:call|conversation|meeting)/i

// #3420.10 — se présenter À NOUVEAU à la seconde étape.
const RE_INTRODUCTION_RE =
  /je\s+me\s+pr[ée]sente|permettez-moi\s+de\s+me\s+pr[ée]senter|je\s+me\s+permets\s+de\s+vous\s+contacter|pour\s+la\s+premi[èe]re\s+fois/i

// #3420.13 — une proposition de rendez-vous, et la phrase qui la porte.
const MEETING_RE =
  /rendez-vous|\brdv\b|cr[ée]neau|\b\d{1,2}\s?(?:min|minutes)\b|appel\s+de|visio|d[ée]mo|d[ée]jeuner|caf[ée]/i

// #3419.2 — « vous utilisez SAP », « vous êtes sur Salesforce », « vous avez
// migré vers AWS » : une affirmation PRÉSENTE sur la technologie du compte. Le
// complément doit être un nom propre (majuscule) ou un sigle — « vous utilisez
// déjà des prestataires » n'est pas une affirmation technique. Sensible à la
// casse sur le complément, volontairement.
const TECH_CLAIM_RE =
  /\b[Vv]ous\s+(?:utilisez|exploitez|[êe]tes\s+(?:sur|sous)|tournez\s+(?:sur|sous)|avez\s+(?:choisi|migr[ée]\s+vers|adopt[ée]))\s+(?:(?:d[eu]s?|l[ae]s?|l['’]|le|les)\s+)?([A-Z][\p{L}\d.+#-]*)/gu

function claimsUnverifiedTech(body: string, verified: readonly string[]): boolean {
  const known = new Set(verified.map(fold))
  for (const match of body.matchAll(TECH_CLAIM_RE)) {
    const claimed = fold(match[1] ?? '').replace(/[.,;:]+$/, '')
    if (claimed && !known.has(claimed)) return true
  }
  return false
}

const SCOPE_STOPWORDS = new Set(['entreprise', 'societe', 'groupe', 'france', 'projet', 'projets', 'services'])

/** Même mot à la flexion près : égaux, ou 6 premières lettres communes (5 si le mot est court). */
function sameRoot(a: string, b: string): boolean {
  if (a === b) return true
  const root = Math.min(6, a.length, b.length)
  return root >= 5 && a.slice(0, root) === b.slice(0, root)
}

function similarity(a: string, b: string): number {
  const left = new Set(tokensOf(a))
  const right = new Set(tokensOf(b))
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return shared / (left.size + right.size - shared)
}

/**
 * #3420 (lot Q06, 30/09) — les critères de qualité qui dépendent du CONTEXTE,
 * non du seul texte : bon interlocuteur (#1), scénario relationnel (#2),
 * périmètre précis (#3), prochaine étape adaptée (#8), cohérence avec
 * l'historique (#9) et entre les messages d'une séquence (#10), longueur
 * adaptée au canal (#11), pas de rendez-vous forcé au premier message (#13).
 *
 * Pure et déterministe. Chaque critère se mesure sur un fait STRUCTURÉ que le
 * serveur détient (statut du contact, messages déjà partis, étapes de la
 * séquence, canal) — jamais sur un jugement du ton. Un fait absent désactive
 * son critère plutôt que de le deviner (doctrine : pas de donnée inventée).
 * #13 avait été retiré au lot C16 : un motif texte seul confondait la question
 * polie et l'imposition ; la distinction se fait ici sur la FORME de la phrase
 * (une question se termine par « ? ») et sur le moment (premier message).
 */
export function outreachContextBlockers(input: OutreachContextInput): OutreachBlocker[] {
  const out: OutreachBlocker[] = []
  const body = input.body
  const status = input.contactStatus ?? 'new'
  const firstContact = input.priorContactedCount === 0 && status === 'new'

  if (greetsSomeoneElse(body, input.contactName)) out.push('wrong_recipient')

  const alreadyInRelation = status === 'replied' || status === 'meeting' || input.priorContactedCount > 0
  if (
    (COLD_OPENING_INTENTS.includes(input.intent) && alreadyInRelation) ||
    (REOPENING_INTENTS.includes(input.intent) && firstContact)
  ) {
    out.push('relationship_scenario_mismatch')
  }

  // #4399.7 — « cite » se lit sur la RACINE du mot : « recrute » cite « recrutement », « service
  // numérique » cite « services numériques ». Un message qui cite le fait ne se bloque pas.
  const anchors = input.accountAnchors.flatMap(tokensOf).filter(t => t.length >= 5 && !SCOPE_STOPWORDS.has(t))
  const bodyTokens = tokensOf(body)
  if (anchors.length > 0 && !anchors.some(anchor => bodyTokens.some(token => sameRoot(anchor, token))))
    out.push('scope_unclear')

  if (
    input.intent !== 'nurture' &&
    ['email', 'linkedin', 'phone'].includes(input.channel) &&
    !NEXT_STEP_RE.test(body)
  ) {
    out.push('no_next_step')
  }

  if (status === 'refused' || (firstContact && PRIOR_EXCHANGE_RE.test(body))) out.push('contradicts_history')

  const repeatsSibling = input.siblingBodies.some(other => similarity(body, other) >= 0.8)
  const reintroduces = (input.sequencePosition ?? 0) > 0 && RE_INTRODUCTION_RE.test(body)
  if (repeatsSibling || reintroduces) out.push('sequence_inconsistent')

  const maxWords = OUTREACH_CHANNEL_MAX_WORDS[input.channel]
  const maxChars = OUTREACH_CHANNEL_MAX_CHARS[input.channel]
  if (
    (maxWords !== null && body.trim().split(/\s+/).filter(Boolean).length > maxWords) ||
    (maxChars !== undefined && body.trim().length > maxChars)
  ) {
    out.push('too_long_for_channel')
  }

  if (firstContact) {
    const imposed = body
      .split(/(?<=[.!?…])\s+|\n+/)
      .some(sentence => MEETING_RE.test(sentence) && !sentence.trim().endsWith('?'))
    if (imposed) out.push('forced_meeting')
  }

  if (claimsUnverifiedTech(body, input.verifiedTechStack)) out.push('unverified_tech_claim')
  return out
}

/* ---------------------------------- DTO ----------------------------------- */

export const OUTREACH_MESSAGE_VERSION_KINDS = ['template', 'personalized', 'user_edit'] as const
export const outreachMessageVersionKindSchema = z.enum(OUTREACH_MESSAGE_VERSION_KINDS)
export type OutreachMessageVersionKind = z.infer<typeof outreachMessageVersionKindSchema>

export const outreachMessageVersionSchema = z.object({
  version: z.number().int().positive(),
  kind: outreachMessageVersionKindSchema,
  subject: z.string().nullable(),
  body: z.string(),
  author: z.string().guid().nullable(),
  created_at: z.string().datetime(),
})
export type OutreachMessageVersion = z.infer<typeof outreachMessageVersionSchema>

/** #2382.8 — la preuve d'approbation, les sept champs de la spec. */
export const outreachApprovalProofSchema = z.object({
  author: z.string().guid(),
  date: z.string().datetime(),
  version: z.number().int().positive(),
  audience: z.object({ kind: z.literal('contact'), contact_ids: z.array(z.string().guid()), size: z.number().int() }),
  policy: z.string(),
  /** `null` = non mesuré — jamais 0 (GA-18). */
  cost: z.number().nullable(),
  conditions: z.array(z.string()),
})
export type OutreachApprovalProof = z.infer<typeof outreachApprovalProofSchema>

export const outreachMessageSchema = z.object({
  id: z.string().guid(),
  contact_id: z.string().guid(),
  contact_name: z.string().nullable(),
  contact_role: z.string().nullable(),
  account_name: z.string().nullable(),
  channel: outreachMessageChannelSchema,
  intent: outreachIntentSchema,
  source: outreachSurfaceSchema,
  reason: z.string().nullable(),
  status: outreachMessageStatusSchema,
  sequence_id: z.string().guid().nullable(),
  sequence_step_id: z.string().guid().nullable(),
  /** #2372.6 — l'asset joint à ce message, s'il en porte un (`outreach-asset.ts`). */
  asset_id: z.string().guid().nullable(),
  owner_id: z.string().guid(),
  current_version: z.number().int().positive(),
  /**
   * #2369.12 (reste, épopée #2768) — le style de message appliqué à LA
   * PRÉPARATION de ce message (snapshot de version, jamais relu depuis le
   * template — un template modifié depuis ne change pas ce qui a déjà été
   * préparé). `null` ensemble : aucun style relié — messages antérieurs à
   * cette capacité, ou préparés hors du comparatif de style (#2369.11).
   * `computeMessageStyleUsageStats` (`message-style.ts`) les agrège PAR
   * STYLE, jamais par personne (GA-240/241).
   */
  message_style_template_id: z.string().guid().nullable(),
  message_style_template_version: z.number().int().positive().nullable(),
  subject: z.string().nullable(),
  body: z.string(),
  versions: z.array(outreachMessageVersionSchema),
  approval: outreachApprovalProofSchema.nullable(),
  view: outreachApprovalViewSchema.nullable(),
  blockers: z.array(outreachBlockerSchema),
  risks: z.array(outreachRiskSchema),
  /** #2382.7 — le lecteur a-t-il le droit de valider CE message ? */
  can_approve: z.boolean(),
  /**
   * #2385.4 — les natures de problème que LE LECTEUR a déclarées sur ce
   * message (relues sur la carte). Les siennes seulement ; absent = aucune.
   */
  my_quality_flags: z.array(z.enum(OUTREACH_QUALITY_FLAG_KINDS)).optional(),
  /** La permission exigée pour valider, nommée sur la carte (#2382.2). */
  required_permission: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type OutreachMessage = z.infer<typeof outreachMessageSchema>

export const createOutreachMessageRequestSchema = z.object({
  contact_id: z.string().guid(),
  channel: outreachMessageChannelSchema.default('email'),
  intent: outreachIntentSchema,
  source: outreachSurfaceSchema,
  reason: z.string().trim().max(500).optional(),
  /** Le gabarit d'origine, gardé pour le diff à trois versions (#2382.3). */
  template: z.object({ subject: z.string().max(300).nullable(), body: z.string().max(20000) }).optional(),
  subject: z.string().trim().max(300).nullable().default(null),
  body: z.string().max(20000),
  /**
   * #2372.6 — l'asset à joindre, s'il y en a un. Le gate (`outreachAssetGate`,
   * `outreach-asset.ts`) le lit à la préparation : un asset `always` s'attache
   * sans condition, un `after_interest_confirmed` refuse la préparation tant
   * que ce contact n'a pas répondu positivement.
   */
  asset_id: z.string().guid().nullish(),
  /**
   * #2369.12 (reste, épopée #2768) — le style comparé et choisi au
   * comparatif (#2369.11), s'il y en a un. Omis = sans style relié, comme
   * avant ce lot (comportement historique inchangé). Le service vérifie
   * l'appartenance à l'espace ET le statut `active` avant d'écrire — un
   * identifiant d'un autre espace ou d'un style non actif est refusé, jamais
   * silencieusement ignoré.
   */
  message_style_template_id: z.string().guid().nullish(),
})
export type CreateOutreachMessageRequest = z.infer<typeof createOutreachMessageRequestSchema>

export const reviseOutreachMessageRequestSchema = z.object({
  subject: z.string().trim().max(300).nullable(),
  body: z.string().max(20000),
  /** La version que l'auteur avait sous les yeux — une édition sur une vue périmée est refusée. */
  base_version: z.number().int().positive(),
})
export type ReviseOutreachMessageRequest = z.infer<typeof reviseOutreachMessageRequestSchema>

/**
 * #2382.9 — « Valider tout » ne valide QUE ce qui a été affiché : chaque
 * élément porte la version vue. Un message modifié depuis est exclu, pas validé.
 */
export const approveOutreachMessagesRequestSchema = z.object({
  items: z
    .array(z.object({ id: z.string().guid(), version: z.number().int().positive() }))
    .min(1)
    .max(200),
})
export type ApproveOutreachMessagesRequest = z.infer<typeof approveOutreachMessagesRequestSchema>

export const approveOutreachMessagesResultSchema = z.object({
  approved: z.array(z.string().guid()),
  excluded: z.array(
    z.object({
      id: z.string().guid(),
      reason: z.enum(['changed_since_display', 'blocked', 'not_reviewable', 'forbidden', 'not_found']),
    }),
  ),
})
export type ApproveOutreachMessagesResult = z.infer<typeof approveOutreachMessagesResultSchema>

export const transitionOutreachRequestSchema = z.object({
  to: z.string().min(1).max(40),
  cause: z.string().trim().min(1).max(500),
  proof: z.record(z.string(), z.unknown()).nullable().default(null),
})
export type TransitionOutreachRequest = z.infer<typeof transitionOutreachRequestSchema>

export const outreachCallTaskSchema = z.object({
  id: z.string().guid(),
  contact_id: z.string().guid(),
  contact_name: z.string().nullable(),
  reason: z.string(),
  objective: z.string(),
  pitch: z.string().nullable(),
  expected_outcome: z.string().nullable(),
  status: outreachCallTaskStatusSchema,
  source: outreachSurfaceSchema,
  scheduled_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  /**
   * #2395 — le porteur de l'appel (`outreach_call_tasks.user_id`, déjà en base).
   * Optionnel en AJOUT : les lectures d'avant ne le portaient pas. L'objet Action
   * canonique en fait son `owner` et ne liste que les appels de l'appelant.
   */
  user_id: z.string().guid().optional(),
})
export type OutreachCallTask = z.infer<typeof outreachCallTaskSchema>

/**
 * #2395.8 — objectif ET résultat attendu, jamais un verbe seul. `objective`
 * était déjà requis ; `expected_outcome` restait `.optional()`, seule porte
 * par laquelle une tâche d'appel pouvait encore naître sans lui — corrigé ici
 * (le seul créateur, `ContactCallTaskDialog.tsx`, porte désormais le champ).
 */
export const createOutreachCallTaskRequestSchema = z.object({
  contact_id: z.string().guid(),
  source: outreachSurfaceSchema,
  reason: z.string().trim().min(1).max(500),
  objective: z.string().trim().min(1).max(500),
  pitch: z.string().trim().max(2000).optional(),
  expected_outcome: z.string().trim().min(1).max(500),
  scheduled_at: z.string().datetime().optional(),
})
export type CreateOutreachCallTaskRequest = z.infer<typeof createOutreachCallTaskRequestSchema>
