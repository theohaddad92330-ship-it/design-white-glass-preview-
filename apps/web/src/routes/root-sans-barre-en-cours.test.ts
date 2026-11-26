import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4541 — décision de Louis (25/10) : la barre « En cours · Analyse de … · Revenir au dossier » n'existe
 * plus, nulle part. La pastille des tâches de fond et la carte de progression suffisent (GA-26 : la même
 * information trois fois). La garde LIT la racine et dit NON si la barre y revient.
 */
describe('#4541 — pas de barre « En cours » à la racine', () => {
  it('__root.tsx ne monte plus OngoingOperationsStrip', () => {
    const root = readFileSync(resolve(__dirname, '__root.tsx'), 'utf8')
    expect(root).not.toContain('OngoingOperationsStrip')
    expect(root).toContain('<Outlet />')
  })

  it('le composant est supprimé (pas laissé orphelin)', () => {
    expect(existsSync(resolve(__dirname, '../components/operations/OngoingOperationsStrip.tsx'))).toBe(false)
  })
})
