import { ENRICHED_CONTACT_RETENTION_DAYS } from '@bellum/contracts'
import { PrivacyRetentionService } from './privacy-retention.service'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { createMockRepository } from '../../database/test-utils'

/**
 * #2297.51 — décision Louis 19/09/2026 : trois ans (référence CNIL) après le
 * dernier contact ou la dernière activité, les coordonnées ENRICHIES d'un
 * contact sont ARCHIVÉES — plus affichées, plus exportées, jamais supprimées
 * (« on archive, on ne supprime pas »). Seule une demande d'effacement RGPD
 * supprime réellement (`privacy-deletion.service.ts::anonymizeContacts`).
 */
function makeService() {
  const sessions = createMockRepository<UserSessionEntity>()
  const service = new PrivacyRetentionService(sessions as never)
  return { service, sessions }
}

describe('#2297.51 — rétention des coordonnées enrichies', () => {
  beforeEach(() => delete process.env['RETENTION_SWEEP_DISABLED'])
  afterEach(() => delete process.env['RETENTION_SWEEP_DISABLED'])

  it('la durée vit à UN seul endroit : trois ans, lus au contrat, non réglables par variable', () => {
    expect(ENRICHED_CONTACT_RETENTION_DAYS).toBe(1095)
    process.env['RETENTION_DAYS_ENRICHED_CONTACT_DETAILS'] = '1'
    try {
      const rule = makeService()
        .service.getRetentionPolicy()
        .rules.find(r => r.key === 'enriched_contact_details')
      expect(rule?.days).toBe(ENRICHED_CONTACT_RETENTION_DAYS)
      expect(rule?.rationale).toMatch(/archiv/i)
    } finally {
      delete process.env['RETENTION_DAYS_ENRICHED_CONTACT_DETAILS']
    }
  })

  it('ne rend PAS « 0 » sous le kill-switch — il n’a pas balayé', async () => {
    process.env['RETENTION_SWEEP_DISABLED'] = 'true'
    const { service, sessions } = makeService()
    await expect(service.sweepStaleEnrichedContacts()).resolves.toBeNull()
    expect(sessions.manager.query).not.toHaveBeenCalled()
  })

  it('ARCHIVE (UPDATE, jamais DELETE) les seules coordonnées enrichies, 3 ans après la dernière activité, par lots', async () => {
    const { service, sessions } = makeService()
    sessions.manager.query.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }])
    const now = new Date('2026-09-19T00:00:00.000Z')

    await expect(service.sweepStaleEnrichedContacts(now)).resolves.toBe(2)

    const [sql, params] = sessions.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('UPDATE contacts')
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    // On archive : la valeur part dans l'archive, la colonne lue redevient inconnue.
    expect(sql).toContain('enrichment_archive')
    expect(sql).toContain('enrichment_archived_at')
    // Seulement ce que l'ENRICHISSEMENT a apporté — jamais une saisie de l'espace.
    expect(sql).toContain("NOT IN ('manual', 'import', 'crm')")
    expect(sql).toContain('email_cost_credits IS NOT NULL')
    // « Dernier contact / activité » : les faits tracés, jamais `updated_at`.
    expect(sql).toContain('FROM activities')
    expect(sql).toContain('FROM user_actions')
    expect(sql).not.toContain('updated_at')
    // Une fiche effacée (RGPD) n'a plus rien à archiver.
    expect(sql).toContain('anonymized_at IS NULL')
    // Bornée, paramétrée.
    expect(sql).toContain('LIMIT $2')
    expect(sql).not.toContain('${')
    expect(params[0]).toBe(new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000).toISOString())
    expect(params[1] as number).toBeGreaterThan(0)
    expect(params[2]).toBe(now.toISOString())
  })

  it('rend un vrai 0 mesuré quand rien n’est échu, et `null` quand la lecture échoue', async () => {
    const { service, sessions } = makeService()
    sessions.manager.query.mockResolvedValueOnce([])
    await expect(service.sweepStaleEnrichedContacts()).resolves.toBe(0)
    sessions.manager.query.mockRejectedValueOnce(new Error('boom'))
    await expect(service.sweepStaleEnrichedContacts()).resolves.toBeNull()
  })

  it('est APPELÉ par le balayage quotidien — pas seulement testé', async () => {
    const { service, sessions } = makeService()
    sessions.delete.mockResolvedValue({ affected: 0, raw: [] })
    sessions.manager.query.mockResolvedValue([])
    const sweep = jest.spyOn(service, 'sweepStaleEnrichedContacts')
    await service.retentionSweepCron()
    expect(sweep).toHaveBeenCalledTimes(1)
  })
})
