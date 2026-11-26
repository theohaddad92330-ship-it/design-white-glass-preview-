import { describe, expect, it } from 'vitest'
import { replyParityIssues } from './reply-parity.js'

/**
 * #3707.7 — la mise en forme ne crée aucun fait : cartes, texte copié et prose portent les mêmes
 * objets. Le garde doit savoir dire NON (chaque cas ci-dessous est un défaut réel), LIRE (il parse
 * les vraies clôtures) et ne pas attraper ce qu'il ne vise pas (la réponse saine ne lève rien).
 */
function fence(block: Record<string, unknown>): string {
  return ['```bellum-block', JSON.stringify(block), '```'].join('\n')
}

const ranking = {
  type: 'account_ranking',
  axes: ['Accès'],
  items: [
    { name: 'SNCF', why: ['Six portes.'], limits: ['Référencement du groupe.'] },
    { name: 'ENGIE', why: ['Achète déjà de la prestation.'] },
  ],
  not_evaluated: ['Budget'],
}
const copyOf = (text: string): string => text.replace(/```bellum-block[\s\S]*?```/g, m => m.replace(/[{}"[\]]/g, ' '))

describe('replyParityIssues', () => {
  it('une réponse saine ne lève rien', () => {
    const text = `Je commencerais par SNCF.\n\n${fence(ranking)}`
    expect(replyParityIssues(text, copyOf(text))).toEqual([])
  })

  it('NON — une copie qui perd une réserve (limite, non évalué) est signalée', () => {
    const text = fence(ranking)
    const copy = 'Accès SNCF Six portes. ENGIE Achète déjà de la prestation.'
    const issues = replyParityIssues(text, copy)
    expect(issues.map(i => i.kind)).toEqual(['copy_loses_leaf', 'copy_loses_leaf'])
    expect(issues.map(i => i.detail).join('|')).toMatch(/Référencement du groupe/)
    expect(issues.map(i => i.detail).join('|')).toMatch(/Budget/)
  })

  it('NON — une ligne de comparaison où tout est « non mesuré » est un bloc vide bien présenté', () => {
    const text = fence({
      type: 'comparison',
      columns: ['A', 'B'],
      rows: [
        { label: 'Signal', cells: ['x', 'y'] },
        { label: 'ESN en place', cells: [null, null] },
      ],
    })
    expect(replyParityIssues(text, copyOf(text))).toEqual([{ kind: 'blank_row', detail: 'ESN en place' }])
  })

  it('NON — la même réserve répétée sur chaque ligne (ou sur une ligne ET sous la liste) n’est pas dite une fois', () => {
    const text = fence({
      ...ranking,
      items: [
        { name: 'A', why: ['x'], not_evaluated: ['Signaux', 'Budget'] },
        { name: 'B', why: ['y'], not_evaluated: ['Signaux'] },
      ],
    })
    const kinds = replyParityIssues(text, copyOf(text)).map(i => `${i.kind}:${i.detail}`)
    expect(kinds).toEqual(['reserve_said_twice:Budget', 'reserve_said_twice:Signaux'])
  })

  it('NON — deux lignes du même nom : le texte et les boutons ne sauraient plus de laquelle on parle', () => {
    const text = fence({ ...ranking, items: [ranking.items[0], ranking.items[0]] })
    expect(replyParityIssues(text, copyOf(text)).map(i => i.kind)).toContain('duplicate_name')
  })

  it('NON — la prose annonce un nombre de comptes que la carte ne porte pas', () => {
    const text = `Voici l’ordre dans lequel j’ouvrirais tes six comptes.\n\n${fence(ranking)}`
    expect(replyParityIssues(text, copyOf(text))).toEqual([{ kind: 'count_mismatch', detail: 'six ≠ 2' }])
  })

  it('un nombre en chiffres ou une prose sans nombre ne lève rien quand la carte concorde', () => {
    const ok = `Voici tes 2 comptes.\n\n${fence(ranking)}`
    expect(replyParityIssues(ok, copyOf(ok))).toEqual([])
  })

  it('une clôture illisible est ignorée ici (le contrat de rendu la traite déjà) — jamais un faux positif', () => {
    expect(replyParityIssues('```bellum-block\n{pas du json}\n```', 'x')).toEqual([])
  })

  it('un jeton machine (type d’événement, nom de fichier) n’est pas une réserve à retrouver dans la copie', () => {
    const text = fence({
      type: 'timeline',
      events: [{ at: '2026-09-01T09:00:00.000Z', kind: 'workflow', label: 'Relance envoyée' }],
    })
    expect(replyParityIssues(text, 'Relance envoyée 2026-09-01T09:00:00.000Z')).toEqual([])
  })
})
