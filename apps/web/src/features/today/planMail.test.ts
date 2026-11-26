import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodayItem } from './todayQueue'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { canGenerateMail, generatePlanMail } from './planMail'

const item = (over: Partial<TodayItem> = {}): TodayItem =>
  ({
    id: 'plan_item:1',
    kind: 'plan_item',
    channel: 'email',
    contactId: 'c1',
    title: 'Envoyer un email J1 à Muriel Kumpflen',
    signal: { text: 'Repli de CA : 72,4 M€ → 69,1 M€', at: null },
    ...over,
  }) as TodayItem

describe('planMail (#4521.3)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('ne s’offre que sur une carte e-mail du plan dont le contact est résolu', () => {
    expect(canGenerateMail(item())).toBe(true)
    expect(canGenerateMail(item({ contactId: null }))).toBe(false)
    expect(canGenerateMail(item({ channel: 'linkedin' }))).toBe(false)
    expect(canGenerateMail(item({ kind: 'message' }))).toBe(false)
  })

  it('appelle le moteur existant UNE fois, avec la consigne et le signal', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: { subject: ' Votre CA ', body: ' Bonjour Muriel ' } })
    const draft = await generatePlanMail(item())
    expect(draft).toEqual({ subject: 'Votre CA', body: 'Bonjour Muriel' })
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch.mock.calls[0]?.[0]).toMatchObject({
      path: '/ia/message',
      method: 'POST',
      body: {
        contactId: 'c1',
        channel: 'email',
        context: 'Envoyer un email J1 à Muriel Kumpflen',
        parameters: { signal: 'Repli de CA : 72,4 M€ → 69,1 M€' },
      },
    })
  })

  it('sans signal, aucun paramètre n’est inventé', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: { body: 'Bonjour' } })
    await generatePlanMail(item({ signal: null }))
    expect(apiFetch.mock.calls[0]?.[0].body).not.toHaveProperty('parameters')
  })

  it('SAIT DIRE NON — un corps vide ou un refus du moteur est une erreur, jamais un brouillon fabriqué', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: { subject: 'x', body: '  ' } })
    await expect(generatePlanMail(item())).rejects.toThrow('plan_mail_generation_failed')
    apiFetch.mockResolvedValueOnce({ success: false })
    await expect(generatePlanMail(item())).rejects.toThrow('plan_mail_generation_failed')
    await expect(generatePlanMail(item({ contactId: null }))).rejects.toThrow('plan_mail_not_available')
  })
})
