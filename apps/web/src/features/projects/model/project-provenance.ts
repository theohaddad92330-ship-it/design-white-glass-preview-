import type { ProjectConfidence, ProjectRow } from '@bellum/contracts'
import { PROJECT_CONFIDENCE_LEVELS } from '@bellum/contracts'
import type { TFunction } from 'i18next'

/**
 * Provenance d'un besoin matérialisé (restitution V2 §6 : « chaque besoin possède
 * type, date, fraîcheur, source, confiance, impact et offre associée »).
 *
 * Les colonnes `source` / `confidence` / `updated_at` existent depuis la
 * migration `1787900000000` et n'étaient jamais rendues : la confiance ne
 * servait qu'à un agrégat (« X confirmées, Y à qualifier »), la source et la
 * fraîcheur ne sortaient pas de la base. Ce module ne fabrique RIEN : il lit ce
 * qui est stocké et laisse la vue traduire.
 *
 * Règle de rendu (demande explicite) : **un champ vide ne s'affiche pas** —
 * jamais de « source inconnue » ni de « confiance : n/a ». Une valeur stockée
 * hors de la nomenclature connue (une source CRM/RAG écrite plus tard, par
 * exemple) est rendue TELLE QUELLE plutôt qu'écartée.
 */

/** Les lanes de projection écrites par la matérialisation (API + backfill).
 *  `signal` n'apparaît ici QUE lorsque le signal n'avait aucune source réelle :
 *  quand il en a une (« Les Échos »), c'est elle qui est stockée, et elle est
 *  rendue telle quelle par la branche « source hors nomenclature ». */
// #4191 (recette 2, E6) — les valeurs de la colonne `source` que l'on voyait BRUTES sur une carte (« BOAMP »,
// « client », « import ») sont des sources NOMMÉES : elles se lisent dans la langue de l'utilisateur
// (« BOAMP » → « Appel d'offres public »). La casse de la base ne compte pas. Une source hors nomenclature
// (un autre outil, du texte libre) reste rendue telle quelle.
const KNOWN_SOURCES = [
  'pain',
  'challenge',
  'program',
  'signal',
  'implication',
  'boamp',
  'decp',
  'client',
  'import',
  'imported',
  'manual',
] as const
type OpportunitySourceKey = (typeof KNOWN_SOURCES)[number]

type OpportunityProvenance = {
  /** Source connue → la vue traduit `provenance.sources.<clé>`. */
  sourceKey: OpportunitySourceKey | null
  /** Source stockée mais hors nomenclature → affichée telle quelle. */
  sourceText: string | null
  /** Confiance connue → la vue traduit `provenance.confidence.<clé>`. */
  confidenceKey: ProjectConfidence | null
  /** Confiance stockée mais hors échelle → affichée telle quelle. */
  confidenceText: string | null
  /** Fraîcheur : `updated_at` UNIQUEMENT s'il dit autre chose que la date de
   *  première détection (sinon « Détecté le 22 juil. · Actualisé le 22 juil. »
   *  n'apporte rien). */
  refreshedAt: string | null
}

export function describeOpportunityProvenance(row: ProjectRow): OpportunityProvenance {
  // #4336.1 — une affaire créée dans Bellum (kind `manual`) a TOUJOURS une origine, même quand la ligne a été écrite
  // avant que l'API ne stocke `source = 'manual'` : la table et la carte ne montrent jamais une Origine vide.
  const source = text(row.source) ?? (row.kind === 'manual' ? 'manual' : null)
  const confidence = text(row.confidence)
  const normalized = source?.toLowerCase() ?? null
  const known = normalized !== null && (KNOWN_SOURCES as readonly string[]).includes(normalized)
  const knownConfidence = confidence !== null && (PROJECT_CONFIDENCE_LEVELS as readonly string[]).includes(confidence)

  return {
    sourceKey: known ? (normalized as OpportunitySourceKey) : null,
    sourceText: known ? null : source,
    confidenceKey: knownConfidence ? (confidence as ProjectConfidence) : null,
    confidenceText: knownConfidence ? null : confidence,
    refreshedAt: refreshedAt(row.first_detected_at, row.updated_at),
  }
}

/**
 * #4336.1 — L'ORIGINE d'une affaire : UNE règle, UN mot, lus par la carte, la table et la fiche.
 * La source réellement stockée, en langage métier (`provenance.sources.*`) ; hors nomenclature, telle quelle ;
 * absente → `null` (aucun badge, aucune cellule : on n'affiche pas ce qu'on n'a pas).
 */
export function describeOrigin(row: ProjectRow, t: TFunction<'projects'>): string | null {
  const provenance = describeOpportunityProvenance(row)
  return provenance.sourceKey ? t(`provenance.sources.${provenance.sourceKey}`) : provenance.sourceText
}

/** Rien de stocké ⇒ la vue ne rend pas de ligne vide. */
export function hasProvenance(provenance: OpportunityProvenance): boolean {
  return (
    provenance.sourceKey !== null ||
    provenance.sourceText !== null ||
    provenance.confidenceKey !== null ||
    provenance.confidenceText !== null ||
    provenance.refreshedAt !== null
  )
}

/** Date lisible dans la langue de l'utilisateur, ou null si l'ISO est illisible. */
export function formatOpportunityDate(iso: string, language: string): string | null {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  try {
    return parsed.toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return parsed.toLocaleDateString('fr', { year: 'numeric', month: 'short', day: 'numeric' })
  }
}

function refreshedAt(firstDetectedAt: string, updatedAt: string): string | null {
  const detected = new Date(firstDetectedAt)
  const updated = new Date(updatedAt)
  if (Number.isNaN(updated.getTime())) return null
  if (!Number.isNaN(detected.getTime()) && detected.toDateString() === updated.toDateString()) return null
  return updatedAt
}

function text(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
