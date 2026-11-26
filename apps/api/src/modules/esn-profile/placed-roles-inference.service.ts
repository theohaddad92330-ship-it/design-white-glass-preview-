import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  type InferredPlacedRole,
  type PlacedRolesInferenceInput,
  type PlacedRolesInferenceResponse,
  foldForRoleMatch,
  inferPlacedRoles,
  parseStoredInferredPlacedRoles,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'

/** Profils recalculés par passage du rattrapage — un petit lot, jamais tout le parc. */
export const PLACED_ROLES_INFERENCE_BATCH = 50

/** Plafonds de lecture du contexte : la déduction n'a pas besoin de tout le vivier. */
const MAX_CONSULTANTS = 500
const MAX_MISSIONS = 300

/**
 * Les réponses d'onboarding lues comme CONTEXTE (texte libre et listes). Les
 * secteurs CIBLES n'y sont pas : « je vends aux banques » ne dit pas quel
 * métier l'ESN place.
 */
const CONTEXT_FIELDS = [
  'esn_name',
  'positioning',
  'expertise_areas',
  'service_types',
  'service_types_proven',
  'content_visible_expertise',
  'expertise_talent_pool',
  'expertise_client_reference',
  'expertise_personal_experience',
  'uncovered_activity_note',
  'esn_website',
] as const satisfies readonly (keyof EsnProfileEntity)[]

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(' · ')
  return ''
}

/**
 * MÉTIERS PLACÉS DÉDUITS du contexte de l'espace — décision Louis 11/10/2026.
 *
 * Lit TOUT le contexte (onboarding, portefeuille, vivier, missions gagnées),
 * appelle `inferPlacedRoles` (contracts, la seule définition) et écrit le
 * résultat À CÔTÉ du déclaré (`esn_profiles.inferred_placed_roles`). Jamais
 * `placed_roles` : seule une correction humaine l'écrit.
 *
 * Recalcul :
 *  - à chaque enregistrement du profil (`EsnProfileService.upsertAnswers`) ;
 *  - à la lecture de l'écran quand le vivier ou les missions ont bougé depuis
 *    (import de CV, mission gagnée) — {@link getForUser} ;
 *  - par le rattrapage de nuit, CIBLÉ : profils sans métier déclaré et jamais
 *    déduits ou dont le contexte a bougé, par lot ({@link sweep}). Aucune
 *    collecte n'est rejouée — seule la déduction tourne.
 */
@Injectable()
export class PlacedRolesInferenceService {
  private readonly logger = new Logger(PlacedRolesInferenceService.name)

  constructor(
    @InjectRepository(EsnProfileEntity)
    private readonly esnProfiles: Repository<EsnProfileEntity>,
    private readonly resolver: EsnProfileWorkspaceResolver,
  ) {}

  /** La ligne qui porte le profil d'ENTREPRISE de l'utilisateur — la même que `resolveProfileData`. */
  private async rowFor(userId: string): Promise<{ row: EsnProfileEntity | null; workspaceId: string | null }> {
    const context = await this.resolver.resolveContext(userId)
    return { row: context.canonicalRow ?? context.ownRow, workspaceId: context.workspaceId }
  }

  /** Recalcule et écrit la déduction de l'utilisateur. `null` sans profil. */
  async recompute(userId: string): Promise<InferredPlacedRole[] | null> {
    const { row, workspaceId } = await this.rowFor(userId)
    if (!row) return null
    return this.recomputeRow(row, workspaceId)
  }

  /** Best-effort : un échec de déduction ne fait jamais échouer l'appelant. */
  async recomputeQuietly(userId: string): Promise<void> {
    try {
      await this.recompute(userId)
    } catch (error) {
      this.logger.warn('Déduction des métiers placés en échec — le profil enregistré reste intact', { error })
    }
  }

  private async recomputeRow(row: EsnProfileEntity, workspaceId: string | null): Promise<InferredPlacedRole[]> {
    const input = await this.gatherInput(row, workspaceId ?? row.workspace_id)
    const roles = inferPlacedRoles(input)
    await this.esnProfiles.manager.query(
      `UPDATE esn_profiles SET inferred_placed_roles = $1::jsonb, inferred_placed_roles_at = now() WHERE id = $2`,
      [JSON.stringify(roles), row.id],
    )
    row.inferred_placed_roles = roles
    row.inferred_placed_roles_at = new Date()
    return roles
  }

  private async gatherInput(row: EsnProfileEntity, workspaceId: string | null): Promise<PlacedRolesInferenceInput> {
    const texts = CONTEXT_FIELDS.map(field => ({ field, text: toText(row[field]) })).filter(t => t.text.trim())
    const [consultants, missions] = await Promise.all([
      this.esnProfiles.manager
        .query<
          { title: string | null; stack: string[] | null }[]
        >(`SELECT title, stack FROM consultants WHERE archived_at IS NULL AND (($1::uuid IS NOT NULL AND workspace_id = $1) OR user_id = $2) ORDER BY updated_at DESC LIMIT ${MAX_CONSULTANTS}`, [workspaceId, row.user_id])
        .catch(() => []),
      this.esnProfiles.manager
        .query<
          { role_title: string | null; label: string | null }[]
        >(`SELECT role_title, label FROM missions WHERE status NOT IN ('draft', 'cancelled') AND (($1::uuid IS NOT NULL AND workspace_id = $1) OR user_id = $2) ORDER BY updated_at DESC LIMIT ${MAX_MISSIONS}`, [workspaceId, row.user_id])
        .catch(() => []),
    ])
    return {
      texts,
      offerDomain: row.offer_domain ?? null,
      offerDomains: Array.isArray(row.offer_domains) ? row.offer_domains : [],
      consultants: (consultants ?? []).map(c => ({ title: c.title, skills: Array.isArray(c.stack) ? c.stack : [] })),
      missions: (missions ?? []).map(m => ({ title: m.role_title, label: m.label })),
    }
  }

  /** Le vivier ou les missions ont-ils bougé depuis la dernière déduction ? */
  private async contextMovedSince(row: EsnProfileEntity, workspaceId: string | null, since: Date): Promise<boolean> {
    const rows = await this.esnProfiles.manager
      .query<{ moved: boolean }[]>(
        `SELECT (EXISTS (SELECT 1 FROM consultants WHERE (($1::uuid IS NOT NULL AND workspace_id = $1) OR user_id = $2) AND updated_at > $3)
              OR EXISTS (SELECT 1 FROM missions WHERE (($1::uuid IS NOT NULL AND workspace_id = $1) OR user_id = $2) AND updated_at > $3)) AS moved`,
        [workspaceId, row.user_id, since],
      )
      .catch(() => [])
    return rows?.[0]?.moved === true
  }

  /** L'écran « Mon profil » : les déduits proposés, avec leurs indices. */
  async getForUser(userId: string): Promise<PlacedRolesInferenceResponse> {
    const { row, workspaceId } = await this.rowFor(userId)
    if (!row) return { roles: [], declared: false, needsQuestion: true, computedAt: null }
    const at = row.inferred_placed_roles_at
    if (!at || at < row.updated_at || (await this.contextMovedSince(row, workspaceId, at))) {
      await this.recomputeRow(row, workspaceId).catch(error => {
        this.logger.warn('Déduction des métiers placés en échec à la lecture — dernière déduction servie', { error })
      })
    }
    return toResponse(row)
  }

  /** « Retirer » : une correction humaine, jamais ramenée par un recalcul. */
  async dismiss(userId: string, role: string): Promise<PlacedRolesInferenceResponse> {
    const { row } = await this.rowFor(userId)
    const clean = role.trim()
    if (!row || !clean) return this.getForUser(userId)
    if (!(row.dismissed_inferred_roles ?? []).some(r => foldForRoleMatch(r) === foldForRoleMatch(clean))) {
      await this.esnProfiles.manager.query(
        `UPDATE esn_profiles SET dismissed_inferred_roles = array_append(dismissed_inferred_roles, $1::text) WHERE id = $2`,
        [clean, row.id],
      )
      row.dismissed_inferred_roles = [...(row.dismissed_inferred_roles ?? []), clean]
    }
    return toResponse(row)
  }

  /**
   * Le RATTRAPAGE CIBLÉ (doctrine « un correctif de collecte rattrape
   * l'existant ») : profils d'entreprise courants SANS métier déclaré, jamais
   * déduits ou dont le contexte a bougé depuis. Par lot ; le reste au passage
   * suivant. Rend le nombre de profils recalculés.
   */
  async sweep(batch = PLACED_ROLES_INFERENCE_BATCH): Promise<number> {
    const rows = await this.esnProfiles.manager.query<{ id: string }[]>(
      `SELECT p.id FROM esn_profiles p
        WHERE p.is_current = true
          AND (p.is_workspace_canonical = true OR p.workspace_id IS NULL)
          AND cardinality(p.placed_roles) = 0
          AND (p.inferred_placed_roles_at IS NULL
               OR p.inferred_placed_roles_at < p.updated_at
               OR EXISTS (SELECT 1 FROM consultants c WHERE ((p.workspace_id IS NOT NULL AND c.workspace_id = p.workspace_id) OR c.user_id = p.user_id) AND c.updated_at > p.inferred_placed_roles_at)
               OR EXISTS (SELECT 1 FROM missions m WHERE ((p.workspace_id IS NOT NULL AND m.workspace_id = p.workspace_id) OR m.user_id = p.user_id) AND m.updated_at > p.inferred_placed_roles_at))
        ORDER BY p.inferred_placed_roles_at NULLS FIRST
        LIMIT $1`,
      [batch],
    )
    let done = 0
    for (const { id } of rows ?? []) {
      const row = await this.esnProfiles.findOne({ where: { id } })
      if (!row) continue
      try {
        await this.recomputeRow(row, row.workspace_id)
        done += 1
      } catch (error) {
        this.logger.warn(`Déduction des métiers placés en échec pour un profil — repris au passage suivant`, { error })
      }
    }
    return done
  }
}

function toResponse(row: EsnProfileEntity): PlacedRolesInferenceResponse {
  const declaredRoles = (row.placed_roles ?? []).filter(r => r.trim())
  const hidden = new Set([...declaredRoles, ...(row.dismissed_inferred_roles ?? [])].map(foldForRoleMatch))
  const roles = parseStoredInferredPlacedRoles(row.inferred_placed_roles)
    .filter(r => !hidden.has(foldForRoleMatch(r.role)))
    .map(r => ({ role: r.role, terms: r.terms, evidence: r.evidence, evidenceCount: r.evidenceCount }))
  const declared = declaredRoles.length > 0
  return {
    roles,
    declared,
    needsQuestion: !declared && roles.length === 0,
    computedAt: row.inferred_placed_roles_at ? new Date(row.inferred_placed_roles_at).toISOString() : null,
  }
}
