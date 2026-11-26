import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScopeChangeNotice } from './ScopeChangeNotice'
import { NO_ACCOUNT_SCOPE, PORTFOLIO_SCOPE, type ChatScope } from './chat-scope'

/**
 * #1951.17 / #1951.18 / #1951.21 — CE QUE L'ÉCRAN DIT QUAND LE PÉRIMÈTRE CHANGE.
 *
 * L'incident #1779 : un client choisit « Sans compte », reçoit une réponse
 * appuyée sur deux comptes, et rien à l'écran ne lui a dit que le périmètre
 * avait bougé. Le bouton de portée dit ce qu'on lit MAINTENANT ; il ne dit pas
 * qu'on vient d'en changer, ni d'où l'on vient.
 */

const ACME: ChatScope = { kind: 'account', accountId: 'a-acme' }
const SOPHIE: ChatScope = { kind: 'contact', contactId: 'c-sophie', label: 'Sophie Martin · LATÉCOÈRE' }
const accounts = [
  {
    id: 'a-acme',
    companyName: 'ACME Industries',
    priorityScore: null,
    logoUrl: null,
    website: null,
    state: null,
    conversationCount: 0,
    active: true,
  },
]

describe('ScopeChangeNotice — jamais un changement en silence', () => {
  it('nomme le périmètre d’AVANT et celui d’APRÈS', () => {
    render(
      <ScopeChangeNotice
        change={{ from: ACME, to: SOPHIE }}
        previous={ACME}
        accounts={accounts}
        onReturn={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('ACME Industries')
    expect(notice).toHaveTextContent('Sophie Martin · LATÉCOÈRE')
  })

  it('n’affiche RIEN quand rien n’a changé — une annonce sans changement est du bruit', () => {
    const { container } = render(
      <ScopeChangeNotice change={null} previous={ACME} accounts={accounts} onReturn={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('#1951.21 — propose de REVENIR au périmètre précédent, nommé', async () => {
    const onReturn = vi.fn()
    render(
      <ScopeChangeNotice
        change={{ from: ACME, to: SOPHIE }}
        previous={ACME}
        accounts={accounts}
        onReturn={onReturn}
        onDismiss={vi.fn()}
      />,
    )
    const back = screen.getByRole('button', { name: /ACME Industries/ })
    await userEvent.click(back)
    expect(onReturn).toHaveBeenCalledTimes(1)
  })

  it('aucun bouton « revenir » quand il n’y a nulle part où revenir', () => {
    render(
      <ScopeChangeNotice
        change={{ from: PORTFOLIO_SCOPE, to: NO_ACCOUNT_SCOPE }}
        previous={null}
        accounts={accounts}
        onReturn={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    // L'annonce reste — c'est elle qui tient #1951.17 ; seul le retour disparaît.
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /revenir/i })).not.toBeInTheDocument()
  })

  it('se referme sans changer de périmètre — l’annonce n’est pas un piège', async () => {
    const onDismiss = vi.fn()
    const onReturn = vi.fn()
    render(
      <ScopeChangeNotice
        change={{ from: ACME, to: SOPHIE }}
        previous={ACME}
        accounts={accounts}
        onReturn={onReturn}
        onDismiss={onDismiss}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /masquer/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onReturn).not.toHaveBeenCalled()
  })
})
