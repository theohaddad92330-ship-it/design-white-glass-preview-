import { z } from 'zod'

/**
 * Les listes FERMÉES du pack ORION_DATAPACK_V12 (successeur de DATAFORGE V10,
 * même espace de clés `DF-XXXX` — voir `1791510000000-OrionV12Staging.ts`).
 *
 * Définies ICI, pas dans `apps/api`, pour une seule raison : la garde GA-12
 * (`check-constraints-cover-enums.spec.ts`) ne lit que
 * `packages/contracts/src/schemas/*.ts` pour vérifier qu'une contrainte SQL
 * `CHECK` couvre bien son énumération TypeScript. `apps/api` réexporte ces
 * mêmes tableaux (`orion-v12-headers.fixture.ts`) au lieu de les redéfinir —
 * un réglage vit à UN seul endroit.
 */

/**
 * Les 9 valeurs de `statut_code` (`1_COMPTES/10_COMPTES_MASTER.csv`),
 * distribution mesurée le 31/08/2026 sur les 1 195 lignes du pack (somme
 * exacte) : CIBLE_SECONDAIRE 495 · A_QUALIFIER 299 · EXCLU_ESN_EDITEUR 130 ·
 * CIBLE_PRIORITAIRE 124 · VERROUILLE_PLATEFORME 92 · EXCLU_DOUBLON 43 ·
 * VERROUILLE_PUBLIC 8 · VERROUILLE_IT_EXTERNALISEE 3 · CANAL_PARTENAIRE 1.
 *
 * GA-08 : n'en retire jamais une, n'en insère jamais une au milieu.
 */
export const ORION_ACCOUNT_STATUT_CODES = [
  'CIBLE_PRIORITAIRE',
  'CIBLE_SECONDAIRE',
  'CANAL_PARTENAIRE',
  'VERROUILLE_PLATEFORME',
  'VERROUILLE_PUBLIC',
  'VERROUILLE_IT_EXTERNALISEE',
  'EXCLU_ESN_EDITEUR',
  'EXCLU_DOUBLON',
  'A_QUALIFIER',
] as const
export const orionAccountStatutCodeSchema = z.enum(ORION_ACCOUNT_STATUT_CODES)
export type OrionAccountStatutCode = z.infer<typeof orionAccountStatutCodeSchema>

/**
 * Les 3 sévérités de `6_QUALITE/60_ANOMALIES_ET_CORRECTIONS.csv`. Mesuré le
 * 31/08/2026, deux fois indépendamment (le champ `severite` du CSV ET le
 * préfixe `[SÉVÉRITÉ]` de chaque chunk RAG `GARDE_FOU_QUALITE` miroir) : 6
 * CRITIQUE, 13 MAJEUR, 1 MINEUR — le pack et la demande initiale annonçaient
 * 7 critiques, la mesure directe en trouve 6.
 */
export const ORION_ANOMALY_SEVERITIES = ['CRITIQUE', 'MAJEUR', 'MINEUR'] as const
export const orionAnomalySeveritySchema = z.enum(ORION_ANOMALY_SEVERITIES)
export type OrionAnomalySeverity = z.infer<typeof orionAnomalySeveritySchema>

/**
 * Les 3 priorités d'indexation de `5_RAG/50_CHUNKS_INDEXABLES.csv` — 0 = preuve
 * sourcée ou garde-fou qualité (reranking prioritaire), 1 = référentiel/identité,
 * 2 = donnée héritée non re-sourcée (à servir avec `niveau_confiance`).
 */
export const ORION_RAG_PRIORITIES = [0, 1, 2] as const
export const orionRagPrioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2)])
export type OrionRagPriority = z.infer<typeof orionRagPrioritySchema>
