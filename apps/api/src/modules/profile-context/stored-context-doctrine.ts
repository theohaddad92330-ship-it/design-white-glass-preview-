import { PROFILE_CONTEXT_SOURCED_SUGGESTIONS_SCHEMA_VERSION, type ProfileContext } from '@bellum/contracts'

/**
 * #2062.1 — CE QUI EST DÉJÀ STOCKÉ NE SE CORRIGE PAS PAR UN PROMPT.
 *
 * Mesuré en production le 15/09/2026 sur `/welcome`, compte réel, verbatim :
 * « Le scoring évaluera … **la probabilité d'un besoin urgent** en
 * Data/Cloud/Cybosécurité … ». « Aucune PROBABILITÉ » a été refusée SIX fois
 * (arbitrage n°4 du 16/08 ; D10 du PDF 1 ; §7.7 du PDF 2 ; PDF 4 ; PDF 5 ;
 * PDF 8) — `c26_probabilite` au registre de doctrine. Ce qui EST exposé est un
 * score DÉCOMPOSÉ dont les axes sont nommés.
 *
 * Le schéma du Profiler porte l'interdit depuis le 14/09. Mais
 * `profiles.profile_context` est une colonne PERSISTÉE : la phrase fautive a
 * été écrite une fois et elle est re-servie à chaque ouverture de l'écran. Un
 * interdit posé à la GÉNÉRATION ne redescend jamais tout seul sur ce qui a déjà
 * été écrit — c'est précisément le trou par lequel la violation est restée en
 * production un jour de plus que son correctif.
 *
 * CE QUE CETTE GARDE FAIT, ET CE QU'ELLE NE FAIT PAS
 * --------------------------------------------------
 * Elle ne RÉÉCRIT rien : on n'invente pas une phrase de remplacement (« JAMAIS
 * de donnée fictive » vaut aussi pour une phrase de rattrapage). Elle ne TOUCHE
 * pas la ligne stockée : on archive, on ne supprime pas — la révision reste
 * intacte et une prochaine génération la remplacera. Elle empêche seulement que
 * le texte soit SERVI — et elle NOMME ce qu'elle retient : les chemins rendus
 * remontent jusqu'à l'écran (`withheld`, `profileContextResponseSchema`), qui
 * dit « ce texte date du <date> et sera réécrit », avec sa date. Un champ qui
 * partirait vide en silence déguiserait un « non mesuré » en « rien à dire ».
 *
 * POURQUOI UN PARCOURS COMPLET, ET PAS UNE LISTE DE CHAMPS
 * --------------------------------------------------------
 * Une liste de noms de champs se périme au premier champ ajouté au contexte, et
 * personne ne voit la garde devenir borgne. Le contexte stocké est du JSON dont
 * toutes les feuilles de type `string` sont du texte libre écrit par un modèle
 * et rendu verbatim : on les visite toutes. `.passthrough()` conserve par
 * ailleurs des blocs `snake_case` hérités — un parcours les couvre, une liste
 * les oublierait.
 */

/** Les formes interdites, reprises de l'interdit DÉJÀ écrit trois fois dans les
 *  prompts (`apps/ia/app/prompts/reply_formats.py:50`, `bellum_advisor.py`,
 *  `bellum_plan.py`) : « Ni probabilité, ni chance de signer, ni pourcentage de
 *  réussite ». On ne réinvente pas un vocabulaire : une garde protège une
 *  règle, elle ne l'invente pas.
 *
 *  ⚠️ AUCUN drapeau `g` : `RegExp.test()` avec `g` est STATEFUL (il reprend à
 *  `lastIndex`) et rendrait la garde alternativement verte et rouge sur la même
 *  entrée. Le défaut a déjà été payé dans ce dépôt.
 *
 *  ⚠️ Ce qui reste VOLONTAIREMENT hors de la liste : « taux de réussite » et
 *  « taux de transformation », qui sont des mesures. Un taux MESURÉ est une
 *  observation, pas une chance (`bellum_advisor.py`, les cinq niveaux de
 *  vérité) — une garde qui les mangerait rendrait le produit muet sur ses
 *  propres mesures. « urgence », « urgent », « besoin » non plus : c'est
 *  « la probabilité d'un besoin urgent » qui est interdite, pas l'urgence.
 */
const FORBIDDEN_SHAPES: readonly RegExp[] = [
  /probabilit/, // probabilité, probabilités, probabiliste
  /\bchances?\b/, // « 70 % de chances de signer », « 3 chances sur 4 »
  /pourcentage de reussite/,
  /% de reussite/,
  /previsionnel pondere/,
]

/** Casse et accents pliés : le modèle écrit « Probabilité » comme
 *  « probabilite », et une garde qui ne verrait qu'une des deux graphies ne
 *  garderait rien. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function namesAProbability(text: string): boolean {
  const folded = fold(text)
  return FORBIDDEN_SHAPES.some(shape => shape.test(folded))
}

/** Le chemin des noms d'entreprises stockés, retenus quand rien ne les prouve. */
const SUGGESTIONS_PATH = 'welcomeSummary.firstAnalysisSuggestions'

function walk(value: unknown, path: string, withheld: string[]): unknown {
  if (typeof value === 'string') {
    if (!namesAProbability(value)) return value
    withheld.push(path)
    return ''
  }
  if (Array.isArray(value)) {
    const kept: unknown[] = []
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`
      // Dans une LISTE, une entrée fautive est retirée plutôt que vidée : une
      // chaîne vide y deviendrait une puce blanche, c'est-à-dire du bruit.
      if (typeof item === 'string' && namesAProbability(item)) {
        withheld.push(itemPath)
        return
      }
      kept.push(walk(item, itemPath, withheld))
    })
    return kept
  }
  if (value !== null && typeof value === 'object') {
    const kept: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      kept[key] = walk(nested, path ? `${path}.${key}` : key, withheld)
    }
    return kept
  }
  return value
}

/**
 * #2069.1 — UN NOM D'ENTREPRISE STOCKÉ N'EST SERVI QUE S'IL EST PROUVÉ.
 *
 * Les suggestions de `/welcome` sont CLIQUABLES : chacune lance une analyse,
 * donc débite un crédit. Servir un nom qu'aucune source n'a rendu transforme
 * une hallucination en dépense — c'est ce qui se passait en production le
 * 15/09/2026 avec « BNP Paribas · Stellantis · Airbus · LVMH ».
 *
 * La seule provenance lisible à la LECTURE est la version de schéma de
 * l'instantané : à partir de
 * `PROFILE_CONTEXT_SOURCED_SUGGESTIONS_SCHEMA_VERSION`, le producteur filtre
 * les noms contre la mémoire marché lue (`keep_sourced`). En deçà — version
 * plus ancienne, ou aucun instantané, donc rien à lire — le nom n'est pas
 * prouvé et ne sort pas. La liste ne se remplit jamais d'autre chose : elle est
 * VIDÉE, et l'écran le NOMME.
 */
function proven(schemaVersion: number | null): boolean {
  return schemaVersion !== null && schemaVersion >= PROFILE_CONTEXT_SOURCED_SUGGESTIONS_SCHEMA_VERSION
}

/**
 * Le contexte tel qu'il peut être SERVI, et les CHEMINS de ce qui est retenu.
 *
 * Rend l'objet reçu À L'IDENTIQUE (même référence) quand rien n'est en cause —
 * le chemin normal ne paie aucune copie, et un appelant peut le vérifier.
 *
 * `schemaVersion` est celle de l'instantané vivant (`null` = aucun instantané
 * lisible, ce qui ne vaut pas preuve).
 */
export function withheldStoredContext(
  context: ProfileContext | null,
  { schemaVersion }: { schemaVersion: number | null },
): { context: ProfileContext | null; withheld: string[] } {
  if (!context) return { context: null, withheld: [] }

  const withheld: string[] = []
  const walked = walk(context, '', withheld) as ProfileContext

  const suggestions = walked.welcomeSummary?.firstAnalysisSuggestions ?? []
  const withholdNames = suggestions.length > 0 && !proven(schemaVersion)
  if (withholdNames) {
    withheld.push(SUGGESTIONS_PATH)
    walked.welcomeSummary = { ...walked.welcomeSummary, firstAnalysisSuggestions: [] } as NonNullable<
      ProfileContext['welcomeSummary']
    >
  }

  return withheld.length === 0 ? { context, withheld: [] } : { context: walked, withheld }
}
