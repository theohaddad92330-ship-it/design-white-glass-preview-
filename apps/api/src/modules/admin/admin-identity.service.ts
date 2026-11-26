import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { findIdentityDuplicates, type DuplicatePair, type IdentityCandidate } from './identity-duplicates'

/** Ce qu'une fusion a réellement déplacé. Chaque nombre est compté APRÈS
 *  l'écriture, pas estimé avant — un rapport de fusion qui annonce ce qu'il
 *  comptait faire ne sert à personne quand quelque chose a échoué. */
export type IdentityMergeResult = {
  keepUserId: string
  absorbUserId: string
  movedAccounts: number
  movedContacts: number
  membershipAdded: boolean
  /** Le compte absorbé n'est JAMAIS supprimé ici — voir {@link mergeIdentities}. */
  absorbedAccountDeleted: false
}

/**
 * Doublons d'identité : les VOIR, puis les résoudre (IDENT-01, audit du 17/08).
 *
 * Deux comptes pour une même personne fragmentent son portefeuille en deux
 * moitiés dont aucune n'est complète. Le support le découvrait en cherchant
 * pourquoi quelqu'un « ne retrouvait pas ses dossiers ».
 *
 * **Ce que la fusion fait, et surtout ce qu'elle ne fait pas.** Elle rattache
 * l'espace du compte gardé au compte absorbé et y déplace ses dossiers. Elle ne
 * supprime AUCUN compte d'authentification, et c'est délibéré : supprimer est
 * irréversible, l'opérateur dispose déjà de `DELETE /internal/admin/users/:id`
 * pour le faire en connaissance de cause, et enchaîner les deux gestes
 * automatiquement transformerait une erreur de rapprochement en perte de données.
 * Après fusion, le compte absorbé est vide et inoffensif ; il se supprime ensuite,
 * ou pas.
 */
@Injectable()
export class AdminIdentityService {
  private readonly logger = new Logger(AdminIdentityService.name)

  constructor(
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity) private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Les paires suspectes de toute la base, les plus sûres d'abord.
   *
   * Lecture seule et bornée : un balayage de tous les profils reste modeste à
   * l'échelle où cette question se pose (quelques milliers de comptes), et le
   * détecteur est quadratique — au-delà, on filtrerait par bucket d'adresse
   * plutôt que de laisser l'endpoint devenir le point lent du back-office.
   */
  async findDuplicates(options?: { minConfidence?: number; limit?: number }): Promise<{
    pairs: DuplicatePair[]
    scanned: number
  }> {
    const profiles = await this.profiles.find()
    const candidates = await Promise.all(profiles.map(profile => this.toCandidate(profile)))
    const pairs = findIdentityDuplicates(candidates, { minConfidence: options?.minConfidence })
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
    return { pairs: pairs.slice(0, limit), scanned: candidates.length }
  }

  private async toCandidate(profile: ProfileEntity): Promise<IdentityCandidate> {
    const [workspaceIds, accountCount] = await Promise.all([
      this.members
        .find({ where: { user_id: profile.user_id }, select: { workspace_id: true } })
        .then(rows => rows.map(row => row.workspace_id)),
      this.accounts.count({ where: { user_id: profile.user_id } }),
    ])
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || null
    return {
      userId: profile.user_id,
      email: profile.email ?? null,
      fullName,
      workspaceIds,
      accountCount,
      createdAt: profile.created_at ? new Date(profile.created_at).toISOString() : null,
    }
  }

  /**
   * Rattache le compte absorbé à l'espace du compte gardé et y déplace ses
   * dossiers.
   *
   * L'opérateur DÉSIGNE les deux comptes : la détection propose, elle ne choisit
   * pas. Trois refus, chacun pour un accident précis :
   *  - fusionner un compte avec lui-même ;
   *  - un compte inconnu (profil absent) — on ne déplace rien vers un identifiant
   *    qu'on n'a pas vérifié ;
   *  - un compte gardé qui n'appartient à aucun espace : il n'y aurait pas de
   *    destination, et les dossiers se retrouveraient orphelins.
   *
   * Tout se joue dans UNE transaction : une fusion à moitié faite laisserait des
   * dossiers dans un espace et leurs contacts dans un autre, ce qui est pire que
   * les deux comptes séparés du départ.
   */
  async mergeIdentities(keepUserId: string, absorbUserId: string): Promise<IdentityMergeResult> {
    if (keepUserId === absorbUserId) {
      throw new BadRequestException('Les deux identifiants sont identiques — rien à fusionner.')
    }
    const [keep, absorb] = await Promise.all([
      this.profiles.findOne({ where: { user_id: keepUserId } }),
      this.profiles.findOne({ where: { user_id: absorbUserId } }),
    ])
    if (!keep) throw new NotFoundException(`Compte à garder introuvable : ${keepUserId}`)
    if (!absorb) throw new NotFoundException(`Compte à absorber introuvable : ${absorbUserId}`)

    const target = await this.resolveTargetWorkspace(keepUserId)
    if (!target) {
      throw new BadRequestException(
        `Le compte à garder (${keepUserId}) n’appartient à aucun espace de travail — aucune destination pour ses dossiers.`,
      )
    }

    return this.dataSource.transaction(async manager => {
      // 1. Le compte absorbé devient membre de l'espace cible s'il ne l'est pas
      //    déjà. Rôle `member` et non `owner` : une fusion ne donne pas les clés
      //    de la facturation à un compte dont on vient de dire qu'il est en trop.
      const existing = await manager.getRepository(WorkspaceMemberEntity).findOne({
        where: { user_id: absorbUserId, workspace_id: target },
      })
      let membershipAdded = false
      if (!existing) {
        await manager
          .getRepository(WorkspaceMemberEntity)
          .insert({ user_id: absorbUserId, workspace_id: target, role: 'member' })
        membershipAdded = true
      }

      // 2. Les dossiers du compte absorbé rejoignent l'espace cible. Le
      //    `user_id` d'origine est CONSERVÉ : c'est la trace de qui a lancé
      //    l'analyse, et la réécrire effacerait l'historique qu'on cherche
      //    justement à réunir.
      const movedAccounts = await manager
        .getRepository(AccountEntity)
        .createQueryBuilder()
        .update(AccountEntity)
        .set({ workspace_id: target })
        .where('user_id = :absorbUserId AND workspace_id <> :target', { absorbUserId, target })
        .execute()

      const movedContacts = await manager
        .getRepository(ContactEntity)
        .createQueryBuilder()
        .update(ContactEntity)
        .set({ workspace_id: target })
        .where('user_id = :absorbUserId AND workspace_id <> :target', { absorbUserId, target })
        .execute()

      this.logger.log('Identity merge applied', {
        contexts: {
          merge: {
            keepUserId,
            absorbUserId,
            workspaceId: target,
            movedAccounts: movedAccounts.affected ?? 0,
            movedContacts: movedContacts.affected ?? 0,
          },
        },
      })

      return {
        keepUserId,
        absorbUserId,
        movedAccounts: movedAccounts.affected ?? 0,
        movedContacts: movedContacts.affected ?? 0,
        membershipAdded,
        absorbedAccountDeleted: false as const,
      }
    })
  }

  /** L'espace du compte gardé : celui qu'il POSSÈDE, sinon son adhésion la plus
   *  ancienne — le même ordre que `WorkspaceContextService`, pour que la fusion
   *  vise l'espace que l'utilisateur voit réellement en se connectant. */
  private async resolveTargetWorkspace(userId: string): Promise<string | null> {
    const owned = await this.workspaces.findOne({ where: { owner_user_id: userId } })
    if (owned) return owned.id
    const membership = await this.members.findOne({
      where: { user_id: userId },
      order: { created_at: 'ASC' },
    })
    return membership?.workspace_id ?? null
  }
}
