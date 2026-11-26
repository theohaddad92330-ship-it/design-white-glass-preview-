import { describe, expect, it } from 'vitest'
import { resolveSalesforceLoginUrl } from './salesforce-domain.js'

// #4431.1 — le domaine d'organisation Salesforce saisi sur la carte : normalisé, ou refusé avec une raison.
describe('resolveSalesforceLoginUrl', () => {
  it('sans domaine ni sandbox : aucun domaine propre (comportement actuel inchangé)', () => {
    expect(resolveSalesforceLoginUrl('', false)).toEqual({ ok: true, loginUrl: null })
    expect(resolveSalesforceLoginUrl('   ', false)).toEqual({ ok: true, loginUrl: null })
    expect(resolveSalesforceLoginUrl(undefined, false)).toEqual({ ok: true, loginUrl: null })
  })

  it('la case sandbox seule vise test.salesforce.com', () => {
    expect(resolveSalesforceLoginUrl('', true)).toEqual({ ok: true, loginUrl: 'https://test.salesforce.com' })
  })

  it('accepte le domaine My Domain nu', () => {
    expect(resolveSalesforceLoginUrl('societe.my.salesforce.com', false)).toEqual({
      ok: true,
      loginUrl: 'https://societe.my.salesforce.com',
    })
  })

  it('convertit l’hôte Lightning en hôte de connexion', () => {
    expect(resolveSalesforceLoginUrl('Societe.lightning.force.com', false)).toEqual({
      ok: true,
      loginUrl: 'https://societe.my.salesforce.com',
    })
    expect(resolveSalesforceLoginUrl('acme--dev.sandbox.lightning.force.com', false)).toEqual({
      ok: true,
      loginUrl: 'https://acme--dev.sandbox.my.salesforce.com',
    })
  })

  it('normalise une URL collée (schéma, chemin, barre finale)', () => {
    expect(resolveSalesforceLoginUrl('https://societe.lightning.force.com/lightning/page/home?x=1', false)).toEqual({
      ok: true,
      loginUrl: 'https://societe.my.salesforce.com',
    })
    expect(resolveSalesforceLoginUrl(' https://societe.my.salesforce.com/ ', false)).toEqual({
      ok: true,
      loginUrl: 'https://societe.my.salesforce.com',
    })
  })

  it('un domaine saisi l’emporte sur la case sandbox', () => {
    expect(resolveSalesforceLoginUrl('acme--dev.sandbox.my.salesforce.com', true)).toEqual({
      ok: true,
      loginUrl: 'https://acme--dev.sandbox.my.salesforce.com',
    })
  })

  it.each([
    'evil.com',
    'societe.my.salesforce.com.evil.com',
    'evilsalesforce.com',
    'https://evil.com/.my.salesforce.com',
    'user@societe.my.salesforce.com',
    'societe.my.salesforce.com:8443',
    'http://societe.my.salesforce.com',
    'societe my.salesforce.com',
    'salesforce.com',
  ])('refuse %s', input => {
    const r = resolveSalesforceLoginUrl(input, false)
    expect(r.ok).toBe(false)
  })

  it('dit POURQUOI : hôte non autorisé vs saisie illisible', () => {
    expect(resolveSalesforceLoginUrl('evil.com', false)).toEqual({ ok: false, reason: 'host_not_allowed' })
    expect(resolveSalesforceLoginUrl('société ?', false)).toEqual({ ok: false, reason: 'invalid' })
  })
})
