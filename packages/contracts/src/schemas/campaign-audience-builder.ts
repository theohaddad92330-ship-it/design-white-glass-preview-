import { z } from 'zod'

/**
 * Épopée #2974 — LE CONSTRUCTEUR D'AUDIENCE DE CAMPAGNE.
 *
 * Tranché (Louis, lot V39) : `campaign_label` mono-contact referme l'audience
 * multi-contacts (doctrine c74, 16/09 — non rouverte). Le constructeur ne crée
 * donc AUCUN objet audience persistant : il produit une LISTE de contacts
 * éligibles, chacun étiqueté mono-contact — chaque séquence armée ensuite
 * reste la séquence d'UNE personne. Dédup : on PROPOSE, on ne fusionne jamais.
 * Collision : un contact déjà dans une séquence active est signalé ET exclu
 * par défaut. Conformité : opt-out et effacement RGPD toujours exclus, aucun
 * critère protégé dans un filtre.
 *
 * Fonction PURE : l'API lit les candidats (source), cette fonction décide —
 * un seul calcul, lu par l'API et par l'écran.
 */

/** Les critères qu'un filtre d'audience ne porte JAMAIS (doctrine : aucun
 *  critère protégé ne pèse dans le rang ni la sélection d'une personne). */
export const AUDIENCE_PROTECTED_CRITERIA = [
  'age',
  'birth_date',
  'gender',
  'origin',
  'nationality',
  'photo',
  'photo_url',
  'address',
  'religion',
  'health',
  'union_membership',
  'political_opinion',
  'sexual_orientation',
  'family_status',
] as const

export const AUDIENCE_CHANNELS = ['email', 'phone', 'linkedin'] as const
type AudienceChannel = (typeof AUDIENCE_CHANNELS)[number]

/** Le refroidissement par défaut : un contact écrit il y a moins de 14 jours
 *  n'entre pas dans une nouvelle campagne (#2380.57). */
export const AUDIENCE_DEFAULT_COOLDOWN_DAYS = 14

const idList = z.array(z.string().trim().min(1).max(120)).max(500)
const textList = z.array(z.string().trim().min(1).max(120)).max(50)

/**
 * Les filtres — `.strict()` : une clé inconnue (dont tout critère protégé)
 * est REFUSÉE, jamais ignorée en silence.
 */
export const campaignAudienceFiltersSchema = z
  .object({
    /** #2380.14 — entreprise. */
    account_ids: idList.optional(),
    /** #2380.15 — entité (direction, filiale), sans casse. */
    entities: textList.optional(),
    /** #2380.16 — rôle dans la décision. */
    decision_roles: textList.optional(),
    /** #2380.17 — séniorité. */
    seniorities: textList.optional(),
    /** #2380.18 — territoire : la localisation CONTIENT ce texte. */
    location_contains: z.string().trim().min(1).max(120).optional(),
    /** #2380.20 — porteur attribué. */
    owner_ids: idList.optional(),
    /** #2380.21 — coordonnées exigées. */
    require_email: z.boolean().optional(),
    require_phone: z.boolean().optional(),
    /** #2380.22 — fraîcheur : enrichi il y a au plus N jours. */
    enriched_within_days: z.number().int().min(1).max(3650).optional(),
    /** #2380.23 — statut de travail du contact. */
    statuses: textList.optional(),
    /** #2380.24 — dernière interaction : pas écrit depuis au moins N jours. */
    not_contacted_within_days: z.number().int().min(1).max(3650).optional(),
    /** #2380.25 — séquence actuelle : `no` = sans séquence active. */
    in_sequence: z.enum(['any', 'no']).optional(),
    /** #2380.27 — canal visé : sans coordonnée pour ce canal, le contact est exclu et compté. */
    channel: z.enum(AUDIENCE_CHANNELS).optional(),
    /** #2380.28 — persona (famille de fonction). */
    personas: textList.optional(),
    /** #2380.29 — priorité : au plus ce rang (1 = la plus haute). */
    max_priority: z.number().int().min(1).max(10).optional(),
    /** #2380.57 — refroidissement, en jours. */
    cooldown_days: z.number().int().min(0).max(365).optional(),
    /** #2380.54 — fréquence par compte : au plus N contacts d'un même compte par lancement. */
    max_per_account: z.number().int().min(1).max(100).optional(),
    /** #2380.56 — plafond quotidien global : au plus N contacts par lancement. */
    max_per_day: z.number().int().min(1).max(1000).optional(),
    /** #2380.53 — fréquence par contact : au plus N séquences déjà armées pour
     *  CE contact, toutes campagnes confondues (jamais un décompte par lancement). */
    max_per_contact: z.number().int().min(1).max(50).optional(),
    /** #2380.55 — fréquence par canal : au plus N contacts par canal et par lancement
     *  (le canal du filtre, sinon la première coordonnée : e-mail, téléphone, LinkedIn). */
    max_per_channel: z.number().int().min(1).max(1000).optional(),
  })
  .strict()
export type CampaignAudienceFilters = z.infer<typeof campaignAudienceFiltersSchema>

/** Les sources d'audience — chacune rend des CONTACTS, jamais un objet audience. */
export const campaignAudienceSourceSchema = z.discriminatedUnion('kind', [
  /** #2380.1 — tous les contacts de l'espace. */
  z.object({ kind: z.literal('workspace_contacts') }).strict(),
  /** #2380.2 — une liste de cibles (contacts cités, ou contacts des comptes cités). */
  z.object({ kind: z.literal('target_list'), target_list_id: z.string().guid() }).strict(),
  /** #2380.3 / #2380.4 — une sélection explicite (Découvrir, recherche de Laura). */
  z.object({ kind: z.literal('contact_ids'), contact_ids: idList.min(1) }).strict(),
  /** #2380.5 — les contacts d'un compte. */
  z.object({ kind: z.literal('account'), account_id: z.string().guid() }).strict(),
  /** #2380.6 — les contacts rattachés à une opportunité. */
  z.object({ kind: z.literal('opportunity'), opportunity_id: z.string().guid() }).strict(),
  /** #2380.7 — les contacts rattachés à un besoin : le demandeur
   *  (`project_needs.contact_id`) et le décideur (`decision_maker_contact_id`)
   *  — les deux seuls liens contact NETS que porte un besoin, jamais un texte
   *  libre apparié. */
  z.object({ kind: z.literal('need'), need_id: z.string().guid() }).strict(),
  /** #2380.8 — les contacts arrivés par un import de fichier (`contacts.source = 'import'`). */
  z.object({ kind: z.literal('import') }).strict(),
  /** #2380.12 — les contacts des comptes au statut commercial `dormant`. */
  z.object({ kind: z.literal('dormant_accounts') }).strict(),
  /** #2380.9 — les contacts synchronisés depuis le CRM branché. */
  z.object({ kind: z.literal('crm') }).strict(),
  /** #2380.11 — les participants d'un événement (une activité) : ceux que la capture a
   *  RÉSOLUS en contact (`activity_participants.contact_id`), jamais un handle apparié. */
  z.object({ kind: z.literal('event_participants'), activity_id: z.string().guid() }).strict(),
  /** #2380.13 — les contacts DONT L'E-MAIL est celui du contact d'une ESN partenaire
   *  (`partner_relations.contact_email`) : une égalité exacte, jamais un nom deviné. */
  z.object({ kind: z.literal('partners') }).strict(),
  /** #2202.12 — les contacts qu'une VUE ENREGISTRÉE (écran « contacts ») ramène. La vue est une
   *  SOURCE de contacts, jamais un objet « audience partagée » (doctrine c74) : une séquence par
   *  contact, regroupées pour la lecture par `campaign_label`. */
  z.object({ kind: z.literal('saved_view'), saved_view_id: z.string().guid() }).strict(),
])
export type CampaignAudienceSource = z.infer<typeof campaignAudienceSourceSchema>

export const campaignAudienceRequestSchema = z
  .object({
    source: campaignAudienceSourceSchema,
    filters: campaignAudienceFiltersSchema.default({}),
    /** Réintègre les contacts déjà en séquence (jamais un opt-out ni un effacement). */
    include_collisions: z.boolean().optional(),
  })
  .strict()
export type CampaignAudienceRequest = z.infer<typeof campaignAudienceRequestSchema>

/** Un candidat, tel que l'API le lit — aucun champ inventé, une absence reste `null`. */
export type AudienceCandidate = {
  id: string
  full_name: string
  title: string | null
  account_id: string | null
  account_name: string | null
  /** Le compte est écarté (`priority_gate = 'parked'`). */
  account_parked: boolean
  entity: string | null
  decision_role: string | null
  seniority: string | null
  location: string | null
  family: string | null
  priority: number | null
  user_status: string | null
  assigned_to: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  identity_confirmed: boolean
  last_enrichment_at: string | null
  last_contacted_at: string | null
  lifecycle_state: string | null
  /** Un arrêt posé (`contact_stops`) ou un écartement (`excluded_at`). */
  opted_out: boolean
  /** #2380.61 — la RAISON de l'arrêt (`contact_stops.reason`), affichée telle quelle. */
  stop_reason?: string | null
  /** Effacement RGPD demandé / effectué (`anonymized_at`, `deleted_at`). */
  erased: boolean
  active_sequence: { sequence_id: string; owner_id: string } | null
  /** #2380.53 — nombre de séquences déjà armées pour ce contact, toutes
   *  campagnes confondues (workspace entier), jamais un texte deviné. */
  prior_sequences_count: number
}

export const AUDIENCE_EXCLUSION_REASONS = [
  'erasure_requested',
  'opted_out',
  'account_excluded',
  'contact_left',
  'already_in_sequence',
  'cooldown',
  'missing_coordinates',
  // #2380.54 / #2380.56 — au-delà du plafond de fréquence demandé.
  'frequency_cap',
  // #2380.65 — la seule coordonnée e-mail est une boîte personnelle (webmail grand public).
  'personal_contact',
] as const
export type AudienceExclusionReason = (typeof AUDIENCE_EXCLUSION_REASONS)[number]

export const campaignAudienceEligibleSchema = z.object({
  contact_id: z.string(),
  full_name: z.string(),
  title: z.string().nullable(),
  account_id: z.string().nullable(),
  account_name: z.string().nullable(),
  assigned_to: z.string().nullable(),
  /** Relu tel quel : la fenêtre de création demande confirmation sans e-mail. */
  email: z.string().nullable(),
  /** c74 — chaque contact de la liste sera la séquence d'UNE personne. */
  sequence_scope: z.literal('mono_contact'),
  duplicate_suspected: z.boolean(),
  identity_unverified: z.boolean(),
  owned_by_other: z.boolean(),
  already_contacted: z.boolean(),
})

export const campaignAudienceResultSchema = z.object({
  eligible: z.array(campaignAudienceEligibleSchema),
  excluded: z.array(
    z.object({
      contact_id: z.string(),
      /** `null` pour un effacement RGPD : la personne ne se nomme plus. */
      full_name: z.string().nullable(),
      reason: z.enum(AUDIENCE_EXCLUSION_REASONS),
      /** #2380.61 — pour `opted_out` : la raison de l'arrêt, `null` quand elle n'est pas connue. */
      stop_reason: z.string().nullable().optional(),
    }),
  ),
  duplicates: z.array(z.object({ key: z.enum(['email', 'phone']), contact_ids: z.array(z.string()) })),
  collisions: z.array(
    z.object({
      contact_id: z.string(),
      sequence_id: z.string(),
      owner_id: z.string(),
      is_team_collision: z.boolean(),
    }),
  ),
  preview: z.object({
    total: z.number().int(),
    eligible: z.number().int(),
    missing_coordinates: z.number().int(),
    unverified_identity: z.number().int(),
    already_in_sequence: z.number().int(),
    already_contacted: z.number().int(),
    duplicates: z.number().int(),
    other_owner: z.number().int(),
    excluded_accounts: z.number().int(),
    left_contacts: z.number().int(),
    team_collisions: z.number().int(),
    /** #2380.54 / #2380.56 — coupés par un plafond de fréquence (0 = aucun plafond n'a mordu). */
    frequency_capped: z.number().int(),
    /** #2380.65 — écartés parce que leur seule coordonnée est une boîte personnelle. */
    personal_contacts: z.number().int(),
  }),
})
export type CampaignAudienceResult = z.infer<typeof campaignAudienceResultSchema>

const DAY_MS = 24 * 60 * 60 * 1000

const lower = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()
const inList = (value: string | null, list: readonly string[] | undefined) =>
  !list || list.length === 0 || list.map(lower).includes(lower(value))

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+33')) digits = `0${digits.slice(3)}`
  digits = digits.replace(/\D/g, '')
  return digits.length >= 6 ? digits : null
}

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return (now.getTime() - time) / DAY_MS
}

/** Webmails grand public : une boîte PERSONNELLE n'est pas une coordonnée professionnelle.
 *  Liste fermée et exacte (le domaine entier), jamais une devinette sur le nom. */
const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'outlook.fr',
  'live.com',
  'live.fr',
  'msn.com',
  'icloud.com',
  'me.com',
  'free.fr',
  'orange.fr',
  'wanadoo.fr',
  'sfr.fr',
  'laposte.net',
  'proton.me',
  'protonmail.com',
])

/** #3989.7 — aussi la règle « coordonnée PRO » de la base commune (un seul endroit, GA-26). */
export function isPersonalEmail(email: string | null): boolean {
  const domain = lower(email).split('@')[1]
  return domain !== undefined && PERSONAL_EMAIL_DOMAINS.has(domain)
}

/** #2380.65 — personnel si la boîte l'est ET qu'aucune autre coordonnée ne porte le contact
 *  (ou si le canal demandé est justement l'e-mail). */
function isPersonalContact(c: AudienceCandidate, channel: AudienceChannel | undefined): boolean {
  if (!isPersonalEmail(c.email)) return false
  if (channel === 'email') return true
  return !c.phone?.trim() && !c.linkedin_url?.trim()
}

/** Le canal par lequel ce contact serait joint : celui du filtre, sinon la première coordonnée. */
function channelOf(c: AudienceCandidate, wanted: AudienceChannel | undefined): AudienceChannel | null {
  if (wanted) return wanted
  return AUDIENCE_CHANNELS.find(channel => hasChannel(c, channel)) ?? null
}

function hasChannel(candidate: AudienceCandidate, channel: AudienceChannel): boolean {
  if (channel === 'email') return Boolean(candidate.email?.trim())
  if (channel === 'phone') return Boolean(candidate.phone?.trim())
  return Boolean(candidate.linkedin_url?.trim())
}

function passesFilters(c: AudienceCandidate, f: CampaignAudienceFilters, now: Date): boolean {
  if (f.account_ids?.length && !f.account_ids.includes(c.account_id ?? '')) return false
  if (!inList(c.entity, f.entities)) return false
  if (!inList(c.decision_role, f.decision_roles)) return false
  if (!inList(c.seniority, f.seniorities)) return false
  if (!inList(c.user_status, f.statuses)) return false
  if (!inList(c.family, f.personas)) return false
  if (f.location_contains && !lower(c.location).includes(lower(f.location_contains))) return false
  if (f.owner_ids?.length && !f.owner_ids.includes(c.assigned_to ?? '')) return false
  if (f.require_email && !c.email?.trim()) return false
  if (f.require_phone && !c.phone?.trim()) return false
  if (f.enriched_within_days !== undefined) {
    const age = daysSince(c.last_enrichment_at, now)
    // Jamais enrichi = pas frais : l'absence ne passe pas un filtre de fraîcheur.
    if (age === null || age > f.enriched_within_days) return false
  }
  if (f.not_contacted_within_days !== undefined) {
    const age = daysSince(c.last_contacted_at, now)
    if (age !== null && age < f.not_contacted_within_days) return false
  }
  if (f.in_sequence === 'no' && c.active_sequence) return false
  // Une priorité non renseignée ne passe pas un filtre de priorité (jamais « 0 »).
  if (f.max_priority !== undefined && (c.priority === null || c.priority > f.max_priority)) return false
  return true
}

export function buildCampaignAudience(
  candidates: readonly AudienceCandidate[],
  filters: CampaignAudienceFilters,
  options: { now: Date; viewerId: string; includeCollisions?: boolean },
): CampaignAudienceResult {
  const { now, viewerId } = options
  const cooldown = filters.cooldown_days ?? AUDIENCE_DEFAULT_COOLDOWN_DAYS

  // #2380.43 — un contact_id canonique n'entre qu'UNE fois.
  const seen = new Set<string>()
  const pool: AudienceCandidate[] = []
  for (const c of candidates) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    if (passesFilters(c, filters, now)) pool.push(c)
  }

  // #2380.38 / #2380.45 — doublons PROPOSÉS (e-mail, téléphone), jamais fusionnés.
  const duplicates: CampaignAudienceResult['duplicates'] = []
  const suspected = new Set<string>()
  for (const key of ['email', 'phone'] as const) {
    const groups = new Map<string, string[]>()
    for (const c of pool) {
      const value = key === 'email' ? lower(c.email) || null : normalizePhone(c.phone)
      if (!value) continue
      groups.set(value, [...(groups.get(value) ?? []), c.id])
    }
    for (const ids of groups.values()) {
      if (ids.length < 2) continue
      duplicates.push({ key, contact_ids: ids })
      ids.forEach(id => suspected.add(id))
    }
  }

  const eligible: CampaignAudienceResult['eligible'] = []
  const excluded: CampaignAudienceResult['excluded'] = []
  const collisions: CampaignAudienceResult['collisions'] = []
  const preview = {
    total: pool.length,
    eligible: 0,
    missing_coordinates: 0,
    unverified_identity: 0,
    already_in_sequence: 0,
    already_contacted: 0,
    duplicates: suspected.size,
    other_owner: 0,
    excluded_accounts: 0,
    left_contacts: 0,
    team_collisions: 0,
    frequency_capped: 0,
    personal_contacts: 0,
  }

  const perAccount = new Map<string, number>()
  const perChannel = new Map<AudienceChannel, number>()
  for (const c of pool) {
    const exclude = (reason: AudienceExclusionReason) =>
      excluded.push({
        contact_id: c.id,
        full_name: reason === 'erasure_requested' ? null : c.full_name,
        reason,
        // #2380.61 — un arrêt se DIT avec sa raison ; inconnue = `null`, jamais devinée.
        ...(reason === 'opted_out' ? { stop_reason: c.stop_reason ?? null } : {}),
      })

    const contactedAge = daysSince(c.last_contacted_at, now)
    if (contactedAge !== null) preview.already_contacted += 1
    if (!c.identity_confirmed) preview.unverified_identity += 1
    const ownedByOther = Boolean(c.assigned_to && c.assigned_to !== viewerId)
    if (ownedByOther) preview.other_owner += 1
    if (c.active_sequence) {
      preview.already_in_sequence += 1
      const isTeam = c.active_sequence.owner_id !== viewerId
      if (isTeam) preview.team_collisions += 1
      collisions.push({
        contact_id: c.id,
        sequence_id: c.active_sequence.sequence_id,
        owner_id: c.active_sequence.owner_id,
        is_team_collision: isTeam,
      })
    }

    // Conformité d'abord : aucun réglage ne les réintègre.
    if (c.erased) {
      exclude('erasure_requested')
      continue
    }
    if (c.opted_out) {
      exclude('opted_out')
      continue
    }
    if (c.account_parked) {
      preview.excluded_accounts += 1
      exclude('account_excluded')
      continue
    }
    if (c.lifecycle_state === 'historique') {
      preview.left_contacts += 1
      exclude('contact_left')
      continue
    }
    if (c.active_sequence && !options.includeCollisions) {
      exclude('already_in_sequence')
      continue
    }
    if (contactedAge !== null && contactedAge < cooldown) {
      exclude('cooldown')
      continue
    }
    if (filters.channel && !hasChannel(c, filters.channel)) {
      preview.missing_coordinates += 1
      exclude('missing_coordinates')
      continue
    }

    if (isPersonalContact(c, filters.channel)) {
      preview.personal_contacts += 1
      exclude('personal_contact')
      continue
    }

    // #2380.53 / #2380.54 / #2380.56 — plafonds de fréquence, APRÈS la conformité :
    // un plafond ne réintègre jamais un exclu, il ne coupe que des contacts déjà éligibles.
    const accountFull =
      c.account_id !== null &&
      filters.max_per_account !== undefined &&
      (perAccount.get(c.account_id) ?? 0) >= filters.max_per_account
    const dayFull = filters.max_per_day !== undefined && eligible.length >= filters.max_per_day
    const contactFull = filters.max_per_contact !== undefined && c.prior_sequences_count >= filters.max_per_contact
    const channel = channelOf(c, filters.channel)
    const channelFull =
      channel !== null &&
      filters.max_per_channel !== undefined &&
      (perChannel.get(channel) ?? 0) >= filters.max_per_channel
    if (accountFull || dayFull || contactFull || channelFull) {
      preview.frequency_capped += 1
      exclude('frequency_cap')
      continue
    }
    if (channel) perChannel.set(channel, (perChannel.get(channel) ?? 0) + 1)
    if (c.account_id) perAccount.set(c.account_id, (perAccount.get(c.account_id) ?? 0) + 1)

    eligible.push({
      contact_id: c.id,
      full_name: c.full_name,
      title: c.title,
      account_id: c.account_id,
      account_name: c.account_name,
      assigned_to: c.assigned_to,
      email: c.email,
      sequence_scope: 'mono_contact',
      duplicate_suspected: suspected.has(c.id),
      identity_unverified: !c.identity_confirmed,
      owned_by_other: ownedByOther,
      already_contacted: contactedAge !== null,
    })
  }
  preview.eligible = eligible.length

  return { eligible, excluded, duplicates, collisions, preview }
}

/**
 * #2380.11 — un événement que le sélecteur de la source « participants d'un événement »
 * propose : une réunion ou un appel de l'espace dont au moins un participant est résolu en
 * contact. Un événement sans participant résolu ne fait aucune ligne (rien à cibler).
 */
export const campaignAudienceEventSchema = z.object({
  activity_id: z.string().guid(),
  kind: z.string(),
  subject: z.string().nullable(),
  occurred_at: z.string(),
  participant_count: z.number().int().positive(),
})
export type CampaignAudienceEvent = z.infer<typeof campaignAudienceEventSchema>

/**
 * #2202.15 — un besoin ouvert que le sélecteur « besoin » propose : son titre et le nombre de PERSONNES distinctes
 * qu'il porte (demandeur, décideur — les deux seuls liens nets, #2380.7). Un besoin sans personne ne fait aucune ligne.
 */
export const campaignAudienceNeedSchema = z.object({
  need_id: z.string().guid(),
  title: z.string(),
  contact_count: z.number().int().positive(),
})
export type CampaignAudienceNeed = z.infer<typeof campaignAudienceNeedSchema>
