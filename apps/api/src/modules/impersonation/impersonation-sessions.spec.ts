import { joinImpersonationSessions, type ImpersonationAuditRow } from './impersonation-sessions'

const now = new Date('2026-09-09T12:00:00.000Z')

function row(overrides: Partial<ImpersonationAuditRow>): ImpersonationAuditRow {
  return {
    jti: 'jti-1',
    impersonator_actor: 'louis@bellum-it.com',
    target_user_id: 'user-1',
    target_email: 'client@esn.test',
    reason: 'Reproduire un bug signalé',
    reason_code: 'incident_constate',
    action: 'start',
    ip: '1.2.3.4',
    correlation_id: null,
    expires_at: new Date('2026-09-09T13:00:00.000Z'),
    created_at: new Date('2026-09-09T11:00:00.000Z'),
    ...overrides,
  }
}

describe('joinImpersonationSessions — #1665.2', () => {
  it('LIT quelque chose — un start seul rend une session', () => {
    expect(joinImpersonationSessions([row({})], now)).toHaveLength(1)
  })

  it('start + stop du MÊME jti → "ended", durée dérivée', () => {
    const rows = [
      row({ jti: 'a', created_at: new Date('2026-09-09T10:00:00.000Z') }),
      row({ jti: 'a', action: 'stop', created_at: new Date('2026-09-09T10:05:00.000Z') }),
    ]
    const [session] = joinImpersonationSessions(rows, now)
    expect(session).toMatchObject({
      jti: 'a',
      status: 'ended',
      durationSeconds: 300,
      endedAt: '2026-09-09T10:05:00.000Z',
    })
  })

  it('start sans stop, jeton encore valide → "ongoing", pas de durée', () => {
    const rows = [row({ jti: 'b', expires_at: new Date('2026-09-09T13:00:00.000Z') })]
    const [session] = joinImpersonationSessions(rows, now)
    expect(session).toMatchObject({ jti: 'b', status: 'ongoing', endedAt: null, durationSeconds: null })
  })

  it('sait dire NON — start sans stop et jeton expiré → "expired_sans_arret", pas "ongoing"', () => {
    const rows = [row({ jti: 'c', expires_at: new Date('2026-09-09T11:30:00.000Z') })]
    const [session] = joinImpersonationSessions(rows, now)
    expect(session.status).toBe('expired_sans_arret')
  })

  it("n'attrape pas ce qu'elle ne vise pas — un 'refused' n'est jamais rendu comme une session", () => {
    const rows = [row({ jti: 'd', action: 'refused' })]
    expect(joinImpersonationSessions(rows, now)).toEqual([])
  })

  it('deux sessions distinctes (jti différents) ne se mélangent jamais', () => {
    const rows = [
      row({ jti: 'e1', impersonator_actor: 'louis@bellum-it.com' }),
      row({ jti: 'e2', impersonator_actor: 'theo@bellum-it.com' }),
      row({ jti: 'e1', action: 'stop', created_at: new Date('2026-09-09T11:10:00.000Z') }),
    ]
    const sessions = joinImpersonationSessions(rows, now)
    expect(sessions).toHaveLength(2)
    const e1 = sessions.find(s => s.jti === 'e1')
    const e2 = sessions.find(s => s.jti === 'e2')
    expect(e1?.status).toBe('ended')
    expect(e2?.status).toBe('ongoing')
  })
})
