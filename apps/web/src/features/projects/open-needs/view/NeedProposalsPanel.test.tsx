import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

/**
 * « CE QUE L'ANALYSE A REPÉRÉ » — le bloc qui enterrait l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN PRODUCTION LE 27/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Sur `/projects/needs` — dont la promesse écrite est « Tous les rôles que tes
 * clients cherchent en ce moment » — le tableau des besoins commençait à
 * 2 866 px dans un conteneur défilant de 3 058 px, soit à **94 % de la page**.
 * Seize propositions, chacune DÉPLIÉE avec sa liste de projets pleine largeur,
 * son bouton « En faire un besoin » et un champ « Pourquoi l'écarter ? »
 * toujours visible, occupaient tout le reste.
 *
 * Le bloc dit lui-même de son contenu : « Ce ne sont pas encore des besoins ».
 * Le sujet PROPRE de l'écran était donc repoussé sous ce qui n'est pas encore
 * son sujet.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST TESTÉ, ET POURQUOI CE CHOIX-LÀ
 * ─────────────────────────────────────────────────────────────────────────
 * Deux directions étaient possibles : descendre le bloc SOUS le tableau, ou le
 * replier. Le déplacer déplacerait le défaut — le tableau pagine à cinquante
 * lignes, et un bloc de triage placé après cinquante lignes n'est plus jamais
 * vu. Un travail de triage qu'on ne voit plus ne se fait plus.
 *
 * Il reste donc EN TÊTE, mais replié : une ligne qui dit combien il y a à
 * trier, et le tableau juste dessous. Aucune capacité ne disparaît — les seize
 * propositions restent traitables, à un clic.
 *
 * Le champ « Pourquoi l'écarter ? » n'apparaît qu'au GESTE d'écarter, pour la
 * même raison : il double la hauteur de chaque proposition pour un geste qu'on
 * ne fait pas la plupart du temps.
 */
vi.mock('@/features/projects/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'p-1', label: 'Refonte SIRH', account_id: 'a-1' }] }),
}))

const listed = vi.fn()
const listedForAccount = vi.fn()
vi.mock('../api', () => ({
  openNeedsKeys: { all: ['open-needs'] as const },
  needProposalsApi: {
    list: () => listed(),
    listForAccount: (accountId: string) => listedForAccount(accountId),
    accept: vi.fn(),
    dismiss: vi.fn(),
  },
}))

const { NeedProposalsPanel } = await import('./NeedProposalsPanel')

function proposals(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `prop-${index}`,
    account_id: 'a-1',
    title: `Ingénieur DevOps ${index}`,
    skills: ['Kubernetes'],
    location: 'Lyon',
    source_url: null,
    detected_at: null,
    created_at: '2026-08-20T09:00:00.000Z',
  }))
}

async function draw(count: number) {
  listed.mockResolvedValue({ items: proposals(count) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <NeedProposalsPanel />
    </QueryClientProvider>,
  )
  // Le panneau ne rend RIEN tant que la requête n'a pas répondu : attendre le
  // titre, c'est attendre que le bloc existe.
  await screen.findByText(/Ce que l’analyse a repéré/)
  return view
}

describe('propositions — le bloc ne mange plus l’écran', () => {
  it('est REPLIÉ par défaut : il dit combien il y a à trier, et rien de plus', async () => {
    await draw(16)
    expect(screen.getByText('16 propositions à trier')).toBeInTheDocument()
    // La preuve que le bloc est bien replié : aucune proposition rendue. Sans
    // cette assertion, le test passerait sur un bloc déplié qui aurait
    // simplement gagné un compteur.
    expect(screen.queryByText('Ingénieur DevOps 0')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'En faire un besoin' })).not.toBeInTheDocument()
  })

  it('déplie les SEIZE au clic — aucune capacité ne disparaît', async () => {
    await draw(16)
    await userEvent.click(screen.getByRole('button', { name: 'Trier les propositions' }))
    expect(screen.getAllByRole('button', { name: 'En faire un besoin' })).toHaveLength(16)
    expect(screen.getByText('Ingénieur DevOps 15')).toBeInTheDocument()
  })

  it('se replie à nouveau — le geste est réversible', async () => {
    await draw(3)
    await userEvent.click(screen.getByRole('button', { name: 'Trier les propositions' }))
    await userEvent.click(screen.getByRole('button', { name: 'Replier les propositions' }))
    expect(screen.queryByText('Ingénieur DevOps 0')).not.toBeInTheDocument()
  })

  it('cache le motif d’écartement jusqu’au geste d’écarter — et le demande toujours', async () => {
    await draw(1)
    await userEvent.click(screen.getByRole('button', { name: 'Trier les propositions' }))
    // Replié : un champ de saisie par proposition, permanent, pour un geste
    // qu'on ne fait pas la plupart du temps.
    expect(screen.queryByLabelText('Pourquoi l’écarter ?')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Écarter' }))
    const field = screen.getByLabelText('Pourquoi l’écarter ?')
    expect(field).toBeInTheDocument()
    // Le motif reste OBLIGATOIRE : sans lui on ne saura pas dans six mois si
    // l'offre ne correspondait pas au métier de l'ESN ou si elle était vieille.
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled()
    await userEvent.type(field, 'hors métier')
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeEnabled()
  })

  it('ne s’affiche pas du tout quand il n’y a rien à trier', async () => {
    listed.mockResolvedValue({ items: [] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={client}>
        <NeedProposalsPanel />
      </QueryClientProvider>,
    )
    // Un bloc vide en permanence apprend à ignorer la zone, et le jour où une
    // proposition arrive, personne ne la voit.
    expect(within(container).queryByText(/Ce que l’analyse a repéré/)).not.toBeInTheDocument()
  })
})

/**
 * #2647.1 — la section « Besoins » en tête du dossier compte réutilise ce
 * même panneau : mêmes gestes (accepter, écarter), même repli par défaut. La
 * SEULE différence est la source — cloisonnée à un compte plutôt que
 * transverse à l'espace — pour qu'un compte ne voie jamais les propositions
 * d'un autre.
 */
describe('propositions — CLOISONNÉES à un compte (#2647.1)', () => {
  it('lit la liste du COMPTE, pas la liste transverse de l’espace', async () => {
    listed.mockClear()
    listedForAccount.mockResolvedValue({ items: proposals(1) })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <NeedProposalsPanel accountId="a-1" />
      </QueryClientProvider>,
    )
    await screen.findByText(/Ce que l’analyse a repéré/)
    expect(listedForAccount).toHaveBeenCalledWith('a-1')
    expect(listed).not.toHaveBeenCalled()
  })
})
