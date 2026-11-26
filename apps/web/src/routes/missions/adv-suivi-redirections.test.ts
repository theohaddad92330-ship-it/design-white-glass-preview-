import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route as AdvRoute } from './adv'
import { Route as SuiviRoute } from './suivi'

// Théo C missions-dossier.R2 — ADV et Suivi mission n'ont plus d'écran : le blocage
// du démarrage et l'état du cycle vivent dans le dossier de chaque mission.
function redirectOf(beforeLoad: unknown): { to?: string } {
  try {
    ;(beforeLoad as () => void)()
  } catch (thrown) {
    if (isRedirect(thrown)) return thrown.options as { to?: string }
    throw thrown
  }
  throw new Error('aucune redirection levée')
}

describe('anciennes adresses ADV et Suivi mission', () => {
  it('/missions/adv renvoie vers la liste des missions', () => {
    expect(redirectOf(AdvRoute.options.beforeLoad).to).toBe('/missions')
  })
  it('/missions/suivi renvoie vers la liste des missions', () => {
    expect(redirectOf(SuiviRoute.options.beforeLoad).to).toBe('/missions')
  })
})
