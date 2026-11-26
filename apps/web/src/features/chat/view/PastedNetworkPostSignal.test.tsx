/**
 * #3924 (chantier distinct de l'issue) — « coller le texte ou l'URL d'un post
 * LinkedIn » DANS LAURA. Le commercial colle le lien d'un post dans le fil d'un
 * compte : sa bulle offre « Ajouter ce post comme signal du compte », qui ouvre
 * le MÊME formulaire que la fiche compte (#2634.1), pré-rempli, et rien ne
 * s'écrit sans son clic. Laura n'écrit rien seule ; aucun appel à LinkedIn.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PastedNetworkPostSignal, linkedInPostOf } from './PastedNetworkPostSignal'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const declareSignals = vi.fn()
vi.mock('@/features/accounts/api', () => ({
  accountsApi: { declareSignals: (...args: unknown[]) => declareSignals(...args) },
  accountKeys: { detail: (id: string) => ['account', id] },
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => declareSignals.mockReset())

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const POST = 'https://www.linkedin.com/posts/jdupont_cloud-activity-7250000000000000000-AbCd'

describe('linkedInPostOf (#3924)', () => {
  it('extrait le lien d’un post et le texte qui l’entoure', () => {
    expect(linkedInPostOf(`Ils recrutent 3 devs Java ${POST}`)).toEqual({
      url: POST,
      note: 'Ils recrutent 3 devs Java',
    })
  })

  it('reconnaît un post partagé (feed/update) et une annonce (jobs/view)', () => {
    expect(linkedInPostOf('https://linkedin.com/feed/update/urn:li:activity:725')?.url).toBe(
      'https://linkedin.com/feed/update/urn:li:activity:725',
    )
    expect(linkedInPostOf('https://fr.linkedin.com/jobs/view/4012345678')?.url).toBe(
      'https://fr.linkedin.com/jobs/view/4012345678',
    )
  })

  it('dit NON à un profil, à un autre site, ou à un texte sans lien', () => {
    expect(linkedInPostOf('https://www.linkedin.com/in/jdupont')).toBeNull()
    expect(linkedInPostOf('https://evil.example/linkedin.com/posts/x')).toBeNull()
    expect(linkedInPostOf('https://notlinkedin.com/posts/x')).toBeNull()
    expect(linkedInPostOf('Ils recrutent 3 devs Java')).toBeNull()
  })
})

describe('PastedNetworkPostSignal (#3924)', () => {
  it('ne rend rien hors d’un fil de compte — aucun compte où écrire', () => {
    const { container } = wrap(<PastedNetworkPostSignal accountId={null} content={POST} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien quand la question ne porte aucun post LinkedIn', () => {
    const { container } = wrap(<PastedNetworkPostSignal accountId="acc-1" content="Résume ce compte" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('pré-remplit le formulaire, et ne déclare qu’au clic du commercial', async () => {
    declareSignals.mockResolvedValue({ added: 1 })
    wrap(<PastedNetworkPostSignal accountId="acc-1" content={`Ils recrutent 3 devs Java ${POST}`} />)
    expect(declareSignals).not.toHaveBeenCalled()

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByRole('button', { name: 'Ajouter ce post comme signal du compte' }))
    expect(screen.getByLabelText('URL du post ou de l’annonce')).toHaveValue(POST)
    expect(screen.getByLabelText('Texte copié depuis LinkedIn')).toHaveValue('Ils recrutent 3 devs Java')
    expect(declareSignals).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Déclarer ce signal' }))
    await vi.waitFor(() =>
      expect(declareSignals).toHaveBeenCalledWith('acc-1', {
        source: 'LinkedIn',
        entryKind: 'manual',
        signals: [{ label: `Ils recrutent 3 devs Java — ${POST}` }],
      }),
    )
  })
})
