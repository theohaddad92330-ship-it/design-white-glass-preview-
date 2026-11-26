import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactAssociations as Associations } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useContactAssociations } from '@/features/contacts/hooks/useContactAssociations'
import { useContactProjectLink } from '@/features/contacts/hooks/useContactProjectLink'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { ContactAssociations } from './ContactAssociations'

vi.mock('@/features/contacts/hooks/useContactAssociations', () => ({ useContactAssociations: vi.fn() }))
vi.mock('@/features/contacts/hooks/useContactProjectLink', () => ({ useContactProjectLink: vi.fn() }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
    title,
    className,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    title?: string
    className?: string
  }) => (
    <a
      href={
        Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to) +
        (search ? `?${new URLSearchParams(search).toString()}` : '')
      }
      title={title}
      className={className}
    >
      {children}
    </a>
  ),
}))

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const base: Associations = {
  contact_id: ID(1),
  account: { id: ID(2), name: 'Acme' },
  entity: null,
  entity_label: null,
  employment: 'to_verify',
  items: [],
}
function setData(data: Associations | undefined, extra: Record<string, unknown> = {}) {
  vi.mocked(useContactAssociations).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useContactAssociations>)
}

const linkMutate = vi.fn()
const unlinkMutate = vi.fn()
function setProjects(rows: { id: string; account_id: string; label: string }[]) {
  vi.mocked(useProjects).mockReturnValue({ data: rows } as unknown as ReturnType<typeof useProjects>)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  linkMutate.mockReset()
  unlinkMutate.mockReset()
  vi.mocked(useContactProjectLink).mockReturnValue({
    link: { mutate: linkMutate, isPending: false },
    unlink: { mutate: unlinkMutate, isPending: false },
  } as unknown as ReturnType<typeof useContactProjectLink>)
  setProjects([])
})

describe('ContactAssociations (#3712)', () => {
  it('#3712 — l’entité rattachée (clé validée) mène aux contacts de cette entité sur le compte', () => {
    setData({ ...base, entity: { id: ID(9), name: 'Servier Pharma' }, employment: 'current' })
    render(<ContactAssociations contactId={ID(1)} />)
    const link = screen.getByRole('link', { name: /Servier Pharma/ })
    expect(link).toHaveAttribute('href', `/accounts/${ID(2)}?tab=contacts&entity=Servier+Pharma`)
  })

  it('#3712 — une entité seulement déclarée (libellé sans clé) reste du texte, pas un lien deviné', () => {
    setData({ ...base, entity_label: 'Acme Cyber' })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.queryByRole('link', { name: /Acme Cyber/ })).not.toBeInTheDocument()
  })

  it('chaque lien mène à l’objet EXACT : compte, projet, besoin, mission', () => {
    setData({
      ...base,
      employment: 'current',
      items: [
        {
          kind: 'project',
          id: ID(10),
          name: 'Refonte SI',
          state: 'qualified',
          role: 'sponsor',
          basis: 'documented',
          project_id: null,
        },
        {
          kind: 'need',
          id: ID(11),
          name: 'Architecte cloud',
          state: 'to_qualify',
          role: 'decision_maker',
          basis: 'documented',
          project_id: ID(10),
        },
        {
          kind: 'mission',
          id: ID(12),
          name: 'Mission data',
          state: 'active',
          role: 'billing',
          basis: 'declared',
          project_id: null,
        },
      ],
    })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', `/accounts/${ID(2)}`)
    expect(screen.getByRole('link', { name: 'Refonte SI' })).toHaveAttribute('href', `/projects/${ID(10)}`)
    expect(screen.getByRole('link', { name: 'Architecte cloud' })).toHaveAttribute('href', `/projects/needs/${ID(11)}`)
    expect(screen.getByRole('link', { name: 'Mission data' })).toHaveAttribute('href', `/missions/${ID(12)}`)
    expect(screen.getByText(/rôle déclaré/)).toBeInTheDocument()
    expect(screen.getByText(/Emploi vérifié/)).toBeInTheDocument()
  })

  it('#3712.4 — un long titre de dossier est borné à 2 lignes et gardé en infobulle', () => {
    const name = 'Renfort exploitation des systèmes temps réel — demande confirmée par la DSI'
    setData({
      ...base,
      employment: 'current',
      items: [
        {
          kind: 'project',
          id: ID(10),
          name,
          state: 'detected',
          role: 'sponsor',
          basis: 'documented',
          project_id: null,
        },
      ],
    })
    render(<ContactAssociations contactId={ID(1)} />)
    const link = screen.getByRole('link', { name })
    expect(link).toHaveAttribute('title', name)
    expect(link.className).toContain('line-clamp-2')
  })

  it('#3712 — l’étape d’un projet est traduite, jamais la clé brute « detected »', () => {
    setData({
      ...base,
      employment: 'current',
      items: [
        {
          kind: 'project',
          id: ID(10),
          name: 'Bank as a Service',
          state: 'detected',
          role: 'sponsor',
          basis: 'documented',
          project_id: null,
        },
      ],
    })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.getByText(/Détecté/)).toBeInTheDocument()
    expect(screen.queryByText(/\bdetected\b/)).not.toBeInTheDocument()
  })

  it('compte seul : aucune carte « 0 », aucun projet suggéré par défaut', () => {
    setData(base)
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.getByRole('link', { name: 'Acme' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText(/\(0\)|Transactions|Tickets/)).not.toBeInTheDocument()
  })

  it('un contact historique n’est pas présenté comme toujours en poste', () => {
    setData({ ...base, employment: 'historical' })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.getByText(/Contact historique : n’est plus présenté en poste/)).toBeInTheDocument()
  })

  it('sans compte : on le dit sans bloquer, et le libellé d’entité reste « à confirmer »', () => {
    setData({ ...base, account: null, entity_label: 'Acme Cyber' })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(
      screen.getByText(/Aucun compte identifié — les notes et la préparation restent disponibles/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Entité déclarée : Acme Cyber \(à confirmer\)/)).toBeInTheDocument()
  })

  it('au-delà de 4 dossiers : les autres sont à un clic, pas une colonne de plus', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      kind: 'project' as const,
      id: ID(20 + i),
      name: `Projet ${i}`,
      state: 'qualified',
      role: 'sponsor',
      basis: 'documented' as const,
      project_id: null,
    }))
    setData({ ...base, items })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.getAllByRole('link', { name: /^Projet/ })).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Voir 2 autre(s)' })).toBeInTheDocument()
  })

  it('échec de lecture : dit, jamais une carte vide', () => {
    setData(undefined, { isError: true })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.getByText(/n’ont pas pu être lus/)).toBeInTheDocument()
  })

  it('#3712.5 « Associer » : seuls les projets du compte non associés sont proposés, et le geste écrit', () => {
    setProjects([
      { id: ID(30), account_id: ID(2), label: 'Projet du compte' },
      { id: ID(31), account_id: ID(99), label: 'Projet d’un autre compte' },
      { id: ID(10), account_id: ID(2), label: 'Déjà associé' },
    ])
    setData({
      ...base,
      items: [
        {
          kind: 'project',
          id: ID(10),
          name: 'Déjà associé',
          state: 'qualified',
          role: 'sponsor',
          basis: 'documented',
          project_id: null,
        },
      ],
    })
    render(<ContactAssociations contactId={ID(1)} />)
    fireEvent.click(screen.getByRole('button', { name: /Associer à un projet/ }))
    expect(screen.queryByText('Projet d’un autre compte')).not.toBeInTheDocument()
    // le bouton de validation reste inactif tant qu'aucun projet n'est choisi
    expect(screen.getByRole('button', { name: 'Associer' })).toBeDisabled()
  })

  it('#3712.5 aucun projet à proposer ⇒ aucun bouton ; contact historique ⇒ pas d’association proposée', () => {
    setData(base)
    const { unmount } = render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.queryByRole('button', { name: /Associer à un projet/ })).not.toBeInTheDocument()
    unmount()
    setProjects([{ id: ID(30), account_id: ID(2), label: 'Projet du compte' }])
    setData({ ...base, employment: 'historical' })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.queryByRole('button', { name: /Associer à un projet/ })).not.toBeInTheDocument()
  })

  it('#3712.5 « Retirer » défait un lien documenté (réversible) ; un rôle déclaré n’a pas de bouton', () => {
    setData({
      ...base,
      items: [
        {
          kind: 'project',
          id: ID(10),
          name: 'Refonte SI',
          state: 'qualified',
          role: 'sponsor',
          basis: 'documented',
          project_id: null,
        },
        {
          kind: 'mission',
          id: ID(12),
          name: 'Mission data',
          state: 'active',
          role: 'billing',
          basis: 'declared',
          project_id: null,
        },
      ],
    })
    render(<ContactAssociations contactId={ID(1)} />)
    const remove = screen.getAllByRole('button', { name: 'Retirer' })
    expect(remove).toHaveLength(1)
    fireEvent.click(remove[0])
    expect(unlinkMutate).toHaveBeenCalledWith({ projectId: ID(10) }, expect.any(Object))
  })

  it('#3712.7 — une mission affiche tous les rôles tenus par la personne, déclarés', () => {
    setData({
      ...base,
      items: [
        {
          kind: 'mission',
          id: ID(12),
          name: 'Mission data',
          state: 'active',
          role: 'client_manager',
          roles: ['client_manager', 'cra', 'billing'],
          basis: 'declared',
          project_id: null,
        },
      ],
    })
    render(<ContactAssociations contactId={ID(1)} />)
    expect(screen.getByText(/Manager client, Valide le relevé, Facturation/)).toBeInTheDocument()
    expect(screen.getByText(/rôle déclaré/)).toBeInTheDocument()
  })
})
