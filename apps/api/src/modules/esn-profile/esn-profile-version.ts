import type { EsnAnswers } from '@bellum/contracts'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'

/**
 * #2306.24 — les réponses dont un changement REND PÉRIMÉE une analyse déjà
 * faite : secteurs visés / refusés / de référence / prioritaires, et offres
 * (domaines, portefeuille, types de service, pitch). Tout le reste (nom,
 * effectif, personnel…) ne bouge pas la version — « seulement si ces champs
 * changent ».
 */
const VERSIONED_KEYS = [
  'target_sectors',
  'no_go_sectors',
  'reference_sectors',
  'priority_sectors',
  'offer_domain',
  'offer_domains',
  'offer_portfolio',
  'service_types',
  'service_types_proven',
  'service_types_desired',
  'offer_pitch',
] as const

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Vrai si `answers` change au moins un champ secteurs/offres par rapport à `before`. */
export function touchesVersionedFields(answers: Partial<EsnAnswers>, before: Partial<EsnAnswers>): boolean {
  const incoming = answers as Record<string, unknown>
  const previous = before as Record<string, unknown>
  return VERSIONED_KEYS.some(
    key => key in incoming && incoming[key] !== undefined && !sameValue(incoming[key], previous[key]),
  )
}

/** Incrémente `row.version` quand la sauvegarde change secteurs/offres (sinon ne touche rien). */
export function bumpVersionIfChanged(
  row: EsnProfileEntity,
  answers: Partial<EsnAnswers>,
  before: Partial<EsnAnswers>,
): void {
  if (touchesVersionedFields(answers, before)) row.version = (row.version ?? 1) + 1
}
