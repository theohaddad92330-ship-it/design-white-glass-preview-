import { z } from 'zod'
import { financeScopeInfoSchema } from './finance-scope.js'
import type { HorizonForecast, Money } from './forecast-horizons.js'
import { projectStageInSql } from './opportunity-ontology.js'
import { OPEN_PIPELINE_STAGES } from './project.js'

/**
 * #4193 (épopée #4191, lot L2) — UN COMPTEUR, UNE SOURCE, UNE DÉFINITION ÉCRITE.
 *
 * Chaque total affiché sur Affaires / Talents / Missions vient de
 * `GET /crm-counters`, jamais d'un `.filter(...).length` recalculé dans un
 * écran : deux écrans qui recomptaient chacun leur population affichaient deux
 * « missions actives » différents.
 *
 * ⚠️ Un compteur NON MESURÉ n'est pas zéro : `{ value: null, measured: false }`.
 * L'écran le nomme (`UnknownValue`), il ne l'affiche jamais « 0 ».
 */
export const CRM_COUNTER_KEYS = [
  'opportunities_active',
  'leads_to_qualify',
  'buying_signals',
  'generic_deductions',
  'pistes_to_review',
  'needs_open',
  'submissions_in_progress',
  'missions_active',
  'missions_ending_30',
  'missions_ending_60',
  'missions_ending_90',
] as const
export type CrmCounterKey = (typeof CRM_COUNTER_KEYS)[number]

/**
 * #4191 (G2) — LA population des « affaires actives », écrite UNE fois en SQL.
 *
 * `opportunities_active` (GET /crm-counters) et le dénominateur de « Projets
 * ouverts sans montant » (Pilotage) comptaient deux populations : l'un les
 * quatre étapes ouvertes du Pipe, l'autre tout `LIVE_STAGES` — intake compris,
 * archivées comprises — d'où « 453 sur 462 » face à ~15 affaires au Pipe.
 * Les deux lisent désormais ces fragments, ils ne recomptent plus à leur façon.
 * Alias imposés : `o` (opportunities) et `acc` (accounts) ; paramètre `$1` = espace.
 */
export const OPPORTUNITIES_ACTIVE_FROM_SQL = 'FROM opportunities o JOIN accounts acc ON acc.id = o.account_id'

/** Périmètre d'espace, hors comptes supprimés et affaires archivées (toutes étapes). */
export const OPPORTUNITIES_IN_WORKSPACE_SQL = `(o.workspace_id = $1 OR acc.workspace_id = $1)
            AND acc.status <> 'deleted'
            AND o.archived_at IS NULL`

/** Les affaires ACTIVES : le périmètre ci-dessus + les étapes ouvertes du Pipe (hors signé, hors intake). */
export const OPPORTUNITIES_ACTIVE_SQL = `${OPPORTUNITIES_IN_WORKSPACE_SQL}
            AND ${projectStageInSql('o.stage', OPEN_PIPELINE_STAGES)}`

/** La définition écrite de chaque compteur — celle que l'écran peut citer. */
export const CRM_COUNTER_DEFINITIONS: Readonly<Record<CrmCounterKey | 'secured_revenue_month', string>> = {
  opportunities_active:
    'Affaires des quatre étapes ouvertes du pipe (hors signé), non archivées, dans le périmètre (mon portefeuille ou équipe) : la somme des colonnes ouvertes du tableau.',
  leads_to_qualify:
    'Affaires à qualifier : affaires détectées ou potentielles que personne n’a encore reprises, hors signaux et déductions. Ce ne sont pas les pistes (voir pistes_to_review).',
  buying_signals:
    'Signaux d’achat : faits datés et sourcés qui annoncent peut-être un projet, comptés à part des pistes.',
  generic_deductions:
    'Déductions à vérifier : généralités déduites de l’analyse, sans travail humain, comptées à part des pistes.',
  pistes_to_review:
    'Pistes à revoir : détections que Bellum a repérées seul et qu’aucun humain n’a encore confirmées ni écartées — les lignes de l’onglet Pistes (« Détecté, à revoir »), le seul chiffre qui porte le mot « piste ».',
  needs_open: 'Besoins dans un statut ouvert (détecté exclu), non archivés.',
  submissions_in_progress: 'Candidatures présentées au client : statuts « soumise » et « entretien ».',
  missions_active:
    'Missions dont le statut est « en cours » (onboarding, actives, suspendues, à risque, en renouvellement, en fin).',
  missions_ending_30: 'Missions en cours dont la date de fin tombe dans les 30 prochains jours.',
  missions_ending_60: 'Missions en cours dont la date de fin tombe dans les 60 prochains jours.',
  missions_ending_90: 'Missions en cours dont la date de fin tombe dans les 90 prochains jours.',
  secured_revenue_month: 'Revenu mensuel sécurisé : scénario « pire cas déclaré » du prévisionnel du mois, par devise.',
}

export const crmCounterSchema = z
  .object({
    value: z.number().int().min(0).nullable(),
    measured: z.boolean(),
    definition_key: z.string().min(1),
  })
  .refine(counter => counter.measured === (counter.value !== null), {
    message: 'Un compteur mesuré porte une valeur ; un compteur non mesuré porte null, jamais 0.',
  })
export type CrmCounter = z.infer<typeof crmCounterSchema>

export function measuredCounter(value: number, definitionKey: string): CrmCounter {
  return { value, measured: true, definition_key: definitionKey }
}

export function unmeasuredCounter(definitionKey: string): CrmCounter {
  return { value: null, measured: false, definition_key: definitionKey }
}

/** `amounts: null` = rien de chiffrable ; jamais `[]` qu’un écran lirait « 0 € ». */
export const securedRevenueCounterSchema = z
  .object({
    measured: z.boolean(),
    amounts: z.array(z.object({ currency: z.string(), amountCents: z.number().int() })).nullable(),
    definition_key: z.string().min(1),
  })
  .refine(counter => counter.measured || counter.amounts === null, {
    message: 'Un revenu non mesuré ne porte aucun montant.',
  })

export const crmCountersResponseSchema = z.object({
  scope: financeScopeInfoSchema,
  counters: z.object(
    Object.fromEntries(CRM_COUNTER_KEYS.map(key => [key, crmCounterSchema])) as Record<
      CrmCounterKey,
      typeof crmCounterSchema
    >,
  ),
  secured_revenue_month: securedRevenueCounterSchema,
})
export type CrmCountersResponse = z.infer<typeof crmCountersResponseSchema>

/**
 * Le revenu mensuel sécurisé : le scénario « pire cas déclaré » (`downside`) du
 * prévisionnel du mois. `undefined` = aucun prévisionnel chargé (non mesuré) ;
 * `null` = mesuré, sans ligne chiffrable. Déplacé du web (`kpis.ts`) : le
 * serveur est désormais le seul à le calculer.
 */
export function securedMonthlyRevenueOf(forecast: HorizonForecast | undefined): Money[] | null | undefined {
  if (!forecast) return undefined
  return forecast.scenarios.find(entry => entry.scenario === 'downside')?.amounts ?? null
}
