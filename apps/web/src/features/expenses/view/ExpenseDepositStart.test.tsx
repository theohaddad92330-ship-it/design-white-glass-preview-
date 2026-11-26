import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseReceiptExtraction } from '../receipt-extraction'
import type { DepositEntry } from './ExpenseDepositStart'

const extractReceiptMock = vi.fn()
// #1827.2 — seul `extractReceipt` est remplacé : `hasAnyProposal` reste la
// VRAIE fonction, pure et déjà testée dans `receipt-extraction.test.ts`. La
// dupliquer ici ferait diverger le jour où l'une des deux change de forme.
vi.mock('../receipt-extraction', async () => {
  const actual = await vi.importActual<typeof import('../receipt-extraction')>('../receipt-extraction')
  return { ...actual, extractReceipt: (...args: unknown[]) => extractReceiptMock(...args) }
})

const { ExpenseDepositStart } = await import('./ExpenseDepositStart')

function okExtraction(overrides: Partial<ExpenseReceiptExtraction['fields']> = {}): ExpenseReceiptExtraction {
  const empty = { value: null, confidence: 0, sourceExcerpt: '' }
  return {
    status: 'ok',
    ocrUsed: true,
    costUsd: 0.0017,
    fields: { amountCents: empty, spentOn: empty, category: empty, vatRateBps: empty, ...overrides },
  }
}

/**
 * #1827.1 — LE DÉPÔT D'ABORD. #1827.2 — LA LECTURE AUTOMATIQUE.
 *
 * Ce que ces tests protègent, dans l'ordre :
 *
 *  1. Un fichier ACCEPTÉ peut continuer ; un fichier REFUSÉ porte un nom et ne
 *     bloque pas les autres (`refuseStoredFile`, la MÊME fonction que le
 *     serveur).
 *  2. « Commencer sans justificatif » reste possible — ce lot ne retire aucune
 *     capacité, il en ajoute une.
 *  3. Rien n'est ENREGISTRÉ ici : ni octet au stockage, ni note créée.
 *     `onContinue` ne reçoit que des `File` (et ce que leur lecture a proposé),
 *     jamais un fichier téléversé.
 *  4. #1827.2 — chaque fichier ACCEPTÉ déclenche une lecture, dont l'écran dit
 *     l'état : en cours, aboutie (avec un résumé), ou nommée dans son échec —
 *     jamais un silence.
 */

function file(name: string, size: number, type = 'application/pdf'): File {
  const f = new File([new Uint8Array(size)], name, { type })
  return f
}

/** Simule un GLISSER-DÉPOSER — contrairement à `userEvent.upload`, il ne passe
 *  pas par le filtre `accept` du sélecteur de fichier natif. */
function dropOn(container: HTMLElement, files: File[]): void {
  const zone = container.querySelector('.border-dashed')
  if (!zone) throw new Error('zone de dépôt introuvable')
  fireEvent.drop(zone, { dataTransfer: { files } })
}

beforeEach(() => {
  cleanup()
  extractReceiptMock.mockReset()
  // Par défaut, une lecture qui n'aboutit à RIEN — le comportement d'avant
  // #1827.2, tant qu'un test ne configure pas explicitement une proposition.
  extractReceiptMock.mockResolvedValue({
    status: 'unavailable',
    ocrUsed: false,
    costUsd: null,
    fields: {
      amountCents: { value: null, confidence: 0, sourceExcerpt: '' },
      spentOn: { value: null, confidence: 0, sourceExcerpt: '' },
      category: { value: null, confidence: 0, sourceExcerpt: '' },
      vatRateBps: { value: null, confidence: 0, sourceExcerpt: '' },
    },
  })
})

describe('la zone de dépôt qui ouvre le formulaire', () => {
  it('choisir un fichier valide le rend « prêt », et « Continuer » le rend au parent', async () => {
    const onContinue = vi.fn()
    render(<ExpenseDepositStart onContinue={onContinue} onSkip={() => undefined} />)

    const input = screen.getByLabelText('Choisir un fichier')
    await userEvent.upload(input, file('facture_taxi.pdf', 1024))

    expect(screen.getByText(/facture_taxi\.pdf/)).toBeInTheDocument()
    const continueButton = screen.getByRole('button', { name: 'Continuer avec 1 fichier' })
    expect(continueButton).toBeEnabled()
    await userEvent.click(continueButton)

    expect(onContinue).toHaveBeenCalledTimes(1)
    const [entries] = onContinue.mock.calls[0] as [DepositEntry[]]
    expect(entries).toHaveLength(1)
    expect(entries[0]?.file.name).toBe('facture_taxi.pdf')
  })

  it('plusieurs fichiers à la fois : chacun est compté, « Continuer » porte le total', async () => {
    const onContinue = vi.fn()
    render(<ExpenseDepositStart onContinue={onContinue} onSkip={() => undefined} />)

    const input = screen.getByLabelText('Choisir un fichier')
    await userEvent.upload(input, [file('hotel.pdf', 2048), file('train.pdf', 4096)])

    expect(screen.getByRole('button', { name: 'Continuer avec 2 fichiers' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec 2 fichiers' }))
    expect((onContinue.mock.calls[0]?.[0] as DepositEntry[]).map(entry => entry.file.name)).toEqual([
      'hotel.pdf',
      'train.pdf',
    ])
  })

  it('un fichier REFUSÉ porte son nom, et ne compte pas dans « Continuer »', () => {
    // Même fonction que le serveur (`refuseStoredFile`) : un exécutable est
    // refusé ici pour la MÊME raison qu'il le serait à l'envoi. Déposé par
    // GLISSER, pas choisi : le sélecteur de fichier filtre déjà sur `accept`,
    // ce que le glisser-déposer ne fait jamais — c'est lui qui doit passer par
    // le VRAI refus, pas par le filtre du navigateur.
    const onContinue = vi.fn()
    const { container } = render(<ExpenseDepositStart onContinue={onContinue} onSkip={() => undefined} />)

    dropOn(container, [file('script.exe', 10)])

    expect(screen.getByText(/n’est pas accepté/)).toBeInTheDocument()
    // Zéro fichier ACCEPTÉ : le bouton est désactivé plutôt que de rendre
    // « Continuer avec 0 fichier », qui laisserait croire à un dépôt possible.
    expect(screen.getByRole('button', { name: /Continuer avec/ })).toBeDisabled()
  })

  it('un fichier refusé n’empêche pas les autres de continuer', async () => {
    const onContinue = vi.fn()
    const { container } = render(<ExpenseDepositStart onContinue={onContinue} onSkip={() => undefined} />)

    dropOn(container, [file('script.exe', 10), file('receipt.pdf', 100)])

    const continueButton = screen.getByRole('button', { name: 'Continuer avec 1 fichier' })
    await userEvent.click(continueButton)
    expect((onContinue.mock.calls[0]?.[0] as DepositEntry[]).map(entry => entry.file.name)).toEqual(['receipt.pdf'])
  })

  it('retirer un fichier de la liste le retire du compte', async () => {
    render(<ExpenseDepositStart onContinue={() => undefined} onSkip={() => undefined} />)

    const input = screen.getByLabelText('Choisir un fichier')
    await userEvent.upload(input, file('receipt.pdf', 100))
    expect(screen.getByRole('button', { name: 'Continuer avec 1 fichier' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Retirer le justificatif receipt.pdf' }))
    expect(screen.getByRole('button', { name: 'Continuer avec 0 fichier' })).toBeDisabled()
  })

  it('« Commencer sans justificatif » reste possible — ce lot n’enlève rien', async () => {
    const onSkip = vi.fn()
    const onContinue = vi.fn()
    render(<ExpenseDepositStart onContinue={onContinue} onSkip={onSkip} />)

    await userEvent.click(screen.getByRole('button', { name: 'Commencer sans justificatif' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onContinue).not.toHaveBeenCalled()
  })
})

describe('#1827.2 — la lecture automatique, jamais silencieuse', () => {
  it('un fichier accepté déclenche la lecture, et l’écran le DIT pendant qu’elle tourne', async () => {
    let resolveRead: (value: ExpenseReceiptExtraction) => void = () => undefined
    extractReceiptMock.mockReturnValueOnce(new Promise<ExpenseReceiptExtraction>(resolve => (resolveRead = resolve)))
    render(<ExpenseDepositStart onContinue={() => undefined} onSkip={() => undefined} />)

    await userEvent.upload(screen.getByLabelText('Choisir un fichier'), file('taxi.pdf', 100))
    expect(screen.getByText('Lecture automatique…')).toBeInTheDocument()

    resolveRead(okExtraction())
    await waitFor(() => expect(screen.queryByText('Lecture automatique…')).not.toBeInTheDocument())
  })

  it('une lecture ABOUTIE affiche ce qui a été proposé, et « Continuer » le porte au parent', async () => {
    extractReceiptMock.mockResolvedValue(
      okExtraction({
        amountCents: { value: 2450, confidence: 0.9, sourceExcerpt: 'Total : 24,50 EUR' },
        category: { value: 'taxi', confidence: 0.9, sourceExcerpt: 'TAXI' },
      }),
    )
    const onContinue = vi.fn()
    render(<ExpenseDepositStart onContinue={onContinue} onSkip={() => undefined} />)

    await userEvent.upload(screen.getByLabelText('Choisir un fichier'), file('taxi.pdf', 100))
    await waitFor(() => expect(screen.getByText(/Lu automatiquement/)).toBeInTheDocument())
    expect(screen.getByText(/24,50/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Continuer avec 1 fichier' }))
    const [entries] = onContinue.mock.calls[0] as [DepositEntry[]]
    expect(entries[0]?.extraction?.fields.amountCents.value).toBe(2450)
  })

  it.each([
    ['not_configured', 'La lecture automatique n’est pas branchée sur cet espace — remplis les champs à la main.'],
    ['unreadable', 'Ce fichier n’a pas pu être lu automatiquement — remplis les champs à la main.'],
    [
      'not_a_receipt',
      'Ce fichier ne ressemble pas à un justificatif de dépense — vérifie qu’il s’agit du bon fichier.',
    ],
    ['too_large', 'Ce document est trop long pour une lecture automatique — remplis les champs à la main.'],
  ])('le statut « %s » affiche sa PHRASE nommée, jamais un silence ni une erreur générique', async (status, phrase) => {
    extractReceiptMock.mockResolvedValue({
      status,
      ocrUsed: false,
      costUsd: null,
      fields: {
        amountCents: { value: null, confidence: 0, sourceExcerpt: '' },
        spentOn: { value: null, confidence: 0, sourceExcerpt: '' },
        category: { value: null, confidence: 0, sourceExcerpt: '' },
        vatRateBps: { value: null, confidence: 0, sourceExcerpt: '' },
      },
    })
    render(<ExpenseDepositStart onContinue={() => undefined} onSkip={() => undefined} />)

    await userEvent.upload(screen.getByLabelText('Choisir un fichier'), file('ticket.pdf', 100))
    await waitFor(() => expect(screen.getByText(phrase)).toBeInTheDocument())
  })

  it('« Continuer » ne bloque JAMAIS sur une lecture encore en cours', async () => {
    extractReceiptMock.mockReturnValue(new Promise<ExpenseReceiptExtraction>(() => undefined)) // ne se résout jamais
    const onContinue = vi.fn()
    render(<ExpenseDepositStart onContinue={onContinue} onSkip={() => undefined} />)

    await userEvent.upload(screen.getByLabelText('Choisir un fichier'), file('ticket.pdf', 100))
    const continueButton = screen.getByRole('button', { name: 'Continuer avec 1 fichier' })
    expect(continueButton).toBeEnabled()
    await userEvent.click(continueButton)

    const [entries] = onContinue.mock.calls[0] as [DepositEntry[]]
    // Ligne vide plutôt qu'une attente forcée — la lecture n'a pas eu le temps d'aboutir.
    expect(entries[0]?.extraction).toBeNull()
  })
})
