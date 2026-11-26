import { ENGAGEMENT_DRAFT_CHANNELS, OUTREACH_CHANNEL_MAX_CHARS } from '@bellum/contracts'
import { DEMO_PREPARED_CHANNELS_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS } from './demo-dataset'

/**
 * #2370 (épopée #2947, craft rule n°9) — chaque canal préparé neuf du composer est rempli en démo par UN
 * message déjà préparé, sur un contact RÉEL du jeu qui porte la coordonnée du canal — ou nommé vide à dessein,
 * avec sa raison.
 */
// Théo B C5.A24 — SMS et WhatsApp restent au contrat (historique lisible) mais ne sont plus proposés : rien à semer.
const RETIRED_CHANNELS: readonly string[] = ['sms', 'whatsapp']
const NEW_CHANNELS = ENGAGEMENT_DRAFT_CHANNELS.slice(ENGAGEMENT_DRAFT_CHANNELS.indexOf('recommendation') + 1).filter(
  (channel): channel is Exclude<typeof channel, 'sms' | 'whatsapp'> => !RETIRED_CHANNELS.includes(channel),
)
// Les contacts que le semis inscrit dans `contactIds` : ceux des dossiers ET ceux du client de livraison.
const contacts: { full_name: string; phone?: string | null; email?: string | null; linkedin_url?: string | null }[] = [
  ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts),
  ...DEMO_DELIVERY_CLIENT.contacts,
]

describe('#2370 — les canaux préparés en démo', () => {
  it('lit les cinq canaux neufs du composer (pas zéro)', () => {
    expect(NEW_CHANNELS).toEqual([
      'introduction_request',
      'partner_message',
      'follow_up_email',
      'profile_push',
      'linkedin_connection_note',
    ])
  })

  it('aucun brouillon semé ne porte un canal retiré (Théo B C5.A24)', () => {
    for (const seed of DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS) expect(RETIRED_CHANNELS).not.toContain(seed.channel)
  })

  it('chaque canal neuf est classé : semé, ou vide à dessein avec sa raison', () => {
    for (const channel of NEW_CHANNELS) {
      const coverage = DEMO_PREPARED_CHANNELS_COVERAGE[channel]
      expect(coverage).toBeDefined()
      expect(coverage.reason.length).toBeGreaterThan(40)
    }
  })

  it('un canal semé porte exactement un message préparé ; un canal vide à dessein, aucun', () => {
    for (const channel of NEW_CHANNELS) {
      const seeds = DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS.filter(seed => seed.channel === channel)
      expect(seeds).toHaveLength(DEMO_PREPARED_CHANNELS_COVERAGE[channel].state === 'seede' ? 1 : 0)
    }
  })

  it('chaque message vise un contact réel du jeu qui porte la coordonnée de son canal', () => {
    for (const seed of DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS) {
      const contact = contacts.find(candidate => candidate.full_name === seed.contact)
      expect(contact).toBeDefined()
      if (seed.channel === 'follow_up_email') expect(contact?.email).toBeTruthy()
      if (seed.channel === 'linkedin_connection_note') expect(contact?.linkedin_url).toBeTruthy()
    }
  })

  it('respecte le plafond dur de son canal et ne porte un objet que s’il a la forme d’un e-mail', () => {
    for (const seed of DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS) {
      const max = OUTREACH_CHANNEL_MAX_CHARS[seed.channel]
      if (max !== undefined) expect(seed.body.length).toBeLessThanOrEqual(max)
      const emailShaped = seed.channel === 'follow_up_email' || seed.channel === 'profile_push'
      expect(seed.subject !== null).toBe(emailShaped)
    }
  })

  it('sait dire NON — une note LinkedIn de plus de 300 caractères dépasserait son plafond', () => {
    expect('x'.repeat(301).length).toBeGreaterThan(OUTREACH_CHANNEL_MAX_CHARS.linkedin_connection_note ?? Infinity)
  })
})
