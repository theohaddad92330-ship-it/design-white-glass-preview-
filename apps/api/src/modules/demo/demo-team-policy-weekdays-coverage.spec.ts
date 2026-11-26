import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  TEAM_POLICY_DAILY_CALLS_BOUNDS,
  TEAM_POLICY_MAX_MEETINGS_BOUNDS,
  TEAM_POLICY_WINDOWS_MAX,
  teamPolicySchema,
  type TeamPolicyWindow,
} from '@bellum/contracts'
import { DEMO_TEAM_POLICY } from './demo-dataset'

/**
 * #2770.37 (craft rule n°9) — LA POLITIQUE D'ÉQUIPE DE LA SALLE PORTE UNE PLAGE PAR JOUR.
 *
 * « 12:00–14:00 (lun.) » : la pause déjeuner du lundi. Laura lit cette plage par le pont
 * (`forLaura` → `_team_policy_windows` → `_team_policy_for_day`, `apps/ia/.../chat_tools.py`) ;
 * sa preuve côté moteur vit dans `test_focus_plan_tools_and_team_policy.py`
 * (`test_the_demo_monday_lunch_window_is_never_proposed_on_a_monday`).
 *
 * ⚠️ Ce que cette garde tient et qu'une spec mockée ne voit pas : la donnée semée DOIT passer les
 * CHECK SQL de `workspace_team_policy_settings` (migration `1796440017293`). Les bornes sont relues
 * DANS LE FICHIER de la migration, pas recopiées ici.
 */
describe('parité démo — politique d’équipe, plages par jour', () => {
  const migration = readFileSync(
    join(__dirname, '..', '..', 'migrations', '1796440017293-WorkspaceTeamPolicySettings.ts'),
    'utf8',
  )
  const lunch = (w: TeamPolicyWindow) => w.startMinute === 720 && w.endMinute === 840

  it('la garde LIT quelque chose — la migration porte bien les CHECK qu’on éprouve', () => {
    expect(migration).toContain('jsonb_array_length(forbidden_windows) <= 4')
    expect(migration).toContain('jsonb_array_length(prospecting_windows) <= 4')
    expect(migration).toContain('max_meetings_per_day >= 1 AND max_meetings_per_day <= 12')
    expect(migration).toContain('daily_call_target >= 1 AND daily_call_target <= 200')
  })

  it('la politique semée porte « 12:00–14:00 (lun.) » — un jour nommé, ISO 1', () => {
    const monday = DEMO_TEAM_POLICY.forbiddenWindows.filter(lunch)
    expect(monday).toEqual([{ startMinute: 720, endMinute: 840, weekdays: [1] }])
  })

  it('elle reste une politique VALIDE (contrat strict, aucun chevauchement un même jour)', () => {
    expect(teamPolicySchema.safeParse(DEMO_TEAM_POLICY).success).toBe(true)
  })

  it('elle passe les CHECK SQL de la table (longueurs et bornes de la migration)', () => {
    expect(TEAM_POLICY_WINDOWS_MAX).toBe(4)
    expect(DEMO_TEAM_POLICY.prospectingWindows.length).toBeLessThanOrEqual(4)
    expect(DEMO_TEAM_POLICY.forbiddenWindows.length).toBeLessThanOrEqual(4)
    const meetings = DEMO_TEAM_POLICY.maxMeetingsPerDay
    const calls = DEMO_TEAM_POLICY.dailyCallTarget
    expect(meetings).not.toBeNull()
    expect(calls).not.toBeNull()
    expect(meetings ?? 0).toBeGreaterThanOrEqual(TEAM_POLICY_MAX_MEETINGS_BOUNDS.min)
    expect(meetings ?? 99).toBeLessThanOrEqual(TEAM_POLICY_MAX_MEETINGS_BOUNDS.max)
    expect(calls ?? 0).toBeGreaterThanOrEqual(TEAM_POLICY_DAILY_CALLS_BOUNDS.min)
    expect(calls ?? 999).toBeLessThanOrEqual(TEAM_POLICY_DAILY_CALLS_BOUNDS.max)
  })

  it('le semis écrit du JSONB : les jours survivent à `JSON.stringify` (ce que `DemoSeedService` passe à `$3::jsonb`)', () => {
    const written: unknown = JSON.parse(JSON.stringify(DEMO_TEAM_POLICY.forbiddenWindows))
    expect(written).toEqual(DEMO_TEAM_POLICY.forbiddenWindows)
    expect(JSON.stringify(written)).toContain('"weekdays":[1]')
  })

  it('la garde sait dire NON — une politique à plage-lundi en double, ou à cinq plages, est refusée', () => {
    const clash = {
      ...DEMO_TEAM_POLICY,
      forbiddenWindows: [...DEMO_TEAM_POLICY.forbiddenWindows, { startMinute: 780, endMinute: 900, weekdays: [1] }],
    }
    expect(teamPolicySchema.safeParse(clash).success).toBe(false)
    const five = {
      ...DEMO_TEAM_POLICY,
      forbiddenWindows: [1, 2, 3, 4, 5].map(day => ({ startMinute: 720, endMinute: 840, weekdays: [day] })),
    }
    expect(teamPolicySchema.safeParse(five).success).toBe(false)
  })
})
