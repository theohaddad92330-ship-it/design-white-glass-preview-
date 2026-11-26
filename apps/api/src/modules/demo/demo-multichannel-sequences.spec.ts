import type { QueryRunner } from 'typeorm'
import {
  OUTREACH_DELAY_UNITS,
  computeSequenceStepStats,
  linkedinStepsToSkip,
  outreachSequenceStatusSchema,
  outreachStepStatusSchema,
} from '@bellum/contracts'
import { OutreachMultichannelSteps1796489437261 } from '../../migrations/1796489437261-OutreachMultichannelSteps'
import { DEMO_MULTICHANNEL_SEQUENCES_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_OUTREACH_PLAN } from './demo-seed.service'

/**
 * Lot L-B (#4165, craft rule n°9) — les séquences MULTICANAL sont remplies en
 * démonstration : étapes LinkedIn et appel, une étape sautée pour invitation non
 * acceptée, une séquence arrêtée sur RDV, une pause vacances, des stats par
 * étape non vides.
 *
 * ⚠️ ET chaque valeur semée est confrontée au CHECK de la MIGRATION — pas à une
 * liste recopiée. Un CHECK invisible aux specs mockées a cassé la démo à 8 h 30
 * le 11/10 : la contrainte SQL rejetait une valeur que le semis écrivait.
 */

const flat = async (): Promise<string> => {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new OutreachMultichannelSteps1796489437261().up(runner)
  return queries.map(sql => sql.replace(/\s+/g, ' ')).join(' ')
}

/** Les valeurs d'un `CHECK (<colonne> IN ('a', 'b'))` d'une migration. */
function checkValues(sql: string, constraint: string): string[] {
  const match = new RegExp(`CONSTRAINT ${constraint}\\s+CHECK \\(\\s*\\w+ IN \\(([^)]*)\\)`).exec(sql)
  if (!match) throw new Error(`contrainte ${constraint} introuvable dans la migration`)
  return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map(found => found[1] as string)
}

const multichannel = DEMO_OUTREACH_PLAN.filter(entry => entry.steps.some(step => step.kind !== undefined))
const allSteps = DEMO_OUTREACH_PLAN.flatMap(entry => entry.steps)

describe('séquences de démo — multicanal (lot L-B)', () => {
  it('est classée SEEDÉE, avec sa raison', () => {
    expect(DEMO_MULTICHANNEL_SEQUENCES_COVERAGE.state).toBe('seede')
    expect(DEMO_MULTICHANNEL_SEQUENCES_COVERAGE.reason).toContain('#4165')
  })

  it('contient des étapes LinkedIn (invitation ET message) et appel', () => {
    const kinds = new Set(allSteps.map(step => step.kind))
    expect(kinds.has('linkedin_invite')).toBe(true)
    expect(kinds.has('linkedin_message')).toBe(true)
    expect(kinds.has('call')).toBe(true)
  })

  it('porte une étape SAUTÉE pour invitation non acceptée — cohérente avec la règle du contrat', () => {
    const entry = DEMO_OUTREACH_PLAN.find(plan =>
      plan.steps.some(step => step.skipReason === 'linkedin_invite_not_accepted'),
    )
    expect(entry).toBeDefined()
    const steps = (entry?.steps ?? []).map((step, index) => ({
      id: `s${index}`,
      position: index,
      kind: step.kind ?? 'task',
      // Avant le saut, l'étape était en attente : on rejoue la règle sur cet état.
      status: step.skipReason ? ('pending' as const) : step.status,
      due_at: new Date(Date.now() + step.offsetDays * 86_400_000).toISOString(),
      payload: step.outcome ? { outcome: step.outcome } : {},
    }))
    const skipped = linkedinStepsToSkip(steps, new Date(Date.now() + 30 * 86_400_000))
    const expected = (entry?.steps ?? []).flatMap((step, index) => (step.skipReason ? [`s${index}`] : []))
    expect(skipped).toEqual(expect.arrayContaining(expected))
  })

  it('porte une séquence ARRÊTÉE sur RDV (cause meeting_booked)', () => {
    const entry = DEMO_OUTREACH_PLAN.find(plan => plan.cancelReason === 'meeting_booked')
    expect(entry?.status).toBe('cancelled')
    expect(entry?.steps.some(step => step.status === 'done')).toBe(true)
  })

  it('porte une séquence en PAUSE VACANCES, avec sa reprise à venir', () => {
    const entry = DEMO_OUTREACH_PLAN.find(plan => plan.vacationUntilDays !== undefined)
    expect(entry?.status).toBe('paused')
    expect(entry?.vacationUntilDays).toBeGreaterThan(0)
  })

  it('les stats par étape ne sont pas vides : préparé, fait, et un RDV mesuré', () => {
    const rows = computeSequenceStepStats(
      multichannel.map(entry => ({
        steps: entry.steps.map((step, index) => ({
          position: index,
          kind: step.kind ?? 'task',
          status: step.status,
        })),
        contact_replied: false,
        cancel_reason: entry.cancelReason ?? null,
      })),
    )
    const measured = rows.filter(row => row.prepared !== null)
    expect(measured.length).toBeGreaterThanOrEqual(3)
    expect(measured.every(row => (row.prepared ?? 0) > 0)).toBe(true)
    // Une position entièrement sautée est « — » (null) partout, jamais 0.
    for (const row of rows.filter(candidate => candidate.prepared === null)) {
      expect([row.done, row.replied, row.meeting]).toEqual([null, null, null])
    }
    expect(rows.some(row => (row.done ?? 0) > 0)).toBe(true)
    expect(rows.some(row => row.meeting !== null && row.meeting > 0)).toBe(true)
  })

  it('chaque séquence multicanal vise un contact qui EXISTE dans la salle', () => {
    const names = new Set(DEMO_DOSSIERS.flatMap(dossier => dossier.contacts).map(contact => contact.full_name))
    for (const entry of multichannel) expect(names.has(entry.contact)).toBe(true)
  })
})

describe('séquences de démo — confrontées aux CHECK de la migration (GA-11/12)', () => {
  it('toutes les natures d’étape semées passent le CHECK de kind', async () => {
    const allowed = checkValues(await flat(), 'outreach_sequence_steps_kind_check')
    const seeded = new Set(allSteps.flatMap(step => (step.kind ? [step.kind] : [])))
    expect(seeded.size).toBeGreaterThan(0)
    for (const kind of seeded) expect(allowed).toContain(kind)
  })

  it('les unités de délai semées passent le CHECK de delay_unit', async () => {
    const allowed = checkValues(await flat(), 'outreach_sequences_delay_unit_check')
    expect([...allowed].sort()).toEqual([...OUTREACH_DELAY_UNITS].sort())
    for (const entry of DEMO_OUTREACH_PLAN) expect(allowed).toContain(entry.delayUnit ?? 'calendar_days')
  })

  it('les statuts semés sont des statuts du contrat (colonne texte à CHECK d’origine)', () => {
    for (const entry of DEMO_OUTREACH_PLAN) expect(outreachSequenceStatusSchema.options).toContain(entry.status)
    for (const step of allSteps) expect(outreachStepStatusSchema.options).toContain(step.status)
  })

  it('une pause vacances semée porte une séquence réellement en pause', () => {
    for (const entry of DEMO_OUTREACH_PLAN.filter(plan => plan.vacationUntilDays !== undefined)) {
      expect(entry.status).toBe('paused')
    }
  })
})
