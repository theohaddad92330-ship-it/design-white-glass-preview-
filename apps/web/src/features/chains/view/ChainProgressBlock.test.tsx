import type { Chain, ChainDerivation } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { ChainProgressBlock, stepDestination } from './ChainProgressBlock'
import { stateOfStep } from './ChainFlow'

vi.mock('@tanstack/react-router', () => ({
  // Le lien n'est pas ce qu'on teste ; sa DESTINATION l'est, et elle se lit
  // dans l'attribut. Monter le routeur entier apporterait ses propres échecs.
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

/**
 * CE QUE CE BLOC DOIT TENIR (#1505).
 *
 * Le garde-fou explicite du retour : « ce mini-parcours ne doit pas devenir une
 * deuxième barre de statut modifiable ». Il est tenu par l'ABSENCE de code —
 * donc c'est l'absence de requête d'écriture de position qui se vérifie, pas
 * l'absence d'un bouton : un bouton retiré dont le chemin subsiste revient au
 * premier chantier suivant.
 */

const fetchMock = vi.mocked(apiFetch)

const CHAIN: Chain = {
  key: 'sourcing_matching',
  label: { fr: 'Sourcing et matching', en: 'Sourcing and matching' },
  purpose: { fr: 'Du besoin au profil accepté.', en: 'From need to accepted profile.' },
  domain: 'sourcing',
  subjectType: 'need',
  steps: [
    {
      position: 1,
      label: { fr: 'Besoin ouvert', en: 'Need opened' },
      actor: 'user',
      expectedOutput: { fr: 'Un besoin', en: 'A need' },
      automationLevel: 'n1_prepare',
      requiredCapability: null,
      outsideTool: false,
    },
    {
      position: 2,
      label: { fr: 'Matching lancé', en: 'Matching run' },
      actor: 'agent',
      expectedOutput: { fr: 'Un classement', en: 'A ranking' },
      automationLevel: 'n1_prepare',
      requiredCapability: null,
      outsideTool: false,
    },
    {
      position: 3,
      label: { fr: 'Profil positionné', en: 'Profile submitted' },
      actor: 'user',
      expectedOutput: { fr: 'Un positionnement', en: 'A submission' },
      automationLevel: 'n1_prepare',
      requiredCapability: null,
      outsideTool: false,
    },
    {
      position: 4,
      label: { fr: 'Badge d’accès obtenu', en: 'Access badge issued' },
      actor: 'user',
      expectedOutput: { fr: 'Un badge', en: 'A badge' },
      automationLevel: 'n0_advice',
      requiredCapability: null,
      outsideTool: true,
    },
  ],
  gates: [],
  returnLoop: { fr: 'Un refus ramène au matching.', en: 'A rejection sends back to matching.' },
}

const DERIVATION: ChainDerivation = {
  kind: 'at',
  position: 2,
  blockedGate: null,
  gateReason: null,
  evidence: [
    { position: 1, fact: 'fact.sourcing_matching.1', at: '2026-08-28T09:00:00.000Z', count: null },
    { position: 2, fact: 'fact.sourcing_matching.3', at: '2026-08-29T09:00:00.000Z', count: 3 },
  ],
}

function payload(over: Partial<{ manual: { position: number; markedAt: string | null }[] }> = {}) {
  return {
    chains: [
      {
        chain: CHAIN,
        projection: { subjectId: 'need-1', label: 'Data engineer', movedAt: null, derivation: DERIVATION },
        days: 4,
        manual: over.manual ?? [],
      },
    ],
  }
}

function renderBlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChainProgressBlock subjectType="need" subjectId="need-1" />
    </QueryClientProvider>,
  )
}

describe('ChainProgressBlock — le parcours sur la fiche', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(payload())
  })

  it('une durée nulle ne s’affiche jamais « 0 jour sans mouvement » (GA-18/19)', async () => {
    const p = payload()
    fetchMock.mockResolvedValue({ chains: [{ ...p.chains[0]!, days: 0 }] })
    renderBlock()
    expect(await screen.findByText(/Étape en cours : Matching lancé/)).toBeInTheDocument()
    expect(screen.queryByText(/0 jour/)).toBeNull()
  })

  it('dit l’étape en cours ET la suivante — « où on en est » et « ce qu’on attend »', async () => {
    renderBlock()
    expect(await screen.findByText(/Étape en cours : Matching lancé/)).toBeInTheDocument()
    expect(screen.getByText(/Prochaine étape : Profil positionné/)).toBeInTheDocument()
  })

  it('#3371 — le rendu compact tient en une ligne, le clic ouvre la modale complète', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ChainProgressBlock subjectType="need" subjectId="need-1" variant="compact" />
      </QueryClientProvider>,
    )
    const line = await screen.findByTestId('chain-compact')
    expect(line.tagName).toBe('BUTTON')
    expect(line.getAttribute('title')).toMatch(/Sourcing et matching · Matching lancé/)
    // Ni frise, ni gestes hors outil, ni « pourquoi » tant que la modale est fermée.
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText(/Prochaine étape/)).toBeNull()

    await user.click(line)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Badge d’accès obtenu/ })).toBeInTheDocument()
    expect(screen.getByText(/Prochaine étape : Profil positionné/)).toBeInTheDocument()
  })

  // #3525 / #3526 (Louis 01/10) — « pas compréhensible et ça bug » : le nom du
  // parcours s'écrivait DEUX fois dans la modale (titre + carte) et la case,
  // désactivée pendant l'écriture, perdait le second clic (« Rendez-vous tenu »
  // cliqué deux fois dans le fil d'actions).
  it('#3525 — la modale ne répète pas le nom du parcours et le dit en langage clair', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ChainProgressBlock subjectType="need" subjectId="need-1" variant="compact" />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByTestId('chain-compact'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('Sourcing et matching')).toHaveLength(1)
    expect(within(dialog).getByText(/Où en est ce dossier/)).toBeInTheDocument()
    expect(dialog.textContent).not.toMatch(/gestes hors outil\./)
  })

  // #3525 / #3526 (recette prod 02/10) — bandeau d'étapes coupé (scrollWidth
  // 1403 pour 622 px visibles) : sur un dossier, les étapes passent à la ligne
  // au lieu de défiler dans le vide ; « Étape en cours » n'est plus souligné.
  it('#3525 — le bandeau d’étapes d’un dossier passe à la ligne, il ne défile pas', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ChainProgressBlock subjectType="need" subjectId="need-1" variant="compact" />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByTestId('chain-compact'))
    const dialog = await screen.findByRole('dialog')
    const flow = within(dialog).getByTestId('chain-flow')
    expect(flow.className).toMatch(/flex-wrap/)
    expect(flow.className).not.toMatch(/w-max/)
    expect(flow.parentElement?.className ?? '').not.toMatch(/overflow-x-auto/)
  })

  it('#3525 — « Étape en cours » n’est pas souligné comme un lien en permanence', async () => {
    renderBlock()
    const link = await screen.findByRole('link', { name: /Étape en cours/ })
    expect(link.className).not.toMatch(/(^|\s)underline(\s|$)/)
  })

  it('#3526 — la case se coche TOUT DE SUITE et un second clic n’est pas perdu pendant l’écriture', async () => {
    const user = userEvent.setup()
    renderBlock()
    const box = await screen.findByRole('checkbox', { name: /Badge d’accès obtenu/ })
    // L'écriture ne répond pas : l'écran ne doit pas attendre le serveur.
    fetchMock.mockImplementation(args =>
      (args as { method?: string }).method === 'POST' ? new Promise(() => undefined) : Promise.resolve(payload()),
    )
    await user.click(box)
    expect(box).toBeChecked()
    expect(box).toBeEnabled()
    await user.click(box)
    expect(box).not.toBeChecked()
    const writes = fetchMock.mock.calls.filter(([args]) => (args as { method?: string }).method === 'POST')
    expect(writes.map(([args]) => (args as { body: { marked: boolean } }).body.marked)).toEqual([true, false])
  })

  it('#3486 — « Pourquoi ? » ne laisse pas un libellé seul : les faits sont lus dès l’ouverture du bloc', async () => {
    renderBlock()
    const why = await screen.findByRole('button', { name: 'Pourquoi ?' })
    expect(why).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(DERIVATION.evidence.length)
  })

  it('#3551 — « Pourquoi ? » s’aligne sur le contenu : le padding du bouton (12 px) est rattrapé', async () => {
    renderBlock()
    const why = await screen.findByRole('button', { name: 'Pourquoi ?' })
    expect(why).toHaveClass('-ml-3')
  })

  it('n’a AUCUN chemin d’écriture de position', async () => {
    renderBlock()
    await screen.findByText(/Étape en cours/)
    const writes = fetchMock.mock.calls.filter(([args]) => (args as { method?: string }).method === 'POST')
    expect(writes).toHaveLength(0)
  })

  it('cocher un geste HORS OUTIL est la seule écriture possible', async () => {
    const user = userEvent.setup()
    renderBlock()
    const box = await screen.findByRole('checkbox', { name: /Badge d’accès obtenu/ })
    await user.click(box)

    const write = fetchMock.mock.calls.find(([args]) => (args as { method?: string }).method === 'POST')
    expect(write?.[0]).toMatchObject({
      path: '/chains/marks',
      // Position 4 : le geste hors outil, JAMAIS une étape du fil dérivé.
      body: { chainKey: 'sourcing_matching', subjectId: 'need-1', position: 4, marked: true },
    })
  })

  it('la checklist ne propose QUE des gestes hors outil', async () => {
    renderBlock()
    await screen.findByText(/Étape en cours/)
    // Les trois étapes du fil ne sont pas cochables : cocher « Matching lancé »
    // recréerait la position écrite à la main que ce chantier supprime.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('le clic sur l’étape en cours ouvre la page SOURCE, pas le parcours', async () => {
    renderBlock()
    const link = await screen.findByRole('link', { name: /Étape en cours/ })
    expect(link).toHaveAttribute('href', '/projects/needs/need-1')
  })

  it('ne s’affiche pas du tout quand aucun parcours ne couvre le dossier', async () => {
    fetchMock.mockResolvedValue({ chains: [] })
    const { container } = renderBlock()
    // Un encart vide sur trois écrans quotidiens apprend à ne plus les regarder.
    expect(container.textContent).toBe('')
  })
})

// #3465 — la ligne compacte d'un dossier arrivait après le premier rendu et
// faisait sauter la barre d'onglets : sa place est réservée pendant la lecture.
describe('ChainProgressBlock compact — #3465 la place est réservée pendant la lecture', () => {
  it('réserve un emplacement invisible et inerte tant que la lecture est en cours, puis le libère si rien à dire', async () => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ chains: [] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={client}>
        <ChainProgressBlock subjectType="account" subjectId="acc-1" variant="compact" />
      </QueryClientProvider>,
    )
    const slot = screen.getByTestId('chain-compact-slot')
    expect(slot).toHaveAttribute('aria-hidden', 'true')
    expect(slot.className).toContain('invisible')
    await waitFor(() => expect(screen.queryByTestId('chain-compact-slot')).toBeNull())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('stateOfStep — un seul calcul d’état', () => {
  it('classe avant / pendant / après', () => {
    expect(stateOfStep(DERIVATION, 1)).toBe('done')
    expect(stateOfStep(DERIVATION, 2)).toBe('current')
    expect(stateOfStep(DERIVATION, 3)).toBe('upcoming')
  })

  it('une porte sans réponse rend l’étape BLOQUÉE, pas en cours', () => {
    expect(stateOfStep({ ...DERIVATION, blockedGate: 'need_staffable' }, 2)).toBe('blocked')
  })

  it('un dossier qu’on ne sait pas placer ne colore AUCUNE étape', () => {
    // Le peindre « à l'étape 1 » affirmerait une position qu'on vient de dire
    // qu'on ne connaît pas.
    const undetermined: ChainDerivation = { kind: 'undetermined', reason: 'unmapped_status', evidence: [] }
    expect(stateOfStep(undetermined, 1)).toBe('upcoming')
    expect(stateOfStep(undetermined, 3)).toBe('upcoming')
  })

  it('une étape antérieure SANS fait n’est pas « franchie » — elle est non constatée', () => {
    // Mesuré en production : « Matching lancé · franchie » s'affichait au-dessus
    // d'un « Pourquoi ? » qui ne le listait pas. Les deux blocs du même écran se
    // contredisaient, et c'est le fil qui mentait.
    expect(stateOfStep(DERIVATION, 1)).toBe('done')
    const sansFaitEn1: ChainDerivation = { ...DERIVATION, evidence: [DERIVATION.evidence[1]] }
    expect(stateOfStep(sansFaitEn1, 1)).toBe('skipped')
  })
})

describe('stepDestination — un lien qui tient sa promesse', () => {
  it('emmène sur une route qui EXISTE, sans paramètre décoratif', () => {
    // `/missions/cra` ne déclare pas de `validateSearch` : un `?missionId=`
    // promettrait un filtre que l'écran n'applique pas.
    expect(stepDestination(CHAIN, 2, 'need-1')).toBe('/projects/needs/need-1')
    expect(stepDestination({ ...CHAIN, key: 'onboarding_delivery' }, 6, 'm-1')).toBe('/missions/cra')
    expect(stepDestination({ ...CHAIN, key: 'onboarding_delivery' }, 1, 'm-1')).toBe('/missions/m-1')
  })
})
