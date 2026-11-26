import type { SignalFreshness, SignalImportance, TemporalStatus } from '@bellum/contracts'
import type { SignalAngle } from './signalAngles'
import type { SignalActionGateResult } from './signalActionGate'

// #2617.1 — RETENU : classait jobs/news/legal/budget/stack/pains, qui ne
// correspondent PAS aux six catégories MÉTIER demandées par Simon. Recrutement
// et nomination étaient fondus dans « jobs » ; appel d'offres et marché public
// étaient fondus dans « budget » — deux paires que Simon veut voir séparées.
// `historique` remplace le fourre-tout `news` : un signal compris mais qui ne
// relève d'aucune des cinq catégories nommées reste visible, jamais un
// septième panier inventé.
export type WatchCategory = 'recrutement' | 'appel_offres' | 'marche_public' | 'nomination' | 'budget' | 'historique'
export type WatchScenario = 'full' | 'partial' | 'empty'

export type WatchSignal = {
  id: string
  /** #3939.a — l'identifiant posé par l'analyse (« s1 »), celui que les hypothèses
   *  citent (`based_on_signal_ids`) ; `null` sur une analyse antérieure au lien.
   *  Distinct de `id`, la clé de RENDU. */
  analysisId?: string | null
  category: WatchCategory
  date: string
  /** Deterministic age class the IA stamps on every signal (`current` |
   *  `archive` | `undated`). Surfaced next to the date as the "fraîcheur" the
   *  restitution asks for: a signal older than ~24 months is an archive, not a
   *  live "à relancer" trigger. Defaults to `undated` — never assumed current. */
  freshness: SignalFreshness
  /** #3206.3 (épopée #3240) — ADDITIF à `freshness`, jamais un remplacement :
   *  RECENT/HISTORICAL/STALE/UNDATED, calculé une seule fois par
   *  `classifyTemporalStatus` (@bellum/contracts). Distingue notamment
   *  l'archive « contexte passé encore utile » (une nomination périmée) de
   *  l'archive « trop ancienne pour agir » (une offre d'emploi périmée). */
  temporalStatus: TemporalStatus | null
  /** #4715 — l'importance à trois niveaux (`signalImportance`, @bellum/contracts) ; `null` = âge inconnu, jamais deviné. */
  importance?: SignalImportance | null
  type: string
  signal: string
  source: string
  /** #3922.3 — le lien vérifiable de la source, posé par le pipeline ; `null` = « Sans lien vérifiable ». */
  sourceUrl?: string | null
  sourceKind?: string | null
  /** #4020 / #4022 — le lieu d'une offre d'emploi, tel que collecté ; `null` = inconnu, jamais deviné. */
  location?: string | null
  /** #4733.2 — le recrutement d'un dirigeant, drapeau posé par l'IA sur l'intitulé réel (jamais deviné). */
  executiveRole?: boolean
  /** Recette 21/10 K3 — offres au même intitulé repliées en UN signal : combien, et dans quelles villes (jamais devinées). */
  offerCount?: number
  offerPlaces?: string[]
  /** #4294.6 — combien de fois le MÊME fait a été vu (>= 2) ; absent = une fois. Affichage seulement : rien n'est supprimé. */
  seenCount?: number
  /** What the signal means commercially, as produced by the analysis. Absent
   *  when the analysis did not produce one — never back-filled with a generic
   *  sentence that just repeats the title. */
  sales_implication?: string
  /** #2966 (#2119.22) — « où ? » : le périmètre (entité/filiale) que le TEXTE
   *  du signal nomme, retrouvé par correspondance textuelle contre les
   *  entités connues du compte (jamais deviné) ; à défaut, le compte
   *  lui-même — un signal est TOUJOURS au moins scopé à son compte. Jamais
   *  `null` : voir `watchData.ts::derivePerimeter`. */
  perimeter: string
  /** #2687 — ce que l'analyse propose de FAIRE de ce signal : l'offre ESN, la
   *  première action, et l'hypothèse dont elles viennent. Vide quand l'analyse
   *  n'a rattaché aucune hypothèse à ce signal — y compris sur les dossiers
   *  analysés avant que le lien existe. Jamais un angle deviné : voir
   *  `signalAngles.ts` pour pourquoi aucun repli n'est possible. */
  angles: SignalAngle[]
  /** #2952 (#2305.43/.44/.45/.47/.48) — la porte avant qu'un signal devienne
   *  une action, voir `signalActionGate.ts`. S'applique à ce que Laura
   *  RECOMMANDE (angles/implication) — jamais aux deux gestes manuels
   *  (créer un angle / ajouter au plan), qui restent l'initiative du
   *  commercial (#2119.25). */
  actionGate: SignalActionGateResult
  score?: number
  tags: string[]
}

export type WatchInsight = {
  title: string
  detail: string
}

/**
 * #3939.a — une hypothèse qualifiée de l'analyse, avec ses signaux fondateurs.
 * `confidence` est l'échelle de CONVERGENCE de l'analyse (jamais une probabilité),
 * `null` quand les signaux cités ne la fondent pas (`citesEnoughFoundingSignals`).
 */
export type WatchHypothesis = {
  hypothesis: string
  confidence: 'confirmee' | 'probable' | 'a_verifier' | null
  esnAngle?: string
  firstAction?: string
  /** Les signaux du compte que l'hypothèse cite PAR IDENTIFIANT. */
  foundingSignals: WatchSignal[]
  /** La prose de l'analyse quand aucun identifiant ne relie un signal — citée telle quelle. */
  citedSignals: string[]
}
