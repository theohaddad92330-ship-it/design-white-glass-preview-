import type { Contact } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  channelActionLabel,
  channelLabel,
  channelNeedsPhoneReveal,
  channelReviewLabel,
  composerLabel,
  getAvailableChannels,
  getMenuChannels,
  getSendableChannels,
  isPreparedOnlyChannel,
} from './channel'

const contact = (patch: Partial<Contact>): Contact => ({ id: 'c1', full_name: 'Léa', ...patch }) as Contact

// #2204.40 (épopée #2947) — « Message de recommandation » : un canal qui se RÉDIGE mais ne s'envoie pas depuis ce composer.
// Théo B C5.A24 / C7.A3 — SMS, WhatsApp et message vocal sont retirés : aucun contact ne les propose, numéro ou pas.
describe('canaux du composer — recommandation, canaux retirés (#2204.40, Théo B C5.A24)', () => {
  it('un contact avec téléphone et compte propose la recommandation, jamais SMS / WhatsApp / message vocal', () => {
    const channels = getAvailableChannels(contact({ phone: '+33100000000', account_id: 'a1' }))
    expect(channels).toContain('recommendation')
    for (const retired of ['voicemail', 'sms', 'whatsapp']) expect(channels).not.toContain(retired)
  })

  it('sans téléphone : la recommandation reste proposée', () => {
    const channels = getAvailableChannels(contact({ account_id: 'a1' }))
    expect(channels).toContain('recommendation')
  })

  it('sans compte : pas de recommandation (elle vit dans le plan d’un compte)', () => {
    const channels = getAvailableChannels(contact({ phone: '+33100000000' }))
    expect(channels).not.toContain('recommendation')
  })

  it('ces deux canaux ne rendent PAS un contact joignable : ils ne sont jamais « envoyables »', () => {
    const sendable = getSendableChannels(contact({ phone: '+33100000000', account_id: 'a1' }))
    expect(sendable).toEqual(['phone'])
  })
})

// #2370 (épopée #2947) — les huit canaux préparés : chacun n'apparaît que si sa coordonnée (ou son compte) existe,
// et aucun ne rend un contact joignable — Laura prépare, le commercial envoie.
describe('canaux du composer — #2370', () => {
  const full = contact({
    email: 'lea@acme.fr',
    linkedin_url: 'https://linkedin.com/in/lea',
    phone: '+33100000000',
    account_id: 'a1',
  })

  it('un contact complet propose les huit canaux neufs', () => {
    expect(getAvailableChannels(full)).toEqual(
      expect.arrayContaining([
        'introduction_request',
        'partner_message',
        'follow_up_email',
        'profile_push',
        'linkedin_connection_note',
      ]),
    )
  })

  it('la note de connexion demande un profil LinkedIn, le suivi un e-mail', () => {
    const channels = getAvailableChannels(contact({ account_id: 'a1' }))
    expect(channels).not.toContain('linkedin_connection_note')
    expect(channels).not.toContain('follow_up_email')
    expect(channels).toEqual(expect.arrayContaining(['introduction_request', 'partner_message', 'profile_push']))
  })

  it('aucun canal neuf n’est « envoyable » : ils se préparent, le commercial les envoie', () => {
    expect(getSendableChannels(full)).toEqual(['email', 'linkedin', 'phone'])
    for (const channel of getAvailableChannels(full)) {
      if (!['email', 'linkedin', 'phone'].includes(channel)) expect(isPreparedOnlyChannel(channel)).toBe(true)
    }
  })

  it('chaque canal du composer a son libellé et son geste en français et en anglais', () => {
    for (const channel of getAvailableChannels(full)) {
      expect(channelLabel(channel)).not.toContain('channel.')
      expect(channelActionLabel(channel)).not.toContain('channel.')
      expect(channelReviewLabel(channel)).not.toContain('channel.')
      expect(composerLabel(channel)).not.toContain('channel.')
    }
  })
})

// #2370 (R41) — le menu « Contacter » d'une fiche sans téléphone ni LinkedIn : ni SMS, ni WhatsApp, ni note LinkedIn.
describe('getMenuChannels — #2370 (R41)', () => {
  const bare = { id: 'c', account_id: 'a', email: null, phone: null, linkedin_url: null } as unknown as Contact

  it('propose la note LinkedIn sans aucune coordonnée — sans rendre le contact joignable, et sans SMS ni WhatsApp', () => {
    const menu = getMenuChannels(bare)
    expect(menu).toContain('linkedin_connection_note')
    for (const retired of ['sms', 'whatsapp', 'voicemail']) expect(menu).not.toContain(retired)
    expect(getSendableChannels(bare)).toEqual([])
  })

  it('« numéro à révéler » seulement sans numéro, et seulement pour l’appel', () => {
    expect(channelNeedsPhoneReveal(bare, 'phone')).toBe(true)
    expect(channelNeedsPhoneReveal(bare, 'linkedin_connection_note')).toBe(false)
    expect(channelNeedsPhoneReveal({ ...bare, phone: '+33 6 00 00 00 00' } as Contact, 'phone')).toBe(false)
  })
})

// LUDB.8 — l'appel est le canal PRINCIPAL d'un appel sortant : « Préparer l'appel » est dans le menu
// même sans numéro révélé (jamais inventé : « numéro à révéler »), et ne rend pas le contact joignable.
describe('getMenuChannels — LUDB.8 préparer l’appel', () => {
  const bare = { id: 'c', account_id: 'a', email: null, phone: null, linkedin_url: null } as unknown as Contact

  it('propose l’appel sans numéro, avec la mention « numéro à révéler »', () => {
    expect(getMenuChannels(bare)).toContain('phone')
    expect(channelNeedsPhoneReveal(bare, 'phone')).toBe(true)
    expect(channelNeedsPhoneReveal({ ...bare, phone: '+33 4 00 00 00 00' } as Contact, 'phone')).toBe(false)
  })

  it('SAIT DIRE NON : l’appel sans numéro ne rend pas le contact joignable', () => {
    expect(getSendableChannels(bare)).toEqual([])
    expect(getAvailableChannels(bare)).not.toContain('phone')
  })
})
