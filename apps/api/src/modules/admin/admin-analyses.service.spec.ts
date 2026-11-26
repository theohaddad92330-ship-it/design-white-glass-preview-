import type { DataSource } from 'typeorm'
import { AdminAnalysesService, parisWindow } from './admin-analyses.service'

/**
 * Wire an {@link AdminAnalysesService} onto an in-memory `DataSource.query`
 * mock routed by SQL marker (each query carries a distinctive fragment). Mirrors
 * how the real service is fed — a raw DataSource, no user scope.
 */
function makeService(query: jest.Mock) {
  const dataSource = { query } as unknown as DataSource
  return new AdminAnalysesService(dataSource)
}

describe('AdminAnalysesService', () => {
  describe('listAnalyses', () => {
    it('maps rows (fullName, isZombie, phasesCompleted) and returns the total', async () => {
      const query = jest.fn((sql: string) => {
        if (/COUNT\(\*\)::int AS total/.test(sql)) return Promise.resolve([{ total: 2 }])
        // list query
        return Promise.resolve([
          {
            accountId: 'acc-1',
            companyName: 'ACME',
            siren: '123456789',
            status: 'error',
            commercialStatus: 'inbox',
            userId: 'u1',
            email: 'ann@acme.io',
            firstName: 'Ann',
            lastName: 'Lee',
            workspaceId: 'w1',
            workspaceName: 'Acme ESN',
            costUsd: 0.42,
            priorityScore: 7,
            errorMessage: 'boom',
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:05:00Z'),
            phasesCompleted: 2,
            lastPhase: 'contacts',
            isZombie: false,
          },
        ])
      })
      const service = makeService(query)

      const result = await service.listAnalyses({ limit: 10 })

      expect(result.total).toBe(2)
      expect(result.limit).toBe(10)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toMatchObject({
        accountId: 'acc-1',
        fullName: 'Ann Lee',
        status: 'error',
        costUsd: 0.42,
        phasesCompleted: 2,
        lastPhase: 'contacts',
        isZombie: false,
      })
    })

    it('passes the search term as an ILIKE param to company/email/siren', async () => {
      const query = jest.fn((sql: string) => {
        if (/COUNT/.test(sql)) return Promise.resolve([{ total: 0 }])
        return Promise.resolve([])
      })
      const service = makeService(query)

      await service.listAnalyses({ search: 'acme' })

      const listCall = query.mock.calls.find(c => /ORDER BY a\.updated_at DESC/.test(c[0] as string))
      expect(listCall).toBeDefined()
      const [sql, params] = listCall as unknown as [string, unknown[]]
      expect(sql).toMatch(/a\.company_name ILIKE/)
      expect(sql).toMatch(/p\.email ILIKE/)
      expect(params).toContain('%acme%')
    })

    it('selects stuck analyzing rows when status is the "zombie" pseudo-value', async () => {
      const query = jest.fn((sql: string) => {
        if (/COUNT/.test(sql)) return Promise.resolve([{ total: 0 }])
        return Promise.resolve([])
      })
      const service = makeService(query)

      await service.listAnalyses({ status: 'zombie' })

      const listCall = query.mock.calls.find(c => /ORDER BY a\.updated_at DESC/.test(c[0] as string))
      const [sql] = listCall as unknown as [string, unknown[]]
      expect(sql).toMatch(/a\.status = 'analyzing' AND a\.updated_at < now\(\) - make_interval/)
    })

    it('clamps the limit to the hard ceiling', async () => {
      const query = jest.fn((sql: string) =>
        /COUNT/.test(sql) ? Promise.resolve([{ total: 0 }]) : Promise.resolve([]),
      )
      const service = makeService(query)

      const result = await service.listAnalyses({ limit: 9999 })

      expect(result.limit).toBe(200)
    })

    it('never throws — returns an empty page on a DB error', async () => {
      const query = jest.fn().mockRejectedValue(new Error('db down'))
      const service = makeService(query)

      const result = await service.listAnalyses({})

      expect(result).toEqual({ rows: [], total: 0, limit: 50, offset: 0 })
    })
  })

  describe('getAudit', () => {
    function auditQueryRouter(detail: Record<string, unknown> | null): jest.Mock {
      return jest.fn((sql: string) => {
        if (/FROM outbox/.test(sql)) return Promise.resolve([{ correlationId: 'cid-123' }])
        if (/FROM analysis_runs/.test(sql))
          return Promise.resolve([
            {
              id: 'run-1',
              status: 'error',
              scopeMode: 'france',
              siren: '123456789',
              costUsd: 0.42,
              createdAt: new Date('2026-01-01T10:00:00Z'),
              completedAt: new Date('2026-01-01T10:05:00Z'),
            },
          ])
        // detail
        return Promise.resolve(detail ? [detail] : [])
      })
    }

    it('returns null when the account does not exist', async () => {
      const service = makeService(auditQueryRouter(null))
      expect(await service.getAudit('missing')).toBeNull()
    })

    it('surfaces error phase, real correlation id, credit signal and per-phase providers', async () => {
      const detail = {
        accountId: 'acc-1',
        companyName: 'ACME',
        siren: '123456789',
        status: 'error',
        commercialStatus: 'inbox',
        userId: 'u1',
        email: 'ann@acme.io',
        firstName: 'Ann',
        lastName: 'Lee',
        workspaceId: 'w1',
        workspaceName: 'Acme ESN',
        costUsd: 0.42,
        priorityScore: 7,
        errorMessage: 'anthropic: credit balance is too low',
        createdAt: new Date('2026-01-01T10:00:00Z'),
        updatedAt: new Date('2026-01-01T10:05:00Z'),
        isZombie: false,
        phaseTelemetryRaw: [
          {
            name: 'research',
            costUsd: 0.3,
            inputTokens: 1000,
            outputTokens: 200,
            durationMs: 12000,
            sources: [
              { provider: 'brave', status: 'ok', detail: '10 hits' },
              { provider: 'firecrawl', status: 'down', detail: '429' },
            ],
          },
        ],
      }
      const service = makeService(auditQueryRouter(detail))

      const audit = await service.getAudit('acc-1')

      expect(audit).not.toBeNull()
      expect(audit!.correlationId).toBe('cid-123')
      expect(audit!.correlationSource).toBe('outbox')
      expect(audit!.iaConsoleQueryable).toBe(false)
      // research is present → first missing phase is 'contacts'.
      expect(audit!.errorPhase).toBe('contacts')
      expect(audit!.phasesCompleted).toEqual(['research'])
      expect(audit!.creditSignal).toEqual({ provider: 'anthropic', kind: 'credit' })
      expect(audit!.phaseTelemetry[0].sources).toHaveLength(2)
      expect(audit!.phaseTelemetry[0].sources[1]).toEqual({ provider: 'firecrawl', status: 'down', detail: '429' })
      expect(audit!.runs).toHaveLength(1)
    })

    it('does not name a stopped-at phase for a completed run', async () => {
      const detail = {
        accountId: 'acc-2',
        companyName: 'DONE',
        status: 'completed',
        userId: 'u1',
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        phaseTelemetryRaw: [{ name: 'research' }, { name: 'contacts' }],
      }
      const service = makeService(auditQueryRouter(detail))

      const audit = await service.getAudit('acc-2')

      expect(audit!.errorPhase).toBeNull()
      expect(audit!.creditSignal).toBeNull()
    })
  })

  // ── #1650 — « quand le produit est utilisé » ────────────────────────────────
  describe('parisWindow', () => {
    // `now` is a PARAMETER, never read from the clock inside: a test that reads
    // the clock passes in Paris and fails on a UTC CI runner.
    it('returns 7 consecutive Paris calendar days, oldest first, ending today', () => {
      const { days } = parisWindow(new Date('2026-09-07T12:00:00Z'), 7)

      expect(days).toEqual([
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-09-06',
        '2026-09-07',
      ])
    })

    it('reads the day in PARIS, not UTC — 23:30 UTC is already tomorrow in winter', () => {
      // UTC+1. Reading this instant in UTC would put the window one day behind
      // what the operator sees on their own screen.
      const { days, now } = parisWindow(new Date('2026-01-01T23:30:00Z'), 7)

      expect(days[days.length - 1]).toBe('2026-01-02')
      expect(now).toEqual({ day: '2026-01-02', hour: 0 })
    })

    it('follows summer time too — 22:30 UTC in July is already tomorrow in Paris', () => {
      const { days, now } = parisWindow(new Date('2026-07-01T22:30:00Z'), 7)

      expect(days[days.length - 1]).toBe('2026-07-02')
      expect(now.hour).toBe(0)
    })

    it('keeps 7 distinct days across the spring DST change (no 23h/25h day)', () => {
      // Europe/Paris springs forward on 2026-03-29. Walking calendar days on a
      // UTC-anchored clock is what keeps this from producing a duplicate day.
      const { days } = parisWindow(new Date('2026-03-31T09:00:00Z'), 7)

      expect(new Set(days).size).toBe(7)
      expect(days).toContain('2026-03-29')
      expect(days[days.length - 1]).toBe('2026-03-31')
    })

    it('reports the Paris hour of the read — the future of today is not zero', () => {
      const { now } = parisWindow(new Date('2026-09-07T12:00:00Z'), 7)

      // 12:00 UTC = 14 h in Paris in September.
      expect(now).toEqual({ day: '2026-09-07', hour: 14 })
    })
  })

  describe('getLaunchHeatmap', () => {
    it('counts LAUNCHES per Paris day × hour and names the workspaces of each slot', async () => {
      const query = jest.fn().mockResolvedValue([
        { day: '2026-09-07', hour: 9, count: 3, workspaces: ['Acme ESN', 'Beta ESN'], withoutWorkspace: 0 },
        { day: '2026-09-07', hour: 23, count: 1, workspaces: [], withoutWorkspace: 1 },
      ])
      const service = makeService(query)

      const heatmap = await service.getLaunchHeatmap(new Date('2026-09-07T12:00:00Z'))

      expect(heatmap.timeZone).toBe('Europe/Paris')
      expect(heatmap.days).toHaveLength(7)
      expect(heatmap.now).toEqual({ day: '2026-09-07', hour: 14 })
      expect(heatmap.buckets).toEqual([
        { day: '2026-09-07', hour: 9, count: 3, workspaces: ['Acme ESN', 'Beta ESN'], withoutWorkspace: 0 },
        { day: '2026-09-07', hour: 23, count: 1, workspaces: [], withoutWorkspace: 1 },
      ])
      // The total covers the whole window, including the hours the 8h–20h grid
      // does not draw — otherwise "no analysis this week" would be a lie.
      expect(heatmap.total).toBe(4)
    })

    it('reads analysis_runs (the launch), grouped in the console time zone', async () => {
      const query = jest.fn().mockResolvedValue([])
      const service = makeService(query)

      await service.getLaunchHeatmap(new Date('2026-09-07T12:00:00Z'))

      const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
      expect(sql).toMatch(/FROM analysis_runs/)
      expect(sql).toMatch(/AT TIME ZONE 'Europe\/Paris'/)
      expect(sql).toMatch(/LEFT JOIN workspaces/)
      // The bounds are cast to `timestamp` before `AT TIME ZONE`. Without it,
      // Postgres has two equally reachable overloads from `date` and they mean
      // different things — the query would resolve, and silently shift.
      expect(sql).toMatch(/\(\$1::date\)::timestamp AT TIME ZONE/)
      expect(sql).toMatch(/\(\$2::date \+ 1\)::timestamp AT TIME ZONE/)
      // Bounded on both sides, by the Paris calendar days of the window.
      expect(params).toEqual(['2026-09-01', '2026-09-07'])
    })

    it('names no PERSON — the payload carries workspaces, never a user', async () => {
      const query = jest.fn().mockResolvedValue([])
      const service = makeService(query)

      await service.getLaunchHeatmap(new Date('2026-09-07T12:00:00Z'))

      const [sql] = query.mock.calls[0] as unknown as [string, unknown[]]
      expect(sql).not.toMatch(/profiles|p\.email|first_name|last_name|user_id/)
    })

    it('sait dire NON — a DB failure THROWS instead of returning an empty week', async () => {
      // `listAnalyses` swallows and returns an empty page; here that would paint
      // "Aucune analyse cette semaine" over an outage. An unreadable week is not
      // a week without analyses.
      const query = jest.fn().mockRejectedValue(new Error('db down'))
      const service = makeService(query)

      await expect(service.getLaunchHeatmap(new Date('2026-09-07T12:00:00Z'))).rejects.toThrow('db down')
    })

    it('coerces a malformed row rather than trusting it — never a fabricated count', async () => {
      const query = jest.fn().mockResolvedValue([{ day: '2026-09-05', hour: '7', count: null, workspaces: null }])
      const service = makeService(query)

      const heatmap = await service.getLaunchHeatmap(new Date('2026-09-07T12:00:00Z'))

      expect(heatmap.buckets).toEqual([{ day: '2026-09-05', hour: 7, count: 0, workspaces: [], withoutWorkspace: 0 }])
    })
  })
})
