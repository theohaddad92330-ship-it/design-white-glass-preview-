import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2319.57 / .61-.74 — la carte de compte rendu :
 *  · aucun enregistrement déposé sans l'accord EXPLICITE des participants ;
 *  · trois natures de texte collé, et la déclaration de l'utilisateur À PART ;
 *  · les six extractions séparées, affichées chacune sous son titre.
 */

const transcribe = vi.fn()
const extractDocument = vi.fn()
const cascade = vi.fn()

vi.mock('../api', () => ({
  useTranscriptionStatus: () => ({ data: { available: true } }),
  useTranscribe: () => ({ mutateAsync: transcribe, isPending: false }),
  useCreateNoteTasks: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExtractMeetingDocument: () => ({ mutateAsync: extractDocument, isPending: false }),
  readFileAsBase64: async () => 'QUJD',
}))
vi.mock('@/features/meetings/api', () => ({
  useMeetingCascade: () => ({ mutateAsync: cascade, isPending: false }),
  useApproveInternal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #2103.18 — sans messagerie connectée dans ces scénarios : `onDepositEmailDraft`
// doit rester absent, testé séparément dans `MeetingNotesCard.draft.test.tsx`.
vi.mock('@/features/mailbox/api', () => ({
  useMailboxStatus: () => ({ data: undefined }),
  useCreateDraft: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/features/meetings/view/MeetingCascade', () => ({ MeetingCascade: () => null }))
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({ useCrmPresence: () => ({ data: undefined }) }))
vi.mock('@/features/crm/hooks/useCrmDealPipelines', () => ({
  useCrmDealPipelines: () => ({ data: undefined, isError: false }),
}))

const { MeetingNotesCard } = await import('./MeetingNotesCard')

const HEARD = { kind: 'transcript', excerpt: 'On décide fin octobre.' } as const

function recap(): MeetingRecap {
  return {
    summary: 'Point exploratoire.',
    decisions: [],
    nextSteps: [],
    openQuestions: [],
    signals: [],
    followUpEmail: '',
    opportunity: null,
    need: null,
    clientIssue: null,
    mentionedContacts: [],
    crmStage: null,
    reminder: null,
    learnings: [],
    facts: [{ content: 'Trois équipes data', evidence: HEARD }],
    requests: [{ content: 'Deux CV avant vendredi', evidence: HEARD }],
    criteria: [{ content: 'Expérience en assurance', evidence: HEARD }],
    dates: [{ label: 'Comité de décision', when: 'fin octobre', evidence: HEARD }],
    clientCommitments: [{ content: 'Ils envoient le cahier des charges', evidence: HEARD }],
    userCommitments: [{ content: 'Je rappelle lundi', evidence: { kind: 'user-statement' } }],
    recapEvidence: HEARD,
    followUpEvidence: null,
    sources: [],
    estimatedCredits: 0,
    sourceEventId: null,
  }
}

beforeEach(() => {
  transcribe.mockReset()
  extractDocument.mockReset()
  cascade.mockReset()
})

describe('MeetingNotesCard — #2319.57 : aucun enregistrement sans accord explicite', () => {
  it('le dépôt est FERMÉ tant que l’accord des participants n’est pas coché', () => {
    const { container } = render(<MeetingNotesCard accountId="acc-1" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByText('Coche l’accord des participants pour déposer un enregistrement.')).toBeTruthy()
    fireEvent.change(input, { target: { files: [new File(['x'], 'rdv.m4a', { type: 'audio/mp4' })] } })
    expect(transcribe).not.toHaveBeenCalled()
  })

  it('#2434.65 — nomme la policy vocale DÉDIÉE à cette réunion (audio jamais conservé, seul le texte reste)', () => {
    render(<MeetingNotesCard accountId="acc-1" />)
    expect(
      screen.getByText(
        'L’enregistrement audio n’est jamais conservé : seul le texte transcrit reste, dans le compte rendu.',
      ),
    ).toBeTruthy()
  })

  it('une fois l’accord coché, l’enregistrement part AVEC cet accord', async () => {
    transcribe.mockResolvedValue({ text: 'Transcription' })
    const { container } = render(<MeetingNotesCard accountId="acc-1" />)
    fireEvent.click(screen.getByLabelText('Les participants ont accepté l’enregistrement de ce rendez-vous.'))
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.disabled).toBe(false)
    fireEvent.change(input, { target: { files: [new File(['x'], 'rdv.m4a', { type: 'audio/mp4' })] } })
    await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1))
    expect(transcribe.mock.calls[0]?.[0]).toMatchObject({ recordingConsent: true })
  })
})

describe('MeetingNotesCard — #2103.4 : un document joint (PDF/Word)', () => {
  it('le dépôt est TOUJOURS ouvert — aucun accord d’enregistrement à cocher, ce n’est pas un enregistrement', () => {
    render(<MeetingNotesCard accountId="acc-1" />)
    const input = screen.getByLabelText(
      'Tu peux aussi joindre un document (PDF, Word) : son texte sera ajouté à la zone ci-dessous, où tu pourras le corriger avant de continuer.',
    ) as HTMLInputElement
    expect(input.disabled).toBe(false)
  })

  it('le texte extrait rejoint la zone de notes, et la nature passe sur « compte rendu importé »', async () => {
    extractDocument.mockResolvedValue({ text: 'Texte extrait du PDF.', partial: false })
    render(<MeetingNotesCard accountId="acc-1" />)
    const input = screen.getByLabelText(
      'Tu peux aussi joindre un document (PDF, Word) : son texte sera ajouté à la zone ci-dessous, où tu pourras le corriger avant de continuer.',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'brief.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(extractDocument).toHaveBeenCalledTimes(1))
    expect(extractDocument.mock.calls[0]?.[0]).toMatchObject({ filename: 'brief.pdf' })
    expect(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.')).toHaveValue(
      'Texte extrait du PDF.',
    )
    expect(screen.getByRole('button', { name: 'Un compte rendu importé', pressed: true })).toBeTruthy()
  })

  it('une lecture PARTIELLE se DIT — non mesuré n’est jamais 0 (#2542.3)', async () => {
    extractDocument.mockResolvedValue({ text: 'Texte partiel.', partial: true })
    render(<MeetingNotesCard accountId="acc-1" />)
    const input = screen.getByLabelText(
      'Tu peux aussi joindre un document (PDF, Word) : son texte sera ajouté à la zone ci-dessous, où tu pourras le corriger avant de continuer.',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'scan.pdf', { type: 'application/pdf' })] } })
    await waitFor(() =>
      expect(
        screen.getByText(
          "Le document n'a pas pu être lu en entier (probablement un scan partiel) — vérifie que rien d'important ne manque.",
        ),
      ).toBeTruthy(),
    )
  })

  it('un document illisible affiche l’erreur NOMMÉE, jamais un texte inventé', async () => {
    extractDocument.mockRejectedValue(new Error('PDF illisible (corrompu ou protégé par mot de passe).'))
    render(<MeetingNotesCard accountId="acc-1" />)
    const input = screen.getByLabelText(
      'Tu peux aussi joindre un document (PDF, Word) : son texte sera ajouté à la zone ci-dessous, où tu pourras le corriger avant de continuer.',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'corrompu.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(screen.getByText('PDF illisible (corrompu ou protégé par mot de passe).')).toBeTruthy())
    expect(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.')).toHaveValue('')
  })
})

describe('MeetingNotesCard — #2319.61-.63 : les entrées', () => {
  it('un e-mail COLLÉ part avec sa nature, et la déclaration voyage à part', async () => {
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Un e-mail (copié-collé)' }))
    expect(screen.getByText('Colle le texte toi-même : ta boîte n’est jamais lue pour le trouver.')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Bonjour, suite à notre échange…' },
    })
    fireEvent.change(screen.getByLabelText('Ta déclaration (facultatif)'), { target: { value: 'Je rappelle lundi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))
    expect(cascade.mock.calls[0]?.[0]).toMatchObject({
      notes: 'Bonjour, suite à notre échange…',
      inputKind: 'email',
      userStatement: 'Je rappelle lundi',
      fromTranscript: false,
    })
  })

  it('sans déclaration, aucun champ vide ne part', async () => {
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))
    expect(cascade.mock.calls[0]?.[0]).not.toHaveProperty('userStatement')
    expect(cascade.mock.calls[0]?.[0]).toMatchObject({ inputKind: 'notes' })
  })
})

describe('MeetingNotesCard — #2103.37 : le rendez-vous source', () => {
  it('part avec la requête quand la carte vient d’un rendez-vous précis', async () => {
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" eventId="evt-42" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))
    expect(cascade.mock.calls[0]?.[0]).toMatchObject({ sourceEventId: 'evt-42' })
  })

  it('reste ABSENT sans rendez-vous précis, jamais un id inventé', async () => {
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))
    expect(cascade.mock.calls[0]?.[0]).not.toHaveProperty('sourceEventId')
  })
})

describe('MeetingNotesCard — #2319.64-.74 : six extractions séparées', () => {
  it('chacune sous son titre, et l’engagement du client n’est pas celui de l’utilisateur', async () => {
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await screen.findByText('Faits')
    for (const title of ['Demandes', 'Critères', 'Dates citées', 'Engagements du client', 'Tes engagements']) {
      expect(screen.getByText(title)).toBeTruthy()
    }
    expect(screen.getByText(/Comité de décision/).textContent).toContain('fin octobre')
    expect(screen.getByText(/Ils envoient le cahier des charges/)).toBeTruthy()
    expect(screen.getByText(/Je rappelle lundi/)).toBeTruthy()
  })
})
