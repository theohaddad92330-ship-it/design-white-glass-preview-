import {
  backoffDelayMs,
  CRM_CALL_BUDGET_PER_PASS,
  crmRefresh,
  crmSyncIntervalMinutes,
  isRateLimited,
  isTimeout,
  maxPassesFor,
  nextFailureCount,
  retryAfterMs,
} from './crm-sync-schedule'

describe('crm-sync-schedule', () => {
  const saved = process.env['CRM_SYNC_INTERVAL_MINUTES']
  afterEach(() => {
    if (saved === undefined) delete process.env['CRM_SYNC_INTERVAL_MINUTES']
    else process.env['CRM_SYNC_INTERVAL_MINUTES'] = saved
  })

  it('vaut 15 minutes par défaut, absent ou vide', () => {
    delete process.env['CRM_SYNC_INTERVAL_MINUTES']
    expect(crmSyncIntervalMinutes()).toBe(15)
    process.env['CRM_SYNC_INTERVAL_MINUTES'] = '  '
    expect(crmSyncIntervalMinutes()).toBe(15)
    process.env['CRM_SYNC_INTERVAL_MINUTES'] = 'abc'
    expect(crmSyncIntervalMinutes()).toBe(15)
  })

  it('est bornée : un 0 ne coupe pas, il est ramené au plancher', () => {
    process.env['CRM_SYNC_INTERVAL_MINUTES'] = '0'
    expect(crmSyncIntervalMinutes()).toBe(5)
    process.env['CRM_SYNC_INTERVAL_MINUTES'] = '99999'
    expect(crmSyncIntervalMinutes()).toBe(1440)
    process.env['CRM_SYNC_INTERVAL_MINUTES'] = '30'
    expect(crmSyncIntervalMinutes()).toBe(30)
  })

  it('recule exponentiellement, plafonné à 16 x l’intervalle', () => {
    delete process.env['CRM_SYNC_INTERVAL_MINUTES']
    const base = 15 * 60_000
    expect(backoffDelayMs(0)).toBe(base)
    expect(backoffDelayMs(1)).toBe(base * 2)
    expect(backoffDelayMs(3)).toBe(base * 8)
    expect(backoffDelayMs(4)).toBe(base * 16)
    expect(backoffDelayMs(40)).toBe(base * 16)
  })

  it('lit Retry-After en secondes ou en date, jamais un délai deviné', () => {
    const now = new Date('2026-10-19T10:00:00Z')
    expect(retryAfterMs('30')).toBe(30_000)
    expect(retryAfterMs('Mon, 19 Oct 2026 10:01:00 GMT', now)).toBe(60_000)
    expect(retryAfterMs('n’importe quoi')).toBeNull()
    expect(retryAfterMs(undefined)).toBeNull()
  })

  it('remet le compteur à zéro au succès et le laisse sur un timeout', () => {
    expect(nextFailureCount(3, 'ok')).toBe(0)
    expect(nextFailureCount(3, 'unknown')).toBe(3)
    expect(nextFailureCount(3, 'failed')).toBe(4)
    expect(nextFailureCount(0, 'rate_limited')).toBe(1)
  })

  it('distingue quota, timeout et panne', () => {
    expect(isRateLimited(new Error('HubSpot search failed: 429 Too Many Requests'))).toBe(true)
    expect(isRateLimited(new Error('boom'))).toBe(false)
    expect(isTimeout(new Error('Synchro hubspot : aucune réponse en 300 s'))).toBe(true)
    expect(isTimeout(new Error('connect ETIMEDOUT 1.2.3.4'))).toBe(true)
    expect(isTimeout(new Error('401'))).toBe(false)
  })

  it('porte un budget d’appels pour CHAQUE fournisseur', () => {
    for (const budget of Object.values(CRM_CALL_BUDGET_PER_PASS)) expect(budget).toBeGreaterThan(0)
    expect(maxPassesFor('odoo')).toBeGreaterThanOrEqual(1)
  })
})

// #4290.17 — la carte DIT comment le CRM se met à jour : webhook (HubSpot, Salesforce) ou relecture toutes les N min.
describe('crmRefresh (#4290.17)', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('Pipedrive n’a pas de webhook : relecture à l’intervalle de la synchro fréquente', () => {
    delete process.env['CRM_SYNC_INTERVAL_MINUTES']
    expect(crmRefresh('pipedrive')).toEqual({ mode: 'poll', everyMinutes: 15 })
    process.env['CRM_SYNC_INTERVAL_MINUTES'] = '30'
    expect(crmRefresh('odoo')).toEqual({ mode: 'poll', everyMinutes: 30 })
  })

  it('HubSpot et Salesforce : temps réel seulement si le secret du webhook est posé — sinon relecture, jamais promis', () => {
    delete process.env['HUBSPOT_WEBHOOK_SECRET']
    expect(crmRefresh('hubspot')).toEqual({ mode: 'poll', everyMinutes: 15 })
    process.env['HUBSPOT_WEBHOOK_SECRET'] = 'x'
    expect(crmRefresh('hubspot')).toEqual({ mode: 'webhook' })
    process.env['SALESFORCE_WEBHOOK_SECRET'] = 'y'
    expect(crmRefresh('salesforce')).toEqual({ mode: 'webhook' })
  })
})
