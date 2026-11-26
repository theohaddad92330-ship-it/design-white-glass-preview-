import { z } from 'zod'

/**
 * LE PROTOCOLE DE RECETTE DU COPILOTE (PDF 6 §9.3, dette T6.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI JUSTIFIE TOUT LE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §9.3 la qualifie de « capitale », et le tracker du PDF 6 l'a constatée
 * ABSENTE : elle était énoncée dans un document d'août et outillée nulle part.
 *
 *   `FAIL`    — le produit a mal fait. Il y a un bug à corriger.
 *   `BLOCKED` — la configuration manque. Il n'y a RIEN à corriger dans le code.
 *
 * Les confondre fait perdre des semaines, dans les deux sens : on cherche un
 * bug dans un connecteur qui n'a jamais été branché, ou on classe « à
 * configurer » un défaut qui reviendra chez tous les clients.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne stocke rien. Un jeu de recette est une observation humaine — quelqu'un
 * tape la requête, lit la réponse, et juge. Ce qui est automatisable est une
 * seule chose, et c'est justement celle qu'on se trompait à faire à la main :
 * **savoir qu'un cas est BLOQUÉ avant de le jouer.** Si la capacité requise
 * manque, le verdict est connu d'avance, et le jouer ne prouverait rien.
 */

export const RECETTE_VERDICTS = ['PASS', 'FAIL', 'PARTIAL', 'BLOCKED'] as const
export const recetteVerdictSchema = z.enum(RECETTE_VERDICTS)
export type RecetteVerdict = z.infer<typeof recetteVerdictSchema>

/**
 * Un cas de recette et ses huit champs (§9.3).
 *
 * Les champs d'OBSERVATION sont facultatifs parce qu'un cas non joué existe :
 * c'est même l'état de départ de tout jeu de recette. Les rendre obligatoires
 * forcerait à inventer une observation pour pouvoir enregistrer un cas.
 */
export const recetteCaseSchema = z
  .object({
    /** La requête, telle qu'un utilisateur la tape. */
    query: z.string().min(1),
    verdict: recetteVerdictSchema.nullable(),
    /** Ce que le copilote a répondu, mot pour mot. Jamais reformulé. */
    observedMessage: z.string().nullable(),
    /** Ce que les outils ont réellement rendu. */
    observedToolResult: z.string().nullable(),
    /** L'écart entre l'attendu et l'observé — vide quand il n'y en a pas. */
    gap: z.string().nullable(),
    /** Les preuves : identifiants, dates, captures. */
    evidence: z.array(z.string()).default([]),
    /** La correction attendue. Vide sur un PASS. */
    expectedFix: z.string().nullable(),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).nullable(),
  })
  .strict()
export type RecetteCase = z.infer<typeof recetteCaseSchema>

/**
 * Le verdict connu D'AVANCE : bloqué, ou à jouer.
 *
 * `null` ne veut pas dire « ça marche » — il veut dire « il faut le jouer ».
 * C'est la seule chose que le code peut honnêtement dire d'un cas non observé,
 * et lui prêter un PASS transformerait un jeu de recette en attestation.
 */
export function preflightVerdict(missingCapabilities: readonly string[]): RecetteVerdict | null {
  return missingCapabilities.length > 0 ? 'BLOCKED' : null
}

/**
 * Le verdict d'un cas OBSERVÉ.
 *
 * Trois règles, et chacune évite une erreur de classement qu'on a vue :
 *
 * 1. **Une capacité manquante l'emporte sur tout.** Même si la réponse est
 *    mauvaise, le cas est BLOCKED : juger la réponse d'un outil qui n'a pas pu
 *    tourner revient à ouvrir un ticket sur un connecteur absent.
 * 2. **Un écart constaté n'est jamais un PASS**, même si la réponse « a l'air
 *    bien ». C'est l'écart qui décide, pas l'impression.
 * 3. **Une réponse partielle est PARTIAL, pas FAIL.** Les confondre ferait
 *    jeter le travail à moitié bon — la même règle que `partial` de l'Action OS
 *    et que les blocs « non évaluable » du matching.
 */
export function observedVerdict(input: {
  missingCapabilities: readonly string[]
  hasGap: boolean
  /** Le copilote a-t-il rendu une partie de ce qui était attendu ? */
  partial?: boolean
}): RecetteVerdict {
  if (input.missingCapabilities.length > 0) return 'BLOCKED'
  if (!input.hasGap) return 'PASS'
  return input.partial ? 'PARTIAL' : 'FAIL'
}

/**
 * Un verdict exige-t-il une correction PRODUIT ?
 *
 * La question que le classement sert à trancher : `BLOCKED` ne crée aucun
 * ticket de code, `FAIL` et `PARTIAL` si.
 */
export function needsProductFix(verdict: RecetteVerdict | null): boolean {
  return verdict === 'FAIL' || verdict === 'PARTIAL'
}
