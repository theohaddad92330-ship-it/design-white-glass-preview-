import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { prepareStepMessage } from './playbook-messages'

/** Lot L-C (#4166) — Laura prépare le message d'UNE étape ; un échec reste vide, jamais inventé. */

const contactId = '11111111-1111-4111-8111-111111111111'

describe('prepareStepMessage', () => {
  beforeEach(() => apiFetch.mockReset())

  it('e-mail : demande un message e-mail au moteur existant, avec le contexte', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Objet', body: 'Corps' } })
    const draft = await prepareStepMessage({ contactId, kind: 'email', context: 'Étape : X.' })
    expect(draft).toEqual({ subject: 'Objet', body: 'Corps' })
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/ia/message',
        method: 'POST',
        body: { contactId, channel: 'email', context: 'Étape : X.' },
      }),
    )
  })

  it('LinkedIn : canal linkedin, sans objet', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'ignoré', body: 'Salut' } })
    const draft = await prepareStepMessage({ contactId, kind: 'linkedin_message', context: 'c' })
    expect(draft).toEqual({ subject: '', body: 'Salut' })
    expect(apiFetch.mock.calls[0]?.[0].body.channel).toBe('linkedin')
  })

  it('appel : canal téléphone (la trame), sans objet', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { body: 'Trame' } })
    expect(await prepareStepMessage({ contactId, kind: 'call', context: 'c' })).toEqual({ subject: '', body: 'Trame' })
    expect(apiFetch.mock.calls[0]?.[0].body.channel).toBe('phone')
  })

  it('une invitation LinkedIn n’appelle PAS le moteur : elle part sans note', async () => {
    expect(await prepareStepMessage({ contactId, kind: 'linkedin_invite', context: 'c' })).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('une tâche ou un rappel ne se rédigent pas', async () => {
    expect(await prepareStepMessage({ contactId, kind: 'task', context: 'c' })).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('un échec du moteur donne null — jamais un texte de repli inventé', async () => {
    apiFetch.mockRejectedValue(new Error('boom'))
    expect(await prepareStepMessage({ contactId, kind: 'email', context: 'c' })).toBeNull()
    apiFetch.mockResolvedValue({ success: false })
    expect(await prepareStepMessage({ contactId, kind: 'email', context: 'c' })).toBeNull()
    apiFetch.mockResolvedValue({ success: true, data: { body: '  ' } })
    expect(await prepareStepMessage({ contactId, kind: 'email', context: 'c' })).toBeNull()
  })
})
