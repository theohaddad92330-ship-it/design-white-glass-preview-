import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeepenQuote } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { DeepenActions } from './DeepenActions'

const deepenQuote = vi.hoisted(() => vi.fn())
const refreshDimension = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/accounts/api')>()
  return {
    ...actual,
    accountsApi: {
      ...actual.accountsApi,
      deepenQuote: (...args: unknown[]) => deepenQuote(...args),
      refreshDimension: (...args: unknown[]) => refreshDimension(...args),
    },
  }
})

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const SINCE = new Date('2026-09-22T10:00:00.000Z')
const fresh = { signals: null, contacts: null, entities: null, strategy: null }

function quote(over: Partial<DeepenQuote> = {}): DeepenQuote {
  return {
    lines: [
      {
        accountId: A,
        dimension: 'signals',
        name: 'Acme',
        status: 'reuse',
        cost: 0,
        refreshedAt: '2026-09-22T09:00:00Z',
      },
      { accountId: A, dimension: 'contacts', name: 'Acme', status: 'run', cost: 1, refreshedAt: null },
    ],
    alreadyInvested: 2,
    delta: 4,
    remaining: 10,
    sufficient: true,
    accounts: [{ accountId: A, name: 'Acme', hasDossier: true, invested: 2, freshness: fresh }],
    ...over,
  }
}

function renderIt(content: string, fallbackAccountId: string | null = null, open = true) {
  return render(
    <I18nextProvider i18n={i18n}>
      <DeepenActions content={content} fallbackAccountId={fallbackAccountId} since={SINCE} open={open} />
    </I18nextProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  deepenQuote.mockReset()
  refreshDimension.mockReset()
})

describe('#2452.3 — des actions d’approfondissement SOUS une réponse qui cite des comptes', () => {
  it('une réponse sans compte cité ne rend RIEN', () => {
    const { container } = renderIt('Voici une réponse générale.')
    expect(container).toBeEmptyDOMElement()
  })

  it('les sept actions, dont « les cinq premiers » quand la réponse cite plusieurs comptes', async () => {
    deepenQuote.mockResolvedValue(quote())
    renderIt(`[Acme](/accounts/${A}) et [Beta](/accounts/${B})`)
    const group = screen.getByRole('group', { name: /approfondir/i })
    for (const label of [
      /vérifier maintenant/i,
      /approfondir cette réponse/i,
      /approfondir les cinq premiers/i,
      /actualiser uniquement les contacts/i,
      /comparer les filiales/i,
      /chercher les voies d’accès/i,
      /construire le dossier complet/i,
    ]) {
      expect(within(group).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('un fil scopé à un compte propose aussi l’approfondissement, sans lien dans le texte', async () => {
    deepenQuote.mockResolvedValue(quote())
    renderIt('Réponse sans lien.', A)
    expect(screen.getByRole('group', { name: /approfondir/i })).toBeInTheDocument()
  })

  // #5032.12 — le repli et son bouton sont retirés : le panneau ne s'ouvre que depuis le pied (`open`).
  it('fermé (open=false), il ne rend RIEN — plus aucun bouton « Aller plus loin »', () => {
    const { container } = renderIt(`[Acme](/accounts/${A})`, null, false)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: /aller plus loin/i })).toBeNull()
  })
})

describe('#2452.5 — le coût déjà payé et le DELTA seulement, avant de lancer', () => {
  it('#4463 — le devis d’approfondissement ne chiffre AUCUN crédit : ni investis, ni supplémentaires, ni total', async () => {
    deepenQuote.mockResolvedValue(quote())
    renderIt(`[Acme](/accounts/${A})`)
    await userEvent.click(screen.getByRole('button', { name: /construire le dossier complet/i }))
    // Le devis est bien affiché (le bouton de lancement est là) mais sans aucun chiffre de crédit.
    expect(await screen.findByRole('button', { name: /lancer l’approfondissement/i })).toBeInTheDocument()
    expect(screen.queryByText(/crédit|réutilisés|supplémentaires/i)).not.toBeInTheDocument()
    // Rien n'est lancé avant le clic de confirmation.
    expect(refreshDimension).not.toHaveBeenCalled()
  })

  it('tout déjà à jour : rien à relancer, pas de bouton de lancement', async () => {
    deepenQuote.mockResolvedValue(quote({ delta: 0, lines: [quote().lines[0]!] }))
    renderIt(`[Acme](/accounts/${A})`)
    await userEvent.click(screen.getByRole('button', { name: /vérifier maintenant/i }))
    expect(await screen.findByText(/rien à relancer/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lancer l’approfondissement/i })).not.toBeInTheDocument()
  })
})

describe('#2452.4 / #2452.2 — ne relancer que le delta, un double clic ne relance rien deux fois', () => {
  it('seules les lignes « run » partent, une seule fois même sur double clic', async () => {
    deepenQuote.mockResolvedValue(quote())
    let release: () => void = () => {}
    refreshDimension.mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve({ dimension: 'contacts', remaining: 9 })
        }),
    )
    renderIt(`[Acme](/accounts/${A})`)
    await userEvent.click(screen.getByRole('button', { name: /construire le dossier complet/i }))
    const launch = await screen.findByRole('button', { name: /lancer l’approfondissement/i })
    await userEvent.dblClick(launch)
    expect(refreshDimension).toHaveBeenCalledTimes(1)
    expect(refreshDimension).toHaveBeenCalledWith(A, 'contacts')
    release()
    // #4463 — le coût supplémentaire ne se lit plus ; le double clic n'a lancé qu'une fois.
    await waitFor(() => expect(refreshDimension).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/crédit|coût supplémentaire/i)).not.toBeInTheDocument()
  })
})

describe('#2452.6 — ce qui a changé (et plus son coût, #4463)', () => {
  it('résume changé / non mesuré, sans coût', async () => {
    deepenQuote.mockResolvedValue(
      quote({
        lines: [
          { accountId: A, dimension: 'entities', name: 'Acme', status: 'run', cost: 1, refreshedAt: null },
          { accountId: A, dimension: 'contacts', name: 'Acme', status: 'run', cost: 1, refreshedAt: null },
        ],
      }),
    )
    refreshDimension.mockImplementation(async (_id: string, dimension: string) => ({
      dimension,
      remaining: 8,
      diff: {
        newFacts: [],
        changedFacts: dimension === 'entities' ? [{ key: 'hq', label: 'Siège', before: 'Paris', after: 'Lyon' }] : [],
        obsoleteFacts: [],
        expiredSignals: [],
        unmeasured: dimension === 'contacts' ? ['contacts'] : [],
      },
    }))
    renderIt(`[Acme](/accounts/${A})`)
    await userEvent.click(screen.getByRole('button', { name: /construire le dossier complet/i }))
    await userEvent.click(await screen.findByRole('button', { name: /lancer l’approfondissement/i }))
    expect(await screen.findByText('Changé : Siège')).toBeInTheDocument()
    expect(screen.getByText('Non mesuré par cet axe : Contacts')).toBeInTheDocument()
    expect(screen.queryByText(/crédit|Coût supplémentaire/i)).not.toBeInTheDocument()
  })
})

describe('#2452.7 — rapide, vérifié, approfondi : un même travail', () => {
  it('l’étape atteinte se lit sur la fraîcheur postérieure à la réponse', async () => {
    deepenQuote.mockResolvedValue(
      quote({
        accounts: [
          {
            accountId: A,
            name: 'Acme',
            hasDossier: true,
            invested: 2,
            freshness: { ...fresh, signals: '2026-09-22T11:00:00.000Z' },
          },
        ],
      }),
    )
    renderIt(`[Acme](/accounts/${A})`)
    const steps = await screen.findByRole('list', { name: /étapes de ce travail/i })
    await waitFor(() =>
      expect(within(steps).getByText('Vérifié').closest('li')).toHaveAttribute('aria-current', 'step'),
    )
  })
})
