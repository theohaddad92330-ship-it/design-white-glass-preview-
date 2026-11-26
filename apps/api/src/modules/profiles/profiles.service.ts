import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { UpdateProfile, UserProfile } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { Repository } from 'typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SupabaseAuthGateway } from '../auth/supabase-auth.gateway'
import { EsnProfileService } from '../esn-profile/esn-profile.service'

type ProfileFailureCode = 'profile_not_found' | 'upsert_failed' | 'delete_failed'

export type ProfileFailure = {
  code: ProfileFailureCode
  message: string
  cause?: unknown
}

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly esnProfile: EsnProfileService,
    private readonly authGateway: SupabaseAuthGateway,
  ) {}

  async getMe(userId: string): Promise<Result<UserProfile, ProfileFailure>> {
    try {
      let row = await this.profiles.findOne({
        where: { user_id: userId },
        select: [
          'id',
          'user_id',
          'email',
          'first_name',
          'last_name',
          'avatar_url',
          // Le fuseau est RENDU (décision Louis, 14/09/2026) : sans lui dans la
          // réponse, l'écran de Réglages ne pourrait pas distinguer « inconnu »
          // de « pas encore chargé », et il écraserait le choix de la personne
          // par la détection du navigateur à chaque ouverture.
          'timezone',
          'created_at',
          'updated_at',
        ],
      })
      if (!row) {
        row = await this.profiles.save(this.profiles.create({ user_id: userId }))
      }
      const authUser = await this.authGateway.findUserById(userId)
      const profile: UserProfile = {
        id: row.id,
        user_id: row.user_id,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        avatar_url: row.avatar_url,
        timezone: row.timezone ?? null,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
        auth_created_at: authUser?.created_at ?? null,
        auth_last_sign_in_at: authUser?.last_sign_in_at ?? null,
      }
      return success(profile)
    } catch (cause) {
      return failure({ code: 'upsert_failed', message: 'Impossible de créer le profil', cause })
    }
  }

  async upsertMe(userId: string, update: UpdateProfile): Promise<Result<ProfileEntity, ProfileFailure>> {
    try {
      const existing = await this.profiles.findOne({ where: { user_id: userId } })
      const firstNameChanged = update.first_name !== undefined && update.first_name !== existing?.first_name
      const merged = this.profiles.merge(existing ?? this.profiles.create({ user_id: userId }), update)
      const saved = await this.profiles.save(merged)
      if (firstNameChanged) {
        void this.esnProfile.regenerateProfileContext(userId).catch(() => {})
      }
      return success(saved)
    } catch (cause) {
      return failure({ code: 'upsert_failed', message: 'Impossible de sauvegarder le profil', cause })
    }
  }

  async deleteMe(userId: string): Promise<Result<undefined, ProfileFailure>> {
    try {
      await this.profiles.delete({ user_id: userId })
      return success()
    } catch (cause) {
      return failure({ code: 'delete_failed', message: 'Impossible de supprimer le profil', cause })
    }
  }
}
