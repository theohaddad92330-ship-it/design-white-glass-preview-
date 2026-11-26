import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, MoreThan, Not, Repository } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProvenanceService } from '../crm-core/provenance.service'
import { isPlaceholderEmail } from './placeholder-email'

const PAGE = 500

type PlaceholderEmailCatchupOutcome = {
  dry_run: boolean
  /** Les fiches de l'espace qui portent une adresse. */
  examined: number
  /** Les fiches dont l'adresse est un gabarit : vidées (exécution) ou qui le seraient (simulation). */
  cleared: number
  /** Gabarit repéré mais laissé : posé à la main, ou corrigé entre la lecture et l'écriture. */
  skipped: number
  /** #4599.4 — présent quand une borne est demandée : l'exécution s'est arrêtée à la borne, il en reste. */
  limit_reached?: boolean
}

/** #4599.4 — la borne d'UN geste d'admin d'espace : jamais plus de 100 fiches écrites d'un coup. */
export const PLACEHOLDER_EMAIL_CATCHUP_MAX_LIMIT = 100

/**
 * #4599 — LE RATTRAPAGE DES ADRESSES GABARIT (« prenom.nom@domaine ») DÉJÀ EN BASE.
 *
 * Un correctif de collecte RATTRAPE l'existant (doctrine #2543), ciblé : UN espace à la fois, jamais tout le parc.
 *
 *  - **JAMAIS automatique** : ni boot, ni `@Cron`. Seul un appel EXPLICITE d'opérateur atteint {@link run} ;
 *  - **simulation d'abord** : `dryRun` vaut `true` tant qu'on n'a pas dit `false` — la simulation rend les mêmes
 *    compteurs sans rien écrire ;
 *  - **on archive, on ne supprime pas** : l'ancienne valeur part dans `enrichment_archive` avec sa date, le champ
 *    redevient NULL (« e-mail absent », jamais une adresse inventée) ; la fiche reste ;
 *  - **une correction humaine gagne toujours** : une adresse dont la provenance est `human` n'est pas touchée, et
 *    l'écriture est CONDITIONNELLE (`email = <valeur lue>`) — une main passée entre la lecture et le geste tient.
 */
@Injectable()
export class PlaceholderEmailCatchupService {
  private readonly logger = new Logger(PlaceholderEmailCatchupService.name)

  constructor(
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @Optional() private readonly provenance?: ProvenanceService,
  ) {}

  async run(params: {
    workspaceId: string
    dryRun?: boolean
    limit?: number
  }): Promise<PlaceholderEmailCatchupOutcome> {
    const workspaceId = params.workspaceId?.trim()
    if (!workspaceId)
      throw new Error('Rattrapage des adresses gabarit : un espace est obligatoire (jamais tout le parc)')
    const dryRun = params.dryRun !== false
    // #4599.4 — la borne ne vaut que pour l'EXÉCUTION : la simulation compte tout, pour que le chiffre lu soit vrai.
    const limit = params.limit
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > PLACEHOLDER_EMAIL_CATCHUP_MAX_LIMIT))
      throw new Error(`Rattrapage des adresses gabarit : borne entre 1 et ${PLACEHOLDER_EMAIL_CATCHUP_MAX_LIMIT}`)
    let limitReached = false

    let examined = 0
    let cleared = 0
    let skipped = 0
    let after: string | null = null
    for (;;) {
      const page: ContactEntity[] = await this.contacts.find({
        where: {
          workspace_id: workspaceId,
          deleted_at: IsNull(),
          email: Not(IsNull()),
          ...(after ? { id: MoreThan(after) } : {}),
        },
        select: ['id', 'email', 'email_verified', 'email_confidence'],
        order: { id: 'ASC' },
        take: PAGE,
      })
      if (page.length === 0) break
      for (const row of page) {
        examined += 1
        if (!isPlaceholderEmail(row.email)) continue
        const sources = this.provenance ? await this.provenance.currentSources('contact', row.id) : {}
        if (sources['email'] === 'human') {
          skipped += 1
          continue
        }
        if (dryRun) {
          cleared += 1
          continue
        }
        // #4599.4 — la borne n'est « atteinte » que s'il RESTE une fiche à vider : un lot qui finit pile ne ment pas.
        if (limit !== undefined && cleared >= limit) {
          limitReached = true
          break
        }
        try {
          const result = await this.contacts
            .createQueryBuilder()
            .update(ContactEntity)
            .set({
              enrichment_archive: () => `COALESCE(enrichment_archive, '{}'::jsonb) || CAST(:archivePatch AS jsonb)`,
              email: null,
              email_verified: false,
              email_confidence: null,
              enrichment_archived_at: new Date(),
            })
            .where('id = :id', { id: row.id })
            .andWhere('workspace_id = :workspaceId', { workspaceId })
            .andWhere('email = :email', { email: row.email })
            .setParameter(
              'archivePatch',
              JSON.stringify({
                email: row.email,
                email_verified: row.email_verified ?? false,
                email_confidence: row.email_confidence ?? null,
                email_placeholder_cleared_at: new Date().toISOString(),
              }),
            )
            .execute()
          if (result.affected) {
            cleared += 1
            // #4599.7 — l'ancienne adresse est LISIBLE au journal de la fiche (`record_field_audit`, le même que
            // l'historique des champs), pas seulement archivée dans une colonne que l'écran ne lit pas.
            await this.journal(workspaceId, row.id, row.email)
          } else skipped += 1
        } catch (error) {
          // Une panne sur CETTE fiche ne dit rien des autres : comptée, jamais avalée.
          skipped += 1
          this.logger.warn('Rattrapage des adresses gabarit : écriture échouée', { contactId: row.id, error })
        }
      }
      if (limitReached) break
      after = page[page.length - 1]?.id ?? null
      if (page.length < PAGE || !after) break
    }
    this.logger.log('Rattrapage des adresses gabarit terminé', { workspaceId, dryRun, examined, cleared, skipped })
    return {
      dry_run: dryRun,
      examined,
      cleared,
      skipped,
      ...(limit !== undefined ? { limit_reached: limitReached } : {}),
    }
  }

  /** Best-effort : une trace manquée ne défait pas le geste (l'archive en colonne est déjà écrite). */
  private async journal(workspaceId: string, contactId: string, previous: string | null): Promise<void> {
    try {
      await this.provenance?.commit({
        workspaceId,
        entityType: 'contact',
        entityId: contactId,
        source: 'pipeline',
        actorId: null,
        rule: 'placeholder_email_catchup',
        changes: [{ field: 'email', oldValue: previous, newValue: null }],
      })
    } catch (error) {
      this.logger.warn('Rattrapage des adresses gabarit : journal non écrit', { contactId, error })
    }
  }
}
