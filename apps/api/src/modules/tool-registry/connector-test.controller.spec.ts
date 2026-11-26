import type { ConnectedTool } from '@bellum/contracts'
import { ConnectorTestController } from './connector-test.controller'
import type { ConnectorProbeService } from './connector-probe.service'
import type { ToolRegistryService } from './tool-registry.service'

/**
 * « Tester » — le bouton que le PDF 7 appelle le plus important de l'écran.
 *
 * Ce qu'il doit prouver, et que ces tests verrouillent :
 *  - une lecture RÉELLE, jamais une écriture (l'ancien bouton postait un vrai
 *    message dans le canal Slack de l'utilisateur) ;
 *  - un échantillon d'objet réel, jamais son CONTENU ;
 *  - une portée absente se voit AVANT d'appeler le fournisseur.
 */

const USER = { userId: 'u-1' } as never

function toolWith(provider: string, scopes: string[]): ConnectedTool {
  return {
    provider,
    family: 'documents',
    display_name: provider,
    status: 'connected',
    scopes,
    owner: 'workspace',
    last_sync: null,
    capability_state: 'operational',
    capabilities: [],
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
    cost_model: { fr: 'inclus', en: 'included' },
    memory_policy: { fr: 'x', en: 'x' },
    coverage_period: null,
    latency: null,
    beta: null,
  }
}

type Deps = {
  tools: ConnectedTool[]
  drive?: () => Promise<{ files: { name: string | null }[]; nextPageToken: string | null }>
  /** SCOPES-I.2 — l'écart de portées que le service rend pour l'utilisateur. */
  gap?: { label: string; missingScopes: string[]; freshConsent: boolean } | null
}

function make(deps: Deps) {
  const recorded: unknown[] = []
  const probeStore = { record: async (input: unknown) => void recorded.push(input) } as unknown as ConnectorProbeService
  const registry = { list: async () => deps.tools } as unknown as ToolRegistryService
  const workspaceContext = { resolveActiveWorkspace: async () => ({ workspaceId: 'ws-1' }) } as never
  const google = {
    listDriveFiles: deps.drive ?? (async () => ({ files: [], nextPageToken: null })),
    searchDriveContent: deps.drive ?? (async () => ({ files: [], nextPageToken: null })),
  } as never
  const controller = new ConnectorTestController(
    registry,
    probeStore,
    workspaceContext,
    google,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { gapFor: async () => deps.gap ?? null } as never,
  )
  return { controller, recorded }
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

describe('POST /tools/:provider/test — une lecture réelle, jamais une écriture', () => {
  it('rend un échantillon d’objets RÉELS, nommés', async () => {
    // « 10 agendas, dont Perso, Équipe, Client EDF » — la forme exacte que le
    // PDF exige. Un compteur seul pourrait mentir ; des noms, non.
    const { controller } = make({
      tools: [toolWith('google-drive', [DRIVE_SCOPE])],
      drive: async () => ({
        files: [{ name: 'Plan de compte ACME' }, { name: 'CV_2024_v3.pdf' }],
        nextPageToken: null,
      }),
    })
    const { results } = await controller.test(USER, 'google-drive')
    const read = results.find(result => result.key === 'read')
    expect(read?.ok).toBe(true)
    expect(read?.sample).toContain('Plan de compte ACME')
  })

  it('voit une portée absente AVANT d’appeler le fournisseur', async () => {
    // Demander à un fournisseur une chose dont on sait déjà qu'on n'a pas le
    // droit de la demander produit un 403 qu'il faut traduire, et une seconde
    // d'attente pour rien.
    let called = false
    const { controller } = make({
      tools: [toolWith('google-drive', [])],
      drive: async () => {
        called = true
        return { files: [], nextPageToken: null }
      },
    })
    const { results } = await controller.test(USER, 'google-drive')
    expect(results.every(result => result.errorCode === 'scope_missing')).toBe(true)
    expect(results[0]?.missingScopes).toEqual([DRIVE_SCOPE])
    expect(called).toBe(false)
  })

  it('traduit un échec fournisseur en code stable plutôt qu’en trace technique', async () => {
    const { controller } = make({
      tools: [toolWith('google-drive', [DRIVE_SCOPE])],
      drive: async () => {
        throw new Error('Google Drive API has not been used in project 240781671020 before or it is disabled.')
      },
    })
    const { results } = await controller.test(USER, 'google-drive')
    expect(results.find(result => result.key === 'read')?.errorCode).toBe('provider_api_disabled')
  })

  it('enregistre la preuve pour que l’écran puisse la dater', async () => {
    const { controller, recorded } = make({
      tools: [toolWith('google-drive', [DRIVE_SCOPE])],
      drive: async () => ({ files: [{ name: 'Note' }], nextPageToken: null }),
    })
    await controller.test(USER, 'google-drive')
    expect(recorded).toContainEqual(expect.objectContaining({ provider: 'google-drive', capability: 'read', ok: true }))
  })

  it('ne teste rien d’un outil inconnu du catalogue plutôt que d’inventer un vert', async () => {
    const { controller } = make({ tools: [] })
    expect((await controller.test(USER, 'inconnu')).results).toEqual([])
  })
})

describe('GET /tools/:provider/repair — le diagnostic', () => {
  it('nomme la portée, le pourquoi, le geste, et ce qui reste bloqué', async () => {
    const { controller } = make({ tools: [toolWith('google-drive', [])] })
    const repair = await controller.repair(USER, 'google-drive')

    expect(repair.missingScopes).toEqual([DRIVE_SCOPE])
    // Le POURQUOI : c'est ce que personne ne savait le 16/08, et ce qui a fait
    // chercher un bug une demi-journée.
    expect(repair.reason).toMatch(/ne s.élargit jamais après coup/i)
    expect(repair.exactAction).toMatch(/reconnecte/i)
    // Ce qui reste bloqué, NOMMÉ : « reconnecte » sans dire ce qu'on récupère
    // ne motive personne.
    expect(repair.blockedCapabilities.length).toBeGreaterThan(0)
  })

  it('dit qu’il n’y a rien à réparer quand toutes les portées sont là', async () => {
    const { controller } = make({ tools: [toolWith('google-drive', [DRIVE_SCOPE])] })
    const repair = await controller.repair(USER, 'google-drive')
    expect(repair.missingScopes).toEqual([])
    expect(repair.blockedCapabilities).toEqual([])
  })

  it('rappelle ce que le produit ne fera JAMAIS avec cet outil', async () => {
    // La moitié de la carte du PDF est faite de ce qu'on ne fait pas. Un
    // utilisateur qui l'ignore suppose le pire.
    const { controller } = make({ tools: [toolWith('google-drive', [DRIVE_SCOPE])] })
    expect((await controller.repair(USER, 'google-drive')).neverDoes.join(' ')).toMatch(/LECTURE seule/)
  })
})

describe('HubSpot — « lire tes affaires » sonde les AFFAIRES (HUBSPOT-J.3)', () => {
  it('la ligne affaires lit des affaires, la ligne contacts des contacts — preuves rangées à part', async () => {
    const recorded: Array<{ capability: string }> = []
    const probeStore = {
      record: async (input: { capability: string }) => void recorded.push(input),
    } as unknown as ConnectorProbeService
    const registry = {
      list: async () => [
        toolWith('hubspot', [
          'crm.objects.contacts.read',
          'crm.objects.companies.read',
          'crm.objects.contacts.write',
          'crm.objects.deals.read',
        ]),
      ],
    } as unknown as ToolRegistryService
    const crm = {
      listContacts: async () => ({ contacts: [{ firstName: 'Hicham', lastName: 'Ritab', email: null }] }),
      listDeals: async () => ({ deals: [{ title: 'Refonte SI' }] }),
    } as never
    const controller = new ConnectorTestController(
      registry,
      probeStore,
      { resolveActiveWorkspace: async () => ({ workspaceId: 'ws-1' }) } as never,
      {} as never,
      {} as never,
      {} as never,
      crm,
      {} as never,
    )
    const { results } = await controller.test(USER, 'hubspot')
    const reads = results.filter(result => result.key === 'read')
    expect(reads[0]?.sample).toContain('Hicham Ritab')
    expect(reads[1]?.label).toContain('affaires')
    expect(reads[1]?.sample).toBe('1 affaire, dont Refonte SI')
    expect(reads[1]?.sample).not.toContain('contact')
    expect(recorded.map(entry => entry.capability)).toContain('read:crm.objects.deals.read')
  })
})

describe('SCOPES-I.2 — de qui est le geste ?', () => {
  const GAP = { label: 'HubSpot', missingScopes: ['crm.objects.deals.read'] }

  it('consentement NEUF : c’est l’app qui ne propose pas la portée — jamais « reconnecte »', async () => {
    const { controller } = make({ tools: [toolWith('google-drive', [])], gap: { ...GAP, freshConsent: true } })
    const repair = await controller.repair(USER, 'google-drive')
    expect(repair.appSide).toBe(true)
    expect(repair.reason).toBe(
      'Cette fonction n’est pas encore ouverte par notre application HubSpot — ce n’est pas à toi de la réparer, l’équipe est prévenue.',
    )
    expect(repair.exactAction).not.toMatch(/reconnecte/i)
  })

  it('accord ANCIEN : la reconnexion reste le geste qui répare', async () => {
    const { controller } = make({ tools: [toolWith('google-drive', [])], gap: { ...GAP, freshConsent: false } })
    const repair = await controller.repair(USER, 'google-drive')
    expect(repair.appSide).toBe(false)
    expect(repair.exactAction).toMatch(/reconnecte/i)
  })

  it('la route scope-gap rend l’écart, ou null quand il n’y en a pas', async () => {
    const withGap = make({ tools: [], gap: { ...GAP, freshConsent: true } })
    expect((await withGap.controller.scopeGap(USER, 'hubspot')).gap).toEqual({ ...GAP, freshConsent: true })
    expect((await make({ tools: [] }).controller.scopeGap(USER, 'hubspot')).gap).toBeNull()
  })
})
