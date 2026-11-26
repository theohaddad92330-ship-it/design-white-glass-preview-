import { CopilotReverseMarketController } from './copilot-reverse-market.controller'
import { CopilotReverseMarketDto } from './dto/copilot-bridge.dto'

const USER = '99999999-9999-4999-8999-999999999999'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

// #3816.1 — le maillon profil → comptes de Laura lit LE reverse market d'UN talent,
// celui de l'écran (`GET consultants/:id/reverse-market`), jamais un second calcul.
describe('CopilotReverseMarketController (#3816.1)', () => {
  const build = (market: unknown) => {
    const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1', role: 'member' })) }
    const reverseMarket = { forTalent: jest.fn(async () => market), forProfile: jest.fn(async () => market) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotReverseMarketController(workspaceContext as any, reverseMarket as any)
    return { controller, workspaceContext, reverseMarket }
  }

  it('lit le marché inversé dans l’espace ACTIF du demandeur', async () => {
    const market = { consultantId: A, recruiters: [], demand: [] }
    const { controller, workspaceContext, reverseMarket } = build(market)
    const out = await controller.reverseMarket({ userId: USER, consultantId: A })
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith(USER)
    expect(reverseMarket.forTalent).toHaveBeenCalledWith(A, 'ws-1', USER)
    expect(out).toEqual({ found: true, market })
  })

  it('un talent hors de cet espace se DIT (found: false), jamais un marché vide', async () => {
    const { controller } = build(null)
    expect(await controller.reverseMarket({ userId: USER, consultantId: A })).toEqual({ found: false })
  })

  it('refuse un espace glissé par l’appelant et un identifiant qui n’est pas un uuid', () => {
    const schema = CopilotReverseMarketDto.schema
    expect(schema.safeParse({ userId: USER, consultantId: A }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, consultantId: 'Marie Dupont' }).success).toBe(false)
    expect(schema.safeParse({ userId: USER, consultantId: A, workspaceId: 'x' }).success).toBe(false)
  })

  // KEVIN-FIX K.6 — la demande gagne sur la fiche ; un profil en texte libre n'a pas besoin de fiche.
  it('K.6 — passe la zone et les compétences DE LA DEMANDE au calcul de la fiche', async () => {
    const { controller, reverseMarket } = build({ consultantId: A })
    await controller.reverseMarket({ userId: USER, consultantId: A, skills: ['Java'], zones: ['59'] })
    expect(reverseMarket.forTalent).toHaveBeenCalledWith(A, 'ws-1', USER, { skills: ['Java'], zones: ['59'] })
  })

  it('K.6 — un profil décrit en texte libre lit le marché sans fiche du vivier', async () => {
    const market = { consultantId: '', recruiters: [], demand: [] }
    const { controller, reverseMarket } = build(market)
    const out = await controller.reverseMarket({ userId: USER, skills: ['Java', 'Spring'], zones: ['59'] })
    expect(reverseMarket.forProfile).toHaveBeenCalledWith({ skills: ['Java', 'Spring'], zones: ['59'] }, 'ws-1', USER)
    expect(reverseMarket.forTalent).not.toHaveBeenCalled()
    expect(out).toEqual({ found: true, market })
  })

  it('K.6 — ni fiche ni compétence : refusé (la garde sait dire NON)', () => {
    const schema = CopilotReverseMarketDto.schema
    expect(schema.safeParse({ userId: USER }).success).toBe(false)
    expect(schema.safeParse({ userId: USER, zones: ['59'] }).success).toBe(false)
    expect(schema.safeParse({ userId: USER, skills: ['Java'], zones: ['59'] }).success).toBe(true)
  })
})
