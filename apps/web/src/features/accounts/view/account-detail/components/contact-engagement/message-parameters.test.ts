import { describe, expect, it } from 'vitest'
import { chosenParameters } from './message-parameters'

/**
 * #2123.61-.68 — un paramètre du message n'est un CHOIX que s'il est renseigné.
 * Sans choix, la clé ne part pas : le moteur garde le cadrage qu'il dérive.
 */
describe('chosenParameters', () => {
  it('garde les seuls paramètres renseignés, texte rogné', () => {
    expect(chosenParameters({ objective: 'relance', signal: '  Pôle data à Lyon ', offer: '', proof: '   ' })).toEqual({
      objective: 'relance',
      signal: 'Pôle data à Lyon',
    })
  })

  it('témoin : rien de choisi, rien ne part — ni objet vide, ni valeur de remplissage', () => {
    expect(chosenParameters({})).toBeUndefined()
    expect(chosenParameters({ signal: ' ', cta: '' })).toBeUndefined()
  })
})
