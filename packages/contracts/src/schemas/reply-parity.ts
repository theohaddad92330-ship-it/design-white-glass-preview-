import { replyBlockLeaves, splitReplyBlocks, type ReplyBlock } from './reply-blocks.js'

/**
 * #3707.7 — LA MISE EN FORME NE CRÉE AUCUN FAIT.
 *
 * Une réponse de Laura porte le même objet à trois endroits : la prose, la carte, et le texte
 * qui QUITTE l'écran (copie, épingle, export — `replyPlainText`). Ce garde les compare, sans
 * modèle et sans réseau, et nomme chaque défaut :
 *  - `copy_loses_leaf` : un texte de la carte (nom, verdict, limite, « non évalué ») absent de la
 *    copie — l'export ne garderait pas les réserves ;
 *  - `blank_row` : une ligne de comparaison dont toutes les cellules sont « non mesuré » — une
 *    colonne vide bien présentée ; l'absence se dit UNE fois, dans la note ;
 *  - `reserve_said_twice` : une même réserve sur plusieurs lignes, ou sur une ligne ET sous la liste ;
 *  - `duplicate_name` : deux lignes du même compte — le texte et les boutons ne sauraient plus
 *    de laquelle on parle ;
 *  - `count_mismatch` : la prose annonce « tes six comptes », la carte en porte cinq.
 *
 * `plainText` vient de l'appelant (il porte ses traductions, comme `replyPlainText`) : un
 * contrat porte la forme, jamais le texte d'une interface.
 */
export type ReplyParityIssue = {
  kind: 'copy_loses_leaf' | 'blank_row' | 'reserve_said_twice' | 'duplicate_name' | 'count_mismatch'
  detail: string
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
}

const COUNT_CLAIM = /\b(?:tes|mes|les|ces)\s+(\d+|[a-zéè]+)\s+(?:comptes|entreprises|sociétés)\b/giu

/**
 * Un jeton machine (`workflow`, `portefeuille-demo.csv`) n'est pas un texte à lire : c'est un
 * type d'événement ou un nom de fichier, que la copie traduit ou écarte. Une réserve, un nom,
 * une phrase portent une majuscule, un espace ou un accent.
 */
const MACHINE_TOKEN = /^[a-z0-9_.-]+$/

export function replyParityIssues(text: string, plainText: string): ReplyParityIssue[] {
  const segments = splitReplyBlocks(text)
  const blocks = segments.flatMap(segment => (segment.kind === 'block' ? [segment.block] : []))
  const issues: ReplyParityIssue[] = []

  for (const block of blocks) {
    for (const leaf of replyBlockLeaves(block)) {
      if (!MACHINE_TOKEN.test(leaf) && !plainText.includes(leaf)) issues.push({ kind: 'copy_loses_leaf', detail: leaf })
    }
    if (block.type === 'comparison') {
      for (const row of block.rows) {
        if (row.cells.every(cell => cell === null)) issues.push({ kind: 'blank_row', detail: row.label })
      }
    }
    if (block.type === 'account_ranking') issues.push(...rankingIssues(block))
  }

  const ranking = blocks.filter(block => block.type === 'account_ranking')
  const only = ranking.length === 1 ? ranking[0] : undefined
  if (only?.type === 'account_ranking') {
    const prose = segments.flatMap(segment => (segment.kind === 'text' ? [segment.text] : [])).join('\n')
    for (const match of prose.matchAll(COUNT_CLAIM)) {
      const raw = (match[1] ?? '').toLowerCase()
      const claimed = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw]
      if (claimed !== undefined && claimed !== only.items.length) {
        issues.push({ kind: 'count_mismatch', detail: `${raw} ≠ ${only.items.length}` })
      }
    }
  }
  return issues
}

function rankingIssues(block: Extract<ReplyBlock, { type: 'account_ranking' }>): ReplyParityIssue[] {
  const issues: ReplyParityIssue[] = []
  const names = new Set<string>()
  for (const item of block.items) {
    const key = item.name.trim().toLowerCase()
    if (names.has(key)) issues.push({ kind: 'duplicate_name', detail: item.name })
    names.add(key)
  }
  const seen = new Map<string, number>()
  for (const reserve of block.not_evaluated ?? []) seen.set(reserve, 1)
  const repeated: string[] = []
  for (const item of block.items) {
    for (const reserve of new Set(item.not_evaluated ?? [])) {
      const count = (seen.get(reserve) ?? 0) + 1
      seen.set(reserve, count)
      if (count === 2) repeated.push(reserve)
    }
  }
  for (const reserve of repeated) issues.push({ kind: 'reserve_said_twice', detail: reserve })
  return issues
}
