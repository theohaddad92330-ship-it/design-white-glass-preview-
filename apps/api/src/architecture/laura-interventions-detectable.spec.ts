import { LAURA_INTERVENTIONS } from '@bellum/contracts'
import { DETECTABLE_KEYS, INTERVENTION_DETECTORS, UNDETECTED_INTERVENTIONS } from '../modules/laura/laura-detector'

/**
 * GA — UNE ENTRÉE DE CATALOGUE N'EST PAS UNE INTERVENTION.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────
 * Le catalogue de Laura portait trente clés. Le détecteur en produisait HUIT.
 * Vingt-deux interventions étaient donc du code juste, écrit, testé, que rien
 * ne pouvait déclencher : le motif que ce dépôt corrige depuis six chantiers —
 * du calcul que personne n'appelle. Et personne ne l'a vu, parce qu'un
 * catalogue ne dit pas qui l'appelle.
 *
 * La règle que cette garde tient : **toute clé du catalogue est soit DÉTECTÉE,
 * soit CLASSÉE avec ce qui lui manque.** Aucune ne disparaît en silence. Une
 * trente-et-unième intervention ajoutée demain fait rougir la CI jusqu'à ce que
 * quelqu'un ait répondu à la question « qui la déclenche ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE COMPARE DES IDENTIFIANTS ET NON DES MOTS
 * ─────────────────────────────────────────────────────────────────────────
 * Une garde qui chercherait la chaîne `'long_bench'` dans le source du
 * détecteur passerait au vert sur un COMMENTAIRE qui la cite — et ce fichier en
 * est plein. Sept gardes borgnes en trois jours dans ce dépôt, dont une coupée
 * par une flèche de `onClick` et une autre victime du drapeau `g` de
 * `RegExp.test()`, qui est STATEFUL. Ici on compare deux ENSEMBLES de clés
 * importées : ce sont les valeurs qui tournent en production, pas leur
 * orthographe dans un fichier.
 *
 * ⚠️ Elle ne dit rien de la JUSTESSE d'un détecteur : c'est le rôle de
 * `laura-detector.spec.ts`, qui l'exerce mesure par mesure. Une garde protège
 * une règle, elle ne l'invente pas.
 */

const CATALOGUE_KEYS = LAURA_INTERVENTIONS.map(intervention => intervention.key)
const DETECTED = new Set(DETECTABLE_KEYS)
const CLASSIFIED = new Set(Object.keys(UNDETECTED_INTERVENTIONS))

describe('GA — chaque intervention du catalogue est détectée ou classée', () => {
  it('lit un corpus NON VIDE — sans ça la garde passerait au vert pour toujours', () => {
    // Le défaut que cette assertion refuse : un import renommé, une liste vide,
    // et trente comparaisons sur un ensemble de zéro élément qui réussissent
    // toutes.
    expect(CATALOGUE_KEYS.length).toBeGreaterThanOrEqual(30)
    expect(DETECTED.size).toBeGreaterThanOrEqual(20)
    expect(CLASSIFIED.size).toBeGreaterThanOrEqual(1)
    expect(INTERVENTION_DETECTORS.length).toBe(DETECTED.size)
  })

  it.each(CATALOGUE_KEYS)('%s a un détecteur, ou une raison écrite de ne pas en avoir', key => {
    const verdict = DETECTED.has(key) ? 'détectée' : CLASSIFIED.has(key) ? 'classée' : 'NI DÉTECTÉE NI CLASSÉE'
    expect(verdict).not.toBe('NI DÉTECTÉE NI CLASSÉE')
    // Et jamais les deux : un classement « pas encore fait » posé sur une clé
    // qui a bel et bien un détecteur ferait croire à un trou qui n'existe pas,
    // et le prochain lecteur recoderait ce qui tourne déjà.
    expect(DETECTED.has(key) && CLASSIFIED.has(key)).toBe(false)
  })

  it('ne classe AUCUNE clé inconnue du catalogue — un classement orphelin ment sur la couverture', () => {
    // Une clé renommée au catalogue laisserait sinon sa vieille entrée dans le
    // classement : le compte « 25 + 5 = 30 » resterait juste, et la nouvelle clé
    // serait invisible.
    const unknown = [...CLASSIFIED].filter(key => !CATALOGUE_KEYS.includes(key))
    expect(unknown).toEqual([])
  })

  it('ne détecte AUCUNE clé inconnue du catalogue — ce serait une intervention sans écran', () => {
    const ghosts = [...DETECTED].filter(key => !CATALOGUE_KEYS.includes(key))
    expect(ghosts).toEqual([])
  })

  it('couvre le catalogue EXACTEMENT une fois — ni trou, ni double emploi', () => {
    const covered = [...DETECTED, ...CLASSIFIED].sort()
    expect(covered).toEqual([...CATALOGUE_KEYS].sort())
  })
})

describe('GA — un classement dit ce qui manque, et le dit dans une catégorie qui existe', () => {
  const STATUSES = ['detectable_not_yet', 'not_detectable', 'must_not_detect']

  it.each(Object.keys(UNDETECTED_INTERVENTIONS))('%s porte un statut connu et une raison écrite', key => {
    const entry = UNDETECTED_INTERVENTIONS[key]
    expect(entry).toBeDefined()
    expect(STATUSES).toContain(entry?.status)
    // Vingt caractères : de quoi refuser « TODO », « à faire » ou « voir plus
    // tard », qui sont des façons de ne pas répondre à la question.
    expect((entry?.missing ?? '').trim().length).toBeGreaterThan(20)
  })
})

describe('GA — un détecteur déclare ce qu’il lit', () => {
  it.each([...DETECTABLE_KEYS])('%s nomme sa base et ne demande pas deux fois la même mesure', key => {
    const detector = INTERVENTION_DETECTORS.find(candidate => candidate.key === key)
    expect(detector).toBeDefined()
    expect((detector?.basis ?? '').trim().length).toBeGreaterThan(20)
    // `requires` peut être vide — quatre détecteurs lisent le score de santé ou
    // la liste des blocages, qui ne sont pas des comptages. Ce qui est
    // interdit, c'est un doublon : il ferait lire deux fois la même mesure.
    const requires = detector?.requires ?? []
    expect(new Set(requires).size).toBe(requires.length)
  })
})
