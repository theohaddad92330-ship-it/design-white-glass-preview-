import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { AccountLinks } from '@/features/accounts/api'
import { AccountDetailMoreActionsMenu } from './AccountDetailMoreActionsMenu'
import { AccountFollowMenuItem, AccountHeaderWorkMenuItems } from './AccountHeaderMenuItems'
import { AccountCollaborationMenuItems } from '../collaboration/AccountCollaborationBand'
import type { Account } from '@bellum/contracts'

/**
 * Q-1816 RENVERSÉE (14/09/2026, #2117) — ce menu n'est plus la porte vers
 * « Exporter », « Brief » et « Partager » : ces trois-là (et « Aperçu PDF »)
 * remontent en boutons visibles du hero (`AccountDetailHero.test.tsx` en
 * porte la preuve). Ce fichier prouve ce qui RESTE réellement sous « … » —
 * « Rafraîchir un axe » et le volet administratif — pas seulement que le
 * composant ne plante pas.
 *
 * #2117.36-38 — le volet ADMINISTRATIF (archiver / détacher / supprimer)
 * reste ici : les trois mutations sont mockées (elles vivent dans
 * `useAccountAdminActions.ts`, testé pour lui-même) et « Détacher » prouve sa
 * propre condition — rendu SEULEMENT quand ce dossier appartient à un groupe
 * (#1111).
 */
const { mockHook, archiveMutate, detachMutate, deleteMutate, accountLinksMock, crmPresenceMock, createFromCrmMutate } =
  vi.hoisted(() => ({
    mockHook: vi.fn(),
    archiveMutate: vi.fn(),
    detachMutate: vi.fn(),
    deleteMutate: vi.fn(),
    accountLinksMock: vi.fn(),
    crmPresenceMock: vi.fn(),
    createFromCrmMutate: vi.fn(),
  }))
// #4283.8 — « Suivre ce compte » : la liste des suivis n'est pas le sujet de ce fichier.
vi.mock('@/features/account-follows/api', () => ({
  useAccountFollows: () => ({ data: { max: 3, followed: [], archived: [] } }),
  useToggleAccountFollow: () => ({ mutate: vi.fn(), isPending: false }),
}))
// #4507 — les gestes d'équipe de l'en-tête : leurs lectures ne sont pas le sujet de ce fichier.
vi.mock('@/features/team-guardrails/hooks', () => ({ useAccountTeam: () => ({ data: { can_edit: true } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/manager/hooks/useAssignAccount', () => ({ useAssignAccount: () => ({ mutate: vi.fn() }) }))
vi.mock('@/features/accounts/hooks/useRequestManagerValidation', () => ({
  useRequestManagerValidation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/accounts/hooks/useRefreshDimension', () => ({
  useRefreshDimension: () => mockHook(),
}))
vi.mock('@/features/accounts/hooks/useAccountAdminActions', () => ({
  useArchiveAccountFromDossier: () => ({ mutate: archiveMutate, isPending: false }),
  useDetachAccountFromDossier: () => ({ mutate: detachMutate, isPending: false }),
  useDeleteAccountFromDossier: () => ({ mutate: deleteMutate, isPending: false }),
}))
// Épopée #2853 (#2157.7) — « Créer une cible depuis le CRM ».
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({
  useCrmPresence: () => crmPresenceMock(),
}))
vi.mock('@/features/target-lists/useCreateTargetFromCrmPresence', () => ({
  useCreateTargetFromCrmPresence: () => ({ mutate: createFromCrmMutate, isPending: false }),
}))
vi.mock('@/features/accounts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/accounts/api')>()
  return { ...actual, accountsApi: { ...actual.accountsApi, accountLinks: accountLinksMock } }
})

const noLinks: AccountLinks = { mergedInto: null, linked: [], detachRefusal: null, detachRefusalMessage: null }

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  mockHook.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false, variables: undefined })
  archiveMutate.mockReset()
  detachMutate.mockReset()
  deleteMutate.mockReset()
  accountLinksMock.mockReset().mockResolvedValue(noLinks)
  // Défaut = pas de CRM connecté (comportement d'avant ce lot pour tous les
  // tests qui ne le redéfinissent pas) : `crmPresenceMock` réutilise l'objet
  // que le vrai hook renverrait dans ce cas.
  crmPresenceMock.mockReset().mockReturnValue({ data: { provider: null, matched: false } })
  createFromCrmMutate.mockReset()
})

/** Ouvre le menu « … » et rend son contenu interrogeable. */
async function openMenu(
  props: Partial<Parameters<typeof AccountDetailMoreActionsMenu>[0]> = {},
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  renderWithRouter(<AccountDetailMoreActionsMenu {...props} />, '/accounts/test-id')
  await user.click(await screen.findByRole('button', { name: /Plus d.actions/i }))
  return user
}

describe('AccountDetailMoreActionsMenu — ce qui RESTE sous « … » : Rafraîchir un axe', () => {
  it('« Rafraîchir un axe » rejoint CE menu comme sous-menu — atteignable au clavier, un nom accessible', async () => {
    const user = await openMenu({ accountId: 'acc-42', showRefreshDimensions: true })
    const trigger = await screen.findByRole('menuitem', { name: /Rafraîchir/i })
    expect(trigger).toBeInTheDocument()
    await user.click(trigger)
    expect(await screen.findByRole('menuitem', { name: /Signaux/i })).toBeInTheDocument()
  })

  it('« Rafraîchir un axe » reste absent tant que le dossier n’est pas livré — même condition que l’ancien bouton autonome', async () => {
    await openMenu({ accountId: 'acc-42', showRefreshDimensions: false })
    expect(screen.queryByRole('menuitem', { name: /Rafraîchir/i })).not.toBeInTheDocument()
  })

  it('⚠️ UN SEUL menu « … » — pas un second trigger à côté (loi 4 du tome 7)', async () => {
    // Vérifié AVANT ouverture : une fois le menu ouvert, Radix pose
    // `aria-hidden` sur le reste de l'arbre (dont son propre déclencheur),
    // ce qui rendrait ce contrôle silencieusement vide des deux côtés — un
    // faux vert qui ne prouverait rien.
    renderWithRouter(<AccountDetailMoreActionsMenu accountId="acc-42" showRefreshDimensions />, '/accounts/test-id')
    expect(await screen.findAllByRole('button', { name: /Plus d.actions/i })).toHaveLength(1)
  })
})

describe('AccountDetailMoreActionsMenu — le volet administratif (#2117.36-38)', () => {
  it('« Archiver » est atteignable et débite le compte + son nom au clic', async () => {
    const user = await openMenu({ accountId: 'acc-42', companyName: 'ACME Corp' })
    const item = await screen.findByRole('menuitem', { name: /Archiver/i })
    await user.click(item)
    expect(archiveMutate).toHaveBeenCalledWith({ accountId: 'acc-42', companyName: 'ACME Corp' })
  })

  it('« Détacher » est ABSENT tant que ce dossier n’appartient à aucun groupe', async () => {
    await openMenu({ accountId: 'acc-42' })
    expect(screen.queryByRole('menuitem', { name: /Détacher/i })).not.toBeInTheDocument()
  })

  it('« Détacher » apparaît quand ce dossier appartient à un groupe (#1111)', async () => {
    accountLinksMock.mockResolvedValue({
      mergedInto: { id: 'acc-1', companyName: 'Groupe ACME', status: 'completed', linkedAt: null },
      linked: [],
      detachRefusal: null,
      detachRefusalMessage: null,
    } satisfies AccountLinks)
    const user = await openMenu({ accountId: 'acc-42', companyName: 'ACME Corp' })
    const item = await screen.findByRole('menuitem', { name: /Détacher/i })
    await user.click(item)
    expect(detachMutate).toHaveBeenCalledWith({ accountId: 'acc-42', companyName: 'ACME Corp' })
  })

  it('« Détacher » reste absent quand le serveur refuse le retour arrière', async () => {
    accountLinksMock.mockResolvedValue({
      mergedInto: { id: 'acc-1', companyName: 'Groupe ACME', status: 'completed', linkedAt: null },
      linked: [],
      detachRefusal: 'link_predates_reversal',
      detachRefusalMessage: 'Rattaché avant le retour arrière.',
    } satisfies AccountLinks)
    await openMenu({ accountId: 'acc-42' })
    expect(screen.queryByRole('menuitem', { name: /Détacher/i })).not.toBeInTheDocument()
  })

  it('« Supprimer » est atteignable et débite le compte + son nom au clic', async () => {
    const user = await openMenu({ accountId: 'acc-42', companyName: 'ACME Corp' })
    const item = await screen.findByRole('menuitem', { name: /Supprimer/i })
    await user.click(item)
    expect(deleteMutate).toHaveBeenCalledWith({ accountId: 'acc-42', companyName: 'ACME Corp' })
  })

  it('le volet administratif reste absent sans accountId', async () => {
    await openMenu({})
    expect(screen.queryByRole('menuitem', { name: /Archiver/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Supprimer/i })).not.toBeInTheDocument()
  })
})

describe('AccountDetailMoreActionsMenu — sans accountId (composant appelé depuis un routeur minimal)', () => {
  it('ne plante pas quand ni le sous-menu de rafraîchissement, ni le volet administratif ne sont demandés', async () => {
    const user = await openMenu({})
    // Rien n'y est rendu : ni le sous-menu, ni le volet administratif. Le
    // déclencheur seul (déjà ouvert par `openMenu`) suffit à prouver que le
    // composant ne plante pas sans `accountId`.
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    expect(user).toBeTruthy()
  })
})

describe('R15-5 — la description de « Plus d’actions » nomme ce que le menu REND, rien d’autre', () => {
  it('chaque geste nommé par la description existe dans le menu, et chaque entrée du menu est nommée', async () => {
    // Recette du 15/09 (prod) : le `title` promettait « aperçu et téléchargement
    // PDF, brief, rafraîchissement par axe, partage » — le menu rendu était
    // Rafraîchir · Archiver · Supprimer. Les livrables sont remontés au hero.
    accountLinksMock.mockResolvedValue({
      ...noLinks,
      mergedInto: { id: 'acc-1', companyName: 'Groupe ACME', status: 'completed', linkedAt: null },
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    // #4507 — le menu tel que l'en-tête le monte : TOUT ce que la barre ne montre plus y passe.
    const noop = () => {}
    renderWithRouter(
      <AccountDetailMoreActionsMenu
        accountId="acc-42"
        showRefreshDimensions
        nextAction={{ state: 'plan-active', onSelect: noop }}
        onCompleteAccount={noop}
        onAskLaura={noop}
        workItems={
          <>
            <AccountHeaderWorkMenuItems onComment={noop} onPlan={noop} onCrmPush={noop} />
            <AccountFollowMenuItem accountId="acc-42" />
          </>
        }
        teamItems={<AccountCollaborationMenuItems account={{ id: 'acc-42' } as Account} onOpenTeam={noop} />}
      />,
      '/accounts/test-id',
    )
    const trigger = await screen.findByRole('button', { name: /Plus d.actions/i })
    const description = (trigger.getAttribute('title') ?? '').toLocaleLowerCase('fr')
    expect(description).not.toBe('')

    const promised = description
      .slice(description.indexOf(':') + 1)
      .replace(/\.$/, '')
      .split(/,| ou /)
      .map(part => part.trim())
      .filter(Boolean)
    expect(promised.length).toBeGreaterThan(0)

    await user.click(trigger)
    expect(await screen.findByRole('menuitem', { name: /Détacher/i })).toBeInTheDocument()
    const rendered = screen
      .getAllByRole('menuitem')
      .map(item => (item.textContent ?? '').trim().toLocaleLowerCase('fr'))
    expect(rendered.length).toBeGreaterThan(0)

    // Sens 1 — ce que la description promet est dans le menu.
    for (const gesture of promised) {
      expect(rendered.some(item => item.slice(0, 6) === gesture.slice(0, 6))).toBe(true)
    }
    // Sens 2 — ce que le menu rend est nommé par la description.
    for (const item of rendered) {
      expect(promised.some(gesture => gesture.slice(0, 6) === item.slice(0, 6))).toBe(true)
    }
  })
})

/**
 * Épopée #2853 (#2157.7) — « Créer une cible depuis le CRM » : rendu
 * SEULEMENT quand le connecteur CRM branché confirme une correspondance sur
 * CE compte (`useCrmPresence(...).data.matched`) — la même donnée que
 * `CrmPresenceBadge`. Sans connecteur ou sans correspondance, l'entrée reste
 * absente (no-op strict).
 */
describe('AccountDetailMoreActionsMenu — Épopée #2853 (#2157.7) — « Créer une cible depuis le CRM »', () => {
  it('reste ABSENTE sans CRM connecté (comportement par défaut)', async () => {
    const user = await openMenu({ accountId: 'acc-42', companyName: 'ACME' })
    expect(screen.queryByRole('menuitem', { name: /Créer une cible depuis le CRM/i })).not.toBeInTheDocument()
    void user
  })

  it('reste ABSENTE quand le CRM est connecté mais ne correspond à aucun contact/deal de ce compte', async () => {
    crmPresenceMock.mockReturnValue({ data: { provider: 'hubspot', matched: false } })
    await openMenu({ accountId: 'acc-42', companyName: 'ACME' })
    expect(screen.queryByRole('menuitem', { name: /Créer une cible depuis le CRM/i })).not.toBeInTheDocument()
  })

  it('apparaît quand le connecteur CRM confirme une correspondance sur ce compte, et déclenche le bon geste au clic', async () => {
    crmPresenceMock.mockReturnValue({ data: { provider: 'hubspot', matched: true } })
    const user = await openMenu({ accountId: 'acc-42', companyName: 'ACME' })
    const item = await screen.findByRole('menuitem', { name: /Créer une cible depuis le CRM/i })
    expect(item).toBeInTheDocument()

    await user.click(item)
    expect(createFromCrmMutate).toHaveBeenCalledWith({ accountId: 'acc-42', companyName: 'ACME' })
  })
})
