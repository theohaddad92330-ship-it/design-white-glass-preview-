import 'reflect-metadata'
import { ConsultantsController } from './consultants.controller'
import type { ConsultantUpsertDto } from './dto/consultant.dto'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande : la marque
 *  du PRODUIT, c'est-à-dire un espace qui n'a rien posé. */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * LES TROIS MONTANTS NE S'ÉCRIVENT PAS SANS `finance:read` (BEL-BO-003, §3.2).
 *
 * La garde n'existait qu'en LECTURE : `talent.service.ts` retire `minTjmCents`
 * et `costCents` de la liste, `consultants.service.ts` les retire de la fiche.
 * À l'écriture, `create` et `update` passaient le corps entier à `fromUpsert` —
 * donc un `recruiter`, qui porte `records:write` mais PAS `finance:read`,
 * écrivait le coût chargé d'un salarié sans jamais pouvoir le relire.
 *
 * Deux défauts en un, et le second est le plus grave : le formulaire qui MASQUE
 * ces champs envoie quand même les clés, à `null`. Sans cette garde, corriger
 * une faute de frappe sur un nom effacerait trois montants.
 *
 * ⚠️ Le critère est exactement celui de la lecture (`hasPermission(role,
 * 'finance:read')`, sans permissions additives) : deux critères divergents
 * produiraient un champ écrivable et illisible, ou l'inverse.
 */
type Deps = {
  created: ConsultantUpsertDto[]
  updated: ConsultantUpsertDto[]
  controller: ConsultantsController
}

function build(role: string): Deps {
  const created: ConsultantUpsertDto[] = []
  const updated: ConsultantUpsertDto[] = []
  const consultants = {
    create: (_ws: string | null, _uid: string, input: ConsultantUpsertDto) => {
      created.push(input)
      return Promise.resolve({ id: 'c1' })
    },
    update: (_id: string, _ws: string | null, _uid: string, input: ConsultantUpsertDto) => {
      updated.push(input)
      return Promise.resolve({ consultant: { id: 'c1' }, changes: [] })
    },
  }
  const workspaceContext = { resolveActiveWorkspace: () => Promise.resolve({ workspaceId: 'w1', role }) }
  const aliases = { observe: () => Promise.resolve(undefined) }
  const provenance = { commit: () => Promise.resolve(undefined) }
  const controller = new ConsultantsController(
    consultants as never,
    workspaceContext as never,
    {} as never,
    provenance as never,
    {} as never,
    {} as never,
    aliases as never,
    brandsStub as never,
    {} as never,
  )
  return { created, updated, controller }
}

const BODY = {
  full_name: 'Nadia Fournier',
  min_tjm_cents: 45_000,
  cost_rate_cents: 38_000,
  purchase_tjm_cents: 52_000,
  tjm: 620,
  // #2948 (#2329.12/.13/.14/.16) — même porte que les trois montants voisins :
  // la devise/source/contexte/date/confidentialité du TJM.
  tjm_metadata: { currency: 'EUR', source: 'Déclaré', context: null, observed_at: null, confidential: false },
} as unknown as ConsultantUpsertDto

describe('écriture des montants d’une fiche talent', () => {
  it('un rôle qui porte finance:read les écrit', async () => {
    const { controller, created } = build('admin')
    await controller.create(BODY, { userId: 'u1' } as never)
    expect(created[0].min_tjm_cents).toBe(45_000)
    expect(created[0].cost_rate_cents).toBe(38_000)
    expect(created[0].purchase_tjm_cents).toBe(52_000)
    expect(created[0].tjm_metadata).toEqual(BODY.tjm_metadata)
  })

  it('un recruteur — records:write SANS finance:read — ne les écrit pas', async () => {
    const { controller, created } = build('recruiter')
    await controller.create(BODY, { userId: 'u1' } as never)
    expect('min_tjm_cents' in created[0]).toBe(false)
    expect('cost_rate_cents' in created[0]).toBe(false)
    expect('purchase_tjm_cents' in created[0]).toBe(false)
    expect('tjm_metadata' in created[0]).toBe(false)
  })

  it('les RETIRE, il ne les met pas à null — sinon la mise à jour EFFACE', async () => {
    // `fromUpsert` n'écrit que les clés définies : `null` serait une commande
    // d'effacement, pas une abstention.
    const { controller, updated } = build('recruiter')
    await controller.update('c1', BODY, { userId: 'u1' } as never)
    expect(updated[0].min_tjm_cents).toBeUndefined()
    expect('cost_rate_cents' in updated[0]).toBe(false)
  })

  it('laisse passer le TJM cible et le reste de la fiche', async () => {
    // `consultantSchema.tjm` n'est pas sous ce droit : l'emporter dans la garde
    // empêcherait un recruteur de saisir un TJM que tout le monde voit.
    const { controller, created } = build('recruiter')
    await controller.create(BODY, { userId: 'u1' } as never)
    expect(created[0].tjm).toBe(620)
    expect(created[0].full_name).toBe('Nadia Fournier')
  })

  it('ne modifie pas l’objet reçu — le corps de la requête reste intact', async () => {
    const body = { ...BODY } as unknown as ConsultantUpsertDto
    const { controller } = build('recruiter')
    await controller.create(body, { userId: 'u1' } as never)
    expect(body.min_tjm_cents).toBe(45_000)
  })
})
