import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Consultant, ConsultantSkill } from '@bellum/contracts'

/**
 * #2328.24 — UNE COMPÉTENCE INFÉRÉE SE MONTRE « À VÉRIFIER ».
 *
 * Le NO-GO de l'épopée Talent Skill Graph : « le moteur déclare une compétence
 * maîtrisée uniquement parce que son mot apparaît quelque part dans le CV ».
 * `addExtractedSkills` (côté API) pose désormais `inferred: true` sur toute
 * compétence reconnue par simple présence d'un mot — jamais par une expérience
 * détaillée. Ce test couvre le dernier maillon : l'ÉCRAN ne doit jamais montrer
 * une compétence inférée comme un niveau acquis, sans le dire.
 */

vi.mock('../talent-api', () => ({
  useTalentSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
  useTalentExperiences: () => ({ data: [] }),
  useTalentDocuments: () => ({ data: [], isError: false }),
  useUpsertTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentSkill: () => ({ mutate: vi.fn() }),
  useValidateTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useAddTalentDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentDocument: () => ({ mutate: vi.fn() }),
}))

const { TalentSkillsDialog } = await import('./TalentSkillsDialog')

const TALENT = { id: 'c-1', full_name: 'Nadia Berrada' } as unknown as Consultant

const SKILLS: ConsultantSkill[] = [
  {
    id: 's-inferred',
    skill: 'autosar',
    rawLabel: null,
    level: 'inconnu',
    years: null,
    lastUsedYear: null,
    source: 'cv',
    createdAt: '2026-09-01T00:00:00.000Z',
    family: null,
    validatedLevel: null,
    certification: false,
    clientFeedback: null,
    inferred: true,
    validatedByConsultantAt: null,
    validatedByRecruiterAt: null,
    confidence: 'a_verifier',
    sourceExperienceId: null,
    sourceProject: null,
  },
  {
    id: 's-declared',
    skill: 'kubernetes',
    rawLabel: null,
    level: 'expert',
    years: 6,
    lastUsedYear: 2026,
    source: 'interview',
    createdAt: '2026-09-01T00:00:00.000Z',
    family: null,
    validatedLevel: null,
    certification: false,
    clientFeedback: null,
    inferred: false,
    validatedByConsultantAt: null,
    validatedByRecruiterAt: null,
    confidence: 'confirmee',
    sourceExperienceId: null,
    sourceProject: null,
  },
]

afterEach(cleanup)

function open() {
  render(<TalentSkillsDialog talent={TALENT} open onOpenChange={() => undefined} />)
}

describe('une compétence INFÉRÉE se montre « à vérifier »', () => {
  it('affiche la marque « à vérifier » sur la compétence inférée', () => {
    open()
    expect(screen.getByText('à vérifier')).toBeTruthy()
  })

  it('ne la pose PAS sur une compétence déclarée/prouvée', () => {
    open()
    const chips = screen.getAllByText('à vérifier')
    expect(chips).toHaveLength(1)
  })
})
