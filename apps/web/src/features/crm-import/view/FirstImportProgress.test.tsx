import type { CrmFirstImportState } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FirstImportProgress } from './FirstImportProgress'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function state(over: Partial<CrmFirstImportState> = {}): CrmFirstImportState {
  return {
    provider: 'zoho',
    state: 'done',
    startedAt: '2026-10-26T08:00:00.000Z',
    finishedAt: '2026-10-26T08:03:00.000Z',
    message: null,
    reconnectNeeded: false,
    objects: [],
    ...over,
  }
}

const done = { status: 'done', conflicts: 0, truncated: false, error: null } as const

describe('FirstImportProgress', () => {
  // #4290.19 — rejouée sur une base déjà écrite : la part reconnue se DIT, rien n'est présenté comme neuf.
  it('#4290.19 dit la part déjà dans Bellum quand la reprise en a reconnu', () => {
    render(
      <FirstImportProgress
        state={state({ objects: [{ object: 'accounts', count: 12, created: 0, recognized: 12, ...done }] })}
        crm="Zoho CRM"
      />,
    )
    expect(screen.getByText(/12 entreprises, dont 12 déjà dans Bellum/)).toBeInTheDocument()
  })

  it('#4290.19 une reprise sans fiche reconnue, ou d’avant le compteur, ne dit rien de plus', () => {
    render(
      <FirstImportProgress
        state={state({
          objects: [
            { object: 'accounts', count: 5, created: 5, recognized: 0, ...done },
            { object: 'contacts', count: 9, ...done },
          ],
        })}
        crm="Zoho CRM"
      />,
    )
    expect(screen.queryByText(/déjà dans Bellum/)).not.toBeInTheDocument()
    expect(screen.getByText('5 entreprises')).toBeInTheDocument()
  })

  // #4290.18 — jamais « tout importé » : ce que la reprise de CE CRM ne reprend pas est nommé, avec sa raison.
  it('#4290.18 Zoho : nomme les activités (hors lecture) et les besoins (à importer par fichier)', () => {
    render(<FirstImportProgress state={state()} crm="Zoho CRM" />)
    const note = screen.getByTestId('first-import-unread')
    expect(note).toHaveTextContent(
      'Non repris : Activités (hors lecture de Zoho CRM), Besoins (à importer par fichier).',
    )
  })

  it('#4290.18 HubSpot ne nomme que les besoins', () => {
    render(<FirstImportProgress state={state({ provider: 'hubspot' })} crm="HubSpot" />)
    expect(screen.getByTestId('first-import-unread')).toHaveTextContent(
      'Non repris : Besoins (à importer par fichier).',
    )
  })

  it('#4290.18 la note n’attend pas la fin : elle n’apparaît pas tant que la reprise est en file', () => {
    render(<FirstImportProgress state={state({ state: 'queued' })} crm="Zoho CRM" />)
    expect(screen.queryByTestId('first-import-unread')).not.toBeInTheDocument()
  })
})
