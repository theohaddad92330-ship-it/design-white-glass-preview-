import type { EntityManager } from 'typeorm'

/**
 * #4193 (épopée #4191, lot L2) — PARITÉ DÉMO des compteurs « finit sous 30 / 60 / 90 jours ».
 *
 * `GET /crm-counters` compte les missions EN COURS dont `ends_on` tombe dans
 * J+30 / J+60 / J+90. Sans mission datée dans chaque fenêtre, les puces
 * « finit sous 30 jours » de Planification et le cockpit Missions se liraient
 * vides en réunion. Six missions fictives, au moins une par fenêtre sur SNCF et
 * sur Orange (deux comptes que la démo porte déjà). Aucun consultant n'est
 * inventé : des missions en régie, sans affectation.
 */
type DemoCrmCounterMission = {
  account: 'SNCF' | 'Orange'
  label: string
  /** Jours entre aujourd'hui et la fin de la mission (> 0 = dans le futur). */
  ends_in_days: number
  started_days_ago: number
  daily_rate: number
  role_title: string
}

export const DEMO_CRM_COUNTER_MISSIONS: readonly DemoCrmCounterMission[] = [
  {
    account: 'SNCF',
    label: 'SNCF — recette applicative lot A',
    ends_in_days: 18,
    started_days_ago: 150,
    daily_rate: 620,
    role_title: 'Responsable de recette',
  },
  {
    account: 'SNCF',
    label: 'SNCF — migration reporting voyageurs',
    ends_in_days: 47,
    started_days_ago: 200,
    daily_rate: 640,
    role_title: 'Data engineer',
  },
  {
    account: 'SNCF',
    label: 'SNCF — cadrage plateforme billettique',
    ends_in_days: 82,
    started_days_ago: 120,
    daily_rate: 700,
    role_title: 'Architecte',
  },
  {
    account: 'Orange',
    label: 'Orange — support N3 réseau cœur',
    ends_in_days: 24,
    started_days_ago: 300,
    daily_rate: 590,
    role_title: 'Ingénieur support N3',
  },
  {
    account: 'Orange',
    label: 'Orange — refonte portail partenaires',
    ends_in_days: 55,
    started_days_ago: 140,
    daily_rate: 610,
    role_title: 'Développeur full stack',
  },
  {
    account: 'Orange',
    label: 'Orange — observabilité plateforme IA',
    ends_in_days: 88,
    started_days_ago: 90,
    daily_rate: 680,
    role_title: 'SRE',
  },
]

const DAY_MS = 86_400_000

/**
 * Sème les missions des fenêtres. Un compte absent est SAUTÉ et non inventé : la
 * salle de démo se remet à neuf par un semis neuf, et les gardes (`demo-crm-counters.spec.ts`)
 * lisent le jeu de données, pas la base.
 */
export async function seedDemoCrmCounters(
  manager: EntityManager,
  workspaceId: string,
  ownerUserId: string,
  now: number,
): Promise<void> {
  for (const mission of DEMO_CRM_COUNTER_MISSIONS) {
    const [account] = await manager.query<{ id: string }[]>(
      `SELECT id FROM accounts WHERE workspace_id = $1 AND company_name = $2 LIMIT 1`,
      [workspaceId, mission.account],
    )
    if (!account) continue
    const day = (offset: number) => new Date(now + offset * DAY_MS).toISOString().slice(0, 10)
    await manager.query(
      `INSERT INTO missions
         (workspace_id, user_id, account_id, label, status, started_on, ends_on, daily_rate,
          contract_kind, role_title, owner_id, stage_entered_at)
       VALUES ($1, $2, $3, $4, 'active', $5::date, $6::date, $7::numeric, 'regie', $8, $2, $9::timestamptz)`,
      [
        workspaceId,
        ownerUserId,
        account.id,
        mission.label,
        day(-mission.started_days_ago),
        day(mission.ends_in_days),
        mission.daily_rate,
        mission.role_title,
        new Date(now - mission.started_days_ago * DAY_MS).toISOString(),
      ],
    )
  }
}
