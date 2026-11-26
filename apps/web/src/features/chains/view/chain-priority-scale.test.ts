import { describe, expect, it } from 'vitest'
import chainsEn from '@/i18n/locales/en/chains.json'
import chainsFr from '@/i18n/locales/fr/chains.json'

// #3524.2 — la modale parcours disait « 5/100 » quand la pastille dit 5/10 :
// le score de priorité n'a qu'UNE échelle, /10.
describe('#3524 — une seule échelle pour le score de priorité', () => {
  it.each([
    ['fr', chainsFr.fact.ouverture_compte['4_other']],
    ['en', chainsEn.fact.ouverture_compte['4_other']],
  ])('%s : « /10 », jamais « /100 »', (_lang, text) => {
    expect(text).toContain('/10')
    expect(text).not.toContain('/100')
  })
})
