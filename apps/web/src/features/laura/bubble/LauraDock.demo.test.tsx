import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import { demoTurn } from '@/features/chat/api/demo-turn'
import { i18n } from '@/i18n'
import { LauraDock } from './LauraDock'

/**
 * #1942.2 / #1942.12 — LA BULLE N'APPELLE AUCUN MODÈLE EN SALLE DE DÉMONSTRATION.
 *
 * `LauraDock` est monté GLOBALEMENT (`routes/__root.tsx`) : il est donc ouvert
 * dans la salle publique, dont le lien part à des inconnus. L'écran `/chat`
 * bascule depuis #1320 sur son moteur préparé (`demo-turn.ts`, zéro réseau) ;
 * la bulle, elle, envoyait chaque message à `POST /ia/chat` — un vrai appel de
 * modèle, facturé, sur un espace que personne ne surveille, et sans plafond
 * puisque le plafond quotidien rend `unbounded` en démonstration.
 *
 * Ce que cette suite sait dire :
 *  · NON — en démonstration, `askLaura` (la seule porte réseau, GA-237) n'est
 *    jamais appelée, que la question soit préparée ou non ;
 *  · et l'écran ne montre ni erreur ni vide : une question préparée reçoit SA
 *    réponse, une question hors script reçoit la phrase qui dit pourquoi ;
 *  · et pas plus — hors démonstration, l'appel part exactement comme avant.
 *
 * La garde qui TIENT est côté serveur (`chat-demo-guard.spec.ts`) : un client se
 * contourne. Celle-ci tient ce qu'un prospect VOIT.
 */

vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
const askLauraMock = vi.mocked(askLaura)

const demoFlag = { current: false }
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demoFlag.current }))

afterEach(() => {
  askLauraMock.mockReset()
  demoFlag.current = false
})

/** Une des questions écrites d'avance pour la salle (`demo-chat-script.ts`). */
const PREPARED = 'Quels signaux justifient de prioriser Thales ?'

async function ask(question: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
  fireEvent.change(await screen.findByPlaceholderText(/demande-moi/i), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
}

describe('LauraDock — la bulle en salle de démonstration', () => {
  it('une question PRÉPARÉE reçoit sa réponse écrite d’avance, sans aucun appel réseau', async () => {
    demoFlag.current = true
    askLauraMock.mockResolvedValue({ reply: 'RÉPONSE DU MODÈLE' })
    const { container } = renderWithRouter(<LauraDock />)

    await ask(PREPARED)

    const prepared = demoTurn(PREPARED, '').reply
    await waitFor(() => expect(container.textContent).toContain(prepared.split('\n')[0]))
    // La promesse qui compte : aucun appel de modèle facturé.
    expect(askLauraMock).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('RÉPONSE DU MODÈLE')
  })

  it('une question HORS SCRIPT dit pourquoi — ni erreur, ni bulle vide, ni paragraphe inventé', async () => {
    demoFlag.current = true
    askLauraMock.mockResolvedValue({ reply: 'RÉPONSE DU MODÈLE' })
    const { container } = renderWithRouter(<LauraDock />)

    await ask('Combien Thales facture-t-il ses prestataires en 2027 ?')

    const explained = i18n.t('demo.offScript', { ns: 'lauraBubble' })
    await waitFor(() => expect(container.textContent).toContain(explained))
    expect(askLauraMock).not.toHaveBeenCalled()
    // Ni le filet d'erreur de la bulle, ni sa phrase de réponse absente.
    expect(container.textContent).not.toContain(i18n.t('messages.connectionError', { ns: 'chat' }))
    expect(container.textContent).not.toContain(i18n.t('messages.noReply', { ns: 'chat' }))
  })

  it('hors démonstration, rien ne change : la question part vers le serveur', async () => {
    askLauraMock.mockResolvedValue({ reply: 'RÉPONSE DU MODÈLE' })
    const { container } = renderWithRouter(<LauraDock />)

    await ask(PREPARED)

    await waitFor(() => expect(container.textContent).toContain('RÉPONSE DU MODÈLE'))
    expect(askLauraMock).toHaveBeenCalledTimes(1)
    expect(askLauraMock.mock.calls[0]?.[0]).toMatchObject({ message: PREPARED })
  })
})
