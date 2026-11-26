import { rankAccountContacts, type RankableContactRow } from './contact-ranking'

/**
 * #4292.10 (recette 21/10, Veolia — dix « Référent technique », aucun décideur) : le chemin recommandé met les
 * décideurs et les sponsors connus AVANT la coupe à dix ; `technical` passe sous `sponsor` et `champion` ; un
 * compte sans décideur ni sponsor le DIT. Le rôle change l'ORDRE, jamais le CONTENU (c76) ; aucun critère protégé.
 */
let seq = 0
function row(patch: Partial<RankableContactRow>): RankableContactRow {
  seq += 1
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    title: 'Référent technique',
    entity: 'Groupe',
    decision_role: 'technical',
    email: 'ref@example.com',
    email_verified: true,
    phone: '+33 1 02 03 04 05',
    linkedin_url: 'https://linkedin.com/in/ref',
    source: 'apollo',
    user_status: 'new',
    email_sent_at: null,
    last_enrichment_at: '2026-10-01T00:00:00Z',
    priority: 2,
    demo_seed_first_door: false,
    ...patch,
  }
}

const RAW = { priority_perimeters: [{ name: 'Groupe', tier: 'P1' }], angles: [] }

describe('rankAccountContacts — le décideur avant le référent (#4292.10)', () => {
  it('dix référents techniques + un sponsor : le sponsor est 1er du chemin', () => {
    const techs = Array.from({ length: 10 }, (_, i) => row({ title: `Référent technique ${i + 1}` }))
    const sponsor = row({
      title: 'Chargé de mission',
      entity: 'Autre filiale',
      decision_role: 'sponsor',
      email: null,
      phone: null,
      linkedin_url: null,
      priority: 5,
    })
    const { ranked } = rankAccountContacts([...techs, sponsor], RAW, {})
    expect(ranked).toHaveLength(10)
    expect(ranked[0]?.contact_id).toBe(sponsor.id)
  })

  it('dix référents techniques + un décideur économique : il survit à la coupe à dix, en tête', () => {
    const techs = Array.from({ length: 12 }, (_, i) => row({ title: `Référent technique ${i + 1}` }))
    const boss = row({ title: 'Directeur général', decision_role: 'economic', email: null, phone: null })
    const { ranked } = rankAccountContacts([...techs, boss], RAW, {})
    expect(ranked[0]?.contact_id).toBe(boss.id)
  })

  it('technical passe sous sponsor et champion à score égal de rôle', () => {
    const tech = row({ decision_role: 'technical' })
    const champion = row({ title: 'Chef de projet', decision_role: 'champion' })
    const ids = rankAccountContacts([tech, champion], RAW, {}).ranked.map(r => r.contact_id)
    expect(ids.indexOf(champion.id)).toBeLessThan(ids.indexOf(tech.id))
  })

  it('NON : sans décideur ni sponsor, l’ordre ne bouge pas et le compte le DIT', () => {
    const techs = Array.from({ length: 3 }, (_, i) => row({ title: `Référent technique ${i + 1}` }))
    const out = rankAccountContacts(techs, RAW, {})
    expect(out.no_decision_maker).toBe(true)
    expect(out.ranked).toHaveLength(3)
  })

  it('NON : avec un décideur, le drapeau est absent ; sans contact, il l’est aussi', () => {
    const boss = row({ title: 'DSI', decision_role: 'economic' })
    expect(rankAccountContacts([boss], RAW, {}).no_decision_maker).toBeUndefined()
    expect(rankAccountContacts([], RAW, {}).no_decision_maker).toBeUndefined()
  })

  it('le contenu est identique : personne n’est retiré par le palier', () => {
    const techs = Array.from({ length: 4 }, (_, i) => row({ title: `Référent technique ${i + 1}` }))
    const sponsor = row({ title: 'Responsable innovation', decision_role: 'sponsor' })
    const all = [...techs, sponsor]
    expect(
      rankAccountContacts(all, RAW, {})
        .ranked.map(r => r.contact_id)
        .sort(),
    ).toEqual(all.map(r => r.id).sort())
  })
})
