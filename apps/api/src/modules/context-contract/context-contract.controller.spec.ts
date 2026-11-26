import { BadRequestException } from '@nestjs/common'
import type { IdealAccountProfile } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { WorkspaceLauraModeService } from '../workspace/workspace-laura-mode.service'
import { ContextContractController } from './context-contract.controller'

const user = { userId: 'u-1' } as never

/**
 * #2454.9 — la route LIT l'état réel (profil résolu côté serveur, connexion CRM
 * de l'espace actif) : aucune couche n'est affirmée sans sa lecture.
 */
describe('ContextContractController (#2454)', () => {
  function build(opts: {
    profile?: Record<string, unknown>
    version?: number | null
    crm?: { provider: string } | null
    crmThrows?: boolean
    workspaceDefault?: 'my_activity' | 'one_off_mission' | 'neutral'
    idealAccountProfile?: IdealAccountProfile | null
  }) {
    const esnProfile = {
      resolveProfileData: jest.fn().mockResolvedValue(opts.profile ?? { companyName: 'Acme Conseil' }),
      getProfileVersions: jest.fn().mockResolvedValue({
        esnProfileVersion: opts.version === undefined ? 12 : opts.version,
        profileContextVersion: null,
      }),
    }
    const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
    const crmConnections = {
      findOne: opts.crmThrows
        ? jest.fn().mockRejectedValue(new Error('relation does not exist'))
        : jest.fn().mockResolvedValue(opts.crm ?? null),
    }
    // #2889 — la même lecture GARDÉE que `/profile-context` (`getMe`, la
    // garde `withheldStoredContext`) : le contrat ne construit pas sa propre
    // copie du périmètre, il lit celle-là.
    const profileContext = {
      getMe: jest.fn().mockResolvedValue({
        profile_context:
          opts.idealAccountProfile === undefined ? null : { idealAccountProfile: opts.idealAccountProfile },
        status: 'validated',
        withheld: null,
        validatedAt: null,
        chosenEntryStrategy: null,
        auditMoveDecisions: {},
        commercialAuditVersion: null,
        sourceHealth: null,
      }),
    }
    const controller = new ContextContractController(
      esnProfile as unknown as EsnProfileReader,
      profileContext as unknown as ProfileContextService,
      workspace as unknown as WorkspaceContextService,
      crmConnections as unknown as Repository<CrmConnectionEntity>,
      {
        resolveForUser: jest.fn().mockResolvedValue(opts.workspaceDefault ?? 'my_activity'),
      } as unknown as WorkspaceLauraModeService,
    )
    return { controller, crmConnections }
  }

  it('Découvrir : le profil RÉSOLU est nommé et versionné', async () => {
    const { controller } = build({})
    const contract = await controller.get(user, 'discover', undefined)
    expect(contract.surface).toBe('discover')
    expect(contract.mode).toBe('my_activity')
    expect(contract.layers[0]).toEqual({ id: 'esn_profile', state: 'used', name: 'Acme Conseil', version: 12 })
  })

  it('Analyser : le CRM est lu sur l’espace ACTIF, jamais sur un autre', async () => {
    const { controller, crmConnections } = build({ crm: { provider: 'hubspot' } })
    const contract = await controller.get(user, 'analyze', undefined)
    expect(crmConnections.findOne).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1' } })
    expect(contract.layers.find(l => l.id === 'crm')).toEqual({ id: 'crm', state: 'used' })
    // Aucun nom d'éditeur ne voyage : le contrat ne porte pas le fournisseur.
    expect(JSON.stringify(contract)).not.toContain('hubspot')
  })

  // #2922 — le lot multi-comptes lance chaque entreprise par le MÊME chemin
  // qu'Analyser : la route accepte donc `surface=analysis_batch` et lui rend
  // le même contrat de capacité (CRM croisé, aucun portefeuille).
  it('Le lot multi-comptes : accepté par la route, même capacité qu’Analyser', async () => {
    const { controller } = build({ crm: { provider: 'hubspot' } })
    const contract = await controller.get(user, 'analysis_batch', undefined)
    expect(contract.surface).toBe('analysis_batch')
    expect(contract.layers.find(l => l.id === 'crm')).toEqual({ id: 'crm', state: 'used' })
    expect(contract.layers.find(l => l.id === 'portfolio')).toBeUndefined()
  })

  it('une lecture CRM en échec ne prétend JAMAIS une connexion', async () => {
    const { controller } = build({ crmThrows: true })
    const contract = await controller.get(user, 'analyze', undefined)
    expect(contract.layers.find(l => l.id === 'crm')?.state).toBe('not_connected')
  })

  it('« Neutre » demandé sur Découvrir : profil ignoré', async () => {
    const { controller } = build({})
    const contract = await controller.get(user, 'discover', 'neutral')
    expect(contract.layers[0].state).toBe('ignored_by_mode')
  })

  // #2451.1 — la chip dit le mode que le serveur APPLIQUERA : sans mode dans
  // l'appel, c'est le défaut de l'espace (`workspaces.default_context_mode`),
  // exactement celui que `discoverProfileData` / `AnalysisService.start` lisent.
  it("sans mode dans l'appel : le défaut de l'ESPACE s'applique, pas « Mon activité » figé", async () => {
    const { controller } = build({ workspaceDefault: 'neutral' })
    const contract = await controller.get(user, 'discover', undefined)
    expect(contract.mode).toBe('neutral')
    expect(contract.layers[0].state).toBe('ignored_by_mode')
  })

  // #4529.5 — « Découvrir seul » : l'arrivée neutre de Découvrir est posée par le CLIENT (mode explicite), jamais
  // en réécrivant le réglage d'espace. Laura (et Analyser) sans mode dans l'appel gardent donc le défaut de l'espace.
  it("#4529.5 — Laura garde son mode : hors Découvrir, sans mode dans l'appel, c'est le défaut de l'ESPACE qui s'applique", async () => {
    const { controller } = build({ workspaceDefault: 'one_off_mission' })
    for (const surface of ['analyze', 'discover'] as const) {
      const contract = await controller.get(user, surface, undefined)
      expect(contract.mode).toBe('one_off_mission')
    }
    const neutralFromDiscover = await controller.get(user, 'discover', 'neutral')
    expect(neutralFromDiscover.mode).toBe('neutral')
    const afterwards = await controller.get(user, 'analyze', undefined)
    expect(afterwards.mode).toBe('one_off_mission')
  })

  it("un mode explicite gagne sur le défaut de l'espace", async () => {
    const { controller } = build({ workspaceDefault: 'neutral' })
    const contract = await controller.get(user, 'analyze', 'my_activity')
    expect(contract.mode).toBe('my_activity')
    expect(contract.layers[0].state).toBe('used')
  })

  // #2889 — recette écran FAIL du 26/09 : le « Contexte » de /search nommait
  // le profil sans jamais dire ses secteurs prioritaires ni sa taille cible,
  // alors qu'ils étaient renseignés dans le profileur (`idealAccountProfile`).
  it('le périmètre du profileur (idealAccountProfile) est rendu sur la couche esn_profile', async () => {
    const { controller } = build({
      idealAccountProfile: {
        size: 'eti',
        sectorsPriority: ['Banque', 'Assurance'],
        decisionLevel: 'director',
        entryStrategy: 'topDown',
      },
    })
    const contract = await controller.get(user, 'analyze', undefined)
    expect(contract.layers.find(l => l.id === 'esn_profile')).toEqual({
      id: 'esn_profile',
      state: 'used',
      name: 'Acme Conseil',
      version: 12,
      size: 'eti',
      sectorsPriority: ['Banque', 'Assurance'],
    })
  })

  it('aucun profileur généré : aucun périmètre deviné', async () => {
    const { controller } = build({})
    const contract = await controller.get(user, 'analyze', undefined)
    expect(contract.layers.find(l => l.id === 'esn_profile')).not.toHaveProperty('size')
  })

  it('profil vide : aucune couche profil', async () => {
    const { controller } = build({ profile: {}, version: null })
    const contract = await controller.get(user, 'discover', undefined)
    expect(contract.layers.find(l => l.id === 'esn_profile')).toBeUndefined()
  })

  it('surface ou mode inconnus : 400, jamais un contrat deviné', async () => {
    const { controller } = build({})
    await expect(controller.get(user, 'billing', undefined)).rejects.toBeInstanceOf(BadRequestException)
    await expect(controller.get(user, 'discover', 'auto')).rejects.toBeInstanceOf(BadRequestException)
  })
})
