// Décision Louis 12/10 revient sur c88, délibérément : la revue du CV sert à CORRIGER, plus à valider.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ParsedField } from '@bellum/contracts'
import { CvReviewPanel } from './CvReviewPanel'
import { cvMentionsSkills } from './cv-skills-partial'
import { useCommitCvParse, useParseCv } from '../../hooks'

vi.mock('../../hooks', () => ({ useParseCv: vi.fn(), useCommitCvParse: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// #3811.4 — texte ANONYMISÉ : une section « Compétences » dont rien n'a été lu.
const CV_WITH_SKILLS_SECTION = 'Alex Martin\nCompétences\nSpring NestJS\nExpériences\nAcme Corp 2022 - 2024'
const CV_WITHOUT = 'Alex Martin\nExpériences\nAcme Corp 2022 - 2024'

function skills(value: string[] | null): ParsedField {
  return {
    detection: 'skills',
    value,
    confidence: value ? 0.9 : 0,
    sourceExcerpt: value ? 'Spring' : '',
    excerptOffset: value ? 0 : null,
  } as ParsedField
}

function mount(cvText: string, value: string[] | null) {
  const mutateAsync = vi.fn().mockResolvedValue({ applied: [], rejected: [], qualified: true })
  vi.mocked(useParseCv).mockReturnValue({
    data: { fields: [skills(value)], sourceChars: cvText.length, cvText, canAcceptAll: true, partial: false },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useParseCv>)
  vi.mocked(useCommitCvParse).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
    typeof useCommitCvParse
  >)
  render(<CvReviewPanel talentId="c1" cvText={cvText} onDone={vi.fn()} />)
  return mutateAsync
}

describe('#3811.4 — lecture partielle : compétences non reconnues', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('un texte qui cite des compétences et 0 extraite le DIT', () => {
    mount(CV_WITH_SKILLS_SECTION, null)
    expect(screen.getByRole('status').textContent).toMatch(/lecture partielle/i)
    expect(screen.getByRole('status').textContent).toMatch(/compétences non reconnues/i)
  })

  it('contrôle négatif : des compétences extraites ne montrent aucun état partiel', () => {
    mount(CV_WITH_SKILLS_SECTION, ['Spring'])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('contrôle négatif : un texte qui ne cite aucune compétence ne dit rien de partiel', () => {
    mount(CV_WITHOUT, null)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('la correction manuelle part au commit SANS réextraction', async () => {
    const mutateAsync = mount(CV_WITH_SKILLS_SECTION, null)
    fireEvent.change(screen.getByLabelText(/compétences/i, { selector: 'input' }), {
      target: { value: 'Spring, VueJS, gestion de projet' },
    })
    fireEvent.click(screen.getByRole('button', { name: /enregistrer mes corrections/i }))
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const sent = mutateAsync.mock.calls[0]?.[0] as {
      fields: Array<{ detection: string; decision: string; value: unknown }>
    }
    expect(sent.fields).toContainEqual({
      detection: 'skills',
      decision: 'correct',
      value: ['Spring', 'VueJS', 'gestion de projet'],
    })
  })

  it('cvMentionsSkills lit un titre de section, pas un mot au hasard', () => {
    expect(cvMentionsSkills('Compétences clés')).toBe(true)
    expect(cvMentionsSkills('Skills\nJava')).toBe(true)
    expect(cvMentionsSkills('Environnement technique')).toBe(true)
    expect(cvMentionsSkills('Il a une grande compétition de natation')).toBe(false)
    expect(cvMentionsSkills(null)).toBe(false)
  })
})
