import type { Contact } from '@bellum/contracts'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContactEngagement } from './ContactEngagementContext'
import { ContactEngagementProvider } from './ContactEngagementProvider'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

const noPhone = { id: 'c1', full_name: 'Olivier', account_id: 'a1', email: 'o@x.fr', phone: null } as unknown as Contact
const withEmail = {
  id: 'c2',
  full_name: 'Claire',
  account_id: 'a1',
  email: 'c@x.fr',
  phone: null,
} as unknown as Contact
const wrapper = ({ children }: { children: ReactNode }) => (
  <ContactEngagementProvider>{children}</ContactEngagementProvider>
)

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({ items: [] })
})

/**
 * #3697.5 — « Préparer mon appel » pour un contact sans numéro : le support oral se prépare quand
 * même, mais le canal Appel n'est offert que sur ce geste explicite.
 */
describe('ContactEngagementProvider — préparer un appel sans numéro (#3697.5)', () => {
  it('avec callPreparation, le panneau s’ouvre sur le canal Appel même sans numéro', () => {
    const { result } = renderHook(() => useContactEngagement(), { wrapper })

    act(() => result.current.openEngagement([noPhone], 'phone', { callPreparation: true }))

    expect(result.current.activeEngagement?.channel).toBe('phone')
    expect(result.current.activeEngagement?.channelsByContactId.c1).toBe('phone')
  })

  it('SAIT DIRE NON — sans le geste explicite, un contact sans numéro retombe sur un canal qu’il a', () => {
    const { result } = renderHook(() => useContactEngagement(), { wrapper })

    act(() => result.current.openEngagement([noPhone], 'phone'))

    expect(result.current.activeEngagement?.channel).toBe('email')
  })
})

/**
 * #3263.46/.48 — les CTA « préparer l'approche » et « créer une introduction » de l'écran
 * Comité d'achat RÉUTILISENT le composeur commun : ils ouvrent l'engagement avec un objectif
 * déjà choisi, jamais un second moteur de rédaction.
 */
describe('ContactEngagementProvider — objectif pré-choisi à l’ouverture (#3263.46/.48)', () => {
  it('openEngagement porte l’objectif demandé jusqu’à l’état actif', () => {
    const { result } = renderHook(() => useContactEngagement(), { wrapper })

    act(() =>
      result.current.openEngagement([withEmail], 'email', {
        initialParameters: { objective: 'introduction', cta: 'demander_intro' },
      }),
    )

    expect(result.current.activeEngagement?.initialParameters).toEqual({
      objective: 'introduction',
      cta: 'demander_intro',
    })
  })

  it('SAIT DIRE NON — sans option, aucun objectif n’est porté', () => {
    const { result } = renderHook(() => useContactEngagement(), { wrapper })

    act(() => result.current.openEngagement([withEmail], 'email'))

    expect(result.current.activeEngagement?.initialParameters).toBeUndefined()
  })
})

/**
 * #3696 (parité démo) — à l'ouverture d'un contact+canal sans fil en mémoire de
 * session, le panneau va lire `message_draft_versions` : un brouillon déjà là
 * (démo ou reprise après rechargement) doit s'afficher sans geste du commercial.
 */
describe('ContactEngagementProvider — lecture du fil persisté à l’ouverture (#3696)', () => {
  it('un fil déjà persisté hydrate le brouillon au premier open, sans écraser une suite restaurée', async () => {
    apiFetch.mockResolvedValueOnce({
      items: [
        {
          id: 'v1',
          contactId: 'c2',
          channel: 'email',
          subject: 'Objet',
          body: 'Version précédente.',
          editedSubject: null,
          editedBody: null,
          usedTemplateSource: null,
          usedTemplateVersion: null,
          usedStyleId: null,
          unchanged: false,
          angle: null,
          createdAt: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 'v2',
          contactId: 'c2',
          channel: 'email',
          subject: 'Objet',
          body: 'Brouillon actuel.',
          editedSubject: null,
          editedBody: null,
          usedTemplateSource: 'Relance',
          usedTemplateVersion: 2,
          usedStyleId: null,
          unchanged: false,
          angle: null,
          createdAt: '2026-10-02T00:00:00.000Z',
        },
      ],
    })
    const { result } = renderHook(() => useContactEngagement(), { wrapper })

    act(() => result.current.openEngagement([withEmail], 'email'))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/contacts/c2/message-draft-versions?channel=email', method: 'GET' }),
    )
    await waitFor(() => expect(result.current.drafts.get('c2:email')?.entries).toHaveLength(2))
    const entries = result.current.drafts.get('c2:email')!.entries
    expect(entries[0]).toMatchObject({ text: 'Version précédente.' })
    expect(entries[1]).toMatchObject({ text: 'Brouillon actuel.', usedTemplate: { source: 'Relance', version: 2 } })
  })

  it('SAIT DIRE NON — sans rien côté serveur, aucun fil n’est posé', async () => {
    apiFetch.mockResolvedValueOnce({ items: [] })
    const { result } = renderHook(() => useContactEngagement(), { wrapper })

    act(() => result.current.openEngagement([withEmail], 'email'))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(result.current.drafts.get('c2:email')).toBeUndefined()
  })
})
