import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { briefUnknowns } from './brief-unknowns'

/**
 * #4543 — UN lecteur pour « Ce qu'on ne sait pas ». La liste structurée n'était alimentée par personne : la synthèse
 * écrivait « les achats et la concurrence restent inconnus » pendant que le bloc disait « non renseigné ». Les
 * inconnues se LISENT maintenant dans ce que l'analyse a (ou n'a pas) relevé — jamais devinées depuis le texte.
 */
const ANALYSED = {
  priority_score: 6,
  sources: [],
  competitors: [],
  purchasing_thread: { items: [], summary: { total_contracts: 0 } },
}

describe('briefUnknowns — le lecteur unique', () => {
  it('une analyse qui n’a relevé ni concurrents ni achats NOMME les deux', () => {
    expect(briefUnknowns(ANALYSED).map(u => u.gap)).toEqual(['competitors', 'purchasing'])
  })

  it('sait dire NON : ce qui est relevé n’est pas nommé inconnu', () => {
    const raw = {
      ...ANALYSED,
      competitors: [{ name: 'Acme' }],
      purchasing_thread: { items: [{ buyer: 'X' }], summary: { total_contracts: 1 } },
    }
    expect(briefUnknowns(raw)).toEqual([])
  })

  it('un dossier jamais analysé ne devine rien : liste vide (le bloc dira « non renseigné »)', () => {
    expect(briefUnknowns({})).toEqual([])
    expect(briefUnknowns(null)).toEqual([])
  })

  it('les inconnues posées explicitement passent en premier, sans doublon ni vide', () => {
    const out = briefUnknowns({ ...ANALYSED, unknowns: ['Le budget 2027', '  ', 'Le budget 2027', 7] })
    expect(out[0]).toEqual({ text: 'Le budget 2027' })
    expect(out.filter(u => u.text === 'Le budget 2027')).toHaveLength(1)
    expect(out.some(u => u.gap === 'competitors')).toBe(true)
  })

  it('des sources qui n’ont pas répondu sont COMPTÉES, jamais nommées (aucun fournisseur à l’écran)', () => {
    const out = briefUnknowns({
      ...ANALYSED,
      competitors: [{ name: 'Acme' }],
      purchasing_thread: { items: [{}] },
      signal_coverage: {
        unreachable: [
          { source: 'apec', reason: 'HTTP 403' },
          { source: 'x', reason: '' },
        ],
      },
    })
    expect(out).toEqual([{ gap: 'sourcesUnreachable', count: 2 }])
    expect(JSON.stringify(out)).not.toMatch(/apec|HTTP/)
  })

  // #4543.5 (Louis 01/11) — « aucun concurrent relevé » n'est PAS « rien à signaler » : un tableau vide peut être un zéro
  // mesuré ou une absence de collecte, l'écran dit « Non renseigné » (non mesuré ≠ 0, GA-18 / GA-19).
  it.each(['fr', 'en'] as const)('#4543.5 — les libellés de catégorie vide disent « non renseigné » (%s)', lang => {
    const file = resolve(__dirname, `../../../i18n/locales/${lang}/brief.json`)
    const gaps = (JSON.parse(readFileSync(file, 'utf8')) as { unknownGaps: Record<string, string> }).unknownGaps
    const expected = lang === 'fr' ? /non renseigné/i : /not provided/i
    for (const key of ['competitors', 'purchasing']) {
      expect(gaps[key]).toMatch(expected)
      expect(gaps[key]).not.toMatch(/aucun|found none|found no|rien à signaler|nothing to report/i)
    }
  })
})
