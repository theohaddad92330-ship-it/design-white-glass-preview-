import { rankAccountContacts, type RankableContactRow } from './contact-ranking'
import { prepareTargetPersonas } from './target-persona-match'

/**
 * #3754.3-.5 — le niveau que l'ESN donne à un poste change l'ORDRE du chemin,
 * jamais son contenu (doctrine c76). Sans postes cibles : ordre byte-identique.
 */

let seq = 0
function row(patch: Partial<RankableContactRow> = {}): RankableContactRow {
  seq += 1
  return {
    id: `00000000-0000-4000-9000-${String(seq).padStart(12, '0')}`,
    title: 'Responsable applicatif',
    entity: 'Groupe',
    decision_role: 'user',
    email: null,
    email_verified: false,
    phone: null,
    linkedin_url: null,
    source: 'apollo',
    user_status: 'new',
    email_sent_at: null,
    last_enrichment_at: null,
    priority: 3,
    demo_seed_first_door: false,
    ...patch,
  }
}

const RAW = { priority_perimeters: [{ name: 'Groupe', tier: 'P1' }], angles: [] }
const personas = prepareTargetPersonas([
  { title: 'VP Tech & Architecture', decision_level: 1 },
  { title: 'Tech Lead', decision_level: 4 },
  { title: 'Directeur Data', decision_level: 2 },
])

describe('rankAccountContacts — niveaux des postes cibles de l’ESN (#3754)', () => {
  const techLead = row({ title: 'Tech Lead', decision_role: 'economic', email: 'a@x.fr' })
  const vp = row({ title: 'VP Tech & Architecture', decision_role: 'user' })
  const other = row({ title: 'Responsable paie', decision_role: 'technical', email: 'c@x.fr' })
  const data = row({ title: 'Directeur Data', decision_role: 'user' })
  const rows = [techLead, vp, other, data]

  it('#3754.5 — sans postes cibles, l’ordre ET la forme sont ceux d’aujourd’hui', () => {
    const base = rankAccountContacts(rows, RAW, {})
    expect(rankAccountContacts(rows, RAW, {}, 10, undefined)).toEqual(base)
    expect(rankAccountContacts(rows, RAW, {}, 10, prepareTargetPersonas([]))).toEqual(base)
    expect(JSON.stringify(base)).not.toContain('esn_target_level')
  })

  it('#3754.3 — un « VP Tech & Architecture » remonte avant un « Tech Lead »', () => {
    const res = rankAccountContacts(rows, RAW, {}, 10, personas)
    const ids = res.ranked.map(r => r.contact_id)
    expect(ids.indexOf(vp.id)).toBeLessThan(ids.indexOf(techLead.id))
  })

  it('niveau rapproché d’abord (1 < 2 < 3 < 4), non rapprochés ensuite dans l’ordre actuel', () => {
    const base = rankAccountContacts(rows, RAW, {}).ranked.map(r => r.contact_id)
    const res = rankAccountContacts(rows, RAW, {}, 10, personas)
    expect(res.ranked.map(r => r.contact_id)).toEqual([vp.id, data.id, techLead.id, other.id])
    // Les non rapprochés gardent leur ordre relatif d'avant.
    expect(base.filter(id => id === other.id)).toEqual([other.id])
  })

  it('#3754.3 — change l’ORDRE, jamais le CONTENU : mêmes contacts, même total', () => {
    const base = rankAccountContacts(rows, RAW, {})
    const res = rankAccountContacts(rows, RAW, {}, 10, personas)
    expect(new Set(res.ranked.map(r => r.contact_id))).toEqual(new Set(base.ranked.map(r => r.contact_id)))
    expect(res.total).toBe(base.total)
    expect(res.scored).toBe(base.scored)
  })

  it('#3754.4 — le niveau est la raison de l’ordre ; un contact non rapproché n’en porte aucun', () => {
    const res = rankAccountContacts(rows, RAW, {}, 10, personas)
    const byId = new Map(res.ranked.map(r => [r.contact_id, r]))
    expect(byId.get(vp.id)?.esn_target_level).toBe(1)
    expect(byId.get(data.id)?.esn_target_level).toBe(2)
    expect(byId.get(techLead.id)?.esn_target_level).toBe(4)
    expect(byId.get(other.id)?.esn_target_level ?? null).toBeNull()
    expect('esn_target_level' in (byId.get(other.id) as object)).toBe(false)
  })

  it('un niveau rapproché n’est jamais un score : le score reste celui des axes', () => {
    const base = rankAccountContacts(rows, RAW, {})
    const res = rankAccountContacts(rows, RAW, {}, 10, personas)
    for (const item of res.ranked) {
      const before = base.ranked.find(r => r.contact_id === item.contact_id)
      expect(item.score).toBe(before?.score)
      expect(item.max).toBe(before?.max)
    }
  })

  it('le tri est stable : deux contacts de même niveau gardent leur ordre d’avant', () => {
    const a = row({ title: 'Tech Lead', email: 'a@x.fr', decision_role: 'economic' })
    const b = row({ title: 'Tech Lead', decision_role: 'user' })
    const base = rankAccountContacts([b, a], RAW, {}).ranked.map(r => r.contact_id)
    const res = rankAccountContacts([b, a], RAW, {}, 10, personas).ranked.map(r => r.contact_id)
    expect(res).toEqual(base)
  })
})
