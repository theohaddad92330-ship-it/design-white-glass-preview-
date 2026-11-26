import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NeedProposalEntity } from '../../database/entities/need-proposal.entity'
import { firstReturnedRow } from '../../database/returned-rows'

/** Ce qu'une offre détectée fournit, avant toute décision humaine. */
interface DetectedNeed {
  title: string
  skills?: string[]
  location?: string | null
  sourceUrl?: string | null
  detectedAt?: string | null
  raw?: Record<string, unknown>
}

/**
 * LES BESOINS PROPOSÉS PAR L'ANALYSE (PDF 4, point d'entrée 5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne crée aucun besoin. Il enregistre ce que l'analyse a VU, et attend.
 *
 * Le chantier du PDF 4 avait refusé ce point d'entrée pour deux raisons, et
 * elles tiennent toujours : le pipeline n'a pas à écrire dans `project_needs`,
 * et un pipe qui se remplit tout seul de besoins non validés devient
 * inutilisable en une semaine. La table de propositions les résout sans les
 * contourner — le besoin naît toujours d'un geste.
 */
@Injectable()
export class NeedProposalsService {
  private readonly logger = new Logger(NeedProposalsService.name)

  constructor(
    @InjectRepository(NeedProposalEntity)
    private readonly proposals: Repository<NeedProposalEntity>,
  ) {}

  /**
   * Enregistre ce qu'un run a détecté. Idempotent par (compte, URL de l'offre).
   *
   * Best-effort par construction : une proposition qui échoue ne doit jamais
   * faire tomber une analyse terminée. Le dossier vaut infiniment plus que la
   * suggestion qui l'accompagne.
   *
   * Une offre SANS titre est ignorée : proposer « (sans titre) » à qualifier
   * demande à l'utilisateur d'aller lire la source pour comprendre, ce qui est
   * exactement le travail qu'on prétendait lui épargner.
   */
  async record(workspaceId: string, accountId: string, detected: readonly DetectedNeed[]): Promise<number> {
    let written = 0
    for (const need of detected) {
      const title = need.title?.trim()
      if (!title) continue
      try {
        const rows = await this.proposals.manager.query(
          `INSERT INTO need_proposals
             (workspace_id, account_id, title, skills, location, source, source_url, detected_at, raw)
           VALUES ($1, $2, $3, $4::text[], $5, 'job_ad', $6, $7::timestamptz, $8::jsonb)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            workspaceId,
            accountId,
            title,
            need.skills ?? [],
            need.location ?? null,
            need.sourceUrl ?? null,
            need.detectedAt ?? null,
            JSON.stringify(need.raw ?? {}),
          ],
        )
        if (firstReturnedRow(rows)) written += 1
      } catch (error) {
        this.logger.warn(`Proposition de besoin non enregistrée: ${String(error)}`)
      }
    }
    return written
  }

  /**
   * Les propositions EN ATTENTE d'un espace, les plus récentes d'abord.
   *
   * #2647.1 — `accountId` CLOISONNE la lecture à un seul compte : sans lui,
   * deux comptes du même espace partageaient la même liste — la section
   * « Besoins » du dossier montrerait les propositions d'un AUTRE compte.
   * Absent (la vue transverse `GET needs/proposals`), le comportement ne
   * change pas : tout l'espace, comme avant.
   */
  async pending(workspaceId: string, accountId?: string, limit = 50): Promise<NeedProposalEntity[]> {
    return this.proposals.find({
      where: {
        workspace_id: workspaceId,
        status: 'pending',
        ...(accountId ? { account_id: accountId } : {}),
      },
      order: { created_at: 'DESC' },
      take: limit,
    })
  }

  /**
   * Écarte une proposition, AVEC son motif.
   *
   * Le motif est obligatoire pour la même raison qu'ailleurs dans le produit :
   * sans lui, on ne saura pas dans six mois si l'offre ne correspondait pas au
   * métier de l'ESN ou si elle était simplement trop ancienne — deux
   * apprentissages différents, et un seul silence.
   */
  async dismiss(workspaceId: string, id: string, userId: string, reason: string): Promise<NeedProposalEntity> {
    const trimmed = reason.trim()
    if (!trimmed) throw new BadRequestException('Un motif est obligatoire pour écarter une proposition.')
    const rows = await this.proposals.manager.query(
      `UPDATE need_proposals
          SET status = 'dismissed', dismissed_reason = $4, decided_at = now(), decided_by = $3, updated_at = now()
        WHERE id = $2 AND workspace_id = $1 AND status = 'pending'
      RETURNING *`,
      [workspaceId, id, userId, trimmed],
    )
    const updated = firstReturnedRow<NeedProposalEntity>(rows)
    // « Déjà décidée » et « inexistante » se répondent pareil ici : dans les
    // deux cas il n'y a rien à écarter, et distinguer obligerait à révéler
    // l'existence d'une ligne d'un autre espace.
    if (!updated) throw new NotFoundException('Proposition introuvable ou déjà traitée.')
    return updated
  }

  /**
   * Marque une proposition ACCEPTÉE et retient le besoin qu'elle a produit.
   *
   * Le besoin lui-même est créé par le module qui le possède : ce service ne
   * fait que refermer la boucle. Garder l'identifiant est ce qui permet, plus
   * tard, de savoir quelle part du pipe vient d'une détection — sans lui, la
   * question « est-ce que cette source sert à quelque chose ? » n'a pas de
   * réponse.
   */
  async markAccepted(workspaceId: string, id: string, userId: string, needId: string): Promise<void> {
    await this.proposals.manager.query(
      `UPDATE need_proposals
          SET status = 'accepted', created_need_id = $4, decided_at = now(), decided_by = $3, updated_at = now()
        WHERE id = $2 AND workspace_id = $1`,
      [workspaceId, id, userId, needId],
    )
  }

  /** Une proposition en attente, ou `null`. */
  async findPending(workspaceId: string, id: string): Promise<NeedProposalEntity | null> {
    if (!id) return null // TypeORM IGNORE une condition `undefined` et rendrait la première ligne
    return this.proposals.findOne({ where: { id, workspace_id: workspaceId, status: 'pending' } })
  }
}
