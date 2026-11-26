import { focusPlanSchema, focusWeekPlanSchema } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FocusPlanCard } from '@/features/chat/view/FocusPlanCard'
import { WeeklyPlanCard } from '@/features/chat/view/WeeklyPlanCard'
import { DEMO_CHAT_PROMPTS } from './demo-chat-script'
import { DEMO_PLAN_TEAM_POLICY, demoDayPlan, demoWeeklyPlan, demoWeeklyPlanAction } from './demo-weekly-plan'

vi.mock('@/features/briefing/api', () => ({
  useConfirmFocusPlanBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelFocusPlanBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useSetFocusPlanBlockOutcome: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => true }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/** #2770 (recette 03/10) — la carte « Plan de la semaine » se voit en salle, sur la question exacte de la recette. */
describe('demoWeeklyPlan', () => {
  // Un mercredi 07/10/2026 à midi (Paris) : la semaine en cours, mercredi → vendredi à planifier.
  const wednesday = new Date('2026-10-07T10:00:00Z')

  it('respecte le contrat du plan de semaine', () => {
    expect(focusWeekPlanSchema.safeParse(demoWeeklyPlan(wednesday)).success).toBe(true)
  })

  it('ne planifie jamais un jour passé, et place les trois relances au plus tard jeudi', () => {
    const plan = demoWeeklyPlan(wednesday)
    expect(plan.week_start).toBe('2026-10-05')
    expect(plan.days.map(day => day.date)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09'])
    const relances = plan.days.flatMap(day => day.blocks).filter(block => block.type === 'follow_ups')
    expect(relances).toHaveLength(3)
    expect(relances.every(block => block.deadline === '2026-10-08')).toBe(true)
    // La revue de pipe ferme la semaine, après les relances.
    expect(plan.days.at(-1)?.blocks.map(block => block.type)).toEqual(['pipeline_review'])
  })

  it('un vendredi, on vise la semaine SUIVANTE : jamais une échéance déjà passée', () => {
    const plan = demoWeeklyPlan(new Date('2026-10-09T10:00:00Z'))
    expect(plan.week_start).toBe('2026-10-12')
    expect(plan.days[0]?.date).toBe('2026-10-12')
  })

  it('une marge reste toujours, jamais toute la capacité', () => {
    const plan = demoWeeklyPlan(wednesday)
    expect(plan.margin_minutes).toBeGreaterThan(0)
  })

  it('est servie par la question EXACTE de la recette, en action `propose_weekly_plan`', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-weekly-plan')
    expect(prompt?.question).toBe('Organise-moi ma semaine : trois relances avant jeudi et une revue de pipe.')
    const [action] = prompt?.pendingActions?.() ?? []
    expect(action?.action).toBe('propose_weekly_plan')
    expect(demoWeeklyPlanAction(wednesday).action).toBe('propose_weekly_plan')
  })

  // #2770 — la marge et « rien n'est ajouté » sont portés par la CARTE ; la prose de Laura ne les répète pas.
  it('la prose de Laura ne redit ni la marge ni « rien n’est ajouté » (la carte les porte)', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-weekly-plan')
    const answer = prompt?.answer ?? ''
    expect(answer).not.toMatch(/marge/i)
    expect(answer).not.toMatch(/rien n[’']est (ajouté|créé)/i)
    expect(answer).toMatch(/SNCF/)
  })

  it('la VRAIE carte du plan de semaine le rend : les relances nommées, la revue de pipe, aucun rendez-vous déplacé', () => {
    render(<WeeklyPlanCard plan={demoWeeklyPlan(wednesday)} />)
    expect(screen.getByText('Relancer SNCF sur le point en attente')).toBeInTheDocument()
    expect(screen.getByText('Revue de pipe de la semaine')).toBeInTheDocument()
  })

  it('#2770.35/.36/.37 — comme en production, la carte de démo nomme ce qu’elle a lu et ce qu’elle n’a pas lu', () => {
    render(<WeeklyPlanCard plan={demoWeeklyPlan(wednesday)} />)
    expect(screen.getByText('Non pris en compte : ton rôle.')).toBeInTheDocument()
    expect(screen.getByText('Outils branchés pris en compte : agenda, messagerie.')).toBeInTheDocument()
    expect(screen.getByText(/^Politique d’équipe : prospection protégée 08:30–10:00/)).toBeInTheDocument()
  })
})

/**
 * #2770.69 — PREUVE ÉCRAN : « Organise-moi ma journée » rend, en salle, un plan HORODATÉ par la vraie
 * `FocusPlanCard` — jamais un bloc dans le passé, jamais deux blocs l'un sur l'autre, une marge laissée.
 */
describe('demoDayPlan', () => {
  // Mercredi 07/10/2026, 11 h 10 à Paris.
  const morning = new Date('2026-10-07T09:10:00Z')

  it('respecte le contrat du plan de journée et nomme ce qu’il ne lit pas', () => {
    const plan = demoDayPlan(morning)
    expect(focusPlanSchema.safeParse(plan).success).toBe(true)
    // #2770.35/.37 — comme en production depuis le 11/10 : outils et politique lus, le rôle reste non lu (c76).
    expect(plan.unread_sources).toEqual(['role'])
    expect(plan.team_policy).toEqual(DEMO_PLAN_TEAM_POLICY)
  })

  it('#2770.37 — aucun bloc de la salle ne tombe dans un créneau interdit ni, hors prospection, dans la plage protégée', () => {
    const parisMinute = (iso: string) => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(iso))
      return (
        Number(parts.find(p => p.type === 'hour')?.value) * 60 + Number(parts.find(p => p.type === 'minute')?.value)
      )
    }
    const overlaps = (start: number, end: number, w: { start_minute: number; end_minute: number }) =>
      start < w.end_minute && w.start_minute < end
    for (const now of [morning, new Date('2026-10-07T16:30:00Z')]) {
      for (const block of demoDayPlan(now).blocks) {
        const start = parisMinute(block.start_iso ?? '')
        const end = start + block.duration_minutes
        // Mercredi (ISO 3) : la plage « lun. » ne vaut pas ce jour-là.
        for (const w of DEMO_PLAN_TEAM_POLICY.forbidden_windows.filter(w => !w.weekdays || w.weekdays.includes(3)))
          expect(overlaps(start, end, w)).toBe(false)
        if (block.type !== 'follow_ups' && block.type !== 'call_session') {
          for (const w of DEMO_PLAN_TEAM_POLICY.prospecting_windows) expect(overlaps(start, end, w)).toBe(false)
        }
      }
    }
  })

  it('#2770.37 — un LUNDI, aucun bloc du plan de la salle ne tombe dans la plage « 12:00–14:00 (lun.) »', () => {
    // Lundi 12/10/2026, 8 h 00 à Paris : les 145 min de blocs partis de 10 h toucheraient 12 h sans la plage.
    const monday = new Date('2026-10-12T06:00:00Z')
    const lunch = DEMO_PLAN_TEAM_POLICY.forbidden_windows.find(w => w.weekdays?.includes(1))
    expect(lunch).toMatchObject({ start_minute: 720, end_minute: 840, weekdays: [1] })
    const plan = demoDayPlan(monday)
    expect(plan.date).toBe('2026-10-12')
    expect(plan.blocks.length).toBeGreaterThanOrEqual(3)
    for (const block of plan.blocks) {
      const start = new Date(block.start_iso ?? '')
      const end = new Date(start.getTime() + block.duration_minutes * 60_000)
      const noon = new Date('2026-10-12T10:00:00Z') // 12 h Paris
      const two = new Date('2026-10-12T12:00:00Z') // 14 h Paris
      expect(start < two && noon < end).toBe(false)
    }
    // Un mercredi, la plage du lundi ne retire rien : le plan part de 11 h 30 et traverse midi.
    const wednesdayPlan = demoDayPlan(morning)
    expect(wednesdayPlan.blocks.some(b => b.start_iso === '2026-10-07T09:30:00.000Z')).toBe(true)
  })

  it('chaque bloc est horodaté, après maintenant, dans l’ordre, sans chevauchement, avec une marge', () => {
    const plan = demoDayPlan(morning)
    expect(plan.date).toBe('2026-10-07')
    expect(plan.blocks.length).toBeGreaterThanOrEqual(3)
    let previousEnd = morning.getTime()
    for (const block of plan.blocks) {
      const start = Date.parse(block.start_iso ?? '')
      const end = Date.parse(block.end_iso ?? '')
      expect(start).toBeGreaterThanOrEqual(previousEnd)
      expect(end - start).toBe(block.duration_minutes * 60_000)
      previousEnd = end
    }
    expect(plan.margin_minutes).toBeGreaterThan(0)
  })

  it('un soir, la journée restante ne suffit plus : le plan vise le lendemain, jamais le passé', () => {
    const plan = demoDayPlan(new Date('2026-10-07T16:30:00Z'))
    expect(plan.date).toBe('2026-10-08')
    expect(Date.parse(plan.blocks[0]?.start_iso ?? '')).toBeGreaterThan(Date.parse('2026-10-07T16:30:00Z'))
  })

  it('la VRAIE carte le rend avec ses horaires (« 11:30–12:30 ») et le bloc de revue manager', () => {
    render(<FocusPlanCard plan={demoDayPlan(morning)} />)
    // La ligne de politique d’équipe porte aussi des plages horaires : seules les lignes QUI COMMENCENT par un horaire sont des blocs.
    expect(screen.getAllByText(/^\d{2}:\d{2}–\d{2}:\d{2}/).length).toBe(demoDayPlan(morning).blocks.length)
    expect(screen.getByText('Revue manager')).toBeInTheDocument()
  })

  it('est servie par la question « Organise-moi ma journée », en action `propose_focus_plan`', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-day-plan')
    expect(prompt?.question).toBe('Organise-moi ma journée')
    const [action] = prompt?.pendingActions?.() ?? []
    expect(action?.action).toBe('propose_focus_plan')
    expect(prompt?.answer ?? '').not.toMatch(/laissées libres|rien n[’']est (ajouté|créé)/i)
  })
})
