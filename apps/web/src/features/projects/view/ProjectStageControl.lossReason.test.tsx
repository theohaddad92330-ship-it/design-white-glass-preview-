import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { ProjectStageControl } from './ProjectStageControl'

const updateStage = vi.fn().mockResolvedValue({})
const listLossReasons = vi.fn().mockResolvedValue({ items: [] })
vi.mock('../api', () => ({
  projectsApi: {
    updateStage: (...args: unknown[]) => updateStage(...args),
    listLossReasons: () => listLossReasons(),
  },
  projectQueryKeys: { all: ['projects'], lossReasons: ['projects', 'loss-reasons'] },
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => {
  updateStage.mockClear()
  listLossReasons.mockClear()
  listLossReasons.mockResolvedValue({ items: [] })
})

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const project: ProjectRow = {
  id: 'op-1',
  account_id: 'acc-1',
  company_name: 'ACME',
  sector: null,
  logo_url: null,
  website: null,
  kind: 'pain',
  label: 'Migration Cloud',
  detail: null,
  offer: null,
  source: 'pain',
  confidence: 'high',
  urgency: null,
  stage: 'negotiation',
  stage_entered_at: '2026-07-01T00:00:00.000Z',
  owner_id: null,
  expected_close_on: null,
  closed_at: null,
  outcome: null,
  loss_reason: null,
  first_detected_at: '2026-07-21T10:00:00.000Z',
  updated_at: '2026-07-21T10:00:00.000Z',
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

/**
 * Marquer un projet perdu demande son motif.
 *
 * Le serveur l'exige désormais (`updateProjectStageSchema`). Sans cet écran, le
 * bouton « Perdu » rendrait un 400 que le commercial ne saurait pas lire — la
 * garde serveur et l'interface doivent arriver ensemble, sinon la garde n'est
 * qu'une panne.
 *
 * Ce qui compte ici : aucune requête ne part tant que le motif est vide. Un
 * envoi qui échoue et laisse la pastille inchangée se lit comme un bug ; un
 * champ obligatoire se lit comme une question.
 *
 * Depuis le PDF 2 §8.5, ce sélecteur passe par le PANNEAU D'EFFET — le même que
 * le dépôt d'une carte du kanban. Le bouton de confirmation s'appelle donc
 * « Déplacer », et il porte les mêmes garanties qu'avant : inerte tant que le
 * motif manque, motif transmis avec l'étape, blanc refusé. Deux chemins pour
 * le même geste, un gouverné et un non, était exactement la porte de côté que
 * le produit refuse ailleurs.
 */
describe('ProjectStageControl — le motif de perte', () => {
  it('n’envoie RIEN et ouvre la question quand on choisit « Perdu »', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Perdue'))

    expect(updateStage).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('garde le bouton de confirmation inerte tant que le motif est vide', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Perdue'))

    expect(await screen.findByRole('button', { name: 'Déplacer' })).toBeDisabled()
  })

  // #3989.9 (Louis 15/10/2026) — le motif est choisi dans la liste FERMÉE commune ; la précision est libre et facultative.
  const chooseCode = async (u: ReturnType<typeof user>, label: string) => {
    await u.click(await screen.findByRole('combobox', { name: 'Motif de la perte' }))
    await u.click(await screen.findByRole('option', { name: label }))
  }

  it('envoie l’étape, le motif FERMÉ et sa précision libre', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Perdue'))
    await chooseCode(u, 'Pas de budget')
    await u.type(await screen.findByRole('textbox'), 'Budget gelé côté client')
    await u.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(updateStage).toHaveBeenCalledWith(
      'op-1',
      'lost',
      'Budget gelé côté client',
      expect.any(Array),
      expect.objectContaining({ loss_reason_code: 'no_budget' }),
    )
  })

  it('#3989.9 — la précision est facultative : le motif fermé suffit', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Perdue'))
    await chooseCode(u, 'Concurrent retenu')
    await u.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(updateStage).toHaveBeenCalledWith(
      'op-1',
      'lost',
      null,
      expect.any(Array),
      expect.objectContaining({ loss_reason_code: 'competitor_won' }),
    )
  })

  it('sait dire NON — un texte libre seul ne débloque pas « Déplacer »', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Perdue'))
    await u.type(await screen.findByRole('textbox'), 'Budget gelé')

    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeDisabled()
  })

  it('propose les motifs déjà utilisés dans l’espace, pour que la taxonomie ne se disperse pas', async () => {
    listLossReasons.mockResolvedValue({
      items: [
        { id: 'r1', label: 'Budget' },
        { id: 'r2', label: 'Concurrent retenu' },
      ],
    })
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Perdue'))

    await u.click(await screen.findByRole('button', { name: 'Concurrent retenu' }))
    await chooseCode(u, 'Concurrent retenu')
    await u.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(updateStage).toHaveBeenCalledWith(
      'op-1',
      'lost',
      'Concurrent retenu',
      expect.any(Array),
      expect.objectContaining({ loss_reason_code: 'competitor_won' }),
    )
  })

  it('ne demande AUCUN motif pour les autres étapes — corriger n’est pas se justifier', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('En sommeil'))
    // Le panneau s'ouvre — il dit ce que le déplacement entraîne — mais il ne
    // RETIENT pas : le bouton part sans motif, parce que mettre en veille est
    // une décision qu'on date, pas une décision qu'on justifie.
    await u.click(await screen.findByRole('button', { name: 'Déplacer' }))

    expect(updateStage).toHaveBeenCalledWith('op-1', 'dormant', null, expect.any(Array))
  })

  it('le panneau d’effet dit ce qui CHANGE avant qu’on confirme', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Gagnée'))

    // Ce qui change mécaniquement en base, montré AVANT le clic : c'est ce que
    // l'utilisateur subit, par opposition à ce qu'il coche.
    expect(await screen.findByText('l’issue')).toBeInTheDocument()
    expect(screen.getByText('la date de clôture')).toBeInTheDocument()
    expect(updateStage).not.toHaveBeenCalled()
  })
})
