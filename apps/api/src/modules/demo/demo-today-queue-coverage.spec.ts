import { OUTREACH_SEQUENCE_TEMPLATES } from '@bellum/contracts'
import { DEMO_OUTREACH_CALL_TASKS, DEMO_OUTREACH_MESSAGES, DEMO_PLAN_TASKS, DEMO_TASKS } from './demo-dataset'
import { DEMO_OUTREACH_PLAN } from './demo-seed.service'

/**
 * Lot L-A (#4164) — craft rule n°9 : la file « Aujourd'hui » doit être PLEINE en
 * démonstration, un élément au moins par geste ET par section, dont du retard.
 *
 * Ce garde relit le jeu de données SOURCE et range chaque ligne exactement comme la
 * page (`apps/web/src/features/today/todayQueue.ts`) : sans lui, un écran livré
 * mais vide en démo se découvrirait en réunion, pas en CI.
 *
 *  - jour = `dueInDays` / `offsetDays` / `scheduledInDays` (relatifs au semis, jamais une date en dur) ;
 *  - section : < 0 en retard · 0 aujourd'hui · 1..6 cette semaine · ≥ 7 ou sans échéance plus tard ;
 *    une validation sans échéance est « aujourd'hui » ;
 *  - geste : e-mail · LinkedIn · appel · tâche · à valider.
 */
type Group = 'validate' | 'email' | 'linkedin' | 'call' | 'task'
type Section = 'overdue' | 'today' | 'week' | 'later'

const sectionOf = (days: number | null | undefined, validate = false): Section => {
  if (days === null || days === undefined) return validate ? 'today' : 'later'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  return days <= 6 ? 'week' : 'later'
}

const CLOSED_CALLS = ['completed', 'no_answer', 'wrong_person', 'qualified', 'refused', 'cancelled']

function queue(): { group: Group; section: Section; label: string }[] {
  const rows: { group: Group; section: Section; label: string }[] = []

  for (const task of DEMO_PLAN_TASKS) {
    if (task.executionStatus === 'done') continue
    const group: Group =
      task.channel === 'email'
        ? 'email'
        : task.channel === 'linkedin'
          ? 'linkedin'
          : task.channel === 'phone'
            ? 'call'
            : 'task'
    rows.push({ group, section: sectionOf(task.dueInDays), label: task.label })
  }
  for (const task of DEMO_TASKS) {
    if (task.closed) continue
    rows.push({ group: 'task', section: sectionOf(task.dueInDays), label: task.title })
  }
  for (const entry of DEMO_OUTREACH_PLAN) {
    if (entry.status !== 'active') continue
    const template = OUTREACH_SEQUENCE_TEMPLATES[entry.template]
    const index = entry.steps.findIndex(step => step.status === 'pending')
    const step = entry.steps[index]
    const definition = template.steps[index]
    if (!step || !definition) continue
    const group: Group =
      definition.kind === 'email'
        ? 'email'
        : /linkedin/i.test(entry.template) || /linkedin/i.test(definition.label)
          ? 'linkedin'
          : /\b(appel|appeler|call)\b/i.test(definition.label)
            ? 'call'
            : 'task'
    rows.push({ group, section: sectionOf(step.offsetDays), label: definition.label })
  }
  for (const call of DEMO_OUTREACH_CALL_TASKS) {
    if (CLOSED_CALLS.includes(call.status)) continue
    rows.push({ group: 'call', section: sectionOf(call.scheduledInDays), label: call.objective })
  }
  for (const message of DEMO_OUTREACH_MESSAGES) {
    if (message.status !== 'needs_review') continue
    rows.push({ group: 'validate', section: 'today', label: message.subject })
  }
  return rows
}

describe('démo — la file « Aujourd’hui » est pleine (craft rule n°9, #4164)', () => {
  const rows = queue()

  it('porte les CINQ gestes', () => {
    for (const group of ['validate', 'email', 'linkedin', 'call', 'task'] as const) {
      expect(rows.filter(row => row.group === group).length).toBeGreaterThan(0)
    }
  })

  it('porte les QUATRE sections, dont du retard', () => {
    for (const section of ['overdue', 'today', 'week', 'later'] as const) {
      expect(rows.filter(row => row.section === section).length).toBeGreaterThan(0)
    }
  })

  it('le retard n’est pas qu’une tâche : un e-mail et un appel y sont aussi', () => {
    const overdueGroups = new Set(rows.filter(row => row.section === 'overdue').map(row => row.group))
    expect(overdueGroups.has('email')).toBe(true)
    expect(overdueGroups.has('call')).toBe(true)
  })

  it('« aujourd’hui » porte un appel et un geste LinkedIn : pas seulement des validations', () => {
    const todayGroups = new Set(rows.filter(row => row.section === 'today').map(row => row.group))
    expect(todayGroups.has('call')).toBe(true)
    expect(todayGroups.has('linkedin')).toBe(true)
  })

  it('« cette semaine » porte un e-mail et un appel', () => {
    const weekGroups = new Set(rows.filter(row => row.section === 'week').map(row => row.group))
    expect(weekGroups.has('email')).toBe(true)
    expect(weekGroups.has('call')).toBe(true)
  })
})

/**
 * #4163 LF point 2 — recette prod 14/10 : « Envoyer par e-mail le compte rendu… », « Relancer après le comité… »
 * s'affichaient sans « pourquoi ». La page nomme la source quand rien n'est écrit ; la salle, elle, SÈME la raison
 * des relances de la file (des faits déjà semés — jamais un fait inventé pour l'occasion).
 */
describe('démo — les relances de la file disent leur raison (#4163 LF)', () => {
  const open = DEMO_PLAN_TASKS.filter(task => task.executionStatus !== 'done' && task.dueInDays !== null)

  it('LIT des relances ouvertes et datées', () => {
    expect(open.length).toBeGreaterThan(3)
  })

  it.each([
    'Relancer après le comité d’architecture',
    'Envoyer par e-mail le compte rendu du comité d’architecture au sponsor',
  ])('« %s » porte sa raison', label => {
    const task = DEMO_PLAN_TASKS.find(candidate => candidate.label === label)
    expect(task?.reason?.trim().length).toBeGreaterThan(10)
  })

  it('toute relance de la file qui a un CANAL (e-mail, LinkedIn) porte sa raison', () => {
    const withChannel = open.filter(task => task.channel === 'email' || task.channel === 'linkedin')
    expect(withChannel.length).toBeGreaterThan(0)
    expect(withChannel.filter(task => !task.reason?.trim()).map(task => task.label)).toEqual([])
  })
})
