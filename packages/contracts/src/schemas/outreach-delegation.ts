import { z } from 'zod'
import { withinQuietHours } from './playbook.js'
import { outreachStepReach } from './outreach-sequence.js'

/**
 * #3702 — LA DÉLÉGATION D'ENVOI : explicite, bornée, révocable, arrêtée par la réponse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RENVERSEMENT, DATÉ — `c89_delegation_denvoi_explicite_bornee`
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉCISION LOUIS 05/10/2026. `c81_etape_sortante_attend_interne_part` (21/09,
 * #2378.9) disait : une étape qui atteint quelqu'un d'extérieur attend une
 * validation explicite, même programmée, même lancée. Elle est RENVERSÉE ici,
 * sur un seul point et sans être effacée : une DÉLÉGATION explicite, bornée
 * (durée, volume, contacts), révocable, avec arrêt sur réponse, autorise
 * l'envoi d'e-mails d'une campagne. Hors délégation, c81 s'applique INCHANGÉE,
 * et « inconnu ⇒ attend » reste la règle de tout ce que le mandat ne nomme pas.
 *
 * ⚠️ Ce que ça NE change PAS : c'est le COMMERCIAL qui délègue, par un geste
 * explicite — Laura prépare, ne délègue jamais à sa place. Une délégation ne
 * porte que sur l'e-mail, seul canal qui a un connecteur d'envoi : LinkedIn et
 * l'appel ne se promettent pas.
 *
 * ⚠️ 11/10/2026 — RENVERSEMENT DATÉ (#4016 L5) : « c82 tient : le copilote
 * n'envoie pas » ne vaut plus quand un mandat `laura_send` SIGNÉ couvre
 * l'envoi. Laura ne signe toujours rien elle-même ; sans mandat, c82 inchangée.
 *
 * Fonctions PURES : l'appelant lit les faits (mandat, étape, contact, capacités
 * connectées, horloge), cette fonction ne fait que DÉCIDER — même patron que
 * `playbookVerdict`. Un garde-fou qui lit l'horloge lui-même ne se teste pas.
 */

/** Les canaux qu'une délégation peut porter : ceux qui ont un connecteur d'envoi. */
export const DELEGABLE_CHANNELS = ['email'] as const
export const delegableChannelSchema = z.enum(DELEGABLE_CHANNELS)
export type DelegableChannel = z.infer<typeof delegableChannelSchema>

/** Bornes dures : une délégation sans fin ni plafond n'est pas une délégation. */
export const DELEGATION_MAX_DAYS = 30
export const DELEGATION_MAX_MESSAGES = 200
export const DELEGATION_MAX_CONTACTS = 200

/* ─────────────────────────────────────────────────────────────────────────────
 * #4016 L5 — DÉCISION LOUIS 11/10/2026 : « tout ok mais faut un go vérifié
 * avant ». L'envoi automatique devient POSSIBLE pour cinq usages, et chacun
 * exige SON mandat, signé explicitement — une PORTÉE par usage. Ce n'est pas un
 * second mécanisme : c'est le mandat c89 (même table, même verdict, même porte
 * du dispatcher), étendu au-delà d'une campagne.
 *
 *  - `campaign`            — le mandat c89 d'origine : UNE campagne, contacts nommés, contenus relus ;
 *  - `workspace_sequences` — délégation par défaut des étapes e-mail des séquences de l'espace ;
 *  - `laura_send`          — Laura envoie ce qu'elle a préparé (renverse c82, SOUS mandat seulement) ;
 *  - `payment_reminder`    — la relance d'impayé part (renverse c31, sous mandat seulement) ;
 *  - `meeting_follow_up`   — l'e-mail de suivi de la cascade de fin de rendez-vous ;
 *  - `linkedin_send`       — l'envoi d'un message LinkedIn par un FOURNISSEUR établi (#4737, 29/10/2026) :
 *    une période, une borne PAR JOUR et PAR UTILISATEUR (`daily_limit`, 25), révocable, arrêtée sur
 *    réponse. Le mandat LinkedIn du lot K (`linkedin_mandates`) y est FUSIONNÉ : deux mécanismes de
 *    délégation divergeraient (GA-26). Il se signe par SA route (`linkedin/mandate`), pas par
 *    `CreateScopedDelegationRequest` : ce n'est pas une portée d'espace e-mail.
 *
 * ⚠️ L'ordre est GELÉ (GA-08) : une portée s'ajoute en fin, jamais au milieu.
 * ───────────────────────────────────────────────────────────────────────────── */
export const DELEGATION_SCOPES = [
  'campaign',
  'workspace_sequences',
  'laura_send',
  'payment_reminder',
  'meeting_follow_up',
  'linkedin_send',
] as const
export const delegationScopeSchema = z.enum(DELEGATION_SCOPES)
export type DelegationScope = z.infer<typeof delegationScopeSchema>

/** Les portées signées une fois pour TOUT l'espace (pas une campagne nommée). */
export const WORKSPACE_DELEGATION_SCOPES = DELEGATION_SCOPES.filter(
  (scope): scope is Exclude<DelegationScope, 'campaign' | 'linkedin_send'> =>
    scope !== 'campaign' && scope !== 'linkedin_send',
)
export type WorkspaceDelegationScope = (typeof WORKSPACE_DELEGATION_SCOPES)[number]

/**
 * #4016 L5 (point 3) — LES BORNES D'ENVOI SONT UN RÉGLAGE PAR PLAN, ici et
 * nulle part ailleurs (GA-26). `bulk_send_max` est l'ancien `BULK_SEND_MAX`
 * (50, recopié côté API ET côté web jusqu'ici) ; durée, volume et contacts sont
 * les bornes c89 du mandat. Chaque ligne reste SOUS les plafonds durs
 * ci-dessus — un plan relève une borne, il ne supprime jamais la borne.
 *
 * Valeurs : celles d'avant pour TOUS les plans — « à fixer par Louis », comme
 * `chatDailyMessageLimit` ; aucune n'est inventée. Un plan illisible ou inconnu
 * retombe sur le PLANCHER (le minimum de la table), jamais sur le plafond.
 */
export type SendBounds = {
  bulk_send_max: number
  mandate_max_days: number
  mandate_max_messages: number
  mandate_max_contacts: number
}

const PREVIOUS_SEND_BOUNDS: SendBounds = {
  bulk_send_max: 50,
  mandate_max_days: DELEGATION_MAX_DAYS,
  mandate_max_messages: DELEGATION_MAX_MESSAGES,
  mandate_max_contacts: DELEGATION_MAX_CONTACTS,
}

export const SEND_BOUNDS_BY_PLAN = {
  trial: PREVIOUS_SEND_BOUNDS,
  starter: PREVIOUS_SEND_BOUNDS,
  team: PREVIOUS_SEND_BOUNDS,
  growth: PREVIOUS_SEND_BOUNDS,
  beta: PREVIOUS_SEND_BOUNDS,
  decouverte: PREVIOUS_SEND_BOUNDS,
} as const satisfies Record<string, SendBounds>

/** Le plancher : le minimum de chaque borne sur tous les plans. */
export const SEND_BOUNDS_FLOOR: SendBounds = (() => {
  const rows = Object.values(SEND_BOUNDS_BY_PLAN) as SendBounds[]
  return {
    bulk_send_max: Math.min(...rows.map(r => r.bulk_send_max)),
    mandate_max_days: Math.min(...rows.map(r => r.mandate_max_days)),
    mandate_max_messages: Math.min(...rows.map(r => r.mandate_max_messages)),
    mandate_max_contacts: Math.min(...rows.map(r => r.mandate_max_contacts)),
  }
})()

export function sendBoundsOfPlan(plan: string | null | undefined): SendBounds {
  if (plan && Object.prototype.hasOwnProperty.call(SEND_BOUNDS_BY_PLAN, plan)) {
    return SEND_BOUNDS_BY_PLAN[plan as keyof typeof SEND_BOUNDS_BY_PLAN]
  }
  return SEND_BOUNDS_FLOOR
}

const hourSchema = z.number().int().min(0).max(24)

/** Fenêtre d'envoi quotidienne, en heures locales : `[start_hour, end_hour[`. */
export const delegationWindowSchema = z
  .object({ start_hour: hourSchema, end_hour: hourSchema })
  .refine(window => window.start_hour < window.end_hour, { message: 'window_empty' })

/** Ce que le commercial écrit pour déléguer — avant relecture et validation. */
export const outreachDelegationDraftSchema = z.object({
  campaign_label: z.string().trim().min(1).max(120),
  contact_ids: z.array(z.string().guid()).min(1).max(DELEGATION_MAX_CONTACTS),
  channels: z.array(delegableChannelSchema).min(1),
  sender_mailbox_id: z.string().min(1),
  window: delegationWindowSchema,
  duration_days: z.number().int().min(1).max(DELEGATION_MAX_DAYS),
  max_messages: z.number().int().min(1).max(DELEGATION_MAX_MESSAGES),
})
export type OutreachDelegationDraft = z.infer<typeof outreachDelegationDraftSchema>

/** La délégation VALIDÉE : le brouillon, daté, empreinte du contenu relu, validateurs. */
export const outreachDelegationSchema = z.object({
  id: z.string().guid(),
  workspace_id: z.string().guid(),
  /** #4016 L5 — l'usage que ce mandat couvre. Une campagne c89 par défaut. */
  scope: delegationScopeSchema.default('campaign'),
  campaign_label: z.string().min(1),
  /** Campagne : contacts NOMMÉS (≥ 1). Portée d'espace : vide = tout l'espace, faits du contact relus à chaque envoi. */
  contact_ids: z.array(z.string().guid()),
  channels: z.array(delegableChannelSchema).min(1),
  sender_mailbox_id: z.string().min(1),
  /**
   * Empreinte des contenus relus : une modification substantielle la change ⇒ nouvelle validation.
   * `null` pour une portée d'espace : le contenu y est figé MESSAGE PAR MESSAGE (la version approuvée
   * sous mandat), et une révision remet le message en relecture (`revise` efface la preuve).
   */
  content_hash: z.string().min(1).nullable(),
  window: delegationWindowSchema,
  starts_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  max_messages: z.number().int().min(1),
  sent_count: z.number().int().min(0),
  /** Au moins une personne a validé — jamais une délégation sans nom au bas. */
  validated_by: z.array(z.string().min(1)).min(1),
  validated_at: z.string().datetime(),
  revoked_at: z.string().datetime().nullable(),
  paused_at: z.string().datetime().nullable(),
})
export type OutreachDelegation = z.infer<typeof outreachDelegationSchema>

/** Pourquoi une étape sortante ATTEND malgré (ou sans) délégation. Toujours nommé. */
export const DELEGATION_HOLD_REASONS = [
  'no_delegation',
  'channel_not_delegable',
  'revoked',
  'paused',
  'not_started',
  'expired',
  'contact_out_of_scope',
  'content_changed',
  'sender_mismatch',
  'mailbox_unavailable',
  'replies_unreadable',
  'outside_window',
  'quota_reached',
  // #4016 L5 — en FIN (GA-08). Le mandat signé couvre un AUTRE usage que celui qui veut envoyer.
  'scope_mismatch',
  // #4016 L5 — pas de mandat rétroactif : le fait qui a fait naître l'envoi précède la signature (ou est inconnu).
  'predates_mandate',
  // #4016 L5 (reprise 20/10) — en FIN (GA-08). Le fait déclencheur est daté dans le FUTUR (une étape de
  // séquence à J+3 posée à la création) : le mandat ne fait jamais partir un message avant son échéance.
  'not_due',
] as const
export type DelegationHoldReason = (typeof DELEGATION_HOLD_REASONS)[number]

/**
 * Pourquoi la suite d'une campagne S'ARRÊTE : un fait du contact, définitif.
 * #4016 L5 — en FIN (GA-08) : la personne EFFACÉE (c69, RGPD art. 17) et le
 * consentement EXPIRÉ (c45), relus à CHAQUE envoi, jamais à la signature.
 */
export const DELEGATION_STOP_REASONS = ['replied', 'opposed', 'excluded', 'erased', 'consent_expired'] as const
export type DelegationStopReason = (typeof DELEGATION_STOP_REASONS)[number]

export type DelegationVerdict =
  | { decision: 'run'; basis: 'internal' | 'delegation' }
  | { decision: 'awaits_validation'; reason: DelegationHoldReason }
  | { decision: 'stop'; reason: DelegationStopReason }

export type DelegationFacts = {
  now: Date
  delegation: OutreachDelegation | null
  step: {
    kind: string
    channel: string
    contact_id: string
    content_hash: string
    sender_mailbox_id: string | null
    /** #4016 L5 — l'usage qui veut envoyer. Absent = une étape de campagne c89. */
    scope?: DelegationScope
    /** #4016 L5 — quand est né le fait qui déclenche l'envoi (fin du rendez-vous, échéance, préparation). */
    originated_at?: string | null
  }
  contact: {
    replied: boolean
    opposed: boolean
    excluded: boolean
    /** #4016 L5 — c69 : la personne a été effacée à sa demande (ou sa fiche n'existe plus). */
    erased?: boolean
    /** #4016 L5 — c45 : un consentement EXPIRÉ refuse. */
    consent_expired?: boolean
  }
  capabilities: { mailbox_connected: boolean; reply_reading_available: boolean }
}

function isDelegable(channel: string): channel is DelegableChannel {
  return (DELEGABLE_CHANNELS as readonly string[]).includes(channel)
}

/**
 * Qu'a le droit de faire une étape ÉCHUE ? L'ordre est celui qui protège :
 *
 *  1. interne ⇒ part (la frontière c81 n'est pas touchée) ;
 *  2. sans mandat, ou canal non délégable ⇒ attend (c81 inchangée ; inconnu ⇒ attend) ;
 *  3. un fait du CONTACT (réponse, opposition, exclusion) ⇒ ARRÊTE, avant tout
 *     reste : il ferme la suite pour toujours, alors qu'une pause la reporte ;
 *  4. l'état du MANDAT (révoqué, en pause, pas commencé, expiré) ;
 *  5. la portée (contact, contenu relu, expéditeur) ;
 *  6. les capacités branchées — lecture des réponses indisponible ⇒ SUSPEND ;
 *  7. la fenêtre et le volume, évalués au moment utile.
 */
export function delegationVerdict(facts: DelegationFacts): DelegationVerdict {
  const { now, delegation, step, contact, capabilities } = facts
  if (outreachStepReach(step.kind) === 'internal') return { decision: 'run', basis: 'internal' }

  if (!delegation) return { decision: 'awaits_validation', reason: 'no_delegation' }
  if (!isDelegable(step.channel) || !delegation.channels.includes(step.channel)) {
    return { decision: 'awaits_validation', reason: 'channel_not_delegable' }
  }

  // #4016 L5 — un mandat ne couvre QUE l'usage pour lequel il a été signé.
  const scope = delegation.scope ?? 'campaign'
  if ((step.scope ?? 'campaign') !== scope) return { decision: 'awaits_validation', reason: 'scope_mismatch' }

  // Faits du contact : relus à CHAQUE envoi (#4016 L5), jamais figés à la signature.
  if (contact.erased) return { decision: 'stop', reason: 'erased' }
  if (contact.replied) return { decision: 'stop', reason: 'replied' }
  if (contact.opposed) return { decision: 'stop', reason: 'opposed' }
  if (contact.excluded) return { decision: 'stop', reason: 'excluded' }
  if (contact.consent_expired) return { decision: 'stop', reason: 'consent_expired' }

  if (delegation.revoked_at) return { decision: 'awaits_validation', reason: 'revoked' }
  if (delegation.paused_at) return { decision: 'awaits_validation', reason: 'paused' }
  if (now.getTime() < Date.parse(delegation.starts_at)) return { decision: 'awaits_validation', reason: 'not_started' }
  if (now.getTime() >= Date.parse(delegation.expires_at)) return { decision: 'awaits_validation', reason: 'expired' }

  if (scope === 'campaign') {
    // c89 d'origine : contacts NOMMÉS, contenus relus (empreinte).
    if (!delegation.contact_ids.includes(step.contact_id)) {
      return { decision: 'awaits_validation', reason: 'contact_out_of_scope' }
    }
    if (step.content_hash !== delegation.content_hash) {
      return { decision: 'awaits_validation', reason: 'content_changed' }
    }
  } else {
    // Portée d'espace : contacts restreints seulement s'ils sont nommés ; PAS de mandat rétroactif —
    // un fait né avant la signature (ou de date inconnue) attend : inconnu ⇒ attend.
    if (delegation.contact_ids.length > 0 && !delegation.contact_ids.includes(step.contact_id)) {
      return { decision: 'awaits_validation', reason: 'contact_out_of_scope' }
    }
    const origin = step.originated_at ? Date.parse(step.originated_at) : Number.NaN
    if (!Number.isFinite(origin) || origin < Date.parse(delegation.validated_at)) {
      return { decision: 'awaits_validation', reason: 'predates_mandate' }
    }
    // #4016 L5 (reprise 20/10) — une échéance pas encore arrivée attend, même sous mandat signé.
    if (origin > now.getTime()) return { decision: 'awaits_validation', reason: 'not_due' }
    if (delegation.content_hash !== null && step.content_hash !== delegation.content_hash) {
      return { decision: 'awaits_validation', reason: 'content_changed' }
    }
  }
  if (step.sender_mailbox_id !== delegation.sender_mailbox_id) {
    return { decision: 'awaits_validation', reason: 'sender_mismatch' }
  }

  if (!capabilities.mailbox_connected) return { decision: 'awaits_validation', reason: 'mailbox_unavailable' }
  if (!capabilities.reply_reading_available) return { decision: 'awaits_validation', reason: 'replies_unreadable' }

  const hour = now.getHours()
  if (!withinQuietHours(now) || hour < delegation.window.start_hour || hour >= delegation.window.end_hour) {
    return { decision: 'awaits_validation', reason: 'outside_window' }
  }
  if (delegation.sent_count >= delegation.max_messages)
    return { decision: 'awaits_validation', reason: 'quota_reached' }

  return { decision: 'run', basis: 'delegation' }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * #3702.9 — LE MANDAT SUR LE FIL : création, vue, état de vie.
 * ───────────────────────────────────────────────────────────────────────────── */

/** Un message relu, avec la version vue : la délégation n'autorise que CE texte. */
export const delegationReviewedMessageSchema = z.object({
  id: z.string().guid(),
  version: z.number().int().min(1),
})
export type DelegationReviewedMessage = z.infer<typeof delegationReviewedMessageSchema>

/** Ce que le commercial envoie pour déléguer : le brouillon borné + les messages relus. */
export const createOutreachDelegationRequestSchema = outreachDelegationDraftSchema.extend({
  messages: z.array(delegationReviewedMessageSchema).min(1).max(DELEGATION_MAX_MESSAGES),
})
export type CreateOutreachDelegationRequest = z.infer<typeof createOutreachDelegationRequestSchema>

/**
 * #4016 L5 — signer un mandat d'ESPACE pour une portée. Geste explicite : la
 * case `signed` doit être cochée (littéral `true`), le libellé dit ce qui
 * partira, les bornes sont écrites. Les plafonds absolus restent ceux de c89 ;
 * le plan de l'espace peut les abaisser (`sendBoundsOfPlan`), jamais les lever.
 */
export const createScopedDelegationRequestSchema = z.object({
  scope: delegationScopeSchema.exclude(['campaign', 'linkedin_send']),
  campaign_label: z.string().trim().min(1).max(120),
  /** Vide = tous les contacts de l'espace ; sinon, seuls ceux-là. */
  contact_ids: z.array(z.string().guid()).max(DELEGATION_MAX_CONTACTS).default([]),
  channels: z.array(delegableChannelSchema).min(1),
  sender_mailbox_id: z.string().min(1),
  window: delegationWindowSchema,
  duration_days: z.number().int().min(1).max(DELEGATION_MAX_DAYS),
  max_messages: z.number().int().min(1).max(DELEGATION_MAX_MESSAGES),
  /** La signature : jamais implicite, jamais pré-cochée par le serveur. */
  signed: z.literal(true),
})
export type CreateScopedDelegationRequest = z.infer<typeof createScopedDelegationRequestSchema>

/** Le geste de renouvellement : un NOUVEAU mandat, re-signé, mêmes bornes, nouvelle durée. */
export const renewDelegationRequestSchema = z.object({
  duration_days: z.number().int().min(1).max(DELEGATION_MAX_DAYS),
  signed: z.literal(true),
})
export type RenewDelegationRequest = z.infer<typeof renewDelegationRequestSchema>

/** Les bornes qu'un plan accorde : refus NOMMÉ au-delà, jamais un écrêtage silencieux. */
export function exceedsPlanBounds(
  draft: { duration_days: number; max_messages: number; contact_ids: readonly string[] },
  bounds: SendBounds,
): 'duration' | 'volume' | 'contacts' | null {
  if (draft.duration_days > bounds.mandate_max_days) return 'duration'
  if (draft.max_messages > bounds.mandate_max_messages) return 'volume'
  if (draft.contact_ids.length > bounds.mandate_max_contacts) return 'contacts'
  return null
}

/** L'état de vie d'un mandat : un seul mot, jamais « active » pour un mandat qui ne peut plus agir. */
export const DELEGATION_LIFECYCLES = ['active', 'paused', 'revoked', 'expired', 'exhausted', 'not_started'] as const
export type DelegationLifecycle = (typeof DELEGATION_LIFECYCLES)[number]

export const outreachDelegationViewSchema = z.object({
  id: z.string().guid(),
  /** #4016 L5 — l'usage couvert. */
  scope: delegationScopeSchema.default('campaign'),
  /** #4016 L5 — le mandat que celui-ci renouvelle, s'il en renouvelle un. */
  renewed_from: z.string().guid().nullable().default(null),
  campaign_label: z.string(),
  contact_count: z.number().int().min(0),
  channels: z.array(delegableChannelSchema),
  sender_mailbox_id: z.string(),
  window: delegationWindowSchema,
  starts_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  max_messages: z.number().int().min(1),
  sent_count: z.number().int().min(0),
  validated_by: z.array(z.string()),
  validated_at: z.string().datetime(),
  revoked_at: z.string().datetime().nullable(),
  paused_at: z.string().datetime().nullable(),
  lifecycle: z.enum(DELEGATION_LIFECYCLES),
})
export type OutreachDelegationView = z.infer<typeof outreachDelegationViewSchema>

/** Révoqué l'emporte sur tout ; « actif » seulement si le mandat peut réellement agir. */
export function delegationLifecycle(
  delegation: Pick<
    OutreachDelegation,
    'revoked_at' | 'paused_at' | 'starts_at' | 'expires_at' | 'max_messages' | 'sent_count'
  >,
  now: Date,
): DelegationLifecycle {
  if (delegation.revoked_at) return 'revoked'
  if (now.getTime() >= Date.parse(delegation.expires_at)) return 'expired'
  if (delegation.sent_count >= delegation.max_messages) return 'exhausted'
  if (delegation.paused_at) return 'paused'
  if (now.getTime() < Date.parse(delegation.starts_at)) return 'not_started'
  return 'active'
}

/** Un canal annonce sa capacité RÉELLE — jamais « automatique » pour ce qui ne l'est pas (#3700.8). */
export type ChannelCapability = 'delegable' | 'manual_only'
export function channelCapability(channel: string): ChannelCapability {
  return (DELEGABLE_CHANNELS as readonly string[]).includes(channel) ? 'delegable' : 'manual_only'
}
