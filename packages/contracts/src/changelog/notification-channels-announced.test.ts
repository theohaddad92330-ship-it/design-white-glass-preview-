import { describe, expect, it } from 'vitest'
import { CHANGELOG_IDS, type ChangelogCatalog, changelogEn, changelogFr } from './index.js'

/**
 * #1938.3 / #1938.13 — LES DEUX CAPACITÉS LIVRÉES SONT ANNONCÉES, ET PAS AU-DELÀ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE, ALORS QUE LA CONVENTION EST DÉJÀ ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Toute feature user-facing ajoute une entrée AVANT le merge » est la règle
 * (voir `entries.ts`). Elle n'était tenue par rien : le canal notification
 * navigateur (#1938.3) et le refus respecté par le centre de notifications
 * (#1938.13) sont partis en production SANS entrée — deux capacités visibles à
 * l'écran, invisibles au changelog. Une règle qu'aucune garde ne tient
 * redevient une opinion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET SURTOUT : CE QUI EST ANNONCÉ NE DOIT PAS DÉPASSER CE QUI EST LIVRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est le vrai risque de cette entrée-là. `browser-notification-channel.ts` le
 * dit noir sur blanc : « NI service worker NI fournisseur de push tiers — juste
 * l'API `Notification` native, qui ne montre quelque chose que si l'onglet est
 * ouvert ». Annoncer « des notifications même quand Bellum est fermé » serait
 * du vaporware, et la convention l'interdit explicitement. La garde exige donc
 * que l'entrée NOMME sa limite (l'onglet ouvert) et ne promette JAMAIS de push.
 *
 * Les trois preuves que cette garde doit fournir :
 *  1. elle sait dire NON — retirer l'entrée, ou lui faire promettre le push,
 *     la fait rougir (vérifié à la main, les deux sens) ;
 *  2. elle LIT un corpus non vide — le test `corpus` affirme le compte ;
 *  3. elle n'attrape pas ce qu'elle ne vise pas — le TÉMOIN vérifie qu'une
 *     entrée voisine, qui parle elle aussi de notifications et de navigateur,
 *     ne satisfait PAS le prédicat.
 */

/** L'entrée qui annonce le canal notification navigateur — #1938.3. */
const BROWSER_ENTRY_ID = '2026-09-16-les-notifications-natives-de-ce-navigateur'

/** L'entrée qui annonce le refus respecté par le centre de notifications — #1938.13. */
const REFUSAL_ENTRY_ID = '2026-09-16-ton-refus-vaut-aussi-pour-le-centre-de-notifications'

/**
 * TÉMOIN — une entrée déjà au catalogue qui parle de notifications ET de
 * navigateur, mais n'annonce AUCUNE de ces deux capacités. Si le prédicat
 * l'attrapait, il ne prouverait rien sur les entrées qu'il vise.
 */
const WITNESS_ENTRY_ID = '2026-07-23-identite-navigateur'

/** Tout le texte d'une entrée, en une chaîne minuscule — date, titre, items. */
function entryText(catalog: ChangelogCatalog, id: string): string {
  const entry = catalog.entries[id]
  if (!entry) return ''
  return Object.values(entry).join(' ').toLowerCase()
}

/** Le prédicat visé : cette entrée annonce-t-elle le canal navigateur ? */
function announcesBrowserChannel(text: string): boolean {
  const namesTheChannel = text.includes('navigateur') || text.includes('browser')
  const namesNativeNotifications = text.includes('natives de ce navigateur') || text.includes('native notifications')
  return namesTheChannel && namesNativeNotifications
}

/** Le prédicat visé : cette entrée annonce-t-elle le refus respecté ? */
function announcesRespectedRefusal(text: string): boolean {
  const namesLaura = text.includes('laura')
  const namesTheRetreat = text.includes('retrait') || text.includes('step back') || text.includes('stepped back')
  return namesLaura && namesTheRetreat
}

const catalogs: Array<{ lang: string; catalog: ChangelogCatalog; channelWord: string }> = [
  { lang: 'fr', catalog: changelogFr, channelWord: 'navigateur' },
  { lang: 'en', catalog: changelogEn, channelWord: 'browser' },
]

describe('#1938.3 / #1938.13 — le changelog annonce les deux capacités livrées', () => {
  it('corpus : le catalogue lu porte bien des entrées (sinon tout ce qui suit serait vide)', () => {
    expect(CHANGELOG_IDS.length).toBeGreaterThan(50)
    expect(Object.keys(changelogFr.entries)).toHaveLength(CHANGELOG_IDS.length)
    expect(Object.keys(changelogEn.entries)).toHaveLength(CHANGELOG_IDS.length)
  })

  it.each(catalogs)('$lang — le canal notification navigateur (#1938.3) est annoncé', ({ catalog }) => {
    expect(catalog.entries[BROWSER_ENTRY_ID], `entrée ${BROWSER_ENTRY_ID} absente`).toBeDefined()
    expect(announcesBrowserChannel(entryText(catalog, BROWSER_ENTRY_ID))).toBe(true)
  })

  it.each(catalogs)(
    '$lang — le refus respecté par le centre de notifications (#1938.13) est annoncé',
    ({ catalog }) => {
      expect(catalog.entries[REFUSAL_ENTRY_ID], `entrée ${REFUSAL_ENTRY_ID} absente`).toBeDefined()
      expect(announcesRespectedRefusal(entryText(catalog, REFUSAL_ENTRY_ID))).toBe(true)
    },
  )

  it.each(catalogs)(
    "$lang — l'entrée du canal navigateur NOMME sa limite : l'onglet doit être ouvert",
    ({ catalog }) => {
      const text = entryText(catalog, BROWSER_ENTRY_ID)
      expect(text.includes('ouvert') || text.includes('open')).toBe(true)
    },
  )

  it.each(catalogs)(
    '$lang — et ne promet JAMAIS de push : il n’y a ni service worker ni fournisseur',
    ({ catalog }) => {
      const text = entryText(catalog, BROWSER_ENTRY_ID)
      for (const forbidden of ['push', 'service worker', 'même fermé', 'even when closed', 'app is closed']) {
        expect(text, `l’entrée promet « ${forbidden} », que le canal ne fait pas`).not.toContain(forbidden)
      }
    },
  )

  it.each(catalogs)(
    '$lang — TÉMOIN : une entrée voisine sur le navigateur n’est PAS prise pour l’annonce',
    ({ catalog, channelWord }) => {
      const witness = entryText(catalog, WITNESS_ENTRY_ID)
      expect(witness, 'le témoin doit exister, sinon il ne témoigne de rien').not.toBe('')
      expect(witness, 'le témoin doit VRAIMENT parler du navigateur — sinon ce n’est pas un cas limite').toContain(
        channelWord,
      )
      expect(announcesBrowserChannel(witness)).toBe(false)
      expect(announcesRespectedRefusal(witness)).toBe(false)
    },
  )
})
