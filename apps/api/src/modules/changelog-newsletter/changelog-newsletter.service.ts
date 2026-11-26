import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  LATEST_CHANGELOG_ID,
  defaultNotificationPreferences,
  changelogEntriesSince,
  resolveChangelogEntries,
  resolveChangelogLanguage,
  type ChangelogEntry,
} from '@bellum/contracts'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { MailerService } from '../mailer/mailer.service'
import { SuppressionService } from '../mailer/suppression.service'
import { signUnsubscribeToken } from '../mailer/unsubscribe-token'

/**
 * How many entries one email shows. Beyond that the mail says « + N autres »
 * and links to the app — a reader coming back after a long silence gets a
 * readable digest, not a 40-entry wall.
 */
const MAX_ENTRIES_PER_EMAIL = 10

/** One candidate reader: their identity + their newsletter state. */
type NewsletterCandidate = {
  user_id: string
  email: string | null
  first_name: string | null
  /** NULL when the user has no preferences row yet — the toggle defaults ON. */
  newsletter_changelog: boolean | null
  /** Newest entry already emailed. NULL = never served. */
  newsletter_last_entry_id: string | null
  email_language: string | null
}

/**
 * L'état de diffusion du changelog, LU sans rien envoyer — ce que l'écran
 * « Changelog » du back-office affiche (#1642-bis, demande de Louis du
 * 06/09/2026 : « suivre les changelog sur le dashboard manager »).
 *
 * Les six familles s'ADDITIONNENT jusqu'à `readers` : un lecteur est dans une
 * et une seule. C'est ce qui rend l'écran vérifiable d'un coup d'oeil.
 *
 * ⚠️ La suppression list n'est PAS évaluée ici. Elle se décide par ESPACE au
 * moment de l'envoi, donc la connaître coûterait une requête par lecteur et par
 * espace — et surtout elle ne changerait pas le geste de l'opérateur. L'écran
 * le DIT plutôt que de laisser croire que `behind` est le nombre d'e-mails qui
 * partiront.
 */
export type ChangelogDeliverySnapshot = {
  /** L'entrée la plus récente du catalogue : le repère que tout le monde vise. */
  latestEntryId: string
  /** Combien d'identités réelles l'envoi considère (mêmes critères que le cron). */
  readers: number
  /** Déjà calés sur la dernière entrée — ils ne recevront rien. */
  upToDate: number
  /** Un repère valide, plus ancien : ils ont un delta à recevoir. */
  behind: number
  /** Aucun repère : le prochain passage le POSE, sans envoyer l'historique. */
  neverServed: number
  /** Un repère dont l'entrée a quitté le catalogue : re-amorcé, rien d'envoyé. */
  markerRetired: number
  /** Interrupteur `newsletter_changelog` explicitement à OFF. */
  optedOut: number
  /** Aucune adresse exploitable — on ne peut pas leur écrire. */
  noEmail: number
  /**
   * Part des lecteurs à jour, en pourcentage entier. `null` sans AUCUN lecteur
   * — « non mesuré » n'est pas « 0 %», et ce n'est pas non plus « 100 % ».
   */
  upToDateShare: number | null
  /** Où sont calés les lecteurs, du plus en retard au plus à jour. */
  markers: {
    entryId: string | null
    /** Libellés FR du catalogue ; `null` pour un repère qui n'y est plus. */
    date: string | null
    title: string | null
    readers: number
    /** Combien d'entrées ce repère n'a pas encore vues. */
    pendingEntries: number
  }[]
  /** Toujours `false` : dit à l'écran ce que ce compte n'a PAS regardé. */
  suppressionEvaluated: false
  computedAt: string
}

/** What happened to one reader, for the cron's log line and the tests. */
export type NewsletterOutcome = 'sent' | 'seeded' | 'up_to_date' | 'opted_out' | 'suppressed' | 'no_email'

/**
 * Newsletter Changelog — l'e-mail bimensuel promis par l'écran Réglages ›
 * Notifications : « Recevez un e-mail bimensuel récapitulant les nouveautés et
 * améliorations ». Ni plus (aucun contenu marketing, aucune relance), ni moins.
 *
 * Le contenu vient du catalogue partagé `@bellum/contracts` — le MÊME que le
 * panneau « Nouveautés » de la sidebar. Aucune entrée n'est composée ici : un
 * e-mail ne peut contenir que ce qui est réellement au catalogue.
 *
 * Règles dures :
 *  - JAMAIS deux fois la même nouveauté. `newsletter_last_entry_id` mémorise
 *    par utilisateur la dernière entrée envoyée ; seul le delta au-dessus de ce
 *    repère part. Le repère est posé AVANT l'envoi : un cron rejoué, deux
 *    replicas ou un retry ne peuvent pas ré-annoncer une nouveauté (c'est le
 *    même arbitrage que le digest de veille — on préfère rater un envoi qu'en
 *    faire deux).
 *  - JAMAIS d'e-mail creux. Delta vide = aucun envoi, aucun « rien de neuf ».
 *  - Premier passage = amorçage silencieux. Un lecteur sans repère reçoit le
 *    repère, pas les 75 entrées de l'historique.
 *  - Opt-IN, STRICT (#2082.16, 15/09/2026) : le toggle `newsletter_changelog`
 *    est FAUX par défaut — une case cochée d'avance ne vaut pas consentement,
 *    et une ligne de préférences ABSENTE encore moins. Un OFF (explicite ou par
 *    défaut) OU la présence dans la suppression list (#394) → rien n'est envoyé
 *    ET le repère n'avance pas (se réabonner ne fait pas perdre ce qu'on n'a
 *    pas lu). Avant cette date, `=== false` laissait partir l'e-mail à tous les
 *    lecteurs sans ligne.
 *  - Langue du lecteur : `email_language` (reportée par la SPA), défaut FR.
 *  - Best-effort : l'échec d'un lecteur ne casse jamais le lot.
 */
@Injectable()
export class ChangelogNewsletterService {
  private readonly logger = new Logger(ChangelogNewsletterService.name)

  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    private readonly mailer: MailerService,
    private readonly suppression: SuppressionService,
    private readonly config: ConfigService,
  ) {}

  /** One pass over every candidate reader. Per-reader failures are swallowed. */
  async run(): Promise<Record<NewsletterOutcome, number>> {
    const tally: Record<NewsletterOutcome, number> = {
      sent: 0,
      seeded: 0,
      up_to_date: 0,
      opted_out: 0,
      suppressed: 0,
      no_email: 0,
    }
    const candidates = await this.fetchCandidates()
    for (const candidate of candidates) {
      try {
        tally[await this.deliverTo(candidate)] += 1
      } catch (err) {
        this.logger.warn('Changelog newsletter failed for user (non-fatal)', {
          user: { id: candidate.user_id },
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    this.logger.log(
      `Changelog newsletter: ${tally.sent} sent, ${tally.seeded} seeded, ${tally.up_to_date} up to date, ` +
        `${tally.opted_out} opted out, ${tally.suppressed} suppressed, ${tally.no_email} without address ` +
        `(${candidates.length} candidate(s))`,
    )
    return tally
  }

  /**
   * L'état de diffusion, sans le moindre envoi ni la moindre écriture.
   *
   * Il réutilise `fetchCandidates()` — la MÊME requête que `run()`. Une seconde
   * requête écrite à côté aurait sa propre définition de « lecteur » (le filtre
   * `anonymized_at`, la jointure des préférences), et les deux auraient divergé
   * au premier changement sans qu'aucun test ne tombe. Une dérivation vit à un
   * seul endroit.
   *
   * Le classement suit l'ORDRE exact de `deliverTo`, moins la suppression list
   * — voir {@link ChangelogDeliverySnapshot}.
   */
  async describeDelivery(): Promise<ChangelogDeliverySnapshot> {
    const catalogue = resolveChangelogEntries('fr')
    const rank = new Map(catalogue.map((entry, index) => [entry.id, index]))
    const candidates = await this.fetchCandidates()

    let upToDate = 0
    let behind = 0
    let neverServed = 0
    let markerRetired = 0
    let optedOut = 0
    let noEmail = 0
    const byMarker = new Map<string, number>()

    for (const candidate of candidates) {
      // #2082.16 — `?? défaut` et non `=== false` : NULL (aucune ligne de
      // préférences) est une absence de consentement, pas un consentement.
      if (!(candidate.newsletter_changelog ?? defaultNotificationPreferences.newsletter_changelog)) {
        optedOut += 1
        continue
      }
      if (!candidate.email?.trim()) {
        noEmail += 1
        continue
      }
      const marker = candidate.newsletter_last_entry_id
      if (marker === null) {
        neverServed += 1
        continue
      }
      if (marker === LATEST_CHANGELOG_ID) {
        upToDate += 1
        byMarker.set(marker, (byMarker.get(marker) ?? 0) + 1)
        continue
      }
      if (!rank.has(marker)) {
        markerRetired += 1
        continue
      }
      behind += 1
      byMarker.set(marker, (byMarker.get(marker) ?? 0) + 1)
    }

    const markers = [...byMarker.entries()]
      .map(([entryId, readers]) => {
        const index = rank.get(entryId)
        const entry = index === undefined ? undefined : catalogue[index]
        return {
          entryId,
          date: entry?.date ?? null,
          title: entry?.title ?? null,
          readers,
          pendingEntries: index ?? 0,
        }
      })
      // Le plus en retard d'abord : c'est la ligne qui demande une décision.
      .sort((a, b) => b.pendingEntries - a.pendingEntries)

    return {
      latestEntryId: LATEST_CHANGELOG_ID,
      readers: candidates.length,
      upToDate,
      behind,
      neverServed,
      markerRetired,
      optedOut,
      noEmail,
      // Sans aucun lecteur, la division n'a pas de sens : « non mesuré ».
      upToDateShare: candidates.length === 0 ? null : Math.round((upToDate / candidates.length) * 100),
      markers,
      suppressionEvaluated: false,
      computedAt: new Date().toISOString(),
    }
  }

  /**
   * Decide and deliver for ONE reader. Public so it is unit-testable and can
   * back a future admin "send me mine now" action.
   */
  async deliverTo(candidate: NewsletterCandidate): Promise<NewsletterOutcome> {
    // #2082.16 — le défaut vit à UN seul endroit (GA-26) et il est FAUX : un
    // lecteur qui n'a jamais ouvert l'écran de réglages n'a rien consenti.
    if (!(candidate.newsletter_changelog ?? defaultNotificationPreferences.newsletter_changelog)) {
      return 'opted_out'
    }

    const email = candidate.email?.trim() ?? ''
    if (!email) return 'no_email'

    const language = resolveChangelogLanguage(candidate.email_language)

    // Never served yet (or a marker whose entry left the catalogue): seed the
    // marker, send nothing. A new reader must not receive the whole history.
    const delta = changelogEntriesSince(language, candidate.newsletter_last_entry_id)
    if (delta.length === 0) {
      const alreadyOnLatest = candidate.newsletter_last_entry_id === LATEST_CHANGELOG_ID
      if (alreadyOnLatest) return 'up_to_date'
      await this.stampMarker(candidate.user_id)
      return 'seeded'
    }

    // Suppression list (#394) — STRICT, and checked across every workspace the
    // user belongs to: an address that opted out of Bellum email gets nothing.
    // The marker deliberately does NOT advance, so re-subscribing does not
    // silently swallow what was never read.
    const workspaceIds = await this.workspaceIdsOf(candidate.user_id)
    for (const workspaceId of workspaceIds) {
      if (await this.suppression.isSuppressed(workspaceId, email)) return 'suppressed'
    }

    // Idempotence: stamp BEFORE sending. A crash between the two costs one
    // digest; the reverse order would re-announce entries already read.
    await this.stampMarker(candidate.user_id)

    const shown = delta.slice(0, MAX_ENTRIES_PER_EMAIL)
    const frontendUrl = (this.config.get<string>('frontendUrl') ?? 'http://localhost:3000').replace(/\/$/, '')
    const unsubscribe = this.buildUnsubscribe(workspaceIds[0] ?? null, email, frontendUrl)

    await this.mailer.sendChangelogNewsletterEmail({
      to: email,
      language,
      firstName: candidate.first_name?.trim() || null,
      entries: shown.map(toEmailEntry),
      extraCount: delta.length - shown.length,
      appUrl: `${frontendUrl}/dashboard`,
      settingsUrl: `${frontendUrl}/settings/notifications`,
      unsubscribeUrl: unsubscribe.url,
      oneClickUnsubscribe: unsubscribe.oneClick,
    })

    return 'sent'
  }

  /**
   * Move the reader's marker to the newest published entry. Upsert: a user who
   * never opened the settings screen has no preferences row yet, and their
   * (default-ON) subscription must still be trackable.
   */
  private async stampMarker(userId: string): Promise<void> {
    const existing = await this.prefs.findOne({ where: { user_id: userId } })
    if (existing) {
      await this.prefs.update({ id: existing.id }, { newsletter_last_entry_id: LATEST_CHANGELOG_ID })
      return
    }
    await this.prefs.insert({ user_id: userId, newsletter_last_entry_id: LATEST_CHANGELOG_ID })
  }

  /** Every reader we could write to: a real, non-anonymised identity, with
   *  their newsletter state joined in (LEFT JOIN — no row means defaults). */
  private async fetchCandidates(): Promise<NewsletterCandidate[]> {
    return (
      this.profiles
        .createQueryBuilder('profile')
        .leftJoin(NotificationPreferenceEntity, 'prefs', 'prefs.user_id = profile.user_id')
        .select([
          'profile.user_id AS user_id',
          'profile.email AS email',
          'profile.first_name AS first_name',
          'prefs.newsletter_changelog AS newsletter_changelog',
          'prefs.newsletter_last_entry_id AS newsletter_last_entry_id',
          'prefs.email_language AS email_language',
        ])
        .where('profile.email IS NOT NULL')
        // RGPD: a closed account's identity is scrubbed — never mail it again.
        .andWhere('profile.anonymized_at IS NULL')
        .getRawMany<NewsletterCandidate>()
    )
  }

  private async workspaceIdsOf(userId: string): Promise<string[]> {
    const rows = await this.members.find({ where: { user_id: userId }, order: { created_at: 'ASC' } })
    return rows.map(row => row.workspace_id)
  }

  /** Signed one-click unsubscribe (existing `/emails/unsubscribe` route) when
   *  the secret + public URL + workspace are known; otherwise the settings
   *  screen (footer link only, no RFC 8058 headers). Same helper shape as the
   *  veille digest so both emails opt out through one mechanism. */
  private buildUnsubscribe(
    workspaceId: string | null,
    email: string,
    frontendUrl: string,
  ): { url: string; oneClick: boolean } {
    const secret = this.config.get<string>('internalApiSecret') ?? ''
    const base = this.config.get<string>('apiPublicUrl')
    if (secret && base && workspaceId) {
      const token = signUnsubscribeToken({ workspaceId, email }, secret)
      return { url: `${base.replace(/\/$/, '')}/emails/unsubscribe?token=${encodeURIComponent(token)}`, oneClick: true }
    }
    return { url: `${frontendUrl}/settings/notifications`, oneClick: false }
  }
}

function toEmailEntry(entry: ChangelogEntry): { date: string; title: string; items: string[] } {
  return { date: entry.date, title: entry.title, items: entry.items }
}
