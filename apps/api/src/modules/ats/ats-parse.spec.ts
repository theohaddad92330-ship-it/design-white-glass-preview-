import {
  daysUntil,
  parseCandidate,
  parseConsultant,
  parseMission,
  parseNeed,
  selectBenched,
  selectEndedMissions,
  selectEndingMissions,
  selectInterviewedCandidates,
} from './ats-parse'

/**
 * La forme des réponses de l'ERP n'est pas entièrement documentée. Ces tests
 * épinglent ce qu'on sait lire — et surtout ce qu'on refuse d'inventer : un TJM
 * à 0 ou une disponibilité « aujourd'hui » fabriquée feraient prendre de
 * mauvaises décisions commerciales.
 */
const NOW = new Date('2026-08-03T12:00:00Z')

describe('parseMission', () => {
  it('lit les champs à la racine comme sous `attributes` (JSON:API)', () => {
    const flat = parseMission({ id: '1', title: 'Data', endDate: '2026-08-20' }, NOW)
    const nested = parseMission({ id: '1', attributes: { title: 'Data', endDate: '2026-08-20' } }, NOW)
    expect(flat?.title).toBe('Data')
    expect(nested?.title).toBe('Data')
    expect(flat?.daysRemaining).toBe(nested?.daysRemaining)
  })

  it('rend `null` pour les jours restants quand la date de fin manque', () => {
    // Inventer une échéance ferait relancer un client au hasard.
    expect(parseMission({ id: '1', title: 'Sans fin' }, NOW)?.daysRemaining).toBeNull()
  })

  it('ignore un enregistrement sans identifiant', () => {
    expect(parseMission({ title: 'Orpheline' }, NOW)).toBeNull()
  })

  it('retrouve le consultant, imbriqué ou non', () => {
    const nested = parseMission({ id: '1', title: 'Data', resource: { firstName: 'Yanis', lastName: 'Berthier' } }, NOW)
    expect(nested?.consultantName).toBe('Yanis Berthier')
  })

  it('retrouve la société, imbriquée ou aplatie', () => {
    expect(parseMission({ id: '1', company: { name: 'ACME' } }, NOW)?.companyName).toBe('ACME')
    expect(parseMission({ id: '1', companyName: 'ACME' }, NOW)?.companyName).toBe('ACME')
  })
})

describe('parseConsultant', () => {
  it('reconstitue le nom depuis prénom + nom', () => {
    expect(parseConsultant({ id: '7', firstName: 'Sofia', lastName: 'Nardi' }, NOW)?.fullName).toBe('Sofia Nardi')
  })

  it('ne fabrique pas de TJM quand l’ERP n’en donne pas', () => {
    expect(parseConsultant({ id: '7', fullName: 'Sofia Nardi' }, NOW)?.dailyRate).toBeNull()
  })

  it('compte les jours sans mission depuis une fin PASSÉE, jamais depuis une fin future', () => {
    const benched = parseConsultant({ id: '7', fullName: 'Sofia', endDate: '2026-06-03' }, NOW)
    expect(benched?.daysWithoutMission).toBe(61)
    const staffed = parseConsultant({ id: '8', fullName: 'Yanis', endDate: '2026-12-01' }, NOW)
    expect(staffed?.daysWithoutMission).toBeNull()
  })

  it('lit les compétences, chaînes ou objets', () => {
    const consultant = parseConsultant({ id: '7', fullName: 'Sofia', skills: ['Java', { name: 'Kafka' }, 42] }, NOW)
    expect(consultant?.skills).toEqual(['Java', 'Kafka'])
  })
})

describe('parseNeed', () => {
  it('exige un identifiant ET un intitulé', () => {
    expect(parseNeed({ id: '1' })).toBeNull()
    expect(parseNeed({ title: 'Data engineer' })).toBeNull()
    expect(parseNeed({ id: '1', title: 'Data engineer' })?.title).toBe('Data engineer')
  })
})

describe('selectEndingMissions', () => {
  const mission = (id: string, daysRemaining: number | null) => ({
    id,
    title: 'M',
    companyName: null,
    consultantName: null,
    startsAt: null,
    endsAt: daysRemaining === null ? null : '2026-09-01',
    daysRemaining,
  })

  it('ne retient que la fenêtre demandée, la plus urgente d’abord', () => {
    const selected = selectEndingMissions([mission('a', 25), mission('b', 3), mission('c', 60)], 30)
    expect(selected.map(entry => entry.id)).toEqual(['b', 'a'])
  })

  it('n’alerte jamais sur une mission sans date de fin', () => {
    expect(selectEndingMissions([mission('a', null)], 30)).toEqual([])
  })

  it('écarte une mission déjà terminée — c’est un constat, pas une anticipation', () => {
    expect(selectEndingMissions([mission('a', -5)], 30)).toEqual([])
  })
})

describe('selectBenched', () => {
  const consultant = (id: string, days: number | null) => ({
    id,
    fullName: id,
    title: null,
    availableAt: null,
    daysWithoutMission: days,
    dailyRate: null,
    skills: [],
  })

  it('trie du plus longtemps disponible au moins longtemps', () => {
    const selected = selectBenched([consultant('a', 35), consultant('b', 120)], 30)
    expect(selected.map(entry => entry.id)).toEqual(['b', 'a'])
  })

  it('écarte ceux dont on ne connaît pas l’ancienneté', () => {
    expect(selectBenched([consultant('a', null)], 30)).toEqual([])
  })
})

describe('daysUntil', () => {
  it('rend `null` sur une date illisible plutôt qu’un nombre trompeur', () => {
    expect(daysUntil('pas une date', NOW)).toBeNull()
    expect(daysUntil(null, NOW)).toBeNull()
  })
})

// #4065.9 — les listings PASSÉS : missions terminées et candidats vus en entretien.
describe('selectEndedMissions (#4065.9)', () => {
  const mission = (id: string, endDate?: string) => parseMission({ id, title: id, endDate }, NOW)!

  it('garde les missions TERMINÉES dans la fenêtre passée, la plus récente d’abord', () => {
    const picked = selectEndedMissions(
      [mission('a', '2026-07-20'), mission('b', '2026-06-01'), mission('c', '2026-01-01')],
      90,
    )
    expect(picked.map(m => m.id)).toEqual(['a', 'b'])
  })

  it('sait dire NON : une mission à venir, ou sans date de fin, n’est jamais « terminée »', () => {
    expect(selectEndedMissions([mission('f', '2026-09-01'), mission('n')], 365)).toEqual([])
  })
})

describe('parseCandidate / selectInterviewedCandidates (#4065.9)', () => {
  it('lit la date d’entretien quand l’ERP la rend, jamais « aujourd’hui » par défaut', () => {
    expect(
      parseCandidate({ id: '1', firstName: 'Ana', lastName: 'Lima', interviewDate: '2026-07-10' })?.interviewedAt,
    ).toBe('2026-07-10T00:00:00.000Z')
    expect(parseCandidate({ id: '2', fullName: 'Sans date' })?.interviewedAt).toBeNull()
    expect(parseCandidate({ fullName: 'Sans id' })).toBeNull()
  })

  it('ne garde que ceux dont l’entretien est DATÉ et dans la fenêtre passée', () => {
    const c = (id: string, interviewDate?: string) => parseCandidate({ id, fullName: id, interviewDate })!
    const picked = selectInterviewedCandidates(
      [c('a', '2026-07-01'), c('b', '2025-01-01'), c('c'), c('d', '2026-09-30')],
      90,
      NOW,
    )
    expect(picked.map(x => x.id)).toEqual(['a'])
  })
})
