import { collapseRepeatedTranscript } from './transcript-repeat'

// #3457 — « un message dicté arrive deux fois dans la bulle envoyée ». Whisper
// rend parfois la même phrase deux fois sur un enregistrement court : le texte
// transcrit ne doit entrer qu'UNE fois dans le message.

describe('collapseRepeatedTranscript — la phrase dite une fois ne s’écrit qu’une fois', () => {
  it('rend une seule fois la phrase doublée du retour bêta', () => {
    expect(collapseRepeatedTranscript('Bonjour, comment allez-vous ? Bonjour, comment allez-vous ?')).toEqual({
      text: 'Bonjour, comment allez-vous ?',
      copies: 2,
    })
    expect(collapseRepeatedTranscript('Hello, comment tu vas ? Hello, comment tu vas ?')).toEqual({
      text: 'Hello, comment tu vas ?',
      copies: 2,
    })
  })

  it('ignore la casse et la ponctuation pour reconnaître la répétition', () => {
    expect(collapseRepeatedTranscript('Quels signaux sur Airbus ? quels signaux sur airbus').copies).toBe(2)
  })

  it('collapse aussi trois répétitions', () => {
    const out = collapseRepeatedTranscript('Appelle Marie demain. Appelle Marie demain. Appelle Marie demain.')
    expect(out).toEqual({ text: 'Appelle Marie demain.', copies: 3 })
  })

  it('laisse intact un texte sans répétition', () => {
    const text = 'Bonjour, peux-tu préparer un message pour Airbus ?'
    expect(collapseRepeatedTranscript(text)).toEqual({ text, copies: 1 })
  })

  it('NE touche PAS une répétition voulue trop courte (« non non », « oui oui oui »)', () => {
    expect(collapseRepeatedTranscript('Non non')).toEqual({ text: 'Non non', copies: 1 })
    expect(collapseRepeatedTranscript('Oui oui oui')).toEqual({ text: 'Oui oui oui', copies: 1 })
  })

  it('NE touche PAS une phrase qui en reprend une autre sans la doubler à l’identique', () => {
    const text = 'Appelle Marie demain. Appelle Marie demain matin.'
    expect(collapseRepeatedTranscript(text)).toEqual({ text, copies: 1 })
  })

  it('un texte vide reste vide', () => {
    expect(collapseRepeatedTranscript('')).toEqual({ text: '', copies: 1 })
  })
})
