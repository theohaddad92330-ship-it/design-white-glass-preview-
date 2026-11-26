import { AdminDocsService } from './admin-docs.service'

/**
 * #4295.27 (#4016.121) — « Relire le statut » d'une proposition lisait TOUTES les signatures en attente du compte
 * outil, sans filtre par proposition et sans jamais lire « signé ». Désormais : l'identifiant de la demande est
 * stocké à l'ENVOI, rattaché à la proposition, et le statut relu est celui de CETTE demande — « signé » seulement si
 * l'outil la liste parmi les demandes terminées (preuve du connecteur), jamais présumé.
 */
const WORKSPACE = 'ws-1'
const PROJECT = '11111111-1111-4111-8111-111111111111'

function build(project: Record<string, unknown> | null) {
  const connections = {
    findOne: jest.fn().mockResolvedValue({ provider: 'yousign', credentials_enc: 'x', base_url: null }),
    find: jest.fn().mockResolvedValue([]),
  }
  const projects = {
    findOne: jest.fn().mockResolvedValue(project),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
  }
  const service = new AdminDocsService(connections as never, projects as never, workspaceContext as never)
  return { service, projects }
}

jest.mock('../crm/crm-token.crypto', () => ({
  decryptToken: () => 'key\n',
  encryptToken: (v: string) => v,
}))

const lists = (ongoing: unknown, done: unknown) => {
  global.fetch = jest.fn(async (url: string) => {
    const body = String(url).includes('status=done') ? done : String(url).includes('status=ongoing') ? ongoing : null
    return { ok: body !== null, status: body !== null ? 200 : 404, json: async () => body, text: async () => '' }
  }) as never
}

describe('AdminDocsService.proposalSignatureStatus (#4295.27)', () => {
  it('une proposition sans demande envoyée ne lit RIEN chez l’outil', async () => {
    const { service } = build({ id: PROJECT, signature_request_id: null })
    lists({ data: [] }, { data: [] })
    const status = await service.proposalSignatureStatus('u-1', PROJECT)
    expect(status.state).toBe('not_sent')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('la demande de CETTE proposition est « en attente » quand l’outil la liste en cours — pas les autres', async () => {
    const { service, projects } = build({
      id: PROJECT,
      signature_request_id: 'sr-1',
      signature_sent_at: new Date('2026-10-20T08:00:00.000Z'),
    })
    lists({ data: [{ id: 'sr-AUTRE' }, { id: 'sr-1' }] }, { data: [] })
    const status = await service.proposalSignatureStatus('u-1', PROJECT)
    expect(status.state).toBe('pending')
    expect(status.signatureRequestId).toBe('sr-1')
    expect(projects.update).toHaveBeenCalledWith(
      { id: PROJECT, workspace_id: WORKSPACE },
      expect.objectContaining({ signature_status: 'pending' }),
    )
  })

  it('« signé » SEULEMENT quand l’outil liste cette demande parmi les terminées', async () => {
    const { service } = build({ id: PROJECT, signature_request_id: 'sr-1' })
    lists({ data: [{ id: 'sr-AUTRE' }] }, { data: [{ id: 'sr-1' }] })
    expect((await service.proposalSignatureStatus('u-1', PROJECT)).state).toBe('signed')
  })

  it('introuvable dans les deux listes : « non retrouvée », jamais « signé » ni « refusé »', async () => {
    const { service } = build({ id: PROJECT, signature_request_id: 'sr-1' })
    lists({ data: [{ id: 'x' }] }, { data: [{ id: 'y' }] })
    expect((await service.proposalSignatureStatus('u-1', PROJECT)).state).toBe('not_found')
  })

  it('l’outil ne répond pas : « non lu », jamais présumé', async () => {
    const { service } = build({ id: PROJECT, signature_request_id: 'sr-1' })
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => null })) as never
    expect((await service.proposalSignatureStatus('u-1', PROJECT)).state).toBe('unread')
  })

  it('une proposition d’un autre espace n’existe pas ici', async () => {
    const { service } = build(null)
    await expect(service.proposalSignatureStatus('u-1', PROJECT)).rejects.toThrow()
  })
})

describe('AdminDocsService.sendToSignature — l’identifiant est stocké à l’envoi (#4295.27)', () => {
  it('envoi réussi + proposition : la demande est rattachée à la proposition', async () => {
    const { service, projects } = build({ id: PROJECT })
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '' })) as never
    const out = await service.sendToSignature('u-1', 'sr-9', PROJECT)
    expect(out.ok).toBe(true)
    expect(projects.update).toHaveBeenCalledWith(
      { id: PROJECT, workspace_id: WORKSPACE },
      expect.objectContaining({ signature_request_id: 'sr-9', signature_provider: 'yousign' }),
    )
  })

  it('envoi refusé : rien n’est stocké', async () => {
    const { service, projects } = build({ id: PROJECT })
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, text: async () => 'non' })) as never
    expect((await service.sendToSignature('u-1', 'sr-9', PROJECT)).ok).toBe(false)
    expect(projects.update).not.toHaveBeenCalled()
  })
})
