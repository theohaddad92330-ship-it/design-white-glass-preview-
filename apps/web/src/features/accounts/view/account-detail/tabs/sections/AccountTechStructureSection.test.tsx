import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountTechStructure } from '@/features/accounts/api'

/**
 * #4742 — LA STRUCTURE TECHNIQUE, DANS LE DOSSIER DU COMPTE.
 *
 * `GET /accounts/:id/tech-structure` existait sans appelant. Cette suite garde
 * ce que l'écran DOIT dire : les technologies rangées par axe avec leur preuve
 * datée et son lien, l'axe non observé NOMMÉ (jamais « 0 », jamais absent), et
 * une panne qui se DIT — jamais une donnée inventée.
 */

type QueryState = { data?: AccountTechStructure; isPending: boolean; isError: boolean }
const state: { current: QueryState; accountId: string | undefined } = {
  current: { data: undefined, isPending: true, isError: false },
  accountId: undefined,
}

vi.mock('@/features/accounts/hooks/useAccountTechStructure', () => ({
  useAccountTechStructure: (accountId: string | undefined) => {
    state.accountId = accountId
    return state.current
  },
}))

const { AccountTechStructureSection } = await import('./AccountTechStructureSection')

const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

const SNCF_LIKE: AccountTechStructure = {
  axes: [
    { axis: 'crm', status: 'not_observed', technologies: [] },
    {
      axis: 'erp',
      status: 'observed',
      technologies: [
        {
          name: 'SAP',
          proofs: [
            {
              kind: 'job_offer',
              observed_at: '2026-10-02',
              url: 'https://example.org/demo/offre-sap',
              label: 'Consultant SAP S/4HANA',
            },
          ],
        },
      ],
    },
    { axis: 'data', status: 'not_observed', technologies: [] },
    {
      axis: 'hosting',
      status: 'observed',
      technologies: [
        { name: 'Azure', proofs: [{ kind: 'analysis', observed_at: '2026-10-01', url: null, label: null }] },
      ],
    },
    { axis: 'business', status: 'not_observed', technologies: [] },
  ],
  observed_axes: ['erp', 'hosting'],
  not_observed_axes: ['crm', 'data', 'business'],
}

afterEach(() => {
  cleanup()
  state.current = { data: undefined, isPending: true, isError: false }
})

describe('#4742 — le dossier montre la structure technique', () => {
  it('lit la route pour CE compte, sans second geste', () => {
    state.current = { data: SNCF_LIKE, isPending: false, isError: false }
    render(<AccountTechStructureSection accountId={ACCOUNT_ID} />)
    expect(state.accountId).toBe(ACCOUNT_ID)
  })

  it('montre chaque technologie avec sa preuve datée et son lien', () => {
    state.current = { data: SNCF_LIKE, isPending: false, isError: false }
    render(<AccountTechStructureSection accountId={ACCOUNT_ID} />)

    const erp = screen.getByTestId('tech-axis-erp')
    expect(within(erp).getByText('SAP')).toBeTruthy()
    const link = within(erp).getByRole('link', { name: /Consultant SAP S\/4HANA/ })
    expect(link.getAttribute('href')).toBe('https://example.org/demo/offre-sap')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(within(erp).getByText(/2026/)).toBeTruthy()
  })

  it('une preuve sans lien reste une preuve datée, sans lien inventé', () => {
    state.current = { data: SNCF_LIKE, isPending: false, isError: false }
    render(<AccountTechStructureSection accountId={ACCOUNT_ID} />)
    const hosting = screen.getByTestId('tech-axis-hosting')
    expect(within(hosting).getByText('Azure')).toBeTruthy()
    expect(within(hosting).queryByRole('link')).toBeNull()
  })

  it('NOMME l’axe non observé (le CRM), jamais « 0 », jamais absent — et sans ligne vide par axe', () => {
    state.current = { data: SNCF_LIKE, isPending: false, isError: false }
    render(<AccountTechStructureSection accountId={ACCOUNT_ID} />)

    const notObserved = screen.getByTestId('tech-not-observed')
    expect(notObserved.textContent).toMatch(/CRM/)
    expect(notObserved.textContent).toMatch(/Données/)
    expect(notObserved.textContent).toMatch(/Outils métier/)
    expect(screen.queryByTestId('tech-axis-crm')).toBeNull()
    expect(screen.getByTestId('tech-structure-section').textContent).not.toMatch(/\b0\b|%/)
  })

  it('nomme un fournisseur nulle part et ne chiffre aucune couverture', () => {
    state.current = { data: SNCF_LIKE, isPending: false, isError: false }
    render(<AccountTechStructureSection accountId={ACCOUNT_ID} />)
    expect(screen.getByTestId('tech-structure-section').textContent).not.toMatch(/apollo|firecrawl|brave|pappers/i)
  })

  it('aucun axe observé : la section le dit et NOMME les cinq axes', () => {
    state.current = {
      data: {
        axes: ['crm', 'erp', 'data', 'hosting', 'business'].map(axis => ({
          axis: axis as AccountTechStructure['axes'][number]['axis'],
          status: 'not_observed' as const,
          technologies: [],
        })),
        observed_axes: [],
        not_observed_axes: ['crm', 'erp', 'data', 'hosting', 'business'],
      },
      isPending: false,
      isError: false,
    }
    render(<AccountTechStructureSection accountId={ACCOUNT_ID} />)
    const notObserved = screen.getByTestId('tech-not-observed')
    for (const label of ['CRM', 'ERP', 'Données', 'Hébergement', 'Outils métier']) {
      expect(notObserved.textContent).toContain(label)
    }
  })

  it('chargement : pas de verdict', () => {
    render(<AccountTechStructureSection accountId={ACCOUNT_ID} />)
    expect(screen.getByText('Lecture en cours…')).toBeTruthy()
    expect(screen.queryByTestId('tech-not-observed')).toBeNull()
  })

  it('erreur de l’API : une erreur claire, aucune technologie, aucun axe « non observé » deviné', () => {
    state.current = { data: undefined, isPending: false, isError: true }
    render(<AccountTechStructureSection accountId={ACCOUNT_ID} />)
    expect(screen.getByRole('alert').textContent).toMatch(/indisponible/i)
    expect(screen.queryByTestId('tech-not-observed')).toBeNull()
    expect(screen.queryByTestId('tech-axis-erp')).toBeNull()
  })
})
