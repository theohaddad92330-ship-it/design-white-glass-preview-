import { NotFoundException } from '@nestjs/common'
import { ProjectsController } from './projects.controller'

/**
 * #2174.1 / #2174.49 — LE PROJET IMPLICITE (arbitrage de Louis, 16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ TRANCHÉ, ET CONTRE QUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * #2174 voulait un BESOIN sans projet parent, pour créer un besoin sur un compte
 * jamais analysé. Le besoin orphelin a été refusé : un `project_id: null`
 * voyagerait dans toutes les lectures qui remontent du besoin vers le projet —
 * rattachement, agrégats du pipe, vues — donc dans chacune. Le projet se crée
 * donc en même temps que le besoin, au nom du compte, et il existe ensuite pour
 * accueillir le deuxième besoin du même compte.
 *
 * ⚠️ VAGUE 15, 16/09/2026 — LA PORTE EST CELLE DE #2195.33, et c'est le sujet.
 * Deux lots du même jour ont ouvert `POST /projects` chacun de leur côté : ce
 * fichier testait le second handler, mort-né (NestJS ne monte que le premier
 * `@Post()` d'un contrôleur). Il teste désormais la porte UNIQUE. Ce que
 * l'assistant de besoin exigeait est tenu par elle : l'espace résolu côté
 * serveur, le compte hors espace refusé, et le doublon qui rend ce qui existe
 * au lieu d'échouer.
 *
 * Ce que cette suite tient : la porte ne laisse pas l'appelant choisir la
 * NATURE de ce qu'il crée, elle ne crée pas deux fois le même projet, et elle
 * ne crée rien hors de l'espace.
 */
describe('Le projet implicite (#2174.1)', () => {
  const account = '11111111-1111-4111-8111-111111111111'
  const CORPS = { account_id: account, label: 'ACME' }

  const buildController = (
    overrides: {
      created?: { id: string; kind: string; label: string } | null
      existing?: { id: string; kind: string; label: string }[]
    } = {},
  ) => {
    const projects = {
      createForWorkspace: jest
        .fn()
        .mockResolvedValue(
          overrides.created === undefined ? { id: 'proj-neuf', kind: 'manual', label: 'ACME' } : overrides.created,
        ),
      listForWorkspace: jest.fn().mockResolvedValue(overrides.existing ?? []),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    const controller = new ProjectsController(
      projects as never,
      {} as never,
      {} as never,
      workspaceContext as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    return { controller, projects, workspaceContext }
  }

  it('n’ouvre pas la NATURE à l’appelant — le corps ne porte aucun `kind`', async () => {
    const { controller, projects } = buildController()

    await controller.create(CORPS as never, { userId: 'u-1' } as never)

    const [, input] = projects.createForWorkspace.mock.calls[0] as [string, Record<string, unknown>]
    // Le `kind` est écrit par le service, en SQL, et JAMAIS reçu du corps : une
    // saisie qui pourrait se déclarer `pain` se ferait passer pour une douleur
    // relevée par l'analyse.
    expect(Object.keys(input)).not.toContain('kind')
    expect(input).toMatchObject({ accountId: account, label: 'ACME' })
  })

  it('ne crée PAS deux fois le même projet — un double clic rend le premier', async () => {
    const dejaLa = { id: 'proj-deja-la', kind: 'manual', label: 'ACME' }
    const { controller } = buildController({ created: null, existing: [dejaLa] })

    const result = await controller.create(CORPS as never, { userId: 'u-1' } as never)

    expect(result.project).toBe(dejaLa)
    // Rien n'a été rattaché : le doublon n'est pas un renouvellement.
    expect(result.renewal_linked).toBe(false)
  })

  it('REFUSE un compte hors de l’espace — un projet implicite n’ouvre pas de porte', async () => {
    const { controller } = buildController({ created: null, existing: [] })

    await expect(controller.create(CORPS as never, { userId: 'u-1' } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('l’endpoint résout l’ESPACE et ne passe jamais l’identifiant d’utilisateur', async () => {
    const { controller, projects, workspaceContext } = buildController()

    await controller.create(CORPS as never, { userId: 'u-1' } as never)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(projects.createForWorkspace.mock.calls[0]?.[0]).toBe('w-1')
  })
})
