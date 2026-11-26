import type { AccountSize, IdealAccountProfile } from '@bellum/contracts'
import type { HeadcountRange, SignalSource } from './discover-types'
import { DEFAULT_SIGNAL_SOURCES } from './discover-types'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'
import { matchApplicationSectors } from './discover-sectors'
import {
  answerValues,
  readClientTerritory,
  readDecisionLevels,
  readSectorLabels,
  readSeniorities,
  unfilterableDeclarations,
  type AlsoNamed,
  type AutopilotProfileInput,
} from './discover-autopilot-profile'

/* ------------------------------------------------------------------ */
/*  « Lancer sans idée de départ » — la recherche que Bellum pose       */
/*  quand le commercial n'en a aucune.                                  */
/*                                                                     */
/*  Restitution V2 §17 : « ajouter un mode laisse Bellum choisir AVEC   */
/*  explication des critères ». La deuxième moitié de la phrase est la  */
/*  seule qui compte : un bouton qui lance une recherche dont on ne     */
/*  peut pas lire les critères est une boîte noire, et une boîte noire  */
/*  qui remonte des entreprises est pire qu'un formulaire vide.         */
/*                                                                     */
/*  Ce module ne fabrique donc RIEN : il traduit le profil ESN déjà     */
/*  renseigné en filtres RÉELS du rail unifié (modifiables après coup), */
/*  et rend pour chacun d'où il vient. Quand le profil ne dit rien      */
/*  d'exploitable, il le DIT et repart du marché (les signaux datés des */
/*  90 derniers jours) plutôt que d'inventer un secteur ou une taille.  */
/* ------------------------------------------------------------------ */

/** Fenêtre du repli marché. 90 j = la fenêtre par défaut du mode Signaux. */
export const AUTOPILOT_WINDOW_DAYS = 90

/**
 * Taille de compte visée → tranche d'effectif du registre.
 *
 * `all` ne se traduit pas : « toutes tailles » n'est pas un critère, c'est
 * l'absence de critère — on ne le transforme pas en tranche arbitraire.
 */
export const HEADCOUNT_FOR_SIZE: Record<AccountSize, HeadcountRange> = {
  pme: '50-249',
  eti: '250-999',
  grandCompte: '1000+',
  all: 'any',
}

/** D'où vient une valeur choisie — jamais « parce que ». Les `profile*` nomment la section du profil (U.3). */
type AutopilotOrigin =
  | 'profileSectors'
  | 'profileSize'
  | 'profileNoGo'
  | 'profileClientIdeal'
  | 'profileTargets'
  | 'profileZones'
  | 'profileInterlocutors'
  | 'profileSold'
  | 'marketWindow'
  | 'marketSources'

type AutopilotCriterionKey =
  | 'sector'
  | 'excludeSector'
  | 'headcount'
  | 'category'
  | 'excludeListed'
  | 'region'
  | 'decisionLevel'
  | 'seniority'
  | 'window'
  | 'sources'

interface AutopilotCriterion {
  /** Nom du critère, clé i18n sous `autopilot.criteria`. */
  key: AutopilotCriterionKey
  /** Valeur(s) retenue(s), dans le vocabulaire DÉJÀ affiché à l'écran. */
  valueKeys: string[]
  originKey: AutopilotOrigin
}

export interface AutopilotPlan {
  /** Le rail unifié pré-rempli — modifiable ensuite, exécutable tel quel. */
  filters: UnifiedFilters
  /** Ce sur quoi Bellum a choisi. Jamais vide — sinon le bouton ment. */
  criteria: AutopilotCriterion[]
  /** Point de départ retenu, clé i18n sous `autopilot.basis`. */
  basisKey: 'profile' | 'profileThin' | 'noProfile'
  /** « Aussi dans ta cible, sans filtre ici » — champs renseignés que le rail ne filtre pas, valeur déclarée. */
  also: AlsoNamed[]
}

/** Ajoute `values` à `list` sans doublon, en gardant l'ordre. */
function union(...lists: readonly (readonly string[])[]): string[] {
  const out: string[] = []
  for (const list of lists) for (const value of list) if (!out.includes(value)) out.push(value)
  return out
}

/**
 * Recherche de départ + son argumentaire, à partir du profil ESN.
 *
 * Deux chemins, jamais un troisième :
 *  - le profil donne un ou des secteurs reconnaissables, une taille ou une catégorie visées →
 *    cible structurée (registre) avec TOUT ce qui se traduit sans deviner (recette 21/10 U) ;
 *  - il ne donne rien d'exploitable → signaux d'intention sur 90 jours, parce que « ce qui
 *    bouge » est un point de départ qui ne présuppose aucune cible. Le `basisKey` dit lequel.
 *
 * Les affinages (zones, niveaux de décision, séniorités, exclusions) ne font JAMAIS une cible
 * seuls : ils précisent une cible qui existe.
 */
export function autopilotPlan(
  icp?: IdealAccountProfile | null,
  /**
   * #3528 (Louis 01/10) — les zones de chasse DÉCLARÉES (`huntingRegionCodes`, déjà des codes
   * région du rail). Vide = aucune contrainte de territoire, jamais « France entière » devinée.
   */
  offerRegionCodes: readonly string[] = [],
  /**
   * LUDB.2 — les secteurs DÉCLARÉS au portefeuille d'offre (codes normalisés).
   */
  offerSectorCodes: readonly string[] = [],
  /** Recette 21/10 U.1 — les réponses brutes du profil (`useEsnProfile`) et du portefeuille d'offre. */
  profile: AutopilotProfileInput = {},
): AutopilotPlan {
  const answers = profile.answers ?? {}

  const priority = readSectorLabels(answers.priority_sectors)
  const targetSectors = readSectorLabels(answers.target_sectors)
  const reference = readSectorLabels(answers.reference_sectors)
  const sectors = union(
    priority.codes,
    offerSectorCodes,
    // LUDB.2 — les secteurs du portefeuille priment sur ceux du contexte généré (défauts Fintech/Éditeurs du QCM IT).
    icp && offerSectorCodes.length === 0 ? matchApplicationSectors(icp.sectorsPriority ?? []) : [],
    targetSectors.codes,
    reference.codes,
  )
  const noGo = readSectorLabels(answers.no_go_sectors)
  const excludeSectors = noGo.codes.filter(code => !sectors.includes(code))

  // #4516.6 (Louis 24/10) — l'autopilote ne pose AUCUNE taille : la taille déclarée (`ideal_client_size`) est NOMMÉE
  // (« aussi déclaré »), jamais un filtre. Revient sur `headcountFromIdealSize` et la taille du profil d'ici.
  const declaredSizes = answerValues(answers.ideal_client_size)
  // #4529.9 (Louis 25/10) — « Ma cible » ne pose NI taille NI catégorie : « par défaut ils n'y sont pas, jamais dit
  // d'enlever des filtres ». Ce que le profil déclare (types d'entreprise, structure) est NOMMÉ, jamais un filtre ;
  // le sélecteur reste ajoutable à la main.
  const territory = readClientTerritory(answers.ideal_client_territory)
  const { levels: decisionLevels } = readDecisionLevels(answers.decision_maker_personas, icp?.decisionLevel)
  const seniorities = readSeniorities(profile.soldSeniority)
  const personas = readDecisionLevels(answers.decision_maker_personas, null)

  const also: AlsoNamed[] = []
  const nameLeftover = (key: string, values: readonly string[]) => {
    if (values.length > 0) also.push({ key, values: [...values] })
  }
  nameLeftover('priority_sectors', priority.leftover)
  nameLeftover('target_sectors', targetSectors.leftover)
  nameLeftover('reference_sectors', reference.leftover)
  nameLeftover('no_go_sectors', noGo.leftover)
  nameLeftover('ideal_client_size', declaredSizes)
  nameLeftover('target_company_types', answerValues(answers.target_company_types))
  nameLeftover('ideal_client_structure', answerValues(answers.ideal_client_structure))
  nameLeftover('ideal_client_territory', territory.leftover)
  nameLeftover('decision_maker_personas', personas.leftover)
  also.push(...unfilterableDeclarations(answers, profile.targetSite))

  const criteria: AutopilotCriterion[] = []
  const hasBase = sectors.length > 0
  if (sectors.length > 0) {
    // Préfixé `sector:` — ce n'est PAS une clé i18n mais un code du vocabulaire partagé.
    criteria.push({ key: 'sector', valueKeys: sectors.map(sector => `sector:${sector}`), originKey: 'profileSectors' })
  }
  if (hasBase && excludeSectors.length > 0) {
    criteria.push({
      key: 'excludeSector',
      valueKeys: excludeSectors.map(sector => `sector:${sector}`),
      originKey: 'profileNoGo',
    })
  }
  // Les zones ne sont posées qu'AVEC une cible de profil : seules, elles ne feraient pas un point de départ.
  const region = hasBase ? [...offerRegionCodes] : []
  if (region.length > 0) {
    criteria.push({ key: 'region', valueKeys: region.map(code => `region:${code}`), originKey: 'profileZones' })
  }
  const levels = hasBase ? decisionLevels : []
  if (levels.length > 0) {
    criteria.push({
      key: 'decisionLevel',
      valueKeys: levels.map(level => `filters.decisionLevelValue.${level}`),
      originKey: 'profileInterlocutors',
    })
  }
  const senior = hasBase ? seniorities : []
  if (senior.length > 0) {
    criteria.push({
      key: 'seniority',
      valueKeys: senior.map(level => `rail.seniority.${level}`),
      originKey: 'profileSold',
    })
  }

  if (criteria.length > 0) {
    return {
      filters: {
        ...emptyUnifiedFilters(),
        sectors,
        excludeSectors: hasBase ? excludeSectors : [],
        region,
        decisionLevels: levels,
        seniorities: senior,
      },
      criteria,
      basisKey: 'profile',
      also,
    }
  }

  const sources: SignalSource[] = [...DEFAULT_SIGNAL_SOURCES]
  return {
    filters: { ...emptyUnifiedFilters(), signalSources: sources, sinceDays: AUTOPILOT_WINDOW_DAYS },
    criteria: [
      { key: 'window', valueKeys: [`signalsMode.recency.${AUTOPILOT_WINDOW_DAYS}`], originKey: 'marketWindow' },
      { key: 'sources', valueKeys: sources.map(source => `signalTypes.${source}`), originKey: 'marketSources' },
    ],
    basisKey: icp ? 'profileThin' : 'noProfile',
    also,
  }
}
