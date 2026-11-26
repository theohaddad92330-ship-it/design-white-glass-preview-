import type { TargetList } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { targetListsApi } from './api'

// #2156.73 — « aucune liste de Mes cibles n'a de champ prochaine action vide ».
// `next_action` naissait nul quand l'appelant n'en écrivait pas (le formulaire
// manuel, la création depuis un compte, depuis Contacts, depuis Découvrir —
// aucun des quatre ne le renseigne). Le défaut vit ICI, au seul endroit que
// tous ces appelants traversent déjà (`targetListsApi.create`, GA-26) : un
// correctif par site l'aurait dupliqué quatre fois et désynchronisé au premier
// texte changé.

const mockApiFetch = vi.fn()

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

function fakeList(): TargetList {
  return {
    id: 'list-1',
    name: 'Banques régionales',
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'workspace',
    source: 'manual',
    source_query: null,
    status: 'draft',
    counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
    next_action: null,
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'user-1',
    created_at: '2026-09-23T00:00:00.000Z',
    updated_at: '2026-09-23T00:00:00.000Z',
    items: [],
  }
}

describe('targetListsApi.create — #2156.73', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiFetch.mockResolvedValue(fakeList())
  })

  it('une liste créée SANS action suivante en reçoit une par défaut, jamais vide', async () => {
    await targetListsApi.create({ name: 'Banques régionales' })

    const [call] = mockApiFetch.mock.calls[0] as [{ body: { next_action?: string | null } }]
    expect(call.body.next_action).toBe(i18n.t('targets:create.defaultNextAction'))
    expect(call.body.next_action?.length).toBeGreaterThan(0)
  })

  it("une action suivante explicite n'est jamais écrasée par le défaut", async () => {
    await targetListsApi.create({ name: 'Banques régionales', next_action: 'Appeler mardi' })

    const [call] = mockApiFetch.mock.calls[0] as [{ body: { next_action?: string | null } }]
    expect(call.body.next_action).toBe('Appeler mardi')
  })

  it('les autres champs de la requête ne bougent pas', async () => {
    await targetListsApi.create({ name: 'Banques régionales', source: 'discover' })

    const [call] = mockApiFetch.mock.calls[0] as [{ path: string; method: string; body: Record<string, unknown> }]
    expect(call.path).toBe('/target-lists')
    expect(call.method).toBe('POST')
    expect(call.body.name).toBe('Banques régionales')
    expect(call.body.source).toBe('discover')
  })
})
