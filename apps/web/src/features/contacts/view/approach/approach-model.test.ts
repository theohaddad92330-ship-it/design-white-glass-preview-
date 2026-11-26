import { describe, expect, it } from 'vitest'
import {
  APPROACH_OBJECTIVES,
  approachChannelFromParam,
  approachDraftStatus,
  callBriefFacts,
  callQualificationQuestions,
  splitCallScript,
  groupEvidence,
  latestExchange,
  sameDraftContent,
} from './approach-model'

describe('Théo C6 — approach-model', () => {
  it('les trois objectifs de la page portent un code du moteur (jamais un code inventé)', () => {
    expect(APPROACH_OBJECTIVES.map(item => item.code)).toEqual([
      'recommandation',
      'reprise_relation',
      'positionnement_expertise',
    ])
  })

  it('le canal de l’URL : e-mail, LinkedIn et appel seulement, tout le reste est refusé', () => {
    expect(approachChannelFromParam('email')).toBe('email')
    expect(approachChannelFromParam('linkedin')).toBe('linkedin')
    expect(approachChannelFromParam('call')).toBe('call')
    expect(approachChannelFromParam('sms')).toBeNull()
    expect(approachChannelFromParam('whatsapp')).toBeNull()
    expect(approachChannelFromParam('')).toBeNull()
  })

  it('deux contenus sont identiques à l’espace de fin de ligne près, jamais au-delà', () => {
    expect(sameDraftContent({ subject: 'A', body: 'B\n' }, { subject: 'A ', body: 'B' })).toBe(true)
    expect(sameDraftContent({ subject: 'A', body: 'B' }, { subject: 'A', body: 'C' })).toBe(false)
  })

  it('le statut : validé seulement si le texte à l’écran est celui qui a été relu', () => {
    const current = { subject: 'S', body: 'Corps' }
    expect(approachDraftStatus({ current, validated: { subject: 'S', body: 'Corps' }, generating: false })).toBe(
      'validated',
    )
    expect(
      approachDraftStatus({ current, validated: { subject: 'S', body: 'Corps modifié' }, generating: false }),
    ).toBe('draft')
    expect(approachDraftStatus({ current, validated: null, generating: false })).toBe('draft')
    expect(approachDraftStatus({ current, validated: null, generating: true })).toBe('writing')
  })

  it('la preuve sépare ce qui est observé, l’historique, l’ESN et l’interprétation — rien d’inventé', () => {
    const groups = groupEvidence({
      specificity: {
        status: 'specifique',
        count: 3,
        minimum: 2,
        unavailable: [],
        elements: [
          { kind: 'dated_signal', value: 'Projet de migration SAP annoncé' },
          { kind: 'client_reference', value: 'Mission Horizon Énergie 2024' },
          { kind: 'esn_expertise', value: 'Reprise de données SAP' },
        ],
      },
      rationale: 'Le programme rend la reprise prioritaire.',
    })
    expect(groups.observed.map(item => item.value)).toEqual(['Projet de migration SAP annoncé'])
    expect(groups.history.map(item => item.value)).toEqual(['Mission Horizon Énergie 2024'])
    expect(groups.esn.map(item => item.value)).toEqual(['Reprise de données SAP'])
    expect(groups.interpretation).toBe('Le programme rend la reprise prioritaire.')
  })

  it('sans insight, la preuve est vide — l’écran le dit, il n’invente rien', () => {
    const groups = groupEvidence({})
    expect(groups.observed).toEqual([])
    expect(groups.history).toEqual([])
    expect(groups.esn).toEqual([])
    expect(groups.interpretation).toBeNull()
  })
})

describe('Théo C7 — callQualificationQuestions', () => {
  const script =
    'Bonjour Paul, je vous appelle au sujet de la reprise des données. Est-ce toujours dans votre périmètre ? ' +
    'Comment votre équipe est-elle organisée aujourd’hui ? Quel serait le point le plus utile à faire avancer ? ' +
    'Comment procédez-vous quand un renfort est nécessaire ? Qui d’autre suit ce sujet ?'

  it('tire les questions du script rédigé, sans la question d’ouverture, trois au plus', () => {
    expect(callQualificationQuestions(script, null)).toEqual([
      'Comment votre équipe est-elle organisée aujourd’hui ?',
      'Quel serait le point le plus utile à faire avancer ?',
      'Comment procédez-vous quand un renfort est nécessaire ?',
    ])
  })

  // #4525.5 — la page dédiée retirée posait d'abord la question du RÔLE de décision ; l'onglet la garde, en tête.
  it('#4525.5 — la question du rôle de décision ouvre la liste, puis celles du script, trois au plus', () => {
    expect(callQualificationQuestions(script, 'Où en est votre budget ?')).toEqual([
      'Où en est votre budget ?',
      'Comment votre équipe est-elle organisée aujourd’hui ?',
      'Quel serait le point le plus utile à faire avancer ?',
    ])
  })

  it('un script sans question de qualification : la question du rôle, sinon rien (jamais une question inventée)', () => {
    expect(callQualificationQuestions('Bonjour Paul, je vous appelle.', 'Où en est votre budget ?')).toEqual([
      'Où en est votre budget ?',
    ])
    expect(callQualificationQuestions('Bonjour Paul, je vous appelle.', null)).toEqual([])
  })
})

describe('Théo C7 — callBriefFacts (« Ce qu’il faut savoir avant d’appeler »)', () => {
  it('rien de connu : aucune ligne (jamais un fait deviné)', () => {
    expect(callBriefFacts({ email_sent_at: null, signals: [], key_points: [] })).toEqual([])
    expect(callBriefFacts({ signals: [{ label: '  ' }], key_points: [' '] })).toEqual([])
  })

  it('le dernier envoi, puis les signaux datés, puis les points clés — quatre au plus', () => {
    const facts = callBriefFacts({
      email_sent_at: '2026-10-16T09:00:00.000Z',
      signals: [{ label: 'Migration SAP S/4 lancée', date: '2026-10-01' }],
      key_points: ['Répond avant 10 h', 'Pilote la reprise des données', 'Troisième point'],
    })
    expect(facts.map(fact => fact.kind)).toEqual(['last_sent', 'signal', 'key_point', 'key_point'])
    expect(facts[1]).toEqual({ kind: 'signal', text: 'Migration SAP S/4 lancée', date: '2026-10-01' })
  })

  // #4525.5 — le DERNIER ÉCHANGE de la timeline (appel, rendez-vous, message) passe devant le seul « dernier envoi ».
  it('#4525.5 — le dernier échange de la timeline, avec son objet, remplace le « dernier envoi » (pas deux lignes)', () => {
    const facts = callBriefFacts({
      email_sent_at: '2026-10-16T09:00:00.000Z',
      last_exchange: { at: '2026-10-20T14:00:00.000Z', subject: ' Point reprise des données ' },
      key_points: ['Répond avant 10 h'],
    })
    expect(facts.map(fact => fact.kind)).toEqual(['last_exchange', 'key_point'])
    expect(facts[0]).toEqual({
      kind: 'last_exchange',
      text: 'Point reprise des données',
      date: '2026-10-20T14:00:00.000Z',
    })
  })

  it('#4525.5 — un dernier échange sans objet reste une ligne datée ; une date illisible, aucune ligne', () => {
    expect(callBriefFacts({ last_exchange: { at: '2026-10-20T14:00:00.000Z', subject: null } })).toEqual([
      { kind: 'last_exchange', text: '', date: '2026-10-20T14:00:00.000Z' },
    ])
    expect(callBriefFacts({ last_exchange: { at: 'pas une date', subject: 'x' } })).toEqual([])
  })

  it('une date d’envoi illisible ne fait pas de ligne', () => {
    expect(callBriefFacts({ email_sent_at: 'pas une date' })).toEqual([])
  })

  // #4525.2 — « pourquoi ce contact » vivait dans la page dédiée retirée : il passe dans l'onglet.
  it('#4525.2 — « pourquoi ce contact », quand la fiche le sait, ouvre la liste ; blanc, aucune ligne', () => {
    const facts = callBriefFacts({
      why_contact: ' Pilote la reprise des données SAP ',
      key_points: ['Répond avant 10 h'],
    })
    expect(facts.map(fact => fact.kind)).toEqual(['why', 'key_point'])
    expect(facts[0]).toEqual({ kind: 'why', text: 'Pilote la reprise des données SAP', date: null })
    expect(callBriefFacts({ why_contact: '   ' })).toEqual([])
  })
})

describe('#4525.5 — latestExchange : le dernier échange de la timeline', () => {
  const activity = (kind: string, occurredAt: string, subject: string | null = null) => ({ kind, occurredAt, subject })

  it('le plus récent des échanges (appel, rendez-vous, e-mail, LinkedIn), jamais une note pour soi', () => {
    expect(
      latestExchange([
        activity('email', '2026-10-10T09:00:00.000Z', 'Premier'),
        activity('note', '2026-10-25T09:00:00.000Z', 'Pour moi'),
        activity('call', '2026-10-20T09:00:00.000Z', 'Point reprise'),
      ] as never),
    ).toEqual({ at: '2026-10-20T09:00:00.000Z', subject: 'Point reprise' })
  })

  it('aucun échange, ou une timeline pas encore lue : null (aucune ligne, jamais une date devinée)', () => {
    expect(latestExchange([activity('note', '2026-10-25T09:00:00.000Z')] as never)).toBeNull()
    expect(latestExchange(undefined)).toBeNull()
  })
})

describe('#4975.1 — splitCallScript : l’ouverture ne porte aucune objection', () => {
  const rest = 'Accroche — « Bonjour Marie. »\nSujet — « Votre migration. »'

  it('format démo « Objection — … Réponse — … » : sortie de l’ouverture, rangée en objection', () => {
    const script = `${rest}\nObjection — « Nous avons déjà un prestataire. » Réponse — « Je viens compléter. »\nDemande — « Vingt minutes ? »`
    const out = splitCallScript(script)
    expect(out.opening).toBe(`${rest}\nDemande — « Vingt minutes ? »`)
    expect(out.opening).not.toContain('Objection')
    expect(out.objections).toEqual([{ objection: 'Nous avons déjà un prestataire.', response: 'Je viens compléter.' }])
  })

  it('format « Objection : … Réponse : … » sur deux lignes', () => {
    const out = splitCallScript(`${rest}\nObjection : Pas de budget.\nRéponse : On commence petit.`)
    expect(out.opening).toBe(rest)
    expect(out.objections).toEqual([{ objection: 'Pas de budget.', response: 'On commence petit.' }])
  })

  it('un script sans objection reste intact, sans objection inventée', () => {
    expect(splitCallScript(rest)).toEqual({ opening: rest, objections: [] })
  })
})
