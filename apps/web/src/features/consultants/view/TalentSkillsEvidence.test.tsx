import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Consultant, ConsultantExperience, ConsultantSkill } from '@bellum/contracts'

/**
 * #2328.9/.10 — LA PREUVE D'UNE COMPÉTENCE, ÉCRAN.
 *
 * `source_experience_id`/`source_project` existent depuis cette nuit sur le
 * contrat et le service (`talent.service.ts`) — ce test pose l'appelant côté
 * écran : une compétence citant son expérience source le MONTRE, jamais un
 * chiffre.
 */

vi.mock('../talent-api', () => ({
  useTalentSkills: () => talentSkills(),
  useTalentExperiences: () => talentExperiences(),
  useTalentDocuments: () => ({ data: [], isError: false }),
  useUpsertTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentSkill: () => ({ mutate: vi.fn() }),
  useValidateTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useAddTalentDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentDocument: () => ({ mutate: vi.fn() }),
}))

const talentSkills = vi.fn()
const talentExperiences = vi.fn()

const { TalentSkillsDialog } = await import('./TalentSkillsDialog')

const TALENT = { id: 'c-1', full_name: 'Nadia Berrada' } as unknown as Consultant

const SKILL: ConsultantSkill = {
  id: 's-1',
  skill: 'kubernetes',
  rawLabel: null,
  level: 'expert',
  years: 6,
  lastUsedYear: 2026,
  source: 'mission',
  createdAt: '2026-09-01T00:00:00.000Z',
  family: null,
  validatedLevel: null,
  certification: false,
  clientFeedback: null,
  inferred: false,
  validatedByConsultantAt: null,
  validatedByRecruiterAt: null,
  confidence: 'confirmee',
  sourceExperienceId: 'e-1',
  sourceProject: 'Migration cloud',
}

const EXPERIENCE: ConsultantExperience = {
  id: 'e-1',
  entreprise: 'Acme SSII',
  clientFinal: null,
  clientMasked: false,
  clientMaskedReason: null,
  secteur: null,
  role: null,
  dateDebut: null,
  dateFin: null,
  dateDebutPrecision: null,
  dateFinPrecision: null,
  contexte: null,
  realisations: null,
  technologies: [],
  responsabilites: null,
  preuve: null,
  createdAt: '2026-08-01T00:00:00.000Z',
}

beforeEach(() => {
  talentSkills.mockReset()
  talentExperiences.mockReset()
  talentExperiences.mockReturnValue({ data: [EXPERIENCE] })
})
afterEach(cleanup)

function open() {
  render(<TalentSkillsDialog talent={TALENT} open onOpenChange={() => undefined} />)
}

describe('la PREUVE d’une compétence se montre sur la fiche (#2328.9/.10)', () => {
  it('cite le projet source, dans son expérience', () => {
    talentSkills.mockReturnValue({ data: [SKILL], isLoading: false, isError: false })
    open()
    expect(screen.getByText(/Migration cloud/)).toBeTruthy()
  })

  it('sans projet nommé, cite l’entreprise de l’expérience', () => {
    talentSkills.mockReturnValue({ data: [{ ...SKILL, sourceProject: null }], isLoading: false, isError: false })
    open()
    expect(screen.getByText(/Acme SSII/)).toBeTruthy()
  })

  it('sans expérience source, n’affiche AUCUNE preuve — jamais un badge sans citation', () => {
    talentSkills.mockReturnValue({
      data: [{ ...SKILL, sourceExperienceId: null, sourceProject: null }],
      isLoading: false,
      isError: false,
    })
    open()
    expect(screen.queryByText(/Preuve/)).toBeNull()
  })
})
