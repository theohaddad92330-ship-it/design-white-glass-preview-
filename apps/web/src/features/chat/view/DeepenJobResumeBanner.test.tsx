import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatDeepenJobApi, type ChatDeepenJobStatusDto } from '../api/chatDeepenJobApi'
import { DeepenJobResumeBanner } from './DeepenJobResumeBanner'

vi.mock('../api/chatDeepenJobApi', () => ({ chatDeepenJobApi: { latest: vi.fn() } }))

/**
 * #3862.1 — l'écran relit `GET /chat/deepen-jobs/latest` : une étude
 * Approfondie interrompue faute de budget reste visible après une
 * reconnexion, au lieu de ne survivre que dans la dernière bulle du fil.
 */

const JOB: ChatDeepenJobStatusDto = {
  id: 'job-1',
  status: 'queued',
  label: 'Analyse complète du groupe Thales',
  completedSteps: 2,
  currentStep: "Budget du tour épuisé après 2 tour(s) d'outils sur 4",
  autoResumes: 0,
  stoppedReason: null,
  updatedAt: '2026-10-08T10:00:00.000Z',
}

afterEach(() => {
  vi.mocked(chatDeepenJobApi.latest).mockReset()
})

describe('DeepenJobResumeBanner — #3862.1', () => {
  it('ne rend rien tant que le fil est vierge (pas de conversation)', () => {
    render(<DeepenJobResumeBanner conversationId={null} messageCount={0} />)
    expect(chatDeepenJobApi.latest).not.toHaveBeenCalled()
  })

  it('nomme l’étude interrompue et ses étapes déjà faites, lues au serveur', async () => {
    vi.mocked(chatDeepenJobApi.latest).mockResolvedValue(JOB)
    render(<DeepenJobResumeBanner conversationId="conv-1" messageCount={3} />)
    await waitFor(() => expect(screen.getByText(/Analyse complète du groupe Thales/)).toBeTruthy())
    expect(screen.getByText(/2/)).toBeTruthy()
    expect(chatDeepenJobApi.latest).toHaveBeenCalledWith('conv-1')
  })

  it('dit que l’étude reprend toute seule en fond (#3236, décision Louis 11/10) — plus de « continue » à écrire', async () => {
    vi.mocked(chatDeepenJobApi.latest).mockResolvedValue(JOB)
    render(<DeepenJobResumeBanner conversationId="conv-1" messageCount={3} />)
    await waitFor(() => expect(screen.getByText(/reprend en fond/)).toBeTruthy())
    // #4463 — la reprise ne parle plus de plafond de crédits : aucun crédit à l'écran.
    expect(screen.queryByText(/crédit/i)).toBeNull()
  })

  it.each([
    ['credit_ceiling', /Tu as beaucoup utilisé .* est en pause/],
    ['max_resumes', /après 3 reprises/],
    ['resume_failed', /n’a pas pu repartir/],
  ] as const)('NOMME l’arrêt de la reprise automatique : %s', async (stoppedReason, expected) => {
    vi.mocked(chatDeepenJobApi.latest).mockResolvedValue({ ...JOB, status: 'unknown', autoResumes: 3, stoppedReason })
    render(<DeepenJobResumeBanner conversationId="conv-1" messageCount={3} />)
    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy())
    // #4463 — le frein doux ne chiffre rien : aucun crédit, y compris sur l'arrêt par plafond.
    expect(screen.queryByText(/crédit/i)).toBeNull()
    expect(screen.queryByText(/reprend en fond/)).toBeNull()
  })

  it('ne rend rien sans ligne au serveur (aucune étude interrompue)', async () => {
    vi.mocked(chatDeepenJobApi.latest).mockResolvedValue(undefined)
    render(<DeepenJobResumeBanner conversationId="conv-1" messageCount={3} />)
    await waitFor(() => expect(chatDeepenJobApi.latest).toHaveBeenCalled())
    expect(screen.queryByText(/interromp/)).toBeNull()
  })

  it('ne rend rien sur un statut terminal (`unknown` : la reprise s’arrête, doctrine « un timeout n’est pas un échec »)', async () => {
    vi.mocked(chatDeepenJobApi.latest).mockResolvedValue({ ...JOB, status: 'unknown' })
    render(<DeepenJobResumeBanner conversationId="conv-1" messageCount={3} />)
    await waitFor(() => expect(chatDeepenJobApi.latest).toHaveBeenCalled())
    expect(screen.queryByText(/Analyse complète du groupe Thales/)).toBeNull()
  })

  it('se tait dès qu’un nouveau message est arrivé dans cette session depuis la lecture du job', async () => {
    vi.mocked(chatDeepenJobApi.latest).mockResolvedValue(JOB)
    const { rerender } = render(<DeepenJobResumeBanner conversationId="conv-1" messageCount={3} />)
    await waitFor(() => expect(screen.getByText(/Analyse complète du groupe Thales/)).toBeTruthy())
    rerender(<DeepenJobResumeBanner conversationId="conv-1" messageCount={5} />)
    expect(screen.queryByText(/Analyse complète du groupe Thales/)).toBeNull()
  })

  it('ne rappelle pas le serveur à chaque fragment streamé (dépend du fil, pas du nombre de messages)', async () => {
    vi.mocked(chatDeepenJobApi.latest).mockResolvedValue(JOB)
    const { rerender } = render(<DeepenJobResumeBanner conversationId="conv-1" messageCount={3} />)
    await waitFor(() => expect(chatDeepenJobApi.latest).toHaveBeenCalledTimes(1))
    rerender(<DeepenJobResumeBanner conversationId="conv-1" messageCount={4} />)
    rerender(<DeepenJobResumeBanner conversationId="conv-1" messageCount={5} />)
    expect(chatDeepenJobApi.latest).toHaveBeenCalledTimes(1)
  })
})
