import { z } from 'zod'
import type { MissionStatus } from './mission.js'

/**
 * #2338 (DOUBLE ACCORD CLIENT / CONSULTANT) + #2409 (CHECKLIST DE DÉMARRAGE J1)
 * — ce qu'une mission doit réunir avant de passer « prête à démarrer ».
 *
 * Tranché sans Louis (23/09, décision §12 : on applique la reco) :
 * - la CRÉATION d'une mission reste libre — ses trois appelants (formulaire,
 *   geste `create_mission` d'un projet gagné, matching) ne sont jamais bloqués ;
 *   une mission née sans les deux accords porte « accords à confirmer » ;
 * - le PASSAGE au démarrage (`ready_to_start`, ou le saut `onboarding → active`)
 *   est REFUSÉ tant qu'un prérequis BLOQUANT manque — et le refus NOMME chacun ;
 * - un prérequis DÉCLARÉ est un geste humain daté, avec son auteur et sa
 *   preuve (#2409.7) ; un prérequis DÉRIVÉ se lit sur la mission elle-même ;
 * - catalogue MINIMAL et sobre (7 items), pas les 13 + 10 du PDF : chacun
 *   répond à « peut-on laisser le consultant arriver lundi ? ».
 *
 * Un seul endroit (GA-26) : l'API juge avec ce module, l'écran l'affiche.
 */

/** Le délai au-delà duquel un ACCORD repasse « à revalider » (#2338.9). */
export const MISSION_AGREEMENT_REVALIDATE_AFTER_DAYS = 60

export const MISSION_START_ITEMS = [
  // Les deux rails de #2338 — l'un sans l'autre ne fait pas une mission.
  { key: 'client_agreement', kind: 'declared', blocking: true, side: 'client', agreement: true },
  { key: 'consultant_agreement', kind: 'declared', blocking: true, side: 'consultant', agreement: true },
  // Contrat / bon de commande signé — sans lui on ne facture rien de ce qui est produit.
  { key: 'contract_signed', kind: 'declared', blocking: true, side: 'client', agreement: false },
  { key: 'consultant_assigned', kind: 'derived', blocking: true, side: 'consultant', agreement: false },
  { key: 'start_date', kind: 'derived', blocking: true, side: 'internal', agreement: false },
  // Réserves : leur absence n'empêche pas le démarrage, elle se NOMME.
  { key: 'daily_rate', kind: 'derived', blocking: false, side: 'internal', agreement: false },
  { key: 'site_access', kind: 'declared', blocking: false, side: 'client', agreement: false },
] as const

export type MissionStartItemKey = (typeof MISSION_START_ITEMS)[number]['key']

export const MISSION_START_DECLARED_KEYS = [
  'client_agreement',
  'consultant_agreement',
  'contract_signed',
  'site_access',
] as const
export type MissionStartDeclaredKey = (typeof MISSION_START_DECLARED_KEYS)[number]

/** Un geste humain enregistré (non archivé). */
export interface MissionStartDeclared {
  key: MissionStartDeclaredKey
  confirmedAt: string
  confirmedBy: string
  proof: string
}

export interface MissionStartData {
  consultantAssigned: boolean
  startDate: string | null
  /** `null` = non saisi — jamais 0. */
  dailyRate: number | null
}

type MissionStartItemState = 'done' | 'missing' | 'stale'

export interface MissionStartItem {
  key: MissionStartItemKey
  kind: 'declared' | 'derived'
  blocking: boolean
  side: 'client' | 'consultant' | 'internal'
  state: MissionStartItemState
  confirmedAt: string | null
  confirmedBy: string | null
  proof: string | null
}

/** #2409.6 — quatre issues, jamais une probabilité. */
export type MissionStartVerdict = 'ready' | 'ready_with_reserves' | 'blocked' | 'incomplete'

export interface MissionStartReadiness {
  verdict: MissionStartVerdict
  /** #2338 — au moins un des deux accords manque ou est à revalider. */
  agreementsPending: boolean
  /** Les prérequis BLOQUANTS qui manquent, nommés, dans l'ordre du catalogue. */
  missing: MissionStartItemKey[]
  /** Les réserves qui manquent — n'empêchent pas le démarrage. */
  reserves: MissionStartItemKey[]
  items: MissionStartItem[]
}

/**
 * La porte ne s'applique qu'au PASSAGE au démarrage : entrer en
 * `ready_to_start`, ou sauter d'`onboarding`/`draft` à `active`. Jamais à la
 * création, à une annulation, ni à une mission déjà en cours (une mission
 * `ready_to_start` a déjà franchi la porte — la refermer sur une donnée en
 * place surprendrait des missions existantes).
 */
/**
 * #2409.8 / #2409.9 — les statuts AVANT démarrage : ceux d'où la porte
 * ({@link startGateApplies}) fait passer une mission au démarrage. Un seul
 * endroit (GA-26) : la sonde de Laura les lit ici.
 */
export const MISSION_PRE_START_STATUSES = [
  'draft',
  'onboarding',
  'ready_to_start',
] as const satisfies readonly MissionStatus[]

/**
 * #2409.8 — ce que la carte de Laura porte quand elle annonce un démarrage
 * incomplet : la mission la plus proche et ses manques NOMMÉS (des clés, jamais
 * une phrase — l'écran compose dans sa langue). Jugés par
 * {@link computeMissionStartReadiness}, jamais recalculés.
 */
export interface MissionStartAnnouncement {
  missionId: string
  label: string
  startsOn: string
  verdict: MissionStartVerdict
  missing: MissionStartItemKey[]
  reserves: MissionStartItemKey[]
}

/** #2409.8 — Laura annonce une checklist incomplète dans les N jours qui précèdent la date de début saisie. */
export const MISSION_START_ANNOUNCE_WINDOW_DAYS = 14

/**
 * #2409.9 — « confirmer l'arrivée J1 sans harceler » : Laura le dit de J0 à
 * J+N, puis se tait. Elle ne contacte jamais le consultant ni le client.
 */
export const MISSION_DAY_ONE_CONFIRM_WINDOW_DAYS = 2

export function startGateApplies(from: MissionStatus, to: MissionStatus): boolean {
  if (to === 'ready_to_start') return from !== 'ready_to_start'
  return to === 'active' && (from === 'draft' || from === 'onboarding')
}

export function computeMissionStartReadiness(input: {
  declared: readonly MissionStartDeclared[]
  data: MissionStartData
  now: Date
}): MissionStartReadiness {
  const staleBefore = input.now.getTime() - MISSION_AGREEMENT_REVALIDATE_AFTER_DAYS * 86_400_000
  const items: MissionStartItem[] = MISSION_START_ITEMS.map(def => {
    const base = { key: def.key, kind: def.kind, blocking: def.blocking, side: def.side }
    if (def.kind === 'derived') {
      const ok =
        def.key === 'consultant_assigned'
          ? input.data.consultantAssigned
          : def.key === 'start_date'
            ? Boolean(input.data.startDate)
            : input.data.dailyRate !== null && input.data.dailyRate !== undefined
      return { ...base, state: ok ? 'done' : 'missing', confirmedAt: null, confirmedBy: null, proof: null }
    }
    const row = input.declared.find(d => d.key === def.key)
    if (!row) return { ...base, state: 'missing', confirmedAt: null, confirmedBy: null, proof: null }
    const stale = def.agreement && new Date(row.confirmedAt).getTime() < staleBefore
    return {
      ...base,
      state: stale ? 'stale' : 'done',
      confirmedAt: row.confirmedAt,
      confirmedBy: row.confirmedBy,
      proof: row.proof,
    }
  })

  const missing = items.filter(i => i.blocking && i.state !== 'done').map(i => i.key)
  const reserves = items.filter(i => !i.blocking && i.state !== 'done').map(i => i.key)
  const agreementsPending = items.some(
    i => (i.key === 'client_agreement' || i.key === 'consultant_agreement') && i.state !== 'done',
  )
  // Un DOSSIER incomplet (donnée absente) se répare sur la mission ; un geste
  // manquant se répare auprès du client ou du consultant — deux issues.
  const dataMissing = items.some(i => i.blocking && i.kind === 'derived' && i.state !== 'done')
  const verdict: MissionStartVerdict = dataMissing
    ? 'incomplete'
    : missing.length > 0
      ? 'blocked'
      : reserves.length > 0
        ? 'ready_with_reserves'
        : 'ready'
  return { verdict, agreementsPending, missing, reserves, items }
}

/** #2409.7 — cocher un prérequis DÉCLARÉ exige une preuve (mail, BdC, date d'appel…). */
export const missionStartCheckInputSchema = z.object({
  item: z.enum(MISSION_START_DECLARED_KEYS),
  proof: z.string().trim().min(3).max(500),
})
export type MissionStartCheckInput = z.infer<typeof missionStartCheckInputSchema>
