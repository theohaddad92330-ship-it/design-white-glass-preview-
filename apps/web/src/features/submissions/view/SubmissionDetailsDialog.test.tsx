import type { Submission } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'
import { SubmissionDetailsDialog } from './SubmissionDetailsDialog'

const record = vi.fn()

const CONTACTS = [
  { id: 'contact-1', full_name: 'Julie Berger' },
  { id: 'contact-2', full_name: 'Marc Ferrand' },
]

const previewData = vi.fn(
  () =>
    undefined as
      | { subject: string; cv: { capturedAt: string | null } | null; argumentsSource: string | null }
      | undefined,
)

vi.mock('../api', () => ({
  useRecordSubmissionDetails: () => ({ mutate: record, isPending: false }),
  useSubmissionRecipientContacts: () => ({ data: CONTACTS, isLoading: false }),
  useSubmissionPreview: () => ({ data: previewData() }),
}))

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    projectId: 'proj-1',
    projectLabel: 'Renfort plateforme',
    accountId: 'acc-1',
    accountName: 'ACME',
    needId: null,
    needRole: null,
    consultantId: 'c-1',
    consultantName: 'Marie Dupont',
    stage: 'submitted',
    substatus: null,
    stageEnteredAt: '2026-08-01T09:00:00.000Z',
    submittedAt: '2026-08-01T09:00:00.000Z',
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: 65000,
    cvSnapshot: null,
    plannedDays: null,
    dailyCostCents: null,
    plannedMarginCents: null,
    ownerId: null,
    ownerName: null,
    recipientContactId: null,
    recipientContactName: null,
    channel: null,
    message: null,
    availability: null,
    conditions: null,
    consultantAgreement: null,
    consultantAgreementDate: null,
    nextActionLabel: null,
    nextActionDueAt: null,
    nextActionOwnerId: null,
    nextActionOwnerName: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

function renderDialog(over: Partial<Submission> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubmissionDetailsDialog submission={submission(over)} open onClose={() => undefined} />
    </QueryClientProvider>,
  )
}

/**
 * #2177.6 / .8 / .24 / .25 / .28 / .30 — les cinq champs n'existaient pas du
 * tout au contrat. Ce test prouve l'ÉCRITURE, pas seulement l'affichage.
 */
describe('SubmissionDetailsDialog', () => {
  beforeEach(() => {
    record.mockReset()
    previewData.mockReset()
    previewData.mockReturnValue(undefined)
  })

  // #2189.10-.16 (épopée #2940) — l'aperçu : l'objet, le CV réellement figé,
  // la source des arguments — les trois champs qui manquaient entièrement.
  it('montre l’objet, l’absence de CV et la source des arguments', () => {
    previewData.mockReturnValue({
      subject: 'Positionnement — Marie Dupont pour Renfort plateforme chez ACME',
      cv: null,
      argumentsSource: null,
    })
    renderDialog()
    expect(screen.getByText(/Positionnement — Marie Dupont/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune version de CV figée/)).toBeInTheDocument()
  })

  it('nomme la source des arguments quand un CV est figé', () => {
    previewData.mockReturnValue({
      subject: 'Positionnement — Marie Dupont pour Renfort plateforme chez ACME',
      cv: { capturedAt: '2026-09-20T00:00:00.000Z' },
      argumentsSource: 'le CV figé pour cette présentation',
    })
    renderDialog()
    expect(screen.getByText(/le CV figé pour cette présentation/)).toBeInTheDocument()
  })

  it('envoie le canal, le message, la disponibilité et les conditions saisis', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Réseau professionnel' }))
    fireEvent.change(screen.getByLabelText(/message préparé/i), { target: { value: 'Voici le profil.' } })
    fireEvent.change(screen.getByLabelText(/disponibilité annoncée/i), { target: { value: 'Sous deux semaines' } })
    fireEvent.change(screen.getByLabelText(/conditions particulières/i), { target: { value: 'Télétravail 2j' } })
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    expect(record).toHaveBeenCalledTimes(1)
    const [input] = record.mock.calls[0] as [Record<string, unknown>]
    expect(input['id']).toBe('sub-1')
    expect(input['channel']).toBe('linkedin')
    expect(input['message']).toBe('Voici le profil.')
    expect(input['availability']).toBe('Sous deux semaines')
    expect(input['conditions']).toBe('Télétravail 2j')
  })

  it('envoie `null` pour un champ texte laissé vide — jamais une chaîne vide', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    const [input] = record.mock.calls[0] as [Record<string, unknown>]
    expect(input['message']).toBeNull()
    expect(input['availability']).toBeNull()
    expect(input['conditions']).toBeNull()
    expect(input['channel']).toBeNull()
    expect(input['recipientContactId']).toBeNull()
  })

  it('reclique le même canal pour le désélectionner', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Réseau professionnel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Réseau professionnel' }))
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    const [input] = record.mock.calls[0] as [Record<string, unknown>]
    expect(input['channel']).toBeNull()
  })

  it('choisit le destinataire dans les contacts du COMPTE du positionnement', async () => {
    renderDialog()
    await chooseOption(screen.getByRole('combobox', { name: /destinataire/i }), 'Julie Berger')
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
    const [input] = record.mock.calls[0] as [Record<string, unknown>]
    expect(input['recipientContactId']).toBe('contact-1')
  })

  it('réamorce les champs sur la fiche COURANTE à chaque ouverture', () => {
    renderDialog({
      channel: 'phone',
      message: 'Message déjà posé',
      availability: 'Disponible immédiatement',
      conditions: 'Astreinte incluse',
    })
    expect(screen.getByLabelText(/message préparé/i)).toHaveValue('Message déjà posé')
    expect(screen.getByLabelText(/disponibilité annoncée/i)).toHaveValue('Disponible immédiatement')
    expect(screen.getByLabelText(/conditions particulières/i)).toHaveValue('Astreinte incluse')
    expect(screen.getByRole('button', { name: 'Téléphone', pressed: true })).toBeInTheDocument()
  })

  /**
   * #2887 (#2371.9) — LA REVUE D'UNE PROPOSITION DE MISSION À UN CONSULTANT.
   *
   * `consultantAgreement`/`consultantAgreementDate` existaient déjà au
   * contrat et côté service (#2320.18, migration `SubmissionConsultantAgreement`)
   * — aucun écran ne les lisait ni ne les écrivait. Motif CLAUDE.md : du code
   * juste, calculé, testé, que personne n'appelle.
   */
  describe('#2887 (#2371.9) — le retour du consultant sur cette proposition', () => {
    it('montre le TJM proposé — l’économie de la proposition, jamais dupliquée', () => {
      renderDialog({ proposedRateCents: 65000 })
      expect(screen.getByText(/650 €\/j proposés/)).toBeInTheDocument()
    })

    it('dit qu’aucun TJM n’a été chiffré, jamais un 0', () => {
      renderDialog({ proposedRateCents: null })
      expect(screen.getByText(/TJM non chiffré/)).toBeInTheDocument()
    })

    it('part sur « non déclaré », jamais un oui ou un non deviné', () => {
      renderDialog()
      expect(screen.getByRole('combobox', { name: /accord du consultant/i })).toHaveTextContent(/non déclaré/i)
      // Pas de date tant que rien n'est déclaré.
      expect(screen.queryByLabelText(/date de l’accord/i)).not.toBeInTheDocument()
    })

    it('déclare l’accord et sa date — un refus se date aussi', async () => {
      renderDialog()
      await chooseOption(screen.getByRole('combobox', { name: /accord du consultant/i }), 'Oui')
      fireEvent.change(screen.getByLabelText(/date de l’accord/i), { target: { value: '2026-09-28' } })
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

      const [input] = record.mock.calls[0] as [Record<string, unknown>]
      expect(input['consultantAgreement']).toBe(true)
      expect(input['consultantAgreementDate']).toBe('2026-09-28')
    })

    it('efface la date en même temps qu’on repasse à « non déclaré »', async () => {
      renderDialog({ consultantAgreement: true, consultantAgreementDate: '2026-09-20' })
      await chooseOption(screen.getByRole('combobox', { name: /accord du consultant/i }), 'Non déclaré')
      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

      const [input] = record.mock.calls[0] as [Record<string, unknown>]
      expect(input['consultantAgreement']).toBeNull()
      expect(input['consultantAgreementDate']).toBeNull()
    })

    it('réamorce l’accord déjà déclaré à l’ouverture', () => {
      renderDialog({ consultantAgreement: false, consultantAgreementDate: '2026-09-15' })
      expect(screen.getByRole('combobox', { name: /accord du consultant/i })).toHaveTextContent(/non$/i)
      expect(screen.getByLabelText(/date de l’accord/i)).toHaveValue('2026-09-15')
    })
  })
})
