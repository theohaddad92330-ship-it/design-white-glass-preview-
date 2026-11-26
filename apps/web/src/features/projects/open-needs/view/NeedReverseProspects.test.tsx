import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReverseProspectsResult } from '../api'

/**
 * « Un besoin sans candidat ouvre une piste ».
 *
 * Ce fichier garde trois choses :
 *
 *  1. **une liste vide n'est PAS un échec** — elle le DIT, avec sa raison, et ne
 *     se confond jamais avec « le croisement n'a pas pu tourner » (deux zones
 *     manquantes différentes, deux phrases différentes, ni l'une ni l'autre ne
 *     ressemble à la liste vide « personne d'autre ne cherche »).
 *  2. **un compte déjà au portefeuille se DIT** — jamais présenté comme une
 *     piste neuve muette sur le fait qu'on le connaît déjà.
 *  3. **le geste s'arrête à ouvrir un compte** — un lien, rien de plus.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: { children: React.ReactNode; to: string; params?: Record<string, string> } & Record<string, unknown>) => (
    <a href={`${to}${params ? `/${Object.values(params).join('/')}` : ''}`} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}))

const reverseProspects = vi.fn()
vi.mock('../hooks/useReverseProspects', () => ({ useReverseProspects: () => reverseProspects() }))

const { NeedReverseProspects } = await import('./NeedReverseProspects')

function result(over: Partial<ReverseProspectsResult> = {}): ReverseProspectsResult {
  return {
    needId: 'n-1',
    location: 'Lyon',
    skillTerms: ['Java'],
    unavailableReason: null,
    matches: [],
    ...over,
  }
}

function match(over: Partial<ReverseProspectsResult['matches'][number]> = {}) {
  return {
    need_id: 'n-9',
    need_title: 'Tech lead Java',
    project_id: 'p-9',
    project_label: 'Refonte SI',
    account_id: 'acc-9',
    account_name: 'ACME',
    location: 'Lyon',
    shared_skills: ['Java'],
    already_in_portfolio: false,
    ...over,
  }
}

beforeEach(() => {
  reverseProspects.mockReset()
})

describe('pendant que ça charge', () => {
  it('dit qu’elle regarde, sans rien affirmer', () => {
    reverseProspects.mockReturnValue({ data: undefined, isPending: true, isError: false })
    render(<NeedReverseProspects needId="n-1" />)
    expect(screen.getByText(/Je regarde qui d’autre cherche ce profil/)).toBeInTheDocument()
  })
})

describe('une lecture cassée', () => {
  it('ne rend RIEN — jamais confondue avec « personne d’autre »', () => {
    reverseProspects.mockReturnValue({ data: undefined, isPending: false, isError: true })
    const { container } = render(<NeedReverseProspects needId="n-1" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('le croisement ne peut PAS tourner — et le dit', () => {
  it('sur une zone absente', () => {
    reverseProspects.mockReturnValue({
      data: result({ location: null, unavailableReason: 'location_missing' }),
      isPending: false,
      isError: false,
    })
    render(<NeedReverseProspects needId="n-1" />)
    expect(screen.getByText(/Le lieu n’a pas été communiqué/)).toBeInTheDocument()
    // Distinct de la liste vide : ce n'est pas « personne d'autre ».
    expect(screen.queryByText(/Personne d’autre ne cherche/)).not.toBeInTheDocument()
  })

  it('sur des compétences absentes — une phrase DIFFÉRENTE', () => {
    reverseProspects.mockReturnValue({
      data: result({ skillTerms: [], unavailableReason: 'skills_missing' }),
      isPending: false,
      isError: false,
    })
    render(<NeedReverseProspects needId="n-1" />)
    expect(screen.getByText(/Aucune compétence n’a été typée/)).toBeInTheDocument()
  })
})

describe('le croisement A tourné et n’a trouvé personne', () => {
  it('le DIT — ce n’est pas un échec, c’est une information', () => {
    reverseProspects.mockReturnValue({ data: result({ matches: [] }), isPending: false, isError: false })
    render(<NeedReverseProspects needId="n-1" />)
    expect(screen.getByText(/Personne d’autre ne cherche ce profil dans cette zone/)).toBeInTheDocument()
    // Et pas une des deux phrases « le croisement n'a pas pu tourner ».
    expect(screen.queryByText(/n’a pas été communiqué|n’a été typée/)).not.toBeInTheDocument()
  })
})

describe('le croisement A trouvé des pistes', () => {
  it('montre le compte, et un LIEN pour l’ouvrir — rien de plus', () => {
    reverseProspects.mockReturnValue({
      data: result({ matches: [match()] }),
      isPending: false,
      isError: false,
    })
    render(<NeedReverseProspects needId="n-1" />)
    const link = screen.getByRole('link', { name: /ACME/ })
    expect(link).toHaveAttribute('href', '/accounts/$id/acc-9')
    // Rien d'autre ne s'y clique : pas de bouton d'envoi, pas d'écriture.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('dit la compétence qui justifie le rapprochement', () => {
    reverseProspects.mockReturnValue({
      data: result({ matches: [match({ shared_skills: ['Java', 'Kubernetes'] })] }),
      isPending: false,
      isError: false,
    })
    render(<NeedReverseProspects needId="n-1" />)
    expect(screen.getByText(/Java.*Kubernetes/)).toBeInTheDocument()
  })

  it('DIT quand le compte est déjà au portefeuille — jamais silencieuse dessus', () => {
    reverseProspects.mockReturnValue({
      data: result({ matches: [match({ already_in_portfolio: true })] }),
      isPending: false,
      isError: false,
    })
    render(<NeedReverseProspects needId="n-1" />)
    expect(screen.getByText('Déjà à ton portefeuille')).toBeInTheDocument()
  })

  it('ne dit RIEN de tel pour une vraie piste neuve', () => {
    reverseProspects.mockReturnValue({
      data: result({ matches: [match({ already_in_portfolio: false })] }),
      isPending: false,
      isError: false,
    })
    render(<NeedReverseProspects needId="n-1" />)
    expect(screen.queryByText('Déjà à ton portefeuille')).not.toBeInTheDocument()
  })
})
