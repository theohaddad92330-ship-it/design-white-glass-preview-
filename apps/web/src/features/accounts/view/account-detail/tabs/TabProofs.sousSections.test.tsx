import type { Account, Proof, Testimonial } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #2124.34 / .42 / .43 / .44 / .47 / .57 / .58 — la section « Historique &
 * preuves » et ses sous-sections NOMMÉES.
 *
 * Ce que cette suite tient, et qui n'est pas décoratif :
 *
 *  1. Les sous-sections portent les libellés PRESCRITS. Le retour ne demandait
 *     pas « des titres » : il en donnait six, et « Ce qu'on a livré ici » n'est
 *     pas « Ce que nous avons déjà réalisé » — le premier parle de nous, le
 *     second parle au client.
 *  2. Un retour de mission DÉJÀ recueilli se lit. Il était écrit, stocké, relu
 *     en base à chaque ouverture du dossier, et rendu nulle part.
 *  3. L'état vide dit la CONSÉQUENCE (« mes messages utiliseront uniquement les
 *     preuves générales de ton ESN ») et ouvre CINQ portes. Une phrase courte
 *     seule — « Rien n'a été délivré ici. » — laisse le lecteur devant un mur.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const useAccountMarketContext = vi.fn()
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: (...args: unknown[]) => useAccountMarketContext(...args),
}))

const { TabProofs } = await import('./TabProofs')

/**
 * ⚠️ Un compte DIFFÉRENT par rendu, et ce n'est pas un détail : `renderWithRouter`
 * partage UN `QueryClient` entre tous les tests du fichier, si bien que la clé
 * `['capitalisation', <id>]` resservirait la réponse du test précédent avant le
 * refetch — un test lisait alors les données de son voisin et passait pour la
 * mauvaise raison.
 */
let accountSeq = 0
const nextAccount = (): Account => ({ id: `acc-${++accountSeq}`, company_name: 'Acme' }) as Account

function proof(over: Partial<Proof> = {}): Proof {
  return {
    id: 'p-1',
    account_id: 'acc-1',
    mission_id: null,
    claim: 'Migration de 400 To en 6 mois',
    detail: null,
    strength: 'declared',
    scope: 'internal',
    sector: null,
    anonymised: false,
    created_at: '2026-01-01T00:00:00.000Z',
    technologies: [],
    ...over,
  }
}

type Capitalisation = {
  delivered: { mission_id: string; label: string; status: string; started_on: string | null; ended_on: string | null }[]
  proofs: Proof[]
  pendingRex: { mission_id: string; label: string; ended_on: string | null }[]
  collectedRex: {
    id: string
    mission_id: string
    mission_label: string | null
    summary: string
    what_worked: string | null
    what_failed: string | null
    collected_at: string
  }[]
  testimonials: Testimonial[]
}

const EMPTY: Capitalisation = { delivered: [], proofs: [], pendingRex: [], collectedRex: [], testimonials: [] }

function draw(capitalisation: Capitalisation) {
  apiFetch.mockResolvedValue(capitalisation)
  return renderWithRouter(<TabProofs account={nextAccount()} />)
}

describe('TabProofs — les sous-sections nommées de « Historique & preuves »', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    useAccountMarketContext.mockReset().mockReturnValue({ data: undefined })
  })
  afterEach(() => cleanup())

  it('porte les libellés PRESCRITS des sous-sections (#2124.42 / .43 / .44 / .47)', async () => {
    draw({
      ...EMPTY,
      delivered: [{ mission_id: 'm-1', label: 'Data lake', status: 'ended', started_on: null, ended_on: null }],
      proofs: [proof()],
    })

    expect(await screen.findByText('Ce que nous avons déjà réalisé')).toBeInTheDocument()
    expect(screen.getByText('Ce que nous pouvons prouver')).toBeInTheDocument()
    expect(screen.getByText('Ce que le client nous a dit')).toBeInTheDocument()
    expect(screen.getByText('Informations terrain')).toBeInTheDocument()
  })

  it('lit le retour de mission DÉJÀ recueilli — il était stocké et rendu nulle part (#2124.34)', async () => {
    draw({
      ...EMPTY,
      delivered: [{ mission_id: 'm-3', label: 'Data lake', status: 'ended', started_on: null, ended_on: null }],
      collectedRex: [
        {
          id: 'r-9',
          mission_id: 'm-3',
          mission_label: 'Data lake',
          summary: 'Le sponsor a changé en cours de route.',
          what_worked: 'Le cadrage à trois semaines.',
          what_failed: null,
          collected_at: '2026-03-12T09:00:00.000Z',
        },
      ],
    })

    expect(await screen.findByText('Le sponsor a changé en cours de route.')).toBeInTheDocument()
    expect(screen.getByText(/Le cadrage à trois semaines\./)).toBeInTheDocument()
  })

  it('sait dire NON — ce qui n’a pas été recueilli ne s’invente pas', async () => {
    draw({
      ...EMPTY,
      delivered: [{ mission_id: 'm-3', label: 'Data lake', status: 'ended', started_on: null, ended_on: null }],
      collectedRex: [
        {
          id: 'r-9',
          mission_id: 'm-3',
          mission_label: 'Data lake',
          summary: 'Le sponsor a changé en cours de route.',
          what_worked: null,
          what_failed: null,
          collected_at: '2026-03-12T09:00:00.000Z',
        },
      ],
    })

    await screen.findByText('Le sponsor a changé en cours de route.')
    // Rien de ce qui n'a pas été écrit ne s'affiche : ni « aucun », ni « 0 »,
    // ni une ligne vide qui se lirait comme une capture cassée.
    expect(screen.queryByText(/Ce qui a marché/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ce qui a coincé/)).not.toBeInTheDocument()
  })

  it('l’état vide dit la CONSÉQUENCE, pas seulement l’absence (#2124.57)', async () => {
    draw(EMPTY)

    expect(
      await screen.findByText(/Je n’ai trouvé aucune mission ou preuve associée à ce compte\./),
    ).toBeInTheDocument()
    expect(screen.getByText(/mes messages utiliseront uniquement les preuves générales de ton ESN/)).toBeInTheDocument()
  })

  it('l’état vide ouvre CINQ portes, toutes vers un écran qui existe (#2124.58)', async () => {
    draw(EMPTY)

    await screen.findByText(/Je n’ai trouvé aucune mission ou preuve associée à ce compte\./)
    const doors: [string, string][] = [
      ['Importer mes missions', '/settings/mes-donnees?tab=imports'],
      ['Chercher dans mon CRM', '/integrations'], // #2208.30 — Intégrations vit à /integrations
      ['Ajouter une mission', '/missions/nouvelle'],
      ['Ajouter un REX', '/pilotage/rex'],
      ['Utiliser une référence comparable', '/discover'],
    ]
    for (const [label, href] of doors) {
      const link = screen.getByRole('link', { name: label })
      expect(link).toHaveAttribute('href', href)
    }
  })
})
