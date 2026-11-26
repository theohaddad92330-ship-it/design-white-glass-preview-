import { describe, expect, it } from 'vitest'
import {
  OUTREACH_INTENTS,
  OUTREACH_MESSAGE_CHANNELS,
  OUTREACH_SURFACES,
  callTaskNextStatuses,
  canonicalSequenceStatus,
  checkOutreachTransition,
  createOutreachCallTaskRequestSchema,
  isMinorOutreachEdit,
  outreachApprovalView,
  outreachBlockerSchema,
  outreachCallTaskStatusSchema,
  outreachContentBlockers,
  outreachContextBlockers,
  OUTREACH_CHANNEL_MAX_CHARS,
  OUTREACH_CHANNEL_MAX_WORDS,
  type OutreachContextInput,
  outreachMessageStatusSchema,
  outreachSequenceCanonicalStatusSchema,
  outreachTextDiff,
} from './outreach-canonical.js'

// #2366.5 — les gestes offerts à l'écran sont EXACTEMENT les transitions
// que le serveur accepte : chaque état proposé passe `checkOutreachTransition`.
describe('callTaskNextStatuses — la même table que le serveur', () => {
  it('après un appel commencé : les six issues, et rien d’autre', () => {
    expect(callTaskNextStatuses('started')).toEqual([
      'completed',
      'no_answer',
      'wrong_person',
      'callback',
      'qualified',
      'refused',
    ])
    expect(callTaskNextStatuses('qualified')).toEqual([])
  })

  it('chaque état offert est accepté par le serveur, depuis chacun des douze', () => {
    for (const from of outreachCallTaskStatusSchema.options) {
      for (const to of callTaskNextStatuses(from)) {
        expect(checkOutreachTransition('call_task', from, to, 'user'), `${from} → ${to}`).toEqual({ ok: true })
      }
    }
  })
})

// #2366.3/.4/.5/.6/.8 — le modèle canonique et ses machines d'états.
describe('outreach canonique — les trois machines', () => {
  it('nomme les quinze états du message, les douze de l’appel, les onze de la séquence (#2366.4/.5/.6)', () => {
    expect(outreachMessageStatusSchema.options).toEqual([
      'idea',
      'drafting',
      'drafted',
      'needs_review',
      'approved',
      'scheduled',
      'sending',
      'sent',
      'delivered',
      'bounced',
      'replied',
      'failed',
      'cancelled',
      'expired',
      'copied_manual',
    ])
    expect(outreachCallTaskStatusSchema.options).toHaveLength(12)
    expect(outreachCallTaskStatusSchema.options).toContain('no_answer')
    expect(outreachCallTaskStatusSchema.options).toContain('callback')
    expect(outreachSequenceCanonicalStatusSchema.options).toHaveLength(11)
    expect(outreachSequenceCanonicalStatusSchema.options).toContain('waiting_for_connection')
    expect(OUTREACH_INTENTS).toHaveLength(13)
    // #2947/#2204.28 — « Référencement » : demander à être recommandé auprès
    // d'un tiers, ajouté en fin de liste (GA-08).
    expect(OUTREACH_INTENTS.at(-1)).toBe('get_referral')
    expect(OUTREACH_SURFACES).toHaveLength(11)
    // #2947/#2204.41 puis #2204.40 — « Voicemail/note d'appel » puis « Message
    // de recommandation », ajoutés en fin de liste dans cet ordre (GA-08).
    expect(OUTREACH_MESSAGE_CHANNELS).toContain('voicemail')
    // #2370 — les huit canaux suivants s'ajoutent APRÈS (bloc dédié en fin de fichier).
    expect(OUTREACH_MESSAGE_CHANNELS.indexOf('recommendation')).toBe(5)
  })

  it('« Préparé n’est jamais envoyé », « Validé n’est jamais exécuté » (#2366.4)', () => {
    expect(checkOutreachTransition('message', 'drafted', 'sent', 'user')).toEqual({ ok: false, reason: 'not_allowed' })
    expect(checkOutreachTransition('message', 'approved', 'sent', 'user')).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
    expect(checkOutreachTransition('message', 'sent', 'delivered', 'system')).toEqual({
      ok: false,
      reason: 'proof_required',
    })
    expect(checkOutreachTransition('message', 'sent', 'delivered', 'system', { receipt: 'x' })).toEqual({ ok: true })
  })

  it('aucune transition sensible n’est produite par le modèle seul (#2366.8)', () => {
    expect(checkOutreachTransition('message', 'needs_review', 'approved', 'model')).toEqual({
      ok: false,
      reason: 'model_forbidden',
    })
    expect(checkOutreachTransition('message', 'drafting', 'drafted', 'model')).toEqual({ ok: true })
    expect(checkOutreachTransition('message', 'needs_review', 'approved', 'user')).toEqual({ ok: true })
  })

  it('l’appel a sa propre machine, distincte du message (#2366.5)', () => {
    expect(checkOutreachTransition('call_task', 'started', 'no_answer', 'user')).toEqual({ ok: true })
    expect(checkOutreachTransition('call_task', 'no_answer', 'callback', 'user')).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
    expect(checkOutreachTransition('call_task', 'proposed', 'qualified', 'user')).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
  })

  it('la séquence lit son statut canonique depuis le stockage existant, sans renommer (#2366.6)', () => {
    expect(canonicalSequenceStatus('active', 'awaiting_connection')).toBe('waiting_for_connection')
    expect(canonicalSequenceStatus('active', 'prepared')).toBe('ready')
    expect(canonicalSequenceStatus('active', 'awaiting_validation')).toBe('needs_review')
    expect(canonicalSequenceStatus('active', 'responded')).toBe('stopped')
    expect(canonicalSequenceStatus('cancelled', 'cancelled')).toBe('stopped')
    expect(canonicalSequenceStatus('paused', 'paused')).toBe('paused')
  })
})

describe('outreach canonique — révision et centre d’approbation', () => {
  it('une retouche d’espaces est mineure, un mot changé ne l’est pas (#2382.6)', () => {
    expect(
      isMinorOutreachEdit(
        { subject: 'Bonjour', body: 'Ligne 1\n\nLigne 2' },
        { subject: 'Bonjour ', body: 'Ligne 1\nLigne 2 ' },
      ),
    ).toBe(true)
    expect(isMinorOutreachEdit({ subject: 'Bonjour', body: 'Ligne 1' }, { subject: 'Bonjour', body: 'Ligne 2' })).toBe(
      false,
    )
  })

  it('range chaque message dans UNE des sept vues (#2382.1)', () => {
    const base = { blockers: [], edited_by_user: false }
    expect(outreachApprovalView({ ...base, status: 'needs_review' })).toBe('to_review')
    expect(outreachApprovalView({ ...base, status: 'needs_review', edited_by_user: true })).toBe('modified')
    expect(outreachApprovalView({ status: 'needs_review', blockers: ['opted_out'], edited_by_user: false })).toBe(
      'blocked',
    )
    expect(outreachApprovalView({ ...base, status: 'approved' })).toBe('ready')
    expect(outreachApprovalView({ ...base, status: 'scheduled' })).toBe('scheduled')
    expect(outreachApprovalView({ ...base, status: 'copied_manual' })).toBe('executed')
    expect(outreachApprovalView({ ...base, status: 'bounced' })).toBe('failed')
    expect(outreachApprovalView({ ...base, status: 'cancelled' })).toBeNull()
  })

  it('le diff nomme les lignes ajoutées et retirées (#2382.3)', () => {
    const diff = outreachTextDiff(
      'Bonjour\nNous avons une mission.\nCordialement',
      'Bonjour\nVotre DSI recrute.\nCordialement',
    )
    expect(diff).toEqual([
      { op: 'same', text: 'Bonjour' },
      { op: 'removed', text: 'Nous avons une mission.' },
      { op: 'added', text: 'Votre DSI recrute.' },
      { op: 'same', text: 'Cordialement' },
    ])
  })
})

// #3419/#3420 (30/09/2026, lot C16) — les cinq bloquants mesurés sur le texte,
// tirés mot pour mot des retours bêta.
describe('outreachContentBlockers — vérification factuelle et contrôle qualité (#3419/#3420)', () => {
  const clean = { body: 'Bonjour Marie,\nVotre DSI recrute.', accountName: 'Acme', contactName: 'Marie Dubois' }
  const bare = { accountName: null, contactName: null }

  it('ne bloque rien sur un message propre', () => {
    expect(outreachContentBlockers(clean)).toEqual([])
  })

  it('bloque une affirmation de relation non prouvée (#3419.2, exemples 1/2/3/8)', () => {
    expect(outreachContentBlockers({ ...bare, body: 'Nous travaillons déjà avec votre groupe.' })).toEqual([
      'unverified_relationship_claim',
    ])
    expect(outreachContentBlockers({ ...bare, body: 'Nous sommes référencés chez vous.' })).toEqual([
      'unverified_relationship_claim',
    ])
    expect(outreachContentBlockers({ ...bare, body: 'Jean Dupont m’a recommandé de vous contacter.' })).toEqual([
      'unverified_relationship_claim',
    ])
    expect(outreachContentBlockers({ ...bare, body: 'Cette ESN intervient encore chez vous.' })).toEqual([
      'unverified_relationship_claim',
    ])
  })

  it('bloque une affirmation factuelle non prouvée (#3419.2, exemples 4/7)', () => {
    expect(outreachContentBlockers({ ...bare, body: 'Votre projet Atlas recrute.' })).toEqual(['unverifiable_claim'])
    expect(outreachContentBlockers({ ...bare, body: 'Notre consultant est disponible dès lundi.' })).toEqual([
      'unverifiable_claim',
    ])
  })

  it('ne bloque PAS un « recrute » générique sans le mot « projet » — catalogue étroit à dessein', () => {
    expect(outreachContentBlockers({ ...clean, body: 'Bonjour Marie,\nVotre DSI recrute.' })).toEqual([])
  })

  it('bloque le message générique — le test de substitution mot pour mot (#3420.2)', () => {
    expect(
      outreachContentBlockers({
        body: 'Bonjour,\nNous accompagnons des DSI sur leurs projets.',
        accountName: 'Acme',
        contactName: 'Marie Dubois',
      }),
    ).toEqual(['generic_message'])
  })

  it('ne bloque pas la généricité quand le compte ou le contact est nommé', () => {
    expect(outreachContentBlockers({ ...clean, body: 'Bonjour Marie, ravi de vous croiser.' })).toEqual([])
    expect(
      outreachContentBlockers({ body: 'J’ai vu qu’Acme recrute.', accountName: 'Acme', contactName: null }),
    ).toEqual([])
  })

  it('bloque plus d’une question — « une seule question facile » (#3420)', () => {
    expect(outreachContentBlockers({ ...clean, body: 'Bonjour Marie,\nÇa va ? Et le projet Atlas ?' })).toEqual([
      'multiple_asks',
    ])
  })

  it('bloque le jargon corporate et la fausse proximité (#3420)', () => {
    expect(outreachContentBlockers({ ...bare, body: 'Nous sommes le leader du marché.' })).toEqual(['corporate_jargon'])
    expect(outreachContentBlockers({ ...bare, body: 'J’espère que vous allez bien.' })).toEqual(['corporate_jargon'])
  })

  it('cumule les bloquants quand plusieurs règles matchent', () => {
    expect(
      outreachContentBlockers({
        body: 'J’espère que vous allez bien. Nous sommes référencés chez vous. Ça vous va ? Et jeudi ?',
        accountName: 'Acme',
        contactName: null,
      }),
    ).toEqual(['unverified_relationship_claim', 'generic_message', 'multiple_asks', 'corporate_jargon'])
  })

  it('les cinq bloquants sont dans le contrat public, en fin de liste (GA-08)', () => {
    // Les huit du lot Q06 (#3420) viennent APRÈS, dans l'ordre de leur ajout.
    expect(outreachBlockerSchema.options.at(-1)).toBe('unverified_tech_claim') // #3419.2, lot Z08
    expect(outreachBlockerSchema.options.slice(-9, -1)).toEqual([
      'wrong_recipient',
      'relationship_scenario_mismatch',
      'scope_unclear',
      'no_next_step',
      'contradicts_history',
      'sequence_inconsistent',
      'too_long_for_channel',
      'forced_meeting',
    ])
    expect(outreachBlockerSchema.options.slice(-14, -9)).toEqual([
      'unverified_relationship_claim',
      'unverifiable_claim',
      'generic_message',
      'multiple_asks',
      'corporate_jargon',
    ])
  })
})

// #2395.8 — objectif ET résultat attendu, jamais un verbe seul.
describe('createOutreachCallTaskRequestSchema — #2395.8', () => {
  const base = {
    contact_id: '11111111-1111-4111-8111-111111111111',
    source: 'contacts' as const,
    reason: 'Relance après silence',
    objective: 'Fixer un rendez-vous',
    expected_outcome: 'Une date de rendez-vous confirmée',
  }

  it('accepte une tâche d’appel qui porte les deux champs', () => {
    expect(createOutreachCallTaskRequestSchema.safeParse(base).success).toBe(true)
  })

  it('refuse un résultat attendu absent — l’objectif seul ne suffit plus', () => {
    const { expected_outcome: _omit, ...withoutExpectedOutcome } = base
    expect(createOutreachCallTaskRequestSchema.safeParse(withoutExpectedOutcome).success).toBe(false)
  })

  it('refuse un résultat attendu vide (espaces seuls)', () => {
    expect(createOutreachCallTaskRequestSchema.safeParse({ ...base, expected_outcome: '   ' }).success).toBe(false)
  })
})

// #3420 (lot Q06, 30/09) — les huit critères qui restaient, mesurés sur le
// CONTEXTE (destinataire, historique, séquence, canal) que le serveur connaît
// — pas sur un jugement sémantique. Un critère dont le contexte manque ne se
// devine pas : il ne bloque rien.
describe('outreachContextBlockers — les critères de contexte (#3420 lot Q06)', () => {
  const base: OutreachContextInput = {
    body: 'Bonjour Marie,\nVotre migration cloud chez Acme m’a fait penser à notre retour d’expérience. Seriez-vous ouverte à en parler ?',
    channel: 'email',
    intent: 'open_relationship',
    contactName: 'Marie Dubois',
    contactStatus: 'new',
    priorContactedCount: 0,
    accountAnchors: ['migration cloud'],
    siblingBodies: [],
    sequencePosition: null,
    verifiedTechStack: [],
  }
  const blockersOf = (over: Partial<OutreachContextInput>) => outreachContextBlockers({ ...base, ...over })

  it('ne bloque rien sur un message propre', () => {
    expect(blockersOf({})).toEqual([])
  })

  // — #3419.2 « vous utilisez telle technologie » : bloqué sans preuve
  it('#3419.2 bloque « vous utilisez SAP » quand aucune stack vérifiée ne le porte', () => {
    const body = base.body.replace('Votre migration', 'Vous utilisez SAP, et votre migration')
    expect(blockersOf({ body })).toEqual(['unverified_tech_claim'])
    expect(blockersOf({ body, verifiedTechStack: ['Salesforce'] })).toEqual(['unverified_tech_claim'])
  })
  it('#3419.2 laisse passer la même phrase quand l’enrichissement confirme la technologie', () => {
    const body = base.body.replace('Votre migration', 'Vous utilisez SAP, et votre migration')
    expect(blockersOf({ body, verifiedTechStack: ['sap', 'AWS'] })).toEqual([])
  })
  it('#3419.2 ne bloque pas un « vous utilisez » sans technologie nommée', () => {
    const body = base.body.replace('Votre migration', 'Vous utilisez déjà des prestataires, et votre migration')
    expect(blockersOf({ body })).toEqual([])
  })

  // — #3420.1 bon interlocuteur
  it('#1 bloque un message qui salue une AUTRE personne que son destinataire', () => {
    expect(blockersOf({ body: base.body.replace('Marie', 'Karim') })).toEqual(['wrong_recipient'])
  })
  it('#1 accepte le prénom, le nom ou « Madame Dubois »', () => {
    expect(blockersOf({ body: base.body.replace('Bonjour Marie', 'Bonjour Madame Dubois') })).toEqual([])
    expect(blockersOf({ body: base.body.replace('Marie', 'Dubois') })).toEqual([])
  })
  it('#1 ne juge pas un salut sans nom ni un destinataire inconnu', () => {
    expect(blockersOf({ body: base.body.replace('Bonjour Marie,', 'Bonjour,') })).toEqual([])
    expect(blockersOf({ body: base.body.replace('Marie', 'Karim'), contactName: null })).toEqual([])
  })

  // — #3420.2 scénario relationnel
  it('#2 bloque une OUVERTURE à quelqu’un qui a déjà répondu ou qu’on a déjà contacté', () => {
    expect(blockersOf({ contactStatus: 'replied' })).toEqual(['relationship_scenario_mismatch'])
    expect(blockersOf({ priorContactedCount: 1 })).toEqual(['relationship_scenario_mismatch'])
  })
  it('#2 bloque une RELANCE sans aucun premier contact', () => {
    expect(blockersOf({ intent: 'follow_up' })).toEqual(['relationship_scenario_mismatch'])
    expect(blockersOf({ intent: 'follow_up', priorContactedCount: 1, contactStatus: 'contacted' })).toEqual([])
  })

  // — #3420.3 périmètre précis
  it('#3 bloque un message qui ne cite rien du contexte connu du compte', () => {
    expect(blockersOf({ body: 'Bonjour Marie,\nNous aidons les DSI. Seriez-vous ouverte à en parler ?' })).toEqual([
      'scope_unclear',
    ])
  })
  // #4399.7 — recette prod 22/10 (contact Luca Dominicis) : le message cite bien le fait, mais
  // sous une autre forme (« recrute » pour « recrutement », singulier pour pluriel).
  it('#4399.7 ne bloque pas un message qui cite le fait sous une autre forme du même mot', () => {
    const body = 'Bonjour Marie,\nVotre équipe recrute chez Acme. Seriez-vous ouverte à en parler ?'
    expect(blockersOf({ body, accountAnchors: ['Recrutement'] })).toEqual([])
    const plural = 'Bonjour Marie,\nVotre service numérique m’a fait penser à nous. Seriez-vous ouverte à en parler ?'
    expect(blockersOf({ body: plural, accountAnchors: ['Services numériques'] })).toEqual([])
  })
  it('#4399.7 bloque toujours un message qui ne cite rien, même quand deux mots partagent leurs premières lettres', () => {
    const body = 'Bonjour Marie,\nNous aidons les DSI à migrer. Seriez-vous ouverte à en parler ?'
    expect(blockersOf({ body, accountAnchors: ['Recrutement'] })).toEqual(['scope_unclear'])
  })
  it('#3 ne juge pas quand le compte n’a AUCUN contexte connu — non évaluable, pas bloquant', () => {
    expect(
      blockersOf({
        body: 'Bonjour Marie,\nNous aidons les DSI. Seriez-vous ouverte à en parler ?',
        accountAnchors: [],
      }),
    ).toEqual([])
  })

  // — #3420.8 prochaine étape adaptée
  it('#8 bloque un message sans aucune prochaine étape', () => {
    expect(blockersOf({ body: 'Bonjour Marie,\nVotre migration cloud chez Acme est un beau chantier.' })).toEqual([
      'no_next_step',
    ])
  })
  it('#8 n’exige pas de demande d’un message de nurturing', () => {
    expect(
      blockersOf({
        intent: 'nurture',
        priorContactedCount: 2,
        contactStatus: 'contacted',
        body: 'Bonjour Marie,\nVotre migration cloud chez Acme a fait l’objet d’un bel article.',
      }),
    ).toEqual([])
  })

  // — #3420.9 cohérence avec l'historique
  it('#9 bloque tout message à quelqu’un qui a refusé — pas de relance après un refus ferme', () => {
    expect(blockersOf({ contactStatus: 'refused', priorContactedCount: 1, intent: 'follow_up' })).toEqual([
      'contradicts_history',
    ])
  })
  it('#9 bloque « suite à notre échange » quand l’historique n’en porte aucun', () => {
    expect(
      blockersOf({
        body: base.body.replace('Bonjour Marie,', 'Bonjour Marie,\nSuite à notre échange de la semaine dernière,'),
      }),
    ).toEqual(['contradicts_history'])
    expect(
      blockersOf({
        body: base.body.replace('Bonjour Marie,', 'Bonjour Marie,\nSuite à notre échange,'),
        contactStatus: 'replied',
        intent: 'follow_up',
        priorContactedCount: 1,
      }),
    ).toEqual([])
  })

  // — #3420.10 cohérence entre les messages de la séquence
  it('#10 bloque une étape qui répète mot pour mot une autre étape de la séquence', () => {
    expect(
      blockersOf({
        sequencePosition: 1,
        siblingBodies: [base.body],
        priorContactedCount: 1,
        contactStatus: 'contacted',
        intent: 'follow_up',
      }),
    ).toEqual(['sequence_inconsistent'])
  })
  it('#10 bloque une RE-PRÉSENTATION à la seconde étape', () => {
    expect(
      blockersOf({
        sequencePosition: 1,
        priorContactedCount: 1,
        contactStatus: 'contacted',
        intent: 'follow_up',
        body: 'Bonjour Marie,\nJe me permets de vous contacter au sujet de votre migration cloud. Seriez-vous ouverte à en parler ?',
      }),
    ).toEqual(['sequence_inconsistent'])
  })

  // — #3420.11 longueur adaptée au canal
  it('#11 bloque un message plus long que le plafond de son canal, un seul tableau pour les canaux', () => {
    const long = `${base.body} ${'mot '.repeat(160)}`
    expect(blockersOf({ body: long })).toEqual(['too_long_for_channel'])
    expect(blockersOf({ body: long, channel: 'manual' })).toEqual([])
    expect(OUTREACH_CHANNEL_MAX_WORDS.email).toBeGreaterThan(OUTREACH_CHANNEL_MAX_WORDS.linkedin ?? 0)
  })

  // — #2370.linkedin_connection_note / #2370.sms — un plafond DUR en caractères, pas seulement en mots
  it('#2370 bloque une note de connexion LinkedIn de plus de 300 caractères, même courte en mots', () => {
    const note = `${base.body} ${'abcdefghij '.repeat(16)}`
    expect(note.length).toBeGreaterThan(300)
    expect(blockersOf({ body: note, channel: 'linkedin_connection_note' })).toContain('too_long_for_channel')
    expect(blockersOf({ body: base.body, channel: 'linkedin_connection_note' })).not.toContain('too_long_for_channel')
    expect(OUTREACH_CHANNEL_MAX_CHARS.linkedin_connection_note).toBe(300)
  })
  it('#2370 un SMS est court : au-delà de son plafond en caractères il est bloqué', () => {
    const sms = `${base.body} ${'abcdefghij '.repeat(4)}`
    expect(sms.length).toBeGreaterThan(OUTREACH_CHANNEL_MAX_CHARS.sms ?? Infinity)
    expect(blockersOf({ body: sms, channel: 'sms' })).toContain('too_long_for_channel')
  })

  // — #3420.13 pas de rendez-vous forcé au premier message
  it('#13 bloque un rendez-vous IMPOSÉ au premier message, pas une question polie', () => {
    expect(blockersOf({ body: `${base.body}\nJe vous propose un rendez-vous jeudi à 14 h.` })).toEqual([
      'forced_meeting',
    ])
    expect(
      blockersOf({
        body: base.body.replace('Seriez-vous ouverte à en parler ?', 'Seriez-vous disponible 20 minutes jeudi ?'),
      }),
    ).toEqual([])
  })
  it('#13 ne juge plus un rendez-vous proposé une fois la relation ouverte', () => {
    expect(
      blockersOf({
        body: `${base.body}\nJe vous propose un rendez-vous jeudi à 14 h.`,
        intent: 'follow_up',
        priorContactedCount: 1,
        contactStatus: 'replied',
      }),
    ).toEqual([])
  })
})

// #2370 (épopée #2947) — les canaux qui manquaient au contrat, ajoutés EN FIN (GA-08).
describe('OUTREACH_MESSAGE_CHANNELS — #2370', () => {
  it('porte les huit canaux de #2370, après les six existants et dans cet ordre', () => {
    expect(OUTREACH_MESSAGE_CHANNELS).toEqual([
      'email',
      'linkedin',
      'phone',
      'manual',
      'voicemail',
      'recommendation',
      'sms',
      'whatsapp',
      'task',
      'introduction_request',
      'partner_message',
      'follow_up_email',
      'profile_push',
      'linkedin_connection_note',
    ])
  })
  it('chaque canal a un plafond en mots déclaré (un nombre, ou null nommé), jamais oublié', () => {
    for (const channel of OUTREACH_MESSAGE_CHANNELS) expect(channel in OUTREACH_CHANNEL_MAX_WORDS).toBe(true)
  })
})
