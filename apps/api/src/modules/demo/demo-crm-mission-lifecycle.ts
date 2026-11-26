import type { EntityManager } from 'typeorm'

/**
 * #4196 (épopée #4191, lot L5) — le CYCLE DE VIE d'une mission, vu en salle :
 *
 *  · une mission Société Générale qui FINIT dans 25 jours, avec un avenant de
 *    prolongation ACCEPTÉ dans son historique (la fin d'avant → la fin de
 *    maintenant) ; son consultant est « en mission » et sa disponibilité tombe le
 *    lendemain de la fin. Ce consultant était ARCHIVÉ avant d'y être affecté : la
 *    fiche a été désarchivée par le démarrage, et le journal le dit ;
 *  · une mission Société Générale TERMINÉE il y a 20 jours (motif typé), dont le
 *    consultant est revenu disponible.
 *
 * Indépendant des autres semis : sans compte Société Générale ou sans cinq
 * consultants dans la salle, il ne pose rien (jamais une ligne à moitié).
 */
export const DEMO_CRM_MISSION_LIFECYCLE = {
  account: 'Société Générale',
  running: {
    label: 'Mission Société Générale — refonte du SI paiement, phase 2 (démo)',
    roleTitle: 'Architecte solutions',
    startedDaysAgo: 150,
    endsInDays: 25,
    dailyRate: 720,
    amendment: {
      effectiveDaysAgo: 30,
      previousEndsInDays: -5,
      proof: 'Avenant n°1 signé par le client (démo)',
    },
  },
  finished: {
    label: 'Mission Société Générale — audit des flux de paiement (démo)',
    roleTitle: 'Consultant data',
    startedDaysAgo: 260,
    endedDaysAgo: 20,
    dailyRate: 650,
    endReason: 'date_prevue',
  },
} as const

type Query = EntityManager['query']

export async function seedDemoCrmMissionLifecycle(
  manager: { query: Query },
  workspaceId: string,
  ownerUserId: string,
  now: number,
): Promise<void> {
  const day = 86_400_000
  const dayOnly = (offsetDays: number) => new Date(now + offsetDays * day).toISOString().slice(0, 10)
  const at = (offsetDays: number) => new Date(now + offsetDays * day).toISOString()
  const spec = DEMO_CRM_MISSION_LIFECYCLE

  const accounts = (await manager.query(
    `SELECT id FROM accounts WHERE workspace_id = $1 AND company_name = $2 LIMIT 1`,
    [workspaceId, spec.account],
  )) as { id: string }[] | undefined
  const account = accounts?.[0]
  if (!account) return
  // Les cinq premiers sont pris par les semis précédents (chaîne Orange : trois) ; on lit les deux suivants.
  const people = (await manager.query(`SELECT id FROM consultants WHERE workspace_id = $1 ORDER BY full_name LIMIT 5`, [
    workspaceId,
  ])) as { id: string }[] | undefined
  const runner = people?.[3]
  const returned = people?.[4]
  if (!runner || !returned) return
  const already = (await manager.query(`SELECT id FROM missions WHERE workspace_id = $1 AND label = $2 LIMIT 1`, [
    workspaceId,
    spec.running.label,
  ])) as { id: string }[] | undefined
  if (already && already.length > 0) return

  const insertMission = async (
    label: string,
    status: string,
    startedOn: string,
    endsOn: string,
    dailyRate: number,
    roleTitle: string,
    stageEnteredAt: string,
    endReason: string | null,
  ): Promise<string | null> => {
    const [row] = (await manager.query(
      `INSERT INTO missions
         (workspace_id, user_id, account_id, label, status, started_on, ends_on, daily_rate, contract_kind,
          role_title, owner_id, stage_entered_at, end_reason)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, 'regie', $9, $2, $10::timestamptz, $11)
       RETURNING id`,
      [
        workspaceId,
        ownerUserId,
        account.id,
        label,
        status,
        startedOn,
        endsOn,
        dailyRate,
        roleTitle,
        stageEnteredAt,
        endReason,
      ],
    )) as { id: string }[]
    return row?.id ?? null
  }

  // ── La mission en cours, prolongée ──
  const run = spec.running
  const runningId = await insertMission(
    run.label,
    'active',
    dayOnly(-run.startedDaysAgo),
    dayOnly(run.endsInDays),
    run.dailyRate,
    run.roleTitle,
    at(-run.startedDaysAgo),
    null,
  )
  if (!runningId) return
  await manager.query(
    `INSERT INTO mission_assignments (mission_id, workspace_id, consultant_id, load_percent, starts_on, status)
     VALUES ($1, $2, $3, 100, $4::date, 'active')`,
    [runningId, workspaceId, runner.id, dayOnly(-run.startedDaysAgo)],
  )
  await manager.query(
    `INSERT INTO mission_amendments
       (workspace_id, mission_id, event_type, status, effective_from, proof, previous_term, new_term,
        requested_by, approved_by, approved_at)
     VALUES ($1, $2, 'end_date_change', 'accepted', $3::date, $4, $5::jsonb, $6::jsonb, $7, $7, $8::timestamptz)`,
    [
      workspaceId,
      runningId,
      dayOnly(run.amendment.previousEndsInDays + 1),
      run.amendment.proof,
      JSON.stringify({ endsOn: dayOnly(run.amendment.previousEndsInDays), dailyRate: run.dailyRate }),
      JSON.stringify({ endsOn: dayOnly(run.endsInDays), dailyRate: run.dailyRate }),
      ownerUserId,
      at(-run.amendment.effectiveDaysAgo),
    ],
  )
  // Le consultant suit : « en mission », disponible le lendemain de la fin, fiche DÉSARCHIVÉE (tracé).
  await manager.query(
    `UPDATE consultants SET availability = 'en_mission', available_from = $3::date, archived_at = NULL, archived_reason = NULL
      WHERE id = $1 AND workspace_id = $2`,
    [runner.id, workspaceId, dayOnly(run.endsInDays + 1)],
  )
  for (const [field, oldValue, newValue] of [
    ['availability', 'indisponible', 'en_mission'],
    ['available_from', null, dayOnly(run.endsInDays + 1)],
    ['archived_at', at(-run.startedDaysAgo - 30), null],
  ] as const) {
    await manager.query(
      `INSERT INTO field_provenance (workspace_id, entity_type, entity_id, field, source, actor_id, observed_at)
       VALUES ($1, 'consultant', $2, $3, 'pipeline', $4, $5::timestamptz)
       ON CONFLICT (entity_type, entity_id, field) DO NOTHING`,
      [workspaceId, runner.id, field, ownerUserId, at(-run.startedDaysAgo)],
    )
    await manager.query(
      `INSERT INTO record_field_audit (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id, rule)
       VALUES ($1, 'consultant', $2, $3, $4, $5, 'pipeline', $6, 'mission_start')`,
      [workspaceId, runner.id, field, oldValue, newValue, ownerUserId],
    )
  }

  // ── La mission terminée, son consultant revenu disponible ──
  const fin = spec.finished
  const finishedId = await insertMission(
    fin.label,
    'completed',
    dayOnly(-fin.startedDaysAgo),
    dayOnly(-fin.endedDaysAgo),
    fin.dailyRate,
    fin.roleTitle,
    at(-fin.endedDaysAgo),
    fin.endReason,
  )
  if (!finishedId) return
  await manager.query(
    `INSERT INTO mission_assignments (mission_id, workspace_id, consultant_id, load_percent, starts_on, ends_on, status)
     VALUES ($1, $2, $3, 100, $4::date, $5::date, 'completed')`,
    [finishedId, workspaceId, returned.id, dayOnly(-fin.startedDaysAgo), dayOnly(-fin.endedDaysAgo)],
  )
  await manager.query(
    `UPDATE consultants SET availability = 'immediate', available_from = $3::date WHERE id = $1 AND workspace_id = $2`,
    [returned.id, workspaceId, dayOnly(-fin.endedDaysAgo + 1)],
  )
  for (const [field, oldValue, newValue] of [
    ['availability', 'en_mission', 'immediate'],
    ['available_from', null, dayOnly(-fin.endedDaysAgo + 1)],
  ] as const) {
    await manager.query(
      `INSERT INTO field_provenance (workspace_id, entity_type, entity_id, field, source, actor_id, observed_at)
       VALUES ($1, 'consultant', $2, $3, 'pipeline', $4, $5::timestamptz)
       ON CONFLICT (entity_type, entity_id, field) DO NOTHING`,
      [workspaceId, returned.id, field, ownerUserId, at(-fin.endedDaysAgo)],
    )
    await manager.query(
      `INSERT INTO record_field_audit (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id, rule)
       VALUES ($1, 'consultant', $2, $3, $4, $5, 'pipeline', $6, 'mission_end')`,
      [workspaceId, returned.id, field, oldValue, newValue, ownerUserId],
    )
  }
}
