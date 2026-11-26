import type { ConfigService } from '@nestjs/config'
import { BadRequestException } from '@nestjs/common'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'

// Même mock qu'`ia.client.spec.ts` : `HttpClient` appelle le `fetch` d'undici,
// que stubber `global.fetch` n'intercepte jamais.
const mockFetch = jest.fn()
jest.mock('undici', () => ({ Agent: jest.fn(), fetch: mockFetch }))

import { IaClient } from './ia.client'

const fetchMock = mockFetch

function buildClient(): IaClient {
  const config = { get: (_key: string) => 'http://ia.test' } as unknown as ConfigService
  return new IaClient(config, new CorrelationIdService())
}

function okResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, data: { id: 'doc-1' } }),
    json: async () => ({ success: true, data: { id: 'doc-1' } }),
  } as Response
}

/** L'export que le paquet de récupération porte : 17 387 contacts, en clair. */
const CRM_EXPORT = [
  'Prénom;Nom;Société;Fonction;Email;Téléphone',
  'Jean;Dupont;ACME;DSI;jean.dupont@acme.fr;01 42 00 00 00',
  'Marie;Martin;BETA;DAF;marie.martin@beta.fr;01 43 00 00 00',
  'Paul;Durand;GAMMA;CTO;paul.durand@gamma.fr;01 44 00 00 00',
].join('\n')

/**
 * `IaClient.ragIngest` est la porte UNIQUE de la base de connaissance : le dépôt
 * manuel, une page Notion, un document Drive et un CV y passent tous. Le refus
 * vit donc là, et nulle part ailleurs — le brancher appelant par appelant
 * garantirait d'en oublier un, et c'est exactement ce qui est arrivé au plafond
 * de proactivité avant qu'il ne rejoigne `createNotification`.
 */
describe('IaClient.ragIngest — la garde d’ingestion', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('REFUSE un export CRM brut, sans jamais appeler le service IA', async () => {
    const client = buildClient()

    await expect(
      client.ragIngest({ userId: 'u1', title: 'Base contacts', content: CRM_EXPORT }),
    ).rejects.toBeInstanceOf(BadRequestException)

    // Le refus est PRÉALABLE : rien n'est parti, donc rien n'est à effacer.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('dit CE QUI a été écarté et POURQUOI, jamais un refus muet', async () => {
    const client = buildClient()

    const refusal = await client
      .ragIngest({ userId: 'u1', title: 'Base contacts', content: CRM_EXPORT })
      .catch((error: unknown) => error as BadRequestException)

    const message = String((refusal as BadRequestException).message)
    expect(message).toContain('Email')
    expect(message).toContain('carnet')
  })

  it('refuse aussi un fichier déposé en base64 — le contenu n’est pas dans `content`', async () => {
    const client = buildClient()

    await expect(
      client.ragIngest({
        userId: 'u1',
        title: 'Export',
        fileB64: Buffer.from(CRM_EXPORT, 'utf8').toString('base64'),
        filename: 'export_crm.csv',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse un fichier que le manifeste classe hors base de connaissance', async () => {
    const client = buildClient()

    await expect(
      client.ragIngest({
        userId: 'u1',
        title: 'Taxonomie',
        content: 'Directeur des Systèmes d’Information',
        filename: 'title_taxonomy_seed.json',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('laisse passer un document légitime — la garde ne referme pas la porte', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const client = buildClient()

    await expect(
      client.ragIngest({
        userId: 'u1',
        workspaceId: 'ws-1',
        title: 'Notre méthode de compte',
        content: 'Le plan de compte est une discipline hebdomadaire, pas un document figé.',
        category: 'Autre',
      }),
    ).resolves.toEqual({ success: true, data: { id: 'doc-1' } })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('laisse passer un PDF, dont le début décodé est du binaire', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const client = buildClient()

    await expect(
      client.ragIngest({
        userId: 'u1',
        title: 'Plaquette',
        fileB64: Buffer.from('%PDF-1.4\n%âãÏÓ\n', 'utf8').toString('base64'),
        filename: 'plaquette.pdf',
      }),
    ).resolves.toBeDefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('IaClient.ragIngest — #1954.7 scope on the wire', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('omits scope/conversation_id from the wire body when the caller does not pass them (byte-identical wire)', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const client = buildClient()

    await client.ragIngest({ userId: 'u1', workspaceId: 'ws-1', title: 'Playbook', content: 'Contenu.' })

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
    expect('scope' in body).toBe(false)
    expect('conversation_id' in body).toBe(false)
  })

  it('forwards scope=conversation + conversation_id on the wire when the caller passes them', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const client = buildClient()

    await client.ragIngest({
      userId: 'u1',
      workspaceId: 'ws-1',
      title: 'CV joint',
      content: 'Contenu.',
      scope: 'conversation',
      conversationId: 'thread-42',
    })

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
    expect(body.scope).toBe('conversation')
    expect(body.conversation_id).toBe('thread-42')
  })

  it('#2779 — forwards scope=account + account_id on the wire, and omits account_id otherwise', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const client = buildClient()

    await client.ragIngest({
      userId: 'u1',
      workspaceId: 'ws-1',
      title: 'Note de compte',
      content: 'Contenu.',
      scope: 'account',
      accountId: '0000000a-0000-4000-8000-00000000000a',
    })
    await client.ragIngest({
      userId: 'u1',
      workspaceId: 'ws-1',
      title: 'Perso',
      content: 'Contenu.',
      scope: 'personal',
    })

    const bodyOf = (i: number) =>
      JSON.parse((fetchMock.mock.calls[i]![1] as RequestInit).body as string) as Record<string, unknown>
    expect(bodyOf(0).scope).toBe('account')
    expect(bodyOf(0).account_id).toBe('0000000a-0000-4000-8000-00000000000a')
    expect(bodyOf(1).scope).toBe('personal')
    expect('account_id' in bodyOf(1)).toBe(false)
  })

  it('compatibilité des onglets ouverts — la forme FICHIER du chat part sans portée ni fil', async () => {
    // Le lot 2b enverra la portée ; d'ici là, le service IA doit recevoir le
    // corps d'avant 2a, qui le range dans la base de l'espace.
    fetchMock.mockResolvedValue(okResponse())
    const client = buildClient()

    await client.ragIngest({
      userId: 'u1',
      workspaceId: 'ws-1',
      title: 'cv.pdf',
      category: 'chat',
      fileB64: 'JVBERi0xLjQK',
      filename: 'cv.pdf',
    })

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
    expect(body).toMatchObject({ title: 'cv.pdf', category: 'chat', file_b64: 'JVBERi0xLjQK', filename: 'cv.pdf' })
    expect('scope' in body).toBe(false)
    expect('conversation_id' in body).toBe(false)
  })
})
