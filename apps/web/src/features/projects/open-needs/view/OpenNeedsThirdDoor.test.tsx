import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * La TROISIÈME porte d'enregistrement d'un consultant (BEL-BO-003).
 *
 * Le PDF-02 l'appelle « la porte qui manque » : les deux premières sont dans le
 * vivier (bouton « Ajouter », dépôt de CV), la troisième vient d'ailleurs — d'un
 * besoin sur lequel personne n'est positionné, et pour lequel le commercial a
 * quelqu'un en tête.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX CORRECTIONS SUCCESSIVES, ET C'EST LA SECONDE QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 28/08/2026 (matin) — la CONDITION était `poolIsEmpty` seul, c'est-à-dire
 * une porte qui se referme au vingtième consultant. La source écrit « un besoin
 * **sans shortlist** », et c'est un autre monde.
 *
 * ⚠️ 28/08/2026 (second passage) — la porte était un
 * `<Link to="/consultants" search={{ new: true }}>`. Elle ouvrait le formulaire
 * DANS LE VIVIER, en quittant l'écran. Or la source dit, mot pour mot :
 *
 *     « un commercial qui a un contact en tête doit pouvoir l'enregistrer
 *      depuis le besoin, **sans passer par le vivier** »
 *
 * C'est exactement ce que faisait le lien. Ces tests-ci vérifient donc la
 * chose que le premier passage n'avait pas su vérifier : **rien ne navigue**.
 * Le libellé était juste, la place était juste, la condition était juste — et
 * l'écran changeait quand même.
 */
// Le routeur est mocké pour deux raisons distinctes : `Link` doit rendre une
// ancre (le rôle « Rôle » de la première colonne ouvre la fiche) et `navigate`
// doit être OBSERVABLE — c'est lui qui prouve que la porte ne déménage pas.
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({
    children,
    to,
    params,
    search,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, unknown>
    search?: Record<string, unknown>
  } & Record<string, unknown>) => {
    const path = Object.entries(params ?? {}).reduce((acc, [key, value]) => acc.replace(`$${key}`, String(value)), to)
    const query = new URLSearchParams(search as Record<string, string>).toString()
    return (
      <a href={query ? `${path}?${query}` : path} {...rest}>
        {children}
      </a>
    )
  },
}))
// #2173.31 — voir OpenNeedsSheetReachable.test.tsx pour la raison de ce mock.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))

const { OpenNeedsTable } = await import('./OpenNeedsTable')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    projectId: 'p-1',
    accountId: 'a-1',
    accountName: 'ACME',
    role: 'Architecte plateforme',
    title: 'Architecte plateforme',
    status: 'open',
    skills: [{ term: 'kubernetes', required: true, level: null }],
    seniority: null,
    startDate: null,
    deadline: null,
    dailyRateCents: null,
    // ⚠️ Le nom de la COLONNE, pas celui de la vue : le tableau lit
    // `shortlist_count` (contrat `openNeedRowSchema`). La fixture écrivait
    // `shortlistCount`, donc `undefined` traversait tout le fichier sans que
    // rien ne le dise — la porte se serait ouverte sur la mauvaise condition.
    shortlist_count: 2,
    staffable: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  } as unknown as OpenNeedRow
}

function draw(poolIsEmpty: boolean, rows = [need()], onAddConsultant = vi.fn()) {
  // La ligne monte un contrôle qui LIT (le drapeau « staffable ») : sans client
  // de requêtes, le tableau entier tombe et le test dirait « pas de porte »
  // pour la mauvaise raison.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <OpenNeedsTable
        rows={rows}
        poolIsEmpty={poolIsEmpty}
        onOpenNeed={() => {}}
        onMatch={() => {}}
        onAddConsultant={onAddConsultant}
        selectedIds={[]}
        onToggle={() => {}}
        onToggleAll={() => {}}
      />
    </QueryClientProvider>,
  )
  return { ...view, onAddConsultant }
}

describe('besoins ouverts — la troisième porte d’enregistrement', () => {
  it('offre d’enregistrer un consultant quand le vivier est vide', () => {
    draw(true)
    expect(screen.getByRole('button', { name: 'Enregistrer un consultant' })).toBeInTheDocument()
  })

  it('l’offre AUSSI sur un besoin sans shortlist, vivier plein — le cas « je connais un gars »', () => {
    // Vingt développeurs au vivier ne répondent pas à un besoin réseau, et le
    // commercial qui connaît quelqu'un n'avait aucun chemin depuis la ligne.
    draw(false, [need({ shortlist_count: 0 })])
    expect(screen.getByRole('button', { name: 'Enregistrer un consultant' })).toBeInTheDocument()
    // Le rapprochement reste proposé : la porte S'AJOUTE, elle ne remplace pas.
    expect(screen.getByRole('button', { name: /Matcher|Lancer/ })).toBeInTheDocument()
  })

  it('ne propose PAS ce geste sur un besoin qui a déjà des profils positionnés', () => {
    draw(false, [need({ shortlist_count: 3 })])
    expect(screen.queryByRole('button', { name: 'Enregistrer un consultant' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Matcher|Lancer/ })).toBeInTheDocument()
  })

  it('garde le bouton DÉSACTIVÉ pour l’autre empêchement — un besoin sans compétence', () => {
    // Celui-là se répare sur CET écran, pas dans le vivier : proposer d'aller
    // ajouter un consultant enverrait l'utilisateur au mauvais endroit.
    draw(false, [need({ skills: [] })])
    expect(screen.getByRole('button', { name: /Matcher|Lancer/ })).toBeDisabled()
  })

  it('dit une raison DIFFÉRENTE selon la porte — vivier vide n’est pas besoin sans shortlist', () => {
    // Deux empêchements, deux gestes de réparation : les confondre ferait lire
    // « ton vivier est vide » à quelqu'un qui a vingt consultants.
    const { unmount } = draw(true)
    const emptyPoolTitle = screen.getByRole('button', { name: 'Enregistrer un consultant' }).getAttribute('title')
    unmount()

    draw(false, [need({ shortlist_count: 0 })])
    const noShortlistTitle = screen.getByRole('button', { name: 'Enregistrer un consultant' }).getAttribute('title')

    expect(emptyPoolTitle).toBeTruthy()
    expect(noShortlistTitle).toBeTruthy()
    expect(noShortlistTitle).not.toEqual(emptyPoolTitle)
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  LA CORRECTION DE FOND : la porte n'ouvre plus le vivier                   */
/* ────────────────────────────────────────────────────────────────────────── */

describe('la troisième porte n’emmène PLUS dans le vivier', () => {
  it('n’est pas un lien — c’est un bouton, sur les DEUX conditions', () => {
    // La preuve la plus directe : un `<a href="/consultants">` ne peut pas
    // « ouvrir en place », quoi qu'il fasse ensuite. Il n'y en a plus.
    const { unmount } = draw(true)
    expect(screen.queryByRole('link', { name: 'Enregistrer un consultant' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer un consultant' }).tagName).toBe('BUTTON')
    unmount()

    draw(false, [need({ shortlist_count: 0 })])
    expect(screen.queryByRole('link', { name: 'Enregistrer un consultant' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer un consultant' }).tagName).toBe('BUTTON')
  })

  it('aucune ancre de la ligne ne pointe vers le vivier', () => {
    // Une garde de forme plutôt que de nom : demain quelqu'un peut renommer le
    // bouton, la règle est qu'AUCUN chemin de cette ligne n'emmène au vivier.
    const { container } = draw(false, [need({ shortlist_count: 0 })])
    const hrefs = [...container.querySelectorAll('a')].map(anchor => anchor.getAttribute('href') ?? '')
    expect(hrefs.filter(href => href.startsWith('/consultants'))).toEqual([])
    // Et la ligne n'est pas muette pour autant : le rôle ouvre la FICHE.
    expect(hrefs.some(href => href.startsWith('/projects/needs/'))).toBe(true)
  })

  it('le clic OUVRE le formulaire sur place — il ne navigue nulle part', async () => {
    const onAdd = vi.fn()
    navigate.mockClear()
    draw(false, [need({ shortlist_count: 0 })], onAdd)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer un consultant' }))

    // Le besoin ENTIER remonte, pas seulement son identifiant : le panneau qui
    // suit l'enregistrement doit pouvoir nommer le besoin qu'il propose de
    // rapprocher, et le relire depuis la liste serait une seconde lecture.
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ id: 'n-1', title: 'Architecte plateforme' })
    // ⚠️ LA ligne qui porte la source : rien n'a navigué.
    expect(navigate).not.toHaveBeenCalled()
  })

  it('le clic sur la porte n’ouvre pas non plus la fiche — la ligne, elle, navigue', async () => {
    // La colonne « Matching » arrête déjà la propagation ; sans elle, cliquer
    // « Enregistrer un consultant » déclencherait AUSSI le clic de la ligne, et
    // le formulaire s'ouvrirait sur un écran en train de changer.
    const onOpenNeed = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <OpenNeedsTable
          rows={[need({ shortlist_count: 0 })]}
          poolIsEmpty={false}
          onOpenNeed={onOpenNeed}
          onMatch={() => {}}
          onAddConsultant={() => {}}
          selectedIds={[]}
          onToggle={() => {}}
          onToggleAll={() => {}}
        />
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer un consultant' }))
    expect(onOpenNeed).not.toHaveBeenCalled()
  })
})
