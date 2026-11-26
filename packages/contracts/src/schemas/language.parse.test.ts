import { describe, expect, it } from 'vitest'
import { formatSpokenLanguages, parseClearanceList, parseSpokenLanguages } from './language.js'

/**
 * La GRAMMAIRE DE SAISIE des langues et des habilitations.
 *
 * Elle vit dans le contrat parce que DEUX fiches la saisissent — celle d'un
 * consultant et celle d'un besoin — et que le rapprochement compare les deux.
 * Deux analyseurs recopiés diraient un jour deux choses du même « en:b2 », et
 * l'écart ne se verrait nulle part : le moteur classerait « niveau non précisé »
 * un niveau que le formulaire vient d'accepter.
 */
describe('parseSpokenLanguages', () => {
  it('lit un code et son niveau', () => {
    expect(parseSpokenLanguages('fr:natif, en:b2')).toEqual([
      { code: 'fr', level: 'natif' },
      { code: 'en', level: 'b2' },
    ])
  })

  it('une langue sans niveau reste déclarée, niveau `null`', () => {
    // Jamais « a1 » par défaut : ce serait une évaluation que personne n'a
    // faite, et elle ferait échouer l'axe 6 sur un profil parfaitement valable.
    expect(parseSpokenLanguages('de')).toEqual([{ code: 'de', level: null }])
  })

  it('un niveau HORS échelle est ignoré, pas rapproché du plus proche', () => {
    expect(parseSpokenLanguages('en:courant')).toEqual([{ code: 'en', level: null }])
  })

  it('un code en double garde sa PREMIÈRE occurrence', () => {
    expect(parseSpokenLanguages('fr:natif, fr:b1')).toEqual([{ code: 'fr', level: 'natif' }])
  })

  it('des virgules seules ne fabriquent rien', () => {
    expect(parseSpokenLanguages(' , , ')).toEqual([])
  })

  it('l’aller-retour est stable — ce qui s’affiche se relit à l’identique', () => {
    const list = [
      { code: 'fr', level: 'natif' as const },
      { code: 'en', level: null },
    ]
    expect(parseSpokenLanguages(formatSpokenLanguages(list))).toEqual(list)
  })
})

describe('parseClearanceList', () => {
  it('découpe, retire les blancs et saute les vides', () => {
    // Une virgule en trop ne crée pas une habilitation SANS NOM : elle
    // bloquerait tout le vivier sans que rien ne puisse dire pourquoi.
    expect(parseClearanceList('Secret Défense, , Confidentiel Défense ')).toEqual([
      'Secret Défense',
      'Confidentiel Défense',
    ])
  })

  it('ne garde qu’une fois la même habilitation, quelle que soit la casse', () => {
    expect(parseClearanceList('Secret, secret')).toEqual(['Secret'])
  })

  it('refuse ce qui dépasse la borne du contrat plutôt que de le tronquer', () => {
    // Tronquer fabriquerait une habilitation qui n'existe pas, et le serveur la
    // refuserait de toute façon (`clearanceSchema` borne à 120).
    expect(parseClearanceList('x'.repeat(121))).toEqual([])
  })
})
