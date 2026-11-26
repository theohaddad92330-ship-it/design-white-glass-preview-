import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { chipClassName } from '@bellum/ui'
import {
  AccountsCrmChip,
  AccountsImportedChip,
  crmChipSearch,
  crmFilterOf,
  importedChipSearch,
  importedFilterOf,
} from './AccountsCrmChip'

// #4526.1/.3/.6 — la puce « Mon CRM » du portefeuille.
describe('AccountsCrmChip', () => {
  it('se nomme « Mon CRM » par défaut, avec son compteur, et appelle onToggle', () => {
    const onToggle = vi.fn()
    render(<AccountsCrmChip count={12} active={false} onToggle={onToggle} />)
    const chip = screen.getByRole('button', { name: /Mon CRM/ })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip).toHaveTextContent('12')
    fireEvent.click(chip)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('porte le nom du CRM branché du client quand il est connu (#4526.6)', () => {
    render(<AccountsCrmChip count={3} active crmName="HubSpot" onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /HubSpot/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Mon CRM/)).toBeNull()
  })

  it('SAIT DIRE NON : zéro ou compteur absent ⇒ pas de puce, jamais « 0 » (GA-18/19)', () => {
    const { container, rerender } = render(<AccountsCrmChip count={0} active={false} onToggle={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AccountsCrmChip count={undefined} active={false} onToggle={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('reste visible quand elle est active, même à zéro : on doit pouvoir la relâcher', () => {
    render(<AccountsCrmChip count={0} active onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Mon CRM/ })).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()
  })

  // #4597 — recette prod 26/10 : la puce mesurait 44 px contre 32 px pour les quatre puces voisines. Une puce
  // ajoutée à une rangée prend la taille de la rangée : la grammaire PARTAGÉE des pastilles (`chipClassName`, 32 px),
  // dont le plancher tactile de 44 px ne joue que sous un pointeur grossier (GA-30/GA-35) — jamais en permanence.
  it('prend la taille de la rangée (32 px) : la grammaire partagée des pastilles, pas un min-h-11 permanent', () => {
    render(<AccountsCrmChip count={2} active={false} onToggle={vi.fn()} />)
    const className = screen.getByRole('button', { name: /Mon CRM/ }).className
    for (const token of chipClassName({ active: false, size: 'md' }).split(' ')) expect(className).toContain(token)
    expect(className).toMatch(/\bh-8\b/)
    expect(className).not.toMatch(/(^|\s)min-h-11(\s|$)/)
    expect(className).toMatch(/pointer-coarse:min-h-11/)
  })
})

// #4597.1 — la puce « Importés » : les fichiers importés, jamais sous le nom d'un CRM.
describe('AccountsImportedChip', () => {
  it('se nomme « Importés », avec son compteur exact, et appelle onToggle', () => {
    const onToggle = vi.fn()
    render(<AccountsImportedChip count={602} active={false} onToggle={onToggle} />)
    const chip = screen.getByRole('button', { name: /Importés/ })
    expect(chip).toHaveTextContent('602')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('SAIT DIRE NON : zéro ou compteur absent ⇒ pas de puce, jamais « 0 » (GA-18/19)', () => {
    const { container, rerender } = render(<AccountsImportedChip count={0} active={false} onToggle={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AccountsImportedChip count={undefined} active={false} onToggle={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('reste visible quand elle est active, même à zéro, sans chiffre inventé', () => {
    render(<AccountsImportedChip count={0} active onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Importés/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('0')).toBeNull()
  })

  it('a la MÊME taille que la puce CRM et que le reste de la rangée', () => {
    render(
      <>
        <AccountsCrmChip count={2} active={false} onToggle={vi.fn()} />
        <AccountsImportedChip count={2} active={false} onToggle={vi.fn()} />
      </>,
    )
    expect(screen.getByRole('button', { name: /Importés/ }).className).toBe(
      screen.getByRole('button', { name: /Mon CRM/ }).className,
    )
  })
})

describe('état dans l’URL', () => {
  it('crm=only active le filtre, toute autre valeur non', () => {
    expect(crmFilterOf({ crm: 'only' })).toBe('only')
    expect(crmFilterOf({ crm: 'x' })).toBeUndefined()
    expect(crmFilterOf({})).toBeUndefined()
  })

  it('le clic écrit crm sans toucher aux autres axes (intersection avec Suivis)', () => {
    const on = crmChipSearch({ lens: 'followed', q: 'sg' }, true)
    expect(on).toMatchObject({ lens: 'followed', q: 'sg', crm: 'only', page: undefined })
    expect(crmChipSearch({ lens: 'followed', crm: 'only' }, false)).toMatchObject({ lens: 'followed', crm: undefined })
  })
})

describe('état dans l’URL — Importés (#4597.1)', () => {
  it('imported=only active le filtre, toute autre valeur non', () => {
    expect(importedFilterOf({ imported: 'only' })).toBe('only')
    expect(importedFilterOf({ imported: 'x' })).toBeUndefined()
    expect(importedFilterOf({})).toBeUndefined()
  })

  it('le clic écrit imported sans toucher aux autres axes, et sans poser `crm` (deux vues, jamais confondues)', () => {
    const on = importedChipSearch({ lens: 'followed', q: 'sg' }, true)
    expect(on).toMatchObject({ lens: 'followed', q: 'sg', imported: 'only', page: undefined })
    expect(on).not.toHaveProperty('crm', 'only')
    expect(importedChipSearch({ imported: 'only' }, false)).toMatchObject({ imported: undefined })
  })
})
