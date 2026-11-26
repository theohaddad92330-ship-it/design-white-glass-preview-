import { describe, expect, it } from 'vitest'
import discoverFr from '@/i18n/locales/fr/discover.json'
import discoverEn from '@/i18n/locales/en/discover.json'

/*
 * G-FIX #4319 — « Résultat partiel… SIREN… registre… homonymie… Ça ne veut rien dire » (Louis, 19/10).
 * Quand une recherche est incomplète, l'écran dit en mots simples CE qui manque et CE qu'on peut faire :
 * jamais SIREN, registre, homonymie, budget de temps, ni un compteur technique « examinées ».
 * La garde LIT les phrases réellement affichées (FR et EN) et sait dire NON.
 */
const JARGON = /siren|registre|registry|homonym|namesake|budget|company number|examin/i

type Tree = { [key: string]: string | Tree }

function sentences(prefix: string, node: string | Tree): string[] {
  return typeof node === 'string'
    ? [`${prefix}=${node}`]
    : Object.entries(node).flatMap(([key, value]) => sentences(`${prefix}.${key}`, value))
}

function shown(json: Tree): string[] {
  const reason = (json.degraded as Tree).reason as Tree
  const plainReasons = [
    'time_budget',
    'siren_ambiguous_one',
    'siren_ambiguous_other',
    'siren_unreachable_one',
    'siren_unreachable_other',
    'siren_not_examined_one',
    'siren_not_examined_other',
  ]
  return [
    ...plainReasons.map(key => `degraded.reason.${key}=${String(reason[key])}`),
    ...['summary', 'summaryAmbiguous_one', 'summaryAmbiguous_other'].map(
      key => `degraded.${key}=${String((json.degraded as Tree)[key])}`,
    ),
    ...sentences('ambiguous.description', (json.ambiguous as Tree).description as string),
    ...sentences('coverage', json.coverage as Tree),
  ]
}

describe.each([
  ['fr', discoverFr as unknown as Tree],
  ['en', discoverEn as unknown as Tree],
])('G-FIX #4319 — une recherche incomplète parle simple (%s)', (_lang, json) => {
  it('aucune phrase affichée ne porte de terme interne', () => {
    const offenders = shown(json).filter(line => JARGON.test(line.slice(line.indexOf('=') + 1)))
    expect(offenders).toEqual([])
  })

  it('chaque cause dit aussi quoi faire (une action)', () => {
    const reason = (json.degraded as Tree).reason as Tree
    for (const key of ['siren_unreachable_other', 'siren_not_examined_other', 'siren_ambiguous_other']) {
      expect(String(reason[key]).length).toBeGreaterThan(40)
    }
  })

  it('la garde sait dire NON : elle attrape l’ancienne phrase', () => {
    expect(JARGON.test('aucun SIREN inventé')).toBe(true)
    expect(JARGON.test('Plusieurs entités du registre portent le même nom')).toBe(true)
    expect(JARGON.test('Précise la ville pour la retrouver.')).toBe(false)
  })
})
