import type { Account } from '@bellum/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { i18n } from '@/i18n'
import { AccountDetailHeroNextAction } from './AccountDetailHeroNextAction'

/**
 * #2117.27 — LA PROCHAINE ACTION, NOMMÉE.
 *
 * La phrase a quitté la rangée d'actions du hero le 14/09/2026 (elle y fixait
 * une largeur plancher de 1 628 px et écrasait la colonne d'identité à 0 px).
 * Ces tests prouvent qu'en déménageant elle n'a rien perdu : elle s'affiche
 * quand il y a une action, elle se tait quand il n'y en a pas, et elle porte le
 * texte complet au survol maintenant qu'elle se tronque.
 */
const { meeting } = vi.hoisted(() => ({ meeting: vi.fn() }))
vi.mock('./useAccountNextMeeting', () => ({ useAccountNextMeeting: () => meeting() }))

const base = {
  id: '00000000-0000-0000-0000-0000000000aa',
  company_name: 'ACME Corp',
  website: null,
  siren: null,
  status: 'completed',
  commercial_status: 'opportunity',
  priority_gate: 'prioritised',
  raw_analysis: null,
} as unknown as Account

function renderNextAction(overrides: Partial<Account> = {}) {
  return renderWithRouter(
    <AccountDetailHeroNextAction account={{ ...base, ...overrides } as Account} />,
    '/accounts/test-id',
  )
}

beforeEach(async () => {
  meeting.mockReset().mockReturnValue(null)
  await i18n.changeLanguage('fr')
})

describe('AccountDetailHeroNextAction — la prochaine action, nommée, sur sa propre ligne', () => {
  it('#2117.27 — un plan actif NOMME l’action qu’on continue', async () => {
    renderNextAction({ raw_analysis: { immediate_action: 'Appeler le DSI' } })

    expect(await screen.findByText(/Appeler le DSI/)).toBeInTheDocument()
  })

  it('sans prochaine action, la ligne n’existe pas — jamais une phrase vide', () => {
    // « Prochaine action : » sans action est pire qu'un silence : il annonce
    // une information et n'en donne aucune.
    const { container } = renderNextAction()

    expect(container.textContent).toBe('')
  })

  it('une porte « mis de côté » ne nomme rien : la décision passe devant le plan', () => {
    // `heroPrimaryAction` ne rend `nextActionLabel` que sur l'état `plan-active`.
    // Un compte mis de côté est en veille — lui rappeler son plan contredirait
    // la décision qu'on vient de prendre sur lui.
    const { container } = renderNextAction({
      priority_gate: 'parked',
      raw_analysis: { immediate_action: 'Appeler le DSI' },
    })

    expect(container.textContent).toBe('')
  })

  /**
   * #2117.80 — recette 23/09, prod 7e7105fb7 : sur MP GEMS (compte pauvre,
   * `watching`), aucune phrase ne disait « rien à suggérer » sans descendre
   * ~700px jusqu'à la carte « Prochaine action ». Compris en <5s doit valoir
   * pour un compte pauvre aussi.
   */
  it('#2117.80 — un compte pauvre EN VEILLE (sans prochaine action) dit « Aucune action suggérée »', async () => {
    renderNextAction({ commercial_status: 'watching', raw_analysis: null })

    expect(await screen.findByText('Aucune action suggérée pour l’instant')).toBeInTheDocument()
  })

  it('#2117.80 — un compte MIS DE CÔTÉ reste muet, même sans prochaine action : ce n’est pas une absence', () => {
    // Contrairement à « en observation », `parked` est une DÉCISION humaine :
    // elle peut cacher une action existante, ignorée par choix.
    const { container } = renderNextAction({ priority_gate: 'parked', raw_analysis: null })

    expect(container.textContent).toBe('')
  })

  it('la phrase se tronque, donc elle rend son texte COMPLET au survol', async () => {
    // Elle est maintenant bornée par la largeur de la carte (c'est tout
    // l'intérêt d'être sortie d'un conteneur `shrink-0`, où la troncature
    // n'avait aucune borne à mesurer). Ce qui est coupé doit rester lisible.
    const longue = 'Appeler le DSI pour caler la revue trimestrielle du socle applicatif et du plan de migration'
    renderNextAction({ raw_analysis: { immediate_action: longue } })

    const ligne = await screen.findByText(new RegExp(longue.slice(0, 30)))
    expect(ligne.className).toContain('truncate')
    expect(ligne.getAttribute('title')).toContain(longue)
  })

  it('#4320.1 — la phrase est cliquable et mène à l’action (onglet Plan)', async () => {
    const onTabChange = vi.fn()
    renderWithRouter(
      <AccountDetailHeroNextAction
        account={{ ...base, raw_analysis: { immediate_action: 'Appeler le DSI' } } as Account}
        onTabChange={onTabChange}
      />,
      '/accounts/test-id',
    )

    fireEvent.click(await screen.findByRole('button', { name: /Appeler le DSI/ }))

    expect(onTabChange).toHaveBeenCalledWith('plan')
  })
})
