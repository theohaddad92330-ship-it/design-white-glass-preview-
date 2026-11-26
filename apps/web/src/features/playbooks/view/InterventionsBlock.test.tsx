import type { Intervention } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'

/**
 * Les propriétés de la file d'intervention (§7.4), et le défaut de chacune.
 *
 * · **Cinq cartes, le reste ANNONCÉ.** Une file qui déroule vingt lignes n'est
 *   plus une file : c'est une seconde boîte de réception. Couper en silence
 *   ferait croire qu'il n'y a que ça à faire.
 * · **Clore exige un motif.** Une file qu'on vide sans dire ce qui a été fait ne
 *   s'explique plus trois semaines après — et c'est le moment où le problème
 *   revient.
 */
const decideMutate = vi.fn()
const assignMutate = vi.fn()
const interventions = vi.fn()
const membersQuery = vi.fn()

// #1439 — chaque ligne mène désormais à son dossier. Sans routeur monté, le
// `<Link>` de TanStack casse le rendu entier : on double le lien, pas la
// navigation, qui n'est pas le sujet de ces tests.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}))

vi.mock('../api', () => ({
  useInterventions: () => interventions(),
  useDecideIntervention: () => ({ mutate: decideMutate, isPending: false }),
  useAssignIntervention: () => ({ mutate: assignMutate, isPending: false }),
}))

// #2206.53 — vide par défaut : `canAssign` retombe sur le rôle `member`
// (aucun droit), donc les tests existants (qui ne connaissent pas ce geste)
// continuent de voir le texte en lecture seule, inchangé.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => membersQuery(),
}))
membersQuery.mockReturnValue({ data: [] })

const { InterventionsBlock } = await import('./InterventionsBlock')

function item(id: string): Intervention {
  return {
    id,
    kind: 'account_untouched',
    subjectType: 'account',
    subjectId: '00000000-0000-4000-8000-000000000000',
    subjectLabel: null,
    ownerId: null,
    ownerName: null,
    detail: `détail ${id}`,
    state: 'open',
    openedAt: '2026-08-20T09:00:00.000Z',
    resolvedAt: null,
  }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InterventionsBlock />
    </QueryClientProvider>,
  )
}

describe('la file d’intervention', () => {
  it('montre cinq cartes et ANNONCE ce qu’elle replie', () => {
    interventions.mockReturnValue({
      data: Array.from({ length: 9 }, (_, index) => item(`id-${index}`)),
      isLoading: false,
      isError: false,
    })
    const { container } = wrap()
    expect(screen.getAllByText(/^détail id-/)).toHaveLength(5)
    // Quatre repliées, et le chiffre est écrit : couper en silence ferait croire
    // qu'il n'y a que cinq choses à traiter.
    expect(container.textContent).toContain('4')
  })

  it('ne propose « voir tout » que quand il y a quelque chose à voir', () => {
    interventions.mockReturnValue({ data: [item('a'), item('b')], isLoading: false, isError: false })
    const { container } = wrap()
    expect(screen.getAllByText(/^détail /)).toHaveLength(2)
    expect(container.textContent).not.toContain('Voir les')
  })

  it('refuse de clore tant que rien n’est écrit', () => {
    interventions.mockReturnValue({ data: [item('a')], isLoading: false, isError: false })
    wrap()
    fireEvent.click(screen.getByText('Réglé', { selector: 'button, button *' }))
    const confirm = screen.getByText('Clore') as HTMLButtonElement
    // Le bouton est INERTE, et le champ au-dessus dit pourquoi. Laisser cliquer
    // pour se faire refuser par le serveur ferait passer une règle produit pour
    // une panne.
    expect(confirm.closest('button')?.disabled).toBe(true)
    expect(decideMutate).not.toHaveBeenCalled()
  })

  it('clôt AVEC le motif saisi', () => {
    decideMutate.mockClear()
    interventions.mockReturnValue({ data: [item('a')], isLoading: false, isError: false })
    wrap()
    fireEvent.click(screen.getByText('Réglé', { selector: 'button, button *' }))
    fireEvent.change(screen.getByPlaceholderText(/Facturé le/), { target: { value: 'Facturé le 20/08' } })
    fireEvent.click(screen.getByText('Clore'))
    expect(decideMutate).toHaveBeenCalledWith({ id: 'a', state: 'resolved', reason: 'Facturé le 20/08' })
  })

  it('accuser réception ne demande RIEN — les deux gestes ne disent pas la même chose', () => {
    decideMutate.mockClear()
    interventions.mockReturnValue({ data: [item('a')], isLoading: false, isError: false })
    wrap()
    fireEvent.click(screen.getByText("Je m'en occupe"))
    expect(decideMutate).toHaveBeenCalledWith({ id: 'a', state: 'acknowledged', reason: undefined })
  })
})

/**
 * #1439 — CE QUI FAIT D'UNE LISTE UNE FILE D'ARBITRAGE.
 *
 * *« Chaque item : décision attendue, contexte, conséquence, CTA. »* Il en
 * manquait deux — la conséquence et le chemin —, et le second est le motif
 * dominant de ce dépôt : une réponse juste, sans porte. La file demandait de
 * trancher sans jamais montrer sur QUOI.
 */
describe('#1439 — la file est une file de DÉCISION', () => {
  it('chaque ligne dit la CONSÉQUENCE de ne pas trancher', () => {
    interventions.mockReturnValue({ data: [item('id-1')], isLoading: false, isError: false })
    const { container } = wrap()

    // `account_untouched` : « Sans reprise de contact, le compte se refroidit… »
    expect(container.textContent).toContain('le compte se refroidit')
  })

  // #2206.15 — la CAUSE, séparée du texte libre de `detail` : `detail` porte
  // le FAIT chiffré de CETTE ligne (« détail id-1 »), la cause dit pourquoi ce
  // GENRE de situation existe — une règle par nature, comme la conséquence.
  it('chaque ligne dit la CAUSE, distincte de la conséquence et du détail chiffré', () => {
    interventions.mockReturnValue({ data: [item('id-1')], isLoading: false, isError: false })
    const { container } = wrap()

    // `account_untouched` : « Aucune action n’a été enregistrée sur ce compte
    // depuis trop longtemps. »
    expect(container.textContent).toContain('Aucune action n’a été enregistrée sur ce compte')
    expect(container.textContent).toContain('détail id-1')
    expect(container.textContent).toContain('le compte se refroidit')
  })

  it('chaque ligne MÈNE au dossier concerné', () => {
    interventions.mockReturnValue({ data: [item('id-1')], isLoading: false, isError: false })
    wrap()

    const porte = screen.getByRole('link')
    expect(porte.getAttribute('href')).toBe('/accounts/00000000-0000-4000-8000-000000000000')
    // Cinq lignes qui se suivent porteraient cinq fois « Ouvrir » : la nature de
    // la situation entre dans le nom annoncé (WCAG 2.5.3).
    expect(porte.getAttribute('aria-label')).toContain('Compte suivi que personne')
  })

  it('un sujet SANS écran n’obtient pas de faux lien', () => {
    // `user` et `workspace` ne s'ouvrent pas — un lien qui ne mène nulle part
    // est pire qu'une ligne qui ne se clique pas. La règle vient de
    // `interventionHref`, pas d'un second tableau recopié ici.
    interventions.mockReturnValue({
      data: [{ ...item('id-1'), kind: 'credits_exhausted' as const, subjectType: 'workspace' as const }],
      isLoading: false,
      isError: false,
    })
    wrap()

    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('l’ÂGE est visible — il pèse dans le classement et ne se voyait nulle part', () => {
    interventions.mockReturnValue({ data: [item('id-1')], isLoading: false, isError: false })
    const { container } = wrap()

    expect(container.textContent).toContain('ouverte')
  })

  it('vide, la file n’est pas une grande carte : c’est une ligne', () => {
    interventions.mockReturnValue({ data: [], isLoading: false, isError: false })
    const { container } = wrap()

    expect(container.textContent).toContain('Rien ne nécessite ton arbitrage')
    // Ni titre, ni intro, ni carte : le bloc entier disparaît. « Ne pas afficher
    // une grande carte vide » et la phrase ne tiennent ensemble qu'ainsi.
    expect(container.textContent).not.toContain('À traiter')
  })

  it('une lecture en ÉCHEC ne se lit pas « rien à traiter »', () => {
    // Afficher une file vide sur un serveur en panne ferait rentrer chez soi un
    // responsable qui avait quelque chose à faire.
    interventions.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { container } = wrap()

    expect(container.textContent).not.toContain('Rien ne nécessite')
  })

  it('ne rend RIEN pendant le chargement', () => {
    interventions.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { container } = wrap()

    expect(container.textContent).toBe('')
  })
})

/**
 * #2402.13 — un signal OUVERT trop vieux arrête d'être marqué urgent, sans
 * disparaître de la file (on archive, on ne supprime pas). Dates calculées à
 * partir de `Date.now()`, jamais recopiées en absolu — une date de capacité
 * codée en dur devient fausse SEULE (voir la garde de ce dépôt).
 */
describe('#2402.13 — un signal périmé change d’état, plus marqué urgent', () => {
  it('reste « À traiter » (badge urgent) tant que le seuil n’est pas dépassé', () => {
    interventions.mockReturnValue({
      data: [{ ...item('a'), openedAt: new Date(Date.now() - 59 * 86_400_000).toISOString() }],
      isLoading: false,
      isError: false,
    })
    const { container } = wrap()

    expect(container.textContent).toContain('À traiter')
    expect(container.textContent).not.toContain('Périmé')
  })

  it('devient « Périmé » (et RESTE dans la file) une fois le seuil dépassé', () => {
    interventions.mockReturnValue({
      data: [{ ...item('a'), openedAt: new Date(Date.now() - 61 * 86_400_000).toISOString() }],
      isLoading: false,
      isError: false,
    })
    const { container } = wrap()

    expect(container.textContent).toContain('Périmé')
    expect(container.textContent).toContain('détail a')
  })

  it('une intervention déjà ACKNOWLEDGED (même très vieille) ne devient jamais « Périmé »', () => {
    interventions.mockReturnValue({
      data: [
        {
          ...item('a'),
          state: 'acknowledged' as const,
          openedAt: new Date(Date.now() - 400 * 86_400_000).toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    })
    const { container } = wrap()

    expect(container.textContent).toContain('En cours')
    expect(container.textContent).not.toContain('Périmé')
  })
})

/**
 * #2206.53 — « owner_id existe, aucune route ne l'écrit ». Le critère de
 * recette dit « le manager peut attribuer une action » : réservé au rôle qui
 * porte `team:manage`, jamais un auto-service.
 */
describe('#2206.53 — le manager attribue une intervention', () => {
  it('un membre SANS team:manage garde le texte en lecture seule', () => {
    membersQuery.mockReturnValue({
      data: [{ userId: 'u1', fullName: 'Marie', email: null, role: 'member', isSelf: true }],
    })
    interventions.mockReturnValue({ data: [item('a')], isLoading: false, isError: false })
    wrap()

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText("Personne n'en est responsable")).toBeTruthy()
  })

  it('un manager voit un sélecteur et peut attribuer', async () => {
    membersQuery.mockReturnValue({
      data: [
        { userId: 'u1', fullName: 'Marie Dupont', email: null, role: 'owner', isSelf: true },
        { userId: 'u2', fullName: 'Karim', email: null, role: 'member', isSelf: false },
      ],
    })
    interventions.mockReturnValue({ data: [item('a')], isLoading: false, isError: false })
    wrap()

    const select = screen.getByRole('combobox')
    await chooseOption(select, 'Karim')
    expect(assignMutate).toHaveBeenCalledWith({ id: 'a', ownerId: 'u2' })
  })
  // Recette 14/10 : 98 factures en retard = UNE ligne par client, qui décide pour toutes.
  it('une ligne regroupée par client mène à Encaissements et décide pour toutes ses factures', () => {
    decideMutate.mockClear()
    interventions.mockReturnValue({
      data: [
        {
          ...item('a'),
          kind: 'payment_overdue',
          subjectType: 'mission',
          detail: 'Acme : 2 factures en retard, 1 500 € dus, plus ancien retard : 60 jours.',
          group: {
            clientLabel: 'Acme',
            ids: ['a', 'b'],
            invoiceCount: 2,
            outstandingCents: 150000,
            oldestOverdueDays: 60,
          },
        },
      ],
      isLoading: false,
      isError: false,
    })
    wrap()
    expect(screen.getByText(/Acme : 2 factures en retard/)).toBeTruthy()
    expect(document.querySelector('a[href="/missions/encaissements"]')).not.toBeNull()
    fireEvent.click(screen.getByText("Je m'en occupe"))
    expect(decideMutate).toHaveBeenCalledTimes(2)
    expect(decideMutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', state: 'acknowledged' }))
  })
})
