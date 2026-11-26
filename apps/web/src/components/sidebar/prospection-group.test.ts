import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS, sectionForPath } from '@/components/navigation/sections'
import frNav from '@/i18n/locales/fr/nav.json'
import enNav from '@/i18n/locales/en/nav.json'
import { PLATFORM_SECTIONS } from './items'

/**
 * #3132 (retour bêta, 27/09/2026) — REVIREMENT ASSUMÉ sur #2155.1/.2/.7/#3090.
 *
 * Le tiroir dépliable « Prospection » de la barre latérale (livré le 15/09,
 * élargi le 24/09 pour y inclure Découvrir) est retiré : le client le juge
 * redondant avec les trois boutons de la barre de section, au-dessus de
 * chaque écran de Comptes. « supprime découvrir d'ici, il est déjà dans les 3
 * boutons du haut, et enlève l'onglet maitre prospection pour laisser que
 * comptes contacts et mes cibles. »
 *
 * Comptes, Contacts et Mes cibles restent dans la barre latérale — comme
 * entrées PLATES de premier niveau, à la place exacte qu'occupait le tiroir
 * (juste sous Aujourd'hui). Découvrir n'y réapparaît PAS : sa route survit
 * (`sections.ts`), atteignable depuis la barre de section en haut de l'écran.
 *
 * ⚠️ `sidebarGroup` survit sur `sections.ts` : `SectionTabs.mobileGroupLabel`
 * en dépend encore pour nommer le regroupement sur MOBILE, où aucun tiroir de
 * barre latérale ne se monte — hors du périmètre de ce retour.
 */
const items = PLATFORM_SECTIONS[0]?.items ?? []

describe('le tiroir « Prospection » a disparu de la barre latérale — #3132', () => {
  it('aucune entrée « Prospection » (maître ou repliable) dans la barre', () => {
    expect(items.find(item => item.labelKey === 'items.prospection')).toBeUndefined()
    expect(items.some(item => (item.children?.length ?? 0) > 0)).toBe(false)
  })

  it('Comptes, Contacts et Mes cibles apparaissent à plat, juste sous Aujourd’hui, dans cet ordre', () => {
    const today = items.findIndex(item => item.to === '/briefing')
    expect(items[today + 1]?.to).toBe('/accounts')
    expect(items[today + 2]?.to).toBe('/contacts')
    expect(items[today + 3]?.to).toBe('/signals')
    // #4492.3 (PR 12C) — trois SECTIONS (plus des onglets promus) : leurs libellés d'entrée.
    expect(items[today + 1]?.labelKey).toBe('items.accounts')
    expect(items[today + 2]?.labelKey).toBe('items.contacts')
    expect(items[today + 3]?.labelKey).toBe('items.signals')
  })

  // #3610 — REVIREMENT de #3585.2 : Découvrir a déjà SON bouton en haut de la
  // barre (`CustomerNavbarBody`, lavande) ; la même porte en entrée de liste
  // faisait doublon (retour bêta : « on l'a déjà en haut en bouton »).
  it('Découvrir n’est PAS une entrée de la liste : sa porte est le bouton du haut (#3610)', () => {
    expect(items.some(item => item.to === '/discover')).toBe(false)
  })

  // #4492.3 (PR 12C) — Découvrir est une SECTION hors rubrique : le bouton du haut sur desktop, la barre de
  // Comptes sur mobile (`mobileParent`), son palier inchangé.
  it('la route Découvrir survit — sa propre section, portée par Comptes sur mobile', () => {
    const discover = NAV_SECTIONS.find(section => section.key === 'discover')
    expect(discover?.to).toBe('/discover')
    expect(discover?.feature).toBe('discover')
    expect(discover?.mobileParent).toBe('accounts')
  })

  // #3828 (retour bêta in-app du 07/10/2026, « supprimer ») — REVIREMENT de la
  // porte posée le 06/10/2026 (D7) : « Marchés locaux » quitte la barre
  // latérale. (Louis 14/10/2026, refonte Pilotage : `/accounts/marches` est
  // redevenue la veille « Marché », mais comme ONGLET de Comptes — la porte
  // latérale, elle, reste retirée.)
  it('Marchés locaux n’a plus de porte dans la barre latérale (#3828)', () => {
    expect(items.find(item => item.to === '/accounts/marches')).toBeUndefined()
  })

  it('Signaux est sa propre section, portée par Comptes sur mobile (#4492.3)', () => {
    expect(sectionForPath('/signals')?.section.key).toBe('signals')
    expect(NAV_SECTIONS.find(section => section.key === 'signals')?.mobileParent).toBe('accounts')
    // #2155.4/.5/.6 — Comptes ne déclare plus de groupes de barre d'onglets.
    const accounts = NAV_SECTIONS.find(section => section.key === 'accounts')
    expect(accounts?.groups ?? []).toEqual([])
  })

  it('se nomme dans les deux langues (libellés des sections)', () => {
    expect(frNav.items.accounts).toBeTruthy()
    expect(enNav.items.accounts).toBeTruthy()
    expect(frNav.items.signals).toBe('Signaux')
    expect(enNav.items.signals).toBe('Signals')
  })
})
