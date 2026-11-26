import { SignalHistoryService } from './signal-history.service'
import type { SignalHistoryEntity } from '../../database/entities/signal-history.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * Historique de signal (restitution V2 §11). La matérialisation est du SQL brut,
 * les preuves portent donc sur le CONTRAT de ces requêtes : identité stable,
 * upsert qui ne réécrit JAMAIS la première détection, comptage des changements,
 * résolution de ce qui a disparu, scoping workspace en lecture, et dégradation
 * silencieuse (ne lève jamais — une analyse aboutie ne doit pas échouer ici).
 */
describe('SignalHistoryService', () => {
  let repo: MockRepository<SignalHistoryEntity>
  let service: SignalHistoryService

  beforeEach(() => {
    repo = createMockRepository<SignalHistoryEntity>()
    service = new SignalHistoryService(repo as never)
  })

  /** Fait répondre le SELECT du compte, puis les écritures. */
  function givenAccount(recentSignals: unknown, workspaceId: string | null = 'ws-1'): void {
    repo.manager.query
      .mockResolvedValueOnce([{ workspace_id: workspaceId, recent_signals: recentSignals }])
      .mockResolvedValue([])
  }

  describe('materialize', () => {
    it('upserts one row per signal without ever overwriting first_detected_at', async () => {
      givenAccount([{ signal: 'Levée de fonds', type: 'funding', source: 'Les Échos', date: '2026-07-02' }])

      await service.materialize('acc-1')

      const [sql, params] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(sql).toContain('INSERT INTO signal_history')
      expect(sql).toContain('ON CONFLICT (account_id, md5(signal_key)) DO UPDATE SET')
      // La preuve du § : la 1re détection n'est pas dans le SET de l'upsert.
      expect(sql).not.toContain('first_detected_at =')
      expect(sql).not.toContain('first_detection_exact =')
      expect(sql).toContain('last_seen_at    = now()')
      expect(params).toEqual([
        'acc-1',
        'ws-1',
        'levée de fonds',
        'Levée de fonds',
        'funding',
        'Les Échos',
        '2026-07-02',
        null,
        // Importance dérivée (V2 §20) : signal daté 2026 + sourcé ⇒ `high`.
        'high',
      ])
    })

    // ── L'objet `Signal` complété (restitution V2 §20) ────────────────────────
    it('stamps the derived importance, and NEVER clears the action a signal triggered', async () => {
      givenAccount([{ signal: 'Levée de fonds', source: 'Les Échos', date: '2026-07-02' }])

      await service.materialize('acc-1')

      const [sql] = repo.manager.query.mock.calls[1] as [string]
      expect(sql).toContain('importance      = EXCLUDED.importance')
      // Même garantie que `first_detected_at` : une re-analyse ne peut pas
      // effacer le lien vers l'action déclenchée.
      expect(sql).not.toContain('action_id =')
    })

    it('does not count a derived importance shift as a content change', async () => {
      givenAccount([{ signal: 'Levée de fonds', source: 'Les Échos', date: '2026-07-02' }])

      await service.materialize('acc-1')

      const [sql] = repo.manager.query.mock.calls[1] as [string]
      // La comparaison `IS DISTINCT FROM` cite les colonnes stockées sous la
      // forme `signal_history.<col>` : l'importance n'y figure pas (elle bouge
      // toute seule avec le temps, ce n'est pas une mise à jour du signal).
      expect(sql).not.toContain('signal_history.importance')
    })

    it('counts a change only when the payload actually moved (idempotent re-run)', async () => {
      givenAccount([{ signal: 'Levée de fonds' }])
      await service.materialize('acc-1')
      const [sql] = repo.manager.query.mock.calls[1] as [string]
      expect(sql).toContain('change_count    = signal_history.change_count + CASE WHEN')
      expect(sql).toContain('IS DISTINCT FROM')
      // Un signal résolu qui réapparaît compte comme un changement.
      expect(sql).toContain('signal_history.status')
      expect(sql).toContain('resolved_at     = NULL')
    })

    it('resolves the signals that are no longer in the analysis, dating the disappearance once', async () => {
      givenAccount([{ signal: 'Levée de fonds' }])

      await service.materialize('acc-1')

      const [sql, params] = repo.manager.query.mock.calls[2] as [string, unknown[]]
      expect(sql).toContain("SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())")
      expect(sql).toContain('NOT (signal_key = ANY($2::text[]))')
      expect(params).toEqual(['acc-1', ['levée de fonds']])
    })

    it('resolves everything when the analysis returned an empty signal list', async () => {
      givenAccount([])

      await service.materialize('acc-1')

      // Pas d'INSERT (rien à insérer), juste la résolution.
      expect(repo.manager.query).toHaveBeenCalledTimes(2)
      const [sql, params] = repo.manager.query.mock.calls[1] as [string, unknown[]]
      expect(sql).toContain("status = 'resolved'")
      expect(params).toEqual(['acc-1', []])
    })

    it('touches NOTHING when the blob is absent — an absence of data proves no disappearance', async () => {
      givenAccount(null)
      await service.materialize('acc-1')
      expect(repo.manager.query).toHaveBeenCalledTimes(1)
    })

    it('touches nothing for an unknown or deleted account', async () => {
      repo.manager.query.mockResolvedValueOnce([])
      await service.materialize('acc-1')
      expect(repo.manager.query).toHaveBeenCalledTimes(1)
    })

    it('never throws — a history blip must not fail an analysis that completed', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.materialize('acc-1')).resolves.toBeUndefined()
    })
  })

  describe('listForWorkspace', () => {
    it('scopes on the workspace (with account-parent fallback) and excludes deleted accounts', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.listForWorkspace('ws-1')

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual(['ws-1'])
      expect(sql).toContain('h.workspace_id = $1 OR a.workspace_id = $1')
      expect(sql).toContain("a.status <> 'deleted'")
    })

    it('reads the importance and the triggered action’s own label (V2 §20)', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.listForWorkspace('ws-1')

      const [sql] = repo.manager.query.mock.calls[0] as [string]
      expect(sql).toContain('h.importance            AS importance')
      expect(sql).toContain('h.action_id             AS action_id')
      // Le libellé vient de l'action elle-même, jamais d'une reformulation.
      expect(sql).toContain('LEFT JOIN action_plan_items i ON i.id = h.action_id')
      expect(sql).toContain('i.label                 AS action_label')
    })

    // #2107.28 — « ce qui a bougé ». Le libellé du SIGNAL lui-même (pas celui de
    // l'action qu'il a déclenchée) est déjà écrit à la matérialisation
    // (`INSERT ... label`), mais cette lecture ne le remontait pas — le brief ne
    // savait donc jamais QUOI décrire, seulement QUAND.
    it('reads the signal’s own label (#2107.28)', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.listForWorkspace('ws-1')

      const [sql] = repo.manager.query.mock.calls[0] as [string]
      expect(sql).toContain('h.label                 AS label')
    })

    it('returns [] and never throws on a query error', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.listForWorkspace('ws-1')).resolves.toEqual([])
    })

    // #3206.2 (partiel, épopée #3240) — la lecture doit remonter le champ que
    // `verifySignal` écrit, sinon la Veille ne peut jamais afficher CURRENT_VERIFIED.
    it('reads last_verified_at (#3206.2)', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.listForWorkspace('ws-1')

      const [sql] = repo.manager.query.mock.calls[0] as [string]
      expect(sql).toContain('h.last_verified_at      AS last_verified_at')
    })

    // Théo L1 — sélecteur avancé — l'identifiant de la ligne : c'est par lui
    // qu'une offre d'emploi se désigne comme périmètre de Laura (`job_offer`).
    it('reads the row id (Théo L1 — job_offer scope)', async () => {
      repo.manager.query.mockResolvedValue([])

      await service.listForWorkspace('ws-1')

      const [sql] = repo.manager.query.mock.calls[0] as [string]
      expect(sql).toContain('h.id                    AS id')
    })
  })

  // Théo L1 — sélecteur avancé — l'offre d'emploi qu'un fil de Laura désigne.
  describe('readJobOffer', () => {
    const id = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'

    it('reads ONE recruitment signal, bounded to the caller’s workspace — never another one', async () => {
      repo.manager.query.mockResolvedValue([])

      await expect(service.readJobOffer(id, 'ws-1')).resolves.toBeNull()

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(params).toEqual([id, 'ws-1'])
      expect(sql).toContain('h.id = $1')
      // Le COMPTE est dans l'espace, et la ligne n'en porte pas un autre.
      expect(sql).toContain('a.workspace_id = $2')
      expect(sql).toContain('(h.workspace_id IS NULL OR h.workspace_id = $2)')
      expect(sql).toContain("a.status <> 'deleted'")
      // Seul un signal de RECRUTEMENT est une offre d'emploi.
      expect(sql).toContain("h.signal_type IN ('recrutement', 'hiring', 'recruitment')")
      // Le dossier du compte, tel qu'il est stocké — rien n'est recalculé.
      expect(sql).toContain("raw_analysis -> 'it_job_signals'")
    })

    it('returns the row it read', async () => {
      const row = { label: 'Architecte cloud', signal_key: 'architecte cloud' }
      repo.manager.query.mockResolvedValue([row])
      await expect(service.readJobOffer(id, 'ws-1')).resolves.toBe(row)
    })

    it('lets its error through — « illisible » is not « introuvable »', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.readJobOffer(id, 'ws-1')).rejects.toThrow('boom')
    })
  })

  // ── Lien signal → action déclenchée (restitution V2 §20) ────────────────────
  describe('hasSignal', () => {
    it('checks membership on the SHARED identity (account + normalized label), workspace-scoped', async () => {
      repo.manager.query.mockResolvedValue([{ id: 'h-1' }])

      await expect(
        service.hasSignal({ workspaceId: 'ws-1', accountId: 'acc-1', label: '  Levée de   FONDS ' }),
      ).resolves.toBe(true)

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('md5(h.signal_key) = md5($3)')
      expect(sql).toContain('(h.workspace_id = $1 OR a.workspace_id = $1)')
      expect(params).toEqual(['ws-1', 'acc-1', 'levée de fonds'])
    })

    it('is false for an unknown signal — and on a query error (refuser plutôt que lier à l’aveugle)', async () => {
      repo.manager.query.mockResolvedValueOnce([])
      await expect(service.hasSignal({ workspaceId: 'ws-1', accountId: 'acc-1', label: 'x' })).resolves.toBe(false)

      repo.manager.query.mockRejectedValueOnce(new Error('boom'))
      await expect(service.hasSignal({ workspaceId: 'ws-1', accountId: 'acc-1', label: 'x' })).resolves.toBe(false)
    })
  })

  describe('linkAction', () => {
    it('stamps action_id on the matching signal, scoped to the workspace', async () => {
      repo.manager.query.mockResolvedValue([{ id: 'h-1' }])

      await expect(
        service.linkAction({ workspaceId: 'ws-1', accountId: 'acc-1', label: 'Levée de fonds', actionId: 'act-1' }),
      ).resolves.toBe(true)

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('UPDATE signal_history h')
      expect(sql).toContain('SET action_id = $4')
      expect(sql).toContain('(h.workspace_id = $1 OR a.workspace_id = $1)')
      expect(params).toEqual(['ws-1', 'acc-1', 'levée de fonds', 'act-1'])
    })

    it('is false when nothing matched (unknown signal or another workspace)', async () => {
      repo.manager.query.mockResolvedValueOnce([])
      await expect(
        service.linkAction({ workspaceId: 'ws-1', accountId: 'acc-1', label: 'x', actionId: 'act-1' }),
      ).resolves.toBe(false)
    })

    it('never throws — a link blip must not fail the action the user just created', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(
        service.linkAction({ workspaceId: 'ws-1', accountId: 'acc-1', label: 'x', actionId: 'act-1' }),
      ).resolves.toBe(false)
    })
  })

  // #3206.2 (partiel, épopée #3240) — « Marquer ce signal comme vérifié ».
  describe('verifySignal', () => {
    it('stamps last_verified_at = now() on the matching signal, scoped to the workspace', async () => {
      repo.manager.query.mockResolvedValue([{ id: 'h-1' }])

      await expect(
        service.verifySignal({ workspaceId: 'ws-1', accountId: 'acc-1', label: 'Levée de fonds' }),
      ).resolves.toBe(true)

      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('UPDATE signal_history h')
      expect(sql).toContain('SET last_verified_at = now()')
      expect(sql).toContain('(h.workspace_id = $1 OR a.workspace_id = $1)')
      expect(params).toEqual(['ws-1', 'acc-1', 'levée de fonds'])
    })

    it('is false when nothing matched (unknown signal or another workspace)', async () => {
      repo.manager.query.mockResolvedValueOnce([])
      await expect(service.verifySignal({ workspaceId: 'ws-1', accountId: 'acc-1', label: 'x' })).resolves.toBe(false)
    })

    it('never throws — a verification blip must not break the screen the user is on', async () => {
      repo.manager.query.mockRejectedValue(new Error('boom'))
      await expect(service.verifySignal({ workspaceId: 'ws-1', accountId: 'acc-1', label: 'x' })).resolves.toBe(false)
    })
  })

  describe('indexKey', () => {
    it('joins a projected signal to its stored row on the SAME normalized identity', () => {
      expect(SignalHistoryService.indexKey('acc-1', '  Levée de   Fonds ')).toBe('acc-1|levée de fonds')
    })
  })
})
