import {
  contractKindSchema,
  missionChannelSchema,
  missionStatusSchema,
  renewalWindowSchema,
  type ContractKind,
  type MissionChannel,
  type MissionStatus,
  type RenewalWindow,
} from '@bellum/contracts'
import { MISSION_FACETS, type MissionFacet } from './filters'

/**
 * #2408.54 — UNE VUE ENREGISTRÉE DE « MISSIONS » ↔ l'état des filtres de
 * `MissionsPage.tsx` (lentille « En cours »).
 *
 * `filters.ts` le dit déjà : « le filtre est CLIENT, et il a le droit de
 * l'être ici » — il n'existe donc aucun `MissionSearchQuery` de contrat à
 * réutiliser comme le fait `talent-saved-view-filters.ts`. Chaque clé se
 * valide ici contre l'énumération du CONTRAT qui la porte déjà
 * (`MISSION_FACETS`, `missionStatusSchema`, `contractKindSchema`,
 * `renewalWindowSchema`) — jamais une liste recopiée à la main.
 *
 * Même contrat que `talent-saved-view-filters.ts` et
 * `open-needs/model/saved-view-filters.ts` : on enregistre le CRITÈRE, et une
 * relecture DÉFENSIVE — une clé devenue inconnue (énumération réduite,
 * facette retirée) relit « pas de critère » pour CETTE clé, jamais une
 * exception ni un filtre retransmis que le serveur refuserait.
 */
export interface MissionFilterState {
  query: string
  facets: readonly MissionFacet[]
  status: readonly MissionStatus[]
  contractKind: readonly ContractKind[]
  owner: readonly string[]
  account: readonly string[]
  consultant: readonly string[]
  endWindow: readonly RenewalWindow[]
  /**
   * #2408.52, #2408.62 — le CANAL de staffing choisi (`direct` / `partner` /
   * `subcontracting` / `portage` / `unknown`). C'est CE champ, enregistré à
   * `partner`, qui EST la vue « Partenaires/rang 2 » : aucun mécanisme
   * séparé, même résolution que #2408.56/.59/.61 via #2408.54.
   */
  channel: readonly MissionChannel[]
  /**
   * #2408.53 — la DEVISE choisie (code ISO 4217, ex. « EUR », « CHF »). Un
   * ensemble OUVERT, contrairement à `channel` juste au-dessus : validée par
   * `knownString` (même garde qu'`owner`/`account`/`consultant`), jamais
   * `knownValue` contre une énumération de contrat qui n'existe pas pour une
   * devise.
   */
  currency: readonly string[]
  /**
   * #2408.39, #2408.40 — la BU / agence du compte porteur (`businessUnitName`).
   * Ensemble OUVERT : `knownString`, comme `currency`.
   */
  businessUnit: readonly string[]
}

export function emptyMissionFilterState(): MissionFilterState {
  return {
    query: '',
    facets: [],
    status: [],
    contractKind: [],
    owner: [],
    account: [],
    consultant: [],
    endWindow: [],
    channel: [],
    currency: [],
    businessUnit: [],
  }
}

/**
 * Les filtres de l'écran → ce qu'on enregistre.
 *
 * Rend `{}` quand rien n'est filtré : c'est exactement ce que le serveur
 * refuse (« une vue sans critère est la liste complète — elle existe déjà »).
 */
export function missionFiltersToSavedRecord(state: MissionFilterState): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  if (state.query.trim().length > 0) record.query = state.query
  if (state.facets.length > 0) record.facets = [...state.facets]
  if (state.status.length > 0) record.status = [...state.status]
  if (state.contractKind.length > 0) record.contractKind = [...state.contractKind]
  if (state.owner.length > 0) record.owner = [...state.owner]
  if (state.account.length > 0) record.account = [...state.account]
  if (state.consultant.length > 0) record.consultant = [...state.consultant]
  if (state.endWindow.length > 0) record.endWindow = [...state.endWindow]
  if (state.channel.length > 0) record.channel = [...state.channel]
  if (state.currency.length > 0) record.currency = [...state.currency]
  if (state.businessUnit.length > 0) record.businessUnit = [...state.businessUnit]
  return record
}

/** La valeur si le contrat la connaît encore, sinon « pas de critère ». */
function knownValues<T extends string>(allowed: readonly T[], value: unknown): T[] {
  // Une vue enregistrée AVANT la multi-sélection porte une valeur simple : elle se relit comme une liste d'une.
  const raw = Array.isArray(value) ? value : [value]
  return raw.filter((item): item is T => typeof item === 'string' && (allowed as readonly string[]).includes(item))
}

function knownStrings(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value]
  return raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

/** Ce qu'on a enregistré → les filtres de l'écran. Défensif : voir le docblock. */
export function savedRecordToMissionFilters(record: unknown): MissionFilterState {
  const empty = emptyMissionFilterState()
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return empty
  const source = record as Record<string, unknown>

  const facets = Array.isArray(source.facets)
    ? source.facets.filter((facet): facet is MissionFacet =>
        (MISSION_FACETS as readonly string[]).includes(facet as string),
      )
    : []

  return {
    query: typeof source.query === 'string' ? source.query : empty.query,
    facets,
    status: knownValues(missionStatusSchema.options, source.status),
    contractKind: knownValues(contractKindSchema.options, source.contractKind),
    owner: knownStrings(source.owner),
    account: knownStrings(source.account),
    consultant: knownStrings(source.consultant),
    endWindow: knownValues(renewalWindowSchema.options, source.endWindow),
    channel: knownValues(missionChannelSchema.options, source.channel),
    currency: knownStrings(source.currency),
    businessUnit: knownStrings(source.businessUnit),
  }
}
