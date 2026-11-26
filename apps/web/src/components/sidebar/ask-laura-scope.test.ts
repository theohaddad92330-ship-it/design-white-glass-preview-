import { describe, expect, it } from 'vitest'
import { askLauraSidebarSearch, accountIdFromPathname } from './ask-laura-scope'

// #3215 (recette prod 04/10) — « Demander à Laura » depuis la fiche d'un compte ouvrait le chat sur
// « Tout mon espace » : le bouton de la barre latérale pointait toujours `?fresh=1`, sans compte.
describe('« Demander à Laura » de la barre latérale — cadrage sur le compte ouvert', () => {
  const ID = '0125b778-1111-4222-8333-444455556666'

  it('lit l’identifiant du compte sur la fiche et sur son brief', () => {
    expect(accountIdFromPathname(`/accounts/${ID}`)).toBe(ID)
    expect(accountIdFromPathname(`/accounts/${ID}/brief`)).toBe(ID)
    expect(accountIdFromPathname(`/accounts/${ID}/`)).toBe(ID)
  })

  it('ne prend jamais une page de la section pour un compte', () => {
    for (const path of [
      '/accounts',
      '/accounts/',
      '/accounts/partners',
      '/accounts/sprints',
      '/accounts/memoire-collective',
      '/accounts/marches',
      '/accounts/marches/zone-1',
      '/chat',
      '/missions/x',
    ]) {
      expect(accountIdFromPathname(path)).toBeNull()
    }
  })

  it('sur une fiche : un fil neuf CADRÉ sur ce compte ; ailleurs : le fil neuf global d’avant', () => {
    expect(askLauraSidebarSearch(`/accounts/${ID}`)).toEqual({ fresh: '1', accountId: ID })
    expect(askLauraSidebarSearch('/discover')).toEqual({ fresh: '1' })
  })

  // #4967.2 — un tour en cours ou prêt : la porte rouvre CE fil, jamais un fil vierge.
  it('#4967.2 — un tour en cours ou prêt rouvre son fil ; sans tour, le fil neuf d’avant', () => {
    expect(askLauraSidebarSearch('/discover', { 'thread-a': 'running' })).toEqual({ conversationId: 'thread-a' })
    expect(askLauraSidebarSearch(`/accounts/${ID}`, { 'thread-a': 'ready', 'thread-b': 'running' })).toEqual({
      conversationId: 'thread-b',
    })
    expect(askLauraSidebarSearch('/discover', {})).toEqual({ fresh: '1' })
  })
})
