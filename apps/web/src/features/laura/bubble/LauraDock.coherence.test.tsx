import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import type { ChatResponseContext } from '@/features/chat/view/ContextDisclosure'
import type { PendingChatAction } from '@bellum/contracts'
import type * as MemoryApiModule from '@/features/memory/api'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useLauraContext, resetLauraPageContext } from '@/features/laura/bubble/page-context-store'
import { i18n } from '@/i18n'
import { LauraDock } from './LauraDock'

/**
 * #1901 — UNE SEULE LAURA : LA BULLE N'EST PAS UNE LAURA AMPUTÉE.
 *
 * Deux gestes que la page `/chat` permettait et que la bulle empêchait, sans
 * rien dire :
 *
 *  · **#1901.10** — Laura propose de retenir un fait (`pin_memory_fact`) : sur la
 *    page, une carte « Épingler » ; dans la bulle, la phrase « je te propose de
 *    le retenir » et… rien. `LauraDock` jetait `turn.context` entier, donc
 *    `pending_actions` avec. Ce qu'on dit à Laura dans la bulle ne pouvait donc
 *    JAMAIS arriver dans « Laura garde en tête ».
 *  · **#1901.15** — l'offre n'inclut pas Laura : la page le dit AVANT le premier
 *    message (`usePlanFeature('chat_ai')`), la bulle laissait taper puis rendait
 *    le refus du serveur. Même permission, deux conduites.
 *
 * `askLaura` est mocké : aucun message de test ne part vers le modèle.
 */

vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: vi.fn(() => ({ known: true, allowed: true })),
}))

const { pinFact, invalidateQueries } = vi.hoisted(() => ({ pinFact: vi.fn(), invalidateQueries: vi.fn() }))
vi.mock('@/features/memory/api', async importOriginal => {
  const original = await importOriginal<typeof MemoryApiModule>()
  return { ...original, memoryApi: { ...original.memoryApi, pinFact } }
})
vi.mock('@/lib/query-client', () => ({ queryClient: { invalidateQueries } }))

const askLauraMock = vi.mocked(askLaura)
const usePlanFeatureMock = vi.mocked(usePlanFeature)

const PIN_FACT: PendingChatAction = {
  action: 'pin_memory_fact',
  fact: 'Le décideur chez ACME est la DSI, pas les achats.',
  cost_credits: 0,
}

afterEach(() => {
  askLauraMock.mockReset()
  pinFact.mockReset()
  invalidateQueries.mockReset()
  usePlanFeatureMock.mockImplementation(() => ({ known: true, allowed: true }))
  resetLauraPageContext()
})

async function openAndAsk(question: string) {
  fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
  fireEvent.change(await screen.findByPlaceholderText(/demande-moi/i), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
}

describe('#1901.10 — ce que Laura propose dans la bulle se valide dans la bulle', () => {
  it('rend la MÊME carte que la page quand la réponse propose d’épingler un fait', async () => {
    askLauraMock.mockResolvedValueOnce({
      reply: 'Je te propose de le retenir.',
      context: { pending_actions: [PIN_FACT] } as unknown as ChatResponseContext,
    })
    renderWithRouter(<LauraDock />)

    await openAndAsk('Retiens que chez ACME le décideur est la DSI.')

    expect(await screen.findByRole('button', { name: 'Épingler' })).toBeInTheDocument()
    // Rien n'est écrit avant le clic — la bulle n'épingle pas toute seule.
    expect(pinFact).not.toHaveBeenCalled()
  })

  it('le clic épingle par la même route, et la mémoire affichée ailleurs se relit', async () => {
    pinFact.mockResolvedValue({ id: 'f-1', fact: PIN_FACT.fact })
    askLauraMock.mockResolvedValueOnce({
      reply: 'Je te propose de le retenir.',
      context: { pending_actions: [PIN_FACT] } as unknown as ChatResponseContext,
    })
    renderWithRouter(<LauraDock />)

    await openAndAsk('Retiens que chez ACME le décideur est la DSI.')
    fireEvent.click(await screen.findByRole('button', { name: 'Épingler' }))

    await waitFor(() => expect(pinFact).toHaveBeenCalledTimes(1))
    expect(pinFact).toHaveBeenCalledWith(expect.objectContaining({ fact: PIN_FACT.fact, origin: 'copilot' }))
    // « Laura garde en tête » (`/chat`) et Réglages › Mémoire lisent la clé
    // `memory` — un cache de 30 s les laisserait muets sur ce qu'on vient
    // d'épingler depuis la bulle.
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['memory'] }))
  })

  it('une réponse SANS proposition ne rend aucune carte (témoin)', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: 'Voici le résumé.' })
    renderWithRouter(<LauraDock />)

    await openAndAsk('Résume-moi ce compte.')

    expect(await screen.findByText('Voici le résumé.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Épingler' })).not.toBeInTheDocument()
  })

  /**
   * #2892 (27/09) — même défaut que `/chat` (`Chat.cards.test.tsx`) : « Pas de
   * réponse. » s'affichait, PARASITE, devant la carte quand le tour n'avait
   * rien à dire au-delà de la proposition elle-même.
   */
  it('#2892 — un tour SANS texte mais AVEC une proposition n’affiche pas « Pas de réponse. »', async () => {
    askLauraMock.mockResolvedValueOnce({
      reply: '',
      context: { pending_actions: [PIN_FACT] } as unknown as ChatResponseContext,
    })
    renderWithRouter(<LauraDock />)

    await openAndAsk('Retiens que chez ACME le décideur est la DSI.')

    expect(await screen.findByRole('button', { name: 'Épingler' })).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('messages.noReply', { ns: 'chat' }))).not.toBeInTheDocument()
  })

  it('#2892 — un tour SANS texte et SANS proposition affiche toujours « Pas de réponse. » (témoin)', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: '' })
    renderWithRouter(<LauraDock />)

    await openAndAsk('Une question sans rien en retour.')

    expect(await screen.findByText(i18n.t('messages.noReply', { ns: 'chat' }))).toBeInTheDocument()
  })
})

describe('#1901.15 — la bulle lit le même verrou d’offre que la page', () => {
  it('offre sans Laura : la bulle le dit AVANT la saisie, et n’appelle jamais le tour', async () => {
    usePlanFeatureMock.mockImplementation(() => ({ known: true, allowed: false }))
    renderWithRouter(<LauraDock />)

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))

    expect(await screen.findByText(/Non inclus dans ton offre|Disponible à partir de l'offre/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/demande-moi/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
    expect(askLauraMock).not.toHaveBeenCalled()
  })

  it('le verrou lit la clé `chat_ai`, la même que l’écran `/chat`', async () => {
    renderWithRouter(<LauraDock />)
    await screen.findByRole('button', { name: /ouvrir/i })

    expect(usePlanFeatureMock).toHaveBeenCalledWith('chat_ai')
  })

  it('le doute n’interdit pas : offre encore inconnue = saisie ouverte (témoin)', async () => {
    usePlanFeatureMock.mockImplementation(() => ({ known: false, allowed: true }))
    renderWithRouter(<LauraDock />)

    fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))

    expect(await screen.findByPlaceholderText(/demande-moi/i)).toBeInTheDocument()
  })
})

/**
 * #3002 (#2206.45-.48, retour bêta 25/09/2026) — « Explique-moi cet écran »
 * depuis /pilotage recevait une réponse GÉNÉRIQUE (catégories, aucun dossier
 * nommé). `pilotageLauraContext` existait et `PilotagePage` le publiait déjà
 * (`useLauraContext`) — le maillon manquant était en AVAL : rien ne prouvait
 * que ce contexte publié atteignait réellement le tour envoyé au serveur.
 *
 * Ce test remonte toute la chaîne réelle plutôt que la fonction pure : un
 * écran qui publie le MÊME contexte que `PilotagePage` (dossiers classés,
 * décision, geste recommandé), la bulle ouverte PAR-DESSUS lui (exactement le
 * montage de `__root.tsx`), une question posée — et la preuve que
 * `askLaura` (donc `POST /ia/chat`) reçoit ces facets dans `pageContext`.
 */
describe('#3002 — ouvrir Laura depuis /pilotage envoie les facets au tour de chat', () => {
  const PILOTAGE_CONTEXT = {
    kind: 'pilotage' as const,
    label: 'Pilotage',
    entityId: null,
    facets: [
      { label: 'Couverture', value: '4/12' },
      { label: 'Risque', value: 'ACME — mission sans marge suivie depuis 21 jours' },
    ],
    state: 'ready' as const,
    purpose: 'Où ma chaîne commerciale décroche, pourquoi, et quoi faire en premier.',
    actions: ['Ouvrir le dossier', 'Attribuer'],
    recommendedAction: 'Ouvrir le dossier',
  }

  function PilotageScreenStandIn() {
    useLauraContext(PILOTAGE_CONTEXT)
    return null
  }

  it('le tour envoyé au serveur porte les dossiers, la décision et le geste recommandé de l’écran', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: 'Voici où ça décroche.' })
    renderWithRouter(
      <>
        <PilotageScreenStandIn />
        <LauraDock />
      </>,
    )

    await openAndAsk('Où ma chaîne commerciale décroche-t-elle, pourquoi, quels dossiers sont concernés ?')

    await waitFor(() => expect(askLauraMock).toHaveBeenCalledTimes(1))
    expect(askLauraMock).toHaveBeenCalledWith(expect.objectContaining({ pageContext: PILOTAGE_CONTEXT }))
  })
})
