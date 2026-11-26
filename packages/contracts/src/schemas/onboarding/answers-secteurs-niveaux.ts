import { z } from 'zod'

/**
 * CINQ NIVEAUX PAR SECTEUR, PAS VINGT « PRIORITAIRES » — #2041.1 (lot L16).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER CORRIGE
 * ─────────────────────────────────────────────────────────────────────────
 * `target_sectors` est un multi PLAT : vingt-deux secteurs au catalogue, et
 * l'utilisateur peut en cocher jusqu'à `ONBOARDING_MAX_MULTI`. Tous cochés
 * valent la même chose — le libellé les appelle « prioritaires », et vingt
 * priorités ne trient rien. Le questionnaire posait donc une question dont la
 * réponse ne pouvait pas être utile.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AJOUT SEULEMENT — `target_sectors` N'EST PAS TOUCHÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Exactement comme `esn_objectives` est venu À CÔTÉ de `monthly_target`
 * (#2052.1) et `reference_sectors` à côté de `target_sectors` (#2041.2) :
 * une seule clé NOUVELLE, `priority_sectors`. `target_sectors`,
 * `reference_sectors` et `no_go_sectors` gardent leur sens et leurs lecteurs
 * (`profile_context.py` les pattern-matche en français verbatim ; les
 * déplacer casserait le pipeline d'analyse en silence).
 *
 * Les cinq niveaux ne sont donc pas une SIXIÈME colonne : ce sont les quatre
 * clés existantes LUES ENSEMBLE, plus celle-ci. La dérivation vit à un seul
 * endroit ({@link sectorEngagementLevels}) — deux chemins qui la referaient
 * divergeraient, et l'écran finirait par classer un secteur autrement que
 * le prompt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER N'AFFIRME JAMAIS
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun score, aucun rang, aucune probabilité : un niveau est une DÉCLARATION
 * de l'ESN, relue telle quelle. Et « non mesuré n'est pas zéro » — un profil
 * qui n'a rien répondu ne rend pas « zéro secteur prioritaire » à comparer au
 * seuil, il rend une liste VIDE, sur laquelle la relance ne dit rien.
 */

/**
 * Les cinq niveaux, du plus engagé au moins engagé.
 *
 * ⚠️ GA-08 : un enum ne perd jamais une valeur et n'en insère jamais au
 * milieu — un sixième niveau s'ajoute EN FIN, après `no_go`.
 *
 *  · `priority`  — cible prioritaire déclarée (`priority_sectors`).
 *  · `reference` — visé ET prouvé : une mission réelle y a déjà été livrée.
 *  · `target`    — visé, sans preuve ni priorité déclarée.
 *  · `dormant`   — PROUVÉ mais plus visé. Un niveau à part, et pas un détail :
 *                  le ranger dans `reference` ferait compter une preuve comme
 *                  une cible, et l'ESN se verrait proposer des comptes sur un
 *                  marché qu'elle a quitté.
 *  · `no_go`     — refus explicite (`no_go_sectors`). Une DÉCISION, pas le
 *                  bas d'une échelle : c'est pourquoi elle gagne sur tout le
 *                  reste dans la dérivation ci-dessous.
 */
export const SECTOR_ENGAGEMENT_LEVELS = ['priority', 'reference', 'target', 'dormant', 'no_go'] as const
export const sectorEngagementLevelSchema = z.enum(SECTOR_ENGAGEMENT_LEVELS)
export type SectorEngagementLevel = (typeof SECTOR_ENGAGEMENT_LEVELS)[number]

/** Un secteur et le niveau que les réponses lui donnent. */
export type SectorEngagement = { sector: string; level: SectorEngagementLevel }

/**
 * La seule clé AJOUTÉE : les secteurs que l'ESN déclare prioritaires.
 *
 * `.catch([])` comme ses voisines (`reference_sectors`, `service_types`) :
 * absent = tableau vide, jamais une valeur devinée, jamais un échec de lecture
 * pour un profil enregistré avant ce lot. Pas dans `TEMPS1_REQUIRED_KEYS` : la
 * porte de complétion serveur ne bouge pas.
 *
 * ⚠️ Volontairement SANS `max`. Un plafond dur bloquerait « Continuer » sans
 * expliquer, alors que l'issue demande une RELANCE — « tu en as trois, au-delà
 * de deux ça ne trie plus » se dit, se discute et se maintient. Fermer la
 * porte, non : une ESN a le droit d'avoir trois priorités et de l'assumer.
 */
export const SECTEURS_NIVEAUX_ANSWER_FIELDS = {
  priority_sectors: z.array(z.string()).catch([]),
}

/**
 * Le seuil de la relance — deux.
 *
 * Il vit ICI et nulle part ailleurs (GA-26) : le détecteur de contradiction
 * (`onboarding-contradictions.ts`) et l'écran le LISENT, ils ne le recopient
 * pas. Deux est le chiffre de l'issue, et il se conteste : au-delà de deux
 * secteurs prioritaires, le mot « prioritaire » cesse de désigner un choix.
 *
 * ⚠️ Un seuil n'est pas un plafond. Rien dans ce dépôt ne REFUSE un troisième
 * secteur prioritaire — la relance nomme la tension, l'utilisateur tranche.
 */
export const PRIORITY_SECTORS_NUDGE_THRESHOLD = 2

/** Les quatre clés que la dérivation lit, telles que le profil les porte. */
type SectorAnswers = {
  target_sectors?: readonly string[] | null
  reference_sectors?: readonly string[] | null
  priority_sectors?: readonly string[] | null
  no_go_sectors?: readonly string[] | null
}

const list = (value: readonly string[] | null | undefined): readonly string[] => value ?? []

/**
 * Le niveau de CHAQUE secteur nommé par une des quatre clés — un secteur, un
 * niveau, jamais deux.
 *
 * L'ORDRE DE PRÉCÉDENCE, et sa raison :
 *  1. `no_go` — un refus explicite est une décision prise ; la contredire
 *     par une case cochée ailleurs serait donner le dernier mot au hasard de
 *     l'ordre de saisie.
 *  2. `priority` — la déclaration la plus forte de ce qui reste.
 *  3. `reference` — visé ET prouvé.
 *  4. `dormant` — prouvé, plus visé.
 *  5. `target` — visé, rien d'autre.
 *
 * L'ordre de SORTIE suit {@link SECTOR_ENGAGEMENT_LEVELS}, puis l'ordre de
 * saisie à l'intérieur d'un niveau : une liste qui changerait d'ordre entre
 * deux lectures ferait bouger un écran sans qu'aucune réponse n'ait bougé.
 */
export function sectorEngagementLevels(answers: SectorAnswers): SectorEngagement[] {
  const noGo = new Set(list(answers.no_go_sectors))
  const priority = new Set(list(answers.priority_sectors))
  const reference = new Set(list(answers.reference_sectors))
  const target = new Set(list(answers.target_sectors))

  const levelOf = (sector: string): SectorEngagementLevel => {
    if (noGo.has(sector)) return 'no_go'
    if (priority.has(sector)) return 'priority'
    if (reference.has(sector)) return target.has(sector) ? 'reference' : 'dormant'
    return 'target'
  }

  // L'univers est l'UNION des quatre clés, dédoublonnée : un secteur nommé
  // nulle part n'a pas de niveau — il n'est pas « non prioritaire », il n'a
  // pas été classé, ce qui n'est pas la même chose.
  const seen = new Set<string>()
  const universe: string[] = []
  for (const source of [
    list(answers.priority_sectors),
    list(answers.target_sectors),
    list(answers.reference_sectors),
    list(answers.no_go_sectors),
  ]) {
    for (const sector of source) {
      if (sector.trim().length === 0 || seen.has(sector)) continue
      seen.add(sector)
      universe.push(sector)
    }
  }

  const rank = (level: SectorEngagementLevel): number => SECTOR_ENGAGEMENT_LEVELS.indexOf(level)
  return universe.map(sector => ({ sector, level: levelOf(sector) })).sort((a, b) => rank(a.level) - rank(b.level))
}

/**
 * Combien de secteurs sont RÉELLEMENT prioritaires — ce que la relance compare
 * au seuil.
 *
 * Dérivé de {@link sectorEngagementLevels} et non d'un `priority_sectors.length`
 * : un secteur à la fois prioritaire et refusé est classé `no_go`, et le
 * compter comme priorité ferait dire à la relance autre chose que ce que
 * l'écran montre juste à côté.
 *
 * ⚠️ `0` ici veut dire « aucun secteur DÉCLARÉ prioritaire », jamais « la
 * question n'a pas été posée » : c'est l'appelant qui décide de se taire sur
 * une liste vide, et la relance ne se déclenche que STRICTEMENT au-dessus du
 * seuil.
 */
export function prioritySectorCount(answers: SectorAnswers): number {
  return sectorEngagementLevels(answers).filter(entry => entry.level === 'priority').length
}
