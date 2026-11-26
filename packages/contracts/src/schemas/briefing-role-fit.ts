import { z } from 'zod'
import { briefingActionKindSchema, type BriefingActionKind } from './daily-briefing.js'

/**
 * #2397.7 — LE RETOUR UTILISATEUR, COMME UN AXE DE PLUS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE #2397.2 A CHANGÉ, ET POURQUOI CE POINT ÉTAIT BLOQUÉ AVANT LUI
 * ─────────────────────────────────────────────────────────────────────────
 * Avant #2397.2, `BRIEFING_RANKING_AXES` ne nourrissait AUCUN calcul — un
 * retour qui « ajusterait les priorités » aurait été une table + un point
 * d'API sans aucun consommateur (tranché par Louis 22/09 soir : reco EXAMINÉE
 * et NON codée, exactement pour cette raison). Depuis #2397.2, `roleFit`
 * (« l'adéquation avec le rôle et les objectifs de la personne ») est un axe
 * NOMMÉ mais jamais évalué par aucune famille de carte
 * (`briefing-actions.ts`) — c'est le point d'attache déterministe que ce
 * lot branche : un geste utilisateur peut désormais marquer `roleFit` comme
 * évalué pour les cartes d'un GENRE (`kind`) donné.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL GESTE, TOUJOURS POSITIF
 * ─────────────────────────────────────────────────────────────────────────
 * `rankingWeight` (briefing-actions.ts) ne fait qu'ADDITIONNER : un axe
 * `evaluated: true` pèse, un axe `evaluated: false` ne retire jamais rien.
 * Le seul geste qui respecte cette forme SANS inventer de pénalité est
 * « ceci correspond à mon rôle » (`engaged: true`) — jamais un `false` stocké
 * qui prétendrait mesurer un axe qu'on n'a pas. Retirer le geste (`engaged:
 * false`) efface simplement l'entrée : l'absence est déjà le défaut neutre
 * (« non mesuré n'est jamais 0 », et ici « non engagé » n'est jamais une
 * pénalité).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE OBLIGATION NE DESCEND JAMAIS SOUS SON SEUIL
 * ─────────────────────────────────────────────────────────────────────────
 * `compareBriefingActions` compare `priority` EN PREMIER ; `roleFit` n'entre
 * dans `rankingWeight` que pour départager deux cartes de MÊME priorité. Ce
 * fichier ne touche jamais `priority` : une échéance légale ou une relance
 * due garde donc son rang, quel que soit le retour utilisateur sur d'autres
 * genres de cartes.
 */
export const briefingRoleFitFeedbackRequestSchema = z.object({
  kind: briefingActionKindSchema,
  /** `true` = « ceci correspond à mon rôle ». `false` efface le geste. */
  engaged: z.boolean(),
})
export type BriefingRoleFitFeedbackRequest = z.infer<typeof briefingRoleFitFeedbackRequestSchema>

/** Le sac de préférences — une entrée par genre ENGAGÉ, jamais un `false` stocké. */
export type BriefingRoleFitPreferences = Partial<Record<BriefingActionKind, true>>

/**
 * Fusion immuable du sac de préférences. `engaged: false` RETIRE la clé —
 * elle ne la met jamais à `false` — pour qu'un sac lu plus tard ne distingue
 * jamais « jamais noté » de « noté négativement », qui n'existe pas.
 */
export function applyRoleFitFeedback(
  existing: BriefingRoleFitPreferences | undefined,
  kind: BriefingActionKind,
  engaged: boolean,
): BriefingRoleFitPreferences {
  const next = { ...(existing ?? {}) }
  if (engaged) {
    next[kind] = true
  } else {
    delete next[kind]
  }
  return next
}

/**
 * Lecture défensive du sac de préférences brut (`user_preferences.preferences`,
 * une JSONB sans schéma imposé côté base) : toute forme inattendue rend
 * `false`, jamais une exception — un préférence illisible est un axe NON
 * ÉVALUÉ, pas une panne du brief.
 */
export function isRoleFitEngaged(preferences: unknown, kind: BriefingActionKind): boolean {
  if (!preferences || typeof preferences !== 'object') return false
  const bag = (preferences as Record<string, unknown>).briefingRoleFit
  if (!bag || typeof bag !== 'object') return false
  return (bag as Record<string, unknown>)[kind] === true
}
