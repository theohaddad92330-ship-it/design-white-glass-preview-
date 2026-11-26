import { NEEDS_HISTORY_DEFAULT_ROWS_PER_CALL, NEEDS_HISTORY_MAX_ROWS_PER_CALL } from './needs-history.limits'
import {
  ageLabelOf,
  aggregateNeeds,
  clampLimit,
  collectNeeds,
  filterNeeds,
  needsAggregateLine,
  parseNeedDate,
} from './needs-history'

const NOW = new Date('2026-10-28T10:00:00.000Z')
const jobs = [
  {
    title: 'Lead Java',
    date: '2025-11-12',
    city: 'Paris',
    department: '75',
    skills: ['Java', 'Spring'],
    source: 'APEC',
  },
  { title: 'Dev Python', date: '2026-10-20', city: 'Lyon', department: '69', skills: ['Python'] },
  { title: 'Architecte', date: null, city: 'Nantes', skills: ['Java'] },
  { title: 'Stage Data', date: '2026-10-01', contract_type: 'Stage', skills: ['Python'] },
]

describe('l’historique des besoins de Laura (#4759)', () => {
  it('une offre ARCHIVÉE reste utilisable et son âge est dit', () => {
    const rows = collectNeeds({ jobSignals: jobs, history: [], now: NOW })
    const old = rows.find(r => r.title === 'Lead Java')
    expect(old?.date).toBe('2025-11-12')
    expect(old?.ageLabel).toBe('il y a 11 mois')
  })

  it('une offre sans date ne reçoit AUCUNE date inventée', () => {
    const row = collectNeeds({ jobSignals: jobs, history: [], now: NOW }).find(r => r.title === 'Architecte')
    expect(row?.date).toBeNull()
    expect(row?.ageDays).toBeNull()
    expect(row?.ageLabel).toBe('date de l’offre inconnue')
  })

  it('les stages ne sont jamais un besoin (#4044)', () => {
    expect(collectNeeds({ jobSignals: jobs, history: [], now: NOW }).map(r => r.title)).not.toContain('Stage Data')
  })

  it('fusionne signal_history (retombé compris) sans doublon', () => {
    const rows = collectNeeds({
      jobSignals: jobs,
      history: [
        { label: 'Lead Java', signal_date: '2025-11-12', status: 'resolved' },
        { label: 'Dev Cobol', signal_date: 'mars 2025', status: 'resolved' },
        { label: 'Stage RH', signal_date: '2026-01-01', status: 'resolved' },
      ],
      now: NOW,
    })
    expect(rows.filter(r => r.title === 'Lead Java')).toHaveLength(1)
    const cobol = rows.find(r => r.title === 'Dev Cobol')
    expect(cobol?.date).toBe('2025-03-01')
    expect(cobol?.stillListed).toBe(false)
    expect(rows.map(r => r.title)).not.toContain('Stage RH')
  })

  it('filtre par techno, zone et période ; une période écarte l’offre sans date', () => {
    const rows = collectNeeds({ jobSignals: jobs, history: [], now: NOW })
    expect(
      filterNeeds(rows, { tech: 'java' })
        .map(r => r.title)
        .sort(),
    ).toEqual(['Architecte', 'Lead Java'])
    expect(filterNeeds(rows, { zone: 'lyon' }).map(r => r.title)).toEqual(['Dev Python'])
    expect(filterNeeds(rows, { tech: 'java', since: '2025-01-01', until: '2025-12-31' }).map(r => r.title)).toEqual([
      'Lead Java',
    ])
  })

  it('le plafond par appel est NOMMÉ et appliqué', () => {
    expect(clampLimit(undefined)).toBe(NEEDS_HISTORY_DEFAULT_ROWS_PER_CALL)
    expect(clampLimit(10_000)).toBe(NEEDS_HISTORY_MAX_ROWS_PER_CALL)
    expect(clampLimit(0)).toBe(1)
  })

  it('l’agrégat dit le nombre, la période, le dernier besoin et les technos — daté et borné', () => {
    const agg = aggregateNeeds(collectNeeds({ jobSignals: jobs, history: [], now: NOW }))
    expect(agg).toMatchObject({
      count: 3,
      periodFrom: '2025-11-12',
      periodTo: '2026-10-20',
      lastNeedAt: '2026-10-20',
      undatedCount: 1,
    })
    expect(agg.topTechs).toEqual(['Java', 'Python', 'Spring'])
    const line = needsAggregateLine(agg) ?? ''
    expect(line).toContain('3 besoins')
    expect(line).toContain('2025-11-12 → 2026-10-20')
    expect(line).toContain('dernier besoin vu le 2026-10-20')
    expect(line).toContain('1 sans date connue')
  })

  it('aucun besoin → aucune ligne (on n’affiche pas ce qu’on n’a pas), jamais « 0 »', () => {
    expect(needsAggregateLine(aggregateNeeds([]))).toBeNull()
  })

  it('parse les dates sans rien deviner', () => {
    expect(parseNeedDate('2026-08-10T00:00:00Z')).toBe('2026-08-10')
    expect(parseNeedDate('récemment')).toBeNull()
    expect(parseNeedDate(null)).toBeNull()
    expect(ageLabelOf(null)).toContain('inconnue')
  })
})
