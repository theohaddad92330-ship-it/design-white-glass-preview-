import { describe, expect, it } from 'vitest'
import { readableSource } from './source-label'

describe('readableSource', () => {
  it('écarte une source qui n’est QUE des jetons de citation', () => {
    // Les formes vues en production, dans la Veille et le panneau Sources.
    expect(readableSource('[PR3]')).toBeNull()
    expect(readableSource('[J3] [P3]')).toBeNull()
    expect(readableSource('[P1], [P4], [P8]')).toBeNull()
    expect(readableSource('[O1] [O2]')).toBeNull()
    expect(readableSource('[signaux_dates]')).toBeNull()
  })

  it('garde ce qui reste lisible une fois le jeton retiré', () => {
    // « Les Échos [P2] » nomme un média : le jeton part, le nom reste.
    expect(readableSource('Les Échos [P2]')).toBe('Les Échos')
    expect(readableSource('[P4] Option Finance')).toBe('Option Finance')
  })

  it('laisse une vraie source intacte', () => {
    expect(readableSource('Registre officiel')).toBe('Registre officiel')
    expect(readableSource('Communiqué de presse')).toBe('Communiqué de presse')
  })

  it('rend null sur du vide', () => {
    expect(readableSource(null)).toBeNull()
    expect(readableSource(undefined)).toBeNull()
    expect(readableSource('   ')).toBeNull()
  })

  it('garde la ponctuation d’une liste de sources', () => {
    // Vu en production : trois registres cités d'affilée. Découper puis recoller
    // sur les espaces mangeait les virgules et collait les noms en une bouillie
    // (« Pappers.fr Societe.com Manageo.fr »). Le texte doit rester lisible.
    expect(readableSource('[O1] Pappers.fr, [O2] Societe.com, [O6] Manageo.fr')).toBe(
      'Pappers.fr, Societe.com, Manageo.fr',
    )
    // R35 — « Presse récente » est un TITRE de section du prompt, pas un média : il ne se garde plus.
    expect(readableSource('[signaux_dates] Presse récente (1 mois ago)')).toBeNull()
  })

  it('ne confond pas un sigle entre crochets avec une phrase', () => {
    // « [Option Finance 1 jour] » n'est pas un jeton : il contient des espaces
    // et des mots — c'est une source mal formatée, pas un code interne. On la
    // garde plutôt que d'effacer une information réelle.
    expect(readableSource('[Option Finance 1 jour]')).toBe('[Option Finance 1 jour]')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠️ LE DÉFAUT MESURÉ EN PRODUCTION LE 05/09/2026.
 *
 * Panneau de la Veille, sur un compte réel : **« Source : Signaux dates :
 * 1 day ago »**. Deux choses fausses dans cinq mots.
 *
 * `signaux_dates` n'est pas une source : c'est le nom de la SECTION du prompt
 * dans laquelle on passe les signaux datés au modèle. Il l'a repris comme s'il
 * s'agissait d'un média — humanisé, donc sans crochets, donc invisible pour le
 * filtre qui n'avait jamais vu que `[signaux_dates]`.
 *
 * Et « 1 day ago » est une date relative, en anglais, dans une interface
 * française — fausse dès le lendemain de son écriture, puisqu'elle a été
 * calculée au moment de l'analyse.
 */
describe('un nom de section de prompt n’est pas une source', () => {
  it('écarte le cas EXACT vu en production', () => {
    expect(readableSource('Signaux dates : 1 day ago')).toBeNull()
  })

  it('écarte la forme brute comme la forme humanisée', () => {
    expect(readableSource('signaux_dates')).toBeNull()
    expect(readableSource('Signaux dates')).toBeNull()
    expect(readableSource('web_brave : 3 results')).toBe('3 results')
  })

  it('écarte une date relative anglaise seule', () => {
    expect(readableSource('2 days ago')).toBeNull()
    expect(readableSource('1 hour ago')).toBeNull()
  })

  /**
   * ⚠️ L'AUTRE SENS, ET IL COMPTE AUTANT. Un filtre trop gourmand effacerait
   * de vraies sources — et une source effacée se lit « source inconnue », donc
   * personne ne saurait qu'elle a existé.
   */
  it('ne mange PAS une vraie source qui mentionne la section', () => {
    expect(readableSource('Les Échos, via signaux_dates')).toBe('Les Échos, via signaux_dates')
    expect(readableSource('Pappers.fr')).toBe('Pappers.fr')
    expect(readableSource('Communiqué du 12 août 2026')).toBe('Communiqué du 12 août 2026')
  })
})

/**
 * R35 (16/10/2026) — « Presse récente » : le TITRE de section de `dated_signals.py` (« PRESSE RÉCENTE : »), que le
 * modèle recopie dans `source`. Ce n'est pas un média ; l'écran retombe sur l'hôte du lien du signal.
 */
describe('un titre de section des signaux datés n’est pas une source', () => {
  it.each([
    'Presse récente',
    'PRESSE RÉCENTE',
    'Presse récente (1 mois ago)',
    'Offres d’emploi IT',
    "Offres d'emploi IT",
    'Marchés publics IT',
    'Marchés attribués',
    'Événements légaux',
    'ÉVÉNEMENTS LÉGAUX',
  ])('écarte « %s »', title => {
    expect(readableSource(title)).toBeNull()
  })

  it('retombe sur le nom d’hôte du lien, sans « www. »', () => {
    expect(readableSource('Presse récente', 'https://www.lesechos.fr/tech/article-123')).toBe('lesechos.fr')
    expect(readableSource(null, 'https://journaldunet.com/x')).toBe('journaldunet.com')
    expect(readableSource('[PR3]', 'http://www.usine-digitale.fr/a')).toBe('usine-digitale.fr')
  })

  it('une vraie source garde son nom, l’URL ne la remplace jamais', () => {
    expect(readableSource('Les Échos', 'https://www.lesechos.fr/a')).toBe('Les Échos')
    expect(readableSource('Presse récente : Les Échos', 'https://x.example/a')).toBe('Les Échos')
  })

  it('une URL illisible ou non http(s) ne produit rien', () => {
    expect(readableSource('Presse récente', 'pas une url')).toBeNull()
    expect(readableSource('Presse récente', 'javascript:alert(1)')).toBeNull()
    expect(readableSource('Presse récente', '')).toBeNull()
    expect(readableSource('Presse récente', null)).toBeNull()
  })
})

/**
 * ⚠️ LA LISTE DES SECTIONS VIT EN PYTHON. La recopier en TypeScript crée deux
 * vérités : le jour où une section est ajoutée côté IA, le filtre ne la connaît
 * pas et son nom repart à l'écran — exactement le défaut qu'on vient de
 * corriger, un cran plus loin.
 */
describe('les noms de section suivent le prompt', () => {
  const FENCING = join(process.cwd(), '../../apps/ia/app/prompts/fencing.py')

  it('lit un fichier réel', () => {
    expect(readFileSync(FENCING, 'utf8').length).toBeGreaterThan(200)
  })

  it('connaît TOUTES les sections que le prompt déclare', () => {
    const python = readFileSync(FENCING, 'utf8')
    const declared = [...python.matchAll(/fence\("([a-z_]+)"/g)].map(match => match[1])
    expect(declared.length, 'aucune section lue — la garde serait aveugle').toBeGreaterThanOrEqual(5)

    const unknown = declared.filter(name => readableSource(name) !== null)
    expect(unknown, 'sections que le filtre laisserait passer à l’écran').toEqual([])
  })
})
