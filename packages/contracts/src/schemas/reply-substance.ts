import type { ReplyBlock } from './reply-blocks.js'

/**
 * #3771 (BEL-LAU-1018) — UNE RÉPONSE RICHE NE MAQUILLE JAMAIS UNE FAIBLESSE DE FOND.
 *
 * Une carte met en forme ; elle ne rend pas une donnée plus certaine. Ce module
 * relit les blocs d'UNE réponse et NOMME ce que leur forme laisserait croire :
 * un seul compte présenté comme un classement, huit lignes dont deux seulement
 * portent une source datée, une comparaison dont la plupart des cellules ne sont
 * pas mesurées. Il ne juge pas le CONTENU (aucun modèle, aucune probabilité) : il
 * COMPTE ce que le contrat dit déjà — `source` présente ou absente, cellule `null`.
 *
 * Il ne produit aucun texte : seulement un constat (`reason` + `found`/`total`),
 * que l'écran écrit en FR/EN. Un constat vit à côté de la carte, jamais dans une
 * liste : « une absence ne fait aucune ligne » reste vrai pour les lignes d'une
 * liste ; ici c'est la LISTE ENTIÈRE qui dit ce qu'elle n'établit pas.
 *
 * `missing_data` et `count_contract` nomment déjà leurs limites : ils ne
 * reçoivent jamais d'avis (on ne dit pas deux fois la même chose, GA-26).
 */

const REPLY_SUBSTANCE_REASONS = [
  /** Un seul élément : ce n'est pas un classement, c'est une fiche. */
  'list_not_ranking',
  /** Aucun élément ne porte de source datée. */
  'no_dated_source',
  /** Moins de la moitié des éléments (sur quatre ou plus) portent une source datée. */
  'few_dated_sources',
  /** La moitié ou plus des cellules d'une comparaison ne sont pas mesurées. */
  'mostly_unmeasured',
] as const

export type ReplySubstanceReason = (typeof REPLY_SUBSTANCE_REASONS)[number]

export interface ReplySubstanceFinding {
  /** Rang du bloc parmi les blocs de la réponse (même ordre que `chatArtifactId`). */
  block: number
  type: ReplyBlock['type']
  reason: ReplySubstanceReason
  /** Ce qui est renseigné… */
  found: number
  /** …sur ce qui était attendu. */
  total: number
}

/** En dessous, une grille ou une liste est trop courte pour que « la plupart » veuille dire quelque chose. */
const MIN_ITEMS_FOR_SHARE = 4

function sourceFindings(
  block: number,
  type: 'account_ranking' | 'contact_list',
  items: ReadonlyArray<{ source?: unknown }>,
): ReplySubstanceFinding[] {
  const total = items.length
  const found = items.filter(item => item.source !== undefined).length
  const out: ReplySubstanceFinding[] = []
  if (type === 'account_ranking' && total === 1) out.push({ block, type, reason: 'list_not_ranking', found: 1, total })
  if (found === 0 && total > 1) out.push({ block, type, reason: 'no_dated_source', found, total })
  else if (total >= MIN_ITEMS_FOR_SHARE && found * 2 < total) {
    out.push({ block, type, reason: 'few_dated_sources', found, total })
  }
  return out
}

export function assessReplySubstance(blocks: readonly ReplyBlock[]): ReplySubstanceFinding[] {
  // #4065 — un tableau plus long que la carte : la carte n'en est qu'un extrait (plafonné par le serveur).
  // Son « N lignes » serait un plafond interne posé à côté du tableau réel : on ne chiffre pas ce qu'on ne
  // peut pas dire du tableau entier.
  const tableRows = Math.max(0, ...blocks.map(block => (block.type === 'file_export' ? block.rows.length : 0)))
  return blocks.flatMap((block, rank): ReplySubstanceFinding[] => {
    switch (block.type) {
      case 'account_ranking':
      case 'contact_list':
        return tableRows > block.items.length ? [] : sourceFindings(rank, block.type, block.items)
      case 'comparison': {
        const cells = block.rows.flatMap(row => row.cells)
        const found = cells.filter(cell => cell !== null).length
        return cells.length >= MIN_ITEMS_FOR_SHARE && found * 2 <= cells.length
          ? [{ block: rank, type: block.type, reason: 'mostly_unmeasured', found, total: cells.length }]
          : []
      }
      default:
        return []
    }
  })
}
