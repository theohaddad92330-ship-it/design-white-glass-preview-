import { describe, expect, it } from 'vitest'
import type { CompanySuggestion } from '@bellum/contracts'
import { registryNameGroupOf, registryNameGroups } from './relatedEntities'

/**
 * #1111 — « J'ai lancé deux analyses, sur KLESIA et KLESIA ADP. C'est la même
 * chose, simplement des entités. »
 *
 * Ce que ces tests protègent est la LIGNE entre le fait et l'inférence : on
 * compte des noms publiés au registre, on n'affirme aucun lien capitalistique.
 */

const s = (name: string, siren: string): CompanySuggestion =>
  ({ name, siren, city: '', sector: '' }) as CompanySuggestion

// Ce que le registre rend réellement pour « KLESIA » (vérifié le 26/08/2026).
const KLESIA = [
  s('GIE KLESIA ADP (KLESIA)', '752610147'),
  s('KLESIA AGIRC ARRCO (KLESIA)', '775661986'),
  s("KLESIA MUT' (KLESIA)", '529168007'),
  s('GIE KLESIA (KLESIA)', '892344524'),
]

describe('les entités qui portent le même nom au registre (#1111)', () => {
  it('compte les homonymes de la liste courante', () => {
    const groups = registryNameGroups(KLESIA)

    expect(groups.get('752610147')).toEqual({ label: 'KLESIA', count: 4 })
    expect(groups.size).toBe(4)
  })

  it('ne signale rien quand une société est seule de son nom', () => {
    const groups = registryNameGroups([s('CAPGEMINI (CAPGEMINI)', '330703844'), ...KLESIA])

    expect(groups.get('330703844')).toBeUndefined()
  })

  it('ne se rabat JAMAIS sur le premier mot', () => {
    // Se rabattre sur le premier mot ferait cousiner « SOCIETE GENERALE » et
    // « SOCIETE DES EAUX », qui ne partagent qu'un mot du dictionnaire.
    const groups = registryNameGroups([s('SOCIETE GENERALE', '552120222'), s('SOCIETE DES EAUX', '111111111')])

    expect(groups.size).toBe(0)
  })

  it('ignore une suggestion sans SIREN — elle n’a pas de clé stable', () => {
    const groups = registryNameGroups([s('ACME (ACME)', ''), s('ACME BIS (ACME)', '')])

    expect(groups.size).toBe(0)
  })

  it('rend l’ensemble d’une suggestion choisie, ou rien', () => {
    const groups = registryNameGroups(KLESIA)

    expect(registryNameGroupOf(KLESIA[0]!, groups)).toEqual({ label: 'KLESIA', count: 4 })
    expect(registryNameGroupOf(s('SEUL (SEUL)', '999999999'), groups)).toBeNull()
    expect(registryNameGroupOf(null, groups)).toBeNull()
  })
})
// ── Ce que la recette live du 26/08 a trouvé ────────────────────────────────
//
// La première version ne connaissait QUE la parenthèse du registre libre. Or le
// chemin nominal passe par Pappers, qui rend la raison sociale SANS elle : le
// signal était inerte là où il sert le plus. Vérifié en production sur
// « KLESIA » — cinq résultats, aucune parenthèse, aucun badge.

// Ce que Pappers rend réellement pour « KLESIA » (relevé en prod le 26/08).
const KLESIA_PAPPERS = [
  s('KLESIA SA', '775661986'),
  s('GIE KLESIA ADP', '752610147'),
  s('ALEDIA', '532001306'),
  s('ALEYSIA', '810123456'),
  s('GIE KLESIA', '892344524'),
]

describe('le second signal — le terme cherché (#1111, recette)', () => {
  it('compte les résultats qui portent le terme cherché, sans parenthèse', () => {
    const groups = registryNameGroups(KLESIA_PAPPERS, 'KLESIA')

    expect(groups.get('775661986')).toEqual({ label: 'KLESIA', count: 3 })
    expect(groups.get('752610147')?.count).toBe(3)
    // ALEDIA et ALEYSIA ne portent pas le mot : elles ne sont pas de l'ensemble.
    expect(groups.get('532001306')).toBeUndefined()
    expect(groups.get('810123456')).toBeUndefined()
  })

  it('cherche le terme comme un MOT, pas en sous-chaîne', () => {
    // « ALEDIA » contient « LED » sans rien avoir à voir avec lui.
    const groups = registryNameGroups([s('ALEDIA', '1'), s('LED SYSTEMS', '2')], 'LED')

    expect(groups.get('1')).toBeUndefined()
  })

  it('refuse un terme trop court', () => {
    expect(registryNameGroups([s('SG PARIS', '1'), s('SG LYON', '2')], 'SG').size).toBe(0)
  })

  it('refuse un mot trop commun pour désigner un ensemble', () => {
    // Le geste proposé (analyser le groupe entier) serait faux.
    const groups = registryNameGroups([s('SOCIETE GENERALE', '1'), s('SOCIETE DES EAUX', '2')], 'SOCIETE')

    expect(groups.size).toBe(0)
  })

  it('refuse une requête de plusieurs mots — elle désigne une société précise', () => {
    const groups = registryNameGroups(
      [s('CNP ASSURANCES PROTECTION SOCIALE', '1'), s('CNP ASSURANCES', '2')],
      'CNP Assurances protection sociale',
    )

    expect(groups.size).toBe(0)
  })

  it('laisse la PARENTHÈSE gagner quand les deux signaux existent', () => {
    // C'est un champ du registre, pas une coïncidence de recherche.
    const groups = registryNameGroups(KLESIA, 'KLESIA')

    expect(groups.get('752610147')).toEqual({ label: 'KLESIA', count: 4 })
  })

  it('reste muet sans requête — le comportement d’avant, à l’octet près', () => {
    expect(registryNameGroups(KLESIA_PAPPERS).size).toBe(0)
  })
})
