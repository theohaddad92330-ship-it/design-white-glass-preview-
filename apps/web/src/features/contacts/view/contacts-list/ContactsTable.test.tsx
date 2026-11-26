import { fireEvent, screen } from '@testing-library/react'
import { beforeAll, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactsTable } from './ContactsTable'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

// Même double que `ContactTableRow.test.tsx` (ligne fraîche à chaque test).
const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => [] }))
vi.mock('@/features/contacts/hooks/useAssignContacts', () => ({
  useAssignContacts: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}))

beforeAll(() => {
  window.scrollTo = vi.fn()
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

function makeContact(overrides: Partial<GlobalContact> = {}): GlobalContact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Alice Martin',
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 5,
    email: 'alice@corp.co',
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
    ...overrides,
  }
}

function renderTable(rows: GlobalContact[], groupByAccount = false) {
  return renderWithRouter(
    <ContactsTable
      rows={rows}
      selectedContactIds={new Set()}
      onContactSelectionChange={() => {}}
      onContactRowMouseDown={() => {}}
      onContactRowMouseEnter={() => {}}
      onToggleAll={() => {}}
      groupByAccount={groupByAccount}
    />,
    '/',
  )
}

// #3942.5 — brief F05, point 2 : un en-tête par compte, posé UNIQUEMENT en
// portée Recommandés (`groupByAccount`) et seulement quand le serveur a posé
// un chemin (`recommended_path_size`) — jamais un groupe inventé en portée
// « Tous ».
describe('#3942.5 — en-tête de groupe par compte (brief F05)', () => {
  it('insère un en-tête à CHAQUE changement de compte, jamais au milieu d’un même compte', async () => {
    renderTable(
      [
        makeContact({
          id: 'c1',
          account_id: 'acc-1',
          company_name: 'Accor',
          recommended_rank: 1,
          recommended_path_size: 2,
        }),
        makeContact({
          id: 'c2',
          account_id: 'acc-1',
          full_name: 'Bob Martin',
          company_name: 'Accor',
          recommended_rank: 2,
          recommended_path_size: 2,
        }),
        makeContact({
          id: 'c3',
          account_id: 'acc-2',
          full_name: 'Carla Dupuis',
          company_name: 'Sodexo',
          recommended_rank: 1,
          recommended_path_size: 1,
        }),
      ],
      true,
    )

    await screen.findByText('Alice Martin')
    // #4503.6 — « Compte — N contacts prioritaires » : chaque compte ne vit QUE dans un en-tête — une occurrence
    // chacun prouve UN SEUL en-tête par compte (acc-1 porte deux lignes, pas deux en-têtes).
    expect(screen.getByText('— 2 contacts prioritaires')).toBeInTheDocument()
    expect(screen.getByText('— 1 contact prioritaire')).toBeInTheDocument()
    expect(screen.getAllByTestId('contacts-group-account').map(node => node.textContent)).toEqual(['Accor', 'Sodexo'])
    // Les deux comptes (Accor, Sodexo) se nomment — en-tête ET cellule « Entreprise ».
    expect(screen.getAllByText('Accor')).toHaveLength(3) // l'en-tête + les 2 lignes de ce compte
    expect(screen.getAllByText('Sodexo')).toHaveLength(2) // l'en-tête + l'unique ligne de ce compte
  })

  // #4093 — une case à côté du nom de l'entreprise (en-tête de groupe) : coche/décoche
  // tous les contacts de CETTE entreprise ; indéterminée quand la sélection est partielle.
  describe('#4093 — case « tout l’entreprise » dans l’en-tête de groupe', () => {
    const rows = [
      makeContact({ id: 'c1', account_id: 'acc-1', company_name: 'Accor', recommended_path_size: 2 }),
      makeContact({
        id: 'c2',
        account_id: 'acc-1',
        full_name: 'Bob Martin',
        company_name: 'Accor',
        recommended_path_size: 2,
      }),
      makeContact({
        id: 'c3',
        account_id: 'acc-2',
        full_name: 'Carla Dupuis',
        company_name: 'Sodexo',
        recommended_path_size: 1,
      }),
    ]
    const renderSelectable = (selected: string[], onChange = vi.fn()) =>
      renderWithRouter(
        <ContactsTable
          rows={rows}
          selectedContactIds={new Set(selected)}
          onContactSelectionChange={onChange}
          onContactRowMouseDown={() => {}}
          onContactRowMouseEnter={() => {}}
          onToggleAll={() => {}}
          groupByAccount
        />,
        '/',
      )

    it('cocher la case de l’entreprise sélectionne TOUS ses contacts, et eux seuls', async () => {
      const onChange = vi.fn()
      renderSelectable([], onChange)
      const box = await screen.findByRole('checkbox', { name: 'Sélectionner tous les contacts de Accor' })
      fireEvent.click(box)
      expect(onChange.mock.calls.map(([contact, selected]) => [contact.id, selected])).toEqual([
        ['c1', true],
        ['c2', true],
      ])
    })

    it('sélection partielle → état indéterminé ; complète → coché, et un clic désélectionne', async () => {
      const onChange = vi.fn()
      const { unmount } = renderSelectable(['c1'], onChange)
      const partial = await screen.findByRole('checkbox', { name: 'Sélectionner tous les contacts de Accor' })
      expect(partial).toHaveAttribute('aria-checked', 'mixed')
      unmount()
      renderSelectable(['c1', 'c2'], onChange)
      const full = await screen.findByRole('checkbox', { name: 'Sélectionner tous les contacts de Accor' })
      expect(full).toHaveAttribute('aria-checked', 'true')
      fireEvent.click(full)
      expect(onChange.mock.calls.map(([contact, selected]) => [contact.id, selected])).toEqual([
        ['c1', false],
        ['c2', false],
      ])
    })
  })

  it('sans `groupByAccount` (portée « Tous »), aucun en-tête — même si `recommended_path_size` était posé', async () => {
    renderTable(
      [makeContact({ id: 'c1', account_id: 'acc-1', company_name: 'Accor', recommended_path_size: 2 })],
      false,
    )
    await screen.findByText('Alice Martin')
    expect(screen.queryByText(/contacts? prioritaire/)).not.toBeInTheDocument()
  })

  it('sans `recommended_path_size` (ligne hors chemin), aucun en-tête même en mode groupé', async () => {
    renderTable([makeContact({ id: 'c1', account_id: 'acc-1', company_name: 'Accor' })], true)
    await screen.findByText('Alice Martin')
    expect(screen.queryByText(/contacts? prioritaire/)).not.toBeInTheDocument()
  })
})

// Théo B c1-repertoire.N1 — « Compacter la liste » : le tableau porte sa densité, la ligne s'y adapte.
function renderDensityTable(compact?: boolean) {
  return renderWithRouter(
    <ContactsTable
      rows={[makeContact()]}
      selectedContactIds={new Set()}
      onContactSelectionChange={() => {}}
      onContactRowMouseDown={() => {}}
      onContactRowMouseEnter={() => {}}
      onToggleAll={() => {}}
      {...(compact ? { compact } : {})}
    />,
  )
}

it('c1-repertoire.N1 — par défaut le tableau est aéré', async () => {
  const { container } = renderDensityTable()
  await screen.findByText('Alice Martin')
  expect(container.querySelector('[data-density]')?.getAttribute('data-density')).toBe('comfortable')
})

it('c1-repertoire.N1 — compacté, le tableau le dit', async () => {
  const { container } = renderDensityTable(true)
  await screen.findByText('Alice Martin')
  expect(container.querySelector('[data-density]')?.getAttribute('data-density')).toBe('compact')
})

// #4982.2 — regroupement par ville dans la liste triée par zone : un en-tête quand la ville change, « Zone inconnue »
// pour les lignes sans lieu (jamais une ville devinée). Pas de carte.
function renderZoneTable(rows: GlobalContact[]) {
  return renderWithRouter(
    <ContactsTable
      rows={rows}
      selectedContactIds={new Set()}
      onContactSelectionChange={() => {}}
      onContactRowMouseDown={() => {}}
      onContactRowMouseEnter={() => {}}
      onToggleAll={() => {}}
      groupByZone
    />,
    '/',
  )
}

// #4982 — région d'abord (Louis 31/10) : l'en-tête est la RÉGION, la ville en sous-libellé ; ville sans région connue
// ⇒ « Région inconnue », jamais devinée.
it('#4982 groupByZone : un en-tête par RÉGION, la ville en sous-libellé, « Région inconnue » en dernier', async () => {
  renderZoneTable([
    makeContact({ id: 'z1', full_name: 'Lillois Un', zone_city: 'Lille', zone_department: '59' }),
    makeContact({ id: 'z2', full_name: 'Lillois Deux', zone_city: 'Lille', zone_department: '59' }),
    makeContact({ id: 'z3', full_name: 'Douaisien', zone_city: 'Douai', zone_department: '59' }),
    makeContact({ id: 'z4', full_name: 'Parisien', zone_city: 'Paris', zone_department: '75' }),
    makeContact({ id: 'z5', full_name: 'Corse', zone_city: 'Ajaccio', zone_department: '20' }),
    makeContact({ id: 'z6', full_name: 'Ville Seule', zone_city: 'Quelquepart', zone_department: null }),
    makeContact({ id: 'z7', full_name: 'Sans Lieu', zone_city: null, zone_department: null }),
  ])
  const headers = await screen.findAllByTestId('contacts-group-zone')
  expect(headers.map(h => h.textContent)).toEqual(['Hauts-de-France', 'Île-de-France', 'Corse', 'Région inconnue'])
  const cities = screen.getAllByTestId('contacts-group-city')
  expect(cities.map(c => c.textContent)).toEqual(['Lille', 'Douai', 'Paris', 'Ajaccio', 'Quelquepart'])
})

it('#4982.2 sans groupByZone : aucun en-tête de zone (l’ordre d’avant)', async () => {
  renderTable([makeContact({ id: 'z1', zone_city: 'Lyon' })])
  await screen.findByText('Alice Martin')
  expect(screen.queryByTestId('contacts-group-zone')).toBeNull()
})

// #4962 recette 01/11 — le sous-libellé de ville vient de LinkedIn en anglais (« Greater Paris Metropolitan Region ») :
// il se lit dans la langue de l'interface, la ville reste telle quelle.
it('groupByZone : « Greater Paris Metropolitan Region » se lit « Région de Paris » dans l’interface française', async () => {
  renderZoneTable([
    makeContact({
      id: 'z1',
      full_name: 'Parisien',
      zone_city: 'Greater Paris Metropolitan Region',
      zone_department: '75',
    }),
    makeContact({ id: 'z2', full_name: 'Lillois', zone_city: 'Greater Lille Metropolitan', zone_department: '59' }),
  ])
  const cities = await screen.findAllByTestId('contacts-group-city')
  expect(cities.map(c => c.textContent)).toEqual(['Région de Paris', 'Région de Lille'])
  expect(document.body.textContent).not.toMatch(/Greater|Metropolitan/)
})
