import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { NotificationSmsChannelEntity } from '../../../database/entities/notification-sms-channel.entity'
import { SmsChannelService } from './sms-channel.service'
import type { SmsSender } from './sms-sender'

/**
 * #1938.4 — décision Louis 13/09 batch 13 : un canal SMS pour les alertes
 * URGENTES, derrière un port, avec consentement explicite.
 *
 * Trois règles que ce fichier fait tenir, dans cet ordre :
 *  1. sans fournisseur, NO-OP STRICT — aucune lecture de la base, aucun envoi ;
 *  2. un SMS ne part qu'à une personne VÉRIFIÉE, CONSENTANTE, pour un type
 *     urgent qu'elle a coché elle-même ;
 *  3. le numéro est une donnée personnelle : jamais dans un journal, jamais le
 *     code en clair en base.
 */

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const PHONE = '+33612345678'
const NEW_PHONE = '+33798765432'
const T0 = new Date('2026-09-13T08:00:00.000Z')

type Row = NotificationSmsChannelEntity

function blankRow(userId: string): Row {
  return {
    user_id: userId,
    phone_e164: PHONE,
    phone_verified_at: null,
    consent_at: null,
    sms_buy_signal: false,
    sms_credit_low: false,
    sms_action_overdue: false,
    verification_code_hash: null,
    verification_expires_at: null,
    verification_sent_at: null,
    verification_attempts: 0,
    created_at: T0,
    updated_at: T0,
  }
}

function verifiedRow(overrides: Partial<Row> = {}): Row {
  return { ...blankRow(USER), phone_verified_at: T0, ...overrides }
}

function channelsRepo(initial: Row[] = []) {
  const rows = new Map<string, Row>(initial.map(row => [row.user_id, { ...row }]))
  return {
    rows,
    findOne: jest.fn(async ({ where }: { where: { user_id: string } }) => {
      const row = rows.get(where.user_id)
      return row ? { ...row } : null
    }),
    create: jest.fn((value: Partial<Row>) => ({ ...blankRow(value.user_id ?? ''), ...value })),
    save: jest.fn(async (value: Row) => {
      rows.set(value.user_id, { ...value })
      return { ...value }
    }),
    delete: jest.fn(async (where: { user_id: string }) => ({ affected: rows.delete(where.user_id) ? 1 : 0 })),
  }
}

function fakeSender(configured: boolean, countryAllowed = true) {
  const sent: { to: string; text: string }[] = []
  const sender = {
    configured,
    allowsCountry: jest.fn(() => countryAllowed),
    send: jest.fn(async (message: { to: string; text: string }) => {
      sent.push(message)
    }),
  }
  return { sender: sender as SmsSender & { send: jest.Mock }, sent }
}

function build(opts: { configured?: boolean; countryAllowed?: boolean; rows?: Row[] } = {}) {
  const repo = channelsRepo(opts.rows)
  const { sender, sent } = fakeSender(opts.configured ?? true, opts.countryAllowed)
  const service = new SmsChannelService(repo as never, sender)
  return { service, repo, sender, sent }
}

/** Tout ce qui est parti vers un journal, sérialisé — pour y chercher un numéro. */
function everythingLogged(spies: jest.SpyInstance[]): string {
  return JSON.stringify(spies.flatMap(spy => spy.mock.calls))
}

let logSpies: jest.SpyInstance[] = []

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  jest.setSystemTime(T0)
  delete process.env.SMS_NOTIFICATIONS_DISABLED
  logSpies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(level =>
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
  )
})

afterEach(() => {
  jest.useRealTimers()
  delete process.env.SMS_NOTIFICATIONS_DISABLED
  for (const spy of logSpies) spy.mockRestore()
})

describe('SmsChannelService.dispatch — sans fournisseur, NO-OP STRICT', () => {
  it('sans fournisseur : AUCUNE lecture, AUCUN envoi, même pour un type urgent coché', async () => {
    const { service, repo, sender } = build({
      configured: false,
      rows: [verifiedRow({ consent_at: T0, sms_credit_low: true })],
    })
    await service.dispatch(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
    expect(repo.findOne).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('interrupteur d’incident posé : aucune lecture, aucun envoi', async () => {
    process.env.SMS_NOTIFICATIONS_DISABLED = 'true'
    const { service, repo, sender } = build({ rows: [verifiedRow({ consent_at: T0, sms_credit_low: true })] })
    await service.dispatch(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
    expect(repo.findOne).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('un type NON urgent ne lit rien — un digest ne part jamais par SMS', async () => {
    const { service, repo, sender } = build({ rows: [verifiedRow({ consent_at: T0, sms_credit_low: true })] })
    await service.dispatch(USER, { type: 'weekly_digest', title: 'Veille de la semaine' })
    await service.dispatch(USER, { type: 'system', title: 'Connexion simultanée' })
    expect(repo.findOne).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('envoie à une personne vérifiée et consentante, pour le type qu’elle a coché', async () => {
    const { service, repo, sent } = build({ rows: [verifiedRow({ consent_at: T0, sms_credit_low: true })] })
    await service.dispatch(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
    expect(repo.findOne).toHaveBeenCalledWith({ where: { user_id: USER } })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe(PHONE)
    expect(sent[0]?.text).toContain('Crédits bientôt épuisés')
    expect(sent[0]?.text.length).toBeLessThanOrEqual(160)
  })

  it('n’envoie RIEN à un numéro non vérifié, même coché et consenti', async () => {
    const { service, sender } = build({
      rows: [{ ...blankRow(USER), consent_at: T0, sms_credit_low: true }],
    })
    await service.dispatch(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('n’envoie RIEN pour un type que la personne n’a pas coché', async () => {
    const { service, sender } = build({ rows: [verifiedRow({ consent_at: T0, sms_credit_low: true })] })
    await service.dispatch(USER, { type: 'buy_signal', title: 'Nouveau signal — Doctolib' })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('n’envoie RIEN sans date de consentement', async () => {
    const { service, sender } = build({ rows: [verifiedRow({ consent_at: null, sms_credit_low: true })] })
    await service.dispatch(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('#4016 L12 — n’envoie RIEN si le pays du numéro n’est plus dans la liste de l’opérateur', async () => {
    const { service, sender } = build({
      countryAllowed: false,
      rows: [verifiedRow({ consent_at: T0, sms_credit_low: true })],
    })
    await service.dispatch(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('sans ligne pour cette personne : rien', async () => {
    const { service, sender } = build()
    await service.dispatch(USER, { type: 'buy_signal', title: 'Nouveau signal — Doctolib' })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('un envoi en échec ne remonte JAMAIS à l’appelant — et le numéro n’apparaît dans aucun journal', async () => {
    const { service, sender } = build({ rows: [verifiedRow({ consent_at: T0, sms_action_overdue: true })] })
    sender.send.mockRejectedValueOnce(new Error(`provider refused ${PHONE}`))
    await expect(
      service.dispatch(USER, { type: 'action_overdue', title: '2 actions en retard' }),
    ).resolves.toBeUndefined()
    expect(everythingLogged(logSpies)).not.toContain(PHONE)
    expect(everythingLogged(logSpies)).not.toContain('612345678')
  })
})

describe('SmsChannelService.getSettings', () => {
  it('en démonstration : état « demo », sans même lire la table', async () => {
    const { service, repo } = build({ rows: [verifiedRow()] })
    const settings = await service.getSettings(USER, true)
    expect(settings.status).toBe('demo')
    expect(settings.phone).toBeNull()
    expect(repo.findOne).not.toHaveBeenCalled()
  })

  it('sans fournisseur : « coming_soon », aucun type coché', async () => {
    const { service } = build({ configured: false })
    const settings = await service.getSettings(USER, false)
    expect(settings.status).toBe('coming_soon')
    expect(Object.values(settings.types)).toEqual([false, false, false])
  })

  it('interrupteur posé : « paused », les choix gardés restent lisibles', async () => {
    process.env.SMS_NOTIFICATIONS_DISABLED = 'true'
    const { service } = build({ rows: [verifiedRow({ consent_at: T0, sms_buy_signal: true })] })
    const settings = await service.getSettings(USER, false)
    expect(settings.status).toBe('paused')
    expect(settings.types.buy_signal).toBe(true)
  })

  it('rend le numéro à SON propriétaire, lu par user_id — jamais le code, ni son empreinte', async () => {
    const { service, repo } = build({
      rows: [
        {
          ...blankRow(USER),
          verification_code_hash: 'empreinte-secrete',
          verification_expires_at: new Date(T0.getTime() + 5 * 60_000),
          verification_sent_at: T0,
        },
      ],
    })
    const settings = await service.getSettings(USER, false)
    expect(repo.findOne).toHaveBeenCalledWith({ where: { user_id: USER } })
    expect(settings.phone).toBe(PHONE)
    expect(settings.verification_pending).toBe(true)
    expect(JSON.stringify(settings)).not.toContain('empreinte-secrete')
  })
})

describe('SmsChannelService.startVerification — la vérification passe par le MÊME port', () => {
  it('sans fournisseur : refusé, rien enregistré, rien envoyé', async () => {
    const { service, repo, sender } = build({ configured: false })
    await expect(service.startVerification(USER, PHONE, false)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(repo.save).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('en démonstration : refusé, aucun numéro enregistré', async () => {
    const { service, repo, sender } = build()
    await expect(service.startVerification(USER, PHONE, true)).rejects.toBeInstanceOf(ForbiddenException)
    expect(repo.save).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('en pause : refusé', async () => {
    process.env.SMS_NOTIFICATIONS_DISABLED = 'true'
    const { service, repo } = build()
    await expect(service.startVerification(USER, PHONE, false)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('enregistre le numéro NON vérifié, envoie un code à six chiffres, et n’en garde que l’empreinte', async () => {
    const { service, repo, sent } = build()
    const settings = await service.startVerification(USER, PHONE, false)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe(PHONE)
    const code = sent[0]?.text.match(/\b\d{6}\b/)?.[0]
    expect(code).toBeDefined()

    const row = repo.rows.get(USER)
    expect(row?.phone_e164).toBe(PHONE)
    expect(row?.phone_verified_at).toBeNull()
    expect(row?.verification_code_hash).toBeTruthy()
    expect(JSON.stringify(row)).not.toContain(code as string)
    expect(settings.verification_pending).toBe(true)
    expect(settings.verified_at).toBeNull()
  })

  it('changer de numéro remet à zéro la vérification ET les choix — un consentement ne se transfère pas', async () => {
    const { service, repo } = build({
      rows: [verifiedRow({ consent_at: T0, sms_credit_low: true, sms_buy_signal: true })],
    })
    await service.startVerification(USER, NEW_PHONE, false)
    const row = repo.rows.get(USER)
    expect(row?.phone_e164).toBe(NEW_PHONE)
    expect(row?.phone_verified_at).toBeNull()
    expect(row?.consent_at).toBeNull()
    expect([row?.sms_buy_signal, row?.sms_credit_low, row?.sms_action_overdue]).toEqual([false, false, false])
  })

  it('une minute entre deux codes — l’envoi coûte, et un bouton martelé ne doit pas vider un budget', async () => {
    const { service, sender } = build()
    await service.startVerification(USER, PHONE, false)
    jest.setSystemTime(new Date(T0.getTime() + 30_000))
    const second = service.startVerification(USER, PHONE, false)
    await expect(second).rejects.toBeInstanceOf(HttpException)
    await expect(second).rejects.toMatchObject({ status: 429 })
    expect(sender.send).toHaveBeenCalledTimes(1)

    jest.setSystemTime(new Date(T0.getTime() + 61_000))
    await service.startVerification(USER, PHONE, false)
    expect(sender.send).toHaveBeenCalledTimes(2)
  })

  it('un envoi en échec : erreur claire, et le numéro n’est dans aucun journal', async () => {
    const { service, sender } = build()
    sender.send.mockRejectedValueOnce(new Error(`timeout sending to ${PHONE}`))
    await expect(service.startVerification(USER, PHONE, false)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(everythingLogged(logSpies)).not.toContain(PHONE)
  })
})

describe('SmsChannelService.confirmVerification', () => {
  async function withPendingCode() {
    const ctx = build()
    await ctx.service.startVerification(USER, PHONE, false)
    const code = ctx.sent[0]?.text.match(/\b\d{6}\b/)?.[0] as string
    const wrong = code === '000000' ? '111111' : '000000'
    return { ...ctx, code, wrong }
  }

  it('le bon code vérifie le numéro et efface le code en attente', async () => {
    const { service, repo, code } = await withPendingCode()
    const settings = await service.confirmVerification(USER, code, false)
    expect(settings.verified_at).toBe(T0.toISOString())
    expect(settings.verification_pending).toBe(false)
    const row = repo.rows.get(USER)
    expect(row?.verification_code_hash).toBeNull()
    // Vérifier n'est pas consentir : aucun type ne se coche au passage.
    expect([row?.sms_buy_signal, row?.sms_credit_low, row?.sms_action_overdue]).toEqual([false, false, false])
    expect(row?.consent_at).toBeNull()
  })

  it('un mauvais code compte un essai et ne vérifie rien', async () => {
    const { service, repo, wrong } = await withPendingCode()
    await expect(service.confirmVerification(USER, wrong, false)).rejects.toMatchObject({ status: 400 })
    expect(repo.rows.get(USER)?.phone_verified_at).toBeNull()
    expect(repo.rows.get(USER)?.verification_attempts).toBe(1)
  })

  it('après cinq essais, le code est invalidé — même le bon ne passe plus', async () => {
    const { service, repo, code, wrong } = await withPendingCode()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.confirmVerification(USER, wrong, false)).rejects.toMatchObject({ status: 400 })
    }
    await expect(service.confirmVerification(USER, code, false)).rejects.toMatchObject({ status: 400 })
    expect(repo.rows.get(USER)?.phone_verified_at).toBeNull()
  })

  it('un code expiré (dix minutes) ne passe pas', async () => {
    const { service, repo, code } = await withPendingCode()
    jest.setSystemTime(new Date(T0.getTime() + 10 * 60_000 + 1))
    await expect(service.confirmVerification(USER, code, false)).rejects.toMatchObject({ status: 400 })
    expect(repo.rows.get(USER)?.phone_verified_at).toBeNull()
  })

  it('sans code en attente : refusé', async () => {
    const { service } = build({ rows: [blankRow(USER)] })
    await expect(service.confirmVerification(USER, '123456', false)).rejects.toMatchObject({ status: 400 })
  })

  it('en démonstration : refusé', async () => {
    const { service } = build()
    await expect(service.confirmVerification(USER, '123456', true)).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('SmsChannelService.updateTypes — opt-in par type, retrait toujours possible', () => {
  it('cocher sans numéro vérifié : refusé, rien écrit', async () => {
    const { service, repo } = build({ rows: [blankRow(USER)] })
    await expect(service.updateTypes(USER, { credit_low: true }, false)).rejects.toBeInstanceOf(ConflictException)
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('cocher un type avec un numéro vérifié : ce type seul, et la date du consentement', async () => {
    const { service, repo } = build({ rows: [verifiedRow()] })
    const settings = await service.updateTypes(USER, { credit_low: true }, false)
    expect(settings.types).toEqual({ buy_signal: false, credit_low: true, action_overdue: false })
    expect(settings.consent_at).toBe(T0.toISOString())
    expect(repo.rows.get(USER)?.consent_at).toEqual(T0)
  })

  it('décocher le dernier type efface la date de consentement', async () => {
    const { service, repo } = build({ rows: [verifiedRow({ consent_at: T0, sms_buy_signal: true })] })
    const settings = await service.updateTypes(USER, { buy_signal: false }, false)
    expect(settings.consent_at).toBeNull()
    expect(repo.rows.get(USER)?.sms_buy_signal).toBe(false)
  })

  it('décocher reste possible EN PAUSE — un retrait ne dépend jamais du fournisseur', async () => {
    process.env.SMS_NOTIFICATIONS_DISABLED = 'true'
    const { service, repo } = build({ rows: [verifiedRow({ consent_at: T0, sms_buy_signal: true })] })
    await service.updateTypes(USER, { buy_signal: false }, false)
    expect(repo.rows.get(USER)?.sms_buy_signal).toBe(false)
  })

  it('cocher en pause : refusé', async () => {
    process.env.SMS_NOTIFICATIONS_DISABLED = 'true'
    const { service, repo } = build({ rows: [verifiedRow()] })
    await expect(service.updateTypes(USER, { credit_low: true }, false)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('en démonstration : refusé, rien lu, rien écrit', async () => {
    const { service, repo } = build()
    await expect(service.updateTypes(USER, { credit_low: true }, true)).rejects.toBeInstanceOf(ForbiddenException)
    expect(repo.findOne).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('décocher sans ligne : aucun effet, aucune écriture', async () => {
    const { service, repo } = build()
    const settings = await service.updateTypes(USER, { credit_low: false }, false)
    expect(settings.phone).toBeNull()
    expect(repo.save).not.toHaveBeenCalled()
  })
})

describe('SmsChannelService.withdraw — le retrait en un clic', () => {
  it('retire la ligne de la personne — numéro, vérification, choix — et d’elle seule', async () => {
    const { service, repo } = build({
      rows: [verifiedRow({ consent_at: T0, sms_credit_low: true }), { ...blankRow(OTHER), phone_verified_at: T0 }],
    })
    await service.withdraw(USER)
    expect(repo.delete).toHaveBeenCalledTimes(1)
    expect(repo.delete).toHaveBeenCalledWith({ user_id: USER })
    expect(repo.delete).not.toHaveBeenCalledWith({})
    expect(repo.rows.has(USER)).toBe(false)
    expect(repo.rows.has(OTHER)).toBe(true)
  })
})
