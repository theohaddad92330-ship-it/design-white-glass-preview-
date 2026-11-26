import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ContactsQuickChips } from './ContactsQuickChips'

const base = {
  view: 'all' as const,
  channel: null,
  unattached: false,
  doNotContact: false,
  onViewChange: () => {},
  onChannelChange: () => {},
  onUnattachedChange: () => {},
  onDoNotContactChange: () => {},
}

// #4526.4 — la puce « Mon CRM » du Répertoire : contacts d'origine CRM — `crm` SEUL depuis #4597.2 (renversement de « crm + import »), compteur exact serveur.
describe('ContactsQuickChips — puce Mon CRM (#4526.4)', () => {
  it('libellée « Mon CRM » avec son compteur exact', () => {
    render(<ContactsQuickChips {...base} monCrm={{ count: 5, active: false, onToggle: () => {} }} />)
    expect(screen.getByRole('button', { name: /Mon CRM/ })).toHaveTextContent('5')
  })

  // #4587.1 — « deux dessins pour un même geste » : la puce CRM passe par le MÊME `chipClassName` que ses voisines
  // (même fond, même bordure, même hauteur). Une classe écrite à la main la ferait diverger — ce test le voit.
  it('#4587.1 — a EXACTEMENT les classes de la puce voisine, au repos comme active', () => {
    const { rerender } = render(
      <ContactsQuickChips {...base} monCrm={{ count: 5, active: false, onToggle: () => {} }} />,
    )
    const neighbour = screen.getByRole('button', { name: /Avec e-mail/ })
    expect(screen.getByRole('button', { name: /Mon CRM/ }).className).toBe(neighbour.className)

    rerender(
      <ContactsQuickChips {...base} channel="with_email" monCrm={{ count: 5, active: true, onToggle: () => {} }} />,
    )
    const activeNeighbour = screen.getByRole('button', { name: /Avec e-mail/ })
    expect(screen.getByRole('button', { name: /Mon CRM/ }).className).toBe(activeNeighbour.className)
  })

  it('libellée par le nom du CRM branché quand il est connu', () => {
    render(
      <ContactsQuickChips {...base} monCrm={{ count: 5, active: false, crmName: 'HubSpot', onToggle: () => {} }} />,
    )
    expect(screen.getByRole('button', { name: /HubSpot/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mon CRM/ })).not.toBeInTheDocument()
  })

  it('sait dire NON : zéro ou compteur inconnu ⇒ AUCUNE puce, jamais « 0 »', () => {
    const { rerender } = render(
      <ContactsQuickChips {...base} monCrm={{ count: 0, active: false, onToggle: () => {} }} />,
    )
    expect(screen.queryByRole('button', { name: /Mon CRM/ })).not.toBeInTheDocument()
    rerender(<ContactsQuickChips {...base} monCrm={{ count: undefined, active: false, onToggle: () => {} }} />)
    expect(screen.queryByRole('button', { name: /Mon CRM/ })).not.toBeInTheDocument()
    rerender(<ContactsQuickChips {...base} />)
    expect(screen.queryByRole('button', { name: /Mon CRM/ })).not.toBeInTheDocument()
  })

  it('active, elle reste là même à zéro (on doit pouvoir la relâcher) et sans chiffre inventé', () => {
    render(<ContactsQuickChips {...base} monCrm={{ count: undefined, active: true, onToggle: () => {} }} />)
    const chip = screen.getByRole('button', { name: /Mon CRM/ })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip).not.toHaveTextContent(/\d/)
  })

  it('le clic bascule, et « Tous » n’est pas actif tant que Mon CRM l’est', async () => {
    const onToggle = vi.fn()
    render(<ContactsQuickChips {...base} monCrm={{ count: 5, active: true, onToggle }} />)
    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: /Mon CRM/ }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

// #4597.1 — la puce « Importés » : les fichiers importés ont leur puce, jamais sous le nom d'un CRM (#4597.2).
describe('ContactsQuickChips — puce Importés (#4597.1)', () => {
  const imported = (over: Partial<{ count: number | undefined; active: boolean; onToggle: () => void }> = {}) => ({
    count: 1080,
    active: false,
    onToggle: () => {},
    ...over,
  })

  it('libellée « Importés » avec son compteur exact — et JAMAIS du nom du CRM', () => {
    render(
      <ContactsQuickChips
        {...base}
        monCrm={{ count: 5, active: false, crmName: 'HubSpot', onToggle: () => {} }}
        imported={imported()}
      />,
    )
    expect(screen.getByRole('button', { name: /Importés/ })).toHaveTextContent('1080')
    expect(screen.getByRole('button', { name: /HubSpot/ })).toHaveTextContent('5')
    expect(screen.getByRole('button', { name: /HubSpot/ })).not.toHaveTextContent('1080')
  })

  it('sait dire NON : zéro, inconnu ou non branchée ⇒ AUCUNE puce, jamais « 0 »', () => {
    const { rerender } = render(<ContactsQuickChips {...base} imported={imported({ count: 0 })} />)
    expect(screen.queryByRole('button', { name: /Importés/ })).not.toBeInTheDocument()
    rerender(<ContactsQuickChips {...base} imported={imported({ count: undefined })} />)
    expect(screen.queryByRole('button', { name: /Importés/ })).not.toBeInTheDocument()
    rerender(<ContactsQuickChips {...base} />)
    expect(screen.queryByRole('button', { name: /Importés/ })).not.toBeInTheDocument()
  })

  it('active, elle reste là (on doit pouvoir la relâcher) sans chiffre inventé ; « Tous » la relâche', async () => {
    const onToggle = vi.fn()
    render(<ContactsQuickChips {...base} imported={imported({ count: undefined, active: true, onToggle })} />)
    const chip = screen.getByRole('button', { name: /Importés/ })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip).not.toHaveTextContent(/\d/)
    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Tous' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

// #4597.3 — la liste ouverte sur UN import précis se dit, et se relâche.
describe('ContactsQuickChips — un import précis (#4597.3)', () => {
  it('une puce « Un import précis » apparaît quand la liste est filtrée sur un import, et se relâche', async () => {
    const onClear = vi.fn()
    render(<ContactsQuickChips {...base} importJob={{ onClear }} />)
    const chip = screen.getByRole('button', { name: /Cet import/ })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('absente sans filtre d’import', () => {
    render(<ContactsQuickChips {...base} />)
    expect(screen.queryByRole('button', { name: /Cet import/ })).not.toBeInTheDocument()
  })
})
