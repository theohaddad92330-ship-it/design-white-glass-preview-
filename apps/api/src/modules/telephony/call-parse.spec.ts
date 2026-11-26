import {
  composeCallNote,
  parseAircallCall,
  parseAircallTranscript,
  parseAlloCall,
  parseAlloTranscript,
  parseRingoverCall,
} from './call-parse'

describe('parseAircallCall', () => {
  it('lit un appel complet', () => {
    const call = parseAircallCall({
      id: 987,
      direction: 'outbound',
      status: 'done',
      started_at: 1_754_200_000,
      answered_at: 1_754_200_010,
      duration: 245,
      raw_digits: '+33123456789',
      user: { name: 'Théo Haddad' },
      contact: { first_name: 'Marc', last_name: 'Dupuis', emails: [{ value: 'marc@acme.test' }] },
    })
    expect(call).toMatchObject({
      id: '987',
      provider: 'aircall',
      direction: 'outbound',
      counterpartNumber: '+33123456789',
      counterpartName: 'Marc Dupuis',
      counterpartEmail: 'marc@acme.test',
      agentName: 'Théo Haddad',
      durationSeconds: 245,
      answered: true,
    })
    expect(call?.startedAt).toBe(new Date(1_754_200_000_000).toISOString())
  })

  it('rend null sans identifiant — sans lui le journal CRM n’est plus idempotent', () => {
    expect(parseAircallCall({ direction: 'inbound' })).toBeNull()
  })

  it('une durée absente vaut null, jamais zéro', () => {
    expect(parseAircallCall({ id: '1' })?.durationSeconds).toBeNull()
  })

  it('un appel « done » sans heure de décroché reste inconnu, pas répondu', () => {
    expect(parseAircallCall({ id: '1', status: 'done' })?.answered).toBeNull()
  })

  it('un sens inconnu se dit inconnu', () => {
    expect(parseAircallCall({ id: '1', direction: 'weird' })?.direction).toBe('unknown')
  })
})

describe('parseRingoverCall', () => {
  it('prend le numéro de l’INTERLOCUTEUR selon le sens de l’appel', () => {
    const inbound = parseRingoverCall({
      call_id: 'a',
      type: 'in',
      from_number: '+33600000001',
      to_number: '+33100000000',
    })
    const outbound = parseRingoverCall({
      call_id: 'b',
      type: 'out',
      from_number: '+33100000000',
      to_number: '+33600000002',
    })
    expect(inbound?.counterpartNumber).toBe('+33600000001')
    expect(outbound?.counterpartNumber).toBe('+33600000002')
  })

  it('retombe sur cdr_id quand call_id manque', () => {
    expect(parseRingoverCall({ cdr_id: 42, type: 'out' })?.id).toBe('42')
  })

  it('lit la date en texte comme en secondes', () => {
    expect(parseRingoverCall({ call_id: 'a', start_time: '2026-08-01T09:00:00Z' })?.startedAt).toBe(
      '2026-08-01T09:00:00.000Z',
    )
  })

  it('un appel sans état ni décroché reste inconnu', () => {
    expect(parseRingoverCall({ call_id: 'a' })?.answered).toBeNull()
  })
})

describe('parseAircallTranscript', () => {
  it('assemble les tours de parole', () => {
    const text = parseAircallTranscript({
      transcription: {
        content: {
          utterances: [
            { participant_type: 'external', text: 'Bonjour' },
            { participant_type: 'internal', text: 'Bonjour, merci pour votre appel' },
          ],
        },
      },
    })
    expect(text).toBe('external : Bonjour\ninternal : Bonjour, merci pour votre appel')
  })

  it('rend null plutôt qu’une chaîne vide quand rien n’a été transcrit', () => {
    expect(parseAircallTranscript({ transcription: { content: { utterances: [] } } })).toBeNull()
    expect(parseAircallTranscript({})).toBeNull()
  })
})

describe('composeCallNote', () => {
  const base = {
    id: '1',
    provider: 'aircall' as const,
    direction: 'outbound' as const,
    counterpartNumber: '+33123456789',
    counterpartName: 'Marc Dupuis',
    counterpartEmail: null,
    agentName: 'Théo',
    startedAt: '2026-08-01T09:00:00.000Z',
    durationSeconds: 125,
    answered: true,
    transcript: null,
  }

  it('écrit ce que l’outil a dit, sans rien interpréter', () => {
    const note = composeCallNote(base)
    expect(note).toContain('Appel sortant — Marc Dupuis')
    expect(note).toContain('durée 2 min 5 s')
    expect(note).toContain('Théo')
  })

  it('n’écrit pas de durée quand elle est inconnue', () => {
    expect(composeCallNote({ ...base, durationSeconds: null })).not.toContain('durée')
  })

  it('dit « non décroché » seulement quand c’est établi', () => {
    expect(composeCallNote({ ...base, answered: false })).toContain('non décroché')
    expect(composeCallNote({ ...base, answered: null })).not.toContain('non décroché')
  })

  it('cite la transcription et la borne', () => {
    const long = 'a'.repeat(5000)
    const note = composeCallNote({ ...base, transcript: long })
    expect(note).toContain('Transcription (fournie par l’outil d’appel)')
    expect(note.length).toBeLessThan(4500)
    expect(note.endsWith('…')).toBe(true)
  })

  it('sait écrire en anglais', () => {
    expect(composeCallNote(base, { locale: 'en' })).toContain('Outbound call')
  })
})

describe('parseAlloCall', () => {
  it('lit un appel entrant complet', () => {
    const call = parseAlloCall({
      id: 'call_abc123',
      type: 'INBOUND',
      from_number: '+33612345678',
      to_number: '+33987654321',
      length_in_minutes: 2.5,
      start_date: '2026-09-20T10:00:00Z',
      result: 'ANSWERED',
    })
    expect(call).toMatchObject({
      id: 'call_abc123',
      provider: 'allo',
      direction: 'inbound',
      counterpartNumber: '+33612345678',
      durationSeconds: 150,
      answered: true,
    })
  })

  it('un appel sortant lit le numéro appelé comme interlocuteur', () => {
    const call = parseAlloCall({ id: '1', type: 'OUTBOUND', from_number: '+33987654321', to_number: '+33612345678' })
    expect(call?.direction).toBe('outbound')
    expect(call?.counterpartNumber).toBe('+33612345678')
  })

  it('rend null sans identifiant', () => {
    expect(parseAlloCall({ type: 'INBOUND' })).toBeNull()
  })

  it('sans `result` (non documenté sur GET /calls), `answered` reste inconnu', () => {
    expect(parseAlloCall({ id: '1' })?.answered).toBeNull()
  })

  it('une durée absente vaut null, jamais zéro', () => {
    expect(parseAlloCall({ id: '1' })?.durationSeconds).toBeNull()
  })
})

describe('parseAlloTranscript', () => {
  it('assemble les tours de parole avec leur source', () => {
    const text = parseAlloTranscript({
      transcript: [
        { source: 'agent', text: 'Bonjour' },
        { source: 'contact', text: 'Bonjour, je vous appelle pour…' },
      ],
    })
    expect(text).toBe('agent : Bonjour\ncontact : Bonjour, je vous appelle pour…')
  })

  it('rend null sans transcription', () => {
    expect(parseAlloTranscript({})).toBeNull()
  })
})
