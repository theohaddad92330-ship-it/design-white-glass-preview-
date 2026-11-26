import {
  CONTACT_RANKING_AXES,
  CONTACT_RANKING_TIE_BREAKER_AXES,
  CONTACT_STRATEGIC_AXES,
  RECOMMENDED_PATH_MAX,
} from '@bellum/contracts'
import { rankAccountContacts, scoreFromAxes, type RankableContactRow } from './contact-ranking'

/**
 * #2120.13 / .15 / .19 / .22-.23 / .25 / .27-.38 — le classement recalculé côté
 * API, sur des critères nommés. Chaque cas nomme le point du registre qu'il tient.
 */

let seq = 0
function row(patch: Partial<RankableContactRow> = {}): RankableContactRow {
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

const RAW = {
  priority_perimeters: [
    { name: 'Groupe', tier: 'P1' },
    { name: 'Filiale Retail', tier: 'P2' },
  ],
  angles: [{ title: 'Cadrage Data et intelligence artificielle' }],
}

const order = (res: ReturnType<typeof rankAccountContacts>) => res.ranked.map(r => r.contact_id)

describe('rankAccountContacts — #2120.30-38', () => {
  it('le plafond des axes fait 100 et chaque axe est nommé une fois', () => {
    expect(CONTACT_RANKING_AXES.reduce((sum, axis) => sum + axis.max, 0)).toBe(100)
    const res = rankAccountContacts([row()], RAW, {})
    expect(res.ranked[0].axes.map(a => a.key)).toEqual(CONTACT_RANKING_AXES.map(a => a.key))
  })

  it('#2120.27 — un PDG groupe sans lien avec le sujet ne passe pas devant un N-2 pertinent', () => {
    const ceo = row({ title: 'Président-directeur général', decision_role: 'economic', email: 'a@x.fr' })
    const n2 = row({ title: 'Responsable Data', decision_role: 'influencer', email: 'b@x.fr' })
    expect(order(rankAccountContacts([ceo, n2], RAW, {}))).toEqual([n2.id, ceo.id])
  })

  it('#2120.28 — un CIO groupe sans lien avec le sujet ne passe pas devant un responsable pertinent', () => {
    const cio = row({ title: 'Group CIO', decision_role: 'technical', email: 'a@x.fr' })
    const lead = row({ title: 'Head of Data Platform', decision_role: 'influencer', email: 'b@x.fr' })
    expect(order(rankAccountContacts([cio, lead], RAW, {}))).toEqual([lead.id, cio.id])
  })

  it('#2120.29 — un CTO groupe sans lien avec le sujet ne passe pas devant un responsable pertinent', () => {
    const cto = row({ title: 'Chief Technology Officer', decision_role: 'technical', email: 'a@x.fr' })
    const lead = row({ title: 'Responsable intelligence artificielle', decision_role: 'user', email: 'b@x.fr' })
    expect(order(rankAccountContacts([cto, lead], RAW, {}))).toEqual([lead.id, cto.id])
  })

  it('#2120.30 — changer le périmètre ciblé change l’ordre', () => {
    const groupe = row({ entity: 'Groupe', email: 'a@x.fr' })
    const retail = row({ entity: 'Filiale Retail', email: 'b@x.fr' })
    expect(order(rankAccountContacts([retail, groupe], RAW, {}))).toEqual([groupe.id, retail.id])
    const chosen = rankAccountContacts([groupe, retail], RAW, { perimeter: 'Filiale Retail' })
    expect(order(chosen)).toEqual([retail.id, groupe.id])
    expect(chosen.context).toMatchObject({ perimeter: 'Filiale Retail', perimeter_source: 'chosen' })
  })

  it('#2120.30 — sans cartographie ni choix, le périmètre sort du dénominateur et reste nommé', () => {
    const res = rankAccountContacts([row()], {}, {})
    expect(res.ranked[0].axes.find(a => a.key === 'perimeter')).toMatchObject({
      points: null,
      reason: 'no_perimeter_context',
    })
    expect(res.context.perimeter_source).toBe('none')
  })

  it('#2120.31 — un contact au bon niveau passe devant un plus senior hors sujet', () => {
    const vp = row({ title: 'Vice-président ventes', decision_role: 'economic', email: 'a@x.fr' })
    const manager = row({ title: 'Manager Data', decision_role: 'user', email: 'b@x.fr' })
    expect(order(rankAccountContacts([vp, manager], RAW, {}))).toEqual([manager.id, vp.id])
  })

  it('#2120.32 — un contact atteignable passe devant un équivalent injoignable', () => {
    const unreachable = row({ last_enrichment_at: '2026-09-01T00:00:00Z' })
    const reachable = row({ email: 'c@x.fr', email_verified: true })
    const res = rankAccountContacts([unreachable, reachable], RAW, {})
    expect(order(res)).toEqual([reachable.id, unreachable.id])
    expect(res.ranked[1].access_path).toEqual({ kind: null, missing_reason: 'searched_nothing_found' })
  })

  it('#2120.32 — jamais cherché : l’accessibilité n’est pas mesurée, et la voie d’accès le dit', () => {
    const res = rankAccountContacts([row()], RAW, {})
    expect(res.ranked[0].axes.find(a => a.key === 'accessibility')).toMatchObject({ points: null })
    expect(res.ranked[0].access_path).toEqual({ kind: null, missing_reason: 'never_searched' })
  })

  it('#2120.33 — changer le sujet change l’ordre', () => {
    const data = row({ title: 'Responsable Data', email: 'a@x.fr' })
    const cyber = row({ title: 'Responsable cybersécurité', email: 'b@x.fr' })
    expect(order(rankAccountContacts([cyber, data], RAW, {}))).toEqual([data.id, cyber.id])
    const res = rankAccountContacts([data, cyber], RAW, { subject: 'Cybersécurité' })
    expect(order(res)).toEqual([cyber.id, data.id])
    expect(res.context).toMatchObject({ subject: 'Cybersécurité', subject_source: 'chosen' })
  })

  it('#2120.34 — deux offres différentes produisent deux ordres différents', () => {
    const sap = row({ title: 'Responsable SAP', email: 'a@x.fr' })
    const cloud = row({ title: 'Responsable Cloud', email: 'b@x.fr' })
    expect(order(rankAccountContacts([sap, cloud], {}, { offer: 'Migration Cloud' }))).toEqual([cloud.id, sap.id])
    expect(order(rankAccountContacts([cloud, sap], {}, { offer: 'Maintenance SAP' }))).toEqual([sap.id, cloud.id])
  })

  it('#2120.34 — sans offre choisie, l’axe sort du dénominateur et reste nommé', () => {
    const axis = rankAccountContacts([row()], RAW, {}).ranked[0].axes.find(a => a.key === 'offer')
    expect(axis).toMatchObject({ points: null, reason: 'no_offer' })
  })

  it('#2120.35 — le rôle d’achat est évalué et nommé', () => {
    const buyer = row({ title: 'Directeur des achats IT', decision_role: 'procurement' })
    const axis = rankAccountContacts([buyer], RAW, {}).ranked[0].axes.find(a => a.key === 'buying_role')
    expect(axis).toMatchObject({ points: 5, reason: 'purchasing_role' })
  })

  it('#2120.36 — un contact avec un historique d’échange passe devant un inconnu équivalent', () => {
    const unknown = row({ email: 'a@x.fr' })
    const talked = row({ email: 'b@x.fr', user_status: 'replied', email_sent_at: '2026-09-02T10:00:00Z' })
    const res = rankAccountContacts([unknown, talked], RAW, {})
    expect(order(res)).toEqual([talked.id, unknown.id])
    // #2120.25 — la date du dernier échange tracé dans l'espace voyage avec le rang.
    expect(res.ranked[0].last_interaction_at).toBe('2026-09-02T10:00:00.000Z')
    expect(res.ranked[1].last_interaction_at).toBeNull()
  })

  it('#2120.37 — un contact déjà en relation avec l’espace est mis en avant', () => {
    const cold = row({ email: 'a@x.fr' })
    const known = row({ email: 'b@x.fr', source: 'crm' })
    const res = rankAccountContacts([cold, known], RAW, {})
    expect(order(res)).toEqual([known.id, cold.id])
    expect(res.ranked[0].access_path.kind).toBe('relationship')
  })

  it('#2120.38 — la séniorité ne compte que si elle est pertinente pour le sujet', () => {
    const seniorOff = row({ title: 'Directeur commercial' })
    const seniorOn = row({ title: 'Directeur Data' })
    const res = rankAccountContacts([seniorOff, seniorOn], RAW, {})
    const seniority = (id: string) =>
      res.ranked.find(r => r.contact_id === id)?.axes.find(a => a.key === 'relevant_seniority')
    expect(seniority(seniorOn.id)).toMatchObject({ points: 5, reason: 'senior_relevant' })
    expect(seniority(seniorOff.id)).toMatchObject({ points: 0, reason: 'seniority_not_relevant' })
  })

  it('#2120.15 / #2120.19 — ni la photo ni la localisation ne changent le classement', () => {
    const a = row({ title: 'Responsable Data', email: 'a@x.fr' })
    const b = row({ title: 'Manager Data', email: 'b@x.fr' })
    const base = rankAccountContacts([a, b], RAW, {})
    // Les lignes réelles portent ces champs : le noyau doit les ignorer, pas les refuser.
    const noisyA = { ...a, photo_url: 'https://img/1.jpg', location: 'Lyon, France' }
    const noisyB = { ...b, photo_url: null, location: 'Montréal, Canada' }
    const withNoise = rankAccountContacts([noisyA, noisyB], RAW, {})
    expect(withNoise.ranked).toEqual(base.ranked)
  })

  it('un axe non évaluable sort du dénominateur : le plafond est la somme des axes ÉVALUÉS', () => {
    // Aucun contexte de compte, aucun choix : seuls les axes lus sur la LIGNE restent.
    const top = rankAccountContacts([row({ title: null, decision_role: null })], {}, {}).ranked[0]
    expect(top.axes.filter(a => a.points === null).map(a => a.key)).toEqual([
      'perimeter',
      'accessibility',
      'subject',
      'offer',
      'relevant_seniority',
    ])
    expect(top).toMatchObject({ score: 0, max: 35, confidence: 'low' })
  })

  it('sous trois axes évalués, pas de score', () => {
    const measured = { key: 'history', points: 4, max: 10, reason: 'exchange_sent' } as const
    const unmeasured = { key: 'offer', points: null, max: 10, reason: 'no_offer' } as const
    expect(scoreFromAxes([measured, measured, unmeasured])).toEqual({ score: null, max: null })
    expect(scoreFromAxes([measured, measured, measured])).toEqual({ score: 12, max: 30 })
  })

  it('#2120.22 — la confiance est un niveau nommé qui baisse quand les axes manquent', () => {
    const rich = row({ title: 'Responsable Data', email: 'a@x.fr', email_verified: true })
    const thin = row({ title: 'Responsable Data' })
    const res = rankAccountContacts([rich], RAW, { offer: 'Data' })
    expect(res.ranked[0].confidence).toBe('high')
    expect(rankAccountContacts([thin], {}, {}).ranked[0].confidence).not.toBe('high')
  })

  it('#2120.13 — le chemin recommandé ne dépasse jamais dix personnes', () => {
    const rows = Array.from({ length: 25 }, () => row({ email: 'x@x.fr' }))
    const res = rankAccountContacts(rows, RAW, {})
    expect(res.ranked).toHaveLength(RECOMMENDED_PATH_MAX)
    expect(res.total).toBe(25)
    expect(res.ranked.map(r => r.position)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1))
  })

  it('aucune probabilité : le score est un nombre de points sur un plafond, jamais un pourcentage', () => {
    const res = rankAccountContacts([row({ email: 'a@x.fr' })], RAW, {})
    const top = res.ranked[0]
    expect(top.score).not.toBeNull()
    expect(top.max).toBeGreaterThanOrEqual(top.score ?? 0)
    expect(JSON.stringify(res)).not.toMatch(/probab|chance|%/i)
  })
})

describe('rankAccountContacts — #2295.2 / #2295.4 / #2295.5', () => {
  it('#2295.5 — huit axes stratégiques nommés, dérivés des neuf axes techniques, Σ(max) = 100', () => {
    // Tous les neuf axes techniques mesurés (offre choisie incluse) : le
    // plafond nominal complet. Le test suivant prouve le rétrécissement.
    const res = rankAccountContacts([row({ email: 'a@x.fr', email_verified: true })], RAW, { offer: 'Cloud' })
    const strategic = res.ranked[0].strategic_axes
    expect(strategic.map(a => a.key)).toEqual(CONTACT_STRATEGIC_AXES.map(a => a.key))
    expect(strategic.map(a => a.key)).toEqual([
      'proximite',
      'accessibilite',
      'role',
      'scope',
      'actualite',
      'relation',
      'deblocage',
      'confiance',
    ])
    expect(strategic.reduce((sum, a) => sum + a.max, 0)).toBe(100)
  })

  it('#2295.5 — un axe technique non mesuré sort du dénominateur de l’axe stratégique qui le regroupe', () => {
    // « scope » regroupe subject + offer (#2295.5). Sans offre choisie, l'axe
    // offer est non évaluable et ne doit pas compter comme 0 dans le plafond.
    const withOffer = rankAccountContacts([row({ title: 'Responsable Data', email: 'a@x.fr' })], RAW, {
      offer: 'Migration Cloud',
    }).ranked[0]
    const withoutOffer = rankAccountContacts([row({ title: 'Responsable Data', email: 'b@x.fr' })], RAW, {}).ranked[0]
    const scopeWith = withOffer.strategic_axes.find(a => a.key === 'scope')
    const scopeWithout = withoutOffer.strategic_axes.find(a => a.key === 'scope')
    expect(scopeWith?.max).toBe(25)
    expect(scopeWithout?.max).toBe(15)
    expect(scopeWithout?.points).not.toBeNull()
  })

  it('#2295.4 — un contact NON VÉRIFIÉ ne peut jamais être « première porte », même à égalité par ailleurs', () => {
    const unverified = row({ title: 'Consultant Data', decision_role: 'user', email: 'a@x.fr', email_verified: false })
    const verified = row({ title: 'Consultant Data', decision_role: 'user', email: 'b@x.fr', email_verified: true })
    const res = rankAccountContacts([unverified, verified], RAW, {})
    const groupOf = (id: string) => res.ranked.find(r => r.contact_id === id)?.group
    expect(groupOf(verified.id)).toBe('first_door')
    expect(groupOf(unverified.id)).not.toBe('first_door')
  })

  it('#2295.4bis — un contact de SEMIS démo peut être « première porte » sans email vérifié, ni adresse inventée', () => {
    // décision Louis 18/09/2026 (question 24) : `demo_seed_first_door` lève le
    // verrou #2295.4 SANS jamais affirmer qu'une adresse a été vérifiée.
    const demoSeed = row({
      title: 'Consultant Data',
      decision_role: 'user',
      email: 'f.aumont@nova-logistique.example',
      email_verified: false,
      demo_seed_first_door: true,
    })
    const res = rankAccountContacts([demoSeed], RAW, {})
    expect(res.ranked[0].group).toBe('first_door')
  })

  it('#2295.4bis — le champ de semis ne dispense jamais des groupes prioritaires (buyer/champion/decision_maker)', () => {
    // Un acheteur reste acheteur même marqué « semis démo » — la levée du
    // verrou #2295.4 ne doit jamais court-circuiter les groupes qui priment.
    const buyerDemoSeed = row({
      title: 'Directeur des achats IT',
      decision_role: 'procurement',
      email: 'a@nova-logistique.example',
      email_verified: false,
      demo_seed_first_door: true,
    })
    const res = rankAccountContacts([buyerDemoSeed], RAW, {})
    expect(res.ranked[0].group).toBe('buyer')
  })

  it('#2295.2 — les six groupes nommés sont tous atteignables', () => {
    const buyer = row({
      title: 'Directeur des achats IT',
      decision_role: 'procurement',
      email: 'a@x.fr',
      email_verified: true,
    })
    const champion = row({ title: 'Ingénieur', decision_role: 'champion', email: 'b@x.fr', email_verified: true })
    const decisionMaker = row({
      title: 'Directeur Data',
      decision_role: 'economic',
      email: 'c@x.fr',
      email_verified: true,
    })
    const firstDoor = row({ title: 'Consultant Data', decision_role: 'user', email: 'd@x.fr', email_verified: true })
    const relay = row({ title: 'Développeur', decision_role: 'user', email: 'e@x.fr', email_verified: false })
    const qualifier = row({ title: null, decision_role: 'influencer', email: 'f@x.fr', email_verified: false })
    const res = rankAccountContacts([buyer, champion, decisionMaker, firstDoor, relay, qualifier], RAW, {})
    const groupOf = (id: string) => res.ranked.find(r => r.contact_id === id)?.group
    expect(groupOf(buyer.id)).toBe('buyer')
    expect(groupOf(champion.id)).toBe('champion')
    expect(groupOf(decisionMaker.id)).toBe('decision_maker')
    expect(groupOf(firstDoor.id)).toBe('first_door')
    expect(groupOf(relay.id)).toBe('relay')
    expect(groupOf(qualifier.id)).toBe('qualifier')
  })

  it('#2295.3 — le classement porte les contacts écartés à la porte, avec leur raison', () => {
    const res = rankAccountContacts([row({ email: 'a@x.fr' })], RAW, {})
    // Le noyau pur ne filtre rien lui-même (la porte vit en amont, `contact-eligibility.ts`) —
    // il rend systématiquement le champ, vide ici, pour que l'appelant le fusionne.
    expect(res.excluded).toEqual([])
  })
})

describe('rankAccountContacts — #2295.8 six dimensions d’explication PAR CONTACT', () => {
  it('les six dimensions sont TOUJOURS toutes les six, jamais une qui disparaît', () => {
    const res = rankAccountContacts([row({ email: 'a@x.fr' })], RAW, {})
    const dims = res.ranked[0].explanation
    expect(Object.keys(dims).sort()).toEqual(['limit', 'next', 'stage', 'unlocks', 'when', 'who'])
    for (const key of Object.keys(dims) as Array<keyof typeof dims>) {
      expect(dims[key]).toMatchObject({ key, measured: expect.any(Boolean), code: expect.any(String) })
    }
  })

  it('une dimension non identifiable est NOMMÉE absente, jamais un contenu inventé pour la remplir', () => {
    const qualifier = row({ title: null, decision_role: 'influencer', email: 'a@x.fr', email_verified: false })
    const res = rankAccountContacts([qualifier], RAW, {})
    expect(res.ranked[0].group).toBe('qualifier')
    // Si ce test tombe : soit "unlocks" affiche un contenu inventé pour un
    // groupe qui n'en a pas (measured passerait à true), soit son code a
    // changé sans que l'absence reste nommée — les deux sont interdits.
    expect(res.ranked[0].explanation.unlocks).toEqual({
      key: 'unlocks',
      measured: false,
      code: 'unlocks_not_identified',
    })
  })

  it('la limite est TOUJOURS mesurée : un relais ne se lit jamais comme un décideur', () => {
    const relay = row({ title: 'Développeur', decision_role: 'user', email: 'a@x.fr', email_verified: false })
    const res = rankAccountContacts([relay], RAW, {})
    expect(res.ranked[0].group).toBe('relay')
    expect(res.ranked[0].explanation.limit).toEqual({ key: 'limit', measured: true, code: 'limit_no_authority' })
  })

  it('« pourquoi maintenant » lit le SEUL fait tracé dans l’espace (historique), jamais deviné', () => {
    const replied = row({ email: 'a@x.fr', user_status: 'replied' })
    const res = rankAccountContacts([replied], RAW, {})
    expect(res.ranked[0].explanation.when).toEqual({
      key: 'when',
      measured: true,
      code: 'when_recent_positive_exchange',
    })
  })

  it('« et ensuite » pointe le contact SUIVANT du chemin RENDU ; le dernier le nomme sans en inventer un', () => {
    const NEXT_CODE = {
      first_door: 'next_first_door',
      qualifier: 'next_qualifier',
      champion: 'next_champion',
      decision_maker: 'next_decision_maker',
      buyer: 'next_buyer',
      relay: 'next_relay',
    } as const
    const buyer = row({
      title: 'Directeur des achats IT',
      decision_role: 'procurement',
      email: 'a@x.fr',
      email_verified: true,
    })
    const firstDoor = row({ title: 'Consultant Data', decision_role: 'user', email: 'b@x.fr', email_verified: true })
    const res = rankAccountContacts([firstDoor, buyer], RAW, {})
    expect(res.ranked).toHaveLength(2)
    const [top, bottom] = res.ranked
    expect(top.explanation.next).toEqual({ key: 'next', measured: true, code: NEXT_CODE[bottom.group] })
    expect(bottom.explanation.next).toEqual({ key: 'next', measured: false, code: 'next_path_end' })
  })
})

describe('rankAccountContacts — #2295.9 l’anti-recommandation PAR CONTACT', () => {
  it('un relais porte « ne pas le traiter comme une autorité », jamais un conseil pour un autre groupe', () => {
    const relay = row({ title: 'Développeur', decision_role: 'user', email: 'a@x.fr', email_verified: false })
    const res = rankAccountContacts([relay], RAW, {})
    expect(res.ranked[0].group).toBe('relay')
    expect(res.ranked[0].anti_advice).toEqual({ what: 'dont_treat_as_authority', why: 'limit_no_authority' })
  })

  it('le "why" de l’anti-recommandation est EXACTEMENT le code de la limite — un seul calcul, jamais deux', () => {
    const buyer = row({
      title: 'Directeur des achats IT',
      decision_role: 'procurement',
      email: 'a@x.fr',
      email_verified: true,
    })
    const res = rankAccountContacts([buyer], RAW, {})
    expect(res.ranked[0].group).toBe('buyer')
    // Si ce test tombe : soit "why" a divergé du calcul de "limit" (deux
    // dérivations au lieu d'une, GA-26), soit "what" ne correspond plus au
    // groupe réel du contact.
    expect(res.ranked[0].anti_advice).toEqual({
      what: 'dont_pitch_technical_choice',
      why: 'limit_not_technical_decision',
    })
    expect(res.ranked[0].anti_advice.why).toBe(res.ranked[0].explanation.limit.code)
  })
})

/**
 * #2297.57 — décision Louis 19/09/2026 : la joignabilité (un e-mail, un
 * téléphone, un profil) ne fait JAMAIS monter une personne au-dessus d'une autre
 * de rôle plus important. Elle reste NOMMÉE (axe `accessibility`), mais ne pèse
 * plus dans le score : elle DÉPARTAGE deux personnes au même rôle, et seulement
 * elles.
 */
describe('rankAccountContacts — #2297.57 la joignabilité départage, elle ne classe pas', () => {
  const REACH: Array<[string, Partial<RankableContactRow>]> = [
    ['verified_email', { email: 'v@x.fr', email_verified: true }],
    ['email', { email: 'e@x.fr' }],
    ['phone', { phone: '+33100000000' }],
    ['professional_profile', { linkedin_url: 'https://www.linkedin.com/in/x' }],
    ['searched_nothing_found', { last_enrichment_at: '2026-09-01T00:00:00Z' }],
    ['never_searched', {}],
  ]

  it('la joignabilité est nommée comme DÉPARTAGE, jamais comme axe du score', () => {
    expect(CONTACT_RANKING_TIE_BREAKER_AXES).toEqual(['accessibility'])
    const history = { key: 'history', points: 4, max: 10, reason: 'exchange_sent' } as const
    const reach = { key: 'accessibility', points: 15, max: 15, reason: 'verified_email' } as const
    expect(scoreFromAxes([history, history, history, reach])).toEqual({ score: 12, max: 30 })
  })

  it.each(REACH.flatMap(([hi, hiPatch]) => REACH.map(([lo, loPatch]) => [hi, lo, hiPatch, loPatch] as const)))(
    'deux rôles différents ne s’inversent jamais (rôle fort %s, rôle faible %s)',
    (_hi, _lo, hiPatch, loPatch) => {
      const strong = row({ title: 'Directeur commercial', decision_role: 'economic', ...hiPatch })
      const weak = row({ title: 'Directeur commercial', decision_role: 'influencer', ...loPatch })
      expect(order(rankAccountContacts([weak, strong], RAW, {}))).toEqual([strong.id, weak.id])
    },
  )

  it('un rôle plus important reste devant à score ÉGAL : la joignabilité ne départage qu’à rôle égal', () => {
    // Même total (25/75) par deux chemins : le rôle d'achat (buying_role 5) d'un côté, le niveau de décision de
    // l'autre (11 contre 7). Seul `decision_level` dit l'importance du rôle. #4292.10 (21/10) : `technical` est
    // passé sous sponsor/champion, le décideur du test est donc un sponsor ; les titres sont ajustés pour que
    // les totaux restent ÉGAUX.
    const decider = row({ title: 'Expert commercial', decision_role: 'sponsor', entity: 'Filiale Retail' })
    const reachableBuyer = row({
      title: 'Acheteur commercial',
      decision_role: 'procurement',
      entity: 'Filiale Retail',
      email: 'achat@x.fr',
      email_verified: true,
    })
    const res = rankAccountContacts([reachableBuyer, decider], RAW, {})
    const [first, second] = res.ranked
    expect(first.score! / first.max!).toBeCloseTo(second.score! / second.max!, 9)
    expect(order(res)).toEqual([decider.id, reachableBuyer.id])
  })

  it('deux personnes au même rôle sont départagées par la joignabilité, à score ÉGAL', () => {
    const reachable = row({ title: 'Directeur commercial', decision_role: 'economic', email: 'a@x.fr' })
    const unreachable = row({
      title: 'Directeur commercial',
      decision_role: 'economic',
      last_enrichment_at: '2026-09-01T00:00:00Z',
    })
    const res = rankAccountContacts([unreachable, reachable], RAW, {})
    expect(order(res)).toEqual([reachable.id, unreachable.id])
    // Le score ne la contient pas : c'est bien un départage, pas un poids.
    expect(res.ranked[0]).toMatchObject({ score: res.ranked[1].score, max: res.ranked[1].max })
    // Elle reste NOMMÉE sur la ligne — le fait n'a pas disparu, il ne pèse plus.
    expect(res.ranked[0].axes.find(a => a.key === 'accessibility')).toMatchObject({ points: 11, reason: 'email' })
  })
})

/**
 * SIG-B (11/10/2026) — un recruteur NOMMÉ par une offre publiée
 * (`source = 'job_posting'`) ne passe jamais devant un décideur, même mieux
 * noté (sujet, joignabilité) : le rôle change l'ORDRE, jamais le CONTENU (c76)
 * — il reste au chemin, simplement après. Un dirigeant nommé par l'offre garde
 * le rang que son rôle lui donne.
 */
describe('rankAccountContacts — SIG-B, recruteur prouvé par une offre', () => {
  const reachable = {
    title: 'Recruteuse Data',
    decision_role: 'user',
    email: 'r@x.fr',
    email_verified: true,
    phone: '+33612345678',
    linkedin_url: 'https://www.linkedin.com/in/r',
  }

  it('un recruteur mieux noté reste DERRIÈRE le décideur, et reste au chemin', () => {
    const recruiter = row({ ...reachable, source: 'job_posting' })
    const decider = row({ title: 'Responsable applicatif', decision_role: 'user' })
    const res = rankAccountContacts([decider, recruiter], RAW, { subject: 'data' })
    expect(order(res)).toEqual([decider.id, recruiter.id])
  })

  it('sait dire NON : le même profil venu d’une autre source passe devant', () => {
    const sameProfile = row(reachable)
    const decider = row({ title: 'Responsable applicatif', decision_role: 'user' })
    expect(order(rankAccountContacts([decider, sameProfile], RAW, { subject: 'data' }))).toEqual([
      sameProfile.id,
      decider.id,
    ])
  })

  it('un DIRIGEANT nommé par l’offre garde le rang que son rôle lui donne', () => {
    const director = row({
      title: 'Directeur Data',
      decision_role: 'technical',
      source: 'job_posting',
      email: 'd@x.fr',
    })
    const other = row({ title: 'Responsable applicatif', decision_role: 'user' })
    expect(order(rankAccountContacts([other, director], RAW, { subject: 'data' }))[0]).toBe(director.id)
  })
})
