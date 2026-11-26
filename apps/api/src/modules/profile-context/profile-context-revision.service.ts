import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  PROFILE_CONTEXT_SCHEMA_VERSION,
  type ProfileContext,
  type ProfileContextRevision,
  type ProfileContextRevisionSummary,
} from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { DataSource, Repository } from 'typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProfileContextRevisionEntity } from '../../database/entities/profile-context-revision.entity'

type RevisionFailureCode = 'revision_not_found'

export type RevisionFailure = {
  code: RevisionFailureCode
  message: string
}

function toIso(date: Date): string {
  return date instanceof Date ? date.toISOString() : date
}

/**
 * #2010.17 — `lastValidatedVersion` vient de `profiles.last_validated_context_version`
 * (stampé au clic « Valider », survit à une régénération qui écrase la ligne
 * `profiles` en place) : `null` tant que rien n'a jamais été validé, ou pour
 * un appelant qui ne l'a pas résolu (jamais deviné par la position — #2010.6
 * ne dérive que « actuelle vs remplacée »).
 */
function toSummary(
  row: ProfileContextRevisionEntity,
  lastValidatedVersion: number | null,
): ProfileContextRevisionSummary {
  return {
    version: row.version,
    schema_version: row.schema_version,
    created_at: toIso(row.created_at),
    was_last_validated: lastValidatedVersion !== null && row.version === lastValidatedVersion,
  }
}

function toRevision(row: ProfileContextRevisionEntity, lastValidatedVersion: number | null): ProfileContextRevision {
  return { ...toSummary(row, lastValidatedVersion), profile_context: row.profile_context }
}

@Injectable()
export class ProfileContextRevisionService {
  constructor(
    @InjectRepository(ProfileContextRevisionEntity)
    private readonly revisions: Repository<ProfileContextRevisionEntity>,
    private readonly dataSource: DataSource,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
  ) {}

  /** #2010.17 — best-effort : une ligne `profiles` absente ne bloque jamais
   *  la lecture des révisions, elle dégrade juste `was_last_validated` à `false`
   *  partout (aucune donnée fabriquée). */
  private async lastValidatedVersion(userId: string): Promise<number | null> {
    const profile = await this.profiles.findOne({
      where: { user_id: userId },
      select: ['last_validated_context_version'],
    })
    return profile?.last_validated_context_version ?? null
  }

  /**
   * Persist a freshly generated context as the next revision.
   *
   * #2009.14 — `generationKey` (défaut `null`) est la clé d'idempotence
   * ({@link ProfileContextService.generationKey}) qui a PRODUIT ce contexte
   * — `null` pour un appelant qui n'a rien à offrir (voir `restore`
   * ci-dessous, qui rejoue une ancienne révision sans nouvelle génération).
   */
  async recordNewVersion(
    userId: string,
    profileContext: ProfileContext,
    generationKey: string | null = null,
  ): Promise<void> {
    await this.snapshot(userId, profileContext, PROFILE_CONTEXT_SCHEMA_VERSION, generationKey)
  }

  /**
   * #2062.1 / #2069.1 — la PROVENANCE de ce qui est stocké, et sa DATE.
   *
   * `profiles.profile_context` ne porte ni l'une ni l'autre : la colonne dit ce
   * qui a été écrit, jamais PAR QUI ni QUAND. L'instantané le plus récent les
   * porte tous les deux — `schema_version` nomme le producteur (à partir de
   * `PROFILE_CONTEXT_SOURCED_SUGGESTIONS_SCHEMA_VERSION`, les noms
   * d'entreprises sont filtrés contre la source lue) et `created_at` donne la
   * date que l'écran affiche quand un texte est retenu.
   *
   * `null` = aucun instantané lisible. Ça ne se lit jamais « c'est récent » :
   * ne pas avoir pu lire ne vaut pas preuve.
   *
   * ⚠️ `select` explicite : sans lui, TypeORM ramènerait la colonne `jsonb`
   * entière du contexte à chaque ouverture de l'écran, pour deux scalaires.
   */
  async liveSnapshotMeta(userId: string): Promise<{ schemaVersion: number; createdAt: string } | null> {
    const row = await this.revisions.findOne({
      where: { user_id: userId },
      order: { version: 'DESC' },
      select: ['version', 'schema_version', 'created_at'],
    })
    if (!row) return null
    return { schemaVersion: row.schema_version, createdAt: toIso(row.created_at) }
  }

  async list(userId: string): Promise<ProfileContextRevisionSummary[]> {
    const [rows, lastValidatedVersion] = await Promise.all([
      this.revisions.find({
        where: { user_id: userId },
        select: ['version', 'schema_version', 'created_at'],
        order: { version: 'DESC' },
      }),
      this.lastValidatedVersion(userId),
    ])
    return rows.map(row => toSummary(row, lastValidatedVersion))
  }

  async get(userId: string, version: number): Promise<Result<ProfileContextRevision, RevisionFailure>> {
    const row = await this.revisions.findOne({ where: { user_id: userId, version } })
    if (!row) return failure(this.notFound(version))
    return success(toRevision(row, await this.lastValidatedVersion(userId)))
  }

  /** Restore a past revision by re-snapshotting its content as a new revision. */
  async restore(userId: string, version: number): Promise<Result<ProfileContextRevision, RevisionFailure>> {
    const source = await this.revisions.findOne({ where: { user_id: userId, version } })
    if (!source) return failure(this.notFound(version))
    const [restored, lastValidatedVersion] = await Promise.all([
      this.snapshot(userId, source.profile_context, source.schema_version),
      this.lastValidatedVersion(userId),
    ])
    return success(toRevision(restored, lastValidatedVersion))
  }

  private notFound(version: number): RevisionFailure {
    return { code: 'revision_not_found', message: `Révision ${version} introuvable` }
  }

  private async snapshot(
    userId: string,
    profileContext: ProfileContext,
    schemaVersion: number,
    generationKey: string | null = null,
  ): Promise<ProfileContextRevisionEntity> {
    return this.dataSource.transaction(async em => {
      const profile = await em.findOne(ProfileEntity, {
        where: { user_id: userId },
        select: ['profile_context_version'],
      })
      const nextVersion = (profile?.profile_context_version ?? 0) + 1
      await em.update(
        ProfileEntity,
        { user_id: userId },
        {
          profile_context: profileContext,
          profile_context_status: 'succeeded',
          profile_context_version: nextVersion,
          profile_context_validated_at: null,
          // #2009.14 — `null` sur un `restore` (rejoue une ancienne révision,
          // aucune génération réelle derrière) : une réutilisation ne doit
          // jamais s'accrocher à une clé qui n'a rien produit elle-même.
          profile_context_generation_key: generationKey,
        },
      )
      const revision = em.create(ProfileContextRevisionEntity, {
        user_id: userId,
        version: nextVersion,
        schema_version: schemaVersion,
        profile_context: profileContext,
      })
      return em.save(revision)
    })
  }
}
