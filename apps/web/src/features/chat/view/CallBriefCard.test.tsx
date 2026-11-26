import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PendingChatAction } from '@bellum/contracts'
import { CallBriefCard } from './CallBriefCard'

// #2376 (LAU-FINAL-091) — la carte de brief d'appel : identité/entreprise/
// fonction affichées, contexte absent = aucune ligne, mode live sans micro.

type ColdCallAction = Extract<PendingChatAction, { action: 'prepare_cold_call' }>

function action(overrides: Partial<ColdCallAction> = {}): ColdCallAction {
  return {
    action: 'prepare_cold_call',
    contact_id: '11111111-1111-1111-1111-111111111111',
    contact_name: 'Claire Dubois',
    contact_title: 'DSI',
    organization_name: 'ACME Digital',
    context: null,
    reason: 'Aucun échange depuis le salon VivaTech (avril).',
    objective: 'Qualifier un besoin de renfort DevOps pour le T4.',
    opening_question: 'Vous avez trente secondes pour que je vous explique pourquoi je vous appelle ?',
    next_questions: ['Qui pilote le périmètre applicatif chez vous ?', 'Où en est le projet de migration cloud ?'],
    objection: 'On a déjà un prestataire sur ce périmètre.',
    fallback: 'Demander qui pilote le sujet en interne, sans insister.',
    expected_outcome: 'Un besoin identifié ou une orientation vers le bon interlocuteur.',
    cost_credits: 0,
    ...overrides,
  }
}

describe('CallBriefCard', () => {
  it('affiche identité, entreprise et fonction — lues sur la fiche', () => {
    render(<CallBriefCard action={action()} />)
    expect(screen.getByText('Claire Dubois — DSI')).toBeInTheDocument()
    expect(screen.getByText('ACME Digital')).toBeInTheDocument()
  })

  it('un contact sans fonction n’affiche que son nom — jamais un texte inventé', () => {
    render(<CallBriefCard action={action({ contact_title: null })} />)
    expect(screen.getByText('Claire Dubois')).toBeInTheDocument()
    expect(screen.queryByText('Claire Dubois — DSI')).not.toBeInTheDocument()
    expect(screen.queryByText('DSI')).not.toBeInTheDocument()
  })

  it('un contexte absent ne fait AUCUNE ligne — on n’affiche pas ce qu’on n’a pas', () => {
    render(<CallBriefCard action={action({ context: null })} />)
    expect(screen.queryByText('Contexte')).not.toBeInTheDocument()
  })

  it('un contexte connu se lit', () => {
    render(<CallBriefCard action={action({ context: 'Déjà en échange avec le service achats en 2025.' })} />)
    expect(screen.getByText('Contexte')).toBeInTheDocument()
    expect(screen.getByText('Déjà en échange avec le service achats en 2025.')).toBeInTheDocument()
  })

  it('affiche les deux questions suivantes, l’objection, le repli et le résultat attendu', () => {
    render(<CallBriefCard action={action()} />)
    for (const question of action().next_questions) {
      expect(screen.getByText(question)).toBeInTheDocument()
    }
    expect(screen.getByText(action().objection)).toBeInTheDocument()
    expect(screen.getByText(action().fallback)).toBeInTheDocument()
    expect(screen.getByText(action().expected_outcome)).toBeInTheDocument()
  })

  it('l’ouverture porte le rappel « cadre, pas un script »', () => {
    render(<CallBriefCard action={action()} />)
    expect(screen.getByText(action().opening_question)).toBeInTheDocument()
    expect(screen.getByText(/cadre/i)).toBeInTheDocument()
  })

  it('les sept branches de traitement d’objection sont toujours affichées, en texte de référence', () => {
    render(<CallBriefCard action={action()} />)
    expect(screen.getByText(/n'est pas la bonne personne/)).toBeInTheDocument()
    expect(screen.getByText(/dit « pas maintenant »/)).toBeInTheDocument()
    expect(screen.getByText(/répondeur/)).toBeInTheDocument()
  })

  it('n’ouvre le mode live qu’au clic — checklist, minuteur et notes apparaissent alors, jamais avant', async () => {
    const user = userEvent.setup()
    render(<CallBriefCard action={action()} />)
    expect(screen.queryByText('00:00')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /mode live/i }))

    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/rappeler après l'appel/i)).toBeInTheDocument()
    // La checklist reprend l'ouverture + les questions suivantes.
    expect(screen.getAllByText(action().opening_question).length).toBeGreaterThan(0)
  })

  it('ne rend jamais d’élément audio ou micro — un seul enregistreur existe dans l’app, et ce n’est pas ici', async () => {
    const user = userEvent.setup()
    const { container } = render(<CallBriefCard action={action()} />)
    await user.click(screen.getByRole('button', { name: /mode live/i }))
    expect(container.querySelector('audio')).toBeNull()
    expect(container.querySelector('[data-testid*="record" i]')).toBeNull()
    expect(screen.getByText(/n'écoute jamais cet appel/i)).toBeInTheDocument()
  })
})

// #4977.1 — l'offre d'emploi qui a déclenché l'approche est le POINT DE DÉPART du script, et s'ouvre depuis là.
describe('CallBriefCard — #4977.1 point de départ : l’offre d’emploi', () => {
  const offerScope = { kind: 'job_offer', jobOfferId: 'o1', label: 'Expert OpenShift · ACME Digital' } as const

  it('un fil cadré sur une offre la nomme en tête du script, et le geste l’ouvre', async () => {
    const onOpenScope = vi.fn()
    render(<CallBriefCard action={action()} scope={offerScope} onOpenScope={onOpenScope} />)
    const start = screen.getByTestId('call-brief-offer')
    expect(start).toHaveTextContent('Point de départ')
    expect(start).toHaveTextContent('Expert OpenShift · ACME Digital')
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir l’offre/ }))
    expect(onOpenScope).toHaveBeenCalledTimes(1)
  })

  it('sans offre au cadre, AUCUNE ligne : le script reste général, rien n’est inventé', () => {
    render(<CallBriefCard action={action()} scope={{ kind: 'account', accountId: 'a1' }} onOpenScope={vi.fn()} />)
    expect(screen.queryByTestId('call-brief-offer')).not.toBeInTheDocument()
    render(<CallBriefCard action={action()} />)
    expect(screen.queryByTestId('call-brief-offer')).not.toBeInTheDocument()
  })
})
