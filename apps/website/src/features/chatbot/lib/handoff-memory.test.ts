import { describe, expect, it } from 'vitest'
import { handoffFailureAlreadyTold } from './handoff-memory'

const assistant = (content: string) => ({ role: 'assistant', content })
const visitor = (content: string) => ({ role: 'user', content })

describe('« je n’ai pas pu transmettre » se dit une seule fois', () => {
  it('relit l’historique quand la mémoire du process a été perdue', () => {
    // Le site tourne en serverless : deux tours peuvent atterrir sur deux
    // instances, et le `Set` du routeur est alors vide. La conversation, elle,
    // fait l'aller-retour.
    const history = [
      visitor('je veux un rdv'),
      assistant("Je n'arrive pas à transmettre à l'instant, mais le lien de réservation fonctionne."),
      visitor('ok et sinon vous faites quoi ?'),
    ]
    expect(handoffFailureAlreadyTold(history)).toBe(true)
  })

  it('ne voit rien dans une conversation où rien n’a échoué', () => {
    expect(handoffFailureAlreadyTold([visitor('bonjour'), assistant('Bonjour ! Tu cherches quoi ?')])).toBe(false)
  })

  it('ignore les accents et la casse — le texte vient d’un modèle', () => {
    expect(handoffFailureAlreadyTold([assistant('Je n’ai PAS PU TRANSMETTRE ta demande.')])).toBe(true)
  })

  it('ne lit que les messages de Laura', () => {
    // Un visiteur qui écrit la phrase ne doit pas faire taire une vraie annonce.
    expect(handoffFailureAlreadyTold([visitor("tu n'arrives pas à transmettre ?")])).toBe(false)
  })

  it('fait confiance à la mémoire du process quand elle est là', () => {
    expect(handoffFailureAlreadyTold([], true)).toBe(true)
  })
})
