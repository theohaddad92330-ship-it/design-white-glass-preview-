import { ChannelPerformanceReaderService } from './channel-performance-reader.service'
import type { Repository } from 'typeorm'
import type { ActivityEntity } from '../../database/entities/activity.entity'

/**
 * #3278.3 (#3259.7) — lecture du canal MESURÉ d'un espace. La requête est
 * bornée à l'espace ; l'agrégation en faits (seuil, taux) vit dans le contrat.
 */
function readerReturning(rows: Array<{ channel: string; sent: string; replied: string }>) {
  const query = jest.fn().mockResolvedValue(rows)
  const repo = { manager: { query } } as unknown as Repository<ActivityEntity>
  return { reader: new ChannelPerformanceReaderService(repo), query }
}

describe('ChannelPerformanceReaderService', () => {
  it('borne la requête à l’espace et à la fenêtre de réponse, sans jamais lire le corps', async () => {
    const { reader, query } = readerReturning([])
    await reader.forWorkspace('w-1')
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['w-1', 14])
    expect(sql).toContain('workspace_id = $1')
    expect(sql).toContain("direction = 'outbound'")
    expect(sql).not.toMatch(/\bbody\b|\bsubject\b/)
  })

  it('rend les canaux avec le drapeau suffisant, taux entier', async () => {
    const { reader } = readerReturning([
      { channel: 'call', sent: '20', replied: '8' },
      { channel: 'email', sent: '4', replied: '1' },
    ])
    expect(await reader.forWorkspace('w-1')).toEqual([
      { channel: 'call', sent: 20, replied: 8, sufficient: true, replyRate: 40 },
      { channel: 'email', sent: 4, replied: 1, sufficient: false, replyRate: null },
    ])
  })

  it('un espace sans aucun envoi mesurable rend une liste vide (clé omise du wire)', async () => {
    const { reader } = readerReturning([])
    expect(await reader.forWorkspace('w-1')).toEqual([])
  })

  describe('byRole (#3234, #3211.11)', () => {
    it('borne la requête à l’espace, joint le rôle du contact et ne lit jamais le corps', async () => {
      const { reader, query } = readerReturning([])
      await reader.byRoleForWorkspace('w-1')
      const [sql, params] = query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['w-1', 14])
      expect(sql).toContain('workspace_id = $1')
      expect(sql).toContain('decision_role')
      expect(sql).toContain("direction = 'outbound'")
      expect(sql).not.toMatch(/\bbody\b|\bsubject\b/)
    })

    it('rend les rôles avec le seuil des canaux ; un rôle inconnu ne fait aucune ligne', async () => {
      const query = jest.fn().mockResolvedValue([
        { role: 'technical', sent: '12', replied: '6' },
        { role: 'economic', sent: '3', replied: '0' },
        { role: 'unknown', sent: '40', replied: '9' },
      ])
      const reader = new ChannelPerformanceReaderService({
        manager: { query },
      } as unknown as Repository<ActivityEntity>)
      expect(await reader.byRoleForWorkspace('w-1')).toEqual([
        { role: 'technical', sent: 12, replied: 6, sufficient: true, replyRate: 50 },
        { role: 'economic', sent: 3, replied: 0, sufficient: false, replyRate: null },
      ])
    })
  })

  describe('byAngle (#3211.11, lot RAISON-B)', () => {
    it('relie l’envoi capté au message par l’identifiant fournisseur, borne l’espace, ne lit jamais le corps', async () => {
      const { reader, query } = readerReturning([])
      await reader.byAngleForWorkspace('w-1')
      const [sql, params] = query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['w-1', 14])
      expect(sql).toContain('o.workspace_id = $1')
      expect(sql).toContain('m.workspace_id = o.workspace_id')
      expect(sql).toContain('m.provider_message_id = o.external_id')
      expect(sql).toContain("o.source = 'mailbox'")
      expect(sql).toContain("direction = 'outbound'")
      expect(sql).not.toMatch(/\bo\.body\b|\bsubject\b/)
    })

    it('rend les angles avec le seuil des canaux ; un angle vide ne fait aucune ligne', async () => {
      const query = jest.fn().mockResolvedValue([
        { angle: 'Suite au POC', sent: '12', replied: '6' },
        { angle: 'webinaire', sent: '3', replied: '0' },
        { angle: '  ', sent: '40', replied: '9' },
      ])
      const reader = new ChannelPerformanceReaderService({
        manager: { query },
      } as unknown as Repository<ActivityEntity>)
      expect(await reader.byAngleForWorkspace('w-1')).toEqual([
        { angle: 'suite au poc', sent: 12, replied: 6, sufficient: true, replyRate: 50 },
        { angle: 'webinaire', sent: 3, replied: 0, sufficient: false, replyRate: null },
      ])
    })
  })
})

// #3211.11 (#3234, lot M11) — recommandation par dimension, sur les issues déclarées.
describe('ChannelPerformanceReaderService.outcomeRecommendationFor', () => {
  function reader(items: unknown[], ledger: unknown[] = []) {
    const query = jest.fn().mockResolvedValueOnce(items).mockResolvedValueOnce(ledger)
    const repo = { manager: { query } } as unknown as Repository<ActivityEntity>
    return { reader: new ChannelPerformanceReaderService(repo), query }
  }

  it('cadence : lit les actions FAITES de l’espace, par étape — jamais le grand livre (aucune étape)', async () => {
    const { reader: r, query } = reader([
      { value: 'relance', outcome: 'meeting_booked', count: '4' },
      { value: 'relance', outcome: 'no_response', count: '8' },
      { value: 'preuve_sociale', outcome: 'meeting_booked', count: '9' },
      { value: 'preuve_sociale', outcome: 'no_answer', count: '3' },
    ])
    const result = await r.outcomeRecommendationFor('w-1', 'cadence')
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['w-1'])
    expect(sql).toContain('a.workspace_id = $1')
    expect(sql).toContain("execution_status = 'done'")
    expect(sql).toContain('i.cadence_step')
    expect(result).toMatchObject({ dimension: 'cadence', recommended: 'preuve_sociale', reason: 'measured' })
  })

  it('route : additionne actions et outcomes commerciaux du compte, bornés à l’espace', async () => {
    const { reader: r, query } = reader(
      [{ value: 'partenaire', outcome: 'positive', count: '6' }],
      [
        { value: 'partenaire', outcome: 'message_replied', count: '5' },
        { value: 'partenaire', outcome: 'declined', count: '1' },
        { value: 'sponsor', outcome: 'declined', count: '10' },
        { value: 'sponsor', outcome: 'incorrect_contact', count: '7' },
      ],
    )
    const result = await r.outcomeRecommendationFor('w-1', 'route')
    const [ledgerSql, ledgerParams] = query.mock.calls[1] as [string, unknown[]]
    expect(ledgerSql).toContain('FROM commercial_outcomes o')
    expect(ledgerSql).toContain('o.workspace_id = $1')
    expect(ledgerSql).toContain("recommendedRoute'->>'route'")
    expect(ledgerParams).toEqual(['w-1'])
    expect(result.recommended).toBe('partenaire')
    expect(result.values).toEqual([
      { value: 'partenaire', positive: 11, judged: 12, sufficient: true },
      { value: 'sponsor', positive: 0, judged: 10, sufficient: true },
    ])
  })

  it('SAIT DIRE NON — rien de déclaré : aucune recommandation, aucune valeur à zéro', async () => {
    const { reader: r } = reader([], [])
    await expect(r.outcomeRecommendationFor('w-1', 'priority')).resolves.toEqual({
      dimension: 'priority',
      recommended: null,
      reason: 'no_outcome',
      values: [],
    })
  })
})
