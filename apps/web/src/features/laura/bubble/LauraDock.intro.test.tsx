import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import { LauraDock } from './LauraDock'
import { resetLauraIntro, useAskLauraIntro } from './laura-intro-store'

/**
 * #1812 — LA BULLE REÇOIT L'AMORCE D'UN ÉCRAN, ET NE L'ENVOIE JAMAIS SEULE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * `laura-intro-store.test.tsx` prouve déjà le magasin en isolation ;
 * `LauraIntroBar.test.tsx` prouve déjà la présentation. Ici, on prouve le
 * CÂBLAGE réel dans `LauraDock` : à l'arrivée sur un écran qui a déposé une
 * amorce, le rond devient la ligne agrandie ; cliquer « Envoyer » ouvre le
 * panneau avec la question PRÉ-REMPLIE et — c'est le point non négociable —
 * n'appelle PAS `askLaura`. « Le copilote prépare, le commercial envoie »
 * n'est pas une convention, c'est l'absence de code, ici comme dans
 * `AskLaura.test.tsx`.
 *
 * `askLaura` est mocké pour que ce test puisse AFFIRMER qu'il n'a pas tourné
 * — pas seulement pour éviter un appel réseau réel dans la suite (§
 * `CHAT_DAILY_MESSAGE_LIMIT` : aucun message de test ne doit partir).
 */

vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
const askLauraMock = vi.mocked(askLaura)

/** Le déposant : un `AskLaura` de production ferait la même chose. */
function Depositor({ question, label, accountId }: { question: string; label: string; accountId?: string }) {
  useAskLauraIntro({ question, label, accountId })
  return null
}

afterEach(() => {
  askLauraMock.mockClear()
  resetLauraIntro()
})

describe('LauraDock — la bulle propose l’amorce déposée par l’écran', () => {
  it('s’agrandit sur une ligne à l’arrivée : la phrase est là, le rond ne l’est plus', async () => {
    renderWithRouter(
      <>
        <Depositor question="Prépare une reprise avec ACME." label="Demander à Laura" />
        <LauraDock />
      </>,
    )

    expect(await screen.findByText('Prépare une reprise avec ACME.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /envoyer/i })).toBeInTheDocument()
    // Le rond (« Ouvrir… ») a disparu : les deux ne rendent JAMAIS ensemble.
    expect(screen.queryByRole('button', { name: /ouvrir/i })).not.toBeInTheDocument()
  })

  it('« Envoyer » ouvre la conversation, question PRÉ-REMPLIE — et n’appelle JAMAIS le modèle', async () => {
    renderWithRouter(
      <>
        <Depositor question="Prépare une reprise avec ACME." label="Demander à Laura" />
        <LauraDock />
      </>,
    )
    await screen.findByText('Prépare une reprise avec ACME.')

    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))

    // Le composeur du panneau porte la question, prête à être relue.
    const composer = await screen.findByPlaceholderText(/demande-moi/i)
    expect(composer).toHaveValue('Prépare une reprise avec ACME.')
    // Le point non négociable : rien n'est parti vers le modèle.
    expect(askLauraMock).not.toHaveBeenCalled()
  })

  it('sans amorce déposée, la bulle reste le rond — comportement inchangé', async () => {
    renderWithRouter(<LauraDock />)
    // `findBy*` : le routeur de test résout sa route sur un microtask (voir
    // `renderWithRouter`), comme les deux tests précédents l'attendent déjà
    // via `findByText`.
    expect(await screen.findByRole('button', { name: /ouvrir/i })).toBeInTheDocument()
  })
})
