import type { CrmFirstImportState, CrmReadStatus } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmReadScope } from './CrmReadScope'

// #4189.8 — la salle de démonstration montre le conflit de synchro, présenté comme une PROPOSITION.
const mocks = vi.hoisted(() => ({
  demo: false,
  rows: [] as CrmReadStatus[],
  enabled: [] as boolean[],
  firstImports: [] as CrmFirstImportState[],
  error: false,
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => mocks.demo }))
vi.mock('@/features/crm-import/api', () => ({
  useCrmReadStatus: (enabled: boolean) => {
    mocks.enabled.push(enabled)
    return { data: enabled && !mocks.error ? mocks.rows : undefined, isError: enabled && mocks.error }
  },
  useKeepCrmValue: () => ({ mutate: () => undefined }),
  useCrmFirstImport: () => ({ data: mocks.firstImports }),
}))

const DEMO_ROW: CrmReadStatus = {
  provider: 'hubspot',
  accountLabel: 'Démonstration',
  objects: ['accounts', 'contacts'],
  incremental: 'modified_at',
  lastSyncAt: '2026-10-15T08:00:00.000Z',
  lastError: null,
  conflicts: 1,
  conflictItems: [
    {
      entityType: 'contact',
      field: 'email',
      bellumValue: 'a@x.test',
      crmValue: 'b@x.test',
      at: '2026-10-15T08:00:00.000Z',
    },
  ],
  demo: true,
}

describe('CrmReadScope — conflit de synchro en démonstration (#4189.8)', () => {
  beforeEach(() => {
    mocks.demo = false
    mocks.rows = [DEMO_ROW]
    mocks.enabled = []
    mocks.firstImports = []
    mocks.error = false
  })

  it('en démo, le conflit fictif s’affiche sur le CRM de la ligne démo', () => {
    mocks.demo = true
    render(<CrmReadScope connector="hubspot" connected={false} />)
    expect(screen.getByTestId('crm-read-scope-conflict-item')).toBeInTheDocument()
  })

  it('#4189.8 — la ligne démo est celle de HubSpot (le CRM fictif de la salle) : « Garder la valeur » et la valeur lue s’y rendent', () => {
    mocks.demo = true
    render(<CrmReadScope connector="hubspot" connected />)
    const item = screen.getByTestId('crm-read-scope-conflict-item')
    expect(item.textContent).toContain('b@x.test')
  })

  it('SAIT DIRE NON — en démo, un autre CRM que celui de la ligne démo ne montre rien', () => {
    mocks.demo = true
    render(<CrmReadScope connector="pipedrive" connected={false} />)
    expect(screen.queryByTestId('crm-read-scope')).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — hors démo, un CRM non branché ne lit rien et n’affiche rien', () => {
    render(<CrmReadScope connector="salesforce" connected={false} />)
    expect(mocks.enabled).toEqual([false])
    expect(screen.queryByTestId('crm-read-scope')).not.toBeInTheDocument()
  })

  it('CRM-SYNC-D.2 — la reprise affichée est celle de CE CRM, pas celle d’un autre', () => {
    mocks.firstImports = [
      {
        provider: 'zoho',
        state: 'done',
        startedAt: null,
        finishedAt: null,
        message: null,
        reconnectNeeded: false,
        objects: [{ object: 'contacts', status: 'done', count: 7, conflicts: null, truncated: false, error: null }],
      },
    ]
    const { unmount } = render(<CrmReadScope connector="hubspot" connected />)
    expect(screen.queryByTestId('crm-read-scope-first-import')).toBeNull()
    unmount()
    mocks.rows = [{ ...DEMO_ROW, provider: 'zoho', demo: undefined }]
    render(<CrmReadScope connector="zoho" connected />)
    expect(screen.getByTestId('crm-read-scope-first-import')).toHaveTextContent(/Reprise terminée — 7 contacts/)
  })
})

// #4590 — un échec de `GET /crm/import/status` se DIT : une zone vide se lirait « rien à signaler ».
describe('CrmReadScope — l’état de lecture indisponible se dit (#4590)', () => {
  it('sur une erreur de lecture, nomme l’indisponibilité au lieu de se taire', () => {
    mocks.error = true
    render(<CrmReadScope connector="hubspot" connected />)
    expect(screen.getByRole('alert')).toHaveTextContent(/état de lecture indisponible/i)
  })

  it('sans erreur, aucune mention d’indisponibilité', () => {
    mocks.error = false
    mocks.rows = [DEMO_ROW]
    render(<CrmReadScope connector="hubspot" connected />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
