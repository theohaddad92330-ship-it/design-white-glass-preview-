import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, WorkspaceRole } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useErasePerson } from '@/features/contacts/hooks/useErasePerson'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useSession } from '@/lib/hooks/use-session'
import { useUserPermissions } from '@/lib/permissions'
import { ContactErasureCard } from './ContactErasureCard'

vi.mock('@/features/contacts/hooks/useErasePerson', () => ({ useErasePerson: vi.fn() }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: vi.fn() }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ useUserPermissions: vi.fn() }))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<object>()),
  useNavigate: () => vi.fn(),
}))

const ME = '11111111-1111-4111-8111-111111111111'
const COLLEAGUE = '22222222-2222-4222-8222-222222222222'
const mutate = vi.fn()

function contact(userId: string): Contact {
  return { id: 'c-1', user_id: userId, assigned_to: null, full_name: 'Claire Perrin' } as unknown as Contact
}

function setRole(role: WorkspaceRole | null) {
  vi.mocked(useUserPermissions).mockReturnValue(
    (role
      ? { status: 'known', role, extraPermissions: [], permissions: [] }
      : { status: 'unknown' }) as unknown as ReturnType<typeof useUserPermissions>,
  )
}

describe('ContactErasureCard — #2297 effacer une personne (RGPD art. 17)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockClear()
    vi.mocked(useErasePerson).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<
      typeof useErasePerson
    >)
    vi.mocked(useIsDemo).mockReturnValue(false)
    vi.mocked(useSession).mockReturnValue({ user: { id: ME } } as unknown as ReturnType<typeof useSession>)
    setRole('sales')
  })

  it('le porteur de la fiche efface — APRÈS une confirmation qui dit ce qui disparaît', async () => {
    render(<ContactErasureCard contact={contact(ME)} />)

    await userEvent.click(screen.getByRole('button', { name: 'Effacer cette personne' }))
    // Le clic n'efface RIEN : le geste est irréversible, la conséquence est
    // annoncée avant.
    expect(mutate).not.toHaveBeenCalled()
    expect(await screen.findByText(/sans retour possible/)).toBeInTheDocument()
    expect(screen.getByText(/plus jamais recollectée/)).toBeInTheDocument()
    // #2297.51 — son nom quitte aussi, tout de suite, l'organigramme et le
    // dossier du compte ; son opposition à être contactée est TOUJOURS posée,
    // qu'elle ait déjà refusé ou non (décision Louis 19/09/2026).
    expect(screen.getByText(/organigramme et du dossier/)).toBeInTheDocument()
    expect(screen.getByText(/opposition à être contactée est désormais posée dans tous les cas/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Effacer définitivement' }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-1' }))
  })

  it('un administrateur efface la fiche d’un collègue', () => {
    setRole('admin')
    render(<ContactErasureCard contact={contact(COLLEAGUE)} />)
    expect(screen.getByRole('button', { name: 'Effacer cette personne' })).toBeInTheDocument()
  })

  it('sait dire NON : un commercial sur la fiche d’un collègue n’a pas le geste, et l’écran dit qui l’a', () => {
    render(<ContactErasureCard contact={contact(COLLEAGUE)} />)
    expect(screen.queryByRole('button', { name: 'Effacer cette personne' })).not.toBeInTheDocument()
    expect(screen.getByText(/administrateur de l’espace ou le porteur de la fiche/)).toBeInTheDocument()
  })

  it('ne se montre pas en démonstration (décision Louis 19/09/2026)', () => {
    vi.mocked(useIsDemo).mockReturnValue(true)
    const { container } = render(<ContactErasureCard contact={contact(ME)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne propose rien tant que le droit n’est pas connu — inconnu n’est pas « autorisé »', () => {
    setRole(null)
    const { container } = render(<ContactErasureCard contact={contact(ME)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('parle anglais', async () => {
    await i18n.changeLanguage('en')
    render(<ContactErasureCard contact={contact(ME)} />)
    expect(screen.getByRole('button', { name: 'Erase this person' })).toBeInTheDocument()
  })
})
