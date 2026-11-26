import { z } from 'zod'

/**
 * #3282 / #3263.30 (décision Louis 10/10) — le NIVEAU D'ENTRÉE du comité
 * d'achat, SAISI par le commercial dans une LISTE FERMÉE (plus de texte libre).
 *
 * `hierarchy_level.classify_hierarchy_level` se base sur le titre et
 * `attack_angles.specific_offer` est du texte libre du modèle : aucun des deux
 * ne dit à quel échelon l'offre se vend. Le commercial le DÉCLARE
 * (`accounts.committee_entry_level`, migration 1796438000011), et « interlocuteur
 * trop haut » se calcule sur cette valeur — sans elle, rien n'est signalé
 * (jamais de donnée fictive, une absence n'est pas un niveau).
 *
 * Quatre échelons, alignés sur les niveaux L0-L4 du graphe d'organisation
 * (`orgHierarchyLevelSchema`) :
 *   c_level      ← L0 gouvernance, L1 exécutif
 *   direction    ← L2
 *   manager      ← L3
 *   operational  ← L4 expert / opérationnel
 * L5 (achats / contrôle) est un axe PARALLÈLE, pas un échelon : jamais
 * comparé, donc jamais « trop haut ».
 */
export const COMMITTEE_ENTRY_LEVELS = ['c_level', 'direction', 'manager', 'operational'] as const
export type CommitteeEntryLevel = (typeof COMMITTEE_ENTRY_LEVELS)[number]

/** `null` = retirer la déclaration. */
export const setCommitteeEntryLevelSchema = z.object({ level: z.enum(COMMITTEE_ENTRY_LEVELS).nullable() }).strict()
export type SetCommitteeEntryLevelRequest = z.infer<typeof setCommitteeEntryLevelSchema>

/** Rang d'un niveau du graphe d'organisation sur l'échelle à quatre échelons ;
 *  `null` quand il n'est pas un échelon (L5 achats, niveau absent). */
function rankOfOrgLevel(orgLevel: string | null | undefined): number | null {
  switch (orgLevel) {
    case 'L0':
    case 'L1':
      return 0
    case 'L2':
      return 1
    case 'L3':
      return 2
    case 'L4':
      return 3
    default:
      return null
  }
}

/**
 * La personne est-elle PLUS HAUTE que le niveau d'entrée déclaré ? `false` sans
 * déclaration ou sans échelon comparable : on ne signale que ce qu'on sait.
 */
export function isAboveCommitteeEntryLevel(
  orgLevel: string | null | undefined,
  entryLevel: CommitteeEntryLevel | null | undefined,
): boolean {
  if (!entryLevel) return false
  const person = rankOfOrgLevel(orgLevel)
  if (person === null) return false
  return person < COMMITTEE_ENTRY_LEVELS.indexOf(entryLevel)
}
