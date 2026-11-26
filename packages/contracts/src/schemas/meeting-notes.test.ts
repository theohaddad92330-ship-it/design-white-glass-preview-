import { describe, expect, it } from 'vitest'
import { AUTOMATION_LEVEL_ORDER, automationLevelSchema, userAutonomyBand } from './action-os.js'
import {
  buildMeetingCascade,
  MEETING_OUTPUT_AUTOMATION_LEVEL,
  meetingCascadeSchema,
  meetingEvidenceSchema,
  meetingExternalOutputKindSchema,
  meetingInternalOutputKindSchema,
  meetingOutputBand,
  meetingOutputKindSchema,
  meetingRecapApprovalInput,
  meetingRecapSchema,
  type MeetingEvidence,
  type MeetingRecap,
} from './meeting-notes.js'

const HEARD: MeetingEvidence = { kind: 'transcript', excerpt: 'nous cherchons deux profils pour septembre' }
const DICTATED: MeetingEvidence = { kind: 'notes-derived' }

/** Un compte rendu vide et VALIDE — le point de départ de chaque cas. */
function emptyRecap(): MeetingRecap {
  return meetingRecapSchema.parse({
    summary: '',
    decisions: [],
    nextSteps: [],
    openQuestions: [],
    signals: [],
    followUpEmail: '',
  })
}

/** Les dix sorties, toutes présentes et toutes sourcées — le cas de la maquette. */
function fullRecap(): MeetingRecap {
  return meetingRecapSchema.parse({
    summary: 'Camille cherche deux profils pour septembre.',
    decisions: ['Deux CV envoyés avant vendredi'],
    nextSteps: [
      { action: 'Envoyer deux CV', owner: 'Théo', due: 'vendredi', evidence: HEARD },
      { action: 'Repasser sur le TJM', owner: 'Camille', due: 'la semaine prochaine', evidence: HEARD },
    ],
    openQuestions: [],
    signals: [],
    followUpEmail: 'Bonjour Camille, merci pour cet échange.',
    opportunity: { title: 'Deux profils Java pour septembre', accountName: 'ACME', evidence: HEARD },
    need: { title: 'Deux développeurs Java', detail: '5 ans, Paris', evidence: HEARD },
    mentionedContacts: [
      { fullName: 'Camille Rey', role: 'DSI', evidence: HEARD },
      { fullName: 'Marc Ito', role: '', evidence: DICTATED },
    ],
    crmStage: { proposedStage: 'Qualifié', rationale: 'Un besoin daté', evidence: HEARD },
    reminder: { content: 'Relancer sur les deux CV.', dueLabel: 'dans dix jours', evidence: HEARD },
    learnings: [{ kind: 'objection', content: 'Le TJM est jugé haut.', evidence: HEARD }],
    clientIssue: { title: 'Turnover élevé côté client', detail: 'Deux départs en trois mois', evidence: HEARD },
    recapEvidence: HEARD,
    followUpEvidence: HEARD,
    sources: [{ kind: 'transcript', detail: '46 min' }, { kind: 'crm' }, { kind: 'calendar' }],
    estimatedCredits: 3,
  })
}

describe('un extrait n’a que deux formes, et jamais une troisième', () => {
  it('un extrait de transcript porte une phrase non vide', () => {
    expect(meetingEvidenceSchema.safeParse({ kind: 'transcript', excerpt: '  ' }).success).toBe(false)
    expect(meetingEvidenceSchema.safeParse({ kind: 'transcript' }).success).toBe(false)
    expect(meetingEvidenceSchema.safeParse(HEARD).success).toBe(true)
  })

  it('le marqueur de notes dictées ne prétend citer personne', () => {
    expect(meetingEvidenceSchema.safeParse(DICTATED).success).toBe(true)
    // Aucune autre origine n'existe : « le modèle le pense » n'a pas de forme.
    expect(meetingEvidenceSchema.safeParse({ kind: 'inferred', excerpt: 'a' }).success).toBe(false)
  })
})

describe('les six champs d’origine ne bougent pas', () => {
  it('un compte rendu écrit avant ce chantier se relit sans migration', () => {
    const legacy = meetingRecapSchema.parse({
      summary: 'Un résumé',
      decisions: ['Une décision'],
      nextSteps: [{ action: 'Envoyer deux CV', owner: '', due: '' }],
      openQuestions: ['Et le budget ?'],
      signals: ['Java'],
      followUpEmail: 'Bonjour',
    })
    expect(legacy.summary).toBe('Un résumé')
    expect(legacy.nextSteps[0]?.evidence).toBeNull()
    expect(legacy.opportunity).toBeNull()
    expect(legacy.mentionedContacts).toEqual([])
  })

  it('un coût non chiffré vaut null, jamais zéro', () => {
    // « 0 crédit » affiché parce qu'on n'a pas su calculer se lit comme une
    // gratuité promise. Le défaut doit donc dire « on ne sait pas ».
    expect(emptyRecap().estimatedCredits).toBeNull()
  })
})

describe('la cascade rend les dix sorties de la maquette', () => {
  it('dix cartes, dans l’ordre, chacune avec sa puce et son extrait', () => {
    const cascade = buildMeetingCascade(fullRecap())
    expect(meetingCascadeSchema.safeParse(cascade).success).toBe(true)
    expect(cascade.cards).toHaveLength(10)
    expect(cascade.cards.map(card => card.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(cascade.cards.map(card => card.kind)).toEqual(meetingOutputKindSchema.options)
    // La maquette, colonne par colonne — `client_issue` (#2103.10) ferme la
    // liste sur sa propre bande a2 (n2_user_approval), même bande que
    // `crm_stage` juste avant elle.
    expect(cascade.cards.map(card => card.band)).toEqual(['a1', 'a2', 'a2', 'a2', 'a2', 'a3', 'a2', 'a3', 'a0', 'a2'])
    for (const card of cascade.cards) expect(card.evidence.length).toBeGreaterThan(0)
  })

  it('une carte porte autant d’extraits que d’objets', () => {
    const cascade = buildMeetingCascade(fullRecap())
    const contacts = cascade.cards.find(card => card.kind === 'contacts')
    expect(contacts?.itemCount).toBe(2)
    expect(contacts?.evidence).toEqual([HEARD, DICTATED])
  })

  it('une sortie absente ne produit pas de carte vide', () => {
    const cascade = buildMeetingCascade(emptyRecap())
    expect(cascade.cards).toEqual([])
    expect(cascade.summary.internalWrites).toEqual([])
    expect(cascade.summary.externalDrafts).toEqual([])
  })
})

describe('une sortie sans extrait ne s’affiche pas comme extraite', () => {
  it('l’action non sourcée est écartée, et l’écart est COMPTÉ', () => {
    const recap = fullRecap()
    recap.nextSteps = [
      { action: 'Envoyer deux CV', owner: 'Théo', due: 'vendredi', evidence: HEARD },
      { action: 'Baisser le TJM de 15 %', owner: '', due: '', evidence: null },
    ]
    const cascade = buildMeetingCascade(recap)
    const steps = cascade.cards.find(card => card.kind === 'next_steps')
    expect(steps?.itemCount).toBe(1)
    // Écartée, mais pas perdue en silence : l'écran a de quoi le dire.
    expect(cascade.summary.droppedWithoutEvidence).toBe(1)
  })

  it('un compte rendu entier sans extrait perd sa carte plutôt que sa source', () => {
    const recap = emptyRecap()
    recap.summary = 'Un résumé que rien ne justifie.'
    const cascade = buildMeetingCascade(recap)
    expect(cascade.cards).toEqual([])
    expect(cascade.summary.droppedWithoutEvidence).toBe(1)
  })

  it('rien à écarter reste zéro, et ce zéro-là est VRAI', () => {
    expect(buildMeetingCascade(fullRecap()).summary.droppedWithoutEvidence).toBe(0)
  })
})

describe('« datés et assignés » ne s’écrit que si c’est vrai', () => {
  it('toutes les actions datées ET assignées', () => {
    const cascade = buildMeetingCascade(fullRecap())
    expect(cascade.cards.find(card => card.kind === 'next_steps')?.state).toBe('dated_and_owned')
  })

  it('une seule action sans échéance suffit à changer l’état', () => {
    const recap = fullRecap()
    recap.nextSteps = [{ action: 'Envoyer deux CV', owner: 'Théo', due: '', evidence: HEARD }]
    expect(buildMeetingCascade(recap).cards.find(card => card.kind === 'next_steps')?.state).toBe('partially_dated')
  })
})

describe('la promesse « aucune action externe envoyée »', () => {
  it('le lot ne peut PAS nommer un brouillon externe', () => {
    // Le moyen manque, pas la permission : l'énumération interne n'a aucune
    // case où loger le mail ni la relance.
    expect(meetingInternalOutputKindSchema.safeParse('follow_up_email').success).toBe(false)
    expect(meetingInternalOutputKindSchema.safeParse('reminder').success).toBe(false)
  })

  it('les deux énumérations sont disjointes et couvrent les dix sorties', () => {
    const internal = meetingInternalOutputKindSchema.options as readonly string[]
    const external = meetingExternalOutputKindSchema.options as readonly string[]
    expect(internal.filter(kind => external.includes(kind))).toEqual([])
    expect([...internal, ...external].sort()).toEqual([...meetingOutputKindSchema.options].sort())
    // Huit internes depuis #2103.10 (`client_issue` s'ajoute au septième
    // d'origine, le chiffre du bouton de la maquette).
    expect(internal).toHaveLength(8)
  })

  it('le lot annoncé exclut les deux brouillons externes', () => {
    const cascade = buildMeetingCascade(fullRecap())
    expect(cascade.summary.internalWrites.map(write => write.kind)).toEqual([
      'recap',
      'opportunity',
      'need',
      'contacts',
      'next_steps',
      'crm_stage',
      'learnings',
      'client_issue',
    ])
    expect(cascade.summary.externalDrafts).toEqual(['follow_up_email', 'reminder'])
  })

  it('les deux sorties externes sont a3, et elles seules', () => {
    const external = meetingOutputKindSchema.options.filter(kind => meetingOutputBand(kind) === 'a3')
    expect(external).toEqual(['follow_up_email', 'reminder'])
  })
})

describe('A0-A3 est une couche de PRÉSENTATION, posée sur N0-N5', () => {
  it('aucun niveau technique n’a été renommé, réordonné ni retiré', () => {
    // Cliquet. La couche A est purement additive : si elle avait touché à un
    // seul `n*`, c'est ici que ça se saurait.
    const expected = [
      'n0_advice',
      'n1_prepare',
      'n2_user_approval',
      'n3_manager_approval',
      'n4_bounded_auto',
      'n5_extended_auto',
    ]
    expect(automationLevelSchema.options).toEqual(expected)
    expect(AUTOMATION_LEVEL_ORDER).toEqual(expected)
  })

  it('la table du mapping, ligne par ligne', () => {
    expect(userAutonomyBand({ level: 'n0_advice', reachesOutside: false })).toBe('a0')
    expect(userAutonomyBand({ level: 'n4_bounded_auto', reachesOutside: false })).toBe('a0')
    expect(userAutonomyBand({ level: 'n1_prepare', reachesOutside: false })).toBe('a1')
    expect(userAutonomyBand({ level: 'n2_user_approval', reachesOutside: false })).toBe('a2')
    expect(userAutonomyBand({ level: 'n3_manager_approval', reachesOutside: false })).toBe('a2')
    expect(userAutonomyBand({ level: 'n5_extended_auto', reachesOutside: false })).toBe('a2')
  })

  it('la CIBLE l’emporte sur le niveau — un brouillon de mail est déjà a3', () => {
    // `n1_prepare` : rien ne part, personne n'a approuvé. Et pourtant a3, parce
    // que la destination est extérieure — c'est ce qui l'exclut du lot.
    expect(userAutonomyBand({ level: 'n1_prepare', reachesOutside: true })).toBe('a3')
    expect(MEETING_OUTPUT_AUTOMATION_LEVEL.follow_up_email).toBe('n1_prepare')
    expect(MEETING_OUTPUT_AUTOMATION_LEVEL.reminder).toBe('n1_prepare')
    expect(meetingOutputBand('follow_up_email')).toBe('a3')
  })

  it('chacune des neuf sorties déclare son niveau technique', () => {
    for (const kind of meetingOutputKindSchema.options) {
      expect(automationLevelSchema.safeParse(MEETING_OUTPUT_AUTOMATION_LEVEL[kind]).success).toBe(true)
    }
  })
})

/**
 * #3758 — CE QU'UNE APPROBATION DE `recap` ENVOIE À L'API.
 *
 * `MeetingNotesCard` et `NoteCascadeProposal` composaient chacun `body`
 * séparément (même texte, deux endroits) : GA-26. Ce helper leur donne une
 * SEULE dérivation — et y ajoute l'instantané structuré (décisions,
 * prochaines étapes, relance) que la carte `post_meeting_summary` de Laura
 * relira plus tard, jamais reconstruit après coup depuis le texte.
 */
describe('meetingRecapApprovalInput — l’approbation du compte rendu (#3758)', () => {
  it('le corps joint le résumé et les décisions, séparés par une ligne vide', () => {
    const recap = { ...emptyRecap(), summary: 'Point hebdo.', decisions: ['On avance sur le lot B.'] }
    const input = meetingRecapApprovalInput(recap, 'acc-1')
    expect(input.accountId).toBe('acc-1')
    expect(input.body).toBe('Point hebdo.\n\nOn avance sur le lot B.')
  })

  it('aucune décision, aucune prochaine étape, aucune relance : aucun instantané — pas un instantané VIDE', () => {
    const input = meetingRecapApprovalInput(emptyRecap(), 'acc-1')
    expect(input.snapshot).toBeNull()
  })

  it('l’instantané porte les décisions, les prochaines étapes et la relance telles que la cascade les a dérivées', () => {
    const recap: MeetingRecap = {
      ...emptyRecap(),
      decisions: ['Go sur le pilote.'],
      nextSteps: [{ action: 'Envoyer le devis', owner: 'Théo', due: 'vendredi', evidence: HEARD }],
      reminder: { content: 'Relancer après le comité budget.', dueLabel: 'dans 2 semaines', evidence: HEARD },
    }
    const input = meetingRecapApprovalInput(recap, 'acc-1')
    expect(input.snapshot).toEqual({
      decisions: ['Go sur le pilote.'],
      nextSteps: [{ action: 'Envoyer le devis', owner: 'Théo', due: 'vendredi', evidence: HEARD }],
      reminder: { content: 'Relancer après le comité budget.', dueLabel: 'dans 2 semaines', evidence: HEARD },
    })
  })

  it('une relance seule, sans décision ni prochaine étape, porte quand même un instantané', () => {
    const recap: MeetingRecap = {
      ...emptyRecap(),
      reminder: { content: 'Relancer.', dueLabel: '', evidence: DICTATED },
    }
    const input = meetingRecapApprovalInput(recap, 'acc-1')
    expect(input.snapshot?.reminder?.content).toBe('Relancer.')
    expect(input.snapshot?.decisions).toEqual([])
  })
})
