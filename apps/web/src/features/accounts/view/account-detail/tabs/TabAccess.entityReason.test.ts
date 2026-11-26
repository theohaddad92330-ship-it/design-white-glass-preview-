import i18next from 'i18next'
import { describe, expect, it } from 'vitest'
import accessEn from '@/i18n/locales/en/access.json'
import accessFr from '@/i18n/locales/fr/access.json'
import { entityReasonText } from './TabAccess'

/** #3473 — la raison du rang d'une entité se dit dans la langue de l'écran, jamais en français brut en EN. */
async function tIn(lng: 'fr' | 'en') {
  const instance = i18next.createInstance()
  await instance.init({
    lng,
    resources: { fr: { access: accessFr }, en: { access: accessEn } },
    defaultNS: 'access',
    interpolation: { escapeValue: false },
  })
  return instance.t.bind(instance)
}

describe('entityReasonText (#3473)', () => {
  const facts = [
    { code: 'kind', kind: 'subsidiary', points: 25 },
    { code: 'contacts', count: 3, points: 18 },
    { code: 'rank1', points: 5 },
  ] as const

  it('says the facts in English on an English screen', async () => {
    const text = entityReasonText([...facts], 'filiale identifiée', await tIn('en'))
    // Le badge de la ligne dit « un rang 1 est installé » : la raison ne le redit pas (#3562.3).
    expect(text).toBe('subsidiary identified · 3 contacts already identified')
  })

  it('says the same facts in French on a French screen', async () => {
    const text = entityReasonText([...facts], 'x', await tIn('fr'))
    expect(text).toBe('filiale identifiée · 3 contacts déjà identifiés')
  })

  it('un rang 1 NOMMÉ reste dans la raison, un rang 1 seul ne laisse aucune ligne', async () => {
    const t = await tIn('fr')
    expect(entityReasonText([{ code: 'rank1', value: 'Acme Services', points: 5 }], 'x', t)).toBe(
      'rang 1 connu : Acme Services',
    )
    expect(entityReasonText([{ code: 'rank1', points: 5 }], 'x', t)).toBe('')
  })

  it('names an empty perimeter, and falls back to the server text for an older API', async () => {
    expect(entityReasonText([], 'x', await tIn('en'))).toBe('no known fact on this perimeter')
    expect(entityReasonText(undefined, 'texte serveur', await tIn('en'))).toBe('texte serveur')
  })
})
