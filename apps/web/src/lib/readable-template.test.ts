import { describe, expect, it } from 'vitest'
import { readableTemplate } from './readable-template'

describe('#3440 — jamais de gabarit brut devant un humain', () => {
  it('rend {{Prénom}} et {{domaine}} comme des trous lisibles', () => {
    expect(readableTemplate('{{Prénom}}, des directions {{domaine}}')).toBe('[prénom], des directions [domaine]')
  })
  it('tolère les espaces dans les accolades et garde le reste intact', () => {
    expect(readableTemplate('Bonjour {{ Entreprise }} !')).toBe('Bonjour [entreprise] !')
    expect(readableTemplate('rien à changer { ici }')).toBe('rien à changer { ici }')
  })
  it('laisse un texte sans variable strictement identique', () => {
    expect(readableTemplate('Bonjour Louis')).toBe('Bonjour Louis')
  })
})
