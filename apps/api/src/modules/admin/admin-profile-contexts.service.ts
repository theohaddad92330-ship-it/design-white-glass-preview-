import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ProfileContext, ProfileContextStatus } from '@bellum/contracts'
import { IsNull, Not, Repository } from 'typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import {
  detectProbabilityMention,
  type ProbabilityMention,
  type ProbabilityMentionKind,
} from '../../common/free-text-probability'

/**
 * #2231 — balayage de régénération des `profiles.profile_context` écrits
 * avant que le prompt du Profiler n'interdise la probabilité (13/09/2026,
 * `039ea2e8c`). Corriger un producteur ne corrige pas son stock.
 *
 * Règle du dépôt pour toute écriture de masse : **le compte s'affiche avant
 * d'écrire.** `audit()` lit et compte, sans jamais écrire — `regenerate()`
 * relit le MÊME compte et refuse (409) si la base a bougé entre les deux
 * appels, plutôt que de rejouer un compte périmé.
 *
 * `regenerate()` ne parle JAMAIS à `ProfileContextService.triggerGeneration`
 * directement : il passe par `EsnProfileService.regenerateProfileContext`, le
 * même appelant que le bouton « Régénérer » côté utilisateur
 * (`esn-profile.controller.ts`, `POST regenerate-context`) — idempotent, et
 * il archive une révision (on archive, on ne supprime jamais).
 */

// Non exporté : consommé uniquement ici (`ProbabilityAuditReport.samples`).
type ProbabilityAuditSample = {
  /** Chemin JSON du champ fautif dans `profile_context` (ex.
   *  `bellumPhrases.scoreContext`) — jamais un identifiant de personne. */
  readonly path: string
  readonly kind: ProbabilityMentionKind
  /** ~80 caractères autour du motif. Aucun `user_id` ni identifiant
   *  d'espace n'accompagne cet extrait. */
  readonly excerpt: string
}

export type ProbabilityAuditReport = {
  /** Le nombre de `profile_context` stockés (non nuls), tous statuts confondus. */
  readonly totalCount: number
  /** Combien, parmi eux, portent le texte interdit. */
  readonly flaggedCount: number
  readonly samples: readonly ProbabilityAuditSample[]
}

// Non exporté : consommé uniquement ici (`RegenerateResultItem.outcome`) — un
// type qui ne quitte pas son fichier ne s'exporte pas (`pnpm lint:exports:types`).
type RegenerateOutcome = 'regenere' | 'inchange' | 'echec'

// Non exporté : consommé uniquement ici (`RegenerateReport.results`).
type RegenerateResultItem = {
  readonly userId: string
  readonly outcome: RegenerateOutcome
  readonly reason: string
}

export type RegenerateReport = {
  readonly confirmCount: number
  readonly results: readonly RegenerateResultItem[]
}

type ScannedRow = {
  readonly userId: string
  readonly status: ProfileContextStatus
  readonly path: string
  readonly mention: ProbabilityMention
  readonly text: string
}

/** Descend récursivement dans n'importe quelle valeur JSON et collecte les
 *  feuilles STRING avec leur chemin — `profile_context` garde des blocs
 *  snake_case hérités (`.passthrough()`, voir `profile-context.ts`), donc on
 *  ne présuppose AUCUN nom de champ : on lit ce qui est réellement là. */
function collectStrings(value: unknown, path: string, into: { path: string; text: string }[]): void {
  if (typeof value === 'string') {
    if (value.length > 0) into.push({ path, text: value })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, into))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(child, path ? `${path}.${key}` : key, into)
    }
  }
}

/** Le premier champ fautif d'un `profile_context`, ou `null` s'il n'en porte
 *  aucun. Un seul suffit pour COMPTER le contexte comme flagged ; l'audit
 *  n'a besoin que d'UN extrait représentatif par contexte. */
function firstMention(
  profileContext: ProfileContext,
): { path: string; mention: ProbabilityMention; text: string } | null {
  const leaves: { path: string; text: string }[] = []
  collectStrings(profileContext, '', leaves)
  for (const leaf of leaves) {
    const mention = detectProbabilityMention(leaf.text)
    if (mention) return { path: leaf.path, mention, text: leaf.text }
  }
  return null
}

/** ~80 caractères autour du motif détecté, sur le texte D'ORIGINE. */
function maskedExcerpt(text: string, mention: ProbabilityMention, radius = 40): string {
  const start = Math.max(0, mention.index - radius)
  const end = Math.min(text.length, mention.index + mention.match.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

const REASON_REGENERE = 'Régénération déclenchée via triggerGeneration (idempotent, archive une révision).'
const REASON_INCHANGE =
  'Contexte déjà validé par l’utilisateur — D9 (une correction humaine gagne toujours) : la régénération automatique ne touche pas un contexte validé.'

@Injectable()
export class AdminProfileContextsService {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly esnProfile: EsnProfileService,
  ) {}

  /** Lit TOUT le stock une fois — le total ET les flagged en sortent
   *  ensemble, pour que `audit()` et `regenerate()` comptent exactement la
   *  même chose. */
  private async scan(): Promise<{ totalCount: number; flagged: ScannedRow[] }> {
    const rows = await this.profiles.find({
      where: { profile_context: Not(IsNull()) },
      select: ['user_id', 'profile_context', 'profile_context_status'],
    })
    const flagged: ScannedRow[] = []
    for (const row of rows) {
      if (!row.profile_context) continue
      const found = firstMention(row.profile_context)
      if (found) {
        flagged.push({ userId: row.user_id, status: row.profile_context_status, ...found })
      }
    }
    return { totalCount: rows.length, flagged }
  }

  /** Compte, sans jamais écrire. */
  async audit(): Promise<ProbabilityAuditReport> {
    const { totalCount, flagged } = await this.scan()
    const samples: ProbabilityAuditSample[] = flagged
      .slice(0, 3)
      .map(row => ({ path: row.path, kind: row.mention.kind, excerpt: maskedExcerpt(row.text, row.mention) }))
    return { totalCount, flaggedCount: flagged.length, samples }
  }

  /**
   * Refuse d'écrire si `confirmCount` ne correspond plus au compte ACTUEL —
   * la base a bougé entre l'audit et cet appel. Ne rejoue que les contextes
   * détectés ; un contexte validé (D9) n'est jamais touché.
   */
  async regenerate(confirmCount: number): Promise<RegenerateReport> {
    const { flagged } = await this.scan()
    if (flagged.length !== confirmCount) {
      throw new ConflictException(
        `Le compte a bougé : ${flagged.length} contexte(s) portent désormais le texte interdit ` +
          `(confirmCount=${confirmCount} attendu). Relance l'audit avant de rejouer.`,
      )
    }

    const results: RegenerateResultItem[] = []
    for (const row of flagged) {
      if (row.status === 'validated') {
        results.push({ userId: row.userId, outcome: 'inchange', reason: REASON_INCHANGE })
        continue
      }
      try {
        await this.esnProfile.regenerateProfileContext(row.userId)
        results.push({ userId: row.userId, outcome: 'regenere', reason: REASON_REGENERE })
      } catch (err) {
        results.push({
          userId: row.userId,
          outcome: 'echec',
          reason: err instanceof Error ? err.message : 'Erreur inconnue.',
        })
      }
    }
    return { confirmCount, results }
  }
}
