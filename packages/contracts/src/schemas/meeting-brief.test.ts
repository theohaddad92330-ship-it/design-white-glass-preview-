import { describe, expect, it } from 'vitest'
import { decisionRoleSchema } from './contact.js'
import { relationshipStateSchema } from './sales-context.js'
import {
  MEETING_BRIEF_BLOCKS,
  MEETING_TYPES,
  buildMeetingBrief,
  deriveAccessPath,
  deriveMeetingObjective,
  deriveMeetingQuestions,
  deriveMeetingType,
  describeGround,
  type MeetingBriefBlockInput,
} from './meeting-brief.js'

const DECISION_ROLES = decisionRoleSchema.options
const RELATIONSHIP_STATES = relationshipStateSchema.options

/* -------------------------------------------------------------------------- */
/*  L'ORIGINE D'UN BLOC — le cœur du brief                                     */
/* -------------------------------------------------------------------------- */

describe('describeGround — un bloc dit d’où il vient, ou il ne dit rien', () => {
  it('une source AVEC sa date est sourcée', () => {
    const ground = describeGround({ sources: ['crm', 'mailbox'], observedAt: '2026-08-29T10:00:00.000Z' })
    expect(ground).toEqual({
      kind: 'sourced',
      sources: ['crm', 'mailbox'],
      observedAt: '2026-08-29T10:00:00.000Z',
    })
  })

  it('une source SANS date n’est PAS une source — elle est non attribuée', () => {
    // C'est l'invariant du lot : `Provenance` = la source ET la date. Une source
    // sans date laisse croire que l'information est d'aujourd'hui.
    expect(describeGround({ sources: ['crm'] })).toEqual({ kind: 'unattributed' })
    expect(describeGround({ sources: ['crm'], observedAt: null })).toEqual({ kind: 'unattributed' })
    expect(describeGround({ sources: ['crm'], observedAt: 'pas une date' })).toEqual({ kind: 'unattributed' })
  })

  it('une date SANS source n’est pas une source non plus', () => {
    expect(describeGround({ sources: [], observedAt: '2026-08-29T10:00:00.000Z' })).toEqual({ kind: 'unattributed' })
  })

  it('déduit se DIT déduit, et n’emprunte aucune source', () => {
    expect(describeGround({ inferred: true })).toEqual({ kind: 'inferred' })
    // Même avec une source sous la main : ce qui est déduit reste déduit.
    expect(describeGround({ inferred: true, sources: ['crm'], observedAt: '2026-08-29T10:00:00.000Z' })).toEqual({
      kind: 'inferred',
    })
  })

  it('une part sourcée et une part probable donnent un bloc MIXTE, chacune nommée', () => {
    expect(
      describeGround({
        sources: ['contact_record'],
        observedAt: '2026-08-29T10:00:00.000Z',
        probable: ['influence', 'sponsorship'],
      }),
    ).toEqual({
      kind: 'mixed',
      sources: ['contact_record'],
      observedAt: '2026-08-29T10:00:00.000Z',
      probable: ['influence', 'sponsorship'],
    })
  })

  it('une part probable SANS part sourcée est simplement déduite', () => {
    expect(describeGround({ probable: ['influence'] })).toEqual({ kind: 'inferred' })
  })

  it('un bloc DÉRIVÉ nomme ce dont il dérive', () => {
    expect(describeGround({ derivedFrom: ['meeting_type', 'relationship_stage'] })).toEqual({
      kind: 'derived',
      from: ['meeting_type', 'relationship_stage'],
    })
  })

  it('rien du tout est non attribué — jamais « détecté par Bellum »', () => {
    expect(describeGround({})).toEqual({ kind: 'unattributed' })
  })

  it('accepte un Date autant qu’une chaîne, et normalise en ISO', () => {
    expect(describeGround({ sources: ['press'], observedAt: new Date('2026-08-20T09:30:00.000Z') })).toEqual({
      kind: 'sourced',
      sources: ['press'],
      observedAt: '2026-08-20T09:30:00.000Z',
    })
  })
})

/* -------------------------------------------------------------------------- */
/*  L'ASSEMBLAGE DES SEPT BLOCS                                                */
/* -------------------------------------------------------------------------- */

function block(over: Partial<MeetingBriefBlockInput> & { key: MeetingBriefBlockInput['key'] }): MeetingBriefBlockInput {
  return {
    lines: [`une ligne ${over.key}`],
    ground: { kind: 'sourced', sources: ['crm'], observedAt: '2026-08-29T10:00:00.000Z' },
    ...over,
  }
}

describe('buildMeetingBrief', () => {
  it('rend les blocs dans l’ordre canonique, numérotés à partir de 1', () => {
    const brief = buildMeetingBrief([block({ key: 'outcome' }), block({ key: 'who' }), block({ key: 'moving' })])
    expect(brief.map(b => [b.index, b.key])).toEqual([
      [1, 'who'],
      [2, 'moving'],
      [3, 'outcome'],
    ])
  })

  it('les huit blocs de la maquette existent, dans l’ordre de la maquette — #2319 en ajoute cinq EN FIN', () => {
    expect(MEETING_BRIEF_BLOCKS.slice(0, 8)).toEqual([
      'who',
      'history',
      'moving',
      'stakes',
      'around',
      'positionable',
      'outcome',
      'objections',
    ])
    const brief = buildMeetingBrief(MEETING_BRIEF_BLOCKS.map(key => block({ key })))
    // #4424.1 — 13 rubriques #2319, puis REX, atelier, pitch et reprise du R1.
    expect(brief.map(b => b.index)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1))
  })

  it('un bloc NON ATTRIBUÉ ne s’affiche pas — il ne peut pas se faire passer pour un fait', () => {
    const brief = buildMeetingBrief([block({ key: 'who' }), block({ key: 'moving', ground: { kind: 'unattributed' } })])
    expect(brief.map(b => b.key)).toEqual(['who'])
  })

  it('un bloc sans contenu ne s’affiche pas — une carte vide ment sur l’analyse', () => {
    const brief = buildMeetingBrief([
      block({ key: 'who' }),
      block({ key: 'history', lines: [] }),
      block({ key: 'moving', lines: ['   ', ''] }),
    ])
    expect(brief.map(b => b.key)).toEqual(['who'])
  })

  it('renumérote en continu : un rang de lecture, pas un identifiant', () => {
    const brief = buildMeetingBrief([
      block({ key: 'who' }),
      block({ key: 'history', ground: { kind: 'unattributed' } }),
      block({ key: 'moving' }),
    ])
    expect(brief.map(b => [b.index, b.key])).toEqual([
      [1, 'who'],
      [2, 'moving'],
    ])
  })

  it('garde la note du bloc, et la normalise à null quand elle est vide', () => {
    const brief = buildMeetingBrief([
      block({ key: 'who', note: 'Chez Carrefour depuis 2 mois' }),
      block({ key: 'moving', note: '   ' }),
    ])
    expect(brief[0]?.note).toBe('Chez Carrefour depuis 2 mois')
    expect(brief[1]?.note).toBeNull()
  })

  it('nettoie les lignes vides sans perdre les autres', () => {
    const brief = buildMeetingBrief([block({ key: 'who', lines: ['A', '  ', 'B'] })])
    expect(brief[0]?.lines).toEqual(['A', 'B'])
  })

  it('un même bloc fourni deux fois n’apparaît qu’une fois — le premier gagne', () => {
    const brief = buildMeetingBrief([
      block({ key: 'who', lines: ['premier'] }),
      block({ key: 'who', lines: ['second'] }),
    ])
    expect(brief).toHaveLength(1)
    expect(brief[0]?.lines).toEqual(['premier'])
  })
})

/* -------------------------------------------------------------------------- */
/*  LE TYPE DE RENDEZ-VOUS                                                     */
/* -------------------------------------------------------------------------- */

// #2102.31 — les INCONNUES PAR BLOC : ce qu'un bloc n'a pas pu établir est NOMMÉ sous lui. Jamais un « 0 » ni
// un blanc : sans inconnue, la liste est vide et rien ne s'affiche.
describe('buildMeetingBrief — inconnues par bloc (#2102.31)', () => {
  it('porte les inconnues déclarées par le bloc, sans doublon', () => {
    const [who] = buildMeetingBrief([block({ key: 'who', unknowns: ['decision_role', 'tenure', 'decision_role'] })])
    expect(who?.unknowns).toEqual(['decision_role', 'tenure'])
  })

  it('un bloc sans inconnue en porte une liste VIDE — pas de valeur inventée', () => {
    const [who] = buildMeetingBrief([block({ key: 'who' })])
    expect(who?.unknowns).toEqual([])
  })

  it('ne confond pas les inconnues d’un bloc avec celles d’un autre', () => {
    const brief = buildMeetingBrief([block({ key: 'who', unknowns: ['tenure'] }), block({ key: 'around' })])
    expect(brief.find(b => b.key === 'around')?.unknowns).toEqual([])
  })
})

describe('deriveMeetingType', () => {
  it('sans invité externe, c’est un point interne', () => {
    expect(deriveMeetingType({ hasExternalAttendee: false, relationship: 'client_actif' })).toBe('internal_meeting')
  })

  it('sans état de relation, le type est INCONNU — jamais deviné', () => {
    expect(deriveMeetingType({ hasExternalAttendee: true, relationship: null })).toBeNull()
  })

  it('une porte jamais franchie reste un premier contact', () => {
    // `refere` et `linkedin` sont des portes TIÈDES : la conversation, elle,
    // reste la première.
    for (const state of ['froid', 'connu', 'linkedin', 'refere'] as const) {
      expect(deriveMeetingType({ hasExternalAttendee: true, relationship: state }), state).toBe('first_contact')
    }
  })

  it('une relation en sommeil se réactive', () => {
    for (const state of ['dormant', 'ancien_client'] as const) {
      expect(deriveMeetingType({ hasExternalAttendee: true, relationship: state }), state).toBe('warm_reactivation')
    }
  })

  it('un besoin ouvert est une opportunité ouverte', () => {
    expect(deriveMeetingType({ hasExternalAttendee: true, relationship: 'besoin_ouvert' })).toBe('open_opportunity')
  })

  it('les deux états AMBIGUS ne produisent AUCUN type', () => {
    // `client_actif` couvre revue, comité et point de delivery ; `rang2` couvre
    // point partenaire et point de mission. Rien ne les sépare aujourd'hui.
    expect(deriveMeetingType({ hasExternalAttendee: true, relationship: 'client_actif' })).toBeNull()
    expect(deriveMeetingType({ hasExternalAttendee: true, relationship: 'rang2' })).toBeNull()
  })

  it('la taxonomie de relation est CELLE du dépôt — chaque état a une réponse', () => {
    // `relationshipStateSchema` (sales-context.ts) est la seule taxonomie de
    // relation du produit. Un état ajouté là-bas doit se voir ici, et non
    // retomber silencieusement sur `undefined`.
    for (const state of RELATIONSHIP_STATES) {
      const type = deriveMeetingType({ hasExternalAttendee: true, relationship: state })
      expect(type === null || MEETING_TYPES.includes(type), state).toBe(true)
    }
  })

  it('les huit types de la spécification sont déclarés, dans l’ordre de la spécification', () => {
    expect(MEETING_TYPES.slice(0, 8)).toEqual([
      'first_contact',
      'warm_reactivation',
      'open_opportunity',
      'profile_presentation',
      'active_client_review',
      'steering_committee',
      'partner_meeting',
      'internal_meeting',
    ])
  })
})

/* -------------------------------------------------------------------------- */
/*  L'OBJECTIF — DÉTERMINISTE, JAMAIS RÉDIGÉ                                   */
/* -------------------------------------------------------------------------- */

describe('deriveMeetingObjective', () => {
  it('sans type de rendez-vous, PAS d’objectif — un objectif inventé envoie en réunion avec la mauvaise intention', () => {
    expect(deriveMeetingObjective({ meetingType: null })).toBeNull()
  })

  it('un point interne n’a pas d’objectif commercial', () => {
    expect(deriveMeetingObjective({ meetingType: 'internal_meeting' })).toBeNull()
  })

  it('une réactivation demande de RECONNECTER, pas de revendre', () => {
    expect(deriveMeetingObjective({ meetingType: 'warm_reactivation' })).toEqual({
      stance: 'reconnect_not_resell',
      outcomes: ['map_real_need', 'date_to_present_profile'],
    })
  })

  it('un premier contact demande d’ÉCOUTER, pas de pitcher', () => {
    expect(deriveMeetingObjective({ meetingType: 'first_contact' })).toEqual({
      stance: 'listen_not_pitch',
      outcomes: ['qualify_need', 'agree_next_step'],
    })
  })

  it('chacun des sept types commerciaux a un objectif, et il est déterministe', () => {
    for (const meetingType of MEETING_TYPES) {
      if (meetingType === 'internal_meeting') continue
      const first = deriveMeetingObjective({ meetingType })
      expect(first, meetingType).not.toBeNull()
      expect(first?.outcomes.length, meetingType).toBeGreaterThan(0)
      // Deux appels, une seule réponse : aucun modèle dans la boucle.
      expect(deriveMeetingObjective({ meetingType })).toEqual(first)
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  LES TROIS QUESTIONS                                                        */
/* -------------------------------------------------------------------------- */

describe('deriveMeetingQuestions', () => {
  it('sans type de rendez-vous, aucune question', () => {
    expect(deriveMeetingQuestions({ meetingType: null })).toEqual([])
  })

  it('un point interne ne se prépare pas avec des questions de découverte', () => {
    expect(deriveMeetingQuestions({ meetingType: 'internal_meeting' })).toEqual([])
  })

  it('en rend CINQ (#2319.35), prises dans la banque du dépôt — jamais rédigées ici', () => {
    const questions = deriveMeetingQuestions({ meetingType: 'warm_reactivation' })
    expect(questions).toHaveLength(5)
    for (const question of questions) expect(question.length).toBeGreaterThan(10)
  })

  it('est déterministe — deux commerciaux qui préparent le même rendez-vous voient la même liste', () => {
    expect(deriveMeetingQuestions({ meetingType: 'open_opportunity' })).toEqual(
      deriveMeetingQuestions({ meetingType: 'open_opportunity' }),
    )
  })

  it('ne repose pas une question dont on a déjà la réponse', () => {
    const all = deriveMeetingQuestions({ meetingType: 'warm_reactivation' })
    const withoutBudget = deriveMeetingQuestions({
      meetingType: 'warm_reactivation',
      answeredFamilies: ['budget_timing_urgency'],
    })
    expect(withoutBudget).not.toEqual(all)
    expect(withoutBudget.some(q => all.includes(q))).toBe(true)
  })

  // #2633.1 — le domaine d'offre `ia` (portefeuille « IA, machine learning,
  // GenAI & agents ») doit personnaliser comme les sept autres domaines
  // spécifiques (esn_it, finance, supply_chain, product_design, pmo, rh,
  // industrial_engineering) : ajouter la famille `project_mission`, comme eux.
  it('le domaine d’offre `ia` personnalise comme les autres domaines spécifiques', () => {
    const withoutOffer = deriveMeetingQuestions({ meetingType: 'qualification' })
    const withIa = deriveMeetingQuestions({ meetingType: 'qualification', offerDomain: 'ia' })
    expect(withIa).not.toEqual(withoutOffer)
  })
})

// #2102.35 / #2102.36 — Renouvellement et Entretien consultant : deux types qui se CHOISISSENT (aucun état de
// relation ne les distingue), ajoutés EN FIN d'enum — jamais renumérotés (GA-08).
describe('Renouvellement et Entretien consultant (#2102.35, #2102.36)', () => {
  it('sont les deux DERNIÈRES valeurs de l’enum — les précédentes ne bougent pas', () => {
    expect(MEETING_TYPES.slice(-4)).toEqual(['r1_discovery', 'r2_workshop', 'renewal', 'consultant_interview'])
  })

  it('ne se DÉRIVENT jamais de l’état de la relation', () => {
    for (const relationship of RELATIONSHIP_STATES) {
      const derived = deriveMeetingType({ hasExternalAttendee: true, relationship })
      expect(derived, relationship).not.toBe('renewal')
      expect(derived, relationship).not.toBe('consultant_interview')
    }
  })

  it('ont un objectif propre, déterministe, distinct des autres types', () => {
    const renewal = deriveMeetingObjective({ meetingType: 'renewal' })
    const interview = deriveMeetingObjective({ meetingType: 'consultant_interview' })
    expect(renewal?.stance).toBe('renew_on_results')
    expect(renewal?.outcomes).toContain('confirm_renewal_decision')
    expect(interview?.stance).toBe('prepare_not_script')
    expect(interview?.outcomes).toContain('prepare_consultant')
    expect(renewal).not.toEqual(interview)
  })

  it('ont cinq questions tirées de la banque, pas un point interne vide', () => {
    expect(deriveMeetingQuestions({ meetingType: 'renewal' })).toHaveLength(5)
    expect(deriveMeetingQuestions({ meetingType: 'consultant_interview' })).toHaveLength(5)
  })
})

/* -------------------------------------------------------------------------- */
/*  LE CHEMIN D'ACCÈS                                                          */
/* -------------------------------------------------------------------------- */

describe('deriveAccessPath', () => {
  const camille = { id: 'c1', name: 'Camille Martin', role: 'influencer' as const, roleIsProbable: false }
  const ferry = { id: 'c2', name: 'J. Ferry', role: 'economic' as const, roleIsProbable: true }
  const alaoui = { id: 'c3', name: 'M. Alaoui', role: 'technical' as const, roleIsProbable: false }
  const stagiaire = { id: 'c4', name: 'P. Durand', role: 'user' as const, roleIsProbable: false }

  it('met la personne du rendez-vous en premier, quel que soit son rôle', () => {
    const path = deriveAccessPath({ contacts: [ferry, alaoui, camille], metWithIds: ['c1'] })
    expect(path.map(step => step.name)).toEqual(['Camille Martin', 'J. Ferry', 'M. Alaoui'])
    expect(path.map(step => step.rank)).toEqual([1, 2, 3])
  })

  it('classe par RÔLE, jamais par autre chose', () => {
    const path = deriveAccessPath({ contacts: [stagiaire, alaoui, ferry], metWithIds: [] })
    expect(path.map(step => step.role)).toEqual(['economic', 'technical', 'user'])
  })

  it('garde la mention « probable » du rôle — un sponsor supposé n’est pas un sponsor', () => {
    const path = deriveAccessPath({ contacts: [ferry], metWithIds: [] })
    expect(path[0]).toEqual({ rank: 1, contactId: 'c2', name: 'J. Ferry', role: 'economic', roleIsProbable: true })
  })

  it('s’arrête à trois — un chemin d’accès n’est pas un annuaire', () => {
    const path = deriveAccessPath({ contacts: [camille, ferry, alaoui, stagiaire], metWithIds: ['c1'] })
    expect(path).toHaveLength(3)
  })

  it('ignore un contact sans nom : on ne montre pas une pastille vide', () => {
    const path = deriveAccessPath({
      contacts: [{ id: 'c9', name: '  ', role: 'economic', roleIsProbable: false }, camille],
      metWithIds: [],
    })
    expect(path.map(step => step.contactId)).toEqual(['c1'])
  })

  it('à rôle égal, garde l’ordre d’entrée — aucun départage arbitraire', () => {
    const a = { id: 'a', name: 'A', role: 'influencer' as const, roleIsProbable: false }
    const b = { id: 'b', name: 'B', role: 'influencer' as const, roleIsProbable: false }
    expect(deriveAccessPath({ contacts: [b, a], metWithIds: [] }).map(s => s.contactId)).toEqual(['b', 'a'])
  })

  it('la taxonomie de rôles est CELLE du dépôt — aucun second vocabulaire', () => {
    // `decisionRoleSchema` (contact.ts) est la seule liste de rôles du produit.
    // Un rôle qu'elle porte doit pouvoir entrer ici, y compris les valeurs
    // héritées : des lignes anciennes les portent encore.
    for (const role of DECISION_ROLES) {
      const path = deriveAccessPath({ contacts: [{ id: 'x', name: 'X', role, roleIsProbable: false }], metWithIds: [] })
      expect(path, role).toHaveLength(1)
      expect(path[0]?.role, role).toBe(role)
    }
  })

  it('un bloqueur est sur le chemin, il n’est pas le chemin', () => {
    const path = deriveAccessPath({
      contacts: [
        { id: 'b', name: 'Bloqueur', role: 'blocker', roleIsProbable: false },
        { id: 'u', name: 'Utilisateur', role: 'user', roleIsProbable: false },
      ],
      metWithIds: [],
    })
    expect(path.map(step => step.contactId)).toEqual(['u', 'b'])
  })
})
