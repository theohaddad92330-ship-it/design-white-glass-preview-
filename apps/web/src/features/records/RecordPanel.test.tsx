import type { RecordLinksResponse } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OPP = '00000000-0000-4000-8000-000000000002'
const NEED = '00000000-0000-4000-8000-000000000003'
const SUB = '00000000-0000-4000-8000-000000000005'
const ACCOUNT = '00000000-0000-4000-8000-000000000001'

const records: Record<string, RecordLinksResponse> = {
  [`opportunity/${OPP}`]: {
    kind: 'opportunity',
    id: OPP,
    label: 'Orange — renfort data',
    status: 'profiles_submitted',
    properties: [
      { key: 'stage', value: 'profiles_submitted' },
      { key: 'objective', value: null },
    ],
    history: [],
    links: [
      { kind: 'account', items: [{ kind: 'account', id: ACCOUNT, label: 'Orange', status: null }] },
      { kind: 'need', items: [{ kind: 'need', id: NEED, label: 'Architecte cloud', status: 'client_review' }] },
    ],
  },
  [`need/${NEED}`]: {
    kind: 'need',
    id: NEED,
    label: 'Architecte cloud',
    status: 'client_review',
    properties: [{ key: 'status', value: 'client_review' }],
    history: [
      {
        id: '00000000-0000-4000-8000-000000000008',
        fromState: 'to_qualify',
        toState: 'client_review',
        proof: null,
        occurredAt: '2026-10-01T10:00:00.000Z',
      },
    ],
    links: [
      { kind: 'opportunity', items: [{ kind: 'opportunity', id: OPP, label: 'Orange — renfort data', status: null }] },
      { kind: 'submission', items: [{ kind: 'submission', id: SUB, label: 'Alice Martin', status: 'accepted' }] },
    ],
  },
  [`submission/${SUB}`]: {
    kind: 'submission',
    id: SUB,
    label: 'Alice Martin',
    status: 'accepted',
    properties: [{ key: 'stage', value: 'accepted' }],
    history: [],
    links: [{ kind: 'need', items: [{ kind: 'need', id: NEED, label: 'Architecte cloud', status: null }] }],
  },
}

const apiFetch = vi.fn(async ({ path }: { path: string }) => {
  const record = records[path.replace('/record-links/', '')]
  if (!record) throw new Error('404')
  return record
})
vi.mock('@/lib/api', () => ({ apiFetch: (args: { path: string }) => apiFetch(args) }))

// #4345 — le tiroir ouvre la bulle SUR PLACE (jamais un lien vers /chat) : l'ouverture est observée ici.
const openInPlace = vi.fn()
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({ useOpenLauraInPlace: () => openInPlace }))
vi.mock('@/features/laura/bubble/laura-intro-scope', () => ({
  LauraIntroScope: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { RecordPanel } = await import('./RecordPanel')

const onClose = vi.fn()
function show(target: { kind: 'opportunity' | 'need' | 'submission' | 'mission' | 'consultant'; id: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RecordPanel target={target} onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  cleanup()
  apiFetch.mockClear()
  openInPlace.mockClear()
  onClose.mockClear()
})

describe('RecordPanel — les trois zones', () => {
  it('porte Propriétés, Historique et Objets liés', async () => {
    show({ kind: 'opportunity', id: OPP })
    expect(await screen.findByRole('heading', { name: 'Propriétés' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Historique' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Objets liés' })).toBeInTheDocument()
  })

  it('n’affiche pas une propriété absente — jamais « 0 » ni une ligne vide', async () => {
    show({ kind: 'opportunity', id: OPP })
    await screen.findByRole('heading', { name: 'Propriétés' })
    expect(screen.queryByText('Objectif')).not.toBeInTheDocument()
    expect(screen.getByText('Étape')).toBeInTheDocument()
  })

  it('dit qu’il n’y a pas d’historique plutôt que de rester muet', async () => {
    show({ kind: 'opportunity', id: OPP })
    expect(await screen.findByText('Aucun mouvement enregistré.')).toBeInTheDocument()
  })

  it('le compte est un lien vers sa fiche, pas un changement de panneau', async () => {
    show({ kind: 'opportunity', id: OPP })
    const account = await screen.findByRole('link', { name: /Orange/ })
    expect(account).toHaveAttribute('href', `/accounts/${ACCOUNT}`)
  })
})

describe('RecordPanel — #4191 E6, aucune valeur de base à l’écran', () => {
  it('le statut sous le titre se LIT (« Profils présentés »), jamais « profiles_submitted »', async () => {
    show({ kind: 'opportunity', id: OPP })
    expect((await screen.findAllByText('Profils présentés')).length).toBeGreaterThan(0)
    expect(screen.queryByText('profiles_submitted')).not.toBeInTheDocument()
  })

  it('le statut d’un objet lié et les états du journal se lisent aussi', async () => {
    show({ kind: 'need', id: NEED })
    await screen.findByRole('heading', { name: 'Propriétés' })
    expect(screen.queryByText(/client_review|to_qualify/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/En validation client/).length).toBeGreaterThan(0)
    expect(screen.getByText('Accepté')).toBeInTheDocument()
  })

  it('un statut que le catalogue ne connaît pas n’est PAS affiché brut', async () => {
    records[`need/${NEED}`] = { ...(records[`need/${NEED}`] as RecordLinksResponse), status: 'statut_inconnu' }
    show({ kind: 'need', id: NEED })
    await screen.findByRole('heading', { name: 'Propriétés' })
    expect(screen.queryByText('statut_inconnu')).not.toBeInTheDocument()
  })
})

describe('RecordPanel — navigation interne', () => {
  it('un clic sur un objet lié remplace le contenu du panneau, sans changer d’adresse', async () => {
    show({ kind: 'opportunity', id: OPP })
    await userEvent.click(await screen.findByRole('button', { name: /Architecte cloud/ }))
    expect(await screen.findByRole('heading', { name: 'Architecte cloud' })).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: `/record-links/need/${NEED}` })
    // L'historique du besoin remplace celui de l'opportunité.
    expect(await screen.findByText('À qualifier → En validation client')).toBeInTheDocument()
  })

  it('un clic sur un positionnement ouvre SA fiche dans le même panneau', async () => {
    show({ kind: 'opportunity', id: OPP })
    await userEvent.click(await screen.findByRole('button', { name: /Architecte cloud/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Alice Martin/ }))
    expect(await screen.findByRole('heading', { name: 'Alice Martin' })).toBeInTheDocument()
    expect(apiFetch).toHaveBeenLastCalledWith({ path: `/record-links/submission/${SUB}` })
  })
})

describe('RecordPanel — un seul Laura, une seule porte', () => {
  it('monte UN bouton Laura, avant comme après navigation', async () => {
    show({ kind: 'opportunity', id: OPP })
    await screen.findByRole('heading', { name: 'Propriétés' })
    expect(screen.getAllByRole('button', { name: 'Demander à Laura' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /Architecte cloud/ }))
    await screen.findByRole('heading', { name: 'Architecte cloud' })
    expect(screen.getAllByRole('button', { name: 'Demander à Laura' })).toHaveLength(1)
  })

  it('#4345 — « Demander à Laura » ouvre la bulle sur place, tiroir refermé, sans lien vers /chat', async () => {
    show({ kind: 'opportunity', id: OPP })
    await userEvent.click(await screen.findByRole('button', { name: 'Demander à Laura' }))
    expect(openInPlace).toHaveBeenCalledTimes(1)
    expect(openInPlace.mock.calls[0]?.[0]).toContain('Orange — renfort data')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[href^="/chat"]')).toBeNull()
  })

  it('« Ouvrir la fiche complète » suit l’objet affiché', async () => {
    show({ kind: 'opportunity', id: OPP })
    const first = await screen.findByRole('link', { name: 'Ouvrir la fiche complète' })
    expect(first).toHaveAttribute('href', `/projects/${OPP}`)
    await userEvent.click(await screen.findByRole('button', { name: /Architecte cloud/ }))
    await screen.findByRole('heading', { name: 'Architecte cloud' })
    const links = screen.getAllByRole('link', { name: 'Ouvrir la fiche complète' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', `/projects/needs/${NEED}`)
    expect(within(document.body).queryAllByText('Ouvrir la fiche complète').length).toBeLessThanOrEqual(1)
  })
})

describe('RecordPanel — les gestes de la fiche ne dépendent pas des objets liés (#4194)', () => {
  const UNKNOWN = '00000000-0000-4000-8000-0000000000ff'

  function showWithGestures() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <RecordPanel
          target={{ kind: 'opportunity', id: UNKNOWN }}
          onClose={() => {}}
          propertiesContent={<button type="button">Créer la mission</button>}
        />
      </QueryClientProvider>,
    )
  }

  it('« Créer la mission » reste là quand la lecture des objets liés échoue', async () => {
    showWithGestures()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer la mission' })).toBeInTheDocument()
  })

  it('« Créer la mission » est là dès l’ouverture, avant la réponse des objets liés', () => {
    showWithGestures()
    expect(screen.getByRole('button', { name: 'Créer la mission' })).toBeInTheDocument()
  })
})
