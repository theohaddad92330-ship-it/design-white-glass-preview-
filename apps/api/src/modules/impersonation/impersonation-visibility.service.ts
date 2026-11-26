import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ImpersonationAuditEntity } from '../../database/entities/impersonation-audit.entity'

/**
 * Ce que le CLIENT a le droit de savoir quand quelqu'un de chez nous est chez lui.
 *
 * #1670.2, et l'issue le pose comme non négociable : « Une console qui permet de
 * lire les données d'un client sans qu'il le sache est un problème de conformité
 * ET de confiance. Le jour où un client le découvre autrement, c'est fini. »
 *
 * ⚠️ NE PAS CONFONDRE AVEC LE BANDEAU EXISTANT. `ImpersonationBanner` dit
 * « Tu incarnes … » : il s'adresse à l'OPÉRATEUR, dans SA session. Celui-ci
 * s'adresse aux MEMBRES RÉELS de l'espace, dans la leur. Deux publics, deux
 * bandeaux — la ressemblance des noms a failli faire classer #1670.2 « déjà
 * livré ».
 *
 * CE QUI SORT, ET CE QUI NE SORT PAS
 * Le fait, et deux dates. **Jamais QUI est incarné** : dire « quelqu'un est
 * connecté en tant que Sarah » à toute l'équipe de Sarah crée un problème que
 * l'issue ne demande pas de créer. Jamais non plus le nom de l'opérateur — le
 * client n'a pas à connaître nos identités internes, et le libellé de l'issue
 * dit « un membre de l'équipe BellumAI », pas un nom.
 */
export type ImpersonationVisibility = {
  /** Une session d'incarnation est-elle en cours sur mon espace, maintenant ? */
  active: boolean
  /** Depuis quand. `null` quand `active` est faux — jamais une date inventée. */
  since: string | null
  /** Jusqu'à quand le jeton reste valide. `null` quand `active` est faux. */
  until: string | null
}

@Injectable()
export class ImpersonationVisibilityService {
  constructor(
    @InjectRepository(ImpersonationAuditEntity)
    private readonly audit: Repository<ImpersonationAuditEntity>,
  ) {}

  /**
   * Y a-t-il une incarnation EN COURS sur un membre d'un de mes espaces ?
   *
   * « En cours » = une ligne `start` dont le jeton n'a pas expiré ET pour
   * laquelle aucune ligne `stop` ne porte le même `jti`. Les deux conditions
   * comptent : l'expiration seule laisserait un bandeau allumé 15 minutes après
   * une sortie explicite, et le `stop` seul laisserait un bandeau allumé pour
   * toujours si l'opérateur ferme simplement son onglet.
   */
  async forUser(userId: string): Promise<ImpersonationVisibility> {
    const row = await this.audit
      .createQueryBuilder('a')
      .select(['a.created_at AS since', 'a.expires_at AS until'])
      .where('a.action = :start', { start: 'start' })
      .andWhere('a.expires_at IS NOT NULL')
      .andWhere('a.expires_at > now()')
      // Les membres de mes espaces — moi compris.
      .andWhere(
        `a.target_user_id IN (
           SELECT autre.user_id FROM workspace_members autre
           WHERE autre.workspace_id IN (
             SELECT moi.workspace_id FROM workspace_members moi WHERE moi.user_id = :userId
           )
         )`,
        { userId },
      )
      .andWhere(
        `NOT EXISTS (
           SELECT 1 FROM impersonation_audit fin
           WHERE fin.jti = a.jti AND fin.action = 'stop'
         )`,
      )
      .orderBy('a.created_at', 'DESC')
      .limit(1)
      .getRawOne<{ since: Date | string | null; until: Date | string | null }>()

    if (!row) return { active: false, since: null, until: null }
    return { active: true, since: iso(row.since), until: iso(row.until) }
  }
}

/** ⚠️ Une colonne `timestamptz` lue en SQL brut rend un `Date`, pas une chaîne. */
function iso(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
