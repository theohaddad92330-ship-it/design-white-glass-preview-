import { describe, expect, it } from 'vitest'
import {
  RECRUITMENT_STAGES,
  changeRecruitmentStageSchema,
  groupRecruitmentBoard,
  recruitmentStageOf,
  type RecruitmentCard,
} from './talent-recruitment.js'

// Théo C talents-recrutement.N1/N2/N3 — l'étape de recrutement d'une PERSONNE, indépendante de ses présentations.
const card = (over: Partial<RecruitmentCard> = {}): RecruitmentCard => ({
  talentId: '00000000-0000-4000-8000-000000000001',
  fullName: 'Sophie Ledran',
  title: 'Architecte SAP',
  location: 'Lyon',
  relation: 'freelance',
  stage: 'to_qualify',
  stageSince: null,
  reason: null,
  plannedAt: null,
  ...over,
})

describe('talent-recruitment', () => {
  it('N1 — cinq étapes, dans l’ordre de Théo', () => {
    expect([...RECRUITMENT_STAGES]).toEqual(['to_qualify', 'call_planned', 'qualified', 'on_hold', 'discarded'])
  })

  it('N2 — le motif est facultatif, borné, et nettoyé', () => {
    expect(changeRecruitmentStageSchema.parse({ stage: 'on_hold', reason: '  Repasse en janvier  ' }).reason).toBe(
      'Repasse en janvier',
    )
    expect(changeRecruitmentStageSchema.safeParse({ stage: 'qualified' }).success).toBe(true)
    expect(changeRecruitmentStageSchema.safeParse({ stage: 'qualified', reason: 'x'.repeat(501) }).success).toBe(false)
    expect(changeRecruitmentStageSchema.safeParse({ stage: 'gagnée' }).success).toBe(false)
  })

  it('N1 — la date d’échange n’a de sens qu’à « Échange prévu »', () => {
    const ok = changeRecruitmentStageSchema.safeParse({ stage: 'call_planned', plannedAt: '2026-10-28T09:00:00+01:00' })
    expect(ok.success).toBe(true)
    const bad = changeRecruitmentStageSchema.safeParse({ stage: 'qualified', plannedAt: '2026-10-28T09:00:00+01:00' })
    expect(bad.success).toBe(false)
  })

  it('une personne jamais rangée est « À qualifier » — jamais « Écartée » par défaut', () => {
    expect(recruitmentStageOf(null)).toBe('to_qualify')
    expect(recruitmentStageOf('discarded')).toBe('discarded')
    expect(recruitmentStageOf('n’importe quoi')).toBe('to_qualify')
  })

  it('les cinq colonnes existent TOUJOURS, vides comprises ; une colonne vide compte 0 carte et le dit', () => {
    const board = groupRecruitmentBoard([card(), card({ talentId: 'b', stage: 'qualified' })])
    expect(board.map(column => column.stage)).toEqual([...RECRUITMENT_STAGES])
    expect(board.map(column => column.cards.length)).toEqual([1, 0, 1, 0, 0])
  })
})
