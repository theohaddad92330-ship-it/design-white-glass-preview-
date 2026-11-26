import { SCHEDULABLE_DRAFT_CHANNELS } from '@bellum/contracts'
import {
  DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS,
  DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS,
  DEMO_SCHEDULED_SEND_SEED_SPECS,
} from './demo-dataset'

// Théo M2 — envoi programmé — la Messagerie « À venir » n'est pas vide en démo : deux envois déjà programmés.
describe('démo — envois programmés semés', () => {
  it('sème exactement deux envois programmés, à venir', () => {
    expect(DEMO_SCHEDULED_SEND_SEED_SPECS).toHaveLength(2)
    for (const seed of DEMO_SCHEDULED_SEND_SEED_SPECS) expect(seed.inHours).toBeGreaterThan(0)
  })

  it('chacun programme un brouillon SEMÉ, sur un canal que « Envoyer » fait partir', () => {
    const drafts = [...DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS, ...DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS]
    for (const seed of DEMO_SCHEDULED_SEND_SEED_SPECS) {
      expect((SCHEDULABLE_DRAFT_CHANNELS as readonly string[]).includes(seed.channel)).toBe(true)
      expect(drafts.some(draft => draft.contact === seed.contact && draft.channel === seed.channel)).toBe(true)
    }
  })

  it('le fuseau est celui d’un utilisateur réel (IANA), pas une heure devinée', () => {
    for (const seed of DEMO_SCHEDULED_SEND_SEED_SPECS) {
      expect(() => new Intl.DateTimeFormat('fr-FR', { timeZone: seed.timeZone })).not.toThrow()
    }
  })
})
