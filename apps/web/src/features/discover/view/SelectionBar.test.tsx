import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/* #2166.48 — « Comparer » suppose 2 comptes déjà en portefeuille : c'est un
 * lien AskLaura (même patron que #2151.53/.54/.56/#2166.52), jamais un appel
 * direct — `compare_accounts` n'existe QUE comme outil de Laura. Mocké ici
 * comme dans `CandidateCard.test.tsx`, sinon la carte rend un arbre vide sans
 * lever d'erreur (le composant utilise `Link`). */
const askLauraProps: Array<{ question: string; label: string; accountId?: string }> = []
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { question: string; label: string; accountId?: string }) => {
    askLauraProps.push({ question: props.question, label: props.label, accountId: props.accountId })
    return <span data-testid="ask-laura-compare">{props.label}</span>
  },
}))

import { SelectionBar } from './SelectionBar'

function renderBar(props: Partial<Parameters<typeof SelectionBar>[0]> = {}) {
  const defaults: Parameters<typeof SelectionBar>[0] = {
    count: 2,
    onClear: () => {},
    onAddToTarget: () => {},
    onExportSelection: () => {},
    onDismissSelection: () => {},
    onAssignSelection: () => {},
    onAnalyzeSelection: () => {},
    compareEligibleNames: [],
  }
  return render(<SelectionBar {...defaults} {...props} />)
}

/* #2166.54 / #2166.55 / #2166.59 / #2166.60 — la barre de sélection : compte
 * annoncé, et les trois gestes de lot que ce lot livre. */
describe('SelectionBar', () => {
  it('annonce le nombre sélectionné', () => {
    renderBar({ count: 3 })
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('#2166.55 — le clic sur « ajouter à une cible » appelle le callback', () => {
    const onAddToTarget = vi.fn()
    renderBar({ onAddToTarget })
    fireEvent.click(screen.getByRole('button', { name: /cible/i }))
    expect(onAddToTarget).toHaveBeenCalledTimes(1)
  })

  it('#2166.59 — le clic sur « exporter la sélection » appelle le callback', () => {
    const onExportSelection = vi.fn()
    renderBar({ onExportSelection })
    fireEvent.click(screen.getByRole('button', { name: /exporter/i }))
    expect(onExportSelection).toHaveBeenCalledTimes(1)
  })

  it('#2166.60 — le clic sur « masquer » appelle le callback', () => {
    const onDismissSelection = vi.fn()
    renderBar({ onDismissSelection })
    fireEvent.click(screen.getByRole('button', { name: /masquer/i }))
    expect(onDismissSelection).toHaveBeenCalledTimes(1)
  })

  it('#2166.58 — le clic sur « attribuer » appelle le callback', () => {
    const onAssignSelection = vi.fn()
    renderBar({ onAssignSelection })
    fireEvent.click(screen.getByRole('button', { name: /attribuer/i }))
    expect(onAssignSelection).toHaveBeenCalledTimes(1)
  })

  it('#2166.56 — le clic sur « analyser » appelle le callback, jamais avant', () => {
    const onAnalyzeSelection = vi.fn()
    renderBar({ onAnalyzeSelection })
    expect(onAnalyzeSelection).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^analyser$/i }))
    expect(onAnalyzeSelection).toHaveBeenCalledTimes(1)
  })

  it('#4308.1 — plus de bouton « chercher les contacts » dans la sélection', () => {
    renderBar({})
    expect(screen.queryByRole('button', { name: /chercher les contacts/i })).toBeNull()
  })

  it('le clic sur « tout désélectionner » appelle le callback', () => {
    const onClear = vi.fn()
    renderBar({ onClear })
    fireEvent.click(screen.getByRole('button', { name: /désélectionner/i }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

describe('#2166.48 — Comparer avec Laura', () => {
  it('n’apparaît PAS sous deux comptes déjà en portefeuille : comparer un seul ne veut rien dire', () => {
    askLauraProps.length = 0
    renderBar({ compareEligibleNames: ['Acme'] })
    expect(screen.queryByTestId('ask-laura-compare')).not.toBeInTheDocument()
  })

  it('nomme les entreprises comparées dans la question posée à Laura', () => {
    askLauraProps.length = 0
    renderBar({ compareEligibleNames: ['Acme', 'Bêta Ingénierie'] })
    expect(screen.getByTestId('ask-laura-compare')).toBeInTheDocument()
    expect(askLauraProps[0]?.question).toContain('Acme')
    expect(askLauraProps[0]?.question).toContain('Bêta Ingénierie')
  })

  it('n’attrape pas ce qu’il ne vise pas : un candidat sans fiche compte n’entre pas dans la comparaison', () => {
    askLauraProps.length = 0
    // Trois sélectionnés, mais un seul nommé « éligible » (accountId connu) — la
    // barre ne compare QUE ceux-là, jamais un candidat de marché sans fiche.
    renderBar({ count: 3, compareEligibleNames: ['Acme', 'Bêta Ingénierie'] })
    expect(askLauraProps[0]?.question).not.toContain('undefined')
  })

  /**
   * Défaut mesuré en prod (passage 12, 17/09) : avec 2 résultats cochés,
   * « Comparer » n'apparaît pas, et rien ne dit pourquoi. La condition
   * (#2166.48 : au moins deux comptes déjà en portefeuille, `accountId`
   * connu) est juste et gardée par les témoins ci-dessus — mais un candidat
   * de marché sans fiche compte est COMPTÉ ailleurs dans cet écran
   * (`unresolvedNaf`, `withoutSignal`), jamais tu. La barre de sélection
   * faisait exception : silence total sous deux comptes éligibles.
   */
  it('nomme l’absence plutôt que de la taire : 2 cochés, aucun encore en portefeuille', () => {
    askLauraProps.length = 0
    renderBar({ count: 2, compareEligibleNames: [] })
    expect(screen.queryByTestId('ask-laura-compare')).not.toBeInTheDocument()
    expect(screen.getByText(/comparer/i)).toBeInTheDocument()
  })

  it('nomme l’absence même à un seul compte déjà en portefeuille sur les deux cochés', () => {
    askLauraProps.length = 0
    renderBar({ count: 2, compareEligibleNames: ['Acme'] })
    expect(screen.getByText(/comparer/i)).toBeInTheDocument()
  })

  it('n’attrape pas ce qu’il ne vise pas : une seule ligne cochée ne dit rien sur Comparer', () => {
    renderBar({ count: 1, compareEligibleNames: [] })
    expect(screen.queryByText(/comparer/i)).not.toBeInTheDocument()
  })
})
