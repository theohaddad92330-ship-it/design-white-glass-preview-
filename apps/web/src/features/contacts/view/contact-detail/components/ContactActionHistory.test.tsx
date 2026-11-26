import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ContactActionHistory } from './ContactActionHistory'

const activity = [
  { label: 'Contact identifié', status: 'done', at: null },
  { label: 'Email vérifié', status: 'pending', at: null },
  { label: 'Autre étape', status: 'waiting_reply', at: null },
]

describe('ContactActionHistory — statut en clair (#3420, X76)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('FR : « done » n’est jamais affiché brut', async () => {
    await i18n.changeLanguage('fr')
    render(<ContactActionHistory activity={activity} />)
    expect(screen.queryByText('done')).toBeNull()
    expect(screen.getAllByText('Fait')).toHaveLength(1)
    expect(screen.getByText('En attente')).toBeTruthy()
  })

  it('EN : « done » → Done', async () => {
    await i18n.changeLanguage('en')
    render(<ContactActionHistory activity={activity} />)
    expect(screen.queryByText('done')).toBeNull()
    expect(screen.getByText('Done')).toBeTruthy()
  })

  it('un statut inconnu est mis en forme, jamais en snake_case', async () => {
    await i18n.changeLanguage('fr')
    render(<ContactActionHistory activity={activity} />)
    expect(screen.queryByText('waiting_reply')).toBeNull()
    expect(screen.getByText('Waiting reply')).toBeTruthy()
  })
})
