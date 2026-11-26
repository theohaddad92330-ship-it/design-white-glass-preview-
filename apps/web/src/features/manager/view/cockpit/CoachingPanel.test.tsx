import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ManagerCoaching } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { CoachingPanel } from './CoachingPanel'

const coaching: ManagerCoaching = {
  stale_opportunities: [{ member_user_id: 'u1', member_name: 'Alice Martin', count: 3, days: 9 }],
}

describe('CoachingPanel — #2405.6 un fait daté, jamais un jugement', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('cite le fait daté par personne, jamais un score', () => {
    render(<CoachingPanel coaching={coaching} />)

    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    expect(screen.getByText('3 opportunités sans action depuis 9 jours')).toBeInTheDocument()
    // Jamais un chiffre nu sans son EXPLICATION : la doctrine tient dans le texte affiché.
    expect(screen.getByText(/jamais un classement entre commerciaux/)).toBeInTheDocument()
  })

  it('ABSENT ≠ VIDE — pas de bloc rendu quand l’API ne sait pas répondre (deploy-skew)', () => {
    const { container } = render(<CoachingPanel coaching={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('aucune ligne sous le seuil de bruit — le tableau peut être vide même si `coaching` est servi', () => {
    const { container } = render(<CoachingPanel coaching={{ stale_opportunities: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
