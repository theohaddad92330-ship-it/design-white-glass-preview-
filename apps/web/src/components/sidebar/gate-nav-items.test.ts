import { describe, expect, it } from 'vitest'
import { MIN_ACTIVE_MEMBERS_FOR_TEAM, gateNavItems } from './gate-nav-items'
import { PLATFORM_SECTIONS } from './items'

// #4158.9 / .10 — Équipe dès 2 membres actifs. #4492.2 (PR 12C, Louis 24/10/2026) — elle quitte le
// premier niveau : elle vit en SOUS-ENTRÉE de « Ma journée », avec la même porte (gérant + équipe).
const [top] = PLATFORM_SECTIONS
const targets = (opts: { canManage: boolean; hasTeam: boolean }) =>
  gateNavItems(top, opts)?.items.map(item => String(item.to)) ?? []
const todaySubEntries = (opts: { canManage: boolean; hasTeam: boolean }) =>
  gateNavItems(top, opts)
    ?.items.find(item => item.to === '/briefing')
    ?.subEntries?.map(entry => entry.key) ?? []

describe('l’entrée Équipe de la barre latérale', () => {
  it('le seuil est de deux membres actifs', () => {
    expect(MIN_ACTIVE_MEMBERS_FOR_TEAM).toBe(2)
  })

  it('n’est plus une entrée de PREMIER niveau, Pilotage non plus (#4492.2) — même pour un gérant', () => {
    const list = targets({ canManage: true, hasTeam: true })
    expect(list).not.toContain('/team')
    expect(list).not.toContain('/pilotage')
    // La Messagerie reste une entrée de premier niveau, juste après Actions (maquette V22).
    expect(list.indexOf('/mailbox')).toBe(list.indexOf('/actions') + 1)
  })

  it('vit sous « Ma journée » pour un gérant d’un espace d’équipe : Mon activité · Mon agenda · Équipe · Pilotage', () => {
    expect(todaySubEntries({ canManage: true, hasTeam: true })).toEqual([
      '/briefing',
      '/briefing?vue=agenda',
      '/team',
      '/pilotage',
    ])
  })

  it('REFUS — un commercial ne voit pas Équipe : Ma journée · Mon agenda · Pilotage', () => {
    expect(todaySubEntries({ canManage: false, hasTeam: true })).toEqual([
      '/briefing',
      '/briefing?vue=agenda',
      '/pilotage',
    ])
  })

  it('est ABSENTE d’un espace solo, même pour son propriétaire', () => {
    expect(todaySubEntries({ canManage: true, hasTeam: false })).not.toContain('/team')
  })

  it('ne retire rien d’autre dans un espace solo', () => {
    const solo = todaySubEntries({ canManage: true, hasTeam: false })
    const team = todaySubEntries({ canManage: true, hasTeam: true }).filter(key => key !== '/team')
    expect(solo).toEqual(team)
    expect(targets({ canManage: true, hasTeam: false })).toEqual(targets({ canManage: true, hasTeam: true }))
  })
})

describe('Réglages › Équipe (#4158.11)', () => {
  it('reste visible pour tous, solo compris : c’est là qu’on invite le premier collègue', async () => {
    const { SETTINGS_SECTIONS } = await import('./items.settings')
    const item = SETTINGS_SECTIONS.flatMap(section => section.items).find(entry => entry.to === '/settings/team')
    expect(item).toBeDefined()
    // Ni réservée aux gérants ni conditionnée à une équipe.
    expect(item?.managerOnly).toBeFalsy()
    expect(item?.requiresTeam).toBeFalsy()
  })
})
