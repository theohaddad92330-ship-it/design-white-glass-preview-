import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHAT_EVAL_SAMPLES_RETENTION_DAYS } from '../chat-eval-sampling/chat-eval-retention'
import { PrivacyRetentionService } from './privacy-retention.service'

/** #2899 — les échantillons anonymisés de conversations de Laura vivent 90 jours, puis le balayage RGPD les efface. */
function makeService(query: jest.Mock) {
  const sessions = { manager: { query }, delete: jest.fn().mockResolvedValue({ affected: 0 }) }
  return new PrivacyRetentionService(sessions as never)
}

const NOW = new Date('2026-10-12T04:17:00.000Z')

describe('PrivacyRetentionService — #2899 purge des échantillons d’évals', () => {
  const saved = process.env['RETENTION_SWEEP_DISABLED']
  beforeEach(() => delete process.env['RETENTION_SWEEP_DISABLED'])
  afterEach(() => {
    if (saved === undefined) delete process.env['RETENTION_SWEEP_DISABLED']
    else process.env['RETENTION_SWEEP_DISABLED'] = saved
  })

  it('la politique publiée déclare la règle à la valeur de la constante nommée', () => {
    const rule = makeService(jest.fn())
      .getRetentionPolicy()
      .rules.find(entry => entry.key === 'chat_eval_samples')
    expect(rule?.days).toBe(CHAT_EVAL_SAMPLES_RETENTION_DAYS)
    expect(rule?.rationale).toContain('#2899')
  })

  it('efface ce qui a plus de 90 jours — requête bornée et paramétrée', async () => {
    const query = jest.fn().mockResolvedValue([[{ id: 'a' }], 1])
    expect(await makeService(query).sweepChatEvalSamples(NOW)).toBe(1)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('DELETE FROM chat_eval_samples')
    expect(sql).toContain('sampled_at < $1')
    expect(sql).toContain('LIMIT $2')
    expect(sql).not.toContain('${')
    expect(params[0]).toBe('2026-07-14T04:17:00.000Z')
  })

  it('sait dire NON — sous l’interrupteur du balayage : aucune requête, `null`, jamais « 0 »', async () => {
    process.env['RETENTION_SWEEP_DISABLED'] = 'true'
    const query = jest.fn()
    expect(await makeService(query).sweepChatEvalSamples(NOW)).toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it('une erreur rend `null` — la table est intacte', async () => {
    expect(await makeService(jest.fn().mockRejectedValue(new Error('down'))).sweepChatEvalSamples(NOW)).toBeNull()
  })

  it('le passage quotidien APPELLE la purge', () => {
    const source = readFileSync(join(__dirname, 'privacy-retention.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
    expect(source.slice(source.indexOf('async retentionSweepCron('))).toContain('this.sweepChatEvalSamples(')
  })
})
