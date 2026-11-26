import { DiscoverAlertEventSweeper } from './discover-alert-event.sweeper'

/**
 * #2875 (#2402.1, #2402.3, lot R03) — ce fichier n'existait pas avant ce lot :
 * seule la tranche canonique (`besoin_entrant`) est couverte ici, pas les
 * quatre autres producteurs (hors périmètre de ce lot).
 */
function makeSweeper(rowsByKind: Record<string, Array<Record<string, unknown>>>) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes("'referencement_detecte'")) return rowsByKind.referencement ?? []
    if (sql.includes('contact_decision_role_history') && sql.includes('UPDATE')) return []
    if (sql.includes('contact_decision_role_history')) return rowsByKind.decision_role ?? []
    if (sql.includes('deadline_at')) return rowsByKind.deadline_ao ?? []
    if (sql.includes('FROM canonical_trigger_events')) return rowsByKind.deadline_known ?? []
    if (sql.includes('FROM saved_views')) return [{ workspace_id: 'ws-1' }]
    if (sql.includes('FROM project_needs')) return rowsByKind.new_confirmed_need ?? []
    if (sql.includes('FROM accounts')) return rowsByKind.new_matching_company ?? []
    if (sql.includes('FROM account_partners')) return rowsByKind.new_relationship ?? []
    if (sql.includes('FROM missions')) return rowsByKind.mission_ended ?? []
    if (sql.includes('FROM access_facts')) return rowsByKind.new_access_path ?? []
    return []
  })
  const events = { manager: { query } }
  const registry = {
    lastOccurredAt: jest.fn().mockResolvedValue(null),
    record: jest.fn().mockResolvedValue({ status: 'recorded', surface: null }),
  }
  const triggers = { recordOnceByDedupeKey: jest.fn(async () => undefined) }
  const sweeper = new DiscoverAlertEventSweeper(events as never, registry as never, triggers as never)
  return { sweeper, events, registry, triggers }
}

describe('DiscoverAlertEventSweeper — registre canonique (#2875)', () => {
  it('un besoin CONFIRMÉ réellement consigné écrit AUSSI un TriggerEvent canonique « besoin_entrant »', async () => {
    const { sweeper, triggers } = makeSweeper({
      new_confirmed_need: [{ subject_id: 'need-1', subject_label: 'Lead dev Java', occurred_at: '2026-09-20' }],
    })

    await sweeper.run(new Date('2026-09-29T00:00:00Z'))

    expect(triggers.recordOnceByDedupeKey).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'besoin_entrant',
        source: 'discover',
        object: expect.objectContaining({ subjectType: 'project_need', subjectId: 'need-1' }),
        scope: expect.objectContaining({ workspaceId: 'ws-1', ownerId: null }),
      }),
      'notifications/discover-alerts/discover-alert-event.sweeper',
    )
  })

  it('un doublon (déjà connu) n’écrit PAS de TriggerEvent canonique', async () => {
    const { sweeper, registry, triggers } = makeSweeper({
      new_confirmed_need: [{ subject_id: 'need-1', subject_label: 'Lead dev Java', occurred_at: '2026-09-20' }],
    })
    registry.record.mockResolvedValueOnce({ status: 'duplicate' })

    await sweeper.run(new Date('2026-09-29T00:00:00Z'))

    expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
  })

  it('les quatre autres genres de ce balayage n’écrivent PAS au registre canonique — aucun n’a de nom au catalogue', async () => {
    const { sweeper, triggers } = makeSweeper({
      new_matching_company: [{ subject_id: 'acc-1', subject_label: 'Doctolib', occurred_at: '2026-09-20' }],
    })

    await sweeper.run(new Date('2026-09-29T00:00:00Z'))

    expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
  })

  it('reste best-effort : un registre canonique absent ne fait jamais échouer le balayage', async () => {
    const { sweeper, events, registry } = makeSweeper({
      new_confirmed_need: [{ subject_id: 'need-1', subject_label: 'Lead dev Java', occurred_at: '2026-09-20' }],
    })
    const sweeperWithoutTriggers = new DiscoverAlertEventSweeper(events as never, registry as never, undefined)

    const counts = await sweeperWithoutTriggers.run(new Date('2026-09-29T00:00:00Z'))

    expect(counts.recorded).toBe(1)
  })
})

describe('DiscoverAlertEventSweeper — deadline_ao (#2875 #2402.3)', () => {
  const NOW = new Date('2026-09-29T00:00:00Z')
  const row = {
    workspace_id: 'ws-1',
    subject_id: 'need-9',
    subject_label: 'AO Région',
    deadline_at: '2026-10-02T12:00:00Z',
  }

  it('un besoin issu d’un appel d’offres dont la remise approche écrit un TriggerEvent « deadline_ao »', async () => {
    const { sweeper, triggers } = makeSweeper({ deadline_ao: [row] })
    await sweeper.run(NOW)
    expect(triggers.recordOnceByDedupeKey).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deadline_ao',
        object: expect.objectContaining({ subjectType: 'project_need', subjectId: 'need-9' }),
        scope: expect.objectContaining({ workspaceId: 'ws-1' }),
        evidence: expect.stringContaining('2026-10-02'),
      }),
      'notifications/discover-alerts/discover-alert-event.sweeper',
    )
  })

  it('la clé de déduplication porte la date limite : même échéance = même clé, échéance déplacée = autre clé', async () => {
    const first = makeSweeper({ deadline_ao: [row] })
    await first.sweeper.run(NOW)
    const again = makeSweeper({ deadline_ao: [row] })
    await again.sweeper.run(new Date(NOW.getTime() + 24 * 3600 * 1000))
    const moved = makeSweeper({ deadline_ao: [{ ...row, deadline_at: '2026-10-05' }] })
    await moved.sweeper.run(NOW)
    const keyOf = (t: { triggers: { recordOnceByDedupeKey: jest.Mock } }) =>
      (t.triggers.recordOnceByDedupeKey.mock.calls[0] as unknown as [{ dedupeKey: string }])[0].dedupeKey
    expect(keyOf(first)).toBe(keyOf(again))
    expect(keyOf(moved)).not.toBe(keyOf(first))
    expect(keyOf(first)).toMatch(/^ws-1:deadline_ao:.+:\d{4}-\d{2}-\d{2}$/)
  })

  it('n’interroge que les besoins d’appel d’offres, ouverts, à échéance future bornée', async () => {
    const { sweeper, events } = makeSweeper({})
    await sweeper.run(NOW)
    const sql = (events.manager.query.mock.calls as unknown[][])
      .map(c => String(c[0]))
      .find(q => q.includes('deadline_at'))
    expect(sql).toContain("source = 'tender'")
    expect(sql).toContain("status = 'open'")
    expect(sql).toContain('deadline_at >')
  })
})

describe('DiscoverAlertEventSweeper — changement_decideur (#2875 #2402.3)', () => {
  const NOW = new Date('2026-09-30T00:00:00Z')
  const row = {
    id: 'h-1',
    workspace_id: 'ws-1',
    contact_id: 'c-1',
    account_id: 'acc-1',
    from_role: 'economic',
    to_role: 'user',
    changed_at: '2026-09-29T10:00:00Z',
    full_name: 'Claire Martin',
    assigned_to: 'user-7',
  }

  it('un passage décisionnel consigné écrit un TriggerEvent « changement_decideur » sur le CONTACT', async () => {
    const { sweeper, triggers } = makeSweeper({ decision_role: [row] })
    await sweeper.run(NOW)
    expect(triggers.recordOnceByDedupeKey).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'changement_decideur',
        source: 'contacts',
        object: expect.objectContaining({ subjectType: 'contact', subjectId: 'c-1' }),
        scope: expect.objectContaining({ workspaceId: 'ws-1', ownerId: 'user-7' }),
        evidence: expect.stringContaining('Claire Martin'),
      }),
      'notifications/discover-alerts/discover-alert-event.sweeper',
    )
  })

  it('marque la ligne émise — un fait n’est émis qu’une fois', async () => {
    const { sweeper, events } = makeSweeper({ decision_role: [row] })
    await sweeper.run(NOW)
    const updates = (events.manager.query.mock.calls as unknown[][])
      .map(c => String(c[0]))
      .filter(q => q.includes('UPDATE contact_decision_role_history'))
    expect(updates).toHaveLength(1)
    expect(updates[0]).toContain('emitted_at')
  })

  it('une première classification ou un passage entre rôles non décisionnels est marqué émis SANS événement', async () => {
    const { sweeper, triggers, events } = makeSweeper({
      decision_role: [
        { ...row, id: 'h-2', from_role: null, to_role: 'economic' },
        { ...row, id: 'h-3', from_role: 'champion', to_role: 'influencer' },
      ],
    })
    await sweeper.run(NOW)
    expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
    const updates = (events.manager.query.mock.calls as unknown[][]).filter(c =>
      String(c[0]).includes('UPDATE contact_decision_role_history'),
    )
    expect(updates).toHaveLength(2)
  })

  it('ne lit que les lignes pas encore émises', async () => {
    const { sweeper, events } = makeSweeper({})
    await sweeper.run(NOW)
    const sql = (events.manager.query.mock.calls as unknown[][])
      .map(c => String(c[0]))
      .find(q => q.includes('FROM contact_decision_role_history'))
    expect(sql).toContain('emitted_at IS NULL')
  })
})

describe('DiscoverAlertEventSweeper — referencement_detecte (#2875 #2402.3, lot X54)', () => {
  const NOW = new Date('2026-10-02T00:00:00Z')
  const row = {
    workspace_id: 'ws-1',
    subject_id: 'acc-1',
    company_name: 'Astréa Industrie',
    source: 'déclaré par Marie',
    occurred_at: '2026-10-01T09:00:00Z',
    assigned_to: 'user-7',
  }

  it('un fait d’accès « référencé en direct » écrit un TriggerEvent « referencement_detecte » sur le COMPTE', async () => {
    const { sweeper, triggers } = makeSweeper({ referencement: [row] })
    await sweeper.run(NOW)
    expect(triggers.recordOnceByDedupeKey).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'referencement_detecte',
        source: 'discover',
        object: expect.objectContaining({ subjectType: 'account', subjectId: 'acc-1' }),
        scope: expect.objectContaining({ workspaceId: 'ws-1', ownerId: 'user-7' }),
        evidence: expect.stringContaining('Astréa Industrie'),
      }),
      'notifications/discover-alerts/discover-alert-event.sweeper',
    )
  })

  it('la requête lit le fait PAR ESPACE et refuse de ré-émettre un compte déjà consigné', async () => {
    const { sweeper, events } = makeSweeper({ referencement: [] })
    await sweeper.run(NOW)
    const sql = (events.manager.query.mock.calls as unknown[][])
      .map(c => String(c[0]))
      .find(q => q.includes("'referencement_detecte'"))
    expect(sql).toBeDefined()
    expect(sql).toContain('f.workspace_id IS NOT NULL')
    expect(sql).toContain("f.kind = 'mode'")
    expect(sql).toContain("f.value = 'direct_reference'")
    expect(sql).toContain('NOT EXISTS')
  })

  it('une ligne sans compte ou sans espace n’émet rien', async () => {
    const { sweeper, triggers } = makeSweeper({
      referencement: [
        { ...row, subject_id: null },
        { ...row, workspace_id: null },
      ],
    })
    await sweeper.run(NOW)
    expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
  })

  it('sans nom d’entreprise, l’évidence nomme l’identifiant plutôt que d’inventer un nom', async () => {
    const { sweeper, triggers } = makeSweeper({ referencement: [{ ...row, company_name: null }] })
    await sweeper.run(NOW)
    const event = (triggers.recordOnceByDedupeKey.mock.calls as unknown[][])[0]?.[0] as { evidence: string }
    expect(event.evidence).toContain('acc-1')
  })
})
