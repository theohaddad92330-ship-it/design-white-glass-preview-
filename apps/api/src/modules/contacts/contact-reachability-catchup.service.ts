import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThan, Repository } from 'typeorm'
import { isFailure } from '@bellum/utils'
import {
  CONTACT_REACHABILITY_CATCHUP_CAPABILITY_AT,
  contactReachabilityCatchupOnly,
  isContactReachabilityCatchupConcerned,
  type ContactEnrichmentTrace,
  type ContactReachabilityCatchupOutcome,
  type EnrichmentChannel,
  type EnrichmentCoordinateStates,
  type EnrichmentSourceOutcome,
} from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { killSwitchCut } from '../../common/kill-switches'
import { ContactEnrichmentService } from './contact-enrichment.service'

const DEFAULT_LIMIT = 200

/**
 * #3549 (02/10/2026) — LE RATTRAPAGE DES COORDONNÉES MANQUANTES.
 *
 * Voir `packages/contracts/src/schemas/contact-reachability-catchup.ts` : un
 * correctif de collecte RATTRAPE l'existant, ciblé (jamais tout le parc), par
 * segment (les contacts), sur une DATE. Même doctrine que `SegmentCatchupService`
 * et `MissingRolesCatchupService` :
 *
 *  - JAMAIS automatique : aucun `onApplicationBootstrap`, aucun `@Cron`. Seul un
 *    appel EXPLICITE d'opérateur (`AdminContactReachabilityCatchupController`)
 *    atteint `runCatchup`, et l'interrupteur `contacts.reachability_catchup`
 *    coupe même cet appel ;
 *  - GRATUIT pour le client (`free: true`, voir `ContactsService.enrichContact`) :
 *    améliorer NOTRE collecte ne se facture pas ;
 *  - double lecture : le SQL fait le premier tri (manque + date), la fonction
 *    pure de `@bellum/contracts` a le dernier mot ;
 *  - une correction humaine gagne toujours : le rejeu passe par `enrichContact`,
 *    qui n'écrase pas une valeur corrigée à la main, et `force` ne lève que le
 *    cooldown d'une tentative antérieure à la capacité.
 *
 * Aucune colonne de marquage : le rejeu écrit sa propre trace
 * (`last_enrichment_at`), plus récente que la capacité — le contact sort seul du ciblage.
 */
@Injectable()
export class ContactReachabilityCatchupService {
  private readonly logger = new Logger(ContactReachabilityCatchupService.name)

  constructor(
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    private readonly enrichment: ContactEnrichmentService,
  ) {}

  /** Les contacts CONCERNÉS — lecture seule, borné par `limit`. */
  async listConcerned(limit = DEFAULT_LIMIT): Promise<ContactEntity[]> {
    const capability = new Date(CONTACT_REACHABILITY_CATCHUP_CAPABILITY_AT)
    const base = { deleted_at: IsNull(), hidden: false, excluded_at: IsNull() }
    const rows = await this.contacts.find({
      where: [
        { ...base, email: IsNull(), last_enrichment_at: LessThan(capability) },
        { ...base, phone: IsNull(), last_enrichment_at: LessThan(capability) },
        { ...base, email: IsNull(), last_enrichment_at: IsNull(), created_at: LessThan(capability) },
        { ...base, phone: IsNull(), last_enrichment_at: IsNull(), created_at: LessThan(capability) },
      ],
      order: { created_at: 'ASC' },
      take: limit,
    })
    return rows.filter(row => isContactReachabilityCatchupConcerned(row))
  }

  /**
   * Le rattrapage lui-même. `operatorUserId` ne sert qu'à la TRACE : chaque
   * contact est rejoué AU NOM DE SON PROPRIÉTAIRE (`contact.user_id`).
   */
  async runCatchup(operatorUserId: string, limit = DEFAULT_LIMIT): Promise<ContactReachabilityCatchupOutcome> {
    if (killSwitchCut('contacts.reachability_catchup')) {
      this.logger.log('Rattrapage des coordonnées coupé par interrupteur — rien exécuté', { operatorUserId })
      return { scanned: 0, enqueued: 0, skipped: 0, cut: true }
    }

    const rows = await this.listConcerned(limit)
    let enqueued = 0
    let skipped = 0
    for (const row of rows) {
      try {
        const [firstName, ...rest] = (row.full_name ?? '').trim().split(/\s+/).filter(Boolean)
        const only = contactReachabilityCatchupOnly(row)
        const accepted = await this.enrichment.enqueue(row.id, row.user_id, {
          first_name: firstName || row.full_name || '',
          ...(rest.length ? { last_name: rest.join(' ') } : {}),
          organization_name: row.entity ?? '',
          force: true,
          free: true,
          ...(only ? { only } : {}),
        })
        if (isFailure(accepted)) skipped += 1
        else enqueued += 1
      } catch (error) {
        // Une panne sur CE contact ne dit rien des autres : comptée, jamais avalée.
        skipped += 1
        this.logger.warn('Rattrapage des coordonnées : mise en file échouée', { contactId: row.id, error })
      }
    }
    this.logger.log('Rattrapage des coordonnées terminé', { operatorUserId, scanned: rows.length, enqueued, skipped })
    return { scanned: rows.length, enqueued, skipped, cut: false }
  }

  /**
   * E1 (07/10/2026, #3698 — décision Louis, point 6) — le rattrapage CIBLÉ :
   * une liste d'ids choisie par l'opérateur (« un échantillon de 25 »), bornée à
   * {@link TARGETED_MAX}. Chaque contact à qui il manque téléphone, e-mail OU
   * LinkedIn est rejoué par la cascade complète (Apollo → FullEnrich →
   * révélation du mobile), gratuit (`free`), forcé (la porte de 30 jours ne
   * protège pas d'un correctif de NOTRE collecte), sans `only`. Même porte que
   * `runCatchup` : jamais au déploiement, coupé par l'interrupteur. Une
   * correction humaine n'est jamais écrasée — c'est `enrichContact` qui écrit.
   */
  async runForIds(operatorUserId: string, contactIds: readonly string[]): Promise<ContactReachabilityTargetedOutcome> {
    const ids = [...new Set(contactIds)].slice(0, TARGETED_MAX)
    if (killSwitchCut('contacts.reachability_catchup')) {
      return { requested: ids.length, enqueued: 0, skipped: 0, cut: true, per_contact: [] }
    }
    const rows = ids.length ? await this.contacts.find({ where: { id: In(ids), deleted_at: IsNull() } }) : []
    const byId = new Map(rows.map(row => [row.id, row]))
    const perContact: ContactReachabilityTargetedOutcome['per_contact'] = []
    let enqueued = 0
    for (const id of ids) {
      const row = byId.get(id)
      if (!row) {
        perContact.push({ contact_id: id, status: 'not_found' })
        continue
      }
      if (row.hidden || row.excluded_at) {
        perContact.push({ contact_id: id, status: 'excluded' })
        continue
      }
      if (row.email && row.phone && row.linkedin_url) {
        perContact.push({ contact_id: id, status: 'complete' })
        continue
      }
      try {
        const [firstName, ...rest] = (row.full_name ?? '').trim().split(/\s+/).filter(Boolean)
        const accepted = await this.enrichment.enqueue(row.id, row.user_id, {
          first_name: firstName || row.full_name || '',
          ...(rest.length ? { last_name: rest.join(' ') } : {}),
          organization_name: row.entity ?? '',
          force: true,
          free: true,
        })
        if (isFailure(accepted)) {
          perContact.push({ contact_id: id, status: accepted.problem.code })
        } else {
          enqueued += 1
          perContact.push({ contact_id: id, status: 'enqueued' })
        }
      } catch (error) {
        perContact.push({ contact_id: id, status: 'error' })
        this.logger.warn('Rattrapage ciblé : mise en file échouée', { contactId: id, error })
      }
    }
    const skipped = perContact.filter(entry => entry.status !== 'enqueued').length
    this.logger.log('Rattrapage ciblé des coordonnées (E1)', {
      operatorUserId,
      requested: ids.length,
      enqueued,
      skipped,
    })
    return { requested: ids.length, enqueued, skipped, cut: false, per_contact: perContact }
  }

  /**
   * E1 (point 7) — la MESURE sur un échantillon : par coordonnée, combien sont
   * présentes et dans quel état ; par source, ce qu'elle a répondu à la
   * dernière tentative. Lecture seule, réservée à l'opérateur (les sources se
   * nomment ici, jamais côté client).
   */
  async coverage(contactIds: readonly string[]): Promise<ContactEnrichmentCoverage> {
    const ids = [...new Set(contactIds)].slice(0, TARGETED_MAX)
    const rows = ids.length
      ? await this.contacts.find({
          where: { id: In(ids) },
          select: ['id', 'email', 'phone', 'linkedin_url', 'enrichment_coordinates', 'enrichment_trace'],
        })
      : []
    const out: ContactEnrichmentCoverage = {
      contacts: rows.length,
      present: { email: 0, phone: 0, linkedin: 0 },
      coordinates: { email: {}, phone: {}, linkedin: {} },
      sources: {},
    }
    for (const row of rows) {
      const values = { email: row.email, phone: row.phone, linkedin: row.linkedin_url }
      const states = (row.enrichment_coordinates ?? {}) as EnrichmentCoordinateStates
      for (const channel of ['email', 'phone', 'linkedin'] as const) {
        if ((values[channel] ?? '').trim()) out.present[channel] += 1
        const state = states[channel]?.state ?? 'none'
        out.coordinates[channel][state] = (out.coordinates[channel][state] ?? 0) + 1
      }
      const trace = (row.enrichment_trace ?? null) as ContactEnrichmentTrace | null
      for (const attempt of trace?.attempts ?? []) {
        const source = (out.sources[attempt.source] ??= {})
        const coordinate = (source[attempt.coordinate] ??= {})
        coordinate[attempt.outcome] = (coordinate[attempt.outcome] ?? 0) + 1
      }
    }
    return out
  }
}

/** E1 — borne dure du rattrapage ciblé : un échantillon, jamais le parc. */
const TARGETED_MAX = 50

export type ContactReachabilityTargetedOutcome = {
  requested: number
  enqueued: number
  skipped: number
  cut: boolean
  /** `enqueued` | `complete` | `excluded` | `not_found` | `error` | code de refus. */
  per_contact: Array<{ contact_id: string; status: string }>
}

export type ContactEnrichmentCoverage = {
  contacts: number
  present: Record<EnrichmentChannel, number>
  /** Par coordonnée : `found` / `not_found` / `pending` / `unknown` / `none` (jamais tenté). */
  coordinates: Record<EnrichmentChannel, Record<string, number>>
  /** Par source puis coordonnée : `found` / `not_found` / `error` / `unknown` / `pending`. */
  sources: Record<string, Record<string, Partial<Record<EnrichmentSourceOutcome, number>>>>
}
