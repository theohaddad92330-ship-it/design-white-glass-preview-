import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DossierSearchItem } from './dossierSearch'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && Object.keys(options).length > 0 ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: 'fr' },
  }),
}))

vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: ({ question, label, accountId }: { question: string; label: string; accountId?: string }) => (
    <a href="#" data-question={question} data-account={accountId}>
      {label}
    </a>
  ),
}))

const { DossierSearch } = await import('./DossierSearchField')

const ITEMS: DossierSearchItem[] = [
  { kind: 'contact', id: 'c1', label: 'Sarah Martin', context: 'DSI', date: '2026-09-01T10:00:00Z' },
  { kind: 'signal', id: 's1', label: 'Levée de fonds série B', context: 'Presse', date: null },
  { kind: 'mission', id: 'm1', label: 'Refonte ERP', context: null, date: '2026-08-01' },
]

function Harness({
  onOpen = () => {},
  onPrepareAction = () => {},
  onAddWhatIKnow = () => {},
  initialQuery = '',
}: {
  onOpen?: (result: unknown) => void
  onPrepareAction?: () => void
  onAddWhatIKnow?: () => void
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  return (
    <div>
      <input aria-label="autre champ" />
      <DossierSearch
        accountId="acc-1"
        companyName="ACME"
        items={ITEMS}
        query={query}
        onQueryChange={setQuery}
        onOpen={onOpen}
        onPrepareAction={onPrepareAction}
        onAddWhatIKnow={onAddWhatIKnow}
      />
    </div>
  )
}

const field = () => screen.getByRole('searchbox', { name: 'dossierSearch.label' })

describe('DossierSearch — retrouver sans savoir dans quelle section (#2128.31)', () => {
  it('pose un champ de recherche compact et nommé, qui annonce son raccourci (#2128.31-32)', () => {
    render(<Harness />)
    expect(field()).toHaveAttribute('aria-keyshortcuts', '/')
    expect(field().getAttribute('title')).toContain('dossierSearch.shortcutHint')
  })

  it('rend les résultats à la frappe, sans rechargement : type, libellé, contexte, date, section, action (#2128.44-49, .61)', async () => {
    render(<Harness />)
    await userEvent.type(field(), 'sarah')
    const results = screen.getByRole('list', { name: 'dossierSearch.results' })
    const [row] = within(results).getAllByRole('listitem')
    expect(row).toHaveTextContent('dossierSearch.kinds.contact')
    expect(row).toHaveTextContent('Sarah Martin')
    expect(row).toHaveTextContent('DSI')
    expect(row?.querySelector('time')).toHaveAttribute('dateTime', '2026-09-01T10:00:00Z')
    expect(row).toHaveTextContent('tabSections.people')
    expect(row).toHaveTextContent('tabs.contacts')
    expect(within(row as HTMLElement).getByRole('button')).toHaveTextContent('dossierSearch.open')
  })

  it('n’affiche aucune date quand l’objet n’en porte pas — jamais une date inventée', async () => {
    render(<Harness />)
    await userEvent.type(field(), 'levée')
    const [row] = within(screen.getByRole('list', { name: 'dossierSearch.results' })).getAllByRole('listitem')
    expect(row?.querySelector('time')).toBeNull()
  })

  it('ouvre EXACTEMENT le résultat cliqué (#2128.62)', async () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    await userEvent.type(field(), 'refonte')
    await userEvent.click(screen.getByRole('button', { name: /Refonte ERP/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mission', id: 'm1', tab: 'missions' }))
  })

  it('au clavier : Entrée ouvre le premier résultat, flèche bas passe aux résultats (#2128.63)', async () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    await userEvent.type(field(), 'r')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: /dossierSearch.open/ })[0])
    await userEvent.click(field())
    await userEvent.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('« / » hors d’un champ met le curseur dans la recherche ; dans un autre champ, il s’écrit (#2128.32/.59)', async () => {
    render(<Harness />)
    fireEvent.keyDown(document.body, { key: '/' })
    expect(document.activeElement).toBe(field())

    const other = screen.getByRole('textbox', { name: 'autre champ' })
    other.focus()
    fireEvent.keyDown(other, { key: '/' })
    expect(document.activeElement).toBe(other)
  })

  it('« / » avec un modificateur ne vole rien — ⌘/ reste l’aide des raccourcis', () => {
    render(<Harness />)
    fireEvent.keyDown(document.body, { key: '/', metaKey: true })
    expect(document.activeElement).not.toBe(field())
  })

  it('Échap vide la recherche', async () => {
    render(<Harness initialQuery="sarah" />)
    await userEvent.click(field())
    await userEvent.keyboard('{Escape}')
    expect(field()).toHaveValue('')
  })

  it('champ vide : les trois raccourcis d’action — Laura, préparer une action, ajouter ce que je sais (#2128.33/.56-58)', async () => {
    const onPrepareAction = vi.fn()
    const onAddWhatIKnow = vi.fn()
    render(<Harness onPrepareAction={onPrepareAction} onAddWhatIKnow={onAddWhatIKnow} />)
    await userEvent.click(field())
    const actions = screen.getByRole('group', { name: 'dossierSearch.quickActions' })
    expect(within(actions).getByText('dossierSearch.askLaura')).toHaveAttribute('data-account', 'acc-1')
    await userEvent.click(within(actions).getByRole('button', { name: 'dossierSearch.prepareAction' }))
    await userEvent.click(within(actions).getByRole('button', { name: 'dossierSearch.addWhatIKnow' }))
    expect(onPrepareAction).toHaveBeenCalledTimes(1)
    expect(onAddWhatIKnow).toHaveBeenCalledTimes(1)
  })

  it('une recherche sans résultat le dit, et propose de la confier à Laura avec la requête (#2128.33)', async () => {
    render(<Harness />)
    await userEvent.type(field(), 'introuvable')
    expect(screen.getByText(/dossierSearch.empty/)).toBeInTheDocument()
    const ask = screen.getByText(/dossierSearch.askLauraAbout/)
    expect(ask.getAttribute('data-question')).toContain('introuvable')
    expect(ask.getAttribute('data-question')).toContain('ACME')
  })
})
