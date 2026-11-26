import { DEMO_BEEPER_CONVERSATIONS_COVERAGE, DEMO_INTENTIONALLY_EMPTY } from './demo-coverage'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { demoBeeperConversations, demoBeeperMessages } from './demo-beeper'
import { matchContact } from '../beeper/beeper-conversations'

/** #4406.6 (craft rule n°9) — Messagerie › Beeper n'est pas vide en démonstration, et rien n'y est deviné. */
describe('démo — conversations Beeper (#4406.6)', () => {
  const conversations = demoBeeperConversations(new Date('2026-10-21T10:00:00Z'))

  it('est classée : conversations seedées par l’adaptateur, branchement vide à dessein', () => {
    expect(DEMO_BEEPER_CONVERSATIONS_COVERAGE.state).toBe('seede')
    expect(DEMO_INTENTIONALLY_EMPTY['beeper_connections']).toContain('demo-beeper.ts')
  })

  it('remplit l’écran : plusieurs réseaux, chaque conversation a ses messages', () => {
    expect(conversations.length).toBeGreaterThanOrEqual(3)
    expect(new Set(conversations.map(c => c.network)).size).toBeGreaterThanOrEqual(3)
    for (const c of conversations) expect(demoBeeperMessages(c.chatId)?.length).toBeGreaterThan(0)
    expect(demoBeeperMessages('inconnue')).toBeNull()
  })

  it('Nadia Perrin se rattache à son contact SEMÉ (e-mail réel du jeu), les autres à personne', () => {
    const seeded = readFileSync(join(__dirname, 'demo-dataset.ts'), 'utf8')
    expect(seeded).toContain('nadia.perrin@sncf-groupe.example')
    const nadia = {
      id: 'k-nadia',
      fullName: 'Nadia Perrin',
      accountId: null,
      email: 'nadia.perrin@sncf-groupe.example',
      phone: '06 39 98 41 27',
      linkedinUrl: null,
    }
    const matched = conversations.map(c => matchContact(c, [nadia])?.contactId ?? null)
    expect(matched.filter(Boolean)).toEqual(['k-nadia'])
  })

  it('coordonnées fictives uniquement (.example, aucun vrai domaine)', () => {
    const emails = conversations.flatMap(c => c.participants.map(p => p.email)).filter((e): e is string => !!e)
    expect(emails.every(e => e.endsWith('.example'))).toBe(true)
  })
})
