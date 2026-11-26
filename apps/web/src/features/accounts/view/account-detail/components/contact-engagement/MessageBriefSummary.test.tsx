import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { MessageBrief } from '@/lib/message-insight'
import { MessageBriefSummary } from './MessageBriefSummary'

const brief: MessageBrief = {
  objective: 'demande_information',
  objectiveSource: 'angle',
  relationship: 'dormant',
  persona: 'decideur',
  formality: 'vous',
  formalitySource: 'defaut',
  cta: 'question_facile',
  ctaSource: 'objectif',
  missing: [],
}

describe('#3694.4 — le brief compact : objectif, relation, angle', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('montre les trois dimensions reprises de l’existant, chacune avec sa provenance', () => {
    render(<MessageBriefSummary brief={brief} angle="Leur appel d’offres infogérance" onCorrect={vi.fn()} />)
    const region = screen.getByRole('region', { name: 'Brief du message' })
    expect(region).toHaveTextContent('Objectif')
    expect(region).toHaveTextContent('Comprendre un périmètre')
    expect(region).toHaveTextContent('déduit de ton angle')
    expect(region).toHaveTextContent('Relation')
    expect(region).toHaveTextContent('Leur appel d’offres infogérance')
  })

  it('sans angle tapé, dit que le signal le plus actionnable du dossier sert d’angle', () => {
    render(<MessageBriefSummary brief={brief} angle="" onCorrect={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'Brief du message' })).toHaveTextContent('signal le plus actionnable')
  })

  it('une relation inconnue ne fait aucune ligne ; un objectif indéterminé est nommé « à préciser », sans rien bloquer', () => {
    render(
      <MessageBriefSummary
        brief={{ ...brief, objective: null, relationship: null, missing: ['objective'] }}
        angle=""
        onCorrect={vi.fn()}
      />,
    )
    const region = screen.getByRole('region', { name: 'Brief du message' })
    expect(region).not.toHaveTextContent('Relation')
    expect(region).toHaveTextContent('À préciser : objectif')
  })

  it('« Corriger » ouvre les paramètres pour corriger — la suggestion n’est jamais figée', async () => {
    const onCorrect = vi.fn()
    render(<MessageBriefSummary brief={brief} angle="" onCorrect={onCorrect} />)
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le brief' }))
    expect(onCorrect).toHaveBeenCalledTimes(1)
  })

  it('un objectif choisi dans le formulaire se dit « choisi par toi »', () => {
    render(<MessageBriefSummary brief={{ ...brief, objectiveSource: 'formulaire' }} angle="" onCorrect={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'Brief du message' })).toHaveTextContent('choisi par toi')
  })
})
