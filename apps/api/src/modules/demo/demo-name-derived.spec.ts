import { demoContactRawData, DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { looksLikeEmailAddress } from '../contacts/contact-display-name'

const NOW = Date.UTC(2026, 9, 28)

describe('#4586.5 — la démo montre un nom déduit de l’adresse, avec la MÊME clé que l’import réel', () => {
  const contacts = [...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts), ...DEMO_DELIVERY_CLIENT.contacts]
  const derived = contacts.filter(contact => contact.name_derived_from_email)

  it('au moins une fiche de démo porte le marqueur, dans raw_data.nameDerivedFromEmail', () => {
    expect(derived.length).toBeGreaterThan(0)
    for (const contact of derived) expect(demoContactRawData(contact, NOW)?.['nameDerivedFromEmail']).toBe(true)
  })

  it('SAIT DIRE NON : une fiche sans le marqueur n’en porte aucun, et son nom n’est pas une adresse', () => {
    const plain = contacts.find(contact => !contact.name_derived_from_email)
    expect(plain).toBeDefined()
    expect(plain ? demoContactRawData(plain, NOW)?.['nameDerivedFromEmail'] : 'absent').toBeUndefined()
    expect(contacts.some(contact => looksLikeEmailAddress(contact.full_name))).toBe(false)
  })

  it('le nom marqué est réellement la partie locale de l’adresse (jamais un marqueur posé au hasard)', () => {
    for (const contact of derived) {
      const local = (contact.email ?? '').split('@')[0] ?? ''
      // Sans accents : l'adresse n'en porte pas, la fiche de démo peut écrire « Élise ».
      const bare = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      expect(local.split('.').join(' ')).toBe(bare(contact.full_name))
    }
  })
})
