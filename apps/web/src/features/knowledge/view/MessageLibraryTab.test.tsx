import type { MessageLibraryEntry } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  value: { data: undefined, isLoading: false, isError: false } as {
    data: MessageLibraryEntry[] | undefined
    isLoading: boolean
    isError: boolean
  },
}))
const importMutate = vi.hoisted(() => vi.fn())
vi.mock('@/features/message-library/hooks/useMessageLibrary', () => ({
  useMessageLibrary: () => state.value,
  useImportMessageLibraryDefaults: () => ({ mutate: importMutate, isPending: false, isError: false }),
}))

const confirmMutate = vi.hoisted(() => vi.fn())
vi.mock('@/features/message-library/hooks/useConfirmMandatoryFact', () => ({
  useConfirmMandatoryFact: () => ({ mutate: confirmMutate, isPending: false, variables: undefined }),
}))

const confirmClaimMutate = vi.hoisted(() => vi.fn())
vi.mock('@/features/message-library/hooks/useConfirmMessageClaim', () => ({
  useConfirmMessageClaim: () => ({ mutate: confirmClaimMutate, isPending: false, variables: undefined }),
}))

vi.mock('@/features/message-library/hooks/useCreateMessageLibraryEntry', () => ({
  useCreateMessageLibraryEntry: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { MessageLibraryTab } = await import('./MessageLibraryTab')

function entry(over: Partial<MessageLibraryEntry>): MessageLibraryEntry {
  return {
    id: 'e-1',
    title: 'Exemple approuvé',
    text: 'Bonjour {{Prénom}}',
    origin: 'Démonstration',
    sourceDocument: 'Doc',
    version: 1,
    date: '2026-09-30T10:00:00.000Z',
    channel: 'linkedin_draft',
    scenarioId: 'accepted_connection',
    persona: 'manager',
    decisionRole: 'prescripteur',
    stage: 'ouverture',
    route: 'invitation_acceptee',
    objective: 'ouvrir',
    expectedVariables: ['Prénom'],
    mandatoryFacts: [],
    claims: [],
    status: 'approuve',
    mode: 'verbatim',
    usageConstraints: [],
    ...over,
  }
}

// #3427 — la bibliothèque a enfin un écran : un exemple par carte, le motif d'un blocage nommé.
describe('MessageLibraryTab (#3427)', () => {
  beforeEach(() => {
    state.value = { data: undefined, isLoading: false, isError: false }
  })

  it('montre un exemple approuvé sans motif de blocage', () => {
    state.value = { data: [entry({})], isLoading: false, isError: false }
    render(<MessageLibraryTab />)
    expect(screen.getByText('Exemple approuvé')).toBeInTheDocument()
    expect(screen.queryByText(/Non activable/)).toBeNull()
  })

  it('nomme l’affirmation qui bloque un exemple à revoir — jamais masqué', () => {
    state.value = {
      data: [
        entry({
          id: 'e-2',
          title: 'Exemple à revoir',
          status: 'a_revoir',
          claims: [{ kind: 'resultat', statement: 'trois semaines gagnées', verifiedFactId: null }],
        }),
      ],
      isLoading: false,
      isError: false,
    }
    render(<MessageLibraryTab />)
    expect(screen.getByText('Exemple à revoir')).toBeInTheDocument()
    expect(screen.getByText(/trois semaines gagnées/)).toBeInTheDocument()
  })

  // #3438 (recette prod 03/10) — « rendre M2 manager/opérationnel servables » : l'affirmation se
  // CONFIRME par un geste humain, nommé, sur la carte — une seule fois à l'écran (jamais deux phrases).
  it('#3438 — chaque affirmation non soutenue a son geste « J’ai vérifié », et n’est écrite qu’une fois', () => {
    state.value = {
      data: [
        entry({
          id: 'e-3',
          title: 'M2 — Manager',
          status: 'a_revoir',
          claims: [
            { kind: 'chiffre', statement: '6 semaines, 5 jours, 3 consultants', verifiedFactId: null },
            { kind: 'delai', statement: 'sous 48 h', verifiedFactId: 'confirmed-by:u@2026-10-03' },
          ],
        }),
      ],
      isLoading: false,
      isError: false,
    }
    render(<MessageLibraryTab />)
    expect(screen.getAllByText(/6 semaines, 5 jours, 3 consultants/)).toHaveLength(1)
    // La confirmée se marque, sans bouton ; la non confirmée a le sien.
    expect(screen.getAllByRole('button', { name: 'J’ai vérifié' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'J’ai vérifié' }))
    expect(confirmClaimMutate).toHaveBeenCalledWith({ id: 'e-3', claimIndex: 0 })
  })

  it('⚠️ SAIT DIRE NON — aucune affirmation à confirmer : aucun bouton « J’ai vérifié »', () => {
    state.value = { data: [entry({})], isLoading: false, isError: false }
    render(<MessageLibraryTab />)
    expect(screen.queryByRole('button', { name: 'J’ai vérifié' })).toBeNull()
  })

  it('dit une bibliothèque vide et une lecture en échec, sans les confondre', () => {
    state.value = { data: [], isLoading: false, isError: false }
    const { rerender } = render(<MessageLibraryTab />)
    expect(screen.getByText(/Aucun exemple/)).toBeInTheDocument()
    state.value = { data: undefined, isLoading: false, isError: true }
    rerender(<MessageLibraryTab />)
    expect(screen.getByText(/n’a pas pu être lue/)).toBeInTheDocument()
  })

  it('vide : dit quoi faire et propose l’import des séquences livrées (pas un texte nu)', () => {
    state.value = { data: [], isLoading: false, isError: false }
    render(<MessageLibraryTab />)
    const button = screen.getByRole('button', { name: /Importer les séquences/ })
    fireEvent.click(button)
    expect(importMutate).toHaveBeenCalledTimes(1)
  })

  // #3439.1 — le mécanisme de confirmation des faits obligatoires, côté écran.
  it('propose « Confirmer » pour chaque fait non confirmé, et marque « Confirmé » les autres', () => {
    state.value = {
      data: [
        entry({
          id: 'e-3',
          title: 'Contact recommandé',
          scenarioId: 'referred_contact',
          mandatoryFacts: ['Identité du référent connue.', 'Périmètre confirmé.'],
          factConfirmations: [
            { fact: 'Identité du référent connue.', confirmedBy: 'u', confirmedAt: '2026-10-01T08:00:00.000Z' },
          ],
        }),
      ],
      isLoading: false,
      isError: false,
    }
    render(<MessageLibraryTab />)
    expect(screen.getAllByText('Confirmé')).toHaveLength(1)
    const buttons = screen.getAllByRole('button', { name: 'Confirmer' })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    expect(confirmMutate).toHaveBeenCalledWith({ id: 'e-3', fact: 'Périmètre confirmé.' })
  })

  it('n’affiche aucun bouton quand l’exemple ne déclare aucun fait obligatoire', () => {
    state.value = { data: [entry({})], isLoading: false, isError: false }
    render(<MessageLibraryTab />)
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull()
  })

  // #3439 — à 4/4 confirmés l'intitulé « à confirmer avant… » ne ment plus.
  it('change l’intitulé quand tous les faits sont confirmés', () => {
    const facts = ['Identité du référent connue.', 'Périmètre confirmé.']
    state.value = {
      data: [
        entry({
          id: 'e-4',
          mandatoryFacts: facts,
          factConfirmations: facts.map(fact => ({ fact, confirmedBy: 'u', confirmedAt: '2026-10-01T08:00:00.000Z' })),
        }),
      ],
      isLoading: false,
      isError: false,
    }
    render(<MessageLibraryTab />)
    expect(screen.queryByText(/Faits à confirmer avant/)).toBeNull()
    expect(screen.getByText('Faits confirmés')).toBeTruthy()
  })

  // #3440 — gabarit jamais brut ; complément d'une bibliothèque déjà posée.
  it('#3440 — l’aperçu d’une carte rend {{Prénom}} comme [prénom], jamais brut', () => {
    state.value = { data: [entry({})], isLoading: false, isError: false }
    render(<MessageLibraryTab />)
    expect(screen.getByText('Bonjour [prénom]')).toBeTruthy()
    expect(screen.queryByText(/\{\{/)).toBeNull()
  })

  it('#3440 — une bibliothèque déjà posée peut recevoir les modèles livrés manquants', () => {
    state.value = { data: [entry({})], isLoading: false, isError: false }
    render(<MessageLibraryTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter les modèles livrés manquants' }))
    expect(importMutate).toHaveBeenCalled()
  })
})

describe('MessageLibraryTab — ajouter un exemple (#4158.50)', () => {
  it('propose « Ajouter un exemple » même quand la bibliothèque est vide, et ouvre le formulaire', async () => {
    state.value = { data: [], isLoading: false, isError: false }
    render(<MessageLibraryTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un exemple' }))
    expect(await screen.findByLabelText('Titre')).toBeInTheDocument()
  })
})
