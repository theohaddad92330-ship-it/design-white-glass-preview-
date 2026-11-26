import { contactIdentityLabel } from './contact-identity-label'

/**
 * Le copilote ne présente jamais une demi-identité comme un nom.
 *
 * Le défaut verrouillé ici a été signalé sur une réponse du copilote qui
 * écrivait « Maximilian » — un prénom seul, mis en gras comme une identité
 * établie. La liste de contacts, elle, badge ces contacts « Nom à révéler »
 * depuis longtemps : c'est le résumé envoyé au modèle qui perdait
 * l'information, pas la base.
 */
describe('l’étiquette d’identité envoyée au copilote', () => {
  it('rend le nom tel quel quand l’identité est complète', () => {
    expect(
      contactIdentityLabel({ full_name: 'Maximilian Dupont', title: 'DSI', linkedin_url: 'https://x.example' }),
    ).toBe('Maximilian Dupont')
  })

  it('dit que le nom de famille manque quand la source ne l’a que masqué', () => {
    const label = contactIdentityLabel({ full_name: 'Maximilian', title: 'DSI', last_name_obfuscated: 'Mo***y' })
    // La lettre publiée par la source est rendue — c'est une information de
    // plus sur la même personne, pas une supposition.
    expect(label).toBe('Maximilian M. (nom de famille non révélé)')
  })

  it('rend en clair un nom complet tenu en base, même si la source l’avait masqué (c81, Louis 04/10/2026)', () => {
    // Sans poste ni société, l'identité n'est pas « complète » — mais le nom,
    // lui, est en base : il ne se réduit jamais à « prénom + initiale ».
    expect(contactIdentityLabel({ full_name: 'Maximilian Mondy', last_name_obfuscated: 'Mo***y' })).toBe(
      'Maximilian Mondy (identité incomplète)',
    )
  })

  it('lit aussi le masque rangé dans les données brutes', () => {
    const label = contactIdentityLabel({
      full_name: 'Séverine',
      title: 'DAF',
      raw_data: { lastNameObfuscated: 'M***t' },
    })
    expect(label).toBe('Séverine M. (nom de famille non révélé)')
  })

  it('donne le rôle, jamais le prénom d’appoint, quand personne n’est confirmé', () => {
    // Nommer « Julien » une personne que rien ne confirme, c'est fabriquer un
    // interlocuteur — la faute que le produit s'interdit.
    expect(contactIdentityLabel({ full_name: 'Julien', title: 'Directeur des Sports' })).toBe(
      'Directeur des Sports (personne à identifier)',
    )
  })

  it('le dit encore quand il n’y a ni masque ni rôle', () => {
    expect(contactIdentityLabel({ full_name: 'Maximilian' })).toBe('Maximilian (identité incomplète)')
  })

  it('ne rend jamais une chaîne vide', () => {
    // Une ligne vide dans le résumé se lirait comme un contact sans nom, ce que
    // le modèle raconterait tel quel.
    expect(contactIdentityLabel({ full_name: null })).toBe('?')
  })
})
