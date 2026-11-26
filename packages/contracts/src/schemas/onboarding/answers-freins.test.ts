/**
 * GARDE — ce qui empêche réellement d'avancer (#2055).
 *
 * Deux règles du produit sont tenues ici, et une seule d'entre elles se voit à
 * l'écran :
 *
 *  1. **« Non mesuré » n'est jamais « 0 ».** Un frein non renseigné n'est pas
 *     un frein absent : la lecture rend `null`, jamais une liste vide qui se
 *     lirait « ce commercial n'a aucun frein ». Question posée à chaque
 *     champ : _si cette valeur est absente, « 0 » est-il VRAI ?_
 *  2. **Le symptôme et le goulot sont nommés SÉPARÉMENT** (#2055.16). Ce que
 *     le commercial coche est un SYMPTÔME ; ce que les trois relances font
 *     apparaître est la piste du goulot. Les fondre en un seul champ, c'est
 *     rendre un diagnostic à la place de l'utilisateur.
 */
import { describe, expect, it } from 'vitest'
import { supplierNamesIn } from '../tool-naming.js'
import { FREINS_ANSWER_FIELDS, SALES_FREIN_CHOICES, readSalesFreins } from './answers-freins.js'

describe('freins — le corpus est lu', () => {
  it('propose les seize freins de la demande', () => {
    // #2055.1 à #2055.13 — seize libellés, seize intitulés distincts.
    expect(SALES_FREIN_CHOICES.length).toBe(16)
    expect(new Set(SALES_FREIN_CHOICES).size).toBe(16)
    expect(SALES_FREIN_CHOICES.every(choice => choice.trim().length > 0)).toBe(true)
  })

  it('porte les quatre champs : le symptôme et les trois relances', () => {
    // #2055.14 (texte libre, porté par `allowOther` côté question) et #2055.15.
    expect(Object.keys(FREINS_ANSWER_FIELDS)).toEqual([
      'sales_freins',
      'frein_attempted',
      'frein_stopped',
      'frein_stopped_reason',
    ])
  })

  it('ne cite aucun de nos fournisseurs (le frein « outils » nomme la capacité)', () => {
    // #2055.10 — « mes informations sont éparpillées », jamais le nom d'un outil.
    for (const choice of SALES_FREIN_CHOICES) {
      expect(supplierNamesIn(choice), `valeur fautive : ${choice}`).toEqual([])
    }
  })
})

describe('freins — « non mesuré » n’est jamais « 0 »', () => {
  it('rend `null` quand la question n’a pas été posée, jamais une liste vide', () => {
    expect(readSalesFreins({}).symptom).toBeNull()
    expect(readSalesFreins({ sales_freins: [] }).symptom).toBeNull()
  })

  it('rend `null` pour le goulot tant qu’aucune relance n’a de réponse', () => {
    expect(readSalesFreins({}).bottleneck).toBeNull()
    expect(
      readSalesFreins({ frein_attempted: '   ', frein_stopped: '', frein_stopped_reason: null }).bottleneck,
    ).toBeNull()
  })

  it('sait dire NON : une réponse réelle n’est PAS lue comme absente (témoin)', () => {
    const first = SALES_FREIN_CHOICES[0]
    expect(first).toBeDefined()
    expect(readSalesFreins({ sales_freins: [first as string] }).symptom).toEqual([first])
  })
})

describe('freins — le symptôme et le goulot ne se fondent jamais (#2055.16)', () => {
  it('nomme les deux séparément', () => {
    const reading = readSalesFreins({
      sales_freins: ['Le suivi : je perds le fil de mes relances'],
      frein_attempted: 'Un rappel hebdomadaire dans mon agenda',
      frein_stopped: 'Je ne le regarde plus depuis juin',
      frein_stopped_reason: 'Il tombe le vendredi, le jour où je suis en clientèle',
    })
    expect(reading.symptom).toEqual(['Le suivi : je perds le fil de mes relances'])
    expect(reading.bottleneck).toEqual({
      attempted: 'Un rappel hebdomadaire dans mon agenda',
      stopped: 'Je ne le regarde plus depuis juin',
      reason: 'Il tombe le vendredi, le jour où je suis en clientèle',
    })
  })

  it('garde un goulot PARTIEL plutôt que de le jeter, et nomme ce qui manque', () => {
    // Une relance sans réponse reste `null` — elle n'est pas devinée à partir
    // des deux autres, et elle ne fait pas disparaître celles qui existent.
    const reading = readSalesFreins({ frein_attempted: 'Une campagne de mails' })
    expect(reading.bottleneck).toEqual({
      attempted: 'Une campagne de mails',
      stopped: null,
      reason: null,
    })
  })

  it('un symptôme seul ne fabrique AUCUN goulot', () => {
    // Le piège du produit : déduire la cause de ce que l'utilisateur a coché.
    const reading = readSalesFreins({ sales_freins: ['Le temps : je n’ai pas le temps de prospecter'] })
    expect(reading.symptom).not.toBeNull()
    expect(reading.bottleneck).toBeNull()
  })

  it('tolère une charge utile inattendue sans rien inventer', () => {
    expect(readSalesFreins({ sales_freins: ['  ', ''] }).symptom).toBeNull()
  })
})
