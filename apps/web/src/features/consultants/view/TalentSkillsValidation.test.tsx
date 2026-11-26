import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Consultant, ConsultantSkill } from '@bellum/contracts'

/**
 * #2328.12/.13 — LA VALIDATION D'UNE COMPÉTENCE, ÉCRAN.
 *
 * L'endpoint (`PUT :id/skills/:skillId/validation`, `TalentService.validateSkill`)
 * existe depuis la nuit précédente et n'a AUCUN appelant : « du code juste que
 * personne n'appelle » (CLAUDE.md). Ce test pose le bouton qui l'appelle.
 *
 * `validatedBy: 'recruiter'` — c'est l'écran interne (vivier ESN), pas un
 * portail consultant : la personne qui clique ici est toujours un recruteur ou
 * un manager, jamais le consultant lui-même. La colonne `validated_by_consultant_at`
 * reste posable par un autre chemin (auto-déclaration), hors de ce bouton.
 */

const validateMutate = vi.fn()
const talentSkills = vi.fn()

vi.mock('../talent-api', () => ({
  useTalentSkills: () => talentSkills(),
  useTalentExperiences: () => ({ data: [] }),
  useTalentDocuments: () => ({ data: [], isError: false }),
  useUpsertTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentSkill: () => ({ mutate: vi.fn() }),
  useValidateTalentSkill: () => ({ mutate: validateMutate, isPending: false }),
  useAddTalentDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentDocument: () => ({ mutate: vi.fn() }),
}))

const { TalentSkillsDialog } = await import('./TalentSkillsDialog')

const TALENT = { id: 'c-1', full_name: 'Nadia Berrada' } as unknown as Consultant

const SKILL: ConsultantSkill = {
  id: 's-1',
  skill: 'kubernetes',
  rawLabel: null,
  level: 'autonome',
  years: null,
  lastUsedYear: null,
  source: 'declared',
  createdAt: '2026-09-01T00:00:00.000Z',
  family: null,
  validatedLevel: null,
  certification: false,
  clientFeedback: null,
  inferred: false,
  validatedByConsultantAt: null,
  validatedByRecruiterAt: null,
  confidence: 'declaree',
  sourceExperienceId: null,
  sourceProject: null,
}

beforeEach(() => {
  validateMutate.mockReset()
  talentSkills.mockReset()
  talentSkills.mockReturnValue({ data: [SKILL], isLoading: false, isError: false })
})
afterEach(cleanup)

function open() {
  render(<TalentSkillsDialog talent={TALENT} open onOpenChange={() => undefined} />)
}

describe('la validation d’une compétence se DÉCLENCHE depuis la fiche', () => {
  it('offre un bouton « valider » sur une compétence non validée', () => {
    open()
    expect(screen.getByRole('button', { name: /valider/i })).toBeTruthy()
  })

  it('appelle la validation RECRUTEUR, jamais un autre chemin', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /valider/i }))
    expect(validateMutate).toHaveBeenCalledTimes(1)
    const [payload] = validateMutate.mock.calls[0] as [{ skillId: string; validatedBy: string }]
    expect(payload).toEqual({ skillId: 's-1', validatedBy: 'recruiter' })
  })

  it('une compétence déjà validée montre son état, pas un bouton', () => {
    talentSkills.mockReturnValue({
      data: [{ ...SKILL, validatedByRecruiterAt: '2026-09-25T00:00:00.000Z' }],
      isLoading: false,
      isError: false,
    })
    open()
    expect(screen.queryByRole('button', { name: /valider/i })).toBeNull()
    expect(screen.getByText(/validé/i)).toBeTruthy()
  })
})
