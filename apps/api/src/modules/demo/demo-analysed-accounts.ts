import airbusFile from './data/analysed-accounts/airbus.json'
import edfFile from './data/analysed-accounts/edf.json'
import renaultFile from './data/analysed-accounts/renault.json'
import thalesFile from './data/analysed-accounts/thales.json'
import { seniorityOf } from './bpce-csv-mapping'

/**
 * Les COMPTES DÉMO ANALYSÉS — Airbus, EDF, Renault, Thales (Louis, 12/10/2026).
 *
 * Avant : quatre comptes MINCES (une fiche publique et un siège de décision sans nom chacun). Désormais : des dossiers
 * alimentés par de VRAIES analyses lancées en production, épurées puis embarquées (`data/analysed-accounts/*.json`,
 * générés par `apps/api/scripts/generate-demo-analysed-accounts.mjs` — jamais édités à la main) et semées par le MÊME
 * chemin que tous les dossiers (`seedDossier`, voir `DemoSeedService.seedExtensionAccounts`).
 *
 * Ce que le fichier ne porte JAMAIS : identifiant ou état propre au compte de Louis / à la prod (ids, user_id,
 * workspace_id, assigned_to, crm_*, horodatages internes), fournisseur nommé (doctrine : nos fournisseurs ne se nomment
 * jamais), message, ni score recalculé — le score du compte et le rang de chaque contact sont ceux de l'analyse réelle.
 */

/** Un contact tel que le script le projette (déjà épuré). `null` = absent de l'analyse, jamais « 0 ». */
type AnalysedContactRow = {
  full_name: string
  title: string
  entity: string
  family: string
  decision_role: string | null
  priority: number | null
  lifecycle_state: string
  seniority: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  profile_summary: string
  why_contact: string
  key_points: string[]
}

export type AnalysedAccountFile = {
  meta: {
    exported_contacts: number
    usable_contacts: number
    deciders: number
    cap: number
    /** Contacts semés dont le nom est un prénom seul (l’export masque le nom de famille). */
    single_name_contacts: number
  }
  account: {
    siren: string | null
    naf_code: string | null
    sector: string
    employees: string
    revenue: string
    headquarters: string
    website: string
    subsidiaries: string[]
    it_challenges: unknown[]
    recent_signals: unknown[]
    priority_score: number | null
    priority_justification: string
    priority_gate: string
    gate_reason: string | null
    commercial_status: string
    bet_horizon: 'short' | 'long' | null
    raw_analysis: Record<string, unknown>
  }
  attackAngles: {
    title: string
    description: string
    entry_point: string
    is_recommended: boolean
    rank: number
  }[]
  actionPlan: { strategy_justification: string; weeks: unknown[] }
  contacts: AnalysedContactRow[]
}

/**
 * Plafond de contacts par compte (décision Louis 12/10/2026) : la démo semait déjà ~3 900 contacts et sa purge
 * prenait 14 s. On garde TOUS les décideurs puis les mieux classés — voir le script.
 */
export const ANALYSED_ACCOUNT_CONTACT_CAP = 400

/** Slug du fichier → nom du compte dans la salle (les noms des autres semis y renvoient : « Airbus », pas « AIRBUS »). */
export const ANALYSED_ACCOUNT_FILES: readonly { company_name: string; file: AnalysedAccountFile }[] = [
  { company_name: 'Airbus', file: airbusFile as unknown as AnalysedAccountFile },
  { company_name: 'EDF', file: edfFile as unknown as AnalysedAccountFile },
  { company_name: 'Renault', file: renaultFile as unknown as AnalysedAccountFile },
  { company_name: 'Thales', file: thalesFile as unknown as AnalysedAccountFile },
]

/**
 * Le rang `priority` (1 = meilleur) est celui de l'analyse ; `contact_score` n'est PAS mesuré à l'export (la production
 * le recalcule à la lecture, `ContactsService.scoreContacts`) : valeur de départ DÉRIVÉE du rang, même patron que le
 * dossier BPCE (`60 - priority * 10`), plancher 20 comme le dossier SG — jamais 0 (un 0 se lirait « mesuré, nul »).
 */
export function analysedContactScore(priority: number | null): number {
  return priority === null ? 20 : Math.max(20, 60 - priority * 10)
}

/** Un contact analysé sous la forme que sème `demoContactRow` (structurelle : assignable à `DemoContact`). */
export function analysedContactSeed(row: AnalysedContactRow) {
  return {
    full_name: row.full_name,
    photo_url: null,
    title: row.title,
    entity: row.entity,
    family: row.family,
    decision_role: row.decision_role,
    priority: row.priority,
    email: row.email,
    phone: row.phone,
    linkedin_url: row.linkedin_url,
    profile_summary: row.profile_summary,
    why_contact: row.why_contact,
    email_message: null,
    linkedin_message: null,
    contact_score: analysedContactScore(row.priority),
    // Le titre est un fait affiché ; l'ancienneté en est DÉDUITE quand l'analyse ne la porte pas (patron BPCE / Orange).
    seniority: row.seniority ?? seniorityOf(row.title, 'operationnel'),
    lifecycle_state: row.lifecycle_state,
    key_points: row.key_points,
  }
}
