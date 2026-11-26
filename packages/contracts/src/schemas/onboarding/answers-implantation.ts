import { z } from 'zod'

/**
 * #2005.4 (DÉCISION Louis 17/09/2026, lot CP2) — où l'ESN est IMPLANTÉE
 * (siège + bureaux), posée UNE FOIS par espace.
 *
 * Distincte de `geo_zones` (Temps 1) qui dit où l'ESN PROSPECTE — ne jamais
 * fusionner les deux, même principe que `growth_target_zones` (#2036.10,
 * garde GA-338). Colonne ADDITIVE, `text[]` par défaut vide comme ses
 * voisines (`case_study_results`, `contractual_constraints`) : le
 * questionnaire ne bloque jamais, une question passée reste `[]`, jamais
 * devinée.
 *
 * Clé d'ENTREPRISE (absente de `ESN_PERSONAL_ANSWER_KEYS`) : lue par la
 * couche `company` du profil à trois couches
 * (`packages/contracts/src/schemas/layered-profile.ts`), qui portait
 * `locations` à `null` faute de cette réponse (CP1, #2005.4).
 */
export const IMPLANTATION_ANSWER_FIELDS = {
  company_locations: z.array(z.string()).catch([]),
}
