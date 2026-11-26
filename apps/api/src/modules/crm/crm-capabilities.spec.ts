import { ServiceUnavailableException } from '@nestjs/common'
import { crmCapabilities, crmReadFailure } from './crm.service'

/**
 * Ce que ces tests défendent : un CRM branché AVANT l'élargissement des portées
 * ne doit ni mentir sur ce qu'il peut faire, ni tomber en « erreur interne ».
 *
 * Constaté en production le 16/08 : `/crm/pipeline/report` et
 * `/crm/stale-contacts` rendaient un 500 opaque parce que le portail n'avait
 * jamais accordé la lecture des affaires. L'écran, lui, affichait « connecté ».
 */

describe('crmCapabilities', () => {
  it("dit NON à ce que le portail n'a pas accordé", () => {
    const caps = crmCapabilities('oauth crm.objects.contacts.read crm.objects.contacts.write')

    expect(caps.contactsRead).toBe(true)
    expect(caps.contactsWrite).toBe(true)
    expect(caps.dealsRead).toBe(false)
    expect(caps.companiesRead).toBe(false)
  })

  it('accorde les engagements via leur propre portée OU via l’écriture de contacts', () => {
    // HubSpot couvre tâches/réunions/notes tantôt par une portée dédiée, tantôt
    // par l'écriture de contacts. Retenir la plus permissive : griser un bouton
    // qui marche est un mensonge symétrique de celui qu'on corrige.
    expect(crmCapabilities('crm.objects.contacts.write').tasksWrite).toBe(true)
    expect(crmCapabilities('crm.objects.tasks.write').tasksWrite).toBe(true)
    expect(crmCapabilities('crm.objects.contacts.read').tasksWrite).toBe(false)
  })

  it('un portail sans portée enregistrée ne prétend rien', () => {
    const caps = crmCapabilities(null)
    expect(Object.values(caps).every(value => value === false)).toBe(true)
  })
})

describe('crmReadFailure', () => {
  it('distingue une portée jamais accordée d’une panne passagère', () => {
    const missing = crmReadFailure(
      new Error("HubSpot read deals failed: This app hasn't been granted all required scopes to make this call."),
    )
    expect(missing).toBeInstanceOf(ServiceUnavailableException)
    expect(missing.getResponse()).toMatchObject({ reason: 'scope_missing' })

    const transient = crmReadFailure(new Error('socket hang up'))
    expect(transient.getResponse()).toMatchObject({ reason: 'provider_unavailable' })
  })

  it('ne fait fuiter ni la trace technique ni le nom de l’éditeur', () => {
    const body = crmReadFailure(new Error("HubSpot read deals failed: hasn't been granted")).getResponse() as {
      message: string
    }
    expect(body.message).not.toMatch(/hubspot|deals|granted/i)
  })
})
