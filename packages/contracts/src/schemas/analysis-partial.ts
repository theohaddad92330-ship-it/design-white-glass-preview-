import { z } from 'zod'

/**
 * CE QUI EST DÉJÀ TROUVÉ PENDANT QU'UNE ANALYSE TOURNE — #2630.2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Une analyse de compte dure trois à six minutes, et l'écran ne montrait qu'une
 * barre et le nom de l'étape en cours. « Résultats partiels » existait déjà dans
 * le produit, mais pour une RECHERCHE Découvrir dégradée (`DegradedBanner`) —
 * pas pour une analyse en cours.
 *
 * Or la matière était DÉJÀ sur le fil : le worker envoie la sortie de chaque
 * phase avec sa complétion (`emitPhaseComplete(…, payload)`,
 * `analysis.worker.ts`), et le navigateur la jetait — `analysis-subscription.ts`
 * ne lisait que `{ phase, percent }`. Encore un code juste que personne
 * n'appelait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UN PARTIEL EST LA SEULE CHOSE QUI S'AFFICHE AVANT D'ÊTRE COMPLÈTE
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est donc l'endroit exact où « on n'affiche pas ce qu'on n'a pas » se joue,
 * et ce contrat le tient par construction plutôt que par convention :
 *
 *  - une phase qui n'a RIEN ramené ne produit AUCUN partiel
 *    ({@link analysisPartialFrom} rend `null`) — dans une liste, une absence ne
 *    fait aucune ligne, et « 0 contact trouvé » est exactement la ligne qu'on
 *    ne veut pas ;
 *  - `count` est minoré à 1 : aucun chemin ne peut écrire un zéro ;
 *  - on ne NOMME jamais plus de choses qu'on n'en a trouvé — un nom de trop
 *    serait un nom inventé ;
 *  - un élément sans libellé lisible est COMPTÉ mais pas nommé : on ne fabrique
 *    ni « Contact 3 » ni « Sans nom ».
 *
 * ⚠️ Et un partiel ne dit PAS où en est le travail. La position vit sur la barre
 * de progression (`percent`, qui sait déjà valoir `null` quand on ignore où on
 * en est) ; l'ajouter ici en ferait un second réglage du même fait (GA-26), et
 * un « 40 % complet » posé à côté d'une liste de trouvailles se lirait comme
 * « il en manque 60 % », ce que personne ne sait. `.strict()` le refuse.
 *
 * ⚠️ Ce qui voyage est BORNÉ — des décomptes et au plus trois libellés, jamais
 * la charge complète de la phase. Le partiel traverse un socket et finit dans
 * un état local ; y déverser toute la recherche mettrait dans le navigateur une
 * copie du dossier avant que le dossier existe.
 */

/**
 * Les natures qu'un partiel sait annoncer.
 *
 * ⚠️ Liste ORDONNÉE et APPEND-ONLY (GA-08) : une valeur n'en disparaît jamais et
 * ne s'insère jamais au milieu — elle s'ajoute à la fin.
 */
export const ANALYSIS_PARTIAL_KINDS = [
  /** Des personnes remontées sur le compte (phases `contacts` et `classify`). */
  'contacts',
  /** Des angles d'attaque écrits par la phase de recherche. */
  'angles',
] as const
export const analysisPartialKindSchema = z.enum(ANALYSIS_PARTIAL_KINDS)
export type AnalysisPartialKind = (typeof ANALYSIS_PARTIAL_KINDS)[number]

/**
 * Combien de libellés on donne en exemple. Trois : assez pour que la liste soit
 * RECONNAISSABLE (« ah, ils ont trouvé la DSI »), trop peu pour tenir lieu de
 * dossier — le dossier arrive à la fin, ceci n'en est pas un aperçu complet.
 */
export const ANALYSIS_PARTIAL_MAX_SAMPLES = 3

export const analysisPartialFindingSchema = z
  .object({
    kind: analysisPartialKindSchema,
    /** ⚠️ Minoré à 1 : une trouvaille à zéro n'est pas une trouvaille. */
    count: z.number().int().min(1),
    /** Quelques libellés RÉELS, jamais fabriqués. Vide quand aucun n'était lisible. */
    samples: z.array(z.string().min(1)).max(ANALYSIS_PARTIAL_MAX_SAMPLES),
  })
  .strict()
  .refine(finding => finding.samples.length <= finding.count, {
    message: 'on ne nomme jamais plus de choses qu’on n’en a trouvé',
  })
export type AnalysisPartialFinding = z.infer<typeof analysisPartialFindingSchema>

export const analysisPartialSchema = z
  .object({
    /** L'événement de phase qui l'a produit — « qui l'a trouvé », pas « où on en est ». */
    phase: z.string().min(1),
    /** QUAND — sans date, un partiel se relit comme frais dix minutes plus tard. */
    at: z.number().int().min(0),
    /** ⚠️ Au moins une : un partiel vide ne s'affiche pas, il n'existe pas. */
    findings: z.array(analysisPartialFindingSchema).min(1),
  })
  .strict()
export type AnalysisPartial = z.infer<typeof analysisPartialSchema>

/**
 * Où lire une nature dans la charge d'une phase, et quel champ en fait un nom.
 *
 * Une table plutôt qu'une cascade de `if` : ajouter une nature demain (des
 * signaux, des sources) est une ligne ici, pas une branche de plus dans une
 * fonction que personne ne relit.
 */
const PARTIAL_SOURCES: readonly {
  kind: AnalysisPartialKind
  field: string
  labelFields: readonly string[]
}[] = [
  { kind: 'contacts', field: 'contacts', labelFields: ['full_name', 'name'] },
  { kind: 'angles', field: 'angles', labelFields: ['title', 'label'] },
]

function labelOf(item: unknown, labelFields: readonly string[]): string | null {
  if (typeof item !== 'object' || item === null) return null
  const record = item as Record<string, unknown>
  for (const field of labelFields) {
    const value = record[field]
    // ⚠️ `trim()` : une chaîne blanche n'est pas un nom, c'est un vide qui
    // s'afficherait comme une valeur.
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return null
}

/**
 * LE PARTIEL D'UNE PHASE — #2630.2.
 *
 * Rend `null` chaque fois qu'il n'y a rien d'honnête à dire : charge absente,
 * illisible, phase sans nature connue, ou nature présente mais VIDE. C'est le
 * comportement le plus important de ce fichier — il fait que l'écran n'a aucun
 * moyen d'annoncer une absence.
 */
export function analysisPartialFrom(input: {
  phase: string
  /** La charge telle que le worker l'a envoyée — de forme non garantie, d'où `unknown`. */
  data: unknown
  at: number
}): AnalysisPartial | null {
  const { phase, data, at } = input
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const record = data as Record<string, unknown>

  const findings: AnalysisPartialFinding[] = []
  for (const source of PARTIAL_SOURCES) {
    const value = record[source.field]
    if (!Array.isArray(value) || value.length === 0) continue
    const samples = value
      .map(item => labelOf(item, source.labelFields))
      .filter((label): label is string => label !== null)
      .slice(0, ANALYSIS_PARTIAL_MAX_SAMPLES)
    findings.push({ kind: source.kind, count: value.length, samples })
  }

  if (findings.length === 0) return null
  return { phase, at, findings }
}
