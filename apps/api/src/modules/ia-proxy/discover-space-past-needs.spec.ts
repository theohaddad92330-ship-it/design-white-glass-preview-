import {
  candidateMatchesNeedFilters,
  natureOfLine,
  spacePastNeedCandidates,
  withNeedFilters,
} from './discover-space-past-needs'

/**
 * #5203 (lot 782) — un compte dont l'ESPACE a eu un besoin passé « Java » remonte sur « Java », sans borne d'âge,
 * avec nature et date, jamais une personne. Les lignes viennent DÉJÀ cloisonnées (espace + business unit) du lecteur
 * unique `AccountSignalLinesService` ; ici on n'apparie que.
 */
const NOW = new Date('2026-11-03T00:00:00Z')
const line = (type: string, title: string, date: string) => ({
  id: `l-${title}-${date}`,
  type,
  title,
  date,
  period: 'past',
})
const account = (siren: string | null, lines: Array<ReturnType<typeof line>>) => ({
  siren,
  company_name: `Compte ${siren}`,
  headquarters: 'Lille (59)',
  sector: 'Banque',
  lines,
})

describe('#5203 — spacePastNeedCandidates', () => {
  it('un besoin « Java » de 2022 fait remonter le compte, daté, avec sa nature, sans source ni personne', () => {
    const out = spacePastNeedCandidates({
      accounts: [account('700000001', [line('besoin_passe', 'Développeur Java senior', '2022-03-01')])],
      terms: ['java'],
      now: NOW,
      cap: 10,
    })
    expect(out).toEqual([
      {
        siren: '700000001',
        name: 'Compte 700000001',
        city: 'Lille (59)',
        sector: 'Banque',
        observedNeed: { label: 'Développeur Java senior', date: '2022-03-01', nature: 'mission' },
        fromSpace: true,
      },
    ])
    expect(Object.keys(out[0]!).sort()).toEqual(['city', 'fromSpace', 'name', 'observedNeed', 'sector', 'siren'])
  })

  it('garde le besoin le plus récent qui correspond ; ignore ce qui ne correspond pas', () => {
    const out = spacePastNeedCandidates({
      accounts: [
        account('700000001', [
          line('recrutement', 'Dev Java', '2024-01-10'),
          line('projet', 'Refonte Java', '2025-06-02'),
          line('projet', 'Migration SAP', '2026-01-01'),
        ]),
        account('700000002', [line('projet', 'Migration SAP', '2026-01-01')]),
      ],
      terms: ['java'],
      now: NOW,
      cap: 10,
    })
    expect(out.map(c => c.siren)).toEqual(['700000001'])
    expect(out[0]?.observedNeed).toEqual({ label: 'Refonte Java', date: '2025-06-02', nature: 'projet' })
  })

  it('le filtre « anciens » retire un compte dont le besoin correspondant est récent, et l’inverse', () => {
    const accounts = [
      account('700000001', [line('recrutement', 'Dev Java', '2026-09-01')]),
      account('700000002', [line('besoin_passe', 'Dev Java', '2021-09-01')]),
    ]
    const old = spacePastNeedCandidates({ accounts, terms: ['java'], period: 'old', now: NOW, cap: 10 })
    const recent = spacePastNeedCandidates({ accounts, terms: ['java'], period: 'recent', now: NOW, cap: 10 })
    expect(old.map(c => c.siren)).toEqual(['700000002'])
    expect(recent.map(c => c.siren)).toEqual(['700000001'])
  })

  it('le filtre de nature retire le reste ; un type sans nature (fait, marché public) ne fait aucun besoin', () => {
    const accounts = [
      account('700000001', [line('recrutement', 'Dev Java', '2026-09-01')]),
      account('700000002', [line('fait', 'Java SA', '2021-09-01'), line('marche_public', 'Java', '2021-09-01')]),
    ]
    expect(spacePastNeedCandidates({ accounts, terms: ['java'], natures: ['mission'], now: NOW, cap: 10 })).toEqual([])
    expect(
      spacePastNeedCandidates({ accounts, terms: ['java'], natures: ['recrutement'], now: NOW, cap: 10 }).map(
        c => c.siren,
      ),
    ).toEqual(['700000001'])
  })

  it('sans mot-clé rien n’est lu ; sans SIREN réel pas de candidat ; plafonné', () => {
    const accounts = [
      account(null, [line('besoin_passe', 'Java', '2022-01-01')]),
      account('700000003', [line('besoin_passe', 'Java', '2022-01-01')]),
      account('700000004', [line('besoin_passe', 'Java', '2021-01-01')]),
    ]
    expect(spacePastNeedCandidates({ accounts, terms: [], now: NOW, cap: 10 })).toEqual([])
    expect(spacePastNeedCandidates({ accounts, terms: ['java'], now: NOW, cap: 10 }).map(c => c.siren)).toEqual([
      '700000003',
      '700000004',
    ])
    expect(spacePastNeedCandidates({ accounts, terms: ['java'], now: NOW, cap: 1 })).toHaveLength(1)
  })

  it('natureOfLine : recrutement, mission, projet — sinon rien (jamais devinée)', () => {
    expect(natureOfLine('recrutement')).toBe('recrutement')
    expect(natureOfLine('mission_observee')).toBe('mission')
    expect(natureOfLine('affaire')).toBe('projet')
    expect(natureOfLine('annonce_legale')).toBeUndefined()
  })
})

describe('#5203 — candidateMatchesNeedFilters (un filtre RETIRE)', () => {
  const base = {
    observedNeed: undefined as undefined | { label: string; date: string; nature?: string },
    signals: [] as Array<{ type: string; date: string }>,
  }
  it('sans filtre actif, tout passe', () => {
    expect(candidateMatchesNeedFilters(base, {}, NOW)).toBe(true)
    expect(candidateMatchesNeedFilters(base, { needsPeriod: 'all' }, NOW)).toBe(true)
  })
  it('période « anciens » : garde le besoin d’il y a 4 ans, retire un recrutement de ce mois-ci', () => {
    const oldNeed = { ...base, observedNeed: { label: 'Java', date: '2022-05-01' } }
    const hiring = { ...base, signals: [{ type: 'hiring', date: '2026-10-20' }] }
    expect(candidateMatchesNeedFilters(oldNeed, { needsPeriod: 'old' }, NOW)).toBe(true)
    expect(candidateMatchesNeedFilters(hiring, { needsPeriod: 'old' }, NOW)).toBe(false)
    expect(candidateMatchesNeedFilters(hiring, { needsPeriod: 'recent', needsNature: ['recrutement'] }, NOW)).toBe(true)
    expect(candidateMatchesNeedFilters(oldNeed, { needsPeriod: 'recent' }, NOW)).toBe(false)
  })
  it('un besoin de nature inconnue ne passe pas un filtre de nature', () => {
    const unknown = { ...base, observedNeed: { label: 'Java', date: '2022-05-01' } }
    expect(candidateMatchesNeedFilters(unknown, { needsNature: ['mission'] }, NOW)).toBe(false)
  })
})

describe('#5203 / lot 786 — withNeedFilters : un filtre RETIRE et le DIT, il ne casse pas la recherche', () => {
  const card = (siren: string, need?: { label: string; date: string }) => ({
    siren,
    name: `C ${siren}`,
    observedNeed: need,
  })
  const response = (candidates: unknown[], degraded: unknown[] = []) =>
    ({ candidates, query: {}, degraded }) as unknown as Parameters<typeof withNeedFilters>[0]

  it("« Anciens » retire les cartes sans besoin ancien et compte ce qu'il a retiré", () => {
    const out = withNeedFilters(
      response([
        card('1', { label: 'Java', date: '2026-10-01' }),
        card('2', { label: 'Java', date: '2021-03-01' }),
        card('3'),
      ]),
      { needsPeriod: 'old' },
      NOW,
    )
    expect(out.candidates.map(c => c.siren)).toEqual(['2'])
    expect((out as { needsFilteredOut?: number }).needsFilteredOut).toBe(2)
  })

  it('tout retiré : la liste est vide, la réponse reste une réponse (dégradations conservées, comptées)', () => {
    const degraded = [{ source: 'registry', reason: 'request_rejected' }]
    const out = withNeedFilters(
      response([card('1', { label: 'Java', date: '2026-10-01' })], degraded),
      { needsPeriod: 'old' },
      NOW,
    )
    expect(out.candidates).toEqual([])
    expect(out.degraded).toEqual(degraded)
    expect((out as { needsFilteredOut?: number }).needsFilteredOut).toBe(1)
  })

  it("lot 788 — le compte ne porte que les cartes que l'écran AURAIT montrées : un verdict exclu (masqué) ne compte pas", () => {
    const excluded = { ...card('9', { label: 'Java', date: '2026-10-01' }), qualification: { verdict: 'excluded' } }
    const out = withNeedFilters(
      response([
        card('1', { label: 'Java', date: '2026-10-01' }),
        excluded,
        card('2', { label: 'Java', date: '2021-01-01' }),
      ]),
      { needsPeriod: 'old' },
      NOW,
    )
    expect(out.candidates.map(c => c.siren)).toEqual(['2'])
    expect((out as { needsFilteredOut?: number }).needsFilteredOut).toBe(1)
  })

  it("lot 790 — une même société en double dans la réponse ne se compte qu'UNE fois (l'écran n'en montre qu'une)", () => {
    const old = { label: 'Java', date: '2026-10-01' }
    const out = withNeedFilters(
      response([card('1', old), card('1', old), card('2', old), card('3', { label: 'Java', date: '2021-01-01' })]),
      { needsPeriod: 'old' },
      NOW,
    )
    expect((out as { needsFilteredOut?: number }).needsFilteredOut).toBe(2)
  })

  it('lot 790 — une carte retirée dont le SIREN reste affiché par ailleurs ne compte pas comme retirée', () => {
    const out = withNeedFilters(
      response([card('3', { label: 'Java', date: '2021-01-01' }), card('3', { label: 'Java', date: '2026-10-01' })]),
      { needsPeriod: 'old' },
      NOW,
    )
    expect(out.candidates).toHaveLength(1)
    expect('needsFilteredOut' in out).toBe(false)
  })

  it("lot 788 — que des exclus retirés : aucun compteur (rien de visible n'a été retiré)", () => {
    const excluded = { ...card('9', { label: 'Java', date: '2026-10-01' }), qualification: { verdict: 'excluded' } }
    const out = withNeedFilters(response([excluded]), { needsPeriod: 'old' }, NOW)
    expect('needsFilteredOut' in out).toBe(false)
  })

  it("lot 788 — le filtre n'ajoute ni ne retire aucune dégradation, quel que soit le résultat", () => {
    const degraded = [{ source: 'registry', reason: 'time_budget' }]
    const out = withNeedFilters(response([card('1')], degraded), { needsPeriod: 'old' }, NOW)
    expect(out.degraded).toEqual(degraded)
    const clean = withNeedFilters(response([card('1')], []), { needsPeriod: 'old' }, NOW)
    expect(clean.degraded).toEqual([])
  })

  it('« Tous » ou rien retiré : réponse inchangée, aucun compteur', () => {
    const base = response([card('1')])
    expect(withNeedFilters(base, { needsPeriod: 'all' }, NOW)).toBe(base)
    const kept = withNeedFilters(
      response([card('2', { label: 'Java', date: '2020-01-01' })]),
      { needsPeriod: 'old' },
      NOW,
    )
    expect('needsFilteredOut' in kept).toBe(false)
  })
})
