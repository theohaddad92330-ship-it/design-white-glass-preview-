import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const create = vi.fn().mockResolvedValue({})
vi.mock('../lost-deal-rex-api', () => ({ lostDealRexApi: { create: (input: unknown) => create(input) } }))

beforeEach(() => {
  cleanup()
  create.mockClear()
})

const { LostDealRexDialog } = await import('./LostDealRexDialog')

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LostDealRexDialog open onOpenChange={() => {}} projectId={PROJECT_ID} accountId={ACCOUNT_ID} />
    </QueryClientProvider>,
  )
}

describe('LostDealRexDialog — #3272 (reste de #3295), les champs les plus visibles d’abord', () => {
  it('pose sponsor, route utilisée et dernière action — les trois champs les plus visibles du REX', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Sponsor'), 'Le DSI')
    await user.type(screen.getByLabelText('Route utilisée'), 'Entrée directe par le sponsor métier')
    await user.type(screen.getByLabelText('Dernière action'), 'Proposition envoyée le 12/09, sans retour depuis')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le REX' }))

    expect(create).toHaveBeenCalledTimes(1)
    const body = create.mock.calls[0]![0]
    expect(body.sponsor).toBe('Le DSI')
    expect(body.route_used).toBe('Entrée directe par le sponsor métier')
    expect(body.last_action).toEqual({
      value: 'Proposition envoyée le 12/09, sans retour depuis',
      distinction: 'interpretation_commerciale',
    })
  })

  it('un champ laissé vide reste `null` — jamais une chaîne vide ni une valeur devinée', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Enregistrer le REX' }))

    expect(create).toHaveBeenCalledTimes(1)
    const body = create.mock.calls[0]![0]
    expect(body.sponsor).toBeNull()
    expect(body.route_used).toBeNull()
    expect(body.last_action).toBeNull()
    expect(body.perimeter).toBeNull()
    expect(body.need).toBeNull()
    expect(body.people_involved).toBeNull()
    expect(body.real_decider).toBeNull()
    expect(body.proof_used).toBeNull()
    expect(body.angle_tried).toBeNull()
    expect(body.angles_not_tried).toEqual([])
    expect(body.competitor).toBeNull()
    expect(body.timing).toBeNull()
    expect(body.cycle_days).toBeNull()
    expect(body.procurement_friction).toBeNull()
    expect(body.consultant_gap).toBeNull()
    expect(body.economics).toBeNull()
  })

  it('pose les dix champs restants (#3295, reste) — périmètre, personnes, preuve, angles, concurrent, timing, cycle, friction achats, écart consultant, économie', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Périmètre'), 'Le siège uniquement, pas les filiales')
    await user.type(screen.getByLabelText('Besoin'), 'Migration cloud')
    await user.type(screen.getByLabelText('Personnes impliquées'), 'DSI, RSSI, acheteur')
    await user.type(screen.getByLabelText('Décideur réel'), 'Le RSSI, pas le DSI')
    await user.type(screen.getByLabelText('Preuve mobilisée'), 'Étude de cas secteur banque')
    await user.type(screen.getByLabelText('Angle essayé'), 'Sécurité et conformité')
    await user.type(screen.getByLabelText('Angles non essayés'), 'Coût total\nRapidité de mise en œuvre')
    await user.type(screen.getByLabelText('Concurrent'), 'Capgemini')
    await user.type(screen.getByLabelText('Timing'), 'Budget déjà engagé ailleurs')
    await user.type(screen.getByLabelText('Cycle (jours)'), '45')
    await user.type(screen.getByLabelText('Friction achats'), 'RFP à trois tours')
    await user.type(screen.getByLabelText('Écart consultant'), 'Profil senior demandé, junior proposé')
    await user.type(screen.getByLabelText('Économie'), 'TJM 15% au-dessus du marché')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le REX' }))

    expect(create).toHaveBeenCalledTimes(1)
    const body = create.mock.calls[0]![0]
    expect(body.perimeter).toBe('Le siège uniquement, pas les filiales')
    expect(body.need).toBe('Migration cloud')
    expect(body.people_involved).toBe('DSI, RSSI, acheteur')
    expect(body.real_decider).toBe('Le RSSI, pas le DSI')
    expect(body.proof_used).toBe('Étude de cas secteur banque')
    expect(body.angle_tried).toBe('Sécurité et conformité')
    expect(body.angles_not_tried).toEqual(['Coût total', 'Rapidité de mise en œuvre'])
    expect(body.competitor).toBe('Capgemini')
    expect(body.timing).toBe('Budget déjà engagé ailleurs')
    expect(body.cycle_days).toBe(45)
    expect(body.procurement_friction).toBe('RFP à trois tours')
    expect(body.consultant_gap).toBe('Profil senior demandé, junior proposé')
    expect(body.economics).toBe('TJM 15% au-dessus du marché')
  })
})
