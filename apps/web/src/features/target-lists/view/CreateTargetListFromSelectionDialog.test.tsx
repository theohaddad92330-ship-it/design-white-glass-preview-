import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessionUser } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { CreateTargetListFromSelectionDialog } = await import('./CreateTargetListFromSelectionDialog')

const STAMP = '2026-09-23T00:00:00.000Z'

/**
 * #2157.4/.8/.10-.16/.20 — « Créer une cible » depuis une SÉLECTION de lignes
 * (Comptes d'abord), avec une preview AVANT l'écriture : nom proposé ET
 * modifiable (#2157.20), objectif, type dérivé, comptes/contacts inclus,
 * doublons détectés — les fiches déjà présentes dans une AUTRE cible, la
 * même notion que #2157.16. Le même double complet qu'ailleurs (voir
 * `TargetListsContent.test.tsx`) — un champ manquant fait échouer le PARSE
 * de frontière, pas l'assertion.
 */
function targetList(over: { id: string; name: string; items?: Array<{ kind: string; ref_id: string }> }) {
  return {
    id: over.id,
    name: over.name,
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'workspace',
    source: 'manual',
    source_query: null,
    status: 'draft',
    counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
    next_action: null,
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'u1',
    created_at: STAMP,
    updated_at: STAMP,
    items: (over.items ?? []).map((item, index) => ({
      id: `existing-${index}`,
      target_list_id: over.id,
      kind: item.kind,
      ref_id: item.ref_id,
      label: 'Fiche existante',
      sublabel: null,
      selection_reason: null,
      priority: null,
      owner_user_id: null,
      work_status: 'to_review',
      provenance: 'manual',
      refreshed_at: null,
      removed_at: null,
      removal_reason: null,
      next_action: null,
      notes: null,
      created_at: STAMP,
      updated_at: STAMP,
    })),
  }
}

type FetchArgs = { path: string; method?: string; body?: unknown }

function mockApi(existingLists: ReturnType<typeof targetList>[] = []) {
  apiFetch.mockImplementation(async (args?: FetchArgs) => {
    const { path, method } = args ?? { path: '' }
    if (path === '/target-lists' && (method ?? 'GET') === 'GET') return { lists: existingLists }
    if (path === '/target-lists' && method === 'POST') return targetList({ id: 'new-list-1', name: 'Cible créée' })
    if (path === '/workspaces/members') {
      return [
        { userId: 'u1', email: 'moi@x.fr', fullName: 'Moi', role: 'owner', isSelf: true },
        { userId: 'u2', email: 'lea@x.fr', fullName: 'Léa Martin', role: 'member', isSelf: false },
      ]
    }
    if (path?.includes('/items') && method === 'POST') {
      return {
        id: 'item-1',
        target_list_id: 'new-list-1',
        kind: 'account',
        ref_id: 'acc-1',
        label: 'ACME',
        sublabel: null,
        selection_reason: null,
        priority: null,
        owner_user_id: null,
        work_status: 'to_review',
        provenance: 'manual',
        refreshed_at: null,
        removed_at: null,
        removal_reason: null,
        next_action: null,
        notes: null,
        created_at: STAMP,
        updated_at: STAMP,
      }
    }
    return {}
  })
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof CreateTargetListFromSelectionDialog>> = {},
  userId = 'u1',
) {
  const onOpenChange = vi.fn()
  const onDone = vi.fn()
  const utils = renderWithRouter(
    <SessionContext.Provider value={{ user: { id: userId } as SessionUser, loading: false }}>
      <CreateTargetListFromSelectionDialog
        open
        onOpenChange={onOpenChange}
        items={[
          { kind: 'account', id: 'acc-1', label: 'ACME' },
          { kind: 'account', id: 'acc-2', label: 'Globex' },
        ]}
        onDone={onDone}
        {...props}
      />
    </SessionContext.Provider>,
  )
  return { ...utils, onOpenChange, onDone }
}

beforeEach(() => {
  apiFetch.mockReset()
  // #2405.3 — `useTargetLists` porte un `staleTime` de 30s et le `QueryClient`
  // du harnais est un singleton PARTAGÉ par tout le fichier : sans ce reset,
  // un scénario lit le cache du précédent au lieu du double qu'il vient de
  // poser (voir `renderWithRouter.tsx`).
  resetTestQueryClient()
})

describe('CreateTargetListFromSelectionDialog — #2157.4/.8/.10-.16/.20', () => {
  it('propose un nom, et affiche le type et les comptes/contacts inclus (#2157.10/.12/.13/.14)', async () => {
    mockApi()
    renderDialog()
    const nameInput = await screen.findByLabelText('Nom de la cible')
    // Le nom proposé arrive par un effet : sous charge (shard CI), le champ peut être trouvé avant.
    await waitFor(() => expect((nameInput as HTMLInputElement).value).toContain('Cible du'))
    expect(screen.getByText('Comptes')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // comptes inclus
  })

  it('le nom proposé est modifiable avant validation — renommer sur la preview (#2157.20)', async () => {
    mockApi()
    renderDialog()
    const nameInput = await screen.findByLabelText('Nom de la cible')
    expect((nameInput as HTMLInputElement).value).toContain('Cible du')
    fireEvent.change(nameInput, { target: { value: 'Banques régionales — T4' } })
    expect((nameInput as HTMLInputElement).value).toBe('Banques régionales — T4')
  })

  it('l’objectif est éditable, vide par défaut (#2157.11)', async () => {
    mockApi()
    renderDialog()
    const objective = await screen.findByLabelText('Objectif')
    expect((objective as HTMLInputElement).value).toBe('')
    fireEvent.change(objective, { target: { value: 'Décrocher 3 rendez-vous' } })
    expect((objective as HTMLInputElement).value).toBe('Décrocher 3 rendez-vous')
  })

  it('signale les doublons détectés en NOMMANT la liste où la fiche vit déjà (#2157.15/.16/.42)', async () => {
    mockApi([targetList({ id: 'l1', name: 'Banque Q4', items: [{ kind: 'account', ref_id: 'acc-1' }] })])
    renderDialog()
    const nameInput = await screen.findByLabelText('Nom de la cible')
    fireEvent.change(nameInput, { target: { value: 'Campagne Cyber' } })
    expect(
      await screen.findByText('1 fiche est déjà dans « Banque Q4 », pas encore dans « Campagne Cyber »'),
    ).toBeInTheDocument()
  })

  it('nomme chaque liste distincte quand les doublons viennent de plusieurs cibles (#2157.42)', async () => {
    mockApi([
      targetList({ id: 'l1', name: 'Banque Q4', items: [{ kind: 'account', ref_id: 'acc-1' }] }),
      targetList({ id: 'l2', name: 'Cyber Grands Comptes', items: [{ kind: 'account', ref_id: 'acc-2' }] }),
    ])
    renderDialog()
    const nameInput = await screen.findByLabelText('Nom de la cible')
    fireEvent.change(nameInput, { target: { value: 'Campagne Cyber' } })
    expect(
      await screen.findByText(
        '2 fiches sont déjà dans « Banque Q4, Cyber Grands Comptes », pas encore dans « Campagne Cyber »',
      ),
    ).toBeInTheDocument()
  })

  it('ne signale rien quand aucun doublon n’existe — on n’affiche pas ce qu’on n’a pas', async () => {
    mockApi()
    renderDialog()
    await screen.findByLabelText('Nom de la cible')
    expect(screen.queryByText(/déjà dans une autre cible/)).not.toBeInTheDocument()
  })

  it('crée la cible puis y ajoute chaque élément de la sélection', async () => {
    mockApi()
    const { onDone, onOpenChange } = renderDialog()
    await screen.findByLabelText('Nom de la cible')
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cible' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/target-lists', method: 'POST' })),
    )
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/target-lists/new-list-1/items',
          method: 'POST',
          body: { kind: 'account', ref_id: 'acc-1', provenance: 'manual' },
        }),
      ),
    )
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})

const CONTACT_ITEMS = [
  { kind: 'contact' as const, id: 'c-1', label: 'Anna Roux', email: 'anna@acme.fr' },
  { kind: 'contact' as const, id: 'c-2', label: 'Paul Sans-Mail', email: null },
]

function postedBodies(path: string) {
  return apiFetch.mock.calls
    .map(call => call[0] as FetchArgs)
    .filter(call => call.path === path && call.method === 'POST')
    .map(call => call.body)
}

describe('CreateTargetListFromSelectionDialog — aperçu avant création de masse (#2157.17-.24/.37/.41/.57)', () => {
  it('nomme les éléments écartés par l’appelant, avec leur motif (#2157.17)', async () => {
    mockApi()
    renderDialog({ excluded: [{ label: 'Zoé Désinscrite', reason: 'désinscrit' }] })
    expect(await screen.findByText(/1 fiche écartée/)).toBeInTheDocument()
    expect(screen.getByText(/Zoé Désinscrite/)).toBeInTheDocument()
  })

  it('#2157.17 — « Retirer » NOMME la fiche retirée parmi les écartés, avec son motif', async () => {
    mockApi()
    renderDialog({ items: CONTACT_ITEMS })
    await screen.findByLabelText('Nom de la cible')
    fireEvent.click(screen.getByRole('button', { name: `Retirer ${CONTACT_ITEMS[0]!.label}` }))
    expect(screen.getByText(/1 fiche écartée/)).toHaveTextContent(`${CONTACT_ITEMS[0]!.label} (retirée de l’aperçu)`)
  })

  it('#2157.17 sait dire NON — sans retrait, aucune ligne « retirée »', async () => {
    mockApi()
    renderDialog({ items: CONTACT_ITEMS })
    await screen.findByLabelText('Nom de la cible')
    expect(screen.queryByText(/retirée de l’aperçu/)).not.toBeInTheDocument()
  })

  it('nomme les contacts sans e-mail, mais pas ceux dont l’e-mail est inconnu du caller (#2157.18)', async () => {
    mockApi()
    renderDialog({
      items: [...CONTACT_ITEMS, { kind: 'contact', id: 'c-3', label: 'Inconnu Jean' }],
    })
    expect(await screen.findByText(/1 fiche sans e-mail/)).toBeInTheDocument()
    expect(screen.getAllByText(/Paul Sans-Mail/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/2 fiches sans e-mail/)).not.toBeInTheDocument()
  })

  it('n’affiche aucun bloc quand rien n’est écarté ni manquant — jamais « 0 » (#2157.17/.18)', async () => {
    mockApi()
    renderDialog()
    await screen.findByLabelText('Nom de la cible')
    expect(screen.queryByText(/écartée/)).not.toBeInTheDocument()
    expect(screen.queryByText(/sans e-mail/)).not.toBeInTheDocument()
  })

  it('retire une ligne avant validation : elle ne part pas à l’API (#2157.21)', async () => {
    mockApi()
    renderDialog()
    await screen.findByLabelText('Nom de la cible')
    fireEvent.click(screen.getByRole('button', { name: 'Retirer ACME' }))
    expect(screen.queryByText('ACME')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cible' }))
    await waitFor(() => expect(postedBodies('/target-lists/new-list-1/items')).toHaveLength(1))
    expect(postedBodies('/target-lists/new-list-1/items')[0]).toEqual({
      kind: 'account',
      ref_id: 'acc-2',
      provenance: 'manual',
    })
  })

  it('retirer toute la sélection désactive la création (#2157.21)', async () => {
    mockApi()
    renderDialog({ items: [{ kind: 'account', id: 'acc-1', label: 'ACME' }] })
    await screen.findByLabelText('Nom de la cible')
    fireEvent.click(screen.getByRole('button', { name: 'Retirer ACME' }))
    expect(screen.getByRole('button', { name: 'Créer la cible' })).toBeDisabled()
  })

  it('crée la liste avec l’owner et la visibilité choisis, parmi les membres de l’espace (#2157.22/.23)', async () => {
    mockApi()
    renderDialog()
    const owner = await screen.findByRole('combobox', { name: 'Responsable' })
    await waitFor(() => expect(owner).toBeEnabled())
    await chooseOption(owner, 'u2')
    await chooseOption(screen.getByRole('combobox', { name: 'Visibilité' }), 'private')
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cible' }))
    await waitFor(() => expect(postedBodies('/target-lists')).toHaveLength(1))
    expect(postedBodies('/target-lists')[0]).toEqual(
      expect.objectContaining({ owner_user_id: 'u2', visibility: 'private' }),
    )
  })

  it('sans choix, ni owner ni visibilité ne sont envoyés (le serveur garde ses défauts) (#2157.22/.23)', async () => {
    mockApi()
    renderDialog()
    await screen.findByLabelText('Nom de la cible')
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cible' }))
    await waitFor(() => expect(postedBodies('/target-lists')).toHaveLength(1))
    const body = postedBodies('/target-lists')[0] as Record<string, unknown>
    expect(body).not.toHaveProperty('owner_user_id')
    expect(body).not.toHaveProperty('visibility')
  })

  it('ajoute à une liste existante : aucune liste créée, les fiches déjà dedans sont sautées et dites (#2157.24)', async () => {
    mockApi([targetList({ id: 'l1', name: 'Banque Q4', items: [{ kind: 'account', ref_id: 'acc-1' }] })])
    renderDialog()
    const destination = await screen.findByRole('combobox', { name: 'Destination' })
    await chooseOption(destination, 'Banque Q4')
    expect(screen.getByText(/1 fiche déjà dans « Banque Q4 » sera ignorée/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à la cible' }))
    await waitFor(() => expect(postedBodies('/target-lists/l1/items')).toHaveLength(1))
    expect(postedBodies('/target-lists/l1/items')[0]).toEqual({
      kind: 'account',
      ref_id: 'acc-2',
      provenance: 'manual',
    })
    expect(postedBodies('/target-lists')).toHaveLength(0)
  })

  it('un doublon est nommé mais ne bloque jamais la création (#2157.37/.41)', async () => {
    mockApi([
      targetList({ id: 'l1', name: 'Objectif A', items: [{ kind: 'account', ref_id: 'acc-1' }] }),
      targetList({ id: 'l2', name: 'Objectif B', items: [{ kind: 'account', ref_id: 'acc-1' }] }),
    ])
    renderDialog()
    expect(await screen.findByText(/Objectif A, Objectif B/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer la cible' })).toBeEnabled()
  })
})
