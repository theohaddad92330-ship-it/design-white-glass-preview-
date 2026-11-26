import { PrivacyRetentionService } from './privacy-retention.service'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

function makeService(): { service: PrivacyRetentionService; sessions: MockRepository<UserSessionEntity> } {
  const sessions = createMockRepository<UserSessionEntity>()
  const service = new PrivacyRetentionService(sessions as never)
  return { service, sessions }
}

describe('PrivacyRetentionService', () => {
  const ENV_KEYS = [
    'RETENTION_SWEEP_DISABLED',
    'RETENTION_DAYS_REVOKED_SESSIONS',
    'RETENTION_DAYS_ARCHIVED_SUMMARIES',
    // #2442.17 — les quatre nouvelles catégories d'observabilité.
    'RETENTION_DAYS_PRODUCT_METRICS',
    'RETENTION_DAYS_APPLICATION_LOGS',
    'RETENTION_DAYS_OBSERVABILITY_TRACES',
    'RETENTION_DAYS_SUPPORT_RAW_CAPTURE_WINDOWS',
  ]
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  describe('getRetentionPolicy', () => {
    it('exposes documented rules with safe defaults and the sweep armed by default', () => {
      const { service } = makeService()
      const policy = service.getRetentionPolicy()

      expect(policy.sweepEnabled).toBe(true)
      const sessionRule = policy.rules.find(r => r.key === 'revoked_sessions')
      expect(sessionRule?.days).toBe(90)
      // Every rule carries a rationale (the "why" the policy doc needs).
      expect(policy.rules.every(r => r.rationale.length > 0)).toBe(true)
    })

    it('honours an env override for a retention window', () => {
      process.env['RETENTION_DAYS_REVOKED_SESSIONS'] = '30'
      const { service } = makeService()
      const rule = service.getRetentionPolicy().rules.find(r => r.key === 'revoked_sessions')
      expect(rule?.days).toBe(30)
    })
  })

  describe('sweepRevokedSessions', () => {
    it('is a no-op under the RETENTION_SWEEP_DISABLED kill-switch', async () => {
      process.env['RETENTION_SWEEP_DISABLED'] = 'true'
      const { service, sessions } = makeService()
      const deleted = await service.sweepRevokedSessions()
      expect(deleted).toBe(0)
      expect(sessions.delete).not.toHaveBeenCalled()
    })

    it('purges long-revoked sessions by default (no env needed)', async () => {
      const { service, sessions } = makeService()
      sessions.delete.mockResolvedValue({ affected: 3, raw: [] })

      const deleted = await service.sweepRevokedSessions()

      expect(deleted).toBe(3)
      expect(sessions.delete).toHaveBeenCalledTimes(1)
      const [criteria] = sessions.delete.mock.calls[0]
      expect(criteria).toHaveProperty('revoked_at')
    })
  })

  /**
   * Les résumés ARCHIVÉS (`superseded_at IS NOT NULL`) : le trou nommé par D157.
   *
   * Ce que ces tests tiennent, dans l'ordre d'importance :
   *  1. une ligne VIVANTE n'est jamais atteignable par la requête ;
   *  2. « je n'ai pas pu lire » ≠ « il n'y avait rien » — la méthode rend
   *     `null`, jamais `0`, quand elle n'a pas mesuré ;
   *  3. rien du CONTENU ne sort, ni dans le retour ni dans le journal.
   */
  describe('sweepArchivedConversationSummaries', () => {
    it('ne rend PAS « 0 » sous le kill-switch — elle n’a pas balayé, elle ne l’a pas mesuré', async () => {
      process.env['RETENTION_SWEEP_DISABLED'] = 'true'
      const { service, sessions } = makeService()

      const purged = await service.sweepArchivedConversationSummaries()

      // « Non mesuré » n'est jamais « 0 » : 0 dirait « la table était propre ».
      expect(purged).toBeNull()
      expect(sessions.manager.query).not.toHaveBeenCalled()
    })

    it('n’efface QUE des lignes archivées, plus vieilles que la fenêtre, et par lots bornés', async () => {
      const { service, sessions } = makeService()
      sessions.manager.query.mockResolvedValue([{ id: 'a' }, { id: 'b' }])

      const purged = await service.sweepArchivedConversationSummaries(new Date('2026-08-29T00:00:00.000Z'))

      expect(purged).toBe(2)
      const [sql, params] = sessions.manager.query.mock.calls[0] as [string, unknown[]]
      // Une ligne VIVANTE (`superseded_at IS NULL`) ne peut pas entrer dans
      // l'ensemble : c'est la seule frontière de sûreté qui compte ici.
      expect(sql).toContain('superseded_at IS NOT NULL')
      expect(sql).toContain('conversation_summaries')
      // Bornée : jamais une suppression de masse en une instruction.
      expect(sql).toContain('LIMIT $2')
      // Paramétrée, jamais interpolée (SQL dans un template literal).
      expect(sql).not.toContain('${')
      // 90 jours par défaut, comptés depuis la date d'ARCHIVAGE.
      expect(params[0]).toBe(new Date('2026-05-31T00:00:00.000Z').toISOString())
      expect(typeof params[1]).toBe('number')
      expect(params[1] as number).toBeGreaterThan(0)
    })

    it('compte les lignes, pas la longueur du COUPLE que TypeORM rend sur un DELETE', async () => {
      // La vraie forme d'un `DELETE … RETURNING` sous le pilote Postgres :
      // `[lignes, nombre]`. Lire `.length` dessus rendrait **2** — la taille du
      // couple — quel que soit le nombre de lignes réellement parties.
      const { service, sessions } = makeService()
      sessions.manager.query.mockResolvedValue([[{ id: 'a' }, { id: 'b' }, { id: 'c' }], 3])

      await expect(service.sweepArchivedConversationSummaries()).resolves.toBe(3)
    })

    it('rend 0 — un vrai zéro, mesuré — quand la table est déjà propre', async () => {
      const { service, sessions } = makeService()
      sessions.manager.query.mockResolvedValue([[], 0])

      // Ici « 0 » est VRAI : la requête a tourné et n'a rien trouvé. C'est la
      // phrase que `null` ne doit pas remplacer, et inversement.
      await expect(service.sweepArchivedConversationSummaries()).resolves.toBe(0)
    })

    it('honore la fenêtre d’env', async () => {
      process.env['RETENTION_DAYS_ARCHIVED_SUMMARIES'] = '30'
      const { service, sessions } = makeService()

      await service.sweepArchivedConversationSummaries(new Date('2026-08-29T00:00:00.000Z'))

      const [, params] = sessions.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params[0]).toBe(new Date('2026-07-30T00:00:00.000Z').toISOString())
    })

    it('rend `null` — et non 0 — quand la lecture échoue', async () => {
      const { service, sessions } = makeService()
      sessions.manager.query.mockRejectedValue(new Error('connexion perdue'))

      await expect(service.sweepArchivedConversationSummaries()).resolves.toBeNull()
    })

    it('rend `null` quand le pilote ne rend pas une liste — un comptage impossible n’est pas zéro', async () => {
      const { service, sessions } = makeService()
      sessions.manager.query.mockResolvedValue(undefined as never)

      await expect(service.sweepArchivedConversationSummaries()).resolves.toBeNull()
    })

    it('ne journalise QUE des comptes — jamais un identifiant, jamais un extrait', async () => {
      const { service, sessions } = makeService()
      sessions.manager.query.mockResolvedValue([{ id: 'ident-secret' }])
      const written: string[] = []
      jest.spyOn(service['logger'], 'log').mockImplementation((message: unknown) => void written.push(String(message)))

      await service.sweepArchivedConversationSummaries()

      expect(written.length).toBeGreaterThan(0)
      for (const line of written) expect(line).not.toContain('ident-secret')
    })
  })
})

describe('PrivacyRetentionService — cron-tick singleton lock (multi-replica)', () => {
  afterEach(() => {
    delete process.env['RETENTION_SWEEP_ENABLED']
  })

  it('sweeps under the "privacy-retention-sweep" lock when wired', async () => {
    process.env['RETENTION_SWEEP_ENABLED'] = 'true'
    const sessions = createMockRepository<UserSessionEntity>()
    sessions.delete.mockResolvedValue({ affected: 0, raw: [] })
    const locks = { withLock: jest.fn((_name: string, fn: () => Promise<void>) => fn().then(() => true)) }
    const service = new PrivacyRetentionService(sessions as never, locks as never)

    await service.retentionSweepCron()

    expect(locks.withLock).toHaveBeenCalledWith('privacy-retention-sweep', expect.any(Function))
    expect(sessions.delete).toHaveBeenCalledTimes(1)
  })

  it('does nothing when another replica holds the tick lock', async () => {
    process.env['RETENTION_SWEEP_ENABLED'] = 'true'
    const sessions = createMockRepository<UserSessionEntity>()
    const locks = { withLock: jest.fn().mockResolvedValue(false) }
    const service = new PrivacyRetentionService(sessions as never, locks as never)

    await service.retentionSweepCron()

    expect(sessions.delete).not.toHaveBeenCalled()
  })

  describe('sweepActivityBodies (finding #7)', () => {
    // Ce describe vit hors du beforeEach ENV_KEYS du premier describe — on nettoie
    // nous-mêmes le kill-switch pour qu'il ne fuie pas d'un test au suivant.
    beforeEach(() => delete process.env['RETENTION_SWEEP_DISABLED'])
    afterEach(() => delete process.env['RETENTION_SWEEP_DISABLED'])

    it('ne rend PAS « 0 » sous le kill-switch', async () => {
      process.env['RETENTION_SWEEP_DISABLED'] = 'true'
      const { service, sessions } = makeService()
      const scrubbed = await service.sweepActivityBodies()
      expect(scrubbed).toBeNull()
      expect(sessions.manager.query).not.toHaveBeenCalled()
    })

    it('scrube le CONTENU des activités échues (UPDATE), garde la ligne, par lots bornés', async () => {
      const { service, sessions } = makeService()
      sessions.manager.query.mockResolvedValue([{ id: 'a' }, { id: 'b' }])

      const scrubbed = await service.sweepActivityBodies(new Date('2026-09-12T00:00:00.000Z'))

      expect(scrubbed).toBe(2)
      const [sql, params] = sessions.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('UPDATE activities')
      expect(sql).toContain('SET body = NULL')
      expect(sql).toContain('subject = NULL')
      // Ne re-touche pas un corps déjà effacé, et ne SUPPRIME jamais la ligne.
      expect(sql).toContain('body IS NOT NULL')
      expect(sql).not.toContain('DELETE FROM activities')
      // Bornée + paramétrée.
      expect(sql).toContain('LIMIT $2')
      expect(sql).not.toContain('${')
      // 3 ans (1095 j) par défaut, comptés depuis la date de l'événement.
      expect(params[0]).toBe(new Date('2023-09-13T00:00:00.000Z').toISOString())
      expect(params[1] as number).toBeGreaterThan(0)
    })

    it('rend un vrai 0 mesuré quand rien n’est à scruber', async () => {
      const { service, sessions } = makeService()
      sessions.manager.query.mockResolvedValue([[], 0])
      await expect(service.sweepActivityBodies()).resolves.toBe(0)
    })
  })

  describe('#2442.17 — rétention par catégorie d’observabilité (LAU-FINAL-156)', () => {
    const OBSERVABILITY_CATEGORIES = ['metriques', 'logs', 'traces', 'audit', 'securite', 'support'] as const

    it('couvre les six catégories nommées, une fois chacune', () => {
      const { service } = makeService()
      const categorised = service.getRetentionPolicy().rules.filter(r => r.observabilityCategory !== undefined)
      const seen = categorised.map(r => r.observabilityCategory)
      // Un ensemble, pas une liste : on vérifie l'ABSENCE de doublon ET de trou.
      expect(new Set(seen)).toEqual(new Set(OBSERVABILITY_CATEGORIES))
      // Une catégorie ne doit pas être portée deux fois — sinon deux durées se
      // disputeraient la même catégorie, et laquelle gagne serait un hasard (GA-26).
      expect(seen.length).toBe(OBSERVABILITY_CATEGORIES.length)
    })

    it('chaque catégorie a sa PROPRE variable d’environnement — en changer une ne bouge pas les autres', () => {
      process.env['RETENTION_DAYS_PRODUCT_METRICS'] = '10'
      const { service } = makeService()
      const policy = service.getRetentionPolicy()
      const byCategory = (c: (typeof OBSERVABILITY_CATEGORIES)[number]) =>
        policy.rules.find(r => r.observabilityCategory === c)?.days

      expect(byCategory('metriques')).toBe(10)
      // SAIT DIRE NON : si le lecteur d'env était partagé, les quatre vaudraient 10.
      expect(byCategory('logs')).not.toBe(10)
      expect(byCategory('traces')).not.toBe(10)
      expect(byCategory('support')).not.toBe(10)
    })

    it('aucune catégorie ne se devine à zéro ni « vie du compte »', () => {
      // Contrairement aux règles RGPD business (facturation, comptes inactifs),
      // une catégorie d'observabilité déclare TOUJOURS un nombre de jours positif :
      // `null` (vie du compte) n'a pas de sens pour un journal ou une trace, et
      // `0` se lirait comme une purge immédiate que personne n'a demandée.
      const { service } = makeService()
      const categorised = service.getRetentionPolicy().rules.filter(r => r.observabilityCategory !== undefined)
      expect(categorised.length).toBeGreaterThan(0)
      for (const rule of categorised) {
        expect(typeof rule.days).toBe('number')
        expect(rule.days as number).toBeGreaterThan(0)
      }
    })

    it('audit et sécurité référencent les règles EXISTANTES, pas une deuxième déclaration', () => {
      // GA-26 — le journal d'accès back-office et les sessions révoquées ont
      // déjà leur fenêtre plus haut dans ce fichier ; #2442.17 les CLASSE, il
      // ne redéclare pas une durée concurrente pour le même fait.
      const { service } = makeService()
      const policy = service.getRetentionPolicy()
      expect(policy.rules.find(r => r.key === 'backoffice_access')?.observabilityCategory).toBe('audit')
      expect(policy.rules.find(r => r.key === 'revoked_sessions')?.observabilityCategory).toBe('securite')
    })
  })
})
