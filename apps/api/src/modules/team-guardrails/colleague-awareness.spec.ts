import {
  WORK_ACTION_TYPES,
  VERIFIED_OUTREACH_STATUSES,
  DECLARED_OUTREACH_STATUSES,
  daysBetween,
  normalizeDomain,
  pickColleagueActivities,
  pickColleagueContacts,
} from './colleague-awareness'

const NOW = new Date('2026-10-14T12:00:00.000Z')
const ME = 'me'
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

describe('#4158.20 — pickColleagueActivities', () => {
  it('ne dit RIEN quand seul moi ai agi (ni bandeau sur soi-même)', () => {
    const items = pickColleagueActivities({
      me: ME,
      responsibleId: ME,
      actions: [{ user_id: ME, action_type: 'message_sent', created_at: daysAgo(2) }],
      now: NOW,
    })
    expect(items).toEqual([])
  })

  it('ne dit RIEN quand personne n’a agi et qu’il n’y a pas de responsable', () => {
    expect(pickColleagueActivities({ me: ME, responsibleId: null, actions: [], now: NOW })).toEqual([])
  })

  it('nomme un collègue actif dans les 90 jours, avec sa DERNIÈRE action', () => {
    const items = pickColleagueActivities({
      me: ME,
      responsibleId: null,
      actions: [
        { user_id: 'bob', action_type: 'call', created_at: daysAgo(40) },
        { user_id: 'bob', action_type: 'message_sent', created_at: daysAgo(5) },
      ],
      now: NOW,
    })
    expect(items).toEqual([
      { user_id: 'bob', is_responsible: false, last_action: 'message_sent', last_action_at: daysAgo(5).toISOString() },
    ])
  })

  it('un événement SYSTÈME (score, profil, analyse) n’est pas du travail d’un collègue', () => {
    expect(WORK_ACTION_TYPES).toContain('message_sent')
    const items = pickColleagueActivities({
      me: ME,
      responsibleId: null,
      actions: [
        { user_id: 'bob', action_type: 'account_score_changed', created_at: daysAgo(1) },
        { user_id: 'bob', action_type: 'profile_updated', created_at: daysAgo(1) },
      ],
      now: NOW,
    })
    expect(items).toEqual([])
  })

  it('ignore une action vieille de plus de 90 jours', () => {
    const items = pickColleagueActivities({
      me: ME,
      responsibleId: null,
      actions: [{ user_id: 'bob', action_type: 'call', created_at: daysAgo(91) }],
      now: NOW,
    })
    expect(items).toEqual([])
  })

  it('un autre responsable sans activité figure, sans action ni date inventées', () => {
    const items = pickColleagueActivities({ me: ME, responsibleId: 'alice', actions: [], now: NOW })
    expect(items).toEqual([{ user_id: 'alice', is_responsible: true, last_action: null, last_action_at: null }])
  })

  it('le responsable passe en premier, puis le plus récent', () => {
    const items = pickColleagueActivities({
      me: ME,
      responsibleId: 'alice',
      actions: [
        { user_id: 'bob', action_type: 'call', created_at: daysAgo(1) },
        { user_id: 'alice', action_type: 'note', created_at: daysAgo(30) },
        { user_id: 'carl', action_type: 'call', created_at: daysAgo(3) },
      ],
      now: NOW,
    })
    expect(items.map(i => i.user_id)).toEqual(['alice', 'bob', 'carl'])
    expect(items[0]?.is_responsible).toBe(true)
  })
})

describe('#4158.21 — pickColleagueContacts', () => {
  const msg = (contact_id: string, user_id: string, status: string, n: number) => ({
    contact_id,
    user_id,
    status,
    at: daysAgo(n),
  })

  it('distingue un envoi VÉRIFIÉ d’un envoi DÉCLARÉ', () => {
    expect(VERIFIED_OUTREACH_STATUSES).toContain('sent')
    expect(DECLARED_OUTREACH_STATUSES).toEqual(['copied_manual'])
    const out = pickColleagueContacts({
      me: ME,
      messages: [msg('c1', 'bob', 'sent', 3), msg('c2', 'bob', 'copied_manual', 4)],
      now: NOW,
    })
    expect(out.get('c1')).toMatchObject({ by_user_id: 'bob', proof: 'verified', days_ago: 3 })
    expect(out.get('c2')).toMatchObject({ proof: 'declared', days_ago: 4 })
  })

  it('ne retient pas mes propres envois', () => {
    expect(pickColleagueContacts({ me: ME, messages: [msg('c1', ME, 'sent', 2)], now: NOW }).size).toBe(0)
  })

  it('ne retient pas un brouillon, ni un envoi échoué', () => {
    const out = pickColleagueContacts({
      me: ME,
      messages: [msg('c1', 'bob', 'drafted', 2), msg('c2', 'bob', 'failed', 2), msg('c3', 'bob', 'bounced', 2)],
      now: NOW,
    })
    expect(out.size).toBe(0)
  })

  it('ne retient pas plus de 30 jours', () => {
    expect(pickColleagueContacts({ me: ME, messages: [msg('c1', 'bob', 'sent', 31)], now: NOW }).size).toBe(0)
    expect(pickColleagueContacts({ me: ME, messages: [msg('c1', 'bob', 'sent', 30)], now: NOW }).size).toBe(1)
  })

  it('garde le contact le PLUS RÉCENT quand deux collègues ont écrit', () => {
    const out = pickColleagueContacts({
      me: ME,
      messages: [msg('c1', 'bob', 'sent', 20), msg('c1', 'carl', 'copied_manual', 6)],
      now: NOW,
    })
    expect(out.get('c1')).toMatchObject({ by_user_id: 'carl', proof: 'declared', days_ago: 6 })
  })
})

describe('helpers', () => {
  it('daysBetween ne rend jamais de négatif', () => {
    expect(daysBetween(new Date(NOW.getTime() + 1000), NOW)).toBe(0)
    expect(daysBetween(daysAgo(3), NOW)).toBe(3)
  })

  it('normalizeDomain accepte une URL, une adresse, un nom nu', () => {
    expect(normalizeDomain('https://www.Acme.FR/path')).toBe('acme.fr')
    expect(normalizeDomain('jean@Acme.fr')).toBe('acme.fr')
    expect(normalizeDomain('  acme.fr ')).toBe('acme.fr')
    expect(normalizeDomain('pas un domaine')).toBeNull()
    expect(normalizeDomain('')).toBeNull()
  })
})
