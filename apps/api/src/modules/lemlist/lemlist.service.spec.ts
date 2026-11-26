import { BadRequestException, NotFoundException } from '@nestjs/common'
import { LemlistService } from './lemlist.service'
import * as client from './lemlist.client'

jest.mock('./lemlist.client', () => {
  const actual = jest.requireActual('./lemlist.client')
  return {
    ...actual,
    verifyKey: jest.fn(),
    listCampaigns: jest.fn(),
    createLeadInCampaign: jest.fn(),
    listLeadActivities: jest.fn(),
  }
})

jest.mock('../crm/crm-token.crypto', () => ({
  encryptToken: (value: string) => `enc(${value})`,
  decryptToken: (value: string) => value.replace(/^enc\((.*)\)$/, '$1'),
}))

const mocked = client as jest.Mocked<typeof client>

function build(opts: { connected?: boolean; demo?: boolean; contact?: Record<string, unknown> | null } = {}) {
  const connectionRow = opts.connected
    ? { id: 'conn-1', workspace_id: 'ws-1', credentials_enc: 'enc(KEY)', created_at: new Date('2026-10-20T08:00:00Z') }
    : null
  const connections = {
    findOne: jest.fn().mockResolvedValue(connectionRow),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
    delete: jest.fn(),
    update: jest.fn(),
  }
  const pushes = {
    find: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
    update: jest.fn(),
  }
  const contacts = {
    findOne: jest.fn().mockResolvedValue(
      opts.contact === undefined
        ? {
            id: 'ct-1',
            user_id: 'u-1',
            full_name: 'Ada Lovelace',
            email: 'ada@acme.fr',
            title: 'DSI',
            linkedin_url: null,
            phone: null,
            account_id: 'acc-1',
          }
        : opts.contact,
    ),
  }
  const accounts = { findOne: jest.fn().mockResolvedValue({ company_name: 'Acme', website: 'https://www.acme.fr' }) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
    isDemoWorkspace: jest.fn().mockResolvedValue(Boolean(opts.demo)),
  }
  const outbound = {
    request: jest.fn().mockResolvedValue({ decision: 'write_now', request: { id: 'owr-1' } }),
    recordOutcome: jest.fn(),
  }
  const service = new LemlistService(
    connections as never,
    pushes as never,
    contacts as never,
    accounts as never,
    workspaceContext as never,
    outbound as never,
  )
  return { service, connections, pushes, contacts, outbound }
}

describe('LemlistService (#4427)', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('#4427.1 — connexion', () => {
    it('sans clé : non connecté, ZÉRO appel réseau', async () => {
      const { service } = build()
      await expect(service.status('u-1')).resolves.toEqual({ connected: false, connectedAt: null })
      await expect(service.leadsForContact('u-1', 'ct-1')).resolves.toEqual([])
      await expect(service.campaigns('u-1')).rejects.toBeInstanceOf(BadRequestException)
      expect(mocked.verifyKey).not.toHaveBeenCalled()
      expect(mocked.listCampaigns).not.toHaveBeenCalled()
      expect(mocked.listLeadActivities).not.toHaveBeenCalled()
    })

    it('vérifie la clé AVANT de l’enregistrer, chiffrée', async () => {
      const { service, connections } = build()
      mocked.verifyKey.mockResolvedValueOnce('valid')
      await service.connect('u-1', { apiKey: 'KEY' })
      expect(mocked.verifyKey).toHaveBeenCalledWith('KEY')
      expect(connections.save).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws-1', created_by: 'u-1', credentials_enc: 'enc(KEY)' }),
      )
    })

    it('une clé refusée par Lemlist n’est PAS enregistrée', async () => {
      const { service, connections } = build()
      mocked.verifyKey.mockResolvedValueOnce('rejected')
      await expect(service.connect('u-1', { apiKey: 'BAD' })).rejects.toBeInstanceOf(BadRequestException)
      expect(connections.save).not.toHaveBeenCalled()
    })

    it('refusée en salle de démonstration, sans appel', async () => {
      const { service } = build({ demo: true })
      await expect(service.connect('u-1', { apiKey: 'KEY' })).rejects.toBeInstanceOf(BadRequestException)
      expect(mocked.verifyKey).not.toHaveBeenCalled()
    })
  })

  describe('#4427.2 — poussée par la porte d’écriture', () => {
    it('le geste de la personne passe la porte (origin user), puis ajoute le lead et garde sa trace', async () => {
      const { service, outbound, pushes } = build({ connected: true })
      mocked.createLeadInCampaign.mockResolvedValueOnce({ outcome: 'pushed', leadId: 'lea_1', campaignName: 'Relance' })
      const result = await service.pushContact('u-1', { contactId: 'ct-1', campaignId: 'cam_1' })

      expect(outbound.request).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'lemlist', kind: 'enroll_sequence', origin: 'user', workspaceId: 'ws-1' }),
      )
      expect(mocked.createLeadInCampaign).toHaveBeenCalledWith('KEY', 'cam_1', {
        email: 'ada@acme.fr',
        firstName: 'Ada',
        lastName: 'Lovelace',
        jobTitle: 'DSI',
        companyName: 'Acme',
        companyDomain: 'acme.fr',
      })
      expect(outbound.recordOutcome).toHaveBeenCalledWith('owr-1', { ok: true, response: 'lea_1' })
      expect(pushes.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws-1', contact_id: 'ct-1', campaign_id: 'cam_1', lead_id: 'lea_1' }),
        ['workspace_id', 'contact_id', 'campaign_id'],
      )
      expect(result).toEqual({ outcome: 'pushed', campaignId: 'cam_1', campaignName: 'Relance', leadId: 'lea_1' })
    })

    it('la porte qui ne donne pas le feu vert : rien ne part', async () => {
      const { service, outbound } = build({ connected: true })
      outbound.request.mockResolvedValueOnce({ decision: 'pending', request: { id: 'owr-2' } })
      await expect(service.pushContact('u-1', { contactId: 'ct-1', campaignId: 'cam_1' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(mocked.createLeadInCampaign).not.toHaveBeenCalled()
    })

    it('un échec Lemlist est TRACÉ sur la demande, puis remonte', async () => {
      const { service, outbound, pushes } = build({ connected: true })
      mocked.createLeadInCampaign.mockRejectedValueOnce(new client.LemlistApiError(500, 'x'))
      await expect(service.pushContact('u-1', { contactId: 'ct-1', campaignId: 'cam_1' })).rejects.toThrow()
      expect(outbound.recordOutcome).toHaveBeenCalledWith('owr-1', { ok: false, response: 'HTTP 500' })
      expect(pushes.upsert).not.toHaveBeenCalled()
    })

    it('un contact sans e-mail ni LinkedIn ne part pas — rien n’est deviné', async () => {
      const { service, outbound } = build({
        connected: true,
        contact: { id: 'ct-1', full_name: 'X', email: null, linkedin_url: null, account_id: null },
      })
      await expect(service.pushContact('u-1', { contactId: 'ct-1', campaignId: 'cam_1' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(outbound.request).not.toHaveBeenCalled()
    })

    it('un contact d’autrui est introuvable', async () => {
      const { service } = build({ connected: true, contact: null })
      await expect(service.pushContact('u-1', { contactId: 'ct-9', campaignId: 'cam_1' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })

  describe('#4427.3 — statuts relus à la demande', () => {
    it('relit chaque lead poussé ; une relecture en échec vaut null, pas « aucune activité »', async () => {
      const { service, pushes } = build({ connected: true })
      pushes.find.mockResolvedValueOnce([
        {
          campaign_id: 'cam_1',
          campaign_name: 'Relance',
          lead_id: 'lea_1',
          created_at: new Date('2026-10-01T08:00:00Z'),
        },
        { campaign_id: 'cam_2', campaign_name: null, lead_id: 'lea_2', created_at: new Date('2026-10-02T08:00:00Z') },
      ])
      mocked.listLeadActivities
        .mockResolvedValueOnce([{ type: 'emailsSent', createdAt: '2026-10-03T08:00:00.000Z' }])
        .mockRejectedValueOnce(new Error('down'))
      const leads = await service.leadsForContact('u-1', 'ct-1')
      expect(leads[0]).toMatchObject({
        campaignId: 'cam_1',
        campaignName: 'Relance',
        pushedAt: '2026-10-01T08:00:00.000Z',
        statuses: [{ status: 'sent', at: '2026-10-03T08:00:00.000Z' }],
        statusesStale: false,
      })
      expect(leads[0]?.statusesReadAt).toEqual(expect.any(String))
      expect(leads[1]).toEqual({
        campaignId: 'cam_2',
        campaignName: null,
        pushedAt: '2026-10-02T08:00:00.000Z',
        statuses: null,
        statusesReadAt: null,
        statusesStale: false,
      })
      expect(mocked.listLeadActivities).toHaveBeenCalledWith('KEY', 'cam_1', 'lea_1')
    })

    // #4427.3 — le dernier statut relu et sa date sont STOCKÉS : une relecture qui échoue ne les efface pas.
    it('stocke le dernier statut relu et sa date sur le lead poussé', async () => {
      const { service, pushes } = build({ connected: true })
      pushes.find.mockResolvedValueOnce([
        {
          id: 'push-1',
          campaign_id: 'cam_1',
          campaign_name: 'Relance',
          lead_id: 'lea_1',
          created_at: new Date('2026-10-01T08:00:00Z'),
        },
      ])
      mocked.listLeadActivities.mockResolvedValueOnce([{ type: 'emailsOpened', createdAt: '2026-10-04T08:00:00.000Z' }])
      await service.leadsForContact('u-1', 'ct-1')
      expect(pushes.update).toHaveBeenCalledWith(
        { id: 'push-1' },
        expect.objectContaining({
          last_statuses: [{ status: 'opened', at: '2026-10-04T08:00:00.000Z' }],
          statuses_read_at: expect.any(Date),
        }),
      )
    })

    it('relecture en échec : le dernier statut stocké est rendu, daté, marqué périmé — jamais effacé', async () => {
      const { service, pushes } = build({ connected: true })
      pushes.find.mockResolvedValueOnce([
        {
          id: 'push-1',
          campaign_id: 'cam_1',
          campaign_name: 'Relance',
          lead_id: 'lea_1',
          created_at: new Date('2026-10-01T08:00:00Z'),
          last_statuses: [{ status: 'replied', at: '2026-10-05T08:00:00.000Z' }],
          statuses_read_at: new Date('2026-10-06T09:00:00Z'),
        },
      ])
      mocked.listLeadActivities.mockRejectedValueOnce(new Error('down'))
      const [lead] = await service.leadsForContact('u-1', 'ct-1')
      expect(lead).toMatchObject({
        statuses: [{ status: 'replied', at: '2026-10-05T08:00:00.000Z' }],
        statusesReadAt: '2026-10-06T09:00:00.000Z',
        statusesStale: true,
      })
      expect(pushes.update).not.toHaveBeenCalled()
    })
  })
})
