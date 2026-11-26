import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cardAllowedGestures, type CopilotCardState, type PendingChatAction } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import type { CopilotCardWire } from '../api/copilotCardsApi'
import { CopilotCards } from './CopilotCards'

// #2896 / #2449.35 — la carte lit le niveau d'action réglé par `useQuery`, sans
// `QueryClientProvider` ici : lecture rendue vide (la carte ne dit alors rien).
vi.mock('@/features/actions/hooks/useActionLevel', () => ({ useActionLevel: () => ({ data: undefined }) }))

/**
 * #1950.14 / #1950.18 / #1950.20 / #1950.22 — LE PLAN DE LAURA, À L'ÉCRAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1950.14 REVIENT SUR 1950.3, DÉLIBÉRÉMENT (décision Louis 19/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1950.3 disait : « aucune exécution enchaînée, aucun nouvel état, aucune
 * dépendance » — et la carte rappelait « rien ne s'exécute sans ton clic, étape
 * par étape ». Sur les cartes gouvernées, c'est fini : un geste lance tout le
 * plan (ou sa seule 1re étape), chaque étape dit son état de PLAN, et une étape
 * dont le prérequis DÉCLARÉ a échoué est bloquée.
 *
 * CE QUI TIENT ENCORE, et que ces tests gardent :
 *  - le geste de plan annonce AVANT le clic ce qu'il lance et ce que ça coûte
 *    (« non annoncé » n'est jamais « 0 ») ;
 *  - ce qui écrit hors de Bellum (CRM, messagerie, agenda) n'est pas lancé par le
 *    plan : l'écran le DIT, et la carte garde son propre « Valider » ;
 *  - sans dépendance déclarée, rien n'est bloqué ;
 *  - un résultat inconnu arrête la reprise : le geste de plan disparaît.
 *  - le legs `PendingActions` (onglets d'avant le déploiement, JSON brut sans
 *    état persisté) garde sa conduite d'avant : rien n'y est enchaîné.
 */

const ENRICH: PendingChatAction = {
  action: 'enrich_contact',
  contact_id: 'c-1',
  contact_name: 'Claire Meunier',
  organization_name: 'Acme',
}
const MESSAGE = (depends_on?: number[]): PendingChatAction => ({
  action: 'prepare_message',
  contact_id: 'c-1',
  channel: 'email',
  ...(depends_on ? { depends_on } : {}),
})
const CRM: PendingChatAction = {
  action: 'export_contact_to_crm',
  contact_id: 'c-1',
  contact_name: 'Claire Meunier',
  provider: 'hubspot',
}

function card(
  rank: number,
  action: PendingChatAction,
  state: CopilotCardState = 'prepared',
  costCredits: number | null = 1,
): CopilotCardWire {
  return {
    id: `run-${rank}`,
    action,
    state,
    allowedGestures: cardAllowedGestures(state),
    preview: {
      whatWillHappen: `Étape proposée ${rank + 1}`,
      targetObject: 'Claire Meunier',
      destination: null,
      content: null,
      dataUsed: null,
      costCredits,
      connectionUsed: null,
      whatWillNotHappen: 'Aucun envoi.',
    },
    result: null,
    snoozedUntil: null,
    expiresAt: null,
    turnId: 'turn-1',
    proposalIndex: rank,
    primary: rank === 0,
    accountId: null,
  }
}

const planRegion = () => screen.getByRole('region', { name: 'Plan de Laura' })

describe('#1950.20 — chaque étape dit son état au niveau du plan', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset())

  it('le plan liste ses étapes avec leur état : faite, échouée, bloquée', () => {
    render(
      <CopilotCards
        cards={[card(0, ENRICH, 'executed'), card(1, MESSAGE(), 'failed'), card(2, MESSAGE([1]), 'prepared')]}
      />,
    )
    const plan = planRegion()
    expect(within(plan).getByText('Étape 1 : faite')).toBeInTheDocument()
    expect(within(plan).getByText('Étape 2 : échouée')).toBeInTheDocument()
    expect(within(plan).getByText('Étape 3 : bloquée')).toBeInTheDocument()
  })

  it('une carte seule n’est pas un plan', () => {
    render(<CopilotCards cards={[card(0, ENRICH)]} />)
    expect(screen.queryByRole('region', { name: 'Plan de Laura' })).not.toBeInTheDocument()
  })
})

describe('#1950.22 — une étape dont le prérequis DÉCLARÉ a échoué est bloquée', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset())

  it('sa carte perd « Valider » et dit par qui elle est bloquée', () => {
    render(<CopilotCards cards={[card(0, ENRICH, 'failed'), card(1, MESSAGE([0]), 'prepared')]} />)
    expect(screen.getByText('Bloquée : l’étape 1 a échoué.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
  })

  it('SANS dépendance déclarée, l’étape qui suit un échec garde son « Valider »', () => {
    render(<CopilotCards cards={[card(0, ENRICH, 'failed'), card(1, MESSAGE(), 'prepared')]} />)
    expect(screen.queryByText(/Bloquée/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
  })
})

describe('#1950.14 — « Lancer tout le plan »', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset())

  it('annonce AVANT le clic ce qu’il enchaîne et ce qui reste sur sa porte — sans coût (#4463)', () => {
    render(<CopilotCards cards={[card(0, ENRICH, 'prepared', 1), card(1, CRM), card(2, MESSAGE(), 'prepared', 2)]} />)
    const plan = planRegion()
    expect(within(plan).getByRole('button', { name: 'Lancer tout le plan' })).toBeInTheDocument()
    expect(within(plan).getByText('2 étapes préparées dans Bellum')).toBeInTheDocument()
    expect(plan).not.toHaveTextContent(/crédit|coût/i)
    expect(
      within(plan).getByText('Étape 2 : écrit hors de Bellum, elle attend ta validation sur sa carte.'),
    ).toBeInTheDocument()
  })

  it('un coût non annoncé n’ajoute aucune mention de coût — ni « 0 », ni « coût non annoncé » (#4463)', () => {
    render(<CopilotCards cards={[card(0, ENRICH, 'prepared', null), card(1, MESSAGE(), 'prepared', 2)]} />)
    const plan = planRegion()
    expect(within(plan).getByText('2 étapes préparées dans Bellum')).toBeInTheDocument()
    expect(plan).not.toHaveTextContent(/crédit|coût|annoncé/i)
  })

  it('le clic lance le plan côté serveur et prend l’état RENVOYÉ', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      cards: [card(0, ENRICH, 'executed'), card(1, MESSAGE(), 'executed')],
      launched: [0, 1],
      refused: [],
    })
    render(<CopilotCards cards={[card(0, ENRICH), card(1, MESSAGE())]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Lancer tout le plan' }))

    expect(apiFetch).toHaveBeenCalledWith({
      path: '/action-os/cards/plan/turn-1/run',
      method: 'POST',
      body: { mode: 'all' },
    })
    await waitFor(() => expect(within(planRegion()).getByText('Étape 2 : faite')).toBeInTheDocument())
    expect(screen.getAllByText('Exécutée')).toHaveLength(2)
  })

  it('un refus du serveur sur une étape est DIT, pas tu', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      cards: [card(0, ENRICH), card(1, MESSAGE(), 'executed')],
      launched: [1],
      refused: [{ rank: 0, reason: 'Ton rôle ne permet pas cette action.' }],
    })
    render(<CopilotCards cards={[card(0, ENRICH), card(1, MESSAGE())]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lancer tout le plan' }))
    await waitFor(() =>
      expect(within(planRegion()).getByRole('alert')).toHaveTextContent(
        'Étape 1 : Ton rôle ne permet pas cette action.',
      ),
    )
  })

  it('un résultat INCONNU arrête la reprise : plus de geste de plan, et l’écran dit pourquoi', () => {
    render(<CopilotCards cards={[card(0, ENRICH, 'unknown_outcome'), card(1, MESSAGE())]} />)
    const plan = planRegion()
    expect(within(plan).queryByRole('button', { name: 'Lancer tout le plan' })).not.toBeInTheDocument()
    expect(
      within(plan).getByText('Le résultat de l’étape 1 est inconnu : le plan ne reprend pas tout seul.'),
    ).toBeInTheDocument()
  })

  it('rien à enchaîner (tout écrit dehors) : pas de bouton qui ne lancerait rien', () => {
    render(<CopilotCards cards={[card(0, CRM), card(1, CRM)]} />)
    expect(within(planRegion()).queryByRole('button', { name: 'Lancer tout le plan' })).not.toBeInTheDocument()
  })
})

describe('#1950.18 — « Seulement la 1re étape »', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset())

  it('lance la seule première étape', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      cards: [card(0, ENRICH, 'executed'), card(1, MESSAGE())],
      launched: [0],
      refused: [],
    })
    render(<CopilotCards cards={[card(0, ENRICH), card(1, MESSAGE())]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Seulement l’étape 1' }))

    expect(apiFetch).toHaveBeenCalledWith({
      path: '/action-os/cards/plan/turn-1/run',
      method: 'POST',
      body: { mode: 'first' },
    })
    await waitFor(() => expect(within(planRegion()).getByText('Étape 1 : faite')).toBeInTheDocument())
    expect(within(planRegion()).getByText('Étape 2 : à faire')).toBeInTheDocument()
  })

  it('une première étape qui écrit dehors n’a pas de raccourci de plan', () => {
    render(<CopilotCards cards={[card(0, CRM), card(1, MESSAGE())]} />)
    expect(screen.queryByRole('button', { name: /Seulement l’étape/ })).not.toBeInTheDocument()
  })
})
