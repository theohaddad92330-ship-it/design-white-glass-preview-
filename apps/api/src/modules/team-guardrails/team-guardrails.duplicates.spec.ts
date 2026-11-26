import { TeamGuardrailsService } from './team-guardrails.service'

const WS = 'ws-1'

type Row = { id: string; full_name: string; email: string; email_verified: boolean; assigned_to: null }
const row = (id: string, email = 'accueil@acme.fr', verified = true): Row => ({
  id,
  full_name: `Contact ${id}`,
  email,
  email_verified: verified,
  assigned_to: null,
})

function build(me: Row, others: Row[]) {
  const chain: Record<string, jest.Mock> = {}
  for (const name of ['where', 'andWhere', 'limit']) chain[name] = jest.fn(() => chain)
  chain.getMany = jest.fn(async () => others)
  const repo = (extra: Record<string, unknown> = {}) => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    ...extra,
  })
  const contacts = repo({ findOne: jest.fn().mockResolvedValue(me), createQueryBuilder: jest.fn(() => chain) })
  const service = new TeamGuardrailsService(
    repo() as never,
    contacts as never,
    ...(Array.from({ length: 15 }, () => repo()) as [
      never,
      never,
      never,
      never,
      never,
      never,
      never,
      never,
      never,
      never,
      never,
      never,
      never,
      never,
      never,
    ]),
  )
  return service
}

/**
 * #4600.4 — la carte « Doublon probable » d'une FICHE contact lit la même règle que le balayage du compte : une
 * adresse partagée par huit fiches (ou générique, ou non vérifiée) n'est pas une preuve d'identité.
 */
describe('TeamGuardrailsService.duplicateCandidates — contact (#4600.4)', () => {
  const ctx = { userId: 'u', workspaceId: WS, role: 'sales' } as never

  it('une adresse partagée par huit fiches ne liste PAS les sept autres « même adresse e-mail »', async () => {
    const me = row('c0', 'equipe@acme.fr')
    const service = build(
      me,
      Array.from({ length: 7 }, (_, i) => row(`c${i + 1}`, 'equipe@acme.fr')),
    )
    expect(await service.duplicateCandidates(ctx, 'contact', 'c0')).toEqual([])
  })

  it('une boîte générique (contact@) ne désigne aucun doublon', async () => {
    const service = build(row('c0', 'contact@acme.fr'), [row('c1', 'contact@acme.fr')])
    expect(await service.duplicateCandidates(ctx, 'contact', 'c0')).toEqual([])
  })

  it('une adresse non vérifiée sur la fiche ne prouve pas l’identité', async () => {
    const service = build(row('c0', 'jean@acme.fr', false), [row('c1', 'jean@acme.fr', true)])
    expect(await service.duplicateCandidates(ctx, 'contact', 'c0')).toEqual([])
  })

  it('une adresse nominative vérifiée, portée par deux fiches : le doublon reste proposé', async () => {
    const service = build(row('c0', 'jean@acme.fr'), [row('c1', 'jean@acme.fr')])
    const out = await service.duplicateCandidates(ctx, 'contact', 'c0')
    expect(out).toEqual([expect.objectContaining({ id: 'c1', reason: 'email' })])
  })
})
