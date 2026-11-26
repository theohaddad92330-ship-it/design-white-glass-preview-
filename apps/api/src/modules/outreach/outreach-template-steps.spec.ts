import type { CreateOutreachSequenceRequest } from '@bellum/contracts'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { buildStepPayload, resolveSteps } from './outreach.service'

// #3756.2/.3 — une étape issue d'un modèle de bibliothèque porte son brouillon
// RÉSOLU, ou ses variables manquantes (bloquée, sans brouillon).
describe('étapes issues d’un modèle de bibliothèque (#3756)', () => {
  const contact = { email_message: { body: 'brouillon du contact', subject: 'x' } } as unknown as ContactEntity
  const dto = (steps: CreateOutreachSequenceRequest['steps']): CreateOutreachSequenceRequest => ({
    contact_id: '11111111-1111-4111-8111-111111111111',
    campaign_label: 'Campagne 1',
    steps,
  })

  it('le brouillon du modèle remplace celui du contact', () => {
    const [step] = resolveSteps(dto([{ kind: 'email', offset_days: 0, draft: { subject: 'Objet', body: 'Corps' } }]))
    const payload = buildStepPayload(step!, contact)
    expect(payload['email_draft']).toEqual({ subject: 'Objet', body: 'Corps', channel: 'email' })
    expect(payload['draft_available']).toBe(true)
    expect(payload['blocked_variables']).toBeUndefined()
  })

  it('une étape bloquée nomme la variable et ne porte AUCUN brouillon', () => {
    const [step] = resolveSteps(
      dto([{ kind: 'email', offset_days: 0, blocked_variables: ['Prénom manquant : {{firstName}}'] }]),
    )
    const payload = buildStepPayload(step!, contact)
    expect(payload['blocked_variables']).toEqual(['Prénom manquant : {{firstName}}'])
    expect(payload['email_draft']).toBeNull()
    expect(payload['draft_available']).toBe(false)
  })

  it('sans brouillon de modèle, le comportement historique est inchangé', () => {
    const [step] = resolveSteps(dto([{ kind: 'email', offset_days: 0 }]))
    expect(buildStepPayload(step!, contact)['email_draft']).toEqual(contact.email_message)
  })
})

// Lot L-C (#4166) — le texte préparé d'une étape LinkedIn ou appel (assistant /
// modèles) est gardé tel quel ; sans texte préparé, le comportement du lot L-B
// (texte du contact) reste identique.
describe('étapes LinkedIn et appel préparées par un modèle (#4166)', () => {
  const contact = {
    linkedin_message: 'message du contact',
    linkedin_url: 'https://linkedin.example/in/marie',
    phone_script: 'trame du contact',
  } as unknown as ContactEntity
  const dto = (steps: CreateOutreachSequenceRequest['steps']): CreateOutreachSequenceRequest => ({
    contact_id: '11111111-1111-4111-8111-111111111111',
    steps,
  })

  it('le texte préparé d’un message LinkedIn remplace celui du contact', () => {
    const [step] = resolveSteps(
      dto([{ kind: 'linkedin_message', offset_days: 0, draft: { subject: '', body: 'Bonjour Marie' } }]),
    )
    const payload = buildStepPayload(step!, contact)
    expect(payload['linkedin_draft']).toEqual({
      body: 'Bonjour Marie',
      profile_url: 'https://linkedin.example/in/marie',
    })
    expect(payload['draft_available']).toBe(true)
  })

  it('la trame d’appel préparée remplace celle du contact', () => {
    const [step] = resolveSteps(
      dto([{ kind: 'call', offset_days: 0, draft: { subject: '', body: 'Trame : 1. contexte' } }]),
    )
    const payload = buildStepPayload(step!, contact)
    expect(payload['call_script']).toBe('Trame : 1. contexte')
    expect(payload['draft_available']).toBe(true)
  })

  it('sans texte préparé, le texte du contact reste lu comme avant', () => {
    const [step] = resolveSteps(dto([{ kind: 'linkedin_message', offset_days: 0 }]))
    expect(buildStepPayload(step!, contact)['linkedin_draft']).toEqual({
      body: 'message du contact',
      profile_url: 'https://linkedin.example/in/marie',
    })
  })
})
