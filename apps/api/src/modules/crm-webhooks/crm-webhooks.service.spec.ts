import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { createHmac } from 'node:crypto'
import type { DataSource } from 'typeorm'
import { CrmWebhooksService } from './crm-webhooks.service'

const URI = 'https://api.bellum.test/webhooks/crm/hubspot'

function hubspotRequest(events: unknown[], secret = 'hs-secret') {
  const rawBody = Buffer.from(JSON.stringify(events))
  const timestamp = String(Date.now())
  const signature = createHmac('sha256', secret).update(`POST${URI}${rawBody.toString()}${timestamp}`).digest('base64')
  return {
    rawBody,
    method: 'POST',
    uri: URI,
    headers: { 'x-hubspot-request-timestamp': timestamp, 'x-hubspot-signature-v3': signature },
  }
}

function harness() {
  const seen = new Set<string>()
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM crm_connections')) return params[1] === '7' ? [{ workspace_id: 'ws-1', user_id: 'u-1' }] : []
    if (sql.includes('INSERT INTO crm_webhook_events')) {
      const key = `${params[1]}:${params[2]}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ id: key }]
    }
    return []
  })
  const syncWorkspace = jest.fn().mockResolvedValue({})
  const syncProvider = jest.fn().mockResolvedValue({ ran: true })
  const service = new CrmWebhooksService(
    { query } as unknown as DataSource,
    { syncProvider } as never,
    { syncWorkspace } as never,
  )
  return { service, syncWorkspace, syncProvider, query }
}

// #4189.7 (Louis 15/10/2026) — webhooks HubSpot / Salesforce : signés, idempotents, synchro ciblée.
describe('#4189.7 — CrmWebhooksService', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('sans secret configuré : no-op STRICT, la route n’existe pas (404), rien n’est lu ni écrit', async () => {
    delete process.env['HUBSPOT_WEBHOOK_SECRET']
    const h = harness()
    await expect(h.service.receive('hubspot', hubspotRequest([{ eventId: 1, portalId: 7 }]))).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(h.query).not.toHaveBeenCalled()
  })

  it('sait dire NON — une signature invalide est rejetée (401) avant toute lecture', async () => {
    process.env['HUBSPOT_WEBHOOK_SECRET'] = 'hs-secret'
    const h = harness()
    const forged = hubspotRequest([{ eventId: 1, portalId: 7 }], 'pas-le-bon')
    await expect(h.service.receive('hubspot', forged)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(h.query).not.toHaveBeenCalled()
  })

  it('un événement valide déclenche UNE synchro ciblée de l’espace ; le même événement renvoyé ne relance rien', async () => {
    process.env['HUBSPOT_WEBHOOK_SECRET'] = 'hs-secret'
    const h = harness()
    const first = await h.service.receive('hubspot', hubspotRequest([{ eventId: 42, portalId: 7 }]))
    expect(first).toEqual({ accepted: 1, duplicates: 0, unknownAccounts: 0 })
    const again = await h.service.receive('hubspot', hubspotRequest([{ eventId: 42, portalId: 7 }]))
    expect(again).toEqual({ accepted: 0, duplicates: 1, unknownAccounts: 0 })
    await new Promise(resolve => setImmediate(resolve))
    expect(h.syncWorkspace).toHaveBeenCalledTimes(1)
    expect(h.syncWorkspace).toHaveBeenCalledWith('ws-1')
  })

  it('un portail inconnu ne déclenche rien (jamais une synchro devinée)', async () => {
    process.env['HUBSPOT_WEBHOOK_SECRET'] = 'hs-secret'
    const h = harness()
    const outcome = await h.service.receive('hubspot', hubspotRequest([{ eventId: 9, portalId: 999 }]))
    expect(outcome).toEqual({ accepted: 0, duplicates: 0, unknownAccounts: 1 })
    expect(h.syncWorkspace).not.toHaveBeenCalled()
  })

  it('Salesforce : secret partagé, puis la synchro incrémentale du connecteur', async () => {
    process.env['SALESFORCE_WEBHOOK_SECRET'] = 'sf-secret'
    const h = harness()
    const rawBody = Buffer.from(JSON.stringify({ eventId: 'e-1', organizationId: '7' }))
    const ts = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', 'sf-secret').update(`${ts}.${rawBody.toString()}`).digest('hex')
    const outcome = await h.service.receive('salesforce', {
      rawBody,
      method: 'POST',
      uri: 'x',
      headers: { 'x-bellum-timestamp': ts, 'x-bellum-signature': signature },
    })
    expect(outcome.accepted).toBe(1)
    await new Promise(resolve => setImmediate(resolve))
    expect(h.syncProvider).toHaveBeenCalledWith('u-1', 'salesforce')
  })

  it('SYNC-C.5 — avec la file branchée : l’événement met UN passage ciblé en file (espace + fournisseur), sans lecture directe', async () => {
    process.env['HUBSPOT_WEBHOOK_SECRET'] = 'hs-secret'
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM crm_connections')) return [{ workspace_id: 'ws-1', user_id: 'u-1' }]
      if (sql.includes('INSERT INTO crm_webhook_events')) return [{ id: 'x' }]
      return []
    })
    const enqueueTargeted = jest.fn().mockResolvedValue(undefined)
    const syncWorkspace = jest.fn()
    const service = new CrmWebhooksService(
      { query } as unknown as DataSource,
      undefined,
      { syncWorkspace } as never,
      { enqueueTargeted } as never,
    )
    await service.receive('hubspot', hubspotRequest([{ eventId: 1, portalId: 7 }]))
    await new Promise(resolve => setImmediate(resolve))
    expect(enqueueTargeted).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'u-1', provider: 'hubspot' })
    expect(syncWorkspace).not.toHaveBeenCalled()
  })
})
