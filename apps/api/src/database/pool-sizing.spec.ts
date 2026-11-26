import { Logger } from '@nestjs/common'
import { buildDbPoolExtra } from './database.module'
import { POOLER_SHARE, decidePoolMax } from './pool-sizing'

/**
 * Incident pool du 04/10/2026 (soir) : `DB_POOL_MAX` passé de 5 à 15 sur DEUX
 * réplicas = 30 clients sur un `pool_size` Supavisor plus petit → file, refus,
 * toute l'API en 500 et les migrations des déploiements en échec. La règle :
 * `DB_POOL_MAX × réplicas ≤ 70 % du pool_size Supavisor`.
 */
describe('decidePoolMax — garde de dimensionnement au démarrage', () => {
  it('la part retenue est 70 %', () => {
    expect(POOLER_SHARE).toBe(0.7)
  })

  it('DB_POOLER_POOL_SIZE absent : pool inchangé, avertissement (garde aveugle, dit à voix haute)', () => {
    const d = decidePoolMax(15, {})
    expect(d.max).toBe(15)
    expect(d.level).toBe('unguarded')
    expect(d.message).toMatch(/DB_POOLER_POOL_SIZE/)
  })

  it('dans le budget : pool inchangé, aucun message', () => {
    // 2 × 10 = 20 ≤ 0,7 × 30 = 21
    const d = decidePoolMax(10, { DB_POOLER_POOL_SIZE: '30', DB_REPLICAS: '2' })
    expect(d).toEqual({ max: 10, level: 'ok', message: null })
  })

  it('le cas du 04/10 : 15 × 2 réplicas > 70 % de 15 → CLAMP à floor(0,7 × 15 / 2) = 5, ERREUR nommant les valeurs', () => {
    const d = decidePoolMax(15, { DB_POOLER_POOL_SIZE: '15', DB_REPLICAS: '2' })
    expect(d.max).toBe(5)
    expect(d.level).toBe('clamped')
    expect(d.message).toContain('DB_POOL_MAX=15')
    expect(d.message).toContain('DB_REPLICAS=2')
    expect(d.message).toContain('DB_POOLER_POOL_SIZE=15')
    expect(d.message).toMatch(/maximum recommandé 5/)
  })

  it('ne refuse jamais de démarrer : le maximum ne descend pas sous 1', () => {
    const d = decidePoolMax(10, { DB_POOLER_POOL_SIZE: '2', DB_REPLICAS: '4' })
    expect(d.max).toBe(1)
    expect(d.level).toBe('clamped')
  })

  it('DB_REPLICAS absent : la garde compte AU MOINS 1 réplica et le dit (borne basse, jamais devinée plus haut)', () => {
    const inBudget = decidePoolMax(10, { DB_POOLER_POOL_SIZE: '15' })
    expect(inBudget.max).toBe(10)
    expect(inBudget.level).toBe('unguarded')
    expect(inBudget.message).toMatch(/DB_REPLICAS/)
    const over = decidePoolMax(15, { DB_POOLER_POOL_SIZE: '15' })
    expect(over.max).toBe(10)
    expect(over.level).toBe('clamped')
    expect(over.message).toMatch(/DB_REPLICAS/)
  })

  it('une valeur illisible n’est pas devinée : traitée comme absente', () => {
    expect(decidePoolMax(15, { DB_POOLER_POOL_SIZE: 'beaucoup', DB_REPLICAS: '2' }).level).toBe('unguarded')
    expect(decidePoolMax(15, { DB_POOLER_POOL_SIZE: '0', DB_REPLICAS: '2' }).level).toBe('unguarded')
  })
})

describe('buildDbPoolExtra applique la garde', () => {
  const keys = ['DB_POOL_MAX', 'DB_POOLER_POOL_SIZE', 'DB_REPLICAS'] as const
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k]
  })
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    jest.restoreAllMocks()
  })

  it('clamp + log ERROR quand DB_POOL_MAX × réplicas dépasse 70 % du pool Supavisor', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    process.env['DB_POOL_MAX'] = '15'
    process.env['DB_POOLER_POOL_SIZE'] = '15'
    process.env['DB_REPLICAS'] = '2'
    expect(buildDbPoolExtra().max).toBe(5)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('DB_POOLER_POOL_SIZE=15'))
  })

  it('dans le budget : aucune erreur, pool tel que demandé', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    process.env['DB_POOL_MAX'] = '5'
    process.env['DB_POOLER_POOL_SIZE'] = '30'
    process.env['DB_REPLICAS'] = '2'
    expect(buildDbPoolExtra().max).toBe(5)
    expect(error).not.toHaveBeenCalled()
  })
})
