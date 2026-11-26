import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyAnglesPicker } from './MyAnglesPicker'
import { userAnglesApi } from './user-angles'

vi.mock('./user-angles', () => ({
  userAnglesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() },
}))

const api = vi.mocked(userAnglesApi)
const DORA = { id: 'a1', title: 'Conformité DORA', content: 'Ouvrir sur l’échéance réglementaire.', archived: false }

/** #4739 — « Mes angles » sur « Contacter » : créer, retrouver, modifier, retirer ; jamais d’envoi. */
describe('MyAnglesPicker', () => {
  beforeEach(() => vi.resetAllMocks())

  it('retrouve mes angles à l’ouverture et pose le texte choisi dans le composer', async () => {
    api.list.mockResolvedValue([DORA])
    const onUseAngle = vi.fn()
    render(<MyAnglesPicker onUseAngle={onUseAngle} />)
    expect(api.list).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Mes angles/ }))
    await userEvent.click(await screen.findByRole('button', { name: /^Conformité DORA/ }))
    expect(onUseAngle).toHaveBeenCalledWith('Ouvrir sur l’échéance réglementaire.')
  })

  it('dit « aucun angle » avec une porte de création, sans inventer de ligne', async () => {
    api.list.mockResolvedValue([])
    render(<MyAnglesPicker onUseAngle={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Mes angles/ }))
    expect(await screen.findByText(/pas encore écrit d’angle/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nouvel angle' })).toBeInTheDocument()
  })

  it('crée un angle par le formulaire générique puis l’affiche', async () => {
    api.list.mockResolvedValue([])
    api.create.mockResolvedValue(DORA)
    render(<MyAnglesPicker onUseAngle={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Mes angles/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvel angle' }))
    await userEvent.type(screen.getByLabelText('Titre'), 'Conformité DORA')
    await userEvent.type(screen.getByLabelText('Contenu de l’angle'), 'Ouvrir sur l’échéance réglementaire.')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.create).toHaveBeenCalledWith({
      title: 'Conformité DORA',
      content: 'Ouvrir sur l’échéance réglementaire.',
    })
    expect(await screen.findByRole('button', { name: /^Conformité DORA/ })).toBeInTheDocument()
  })

  it('modifie / renomme avec le MÊME formulaire (c75)', async () => {
    api.list.mockResolvedValue([DORA])
    api.update.mockResolvedValue({ ...DORA, title: 'DORA 2027' })
    render(<MyAnglesPicker onUseAngle={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Mes angles/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Modifier l’angle/ }))
    const title = screen.getByLabelText('Titre')
    await userEvent.clear(title)
    await userEvent.type(title, 'DORA 2027')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.update).toHaveBeenCalledWith('a1', { title: 'DORA 2027', content: DORA.content })
    expect(await screen.findByRole('button', { name: /^DORA 2027/ })).toBeInTheDocument()
  })

  it('retire un angle (archivage) : il disparaît de la liste', async () => {
    api.list.mockResolvedValue([DORA])
    api.archive.mockResolvedValue(undefined)
    render(<MyAnglesPicker onUseAngle={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Mes angles/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Retirer l’angle/ }))
    expect(api.archive).toHaveBeenCalledWith('a1')
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Conformité DORA/ })).toBeNull())
  })

  it('échec du chargement : un message clair, aucune liste inventée', async () => {
    api.list.mockRejectedValue(new Error('boom'))
    render(<MyAnglesPicker onUseAngle={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Mes angles/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/n’ont pas pu être chargés/)
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
