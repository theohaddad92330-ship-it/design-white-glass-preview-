import { decideSend, LINKEDIN_DAILY_SEND_LIMIT, type Mandate } from './linkedin-mandate'

const NOW = new Date('2026-10-29T10:00:00.000Z')

function mandate(over: Partial<Mandate> = {}): Mandate {
  return {
    id: 'm1',
    grantedBy: 'u1',
    grantedAt: new Date('2026-10-28T08:00:00.000Z'),
    validFrom: new Date('2026-10-28T08:00:00.000Z'),
    validUntil: new Date('2026-11-28T08:00:00.000Z'),
    dailyLimit: 5,
    revokedAt: null,
    ...over,
  }
}

const base = { now: NOW, sentToday: 0, recipientReplied: false, previousUnknown: false }

describe('decideSend — le mandat', () => {
  it('sans mandat, le geste d’envoi est refusé', () => {
    expect(decideSend({ ...base, mandate: null })).toEqual({ allowed: false, reason: 'no_mandate' })
  })

  it('un mandat valide, sous sa borne, sans réponse : autorisé', () => {
    expect(decideSend({ ...base, mandate: mandate() })).toEqual({ allowed: true })
  })

  it('avant le début de la période : refusé', () => {
    const m = mandate({ validFrom: new Date('2026-10-30T00:00:00.000Z') })
    expect(decideSend({ ...base, mandate: m })).toEqual({ allowed: false, reason: 'not_yet_valid' })
  })

  it('après la fin de la période : refusé', () => {
    const m = mandate({ validUntil: new Date('2026-10-29T09:59:59.000Z') })
    expect(decideSend({ ...base, mandate: m })).toEqual({ allowed: false, reason: 'expired' })
  })

  it('au-delà du volume du jour : refusé', () => {
    expect(decideSend({ ...base, mandate: mandate({ dailyLimit: 3 }), sentToday: 3 })).toEqual({
      allowed: false,
      reason: 'daily_limit_reached',
    })
    expect(decideSend({ ...base, mandate: mandate({ dailyLimit: 3 }), sentToday: 2 })).toEqual({ allowed: true })
  })

  it('après révocation : refusé, même dans la période et sous la borne', () => {
    const m = mandate({ revokedAt: new Date('2026-10-29T09:00:00.000Z') })
    expect(decideSend({ ...base, mandate: m })).toEqual({ allowed: false, reason: 'revoked' })
  })

  it('une révocation postérieure à « maintenant » ne vaut pas encore, mais une révocation passée vaut toujours', () => {
    const m = mandate({ revokedAt: NOW })
    expect(decideSend({ ...base, mandate: m }).allowed).toBe(false)
  })

  it('après une réponse du destinataire, la suite s’arrête', () => {
    expect(decideSend({ ...base, mandate: mandate(), recipientReplied: true })).toEqual({
      allowed: false,
      reason: 'recipient_replied',
    })
  })

  it('après un envoi resté « unknown », la reprise s’arrête', () => {
    expect(decideSend({ ...base, mandate: mandate(), previousUnknown: true })).toEqual({
      allowed: false,
      reason: 'previous_unknown',
    })
  })

  it('la borne est 25 par jour et par utilisateur — pas les 50 du premier lot (Louis, 29/10/2026)', () => {
    expect(LINKEDIN_DAILY_SEND_LIMIT).toBe(25)
  })

  it('un ancien mandat posé à 50 est quand même arrêté à 25 : le plafond est celui du code, pas de la ligne', () => {
    const m = mandate({ dailyLimit: 50 })
    expect(decideSend({ ...base, mandate: m, sentToday: 24 })).toEqual({ allowed: true })
    expect(decideSend({ ...base, mandate: m, sentToday: 25 })).toEqual({
      allowed: false,
      reason: 'daily_limit_reached',
    })
  })
})
