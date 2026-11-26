import type { Account } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

/**
 * #1818.2 — LE LOGO DU PARTENAIRE, RÉUTILISANT `CompanyAvatar`.
 *
 * La règle d'ambiguïté (deux comptes homonymes → aucun logo) est tenue côté
 * serveur et prouvée dans `partners.service.spec.ts` — c'est là qu'elle DOIT
 * vivre, avec les données qui la rendent vraie. Cet écran-ci n'a qu'un
 * contrat plus modeste à tenir : brancher `partner.logo_url`/`partner.website`
 * sur `CompanyAvatar`, jamais les deviner, et retomber sur l'initiale quand le
 * serveur ne les rend pas — exactement le cas d'une ligne ambiguë ou sans
 * correspondance, que le serveur exprime en omettant les deux champs.
 *
 * Comme `company-lists-show-logos.test.tsx` : on n'attend pas de balise
 * `<img>`, `AvatarImage` (Radix) ne la monte qu'une fois l'image chargée, ce
 * qui n'arrive jamais sous jsdom. On espionne `companyLogoSrc`, la fonction
 * que `CompanyAvatar` appelle pour construire l'URL relayée.
 */

let landscape: Record<string, unknown> = {}

vi.mock('@/lib/api', () => ({ apiFetch: () => Promise.resolve(landscape) }))

const logoRequests: Array<[unknown, unknown]> = []
vi.mock('@/lib/company-logo', () => ({
  companyLogoSrc: (logoUrl: unknown, website: unknown) => {
    logoRequests.push([logoUrl, website])
    return logoUrl || website ? 'https://api.example/logo?src=capgemini' : null
  },
}))

let seq = 0
const nextAccount = () => ({ id: `a-logo-${++seq}`, company_name: 'ROCHE' }) as Account
const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'Capgemini',
  rank: 'rank1',
  relationship: 'partner',
  note: null,
  source: 'declared',
  placements: 0,
  certainty: null,
  scope: null,
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  ...over,
})

beforeEach(() => {
  cleanup()
  logoRequests.length = 0
  landscape = { partners: [], recommendations: [], observed: [] }
})

describe('TabPartners — le logo du partenaire (#1818.2)', () => {
  it('un compte apparié SANS AMBIGUÏTÉ (logo_url rendu par le serveur) est demandé sur la carte', async () => {
    landscape = {
      partners: [partner({ logo_url: 'https://logo.example/capgemini.png', website: null })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByText('Capgemini')
    expect(logoRequests).toContainEqual(['https://logo.example/capgemini.png', null])
  })

  it('la modale de détail porte le MÊME logo — un seul rendu, jamais un second', async () => {
    landscape = {
      partners: [partner({ logo_url: 'https://logo.example/capgemini.png', website: null })],
      recommendations: [],
      observed: [],
    }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    logoRequests.length = 0
    await user.click(await screen.findByRole('button', { name: /Voir le détail de Capgemini/i }))

    expect(logoRequests).toContainEqual(['https://logo.example/capgemini.png', null])
  })

  it('aucun logo rendu par le serveur (aucun compte, ou deux homonymes) — aucune image, jamais devinée', async () => {
    // Le serveur omet `logo_url`/`website` : c'est exactement ce qu'il rend
    // pour une ligne ambiguë (voir `partners.service.spec.ts`, #1818.2) — cet
    // écran n'a pas à recalculer la règle, seulement à ne rien inventer.
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByText('Capgemini')
    expect(logoRequests).toContainEqual([undefined, undefined])
    // `companyLogoSrc` répond `null` dans ce cas (voir le double du dessus) —
    // `CompanyAvatar` retombe alors sur l'initiale, jamais une image.
  })
})
