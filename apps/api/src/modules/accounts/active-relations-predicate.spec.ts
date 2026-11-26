import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4584.3 — la tuile « Relations actives » compte les statuts que la CARTE n'étiquette pas « À ouvrir »
 * (`relationStatusOf`, contrats : seuls `customer` → Client et `opening` → En ouverture ne sont pas « À ouvrir »).
 * Le prédicat SQL n'est pas exporté : la garde le relit à la source, pour que l'étiquette de la carte et le compteur de
 * la bande ne dérivent pas l'un de l'autre.
 */
describe('#4584.3 — Relations actives = complément de « À ouvrir »', () => {
  const source = readFileSync(join(__dirname, 'accounts.service.ts'), 'utf8')

  it('le prédicat compte exactement customer et opening', () => {
    const match = /const ACTIVE_RELATIONS_PREDICATE = `[^`]*IN \(([^)]*)\)`/.exec(source)
    expect(match).not.toBeNull()
    const statuses = (match?.[1] ?? '').split(',').map(part => part.trim().replace(/'/g, ''))
    expect(statuses.sort()).toEqual(['customer', 'opening'])
  })
})
