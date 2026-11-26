import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { hasPermission, type NotificationItem, type WorkspaceRole } from '@bellum/contracts'
import { AccountEntity } from '../../../database/entities/account.entity'

/**
 * #4158.18 — LES ENTRÉES DE LA BOÎTE QUI NE SE STOCKENT PAS.
 *
 * « N collègues attendent que tu décrives l'ESN » est un ÉTAT, pas un
 * événement : il est vrai tant que l'espace n'a pas de fiche entreprise
 * canonique et qu'au moins un membre a fini son onboarding perso, et il cesse
 * de l'être dès que l'admin décrit l'ESN. Le stocker obligerait à le retirer au
 * bon moment (et le jour où on l'oublie, il ment) ; le CALCULER à la lecture ne
 * peut pas être périmé. Il n'est donc jamais « lu » : il disparaît quand sa
 * cause disparaît.
 *
 * Lecture seule, sans toucher `esn-profile.service.ts` (autre lot) : la donnée
 * vient du dépôt (`esn_profiles`, `user_onboarding_transitions`), bornée à
 * l'espace ACTIF de l'appelant.
 */
@Injectable()
export class TeamInboxDerivedService {
  private readonly logger = new Logger(TeamInboxDerivedService.name)

  // Le dépôt de `AccountEntity` ne sert que de poignée vers le gestionnaire SQL
  // (même habitude que `TeamCommentsService`) : aucune table neuve à lire.
  constructor(@InjectRepository(AccountEntity) private readonly repo: Repository<AccountEntity>) {}

  async entriesFor(userId: string, workspaceId: string, role: WorkspaceRole): Promise<NotificationItem[]> {
    if (!hasPermission(role, 'team:manage')) return []
    try {
      const canonical = await this.repo.manager.query<unknown[]>(
        `SELECT 1 AS ok FROM esn_profiles
          WHERE workspace_id = $1 AND is_workspace_canonical = true AND is_current = true
          LIMIT 1`,
        [workspaceId],
      )
      if (canonical.length > 0) return []

      const rows = await this.repo.manager.query<{ count: string }[]>(
        `SELECT COUNT(DISTINCT m.user_id)::text AS count
           FROM workspace_members m
           JOIN user_onboarding_transitions t ON t.user_id = m.user_id AND t.to_status = 'completed'
          WHERE m.workspace_id = $1 AND m.user_id <> $2`,
        [workspaceId, userId],
      )
      const waiting = Number(rows[0]?.count ?? 0)
      // Zéro n'est PAS une ligne « 0 collègue attend » : une absence ne fait aucune ligne.
      if (!Number.isFinite(waiting) || waiting < 1) return []

      return [
        {
          id: `derived:esn_description_pending:${workspaceId}`,
          type: 'esn_description_pending',
          title:
            waiting === 1
              ? "1 collègue attend que tu décrives l'ESN"
              : `${waiting} collègues attendent que tu décrives l'ESN`,
          body: "Ils ont fini leur onboarding : ils n'écrivent rien sur l'entreprise tant que tu ne l'as pas décrite.",
          link: '/settings/profile',
          read_at: null,
          created_at: new Date().toISOString(),
          level: null,
          source: null,
          source_url: null,
          source_kind: null,
          actor_name: null,
          derived: true,
        },
      ]
    } catch (error) {
      this.logger.warn('Entrée dérivée « ESN à décrire » non calculée (la boîte reste lisible)', {
        error: { name: error instanceof Error ? error.name : typeof error },
      })
      return []
    }
  }
}
