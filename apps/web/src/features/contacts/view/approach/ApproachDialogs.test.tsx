import type { MessageDraftVersionItem } from '@bellum/contracts'
import type { Contact } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlanCallDialog, VersionsDialog } from './ApproachDialogs'

const version = (id: string, body: string, edited: string | null): MessageDraftVersionItem =>
  ({
    id,
    contactId: 'c1',
    channel: 'email',
    subject: 'Objet',
    body,
    editedSubject: null,
    editedBody: edited,
    usedTemplateSource: null,
    usedTemplateVersion: null,
    usedStyleId: null,
    unchanged: false,
    angle: null,
    createdAt: '2026-10-22T08:00:00.000Z',
    validatedAt: null,
  }) as MessageDraftVersionItem

describe('Théo C6.A11 — VersionsDialog', () => {
  const items = [version('v1', 'Première proposition', null), version('v2', 'Première proposition', 'Ma version')]

  it('« Revenir à la version générée » reprend la toute première version, sans rien effacer', async () => {
    const onResume = vi.fn()
    render(
      <VersionsDialog
        open
        onOpenChange={vi.fn()}
        items={items}
        current={{ subject: 'Objet', body: 'Ma version' }}
        onResume={onResume}
        formatDate={() => '22 oct.'}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Revenir à la version générée' }))
    expect(onResume).toHaveBeenCalledWith({ subject: 'Objet', body: 'Première proposition' })
  })

  it('une seule version : rien à retrouver, le bouton n’est pas là', () => {
    render(
      <VersionsDialog
        open
        onOpenChange={vi.fn()}
        items={items.slice(0, 1)}
        current={{ subject: 'Objet', body: 'Première proposition' }}
        onResume={vi.fn()}
        formatDate={() => '22 oct.'}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Revenir à la version générée' })).toBeNull()
  })
})

describe('#4962 — PlanCallDialog : planifier sans script rédigé', () => {
  const renderPlan = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PlanCallDialog open onOpenChange={vi.fn()} contact={{ id: 'c1' } as Contact} script="" rationale={null} />
      </QueryClientProvider>,
    )

  it('script vide : le bouton est désactivé ET le dialogue dit pourquoi', () => {
    renderPlan()
    expect(screen.getByRole('button', { name: 'Ajouter aux appels à passer' })).toBeDisabled()
    expect(
      screen.getByText(/L’ouverture doit être rédigée, ou saisis toi-même la raison et l’objectif/),
    ).toBeInTheDocument()
  })

  it('raison et objectif saisis à la main : on peut planifier quand même', async () => {
    renderPlan()
    await userEvent.type(screen.getByLabelText('Raison de l’appel'), 'Relance suite au salon')
    await userEvent.type(screen.getByLabelText('Objectif de l’appel'), 'Obtenir un rendez-vous')
    expect(screen.getByRole('button', { name: 'Ajouter aux appels à passer' })).toBeEnabled()
    expect(screen.queryByText(/L’ouverture doit être rédigée/)).not.toBeInTheDocument()
  })
})
