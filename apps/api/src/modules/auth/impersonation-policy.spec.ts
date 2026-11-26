import { isBlockedDuringImpersonation } from './impersonation-policy'

describe("isBlockedDuringImpersonation (reproduce-but-don't-harm denylist)", () => {
  it('allows every safe (read) method', () => {
    expect(isBlockedDuringImpersonation('GET', '/accounts')).toBe(false)
    expect(isBlockedDuringImpersonation('GET', '/credits')).toBe(false)
    expect(isBlockedDuringImpersonation('HEAD', '/contacts/abc')).toBe(false)
    expect(isBlockedDuringImpersonation('OPTIONS', '/anything')).toBe(false)
    expect(isBlockedDuringImpersonation('get', '/accounts')).toBe(false)
  })

  it('ALLOWS the product mutations an operator needs to reproduce a bug', () => {
    // The exact action that was wrongly blocked before: launching an analysis.
    expect(isBlockedDuringImpersonation('POST', '/analysis/start')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/analysis/abc/enrich-contacts')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/analysis/abc/replan')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/analysis/abc/refresh')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/analysis/abc/cancel')).toBe(false)
    // Contact enrich / edit + dossier ops.
    expect(isBlockedDuringImpersonation('POST', '/contacts/abc/enrich')).toBe(false)
    expect(isBlockedDuringImpersonation('PATCH', '/accounts/abc/commercial-status')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/accounts/abc/contacts/bulk')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/accounts')).toBe(false)
    // A single-contact delete is fine (bug reproduction); only the dossier root
    // delete is blocked (see below).
    expect(isBlockedDuringImpersonation('DELETE', '/accounts/abc/contacts/xyz')).toBe(false)
    expect(isBlockedDuringImpersonation('DELETE', '/contacts/xyz')).toBe(false)
  })

  it('BLOCKS financial routes', () => {
    expect(isBlockedDuringImpersonation('POST', '/credits/checkout')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/credits/packs')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/credits')).toBe(true)
  })

  it('BLOCKS governance / membership routes', () => {
    expect(isBlockedDuringImpersonation('PUT', '/workspaces/x')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/workspaces/x/members')).toBe(true)
    expect(isBlockedDuringImpersonation('DELETE', '/workspaces/x/members/y')).toBe(true)
  })

  it('BLOCKS credential / identity routes (all /auth writes except stop)', () => {
    expect(isBlockedDuringImpersonation('DELETE', '/auth/account')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/auth/password')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/auth/2fa/enable')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/api-keys')).toBe(true)
  })

  it('BLOCKS sending email as the user + connecting integrations as the user', () => {
    expect(isBlockedDuringImpersonation('POST', '/emails/send')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/google/gmail/send')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/microsoft/mail/send')).toBe(true)
    expect(isBlockedDuringImpersonation('GET', '/crm/hubspot/callback')).toBe(false) // OAuth callback is a GET
    expect(isBlockedDuringImpersonation('POST', '/crm/hubspot/connect')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/salesforce/export')).toBe(true)
    // #4186 — la route unifiée d'export de contact vit sous /crm : bloquée aussi.
    expect(isBlockedDuringImpersonation('POST', '/crm/push/contact')).toBe(true)
    // #4187 — Zoho : se connecter ou se déconnecter est un geste d'intégration, jamais sous impersonation.
    expect(isBlockedDuringImpersonation('DELETE', '/zoho')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/zoho/connect')).toBe(true)
    // #4427 — Lemlist : connecter la clé ou pousser un lead est un geste d'intégration fermé en incarnation.
    expect(isBlockedDuringImpersonation('POST', '/lemlist/connect')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/lemlist/push')).toBe(true)
    expect(isBlockedDuringImpersonation('DELETE', '/lemlist')).toBe(true)
    expect(isBlockedDuringImpersonation('GET', '/lemlist/campaigns')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/notion/ingest')).toBe(true)
    expect(isBlockedDuringImpersonation('POST', '/integrations')).toBe(true)
  })

  it('BLOCKS dossier root deletion (data loss) but not deeper deletes', () => {
    expect(isBlockedDuringImpersonation('DELETE', '/accounts/abc')).toBe(true)
    expect(isBlockedDuringImpersonation('DELETE', '/accounts/abc/contacts/xyz')).toBe(false)
  })

  it('allows the impersonation stop endpoint, blocks re-impersonation (consume)', () => {
    expect(isBlockedDuringImpersonation('POST', '/auth/impersonate/stop')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/auth/impersonate/stop?x=1')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/auth/impersonate/stop/')).toBe(false)
    expect(isBlockedDuringImpersonation('POST', '/auth/impersonate/consume')).toBe(true)
  })
})
