import { describe, expect, it } from 'vitest'
import { bubbleAuthor, selfChatAuthor } from './chat-author'

/**
 * #1940.4 — « Comprendre qui a posé la question ».
 *
 * Deux décisions vivent ici, et chacune a son piège :
 *  - l'identité de la personne CONNECTÉE vient du profil, jamais de l'adresse
 *    e-mail (`useFirstName` y retombe pour un entête ; un auteur, lui, est un
 *    prénom ou rien) ;
 *  - une bulle SANS champ `author` est une bulle tapée dans cet onglet — donc
 *    par la personne connectée. Une bulle RELUE porte toujours le champ (au
 *    pire `null`) : sans cette distinction, un fil relu depuis une API
 *    antérieure attribuerait les questions d'un collègue à celui qui lit.
 */
describe('selfChatAuthor', () => {
  it('rend le prénom déclaré, sans ses espaces', () => {
    expect(selfChatAuthor({ first_name: '  Maëlle ', avatar_url: null })).toEqual({
      firstName: 'Maëlle',
      avatarUrl: null,
    })
  })

  it('garde un avatar https', () => {
    expect(selfChatAuthor({ first_name: 'Théo', avatar_url: 'https://cdn.example.test/t.png' })).toEqual({
      firstName: 'Théo',
      avatarUrl: 'https://cdn.example.test/t.png',
    })
  })

  it('écarte un avatar qui n’est pas une adresse https — les initiales prennent le relais', () => {
    expect(selfChatAuthor({ first_name: 'Théo', avatar_url: 'javascript:alert(1)' })?.avatarUrl).toBeNull()
  })

  it('sans prénom déclaré, pas d’auteur — jamais le début de l’adresse e-mail', () => {
    expect(selfChatAuthor({ first_name: '   ', avatar_url: 'https://cdn.example.test/t.png' })).toBeNull()
    expect(selfChatAuthor({ first_name: null, avatar_url: null, email: 'theo@esn.fr' })).toBeNull()
  })

  it('profil pas encore chargé : pas d’auteur', () => {
    expect(selfChatAuthor(undefined)).toBeNull()
  })
})

describe('bubbleAuthor', () => {
  const self = { firstName: 'Maëlle', avatarUrl: null }
  const theo = { firstName: 'Théo', avatarUrl: null }

  it('une question tapée dans cet onglet (pas de champ `author`) est celle de la personne connectée', () => {
    expect(bubbleAuthor({ role: 'user' }, self)).toEqual(self)
  })

  it('une question RELUE garde l’auteur servi par l’API, même si quelqu’un d’autre lit', () => {
    expect(bubbleAuthor({ role: 'user', author: theo }, self)).toEqual(theo)
  })

  it('une question relue SANS auteur (compte effacé, ancien message) n’en reçoit aucun', () => {
    expect(bubbleAuthor({ role: 'user', author: null }, self)).toBeNull()
  })

  it('une réponse de Laura n’a jamais d’auteur humain', () => {
    expect(bubbleAuthor({ role: 'assistant' }, self)).toBeNull()
  })
})
