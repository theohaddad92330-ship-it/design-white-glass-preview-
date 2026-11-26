import { describe, expect, it } from 'vitest'
import { buildMeetingBrief, type MeetingBriefBlockKey } from '@bellum/contracts'
import {
  buildMeetingBriefInputs,
  matchAttendeeContact,
  missingKnownContacts,
  type BriefActivity,
  type BriefConsultant,
  type BriefContact,
  type BriefSignal,
} from './meeting-brief-inputs'

const LANG = 'fr-FR'

const camille: BriefContact = {
  id: 'c1',
  full_name: 'Camille Martin',
  email: 'camille.martin@carrefour.com',
  title: 'Head of Data',
  entity: 'Direction Numérique',
  decision_role: 'influencer',
  seniority: 'Direction',
  scope: 'Plateforme data groupe',
  source_tag: 'INTERNE',
  relations: [
    { id: 'c2', name: 'J. Ferry', title: 'CDO', decision_role: 'economic' },
    { id: null, name: 'M. Alaoui', title: 'Head of Engineering', decision_role: 'technical' },
  ],
  key_points: ['Structurer l’équipe', 'Livrer des quick wins'],
  why_contact: null,
  updated_at: '2026-08-29T06:00:00.000Z',
}

function inputsOf(over: Partial<Parameters<typeof buildMeetingBriefInputs>[0]> = {}) {
  return buildMeetingBriefInputs({
    contact: camille,
    activities: null,
    signals: null,
    stakes: [],
    consultants: null,
    objections: [],
    language: LANG,
    ...over,
  })
}

function keys(blocks: ReturnType<typeof buildMeetingBriefInputs>): MeetingBriefBlockKey[] {
  return buildMeetingBrief(blocks).map(block => block.key)
}

describe('matchAttendeeContact', () => {
  it('rattache par adresse e-mail, sans tenir compte de la casse', () => {
    const found = matchAttendeeContact([{ email: 'CAMILLE.MARTIN@carrefour.com', external: true }], [camille])
    expect(found?.id).toBe('c1')
  })

  it('ignore les invités INTERNES — on ne prépare pas un rendez-vous avec un collègue', () => {
    expect(matchAttendeeContact([{ email: camille.email as string, external: false }], [camille])).toBeNull()
  })

  it('ne rattache rien plutôt que le mauvais contact', () => {
    expect(matchAttendeeContact([{ email: 'inconnu@ailleurs.com', external: true }], [camille])).toBeNull()
  })

  it('#2390.9 — une salle réservée n’est jamais rattachée, même si son adresse correspond à un contact', () => {
    expect(
      matchAttendeeContact([{ email: camille.email as string, external: true, resource: true }], [camille]),
    ).toBeNull()
  })
})

describe('missingKnownContacts', () => {
  const julien: BriefContact = { ...camille, id: 'c2', full_name: 'Julien Ferry', email: 'j.ferry@carrefour.com' }

  it('signale un contact connu du compte, absent des invités', () => {
    const missing = missingKnownContacts([{ email: camille.email as string }], [camille, julien])
    expect(missing.map(person => person.id)).toEqual(['c2'])
  })

  it('ne signale rien quand tous les contacts connus sont invités', () => {
    const missing = missingKnownContacts(
      [{ email: camille.email as string }, { email: julien.email as string }],
      [camille, julien],
    )
    expect(missing).toEqual([])
  })

  it('compare sans tenir compte de la casse ni des espaces', () => {
    const missing = missingKnownContacts([{ email: '  CAMILLE.MARTIN@carrefour.com  ' }], [camille, julien])
    expect(missing.map(person => person.id)).toEqual(['c2'])
  })

  it('n’invente jamais une absence pour un contact sans adresse connue', () => {
    const sansEmail: BriefContact = { ...julien, id: 'c3', email: null }
    const missing = missingKnownContacts([{ email: camille.email as string }], [camille, sansEmail])
    expect(missing).toEqual([])
  })

  /**
   * PARITÉ DÉMO (#2390.10, craft rule n°9) — le cas RÉEL de la salle de
   * démonstration, pas un fixture abstrait.
   *
   * `demo-event-nova` (`apps/api/src/modules/demo/demo-agenda.ts`) n'invite
   * QUE Ferdinand Aumont (`f.aumont@nova-logistique.example`) — mais NOVA
   * LOGISTIQUE porte un second contact déjà seedé, Solveig Rambert
   * (`s.rambert@nova-logistique.example`, `apps/api/.../demo-dataset.ts`).
   * Aucune donnée neuve n'était nécessaire pour ce point : la donnée existait,
   * seul le lecteur manquait.
   */
  it('parité démo — Solveig Rambert (NOVA LOGISTIQUE) ressort non invitée à demo-event-nova', () => {
    const ferdinand: BriefContact = {
      ...camille,
      id: 'nova-1',
      full_name: 'Ferdinand Aumont',
      email: 'f.aumont@nova-logistique.example',
    }
    const solveig: BriefContact = {
      ...camille,
      id: 'nova-2',
      full_name: 'Solveig Rambert',
      email: 's.rambert@nova-logistique.example',
    }
    const missing = missingKnownContacts([{ email: 'f.aumont@nova-logistique.example' }], [ferdinand, solveig])
    expect(missing.map(person => person.full_name)).toEqual(['Solveig Rambert'])
  })

  it('#2390.9 — une salle réservée ne compte jamais comme un invité : le contact connu ressort quand même manquant', () => {
    const missing = missingKnownContacts([{ email: camille.email as string, resource: true }], [camille])
    expect(missing.map(person => person.id)).toEqual(['c1'])
  })
})

describe('bloc 01 · QUI', () => {
  it('nomme la personne, son poste et sa direction', () => {
    const who = inputsOf().find(block => block.key === 'who')
    expect(who?.lines).toEqual(['Camille Martin — Head of Data, Direction Numérique'])
  })

  it('porte l’ancrage (séniorité, périmètre) en note, et sa fiche datée en source', () => {
    const who = inputsOf().find(block => block.key === 'who')
    expect(who?.note).toBe('Direction · Plateforme data groupe')
    expect(who?.ground).toEqual({
      kind: 'sourced',
      sources: ['contact_record'],
      observedAt: '2026-08-29T06:00:00.000Z',
    })
  })

  it('sans fiche datée, le bloc ne s’affiche pas comme un fait', () => {
    const blocks = inputsOf({ contact: { ...camille, updated_at: '' } })
    expect(keys(blocks)).not.toContain('who')
  })

  it('n’invente ni ancienneté ni employeur précédent : la note est absente si rien n’est su', () => {
    const who = inputsOf({ contact: { ...camille, seniority: null, scope: null } }).find(b => b.key === 'who')
    expect(who?.note).toBeNull()
  })
})

describe('bloc 02 · CE QU’ON S’EST DIT', () => {
  const activities: BriefActivity[] = [
    {
      kind: 'call',
      source: 'telephony',
      subject: 'Call découverte',
      occurredAt: '2026-03-12T09:00:00.000Z',
      recordedAt: '2026-03-12T09:30:00.000Z',
    },
    {
      kind: 'email',
      source: 'mailbox',
      subject: 'Retour positif sur Sophie',
      occurredAt: '2026-05-28T09:00:00.000Z',
      recordedAt: '2026-05-28T10:00:00.000Z',
    },
    {
      kind: 'note',
      source: 'crm',
      subject: 'Projet gelé',
      occurredAt: '2026-06-15T09:00:00.000Z',
      recordedAt: '2026-08-29T05:00:00.000Z',
    },
  ]

  it('rend les échanges du plus récent au plus ancien, datés', () => {
    const history = inputsOf({ activities }).find(block => block.key === 'history')
    expect(history?.lines).toEqual([
      '15/06 · Projet gelé',
      '28/05 · Retour positif sur Sophie',
      '12/03 · Call découverte',
    ])
  })

  it('nomme les CAPACITÉS traversées, jamais un éditeur, et la date de dernière mise à jour', () => {
    const history = inputsOf({ activities }).find(block => block.key === 'history')
    expect(history?.ground).toEqual({
      kind: 'sourced',
      sources: ['crm', 'mailbox', 'telephony'],
      observedAt: '2026-08-29T05:00:00.000Z',
    })
  })

  it('un historique NON LU ne devient pas « aucun échange » — le bloc se tait', () => {
    // « Non mesuré » n'est pas « 0 » : `null` veut dire qu'on n'a pas pu lire.
    expect(keys(inputsOf({ activities: null }))).not.toContain('history')
  })

  it('un historique LU et VIDE se tait aussi — il n’y a rien à dire, pas « rien ne s’est passé »', () => {
    expect(keys(inputsOf({ activities: [] }))).not.toContain('history')
  })

  it('un échange sans date de relevé ne peut pas dater le bloc', () => {
    const undated: BriefActivity[] = [
      { kind: 'call', source: 'crm', subject: 'Un appel', occurredAt: '2026-03-12T09:00:00.000Z', recordedAt: null },
    ]
    expect(keys(inputsOf({ activities: undated }))).not.toContain('history')
  })
})

describe('bloc 03 · CE QUI BOUGE CHEZ EUX', () => {
  const signals: BriefSignal[] = [
    { label: '17 postes Data ouverts', kind: 'job_postings', date: '2026-08-20T00:00:00.000Z' },
    { label: 'Budget data platform annoncé', kind: 'press', date: '2026-08-12T00:00:00.000Z' },
  ]

  it('liste les signaux et nomme des SOURCES DATÉES', () => {
    const moving = inputsOf({ signals }).find(block => block.key === 'moving')
    expect(moving?.lines).toEqual(['17 postes Data ouverts', 'Budget data platform annoncé'])
    expect(moving?.ground).toEqual({
      kind: 'sourced',
      sources: ['job_postings', 'press'],
      observedAt: '2026-08-20T00:00:00.000Z',
    })
  })

  it('un signal SANS date ne compte pas — un signal sans date n’est pas un signal', () => {
    const undated: BriefSignal[] = [{ label: 'On dit que…', kind: 'press', date: null }]
    expect(keys(inputsOf({ signals: undated }))).not.toContain('moving')
  })

  it('garde les signaux datés et laisse les autres dehors', () => {
    const mixed: BriefSignal[] = [
      { label: 'Sans date', kind: 'press', date: null },
      { label: 'Avec date', kind: 'press', date: '2026-08-12T00:00:00.000Z' },
    ]
    const moving = inputsOf({ signals: mixed }).find(block => block.key === 'moving')
    expect(moving?.lines).toEqual(['Avec date'])
  })
})

describe('bloc 04 · SES ENJEUX PROBABLES', () => {
  it('est TOUJOURS étiqueté déduit, jamais sourcé', () => {
    const stakes = inputsOf({ stakes: ['Structurer l’équipe', 'Sécuriser la plateforme'] }).find(
      block => block.key === 'stakes',
    )
    expect(stakes?.lines).toEqual(['Structurer l’équipe', 'Sécuriser la plateforme'])
    expect(stakes?.ground).toEqual({ kind: 'inferred' })
  })

  it('sans enjeu identifié, le bloc n’existe pas', () => {
    expect(keys(inputsOf({ stakes: [] }))).not.toContain('stakes')
  })
})

describe('bloc 05 · AUTOUR D’ELLE', () => {
  it('nomme l’entourage, et dit hiérarchie sourcée / influence probable', () => {
    const around = inputsOf().find(block => block.key === 'around')
    expect(around?.lines).toEqual(['J. Ferry — CDO', 'M. Alaoui — Head of Engineering'])
    expect(around?.ground).toEqual({
      kind: 'mixed',
      sources: ['contact_record'],
      observedAt: '2026-08-29T06:00:00.000Z',
      probable: ['influence'],
    })
  })

  it('sans entourage connu, le bloc n’existe pas', () => {
    expect(keys(inputsOf({ contact: { ...camille, relations: null } }))).not.toContain('around')
  })

  // #2102.22 — la carte d'influence est HIÉRARCHISÉE : ceux qui pèsent sur la décision d'abord, le rôle
  // non établi en dernier — jamais promu par défaut, jamais écarté (le brief tient en 3 lignes par bloc).
  it('classe l’entourage par poids de décision, le rôle inconnu en dernier', () => {
    const around = inputsOf({
      contact: {
        ...camille,
        relations: [
          { name: 'A. Inconnu', title: 'Chargé de mission', decision_role: null },
          { name: 'B. Métier', title: 'Responsable métier', decision_role: 'user' },
          { name: 'C. Budget', title: 'DAF', decision_role: 'economic' },
          { name: 'D. Tech', title: 'CTO', decision_role: 'technical' },
        ],
      },
    }).find(block => block.key === 'around')
    expect(around?.lines).toEqual([
      'C. Budget — DAF',
      'D. Tech — CTO',
      'B. Métier — Responsable métier',
      'A. Inconnu — Chargé de mission',
    ])
  })

  it('à poids égal, garde l’ordre du dossier', () => {
    const around = inputsOf({
      contact: {
        ...camille,
        relations: [
          { name: 'Z. Premier', decision_role: 'user' },
          { name: 'A. Second', decision_role: 'user' },
        ],
      },
    }).find(block => block.key === 'around')
    expect(around?.lines).toEqual(['Z. Premier', 'A. Second'])
  })
})

describe('bloc 06 · CE QUE TU PEUX POSITIONNER', () => {
  const consultants: BriefConsultant[] = [
    {
      id: 'k1',
      full_name: 'Sophie Martin',
      title: 'Data Engineer senior',
      availability: 'sous_1_mois',
      available_from: '2026-09-15',
      availability_checked_at: '2026-08-28T08:00:00.000Z',
    },
    {
      id: 'k2',
      full_name: 'Karim B.',
      title: 'Data Ops',
      availability: 'immediate',
      available_from: null,
      availability_checked_at: '2026-08-25T08:00:00.000Z',
    },
  ]

  it('liste les profils avec leur disponibilité datée', () => {
    const block = inputsOf({ consultants }).find(b => b.key === 'positionable')
    expect(block?.lines).toEqual(['Sophie Martin — Data Engineer senior, dispo 15/09', 'Karim B. — Data Ops'])
    expect(block?.ground).toEqual({
      kind: 'sourced',
      sources: ['bench'],
      observedAt: '2026-08-28T08:00:00.000Z',
    })
  })

  it('une disponibilité INCONNUE n’est jamais présentée comme une disponibilité', () => {
    const unknown: BriefConsultant[] = [
      { ...(consultants[0] as BriefConsultant), availability: 'inconnu' },
      { ...(consultants[1] as BriefConsultant), availability: 'indisponible' },
    ]
    expect(keys(inputsOf({ consultants: unknown }))).not.toContain('positionable')
  })

  it('une disponibilité JAMAIS VÉRIFIÉE ne date pas le bloc — « dispo immédiate » d’il y a six mois est périmée', () => {
    const unchecked = consultants.map(c => ({ ...c, availability_checked_at: null }))
    expect(keys(inputsOf({ consultants: unchecked }))).not.toContain('positionable')
  })

  it('un vivier NON LU ne devient pas « personne à positionner »', () => {
    expect(keys(inputsOf({ consultants: null }))).not.toContain('positionable')
  })
})

// #2102.31 — les INCONNUES PAR BLOC : chaque bloc nomme ce qu'il n'a pas pu établir. Jamais de « 0 » : un bloc
// complet ne déclare rien.
describe('inconnues par bloc (#2102.31)', () => {
  const unknownsOf = (blocks: ReturnType<typeof inputsOf>, key: MeetingBriefBlockKey) =>
    blocks.find(block => block.key === key)?.unknowns ?? []

  it('QUI : l’ancienneté dans le poste n’a pas de source ; le rôle de décision absent est nommé', () => {
    expect(unknownsOf(inputsOf(), 'who')).toEqual(['tenure'])
    expect(unknownsOf(inputsOf({ contact: { ...camille, decision_role: null } }), 'who')).toEqual([
      'decision_role',
      'tenure',
    ])
    expect(unknownsOf(inputsOf({ contact: { ...camille, decision_role: 'unknown' } }), 'who')).toContain(
      'decision_role',
    )
  })

  it('CE QUI BOUGE : les signaux sans date écartés sont NOMMÉS, pas passés sous silence', () => {
    const mixed: BriefSignal[] = [
      { label: 'Sans date', kind: 'press', date: null },
      { label: 'Avec date', kind: 'press', date: '2026-08-12T00:00:00.000Z' },
    ]
    expect(unknownsOf(inputsOf({ signals: mixed }), 'moving')).toEqual(['undated_signals'])
    expect(unknownsOf(inputsOf({ signals: [mixed[1] as BriefSignal] }), 'moving')).toEqual([])
  })

  it('AUTOUR D’ELLE : une personne au rôle non établi est nommée, un entourage complet ne déclare rien', () => {
    expect(unknownsOf(inputsOf(), 'around')).toEqual([])
    const partial = {
      ...camille,
      relations: [{ name: 'A. Inconnu', decision_role: null }, ...(camille.relations ?? [])],
    }
    expect(unknownsOf(inputsOf({ contact: partial }), 'around')).toEqual(['relation_roles'])
  })

  it('POSITIONNER : un profil dont la dispo n’est pas vérifiée est nommé ; un indisponible n’est pas une inconnue', () => {
    const base: BriefConsultant = {
      id: 'k1',
      full_name: 'Sophie Martin',
      title: 'Data Engineer',
      availability: 'immediate',
      available_from: null,
      availability_checked_at: '2026-08-28T08:00:00.000Z',
    }
    const unverified = { ...base, id: 'k2', full_name: 'Karim B.', availability_checked_at: null }
    const unavailable = { ...base, id: 'k3', full_name: 'Zoé L.', availability: 'indisponible' as const }
    expect(unknownsOf(inputsOf({ consultants: [base, unverified] }), 'positionable')).toEqual([
      'availability_unverified',
    ])
    expect(unknownsOf(inputsOf({ consultants: [base, unavailable] }), 'positionable')).toEqual([])
  })
})

describe('bloc 08 · OBJECTIONS PROBABLES (#1934.10)', () => {
  it('est TOUJOURS étiqueté déduit, comme le bloc des enjeux', () => {
    const objections = inputsOf({
      objections: ['Référencement fournisseur complexe', 'Budget déjà engagé sur un concurrent'],
    }).find(block => block.key === 'objections')
    expect(objections?.lines).toEqual(['Référencement fournisseur complexe', 'Budget déjà engagé sur un concurrent'])
    expect(objections?.ground).toEqual({ kind: 'inferred' })
  })

  it('sans objection identifiée, le bloc n’existe pas', () => {
    expect(keys(inputsOf({ objections: [] }))).not.toContain('objections')
  })
})

describe('l’assemblage complet', () => {
  it('rend les six blocs de données dans l’ordre de la maquette', () => {
    const blocks = inputsOf({
      activities: [
        {
          kind: 'call',
          source: 'crm',
          subject: 'Call',
          occurredAt: '2026-03-12T09:00:00.000Z',
          recordedAt: '2026-03-12T09:30:00.000Z',
        },
      ],
      signals: [{ label: 'Postes ouverts', kind: 'job_postings', date: '2026-08-20T00:00:00.000Z' }],
      stakes: ['Structurer l’équipe'],
      consultants: [
        {
          id: 'k1',
          full_name: 'Sophie Martin',
          title: 'Data Engineer',
          availability: 'immediate',
          available_from: null,
          availability_checked_at: '2026-08-28T08:00:00.000Z',
        },
      ],
    })
    expect(keys(blocks)).toEqual(['who', 'history', 'moving', 'stakes', 'around', 'positionable'])
  })

  it('sans personne rattachée, il n’y a pas de brief — pas un brief vide', () => {
    expect(inputsOf({ contact: null })).toEqual([])
  })

  it('aucun bloc ne sort NON ATTRIBUÉ de l’assemblage : chacun sait dire d’où il vient', () => {
    const blocks = inputsOf({
      activities: [
        {
          kind: 'call',
          source: 'crm',
          subject: 'Call',
          occurredAt: '2026-03-12T09:00:00.000Z',
          recordedAt: '2026-03-12T09:30:00.000Z',
        },
      ],
      signals: [{ label: 'Postes ouverts', kind: 'job_postings', date: '2026-08-20T00:00:00.000Z' }],
      stakes: ['Structurer l’équipe'],
    })
    // Le tri se fait dans `buildMeetingBrief`, à un seul endroit : ce qui SORT
    // à l'écran ne porte jamais de bloc incapable de dire d'où il vient.
    const brief = buildMeetingBrief(blocks)
    expect(brief.length).toBeGreaterThan(0)
    for (const block of brief) expect(block.ground.kind, block.key).not.toBe('unattributed')
  })
})
