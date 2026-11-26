import { IsNull } from 'typeorm'
import { readFileSync } from 'fs'
import { join } from 'path'
import { workspaceGestureWhere } from './workspace-scoping'

// #4804 / #4731 — la clé de geste PARTAGÉE (séquences, plans) : l'espace actif, OU la ligne
// ancienne (workspace_id NULL) de son propriétaire. Un autre espace n'y figure jamais.
describe('#4804 — workspaceGestureWhere', () => {
  it('donne la ligne de l’espace ET la ligne ancienne du propriétaire, rien d’autre', () => {
    expect(
      workspaceGestureWhere<{ id: string; workspace_id: string | null; user_id: string }>('ws-1', 'me', { id: 's-1' }),
    ).toEqual([
      { id: 's-1', workspace_id: 'ws-1' },
      { id: 's-1', workspace_id: IsNull(), user_id: 'me' },
    ])
  })

  it('contrôle négatif : aucune branche ne vise un autre espace ni un user_id seul', () => {
    const where = workspaceGestureWhere<{ id: string; workspace_id: string | null; user_id: string }>('ws-1', 'me', {
      id: 's-1',
    }) as Array<Record<string, unknown>>
    expect(where.some(w => w.workspace_id === 'ws-other')).toBe(false)
    expect(where.every(w => 'workspace_id' in w)).toBe(true)
    expect(where.filter(w => w.user_id !== undefined)).toHaveLength(1)
  })

  it('une seule définition dans le dépôt (GA-26)', () => {
    const src = readFileSync(join(__dirname, 'workspace-scoping.ts'), 'utf8')
    expect(src.match(/export function workspaceGestureWhere[<(]/g)).toHaveLength(1)
  })
})
