import { randomUUID } from 'crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  creditCostOf,
  foldEnrichmentCoordinateStates,
  isPlausiblePhoneNumber,
  missingEnrichmentChannels,
  toE164,
  type ContactEnrichmentTrace,
  type EnrichmentCoordinateStates,
} from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { IaClient } from '../ia/ia.client'
import { PHONE_REVEAL_DEBIT, type PhoneRevealDebit } from './module-tokens'
import { signPhoneRevealToken } from './phone-reveal-token'

/** Apollo livre « en plusieurs minutes » ; au-delà d'un jour, le jeton ne vaut plus rien. */
const TOKEN_TTL_MS = 24 * 3_600_000

/** La route publique qui reçoit le mobile (voir `ContactPhoneRevealWebhookController`). */
export const PHONE_REVEAL_WEBHOOK_PATH = 'webhooks/enrichment/phone'

type RevealMatch = {
  apolloId?: string
  linkedinUrl?: string
  firstName?: string
  lastName?: string
  organizationName?: string
}

type PhoneRevealRequestState = 'pending' | 'not_found' | 'not_requested' | 'error'

/**
 * Lit le mobile d'une livraison Apollo (`people[].phone_numbers[]`, doc
 * « retrieve mobile phone numbers », vérifiée le 07/10/2026). Mobile valide
 * d'abord, puis tout numéro non marqué invalide. La FORME fait foi
 * (`isPlausiblePhoneNumber` — #3850.1, POINT D'ÉCRITURE, plus stricte que la
 * garde d'affichage) — rien n'est deviné.
 */
export function phoneFromApolloWebhook(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const people = (payload as { people?: unknown }).people
  if (!Array.isArray(people)) return null
  const numbers = people.flatMap(person =>
    person && typeof person === 'object' && Array.isArray((person as { phone_numbers?: unknown }).phone_numbers)
      ? ((person as { phone_numbers: unknown[] }).phone_numbers as Array<Record<string, unknown>>)
      : [],
  )
  const usable = numbers
    .filter(entry => entry && typeof entry === 'object' && entry['status_cd'] !== 'invalid_number')
    .map(entry => ({
      mobile: entry['type_cd'] === 'mobile',
      value: [entry['sanitized_number'], entry['raw_number']].find(
        (candidate): candidate is string => typeof candidate === 'string' && isPlausiblePhoneNumber(candidate),
      ),
    }))
    .filter((entry): entry is { mobile: boolean; value: string } => Boolean(entry.value))
  const picked = (usable.find(entry => entry.mobile) ?? usable[0])?.value
  // #3850.4 — stockage E.164 compact, sans espace ; l'affichage international
  // lisible se recalcule à la lecture (`formatPhoneForDisplay`).
  return picked ? toE164(picked) : null
}

/**
 * E1 (07/10/2026, #3698 — décision Louis, point 2) — la révélation du MOBILE
 * chez Apollo, en deux temps.
 *
 * 1. `request` — dernier maillon de la cascade, seulement si le téléphone
 *    manque encore après Apollo (match) puis FullEnrich. Le nonce est écrit sur
 *    la fiche AVANT l'appel (une livraison rapide ne trouve jamais une fiche qui
 *    ne l'attend pas), puis Apollo reçoit `reveal_phone_number=true` et une URL
 *    de retour PUBLIQUE signée (`phone-reveal-token.ts`).
 * 2. `applyWebhook` — la livraison. Acceptée UNE fois, pour CE nonce (le nonce
 *    est consommé par une écriture conditionnelle : deux livraisons simultanées
 *    ne passent pas toutes les deux). Le mobile n'est écrit que si la fiche n'a
 *    toujours AUCUN téléphone — une correction humaine n'est jamais écrasée. Le
 *    débit n'a lieu que si le numéro a vraiment été écrit, que la tentative
 *    synchrone n'avait pas déjà débité, et hors rattrapage gratuit.
 *
 * Sans `API_PUBLIC_URL` ou sans `INTERNAL_API_SECRET` : no-op strict, rien ne
 * part chez Apollo.
 */
@Injectable()
export class ContactPhoneRevealService {
  private readonly logger = new Logger(ContactPhoneRevealService.name)

  constructor(
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    private readonly ia: IaClient,
    private readonly config: ConfigService,
    // GA-07 — le débit passe par un jeton du module, jamais par le service de
    // crédits importé ici (même patron que `ENRICHMENT_OUTAGE_ALERT`).
    @Inject(PHONE_REVEAL_DEBIT) private readonly debit: PhoneRevealDebit,
  ) {}

  private secret(): string {
    return (this.config.get<string>('internalApiSecret') ?? '').trim()
  }

  private publicUrl(): string {
    return (this.config.get<string>('apiPublicUrl') ?? '').trim().replace(/\/+$/, '')
  }

  isConfigured(): boolean {
    return Boolean(this.publicUrl() && this.secret().length >= 16)
  }

  /** Fusionne un morceau dans la trace interne sans écraser le reste. */
  private async patchTrace(contactId: string, patch: Partial<ContactEnrichmentTrace>): Promise<void> {
    await this.contacts
      .createQueryBuilder()
      .update(ContactEntity)
      .set({ enrichment_trace: () => `COALESCE(enrichment_trace, '{}'::jsonb) || CAST(:tracePatch AS jsonb)` })
      .where('id = :id', { id: contactId })
      .setParameters({ tracePatch: JSON.stringify(patch) })
      .execute()
  }

  async request(
    target: { id: string; workspace_id: string | null },
    match: RevealMatch,
    billing: { debited: boolean; free: boolean },
  ): Promise<{ state: PhoneRevealRequestState; linkedinUrl?: string }> {
    if (!this.isConfigured()) return { state: 'not_requested' }
    const nonce = randomUUID()
    const contactId = target.id
    const token = signPhoneRevealToken(
      { contactId, workspaceId: target.workspace_id, nonce, expiresAt: Date.now() + TOKEN_TTL_MS },
      this.secret(),
    )
    await this.patchTrace(contactId, {
      phone_reveal: { nonce, requested_at: new Date().toISOString(), debited: billing.debited, free: billing.free },
    })
    let answer: Awaited<ReturnType<IaClient['revealContactPhone']>> | null = null
    try {
      answer = await this.ia.revealContactPhone({
        webhookUrl: `${this.publicUrl()}/${PHONE_REVEAL_WEBHOOK_PATH}/${token}`,
        ...match,
      })
    } catch (error) {
      this.logger.warn('[E1-couverture] source=apollo_mobile outcome=error (demande non partie)', { contactId, error })
    }
    if (answer?.requested) {
      this.logger.log('[E1-couverture] source=apollo_mobile outcome=pending', { contactId })
      return { state: 'pending', ...(answer.linkedin_url ? { linkedinUrl: answer.linkedin_url } : {}) }
    }
    // La demande n'est pas partie : la fiche n'attend plus rien.
    await this.patchTrace(contactId, { phone_reveal: null })
    if (answer?.reason === 'no_match') return { state: 'not_found' }
    if (answer?.reason === 'unconfigured' || answer?.reason === 'no_match_key') return { state: 'not_requested' }
    return { state: 'error' }
  }

  async applyWebhook(
    signed: { contactId: string; workspaceId: string | null; nonce: string },
    payload: unknown,
  ): Promise<{ accepted: boolean; outcome?: 'found' | 'not_found' }> {
    const { contactId, nonce } = signed
    // #2671.5 — la borne d'espace est SIGNÉE dans le jeton, avec le contact.
    const contact = await this.contacts.findOne({
      where: { id: contactId, workspace_id: signed.workspaceId ?? IsNull() },
      select: [
        'id',
        'user_id',
        'account_id',
        'full_name',
        'email',
        'phone',
        'linkedin_url',
        'enrichment_coordinates',
        'enrichment_trace',
      ],
    })
    const trace = (contact?.enrichment_trace ?? null) as ContactEnrichmentTrace | null
    const pending = trace?.phone_reveal
    if (!contact || !pending || pending.nonce !== nonce) return { accepted: false }

    // Consommer le nonce — conditionnel : une seconde livraison simultanée ne
    // trouve plus rien à consommer (pas de double écriture, pas de double débit).
    const claimed = await this.contacts
      .createQueryBuilder()
      .update(ContactEntity)
      .set({ enrichment_trace: () => `jsonb_set(enrichment_trace, '{phone_reveal}', 'null'::jsonb)` })
      .where('id = :id', { id: contactId })
      .andWhere(`enrichment_trace->'phone_reveal'->>'nonce' = :nonce`, { nonce })
      .execute()
    if (!claimed.affected) return { accepted: false }

    const phone = phoneFromApolloWebhook(payload)
    let written = false
    if (phone && !(contact.phone ?? '').trim()) {
      // Écriture CONDITIONNELLE : si une main a posé un numéro depuis la
      // demande, elle gagne — rien n'est écrasé, rien n'est débité.
      const debit = !pending.debited && !pending.free
      const result = await this.contacts
        .createQueryBuilder()
        .update(ContactEntity)
        .set({ phone, ...(debit ? { phone_cost_credits: creditCostOf('contact_enrichment') } : {}) })
        .where('id = :id', { id: contactId })
        .andWhere(`(phone IS NULL OR btrim(phone) = '')`)
        .execute()
      written = Boolean(result.affected)
    }

    if (written && !pending.debited && !pending.free) {
      const consume = await this.debit(contact.user_id, {
        reason: `enrichissement (mobile) : ${contact.full_name ?? contactId}`,
        ...(contact.account_id ? { accountId: contact.account_id } : {}),
      })
      if (!consume.ok) {
        // Même posture que la cascade synchrone : la fiche est à jour, le coût
        // fournisseur est pour nous cette fois.
        this.logger.warn('Mobile révélé mais débit refusé', { contactId, reason: consume.reason })
      }
    }

    const outcome: 'found' | 'not_found' = written ? 'found' : phone ? 'found' : 'not_found'
    const at = new Date().toISOString()
    const attempts = [
      ...(trace?.attempts ?? []).filter(attempt => !(attempt.source === 'apollo' && attempt.coordinate === 'phone')),
      { source: 'apollo', coordinate: 'phone' as const, outcome, at },
    ]
    const after = { email: contact.email, phone: written ? phone : contact.phone, linkedin_url: contact.linkedin_url }
    const folded = foldEnrichmentCoordinateStates(attempts, after, at)
    const coordinates: EnrichmentCoordinateStates = {
      ...((contact.enrichment_coordinates ?? {}) as EnrichmentCoordinateStates),
      ...(folded.phone ? { phone: folded.phone } : {}),
    }
    await this.contacts
      .createQueryBuilder()
      .update(ContactEntity)
      .set({
        enrichment_coordinates: coordinates,
        last_enrichment_missing: missingEnrichmentChannels(after),
        enrichment_trace: () => `COALESCE(enrichment_trace, '{}'::jsonb) || CAST(:tracePatch AS jsonb)`,
      })
      .where('id = :id', { id: contactId })
      .setParameters({ tracePatch: JSON.stringify({ attempts }) })
      .execute()

    // Mesure (point 7) — jamais le numéro, seulement l'issue.
    this.logger.log(`[E1-couverture] source=apollo_mobile coordinate=phone outcome=${outcome}`, { contactId })
    return { accepted: true, outcome }
  }
}
