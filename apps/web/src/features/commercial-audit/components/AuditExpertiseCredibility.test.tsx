import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ExpertiseGrounding, ExpertiseGroundingsResponse } from '@bellum/contracts'
import { buildExpertiseCredibilityAudit } from '@bellum/contracts'
import { AuditExpertiseCredibility } from './AuditExpertiseCredibility'
import { expertiseGroundingsApi } from '../api'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    expertiseGroundingsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() },
  }
})

const MISSION_ID = '22222222-2222-4222-8222-222222222222'

function grounding(partial: Partial<ExpertiseGrounding>): ExpertiseGrounding {
  return {
    id: null,
    expertiseKey: 'Cloud',
    kind: 'client_reference',
    state: 'declared',
    stateSource: 'onboarding_answer',
    sourceType: null,
    sourceId: null,
    sourceLabel: null,
    label: null,
    confidentiality: null,
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
    ...partial,
  }
}

function response(areas: string[], groundings: ExpertiseGrounding[]): ExpertiseGroundingsResponse {
  return {
    groundings,
    audit: buildExpertiseCredibilityAudit(areas, groundings),
    sourceOptions: [{ type: 'mission', id: MISSION_ID, label: 'Migration AWS — Hexa' }],
  }
}

describe('AuditExpertiseCredibility — audit à 3 états par expertise (#2039.14, #2880)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resetTestQueryClient()
  })

  it('nomme les trois axes par expertise, et un axe non évaluable avec sa raison — jamais « 0 »', async () => {
    vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Data'], []))
    renderWithRouter(<AuditExpertiseCredibility />)
    const card = await screen.findByRole('region', { name: /crédibilité par expertise/i })
    const row = await within(card).findByRole('listitem', { name: 'Data' })
    expect(within(row).getByText(/tu sais le faire/i)).toBeInTheDocument()
    expect(within(row).getByText(/tu as une preuve/i)).toBeInTheDocument()
    expect(within(row).getByText(/tu peux le vendre maintenant/i)).toBeInTheDocument()
    expect(within(row).getAllByText(/non évaluable/i)).toHaveLength(3)
    expect(within(row).queryByText(/^0$/)).not.toBeInTheDocument()
  })

  it('#2039.9 — rattacher une mission à un fondement projeté le CRÉE, prouvé', async () => {
    vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Cloud'], [grounding({})]))
    vi.mocked(expertiseGroundingsApi.create).mockResolvedValue(response(['Cloud'], []))
    renderWithRouter(<AuditExpertiseCredibility />)
    await userEvent.click(await screen.findByRole('combobox', { name: /rattacher une preuve/i }))
    await userEvent.click(await screen.findByRole('option', { name: /migration aws/i }))
    await waitFor(() =>
      expect(expertiseGroundingsApi.create).toHaveBeenCalledWith({
        expertiseKey: 'Cloud',
        kind: 'client_reference',
        state: 'proven',
        sourceType: 'mission',
        sourceId: MISSION_ID,
      }),
    )
  })

  it('#2039.13 — la confidentialité se règle PAR RÉFÉRENCE stockée', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(
      response(['Cloud'], [grounding({ id, stateSource: 'user' })]),
    )
    vi.mocked(expertiseGroundingsApi.update).mockResolvedValue(response(['Cloud'], []))
    renderWithRouter(<AuditExpertiseCredibility />)
    await userEvent.click(await screen.findByRole('combobox', { name: /confidentialité/i }))
    await userEvent.click(await screen.findByRole('option', { name: /anonymisable/i }))
    await waitFor(() =>
      expect(expertiseGroundingsApi.update).toHaveBeenCalledWith(id, { confidentiality: 'anonymizable' }),
    )
  })

  it('la confidentialité n’est pas proposée sur un fondement qui n’est pas une référence client', async () => {
    vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Cloud'], [grounding({ kind: 'partner' })]))
    renderWithRouter(<AuditExpertiseCredibility />)
    await screen.findByRole('combobox', { name: /rattacher une preuve/i })
    expect(screen.queryByRole('combobox', { name: /confidentialité/i })).not.toBeInTheDocument()
  })

  it('archive une ligne stockée (on archive, on ne supprime pas)', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(
      response(['Cloud'], [grounding({ id, stateSource: 'user', kind: 'partner' })]),
    )
    vi.mocked(expertiseGroundingsApi.archive).mockResolvedValue(response(['Cloud'], []))
    renderWithRouter(<AuditExpertiseCredibility />)
    await userEvent.click(await screen.findByRole('button', { name: /archiver/i }))
    await waitFor(() => expect(expertiseGroundingsApi.archive).toHaveBeenCalledWith(id))
  })

  it('un échec de lecture se DIT, sans inventer d’audit', async () => {
    vi.mocked(expertiseGroundingsApi.list).mockRejectedValue(new Error('boom'))
    renderWithRouter(<AuditExpertiseCredibility />)
    expect(await screen.findByText(/impossible de charger/i)).toBeInTheDocument()
  })

  // #4425.1 — une expertise « Non évaluable » montrait POURQUOI, sans offrir de quoi y répondre.
  describe('#4425.1 — les trois questions d’une expertise non évaluable', () => {
    it('sans aucun fondement : les trois questions sont posées, la preuve attend la première réponse', async () => {
      vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Data'], []))
      renderWithRouter(<AuditExpertiseCredibility />)
      const row = await screen.findByRole('listitem', { name: 'Data' })
      expect(within(row).getByRole('combobox', { name: /sur quoi repose cette expertise/i })).toBeInTheDocument()
      expect(within(row).getByRole('combobox', { name: /quelle preuve peux-tu rattacher/i })).toBeDisabled()
      expect(within(row).getByRole('checkbox', { name: /un vivier .* disponible/i })).toBeInTheDocument()
    })

    it('répondre au fondement seul CRÉE la ligne déclarée, sans preuve inventée', async () => {
      vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Data'], []))
      vi.mocked(expertiseGroundingsApi.create).mockResolvedValue(response(['Data'], []))
      renderWithRouter(<AuditExpertiseCredibility />)
      const row = await screen.findByRole('listitem', { name: 'Data' })
      await userEvent.click(within(row).getByRole('combobox', { name: /sur quoi repose cette expertise/i }))
      await userEvent.click(await screen.findByRole('option', { name: 'Expérience personnelle' }))
      await userEvent.click(within(row).getByRole('button', { name: /enregistrer mes réponses/i }))
      await waitFor(() =>
        expect(expertiseGroundingsApi.create).toHaveBeenCalledWith({
          expertiseKey: 'Data',
          kind: 'personal_experience',
          state: 'declared',
        }),
      )
    })

    it('fondement + preuve : la ligne est créée PROUVÉE, avec son objet source', async () => {
      vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Data'], []))
      vi.mocked(expertiseGroundingsApi.create).mockResolvedValue(response(['Data'], []))
      renderWithRouter(<AuditExpertiseCredibility />)
      const row = await screen.findByRole('listitem', { name: 'Data' })
      await userEvent.click(within(row).getByRole('combobox', { name: /sur quoi repose cette expertise/i }))
      await userEvent.click(await screen.findByRole('option', { name: 'Référence client' }))
      await userEvent.click(within(row).getByRole('combobox', { name: /quelle preuve peux-tu rattacher/i }))
      await userEvent.click(await screen.findByRole('option', { name: /migration aws/i }))
      await userEvent.click(within(row).getByRole('button', { name: /enregistrer mes réponses/i }))
      await waitFor(() =>
        expect(expertiseGroundingsApi.create).toHaveBeenCalledWith({
          expertiseKey: 'Data',
          kind: 'client_reference',
          state: 'proven',
          sourceType: 'mission',
          sourceId: MISSION_ID,
        }),
      )
    })

    it('« Enregistrer » ne part pas tant que rien n’est répondu (aucune ligne vide)', async () => {
      vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Data'], []))
      renderWithRouter(<AuditExpertiseCredibility />)
      const row = await screen.findByRole('listitem', { name: 'Data' })
      expect(within(row).getByRole('button', { name: /enregistrer mes réponses/i })).toBeDisabled()
    })

    it('capacité inconnue : seule la question du vivier est posée, et la déclarer crée un fondement vivier', async () => {
      const proven = grounding({
        id: '11111111-1111-4111-8111-111111111111',
        expertiseKey: 'Cloud',
        state: 'proven',
        stateSource: 'user',
        sourceType: 'mission',
        sourceId: MISSION_ID,
        sourceLabel: 'Migration AWS — Hexa',
      })
      vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Cloud'], [proven]))
      vi.mocked(expertiseGroundingsApi.create).mockResolvedValue(response(['Cloud'], []))
      renderWithRouter(<AuditExpertiseCredibility />)
      const row = await screen.findByRole('listitem', { name: 'Cloud' })
      expect(within(row).queryByRole('combobox', { name: /sur quoi repose cette expertise/i })).not.toBeInTheDocument()
      await userEvent.click(within(row).getByRole('checkbox', { name: /un vivier .* disponible/i }))
      await userEvent.click(within(row).getByRole('button', { name: /enregistrer mes réponses/i }))
      await waitFor(() =>
        expect(expertiseGroundingsApi.create).toHaveBeenCalledWith({
          expertiseKey: 'Cloud',
          kind: 'talent_pool',
          state: 'declared',
        }),
      )
    })

    it('une expertise entièrement évaluable ne pose aucune question', async () => {
      const full = [
        grounding({
          id: '11111111-1111-4111-8111-111111111111',
          expertiseKey: 'Cloud',
          state: 'proven',
          sourceType: 'mission',
          sourceId: MISSION_ID,
          sourceLabel: 'x',
        }),
        grounding({ id: '22222222-1111-4111-8111-111111111111', expertiseKey: 'Cloud', kind: 'talent_pool' }),
      ]
      vi.mocked(expertiseGroundingsApi.list).mockResolvedValue(response(['Cloud'], full))
      renderWithRouter(<AuditExpertiseCredibility />)
      const row = await screen.findByRole('listitem', { name: 'Cloud' })
      expect(within(row).queryByRole('button', { name: /enregistrer mes réponses/i })).not.toBeInTheDocument()
    })
  })
})
