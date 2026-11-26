import { createHash } from 'node:crypto'
import { Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RexEntryEntity } from '../../database/entities/rex-entry.entity'

type InternalRexRow = {
  id: string
  workspaceId: string
  missionId: string
  missionLabel: string | null
  collectedAt: string
  /** `null` = aucun auteur connu : NULL en base, ou un id sans profil. */
  collectedBy: { userId: string; firstName: string | null; lastName: string | null; email: string | null } | null
  /** Combien d'AUTRES REX du même espace portent le même texte (0 = unique). */
  identicalTextCount: number
}

/** Plafond de lecture : un diagnostic, pas un export. */
const MAX_ROWS = 500

/** Normalise avant empreinte : casse et espaces ne font pas un texte « différent ». */
function norm(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * #3544.4 — l'empreinte d'un REX : summary + what_worked + what_failed. C'est
 * ce triplet que le formulaire saisit (RexForm) ; deux REX d'un même espace qui
 * le partagent sont soit un copier-coller, soit une insertion hors application.
 */
export function rexTextFingerprint(row: Pick<RexEntryEntity, 'summary' | 'what_worked' | 'what_failed'>): string {
  return createHash('sha256')
    .update([norm(row.summary), norm(row.what_worked), norm(row.what_failed)].join('\u0000'))
    .digest('hex')
}

/**
 * #3544.4 — DIAGNOSTIC EN LECTURE SEULE des REX (`rex_entries`), consultable
 * dans le DM : pour chaque REX, sa mission, sa date de collecte, son auteur
 * (ou l'absence d'auteur) et le nombre d'autres REX du même espace au texte
 * identique. Aucune écriture, aucune donnée corrigée : la lecture dit, l'humain
 * décide. Derrière `InternalSecretGuard`, cross-tenant ; l'appelant DM
 * journalise la lecture (même précédent que `chat.turn_replay_read`).
 */
@Controller('internal/rex-entries')
@UseGuards(InternalSecretGuard)
export class InternalRexController {
  constructor(
    @InjectRepository(RexEntryEntity) private readonly rex: Repository<RexEntryEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
  ) {}

  @Get()
  async list(
    @Query('workspaceId', new ParseUUIDPipe({ optional: true })) workspaceId?: string,
  ): Promise<InternalRexRow[]> {
    const rows = await this.rex.find({
      where: workspaceId ? { workspace_id: workspaceId } : {},
      order: { collected_at: 'DESC' },
      take: MAX_ROWS,
    })
    if (rows.length === 0) return []

    const counts = new Map<string, number>()
    const keyOf = (r: RexEntryEntity) => `${r.workspace_id}:${rexTextFingerprint(r)}`
    for (const r of rows) counts.set(keyOf(r), (counts.get(keyOf(r)) ?? 0) + 1)

    const missionIds = [...new Set(rows.map(r => r.mission_id))]
    const authorIds = [...new Set(rows.map(r => r.collected_by).filter((id): id is string => !!id))]
    const [missions, profiles] = await Promise.all([
      this.missions.find({ where: { id: In(missionIds) } }),
      authorIds.length ? this.profiles.find({ where: { user_id: In(authorIds) } }) : Promise.resolve([]),
    ])
    const labels = new Map(missions.map(m => [m.id, m.label ?? null]))
    const authors = new Map(profiles.map(p => [p.user_id, p]))

    return rows.map(r => {
      const author = r.collected_by ? authors.get(r.collected_by) : undefined
      return {
        id: r.id,
        workspaceId: r.workspace_id,
        missionId: r.mission_id,
        missionLabel: labels.get(r.mission_id) ?? null,
        collectedAt: r.collected_at.toISOString(),
        collectedBy:
          r.collected_by && author
            ? {
                userId: r.collected_by,
                firstName: author.first_name,
                lastName: author.last_name,
                email: author.email,
              }
            : null,
        identicalTextCount: (counts.get(keyOf(r)) ?? 1) - 1,
      }
    })
  }
}
