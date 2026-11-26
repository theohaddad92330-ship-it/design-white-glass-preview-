import type { Contact } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetLauraPageContext, useCurrentLauraContext } from '@/features/laura/bubble/page-context-store'
import { AccountDetailPage } from './AccountDetailPage'

/**
 * #4099 (jumeau, recette prod 14/10, Sanofi) — le panneau Laura disait « Contacts affichés :
 * 2610 » (tous les contacts du compte) pendant que la fiche disait « 16 contacts clés »
 * (TabOverview, déjà corrigé par #4099 le 13/10) : CE facet comptait `contacts.length`, pas les
 * contacts PERTINENTS. Même patron que `MissionDossierPage.test.tsx` — on rend l'écran RÉEL et
 * on lit ce qu'il publie à la bulle, jamais la fonction en isolation.
 */
const useCurrentContact = vi.hoisted(() => vi.fn())
vi.mock('./useCurrentContact', () => ({ useCurrentContact }))

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// #4459.2 — la provenance CRM se lit par le réseau ; ce test ne regarde que le contexte déclaré à Laura.
vi.mock('@/features/crm/hooks/useAccountCrmProvenance', () => ({
  AccountCrmProvenanceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/accounts/view/account-detail/components/AccountDetailPageContent', () => ({
  AccountDetailPageContent: () => <div>dossier</div>,
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ id: ACCOUNT_ID }),
}))

// `entityId` est validé comme UUID par `lauraPageContextSchema` : un id de test
// lisible (« acc-sanofi ») ferait échouer le schéma en silence et rendrait
// `useCurrentLauraContext()` null, quel que soit le comportement de l'écran.
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function contact(lifecycle_state: Contact['lifecycle_state']): Contact {
  return { id: `c-${Math.random()}`, lifecycle_state } as Contact
}

function LauraContextReader() {
  const context = useCurrentLauraContext()
  return <span data-testid="laura-context">{context ? JSON.stringify(context) : 'rien'}</span>
}

function published() {
  return JSON.parse(screen.getByTestId('laura-context').textContent ?? 'null')
}

beforeEach(() => {
  cleanup()
  useCurrentContact.mockReset()
  resetLauraPageContext()
})

afterEach(() => {
  resetLauraPageContext()
})

describe('AccountDetailPage — le facet « Contacts affichés » déclaré à Laura', () => {
  it('#4099 — compte les contacts PERTINENTS (qualifiés ou au-delà), jamais le total détecté', () => {
    useCurrentContact.mockReturnValue({
      account: { id: ACCOUNT_ID, company_name: 'Sanofi' },
      // 2610 détectés, dont seulement 2 qualifiés — « 16 contacts clés » dans l'exemple réel,
      // réduit ici à un petit jeu pour ne pas fabriquer 2610 objets.
      contacts: [
        ...Array.from({ length: 2608 }, () => contact('detecte')),
        contact('qualifie'),
        contact('actionnable'),
      ],
      loading: false,
      error: null,
    })
    render(
      <>
        <AccountDetailPage />
        <LauraContextReader />
      </>,
    )
    expect(published().facets).toEqual([{ label: 'Contacts affichés', value: '2' }])
  })

  it('aucun contact pertinent ⇒ le facet disparaît, jamais un « 0 »', () => {
    useCurrentContact.mockReturnValue({
      account: { id: ACCOUNT_ID, company_name: 'Sanofi' },
      contacts: [contact('detecte'), contact('identite_verifiee')],
      loading: false,
      error: null,
    })
    render(
      <>
        <AccountDetailPage />
        <LauraContextReader />
      </>,
    )
    expect(published().facets).toEqual([])
  })

  it('en chargement : aucun facet, jamais un compte deviné', () => {
    useCurrentContact.mockReturnValue({ account: null, contacts: [], loading: true, error: null })
    render(
      <>
        <AccountDetailPage />
        <LauraContextReader />
      </>,
    )
    expect(published().state).toBe('loading')
    expect(published().facets).toEqual([])
  })
})
