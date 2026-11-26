import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { EngagementPanelHeader } from './EngagementPanelHeader'

const contact = { id: 'c1', full_name: 'Claire Dubois', title: 'DSI' } as Contact

describe('EngagementPanelHeader — #3702.8', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('« Approche contact » porte la promesse : rien ne part sans validation, sauf mandat explicite', () => {
    render(
      <EngagementPanelHeader
        channel="email"
        contact={contact}
        maximized={false}
        onClose={vi.fn()}
        onMaximize={vi.fn()}
        onMinimize={vi.fn()}
      />,
    )
    expect(screen.getByText('Approche contact')).toBeInTheDocument()
    expect(screen.getByText(/Rien ne part sans ta validation.*mandat/)).toBeInTheDocument()
  })
})
