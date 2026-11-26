import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm'
import { isFailure } from '@bellum/utils'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactEnrichmentService } from './contact-enrichment.service'

const PAGE = 200

/**
 * Le plan Apollo est passé de Basic à Professional le 01/11/2026 : avant, People-Match renvoyait la personne avec
 * `email_not_unlocked@…` (écarté par la collecte, `apollo.py` `_is_locked_email`) et le contact finissait « aucun canal ».
 */
export const LOCKED_EMAIL_PLAN_SWITCH_AT = '2026-11-01T00:00:00.000Z'

/** La borne d'UN geste d'admin d'espace : jamais plus de 100 contacts mis en file d'un coup. */
export const LOCKED_EMAIL_CATCHUP_MAX_LIMIT = 100

/** Un rejeu d'e-mail = au plus un crédit People-Match par contact (un miss ne débite rien) : l'estimation est un PLAFOND. */
const CREDITS_PER_CONTACT = 1

type LockedEmailCatchupOutcome = {
  dry_run: boolean
  /** Contacts qui répondent au critère (la simulation compte tout, sans borne). */
  concerned: number
  /** PLAFOND de crédits Apollo qu'un vrai passage dépenserait (`concerned` × 1) — un miss ne débite rien. */
  estimated_credits: number
  /** Mis en file (exécution seulement). */
  enqueued: number
  /** Refusés d'avance (cooldown, panne…) — comptés, jamais perdus. */
  skipped: number
  /** Présent quand une borne est demandée : l'exécution s'est arrêtée à la borne, il en reste. */
  limit_reached?: boolean
}

/**
 * Apollo Professional (02/11) — RATTRAPAGE CIBLÉ DES E-MAILS QUE LE PLAN BASIC MASQUAIT.
 *
 * Aucune trace ne marque un contact « verrouillé » (le placeholder est écarté avant la base, la tentative est
 * seulement datée). Le critère le plus ÉTROIT lisible sur la fiche : Apollo a répondu (`last_enrichment_provider =
 * 'apollo'`, résultat `matched` ou `no_new_data`, jamais `ambiguous`), l'e-mail est ABSENT, et la dernière tentative
 * PRÉCÈDE le passage en Professional. C'est un sur-ensemble honnête (un contact simplement sans e-mail chez Apollo y
 * figure) : la simulation le COMPTE avant toute dépense.
 *
 *  - **JAMAIS automatique** : ni boot, ni cron — seul l'appel explicite d'un opérateur (`internal/admin`) ;
 *  - **UN espace** à la fois, jamais le parc ; simulation par défaut ;
 *  - **idempotent** : le rejeu date la tentative (`last_enrichment_at` ≥ passage) → le contact sort seul du critère ;
 *  - **une saisie manuelle n'est jamais écrasée** : seuls les e-mails ABSENTS sont visés, et `enrichContact` (qui écrit)
 *    garde une valeur corrigée à la main ;
 *  - rejeu **e-mail seul** (`only: 'email'`), au nom du propriétaire, gratuit pour le client (améliorer NOTRE collecte
 *    ne se facture pas — comme le rattrapage des coordonnées #3549).
 */
@Injectable()
export class LockedEmailCatchupService {
  private readonly logger = new Logger(LockedEmailCatchupService.name)

  constructor(
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    private readonly enrichment: ContactEnrichmentService,
  ) {}

  async run(params: { workspaceId: string; dryRun?: boolean; limit?: number }): Promise<LockedEmailCatchupOutcome> {
    const workspaceId = params.workspaceId?.trim()
    if (!workspaceId) throw new Error('Rattrapage des e-mails verrouillés : un espace est obligatoire (jamais le parc)')
    const dryRun = params.dryRun !== false
    const limit = params.limit
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > LOCKED_EMAIL_CATCHUP_MAX_LIMIT))
      throw new Error(`Rattrapage des e-mails verrouillés : borne entre 1 et ${LOCKED_EMAIL_CATCHUP_MAX_LIMIT}`)

    const cutoff = new Date(LOCKED_EMAIL_PLAN_SWITCH_AT)
    const base = {
      workspace_id: workspaceId,
      deleted_at: IsNull(),
      hidden: false,
      excluded_at: IsNull(),
      email: IsNull(),
      last_enrichment_provider: 'apollo',
      last_enrichment_at: LessThan(cutoff),
    }
    let concerned = 0
    let enqueued = 0
    let skipped = 0
    let limitReached = false
    let after: string | null = null
    for (;;) {
      const page: ContactEntity[] = await this.contacts.find({
        where: ['matched', 'no_new_data'].map(result => ({
          ...base,
          last_enrichment_result: result,
          ...(after ? { id: MoreThan(after) } : {}),
        })),
        select: ['id', 'user_id', 'full_name', 'entity', 'email'],
        order: { id: 'ASC' },
        take: PAGE,
      })
      if (page.length === 0) break
      for (const row of page) {
        if ((row.email ?? '').trim() !== '') continue // double lecture : une saisie présente n'est jamais touchée
        concerned += 1
        if (dryRun) continue
        if (limit !== undefined && enqueued + skipped >= limit) {
          limitReached = true
          break
        }
        try {
          const [firstName, ...rest] = (row.full_name ?? '').trim().split(/\s+/).filter(Boolean)
          const accepted = await this.enrichment.enqueue(row.id, row.user_id, {
            first_name: firstName || row.full_name || '',
            ...(rest.length ? { last_name: rest.join(' ') } : {}),
            organization_name: row.entity ?? '',
            force: true,
            only: 'email',
            free: true,
          })
          if (isFailure(accepted)) skipped += 1
          else enqueued += 1
        } catch (error) {
          skipped += 1
          this.logger.warn('Rattrapage des e-mails verrouillés : mise en file échouée', { contactId: row.id, error })
        }
      }
      if (limitReached) break
      after = page[page.length - 1]?.id ?? null
      if (page.length < PAGE || !after) break
    }
    this.logger.log('Rattrapage des e-mails verrouillés terminé', { workspaceId, dryRun, concerned, enqueued, skipped })
    return {
      dry_run: dryRun,
      concerned,
      estimated_credits: concerned * CREDITS_PER_CONTACT,
      enqueued,
      skipped,
      ...(limit !== undefined ? { limit_reached: limitReached } : {}),
    }
  }
}
