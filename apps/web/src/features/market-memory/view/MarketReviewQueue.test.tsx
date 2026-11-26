import type { MarketPortfolioRead } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #1633.3 — LA FILE DES COMPTES À DÉPARTAGER.
 *
 * ⚠️ DEUX pièges de harnais payés ici, tous deux en vert menteur potentiel :
 *
 * 1. Le composant porte un `Link` de TanStack, qui exige un ROUTEUR monté —
 *    sans lui, le rendu jette `Cannot read properties of null (reading
 *    'isServer')`. D'où `renderWithRouter` et non `render`.
 * 2. Le routeur monte de façon ASYNCHRONE : `getByText` juste après le rendu ne
 *    trouve rien, et un test qui aurait cherché une ABSENCE serait passé au
 *    vert sans que le composant ait jamais été rendu. Toutes les recherches
 *    passent donc par `findBy*`, et l'absence se vérifie APRÈS avoir attendu
 *    une présence.
 */

type QueryState = { data?: MarketPortfolioRead; isLoading: boolean; isError: boolean }
const state: { current: QueryState } = { current: { data: undefined, isLoading: true, isError: false } }

/**
 * #1617.4 — le geste d'écriture, mocké au même endroit que la lecture.
 *
 * `mutateAsync` est une promesse RÉSOLUE : sans ça le `.then(...)` du composant
 * ne partirait jamais, et un test qui attend un message de succès resterait
 * bloqué sur un délai plutôt que de dire ce qui manque.
 */
const decide = { mutateAsync: vi.fn(async () => ({})), isPending: false }

vi.mock('../api', () => ({
  useMarketMemoryPortfolio: () => state.current,
  useRecordMarketResolution: () => decide,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { MarketReviewQueue } = await import('./MarketReviewQueue')

const ROCHE_ID = '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55'

const BASE: MarketPortfolioRead = {
  status: 'ok',
  coverage: { accounts: 62, covered: 38, insufficientObservations: 15, ambiguous: 6, unresolved: 3, homonyms: 4 },
  review: [
    {
      accountId: ROCHE_ID,
      accountName: 'ROCHE',
      reason: 'ambiguous_name',
      candidates: 3,
      companies: [
        { companyKey: 'roche-holding', companyName: 'Roche Holding', websiteDomain: 'roche.com', country: 'Suisse' },
        { companyKey: 'roche-france', companyName: 'Roche France', websiteDomain: 'roche.fr', country: 'France' },
        { companyKey: 'roche-bobois', companyName: 'Roche Bobois', websiteDomain: null, country: null },
      ],
    },
    {
      accountId: '5a2b4c6d-1f8b-4a2e-9d4c-2b7c9e0a1d66',
      accountName: 'ORANGE',
      reason: 'ambiguous_domain',
      candidates: 2,
      companies: [
        { companyKey: 'orange-telecom', companyName: 'Orange', websiteDomain: 'orange.com', country: 'France' },
        { companyKey: 'orange-bank', companyName: 'Orange Bank', websiteDomain: 'orange.com', country: 'France' },
      ],
    },
  ],
  structuralFit: null,
  computedAt: '2026-09-08T10:00:00.000Z',
}

beforeEach(() => {
  state.current = { data: undefined, isLoading: true, isError: false }
  decide.mutateAsync.mockClear()
})
afterEach(cleanup)

describe('la file à départager', () => {
  it('nomme chaque compte et LA raison, qui n’est pas la même des deux côtés', async () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    expect(await screen.findByText('ROCHE')).toBeTruthy()
    expect(await screen.findByText(/3 entreprises portent ce nom/)).toBeTruthy()
    expect(await screen.findByText('ORANGE')).toBeTruthy()
    expect(await screen.findByText(/2 entreprises partagent ce domaine/)).toBeTruthy()
  })

  it('rend le compte CLIQUABLE par un lien — ce qui se clique se tabule', async () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    const lien = (await screen.findByText('ROCHE')).closest('a')
    expect(lien?.getAttribute('href')).toContain(ROCHE_ID)
  })

  it('dit que la file est PLAFONNÉE quand elle l’est — sinon 20 se lirait comme le total', async () => {
    state.current = {
      data: { ...BASE, coverage: { ...BASE.coverage, ambiguous: 60, accounts: 116 } },
      isLoading: false,
      isError: false,
    }
    renderWithRouter(<MarketReviewQueue />)

    expect(await screen.findByText(/60 au total/)).toBeTruthy()
  })

  it('ne dit rien de plafonné quand tout est affiché', async () => {
    state.current = {
      data: { ...BASE, coverage: { ...BASE.coverage, ambiguous: 2, accounts: 58 } },
      isLoading: false,
      isError: false,
    }
    renderWithRouter(<MarketReviewQueue />)

    // On attend d'abord une PRÉSENCE : sans elle, l'absence ci-dessous serait
    // vraie avant même que le composant soit monté.
    expect(await screen.findByText('ROCHE')).toBeTruthy()
    expect(screen.queryByText(/au total/)).toBeNull()
  })

  it('dit qu’il n’y a rien à départager plutôt que de disparaître', async () => {
    state.current = {
      data: { ...BASE, review: [], coverage: { ...BASE.coverage, ambiguous: 0, accounts: 56 } },
      isLoading: false,
      isError: false,
    }
    renderWithRouter(<MarketReviewQueue />)

    expect(await screen.findByText(/Aucun compte à départager/)).toBeTruthy()
  })

  it('disparaît sur une panne — la file n’a rien à dire si la lecture a échoué', async () => {
    state.current = { data: { status: 'unavailable', reason: 'read_failed' }, isLoading: false, isError: false }
    const { container } = renderWithRouter(<MarketReviewQueue />)

    // Le contrôle qui évite le vert menteur : le MÊME harnais rend bien le
    // titre quand la lecture réussit. Ici il ne rend rien du tout.
    cleanup()
    state.current = { data: BASE, isLoading: false, isError: false }
    const monte = renderWithRouter(<MarketReviewQueue />)
    expect(await screen.findByText(/À départager/)).toBeTruthy()
    expect(monte.container.textContent).not.toBe(container.textContent)
    expect(container.textContent).not.toMatch(/À départager/)
  })
})

/**
 * #1617.4 — LE GESTE, ET LA RAISON POUR LAQUELLE IL EST ICI.
 *
 * Avant ce lot, la file ANNONÇAIT un arbitrage qu'aucun clic ne pouvait
 * rendre : elle ouvrait le dossier du compte, où il n'y avait rien de plus à
 * faire. Le docbloc du composant écrivait lui-même que « relation corrigée par
 * utilisateur » n'avait aucun mécanisme dans le produit — c'était vrai, ça ne
 * l'est plus, et une garde ci-dessous relit ce docbloc.
 */
describe('la file à départager — le geste (#1617.4)', () => {
  it('ouvre la liste des entreprises entre lesquelles choisir, NOMMÉES', async () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    const ouvrir = await screen.findAllByRole('button', { name: /Départager/ })
    await userEvent.click(ouvrir[0]!)

    expect(await screen.findByRole('button', { name: /Roche Holding/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Roche France/ })).toBeTruthy()
    // Celle qui n'a ni domaine ni pays s'affiche quand même, sans rien inventer.
    expect(screen.getByRole('button', { name: /Roche Bobois/ })).toBeTruthy()
  })

  it('n’affiche RIEN à la place d’un domaine ou d’un pays absent', async () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    await userEvent.click((await screen.findAllByRole('button', { name: /Départager/ }))[0]!)

    const bobois = screen.getByRole('button', { name: /Roche Bobois/ })
    // Ni tiret de remplissage, ni « — », ni « non renseigné » : une valeur
    // absente ne s'affiche pas, elle ne se remplace pas.
    expect(bobois.textContent).toBe('Roche Bobois')
  })

  it('envoie « c’est bien cette entreprise » avec LA CLÉ du corpus, jamais le nom', async () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    await userEvent.click((await screen.findAllByRole('button', { name: /Départager/ }))[0]!)
    await userEvent.click(screen.getByRole('button', { name: /Roche France/ }))

    expect(decide.mutateAsync).toHaveBeenCalledWith({
      accountId: ROCHE_ID,
      decision: 'confirmed',
      marketCompanyKey: 'roche-france',
      note: null,
    })
  })

  it('envoie « ce n’est pas exact » SANS clé — écarter est une réponse complète', async () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    await userEvent.click((await screen.findAllByRole('button', { name: /Départager/ }))[0]!)
    await userEvent.click(screen.getByRole('button', { name: /Aucune de ces entreprises/ }))

    expect(decide.mutateAsync).toHaveBeenCalledWith({
      accountId: ROCHE_ID,
      decision: 'dismissed',
      note: null,
    })
  })

  it('emporte la RAISON quand la personne en a écrit une', async () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    await userEvent.click((await screen.findAllByRole('button', { name: /Départager/ }))[0]!)
    await userEvent.type(screen.getByRole('textbox'), 'la filiale suisse')
    await userEvent.click(screen.getByRole('button', { name: /Aucune de ces entreprises/ }))

    expect(decide.mutateAsync).toHaveBeenCalledWith({
      accountId: ROCHE_ID,
      decision: 'dismissed',
      note: 'la filiale suisse',
    })
  })

  it('n’ouvre QUE la ligne cliquée — deux panneaux ouverts se liraient comme un seul', async () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    await userEvent.click((await screen.findAllByRole('button', { name: /Départager/ }))[0]!)

    expect(screen.getByRole('button', { name: /Roche Holding/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Orange Bank/ })).toBeNull()
  })

  it('⚠️ ne propose AUCUN geste quand l’API ne nomme pas les candidates', async () => {
    // La fenêtre d'un déploiement : le web est neuf, l'API ne rend pas encore
    // `companies`. Sans cette garde, l'écran afficherait un bouton qui ouvre
    // une liste vide — un geste promis et impossible.
    state.current = {
      data: {
        ...BASE,
        review: [{ accountId: ROCHE_ID, accountName: 'ROCHE', reason: 'ambiguous_name', candidates: 3 }],
      },
      isLoading: false,
      isError: false,
    }
    renderWithRouter(<MarketReviewQueue />)

    // On attend une PRÉSENCE avant de vérifier une absence : sans elle, le
    // test passerait au vert avant même que le composant soit monté.
    expect(await screen.findByText('ROCHE')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Départager/ })).toBeNull()
  })

  it('dit que la décision est enregistrée, et le DIT depuis la réponse du serveur', async () => {
    decide.mutateAsync.mockResolvedValueOnce({
      accountId: ROCHE_ID,
      decision: 'dismissed',
      marketCompanyKey: null,
      note: null,
    })
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    await userEvent.click((await screen.findAllByRole('button', { name: /Départager/ }))[0]!)
    await userEvent.click(screen.getByRole('button', { name: /Aucune de ces entreprises/ }))

    const { toast } = await import('sonner')
    expect(toast.success).toHaveBeenCalled()
  })

  it('DIT quand la décision n’a pas pu être enregistrée — jamais un silence', async () => {
    decide.mutateAsync.mockRejectedValueOnce(new Error('table injoignable'))
    state.current = { data: BASE, isLoading: false, isError: false }
    renderWithRouter(<MarketReviewQueue />)

    await userEvent.click((await screen.findAllByRole('button', { name: /Départager/ }))[0]!)
    await userEvent.click(screen.getByRole('button', { name: /Aucune de ces entreprises/ }))

    const { toast } = await import('sonner')
    expect(toast.error).toHaveBeenCalled()
  })
})

/**
 * #1617.4 — LE DOCBLOC DU COMPOSANT NE DOIT PLUS DIRE LE CONTRAIRE DU CODE.
 *
 * Il affirmait que « relation corrigée par utilisateur » n'avait AUCUN
 * mécanisme dans le produit. C'était exact avant ce lot. Une garde qui lit le
 * RÉCIT d'un défaut dans un docbloc reste verte pendant que la cible a
 * changé — celle-ci lit le fichier réel pour que ce récit-là ne survive pas à
 * sa correction.
 */
describe('le docbloc de la file dit ce que le produit fait', () => {
  it('n’affirme plus qu’aucun mécanisme n’existe', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    // `__dirname` et non `import.meta.url` : vitest sert ce fichier depuis une
    // URL qui n'est pas de schéma `file:`, et `new URL(...)` y jette. C'est le
    // même chemin que les gardes de `src/architecture/`.
    const source = readFileSync(join(__dirname, 'MarketReviewQueue.tsx'), 'utf8')

    // Elle LIT quelque chose : sans cette ligne, un chemin fautif rendrait une
    // chaîne vide, qui ne contient aucune des phrases interdites — vert menteur.
    expect(source.length).toBeGreaterThan(0)
    expect(source).toContain('useRecordMarketResolution')

    // Les deux phrases que ce lot rend FAUSSES. Elles sont écrites ici et
    // nulle part ailleurs : les citer dans le composant, ne serait-ce que pour
    // raconter leur retrait, les ferait revenir dans le fichier — et cette
    // garde tomberait en ayant raison.
    expect(source).not.toMatch(/AUCUN mécanisme dans le produit/)
    expect(source).not.toMatch(/il n’y a même pas de porte d’écriture à proposer/)

    // SAIT DIRE NON : le témoin prouve que le motif attrape bien la phrase
    // d'origine, et pas seulement qu'il ne trouve rien.
    expect('« relation corrigée par utilisateur » n’a AUCUN mécanisme dans le produit').toMatch(
      /AUCUN mécanisme dans le produit/,
    )
  })
})
