import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RUNBOOK_ENTRIES } from './runbook.logic'

/**
 * #1678.3 — le runbook opérateur. Même méthode que la garde du rail
 * (`architecture/rail-et-environnement.test.ts`, hors périmètre en écriture de
 * ce lot) : chaque lien porté par une procédure est mesuré contre le SYSTÈME
 * DE FICHIERS, pas recopié à la main — une liste ne voit jamais la route
 * qu'on renommera demain.
 */

const APP = fileURLToPath(new URL('../', import.meta.url))

function routeExiste(href: string): boolean {
  const chemin = (href.split('?')[0] ?? href).replace(/^\//, '')
  return existsSync(join(APP, chemin, 'page.tsx'))
}

describe('le runbook (#1678.3)', () => {
  it('LIT quelque chose — au moins quatre procédures', () => {
    expect(RUNBOOK_ENTRIES.length).toBeGreaterThanOrEqual(4)
  })

  it('chaque procédure a un id UNIQUE', () => {
    const ids = RUNBOOK_ENTRIES.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('chaque lien porté mène à une page qui existe', () => {
    const morts = RUNBOOK_ENTRIES.filter(e => e.href !== null && !routeExiste(e.href))
    expect(morts.map(e => e.id)).toEqual([])
  })

  it('sait dire NON — une route inventée est refusée', () => {
    expect(routeExiste('/route-inventee-pour-le-test-1678')).toBe(false)
    // Et le contrôle positif du même geste.
    expect(routeExiste('/audit')).toBe(true)
  })
})
