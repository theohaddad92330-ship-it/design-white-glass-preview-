import type { DecisionLevelFilter, SeniorityFilter } from './discover-filters'
import { DECISION_LEVEL_FILTERS, SENIORITY_FILTERS } from './discover-filters'
import type { HeadcountRange } from './discover-types'
import { clientTerritoryRegionCodes } from './discover-offer-territory'
import { matchApplicationSectors } from './discover-sectors'

/* ------------------------------------------------------------------ */
/*  Recette 21/10 U (Louis 21/10 : « le "appliquer ta cible" doit être  */
/*  vraiment ultra complet »).                                          */
/*                                                                     */
/*  Lecture PURE des réponses brutes du profil ESN : tout ce qui se     */
/*  traduit SANS deviner en filtre du rail, et — pour le reste — le     */
/*  nom du champ avec la valeur DÉCLARÉE. Une option que la table ne    */
/*  connaît pas n'est jamais posée à l'approximation : elle se NOMME.   */
/*  Un champ vide ne fait aucune ligne.                                 */
/* ------------------------------------------------------------------ */

type AnswerValue = readonly string[] | string | null | undefined

/** Les réponses du profil que « Appliquer ma cible » lit (sous-ensemble structurel d'`EsnAnswers`). */
type AutopilotAnswers = Partial<
  Record<
    | 'priority_sectors'
    | 'target_sectors'
    | 'reference_sectors'
    | 'no_go_sectors'
    | 'ideal_client_size'
    | 'ideal_client_structure'
    | 'ideal_client_territory'
    | 'ideal_client_maturity'
    | 'ideal_client_min_deal_size'
    | 'ideal_client_max_sales_cycle'
    | 'ideal_client_accessibility'
    | 'ideal_client_referencement_constraints'
    | 'ideal_client_current_state'
    | 'target_company_types'
    | 'decision_maker_personas'
    | 'expertise_areas'
    | 'offer_domains',
    AnswerValue
  >
>

export interface AutopilotProfileInput {
  answers?: AutopilotAnswers | null
  /** `sold_seniority_levels` du portefeuille d'offre. */
  soldSeniority?: readonly string[] | null
  /** `target_site` du portefeuille d'offre — dit en clair, non filtrable ici. */
  targetSite?: { types: readonly string[]; min_headcount: number | null } | null
}

/** Un champ RENSEIGNÉ que le rail ne sait pas filtrer (ou une option que la table ne connaît pas), avec sa valeur déclarée. */
export interface AlsoNamed {
  /** Clé du champ du profil — son libellé vit sous `autopilot.also.fields.<key>`. */
  key: string
  values: string[]
}

/** Valeurs d'un champ, nettoyées : jamais de chaîne vide, jamais de doublon. */
export function answerValues(value: AnswerValue): string[] {
  const list = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  const out: string[] = []
  for (const raw of list) {
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (text && !out.includes(text)) out.push(text)
  }
  return out
}

/** Une table de traduction : les options reconnues rendent leurs valeurs, les autres sont rendues À PART. */
function translate<T>(
  values: readonly string[],
  table: (value: string) => readonly T[] | null,
): { picked: T[]; leftover: string[] } {
  const picked: T[] = []
  const leftover: string[] = []
  for (const value of values) {
    const hit = table(value)
    if (hit === null) leftover.push(value)
    else for (const item of hit) if (!picked.includes(item)) picked.push(item)
  }
  return { picked, leftover }
}

const SIZE_TO_HEADCOUNT: Readonly<Record<string, readonly HeadcountRange[]>> = {
  'Moins de 50 salariés': ['1-9', '10-49'],
  '50 à 500 salariés': ['50-249', '250-999'],
  '500 à 5 000 salariés': ['250-4999'],
  'Plus de 5 000 salariés': ['1000+'],
}

/** `ideal_client_size` → tranches du registre. Une tranche contenue dans une autre cochée est retirée (250-999 ⊂ 250-4999). */
export function headcountFromIdealSize(values: AnswerValue): { headcount: HeadcountRange[]; leftover: string[] } {
  const { picked, leftover } = translate(answerValues(values), value => SIZE_TO_HEADCOUNT[value] ?? null)
  const headcount = picked.includes('250-4999') ? picked.filter(range => range !== '250-999') : picked
  return { headcount, leftover }
}

/**
 * Interlocuteurs → niveau de décision du rail, par l'intitulé : sigle exécutif (CTO / Chief) → c_level ;
 * « Directeur… », DSI, RSSI, DAF, DRH → n1 ; « Responsable… » → n2. Un intitulé libre n'est jamais deviné.
 */
function personaLevel(persona: string): DecisionLevelFilter | null {
  const head = persona.split('/')[0]?.trim().toUpperCase() ?? ''
  if (head === 'CTO' || head.startsWith('CHIEF')) return 'c_level'
  if (['DSI', 'RSSI', 'DAF', 'DRH'].includes(head) || head.startsWith('DIRECTEUR')) return 'n1'
  if (head.startsWith('RESPONSABLE')) return 'n2'
  return null
}

const ICP_DECISION_LEVEL: Readonly<Record<string, DecisionLevelFilter | null>> = {
  cLevel: 'c_level',
  director: 'n1',
  manager: 'n2',
  operational: null,
}

export function readDecisionLevels(
  personas: AnswerValue,
  icpLevel?: string | null,
): { levels: DecisionLevelFilter[]; leftover: string[] } {
  const { picked, leftover } = translate(answerValues(personas), value => {
    const level = personaLevel(value)
    return level ? [level] : null
  })
  const fromIcp = icpLevel ? ICP_DECISION_LEVEL[icpLevel] : null
  const merged = fromIcp && !picked.includes(fromIcp) ? [...picked, fromIcp] : picked
  return { levels: DECISION_LEVEL_FILTERS.filter(level => merged.includes(level)), leftover }
}

export function readSeniorities(sold: readonly string[] | null | undefined): SeniorityFilter[] {
  return SENIORITY_FILTERS.filter(level => (sold ?? []).includes(level))
}

/** Secteurs : les libellés reconnus rendent leurs codes (via `matchApplicationSectors`), les autres se nomment. */
export function readSectorLabels(labels: AnswerValue): { codes: string[]; leftover: string[] } {
  const values = answerValues(labels)
  const codes = matchApplicationSectors(values)
  const leftover = values.filter(label => matchApplicationSectors([label]).length === 0)
  return { codes, leftover }
}

/** Les champs renseignés que le rail ne filtre pas — ordre d'affichage. */
const UNFILTERABLE_FIELDS = [
  'ideal_client_maturity',
  'ideal_client_min_deal_size',
  'ideal_client_max_sales_cycle',
  'ideal_client_accessibility',
  'ideal_client_referencement_constraints',
  'ideal_client_current_state',
  'expertise_areas',
  'offer_domains',
] as const

export function unfilterableDeclarations(
  answers: AutopilotAnswers,
  targetSite?: AutopilotProfileInput['targetSite'],
): AlsoNamed[] {
  const named: AlsoNamed[] = []
  for (const key of UNFILTERABLE_FIELDS) {
    const values = answerValues(answers[key])
    if (values.length > 0) named.push({ key, values })
  }
  const site = [
    ...(targetSite?.types ?? []),
    ...(typeof targetSite?.min_headcount === 'number' ? [`≥ ${targetSite.min_headcount}`] : []),
  ].filter(value => value.trim().length > 0)
  if (site.length > 0) named.push({ key: 'target_site', values: [...site] })
  return named
}

/** Le territoire du client idéal : IDF → région ; « peu importe » ne contraint rien ; le reste se nomme. */
export function readClientTerritory(values: AnswerValue): { regionCodes: string[]; leftover: string[] } {
  return clientTerritoryRegionCodes(answerValues(values))
}
