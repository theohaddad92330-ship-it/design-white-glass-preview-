import { describe, expect, it } from 'vitest'
import { MOBILE_HOME, MOBILE_TABS, activeMobileTab } from './mobile-nav'

describe('les onglets de la coque mobile', () => {
  it('arrive sur Laura, et Laura est le premier onglet', () => {
    // Décision du 23/08 : en mobilité on ne parcourt pas un portefeuille, on
    // demande quelque chose.
    expect(MOBILE_HOME).toBe('/chat')
    expect(MOBILE_TABS[0]?.to).toBe('/chat')
  })

  it('en compte quatre — au-delà, les cibles tactiles passent sous 44 px', () => {
    expect(MOBILE_TABS).toHaveLength(4)
  })

  it('n’attribue jamais deux fois la même route', () => {
    const owned = MOBILE_TABS.flatMap(tab => tab.owns)
    expect(new Set(owned).size).toBe(owned.length)
  })
})

describe('activeMobileTab', () => {
  it('#2155.26 — Mes cibles allume Comptes : Prospection reste à deux gestes', () => {
    expect(activeMobileTab('/signals')).toBe('/accounts')
    expect(activeMobileTab('/contacts')).toBe('/accounts')
  })

  it('allume l’onglet exact', () => {
    expect(activeMobileTab('/chat')).toBe('/chat')
    expect(activeMobileTab('/briefing')).toBe('/briefing')
  })

  it('allume l’onglet d’une route ABSORBÉE', () => {
    // La messagerie vit sous « Ma journée », les contacts sous « Comptes ».
    expect(activeMobileTab('/mailbox')).toBe('/briefing')
    expect(activeMobileTab('/contacts')).toBe('/accounts')
    expect(activeMobileTab('/consultants')).toBe('/actions')
  })

  it('suit une route enfant', () => {
    expect(activeMobileTab('/accounts/abc-123')).toBe('/accounts')
    expect(activeMobileTab('/accounts/abc-123/brief')).toBe('/accounts')
  })

  it('choisit le préfixe le plus LONG', () => {
    // `/accounts/partners` appartient à Comptes, pas au premier onglet dont un
    // préfixe correspond.
    expect(activeMobileTab('/accounts/partners')).toBe('/accounts')
  })

  it('n’allume rien hors de la coque', () => {
    // Un écran de réglages n'appartient à aucun onglet : allumer le premier
    // par défaut ferait croire qu'on est ailleurs qu'on est.
    expect(activeMobileTab('/settings/profile')).toBeNull()
    expect(activeMobileTab('/login')).toBeNull()
  })

  it('ne confond pas un préfixe de chaîne avec un segment de route', () => {
    // `/chatouille` n'est pas sous `/chat`.
    expect(activeMobileTab('/chatouille')).toBeNull()
  })
})
