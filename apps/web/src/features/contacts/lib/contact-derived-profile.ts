import type { Contact, HierarchyLevel } from '@bellum/contracts'
import { computeHierarchyLevel } from '@bellum/contracts'

/**
 * #4016 L2 / #4036.D14 (Louis 15/10/2026) — PROFIL ENRICHI AVEC CE QUI EST DÉJÀ BRANCHÉ, rien d'acheté.
 *
 * Séniorité et secteur se DÉDUISENT du titre et des sources existantes (l'enrichissement déjà stocké, le
 * dossier du compte) ; ce qui manque est NOMMÉ « non disponible », jamais rempli d'office. La séniorité
 * lue de l'enrichissement prime (c'est un fait sourcé) ; le titre ne sert que de repli, et un titre
 * illisible (`unknown`) ne dit rien.
 */
type DerivedFactOrigin = 'enrichment' | 'title' | 'account'

type DerivedFact<T> = { available: true; value: T; origin: DerivedFactOrigin } | { available: false }

interface DerivedContactProfile {
  /** Libellé stocké par l'enrichissement (vocabulaire fermé Apollo) OU palier hiérarchique déduit du titre. */
  seniority: DerivedFact<{ kind: 'stored'; raw: string } | { kind: 'level'; level: HierarchyLevel }>
  sector: DerivedFact<string>
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function deriveContactProfile(
  contact: Pick<Contact, 'seniority' | 'title'>,
  accountSector?: string | null,
): DerivedContactProfile {
  const stored = text(contact.seniority)
  const level = computeHierarchyLevel(contact.title)
  const seniority: DerivedContactProfile['seniority'] = stored
    ? { available: true, value: { kind: 'stored', raw: stored }, origin: 'enrichment' }
    : level !== 'unknown'
      ? { available: true, value: { kind: 'level', level }, origin: 'title' }
      : { available: false }
  const sectorText = text(accountSector)
  const sector: DerivedContactProfile['sector'] = sectorText
    ? { available: true, value: sectorText, origin: 'account' }
    : { available: false }
  return { seniority, sector }
}
