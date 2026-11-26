import { describe, expect, it } from 'vitest'
import {
  MEETING_BRIEF_BLOCKS,
  MEETING_BRIEF_DERIVED_FROM,
  MEETING_BRIEF_READING_ORDER,
  MEETING_TYPES,
  buildMeetingBrief,
  deriveMeetingObjective,
  deriveMeetingQuestions,
  describeGround,
} from './meeting-brief.js'
import {
  MEETING_PITCH_MAX_SENTENCES,
  MEETING_PITCH_MIN_SENTENCES,
  REX_MAX_ITEMS,
  deriveMeetingFlow,
  deriveMeetingPitch,
  deriveR1Recap,
  isRexDocumentCategory,
  selectRex,
} from './meeting-r1-r2.js'

// #4424.1 — le contrat : deux types de rendez-vous et quatre blocs, AJOUTÉS.
describe('#4424.1 — R1, R2 et leurs blocs dans le contrat', () => {
  it('ajoute r1_discovery et r2_workshop EN FIN, sans retirer aucun type (GA-08)', () => {
    // #2102.35/.36 — deux types sont venus s'ajouter APRÈS eux : l'ordre relatif ne bouge pas.
    expect(MEETING_TYPES.slice(-4, -2)).toEqual(['r1_discovery', 'r2_workshop'])
    expect(MEETING_TYPES.slice(0, 10)).toContain('procurement')
    expect(MEETING_TYPES).toHaveLength(14)
  })

  it('ajoute les blocs rex, workshop_proposal, pitch et r1_recap EN FIN', () => {
    expect(MEETING_BRIEF_BLOCKS.slice(-4)).toEqual(['rex', 'workshop_proposal', 'pitch', 'r1_recap'])
    // Chaque bloc a un rang de lecture — sinon le tri rendrait NaN.
    for (const key of MEETING_BRIEF_BLOCKS) expect(MEETING_BRIEF_READING_ORDER).toContain(key)
    expect(MEETING_BRIEF_READING_ORDER).toHaveLength(MEETING_BRIEF_BLOCKS.length)
  })

  it('le pitch se lit juste après QUI, la reprise du R1 juste après l’historique', () => {
    const at = (key: (typeof MEETING_BRIEF_BLOCKS)[number]) => MEETING_BRIEF_READING_ORDER.indexOf(key)
    expect(at('pitch')).toBe(at('who') + 1)
    expect(at('r1_recap')).toBe(at('history') + 1)
    expect(at('workshop_proposal')).toBeLessThan(at('outcome'))
  })

  it('un R1 a un objectif : écouter, qualifier, obtenir l’atelier', () => {
    expect(deriveMeetingObjective({ meetingType: 'r1_discovery' })).toEqual({
      stance: 'listen_not_pitch',
      outcomes: ['qualify_need', 'book_workshop'],
    })
  })

  it('un R2 a un objectif : cadrer le besoin, briefer les opportunités, fixer la suite', () => {
    expect(deriveMeetingObjective({ meetingType: 'r2_workshop' })).toEqual({
      stance: 'frame_not_present',
      outcomes: ['frame_workshop_need', 'brief_opportunities', 'agree_next_step'],
    })
  })

  it('les questions d’un R1 et d’un R2 viennent de la banque existante, jamais vides', () => {
    expect(deriveMeetingQuestions({ meetingType: 'r1_discovery' }).length).toBeGreaterThanOrEqual(3)
    expect(deriveMeetingQuestions({ meetingType: 'r2_workshop' }).length).toBeGreaterThanOrEqual(3)
    expect(deriveMeetingQuestions({ meetingType: 'r1_discovery' })).not.toEqual(
      deriveMeetingQuestions({ meetingType: 'r2_workshop' }),
    )
  })

  it('les nouvelles origines dérivées existent (profil ESN, rendez-vous précédent)', () => {
    expect(MEETING_BRIEF_DERIVED_FROM).toContain('esn_profile')
    expect(MEETING_BRIEF_DERIVED_FROM).toContain('prior_meeting')
  })
})

// #4424.2 — le déroulé d'un R1 : ouverture → REX → découverte → atelier.
describe('#4424.2 — le déroulé du R1 et ses REX', () => {
  it('un R1 se déroule en quatre temps, dans l’ordre de la décision du 21/10', () => {
    expect(deriveMeetingFlow('r1_discovery')).toEqual(['opening', 'rex', 'discovery', 'workshop_proposal'])
  })

  it('un type sans déroulé dédié n’en reçoit pas un inventé', () => {
    expect(deriveMeetingFlow('first_contact')).toEqual([])
    expect(deriveMeetingFlow(null)).toEqual([])
  })

  it('les REX viennent des missions, des documents « preuve client » et des références du profil', () => {
    const rex = selectRex({
      missions: [{ label: 'Refonte data — Banque Alpha', date: '2026-05-01' }],
      documents: [{ label: 'Cas client : migration cloud', date: '2026-07-10' }],
      references: ['Programme cyber pour un assureur'],
    })
    expect(rex.kind).toBe('found')
    if (rex.kind !== 'found') return
    expect(rex.items.map(item => item.kind)).toEqual(['document', 'mission', 'reference'])
    expect(rex.observedAt).toBe('2026-07-10')
  })

  it('au plus trois REX, sans doublon, les plus récents d’abord', () => {
    const rex = selectRex({
      missions: [
        { label: 'Mission A', date: '2025-01-01' },
        { label: 'Mission B', date: '2026-01-01' },
        { label: 'mission b', date: '2026-02-01' },
      ],
      documents: [{ label: 'Doc C', date: '2024-01-01' }],
      references: ['Ref D'],
    })
    if (rex.kind !== 'found') throw new Error('attendu : found')
    expect(rex.items).toHaveLength(REX_MAX_ITEMS)
    expect(rex.items.map(item => item.label)).toEqual(['mission b', 'Mission A', 'Doc C'])
  })

  it('aucun REX dans l’espace ⇒ « none », jamais un REX inventé', () => {
    expect(selectRex({ missions: [], documents: [], references: ['  '] })).toEqual({ kind: 'none' })
  })

  it('des références seules (non datées) restent des REX, sans date de source', () => {
    const rex = selectRex({ missions: [], documents: [], references: ['Ref seule'] })
    expect(rex).toEqual({
      kind: 'found',
      items: [{ kind: 'reference', label: 'Ref seule', date: null }],
      observedAt: null,
    })
  })

  it('seules les catégories de preuve client comptent comme REX documentaire', () => {
    expect(isRexDocumentCategory('client_proof')).toBe(true)
    expect(isRexDocumentCategory('case_study')).toBe(true)
    expect(isRexDocumentCategory('sector_insight')).toBe(false)
    expect(isRexDocumentCategory(null)).toBe(false)
  })
})

// #4424.3 — un R2 reprend le R1, ou dit qu'il n'en connaît pas.
describe('#4424.3 — la reprise du R1 dans un R2', () => {
  it('un R2 se déroule en quatre temps : besoin, cadrage, opportunités, suite', () => {
    expect(deriveMeetingFlow('r2_workshop')).toEqual(['client_need', 'framing', 'opportunities_brief', 'next_step'])
  })

  it('avec un R1 noté : le compte rendu le plus récent AVANT ce rendez-vous, et les besoins nés depuis', () => {
    const recap = deriveR1Recap({
      meetingStart: '2026-10-25T09:00:00.000Z',
      recaps: [
        { label: 'CR du premier RDV : budget data 2027', date: '2026-10-10T10:00:00.000Z' },
        { label: 'CR ancien', date: '2026-01-10T10:00:00.000Z' },
        { label: 'CR APRÈS le rendez-vous', date: '2026-10-26T10:00:00.000Z' },
      ],
      needs: [
        { label: 'Lead data senior', date: '2026-10-11' },
        { label: 'Besoin ancien', date: '2025-06-01' },
      ],
    })
    expect(recap).toEqual({
      kind: 'found',
      recap: { label: 'CR du premier RDV : budget data 2027', date: '2026-10-10T10:00:00.000Z' },
      needsSince: [{ label: 'Lead data senior', date: '2026-10-11' }],
    })
  })

  it('sans R1 connu : « none », que l’écran DIT', () => {
    expect(deriveR1Recap({ meetingStart: '2026-10-25T09:00:00.000Z', recaps: [], needs: [] })).toEqual({
      kind: 'none',
    })
  })

  it('des comptes rendus illisibles ne valent pas « aucun R1 »', () => {
    expect(deriveR1Recap({ meetingStart: '2026-10-25T09:00:00.000Z', recaps: null, needs: null })).toEqual({
      kind: 'unread',
    })
  })
})

// #4424.4 — le pitch : 3 à 5 phrases, offre de l'ESN × enjeu du compte.
describe('#4424.4 — le pitch de réunion', () => {
  const profile = { esnName: 'DataCraft', offers: ['Data', 'Cloud'] }

  it('sans profil d’offre : « no_profile », jamais un pitch générique', () => {
    expect(
      deriveMeetingPitch({ esnName: null, offers: [], stakes: ['x'], rex: null, accountName: 'A', meetingType: null }),
    ).toEqual({ kind: 'no_profile' })
    expect(
      deriveMeetingPitch({
        esnName: 'DataCraft',
        offers: [' '],
        stakes: [],
        rex: null,
        accountName: 'A',
        meetingType: null,
      }),
    ).toEqual({ kind: 'no_profile' })
  })

  it('profil + enjeu + REX : cinq phrases, l’enjeu du compte et l’offre de l’ESN y figurent', () => {
    const pitch = deriveMeetingPitch({
      ...profile,
      stakes: ['Moderniser la plateforme data'],
      rex: { kind: 'mission', label: 'Refonte data — Banque Alpha', date: '2026-05-01' },
      accountName: 'Acme',
      meetingType: 'r1_discovery',
    })
    if (pitch.kind !== 'ready') throw new Error('attendu : ready')
    expect(pitch.sentences.map(s => s.key)).toEqual(['who', 'stake', 'answer', 'proof', 'ask_workshop'])
    expect(pitch.sentences[0]?.values).toEqual({ esn: 'DataCraft', offers: 'Data, Cloud' })
    expect(pitch.sentences[1]?.values).toEqual({ account: 'Acme', stake: 'Moderniser la plateforme data' })
  })

  it('profil seul, sans enjeu ni REX : trois phrases au moins', () => {
    const pitch = deriveMeetingPitch({ ...profile, stakes: [], rex: null, accountName: null, meetingType: null })
    if (pitch.kind !== 'ready') throw new Error('attendu : ready')
    expect(pitch.sentences.map(s => s.key)).toEqual(['who', 'answer_no_stake', 'ask'])
    expect(pitch.sentences.length).toBeGreaterThanOrEqual(MEETING_PITCH_MIN_SENTENCES)
  })

  it('jamais plus de cinq phrases, quel que soit le type', () => {
    for (const meetingType of [...MEETING_TYPES, null]) {
      const pitch = deriveMeetingPitch({
        ...profile,
        stakes: ['a', 'b', 'c'],
        rex: { kind: 'reference', label: 'r', date: null },
        accountName: 'Acme',
        meetingType,
      })
      if (pitch.kind !== 'ready') throw new Error('attendu : ready')
      expect(pitch.sentences.length).toBeLessThanOrEqual(MEETING_PITCH_MAX_SENTENCES)
      expect(pitch.sentences.length).toBeGreaterThanOrEqual(MEETING_PITCH_MIN_SENTENCES)
    }
  })

  it('un R2 se clôt sur la prochaine étape, pas sur un atelier déjà tenu', () => {
    const pitch = deriveMeetingPitch({
      ...profile,
      stakes: [],
      rex: null,
      accountName: 'A',
      meetingType: 'r2_workshop',
    })
    if (pitch.kind !== 'ready') throw new Error('attendu : ready')
    expect(pitch.sentences.at(-1)?.key).toBe('ask_next_step')
  })

  it('les nouveaux blocs passent l’assembleur avec une origine dérivée', () => {
    const brief = buildMeetingBrief([
      { key: 'r1_recap', lines: ['x'], ground: describeGround({ derivedFrom: ['prior_meeting'] }) },
      { key: 'pitch', lines: ['y'], ground: describeGround({ derivedFrom: ['esn_profile'] }) },
      { key: 'who', lines: ['z'], ground: describeGround({ inferred: true }) },
    ])
    expect(brief.map(block => block.key)).toEqual(['who', 'pitch', 'r1_recap'])
  })
})
