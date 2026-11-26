import { describe, expect, it } from 'vitest'

import { NOTIFICATION_PRESETS, notificationTypeSchema } from './notifications.js'
import {
  SMS_NOTIFICATION_TYPES,
  confirmSmsVerificationSchema,
  isSmsNotificationType,
  smsChannelSettingsSchema,
  smsChannelWithoutNumber,
  smsPhoneNumberSchema,
  startSmsVerificationSchema,
  updateSmsTypeOptInsSchema,
} from './notification-sms.js'

/**
 * #1938.4 — décision Louis 13/09 batch 13 : un canal SMS pour les seules
 * alertes URGENTES, avec consentement explicite.
 *
 * « Urgent » n'est pas redéfini ici : c'est la présélection « Urgent
 * uniquement » du lot 7 (`NOTIFICATION_PRESETS.urgent_only`). Le réglage d'une
 * alerte in-app et son type de notification ne portent pas le même nom
 * (`buy_signals` / `buy_signal`) — la correspondance vit dans ce test, et c'est
 * elle qui fait tomber la CI si l'une des deux listes bouge sans l'autre.
 */
const PREFERENCE_KEY_TO_TYPE: Record<string, string> = {
  buy_signals: 'buy_signal',
  relance_reminders: 'relance',
  weekly_summary: 'weekly_summary',
  weekly_digest: 'weekly_digest',
  credit_low: 'credit_low',
  action_overdue: 'action_overdue',
  watchlist_daily_digest: 'daily_digest',
}

function urgentTypesOf(preset: Record<string, boolean>): string[] {
  return Object.entries(preset)
    .filter(([, on]) => on)
    .map(([key]) => PREFERENCE_KEY_TO_TYPE[key] ?? `?${key}`)
    .sort()
}

describe('SMS — les types éligibles sont ceux de « Urgent uniquement » (#1938.4)', () => {
  it('lit un corpus non vide — la présélection et la liste SMS existent', () => {
    expect(Object.keys(NOTIFICATION_PRESETS.urgent_only).length).toBeGreaterThan(0)
    expect(SMS_NOTIFICATION_TYPES.length).toBeGreaterThan(0)
  })

  it('les types SMS sont EXACTEMENT les alertes que « Urgent uniquement » garde allumées', () => {
    expect([...SMS_NOTIFICATION_TYPES].sort()).toEqual(urgentTypesOf(NOTIFICATION_PRESETS.urgent_only))
  })

  it('SAIT DIRE NON — une présélection urgente élargie au digest quotidien ne correspond plus', () => {
    const tampered = { ...NOTIFICATION_PRESETS.urgent_only, watchlist_daily_digest: true }
    expect([...SMS_NOTIFICATION_TYPES].sort()).not.toEqual(urgentTypesOf(tampered))
  })

  it('chaque type SMS est un type de notification réel du contrat', () => {
    for (const type of SMS_NOTIFICATION_TYPES) expect(notificationTypeSchema.options).toContain(type)
  })

  it('reconnaît un type urgent, refuse un digest ou un événement système', () => {
    expect(isSmsNotificationType('credit_low')).toBe(true)
    expect(isSmsNotificationType('weekly_digest')).toBe(false)
    expect(isSmsNotificationType('system')).toBe(false)
  })
})

describe('SMS — le numéro est au format international E.164', () => {
  it('accepte un mobile français au format international, espaces de bord retirés', () => {
    expect(smsPhoneNumberSchema.parse(' +33612345678 ')).toBe('+33612345678')
  })

  it.each(['0612345678', '+33 6 12 34 56 78', '+0612345678', '+3361234', '+3361234567890123', '+33abc45678', ''])(
    'refuse « %s »',
    value => {
      expect(smsPhoneNumberSchema.safeParse(value).success).toBe(false)
    },
  )

  it('le code de vérification tient en six chiffres, rien d’autre', () => {
    expect(confirmSmsVerificationSchema.safeParse({ code: '042917' }).success).toBe(true)
    expect(confirmSmsVerificationSchema.safeParse({ code: '42917' }).success).toBe(false)
    expect(confirmSmsVerificationSchema.safeParse({ code: '04291a' }).success).toBe(false)
  })
})

describe('SMS — consentement : rien n’est coché par défaut, rien ne s’écrit par effraction', () => {
  it('un canal sans numéro n’a AUCUN type coché, quel que soit son état', () => {
    for (const status of ['coming_soon', 'paused', 'demo', 'ready'] as const) {
      const settings = smsChannelWithoutNumber(status)
      expect(smsChannelSettingsSchema.parse(settings)).toEqual(settings)
      expect(settings.phone).toBeNull()
      expect(settings.verified_at).toBeNull()
      expect(settings.consent_at).toBeNull()
      expect(settings.verification_pending).toBe(false)
      expect(Object.values(settings.types).every(on => on === false)).toBe(true)
    }
  })

  it('le corps de mise à jour des choix ne porte QUE les types — ni numéro, ni vérification, ni consentement', () => {
    const parsed = updateSmsTypeOptInsSchema.parse({
      credit_low: true,
      phone: '+33612345678',
      verified_at: '2026-09-13T08:00:00.000Z',
      consent_at: '2026-09-13T08:00:00.000Z',
      weekly_digest: true,
    } as Record<string, unknown>)
    expect(parsed).toEqual({ credit_low: true })
  })

  it('le corps de demande de code ne porte QUE le numéro', () => {
    const parsed = startSmsVerificationSchema.parse({ phone: '+33612345678', verified_at: 'now' } as Record<
      string,
      unknown
    >)
    expect(parsed).toEqual({ phone: '+33612345678' })
  })
})
