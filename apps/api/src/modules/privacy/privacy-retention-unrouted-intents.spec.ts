import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAURA_UNROUTED_INTENTS_RETENTION_DAYS } from '../laura-unrouted-intents/unrouted-intent'
import { PrivacyRetentionService } from './privacy-retention.service'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : la trace anonyme des demandes que
 * Laura n'a pas su router vit {@link LAURA_UNROUTED_INTENTS_RETENTION_DAYS}
 * jours, puis le balayage RGPD quotidien l'efface. La coupure d'urgence est
 * celle de TOUT le balayage (`RETENTION_SWEEP_DISABLED`) — couper l'écriture de
 * la trace (`LAURA_UNROUTED_INTENTS_DISABLED`) ne gèle jamais son effacement.
 */

function makeService(query: jest.Mock) {
  const sessions = { manager: { query }, delete: jest.fn().mockResolvedValue({ affected: 0 }) }
  return new PrivacyRetentionService(sessions as never)
}

const NOW = new Date('2026-09-13T04:17:00.000Z')

describe('PrivacyRetentionService — #1949.23 purge de la trace anonyme', () => {
  const saved = process.env['RETENTION_SWEEP_DISABLED']
  beforeEach(() => delete process.env['RETENTION_SWEEP_DISABLED'])
  afterEach(() => {
    if (saved === undefined) delete process.env['RETENTION_SWEEP_DISABLED']
    else process.env['RETENTION_SWEEP_DISABLED'] = saved
  })

  it('la politique publiée déclare la règle, à la valeur de la constante nommée', () => {
    const rule = makeService(jest.fn())
      .getRetentionPolicy()
      .rules.find(entry => entry.key === 'laura_unrouted_intents')
    expect(rule?.days).toBe(LAURA_UNROUTED_INTENTS_RETENTION_DAYS)
    expect(rule?.rationale).toContain('#1949.23')
  })

  it('efface ce qui a plus de 90 jours — requête bornée et paramétrée, jamais une date concaténée', async () => {
    const query = jest.fn().mockResolvedValue([[{ id: 'a' }, { id: 'b' }], 2])
    const purged = await makeService(query).sweepLauraUnroutedIntents(NOW)

    expect(purged).toBe(2)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('DELETE FROM laura_unrouted_intents')
    expect(sql).toContain('occurred_on < $1')
    expect(sql).toContain('LIMIT $2')
    expect(sql).not.toContain('${')
    expect(params[0]).toBe('2026-06-15')
  })

  it('sait dire NON — sous l’interrupteur du balayage : aucune requête, et `null`, jamais « 0 »', async () => {
    process.env['RETENTION_SWEEP_DISABLED'] = 'true'
    const query = jest.fn()
    expect(await makeService(query).sweepLauraUnroutedIntents(NOW)).toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it('un résultat illisible ou une erreur rendent `null` — la table est intacte, rien n’est inventé', async () => {
    expect(await makeService(jest.fn().mockResolvedValue('?')).sweepLauraUnroutedIntents(NOW)).toBeNull()
    expect(await makeService(jest.fn().mockRejectedValue(new Error('down'))).sweepLauraUnroutedIntents(NOW)).toBeNull()
  })

  it('le passage quotidien APPELLE la purge — sinon elle n’existe que sur le papier', () => {
    const source = readFileSync(join(__dirname, 'privacy-retention.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
    const cronBody = source.slice(source.indexOf('async retentionSweepCron('))
    expect(cronBody).toContain('this.sweepLauraUnroutedIntents(')
  })
})
