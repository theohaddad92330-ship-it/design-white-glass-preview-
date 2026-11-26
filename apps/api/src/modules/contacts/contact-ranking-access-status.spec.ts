import { rankAccountContacts, type RankableContactRow } from './contact-ranking'

/**
 * #4271 (18/10) — le statut d'accès du compte change l'ORDRE des interlocuteurs, jamais leur
 * CONTENU (c76). Référencé → opérationnels et acheteurs devant ; accès à bâtir → décideurs et
 * sponsors devant ; statut absent → ordre d'avant, byte-identique.
 */
let seq = 0
function row(patch: Partial<RankableContactRow>): RankableContactRow {
  seq += 1
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
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
const directeur = row({ title: 'Directeur des systèmes d’information', decision_role: 'economic' })
const sponsor = row({ title: 'Responsable innovation', decision_role: 'sponsor' })
const acheteur = row({ title: 'Acheteur IT', decision_role: 'procurement' })
const ops = row({ title: 'Technicien support', decision_role: 'user' })
const rows = [directeur, sponsor, acheteur, ops]

const ids = (status?: 'referenced' | 'to_build') =>
  rankAccountContacts(rows, RAW, {}, 10, undefined, status).ranked.map(r => r.contact_id)

describe('rankAccountContacts — statut d’accès du compte (#4271)', () => {
  it('.1 référencé : acheteurs et opérationnels passent devant les décideurs et sponsors', () => {
    const order = ids('referenced')
    expect(Math.max(order.indexOf(acheteur.id), order.indexOf(ops.id))).toBeLessThan(
      Math.min(order.indexOf(directeur.id), order.indexOf(sponsor.id)),
    )
  })

  it('.2 accès à bâtir : décideurs et sponsors passent devant acheteurs et opérationnels', () => {
    const order = ids('to_build')
    expect(Math.max(order.indexOf(directeur.id), order.indexOf(sponsor.id))).toBeLessThan(
      Math.min(order.indexOf(acheteur.id), order.indexOf(ops.id)),
    )
  })

  it('.3 même compte, statut basculé : le top 10 est réordonné, le contenu identique', () => {
    expect(ids('referenced')).not.toEqual(ids('to_build'))
    expect([...ids('referenced')].sort()).toEqual([...ids('to_build')].sort())
    expect(ids('referenced')).toHaveLength(rows.length)
  })

  it('NON : sans statut établi, l’ordre est celui d’avant (jamais un statut deviné)', () => {
    expect(ids(undefined)).toEqual(rankAccountContacts(rows, RAW, {}).ranked.map(r => r.contact_id))
  })
})

/**
 * LOIC-FIX O.3 — « Pourquoi ce rang ? » DIT quand le statut d'accès a avancé quelqu'un.
 * Recette prod du 20/10 (OGF, compte référencé) : un « Utilisateur » hors achats était N°1 devant
 * cinq décideurs, par la décision #4271 — mais rien à l'écran ne le disait. L'ordre ne change pas
 * (décision inscrite) ; sa RAISON voyage avec la personne.
 */
describe('LOIC-FIX O.3 — la raison du passage devant', () => {
  const reasonOf = (status: 'referenced' | 'to_build' | undefined, id: string) =>
    rankAccountContacts(rows, RAW, {}, 10, undefined, status).ranked.find(r => r.contact_id === id)?.order_reason ??
    null

  it('référencé : l’opérationnel et l’acheteur avancés portent « access_referenced », pas les décideurs', () => {
    expect(reasonOf('referenced', ops.id)).toBe('access_referenced')
    expect(reasonOf('referenced', acheteur.id)).toBe('access_referenced')
    expect(reasonOf('referenced', directeur.id)).toBeNull()
  })

  it('accès à bâtir : la raison n’est posée qu’à une personne réellement PASSÉE devant quelqu’un', () => {
    const base = rankAccountContacts(rows, RAW, {}).ranked.map(r => r.contact_id)
    const result = rankAccountContacts(rows, RAW, {}, 10, undefined, 'to_build').ranked
    const tagged = result.filter(r => r.order_reason === 'access_to_build')
    // #4802.2 — le directeur de rôle `economic` est désormais DEVANT avec le sponsor : plus personne n'en
    // double un autre sur ce jeu, donc plus de raison posée (avant : le sponsor passait seul devant le décideur).
    expect(tagged).toHaveLength(0)
    for (const person of tagged) {
      // passée devant au moins une personne qui la précédait dans l'ordre des critères
      const overtaken = result.filter(
        other => base.indexOf(other.contact_id) < base.indexOf(person.contact_id) && other.position > person.position,
      )
      expect(overtaken.length).toBeGreaterThan(0)
    }
    expect(reasonOf('to_build', ops.id)).toBeNull()
  })

  it('NON : sans statut établi, aucune raison n’est posée (jamais une raison devinée)', () => {
    for (const r of rows) expect(reasonOf(undefined, r.id)).toBeNull()
  })
})

/**
 * #4802.2 — recette prod (01/11) : le groupe calculé (`decision_maker`) ne lit que le TITRE ; le RÔLE posé
 * sur la personne était ignoré. « À bâtir » faisait reculer les décideurs économiques de N°1-3 à N°5-7
 * (derrière des référents techniques) et « Référencé » ne changeait rien (utilisateurs au titre senior).
 */
describe('#4802.2 — l’état lit aussi le RÔLE posé, pas seulement le titre', () => {
  const decideur = row({ title: 'Directeur financier', decision_role: 'economic' })
  const technique = row({ title: 'Directeur technique', decision_role: 'technical' })
  const utilisateur = row({ title: 'Directeur de service', decision_role: 'user' })
  const pool = [technique, decideur, utilisateur]
  const orderOf = (status?: 'referenced' | 'to_build') =>
    rankAccountContacts(pool, RAW, {}, 10, undefined, status).ranked.map(r => r.contact_id)

  it('à bâtir : le décideur économique (rôle posé) reste DEVANT, y compris quand le groupe calculé n’est pas « décideur »', () => {
    const order = orderOf('to_build')
    expect(order.indexOf(decideur.id)).toBeLessThan(order.indexOf(utilisateur.id))
    expect(order.indexOf(decideur.id)).toBeLessThan(order.indexOf(technique.id))
  })

  it('à bâtir : un champion en tête ne fait pas reculer le décideur économique de rôle posé', () => {
    const champion = row({ title: 'Directeur technique', decision_role: 'champion', priority: 1 })
    const junior = row({ title: 'Chargé de mission', decision_role: 'economic', priority: 5 })
    const order = rankAccountContacts([junior, champion], RAW, {}, 10, undefined, 'to_build').ranked.map(
      r => r.contact_id,
    )
    const base = rankAccountContacts([junior, champion], RAW, {}).ranked.map(r => r.contact_id)
    // jamais plus loin qu'avant : l'état « à bâtir » ne pénalise pas un décideur
    expect(order.indexOf(junior.id)).toBeLessThanOrEqual(base.indexOf(junior.id))
  })

  it('référencé : l’utilisateur (rôle posé) passe devant, même avec un titre senior', () => {
    const order = orderOf('referenced')
    expect(order.indexOf(utilisateur.id)).toBeLessThan(order.indexOf(decideur.id))
    expect(order.indexOf(utilisateur.id)).toBeLessThan(order.indexOf(technique.id))
  })

  it('NON : même contenu dans les deux ordres, personne n’est retiré (c76)', () => {
    expect([...orderOf('referenced')].sort()).toEqual([...orderOf('to_build')].sort())
    expect(orderOf('referenced')).toHaveLength(pool.length)
  })
})
