import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS } from '@/components/navigation/sections'
import { activeMobileTab } from '@/features/mobile/mobile-nav'
import { PLATFORM_SECTIONS } from './items'

/**
 * #3661 (05/10/2026, retour bêta de Louis : « supprime le lien d'ici ») — la
 * porte « Mémoire collective » de la barre latérale est RETIRÉE. (L'écran entier
 * est supprimé le 14/10/2026 : les anciennes adresses redirigent, aucune donnée
 * n'est touchée.)
 * Ce test renverse celui de #3585.1 et l'écrit pour être lu.
 */
const items = PLATFORM_SECTIONS[0]?.items ?? []

describe('la barre latérale ne porte plus de lien « Mémoire collective » (#3661)', () => {
  it('aucune entrée de barre latérale ne pointe vers la mémoire collective', () => {
    expect(items.find(item => String(item.to) === '/pilotage/memoire-collective')).toBeUndefined()
    expect(items.find(item => item.labelKey === 'tabs.collectiveMemory')).toBeUndefined()
  })

  it('Pilotage n’est plus réservé au niveau de l’entrée : les droits sont par sous-onglet (Louis 15/10/2026)', () => {
    // #4492.2 (PR 12C) — Pilotage est une SOUS-entrée de « Ma journée » : la même règle s'y lit.
    const pilotage = items
      .find(item => String(item.to) === '/briefing')
      ?.subEntries?.find(entry => entry.to === '/pilotage')
    expect(pilotage).toBeDefined()
    expect(pilotage?.managerOnly).toBeUndefined()
  })

  it('Louis 14/10/2026 (refonte Pilotage) : l’onglet de Pilotage est supprimé aussi', () => {
    const pilotage = NAV_SECTIONS.find(section => section.key === 'pilotage')
    expect(pilotage?.tabs.find(t => t.to === '/pilotage/memoire-collective')).toBeUndefined()
  })

  it('mobile : aucun cinquième onglet du bas', () => {
    expect(activeMobileTab('/pilotage/memoire-collective')).toBeNull()
  })
})
