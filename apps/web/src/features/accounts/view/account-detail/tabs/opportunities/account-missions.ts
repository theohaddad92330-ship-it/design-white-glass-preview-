import { matchContactsForRole, proposeContactsForSignal } from './signal-contacts'
import { INTAKE_STAGES, type AnalysisScopeSelection, type Contact, type ProjectReadRow } from '@bellum/contracts'
import { accountQualificationLeads, type LeadDecisionRow } from './qualificationLeads'

/**
 * #3823 (retour de Louis, 07/10) — « LES MISSIONS POUR CE COMPTE ».
 *
 * « L'objectif final de la page, c'est me dire : à travers tout ce que j'ai trouvé sur le compte,
 * voilà les missions liées au signal, voilà qui contacter, et go. » L'onglet Opportunités est
 * RECENTRÉ, rien n'est supprimé : ce bloc se lit en tête, les signaux et les pistes restent dessous,
 * comme preuves.
 *
 * Dérivation PURE, sans appel : elle lit les MÊMES lignes que la file des pistes
 * (`GET /projects?account_id=…`, même clé React Query) et les contacts du compte.
 *
 * ⚠️ UNE MISSION SANS SIGNAL SOURCE N'EXISTE PAS (#3823.1). Il faut un fait avec sa SOURCE et sa
 * DATE : une ligne qui n'a que l'un des deux reste une piste à qualifier (la file du dessous la
 * montre), jamais une mission inventée.
 *
 * ⚠️ « À QUI S'ADRESSER » NE DEVINE PERSONNE (#3823.2 / .3). Les contacts proposés sont ceux DÉJÀ
 * connus du compte, nommés en clair (coordonnées pro en clair, c87). Quand leur titre recoupe le rôle
 * concerné, ils passent devant (`role`) ; sinon ils restent proposés comme contacts CONNUS (`known`),
 * jamais présentés comme LE bon interlocuteur ; aucun contact (`none`) se dit.
 */

/** Les champs d'un contact que le bloc lit — jamais l'entité complète. */
export type MissionContact = Pick<
  Contact,
  'id' | 'full_name' | 'title' | 'email' | 'phone' | 'location' | 'excluded_at' | 'hidden' | 'place'
>

export type AccountMission = {
  /** La clé de la ligne — celle de la piste ou de l'affaire. */
  key: string
  title: string
  /** Ce qui FONDE la mission : le fait, sa source, sa date. Toujours les trois. */
  basis: { label: string; source: string; observed_on: string }
  /** Le rôle concerné, quand la ligne le nomme. Un RÔLE, jamais une personne. */
  role: string | null
  /** `opportunity` = une affaire ouverte du pipe ; `lead` = une piste issue d'un signal. */
  origin: 'opportunity' | 'lead'
  contacts: MissionContact[]
  /** `role` : titres rapprochés du rôle ; `known` : contacts connus, rôle non rapproché ; `none` : aucun. */
  contacts_match: 'role' | 'known' | 'none'
}

type AccountMissionsInput = {
  rows: readonly ProjectReadRow[]
  decisions?: readonly LeadDecisionRow[]
  contacts: readonly MissionContact[]
  /** #4044 — le périmètre géographique déclaré du compte (dernier cadrage) ; absent = aucun lieu écarté. */
  perimeter?: AnalysisScopeSelection
  now?: Date
}

const CLOSED_STAGES: readonly string[] = ['won', 'lost', 'abandoned']

export function accountMissions(input: AccountMissionsInput): AccountMission[] {
  const missions: AccountMission[] = []

  // Les affaires OUVERTES d'abord : quelqu'un les a déjà regardées.
  const open = input.rows
    .filter(
      row =>
        !(INTAKE_STAGES as readonly string[]).includes(row.stage) &&
        !CLOSED_STAGES.includes(row.stage) &&
        !row.closed_at &&
        !row.archived_at &&
        row.kind !== 'signal',
    )
    .sort((left, right) => dateValue(right.stage_entered_at) - dateValue(left.stage_entered_at))
  for (const row of open) {
    const source = trimmed(row.source)
    const observedOn = validDate(row.first_detected_at)
    if (!source || !observedOn) continue
    const role = trimmed(row.btmmp?.management ?? null)
    missions.push(
      withContacts(
        {
          key: row.id,
          title: row.label,
          basis: { label: trimmed(row.primary_need_title ?? null) ?? row.label, source, observed_on: observedOn },
          role,
          origin: 'opportunity',
        },
        input.contacts,
        input.perimeter,
      ),
    )
  }

  // Puis les pistes ACTIVES, dans l'ordre de leur file (une piste écartée ou en veille n'est pas une mission).
  const leads = accountQualificationLeads({
    rows: input.rows,
    decisions: input.decisions,
    contactCount: input.contacts.length,
    now: input.now,
  }).active
  for (const lead of leads) {
    const fact = lead.source_facts.find(item => trimmed(item.source) && validDate(item.observed_on))
    if (!fact) continue
    missions.push(
      withContacts(
        {
          key: lead.key,
          title: lead.label,
          basis: {
            label: fact.label,
            source: trimmed(fact.source) as string,
            observed_on: validDate(fact.observed_on) as string,
          },
          role: lead.potential_role,
          origin: 'lead',
        },
        input.contacts,
        input.perimeter,
      ),
    )
  }
  return missions
}

/**
 * #3676 (recette prod 08/10, Sanofi — « Emmanuel Frenehard a présenté… » répété sur Missions,
 * Pistes ET Synthèse) — ce qu'une MISSION dit déjà, pour que `useLeadCoveredFacts` (et donc la
 * liste des signaux et « Ce que cela implique commercialement », `TabSignal.tsx`) n'en fasse pas
 * une seconde ligne. Avant ce point, cette couverture ne regardait que les PISTES
 * (`accountQualificationLeads`) : une affaire OUVERTE promue en mission (`origin: 'opportunity'`,
 * la boucle `open` ci-dessus) n'était couverte par rien, et son fait source réapparaissait,
 * intact, dans la synthèse — en plus de la mission elle-même. Dérivation PURE depuis
 * `accountMissions` (GA-26, aucun second calcul) : `contacts` n'entre jamais dans le choix des
 * faits couverts, un tableau vide suffit.
 */
export function missionCoveredFacts(
  input: Pick<AccountMissionsInput, 'rows' | 'decisions' | 'now'>,
): Pick<AccountMission['basis'], 'label' | 'source' | 'observed_on'>[] {
  return accountMissions({ rows: input.rows, decisions: input.decisions, contacts: [], now: input.now }).map(
    mission => mission.basis,
  )
}

function withContacts(
  mission: Omit<AccountMission, 'contacts' | 'contacts_match'>,
  contacts: readonly MissionContact[],
  perimeter: AnalysisScopeSelection | undefined,
): AccountMission {
  // #4044 — la sélection par fait et par périmètre vit à UN endroit (`signal-contacts.ts`).
  const { contacts: proposed, match } = proposeContactsForSignal({
    contacts,
    signal: { text: mission.basis.label, role: mission.role, location: null },
    perimeter,
  })
  return { ...mission, contacts: proposed, contacts_match: match }
}

export { matchContactsForRole }

function trimmed(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  return text ? text : null
}

function validDate(value: string | null | undefined): string | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : value.slice(0, 10)
}

function dateValue(value: string | null | undefined): number {
  const time = value ? new Date(value).getTime() : Number.NaN
  return Number.isNaN(time) ? 0 : time
}
