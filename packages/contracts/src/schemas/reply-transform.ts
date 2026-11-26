import { z } from 'zod'
import { accountIdsInReply } from './chat-deepen.js'
import { splitReplyBlocks, type ReplyBlock } from './reply-blocks.js'

/**
 * #3768 (BEL-LAU-1014) — RETRAVAILLER UNE RÉPONSE DE LAURA SANS REPARTIR DE ZÉRO.
 *
 * Huit gestes rapides sous une réponse : approfondir, synthétiser, voir plus de
 * comptes, voir moins de détails, mieux justifier, voir seulement les priorités,
 * reformater en plan d'action, reformater en liste exportable.
 *
 * Ce n'est PAS `chat-deepen.ts` (#2452) : celui-là REJOUE des axes d'analyse
 * payants sur des comptes. Ici on TRANSFORME le texte déjà rendu — aucune
 * analyse n'est relancée, aucun crédit n'est débité par le geste lui-même.
 *
 * Ce que la transformation réutilise, et d'où cela vient (jamais deviné par le
 * modèle, toujours calculé sur la réponse source) :
 *  - le contexte : le texte de la réponse elle-même ;
 *  - le type de layout : {@link replyLayoutOf} ;
 *  - les objets déjà sélectionnés : {@link accountIdsInReply} (les comptes cités,
 *    dans l'ordre de Laura) ;
 *  - les réserves déjà posées : {@link replyReservesOf} (lignes de la réponse qui
 *    disent « partielle », « non mesuré », « à vérifier »…).
 *
 * Le service IA (`apps/ia/app/prompts/reply_transform.py`) en fait un bloc de
 * prompt. Miroir Python : mêmes huit identifiants, même ordre.
 */
export const REPLY_TRANSFORM_IDS = [
  'deepen',
  'synthesize',
  'more_accounts',
  'less_detail',
  'justify',
  'priorities_only',
  'action_plan',
  'exportable_list',
] as const
export type ReplyTransformId = (typeof REPLY_TRANSFORM_IDS)[number]

export const REPLY_LAYOUTS = ['table', 'list', 'plan', 'prose'] as const
export type ReplyLayout = (typeof REPLY_LAYOUTS)[number]

/** Le texte source finit dans un prompt : borné ici, une seule fois. */
const SOURCE_MAX = 12_000
const RESERVE_MAX = 240
const RESERVES_MAX = 6

export const replyTransformRequestSchema = z.object({
  id: z.enum(REPLY_TRANSFORM_IDS),
  sourceText: z.string().min(1).max(SOURCE_MAX),
  layout: z.enum(REPLY_LAYOUTS),
  accountIds: z.array(z.string().guid()).max(25).default([]),
  reserves: z.array(z.string().min(1).max(RESERVE_MAX)).max(RESERVES_MAX).default([]),
})
export type ReplyTransformRequest = z.infer<typeof replyTransformRequestSchema>

const TABLE_ROW = /^\s*\|.+\|\s*$/
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+\S/
const HEADING = /^\s*#{1,4}\s+\S/
const PLAN_HEADING = /^\s*#{1,4}\s+.*(plan|étapes?|steps?|next steps|prochaines)/i

/**
 * La FORME de la réponse, lue sur son texte : tableau (≥ 2 lignes `| … |`),
 * plan (un titre qui le dit), liste (≥ 2 puces ou numéros) — sinon prose.
 */
export function replyLayoutOf(text: string): ReplyLayout {
  const lines = text.split('\n')
  if (lines.filter(line => TABLE_ROW.test(line)).length >= 2) return 'table'
  if (lines.some(line => PLAN_HEADING.test(line)) && lines.some(line => LIST_ITEM.test(line))) return 'plan'
  if (lines.filter(line => LIST_ITEM.test(line)).length >= 2) return 'list'
  return 'prose'
}

const RESERVE_MARKERS =
  /\b(partielle?s?|non mesuré|non évaluable|incomplète?s?|à vérifier|sous réserve|non confirmé|pas pu être|partial(?:ly)?|not measured|not assessable|incomplete|to be verified|unconfirmed|could not be)\b/i

/**
 * Les RÉSERVES déjà posées par la réponse : ses propres lignes, mot pour mot.
 * Rien n'est paraphrasé ni ajouté — une réserve absente reste absente.
 */
export function replyReservesOf(text: string): string[] {
  const found: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || TABLE_ROW.test(line) || HEADING.test(line)) continue
    if (RESERVE_MARKERS.test(line) && line.length <= RESERVE_MAX && !found.includes(line)) found.push(line)
    if (found.length >= RESERVES_MAX) break
  }
  return found
}

const LONG_REPLY = 400

/** Les cartes dont les objets sont des COMPTES (« voir plus de comptes » y a un sens). */
const ACCOUNT_CARDS: ReadonlySet<ReplyBlock['type']> = new Set([
  'account_ranking',
  'account_map',
  'account_volume_sprint',
])

/**
 * #3768 (lot L1 07/10) — les OBJETS que portent les cartes d'une réponse (lignes d'un classement, comptes ou
 * groupes d'une cartographie, lignes d'un export…). Une réponse en carte n'a ni puce ni ligne de tableau : sans
 * ce compte, « Voir seulement les priorités » et « Voir plus de comptes » disparaissaient sous une priorisation.
 */
function replyCardObjects(text: string): { objects: number; accountCards: boolean } {
  let objects = 0
  let accountCards = false
  for (const segment of splitReplyBlocks(text)) {
    if (segment.kind !== 'block') continue
    const block = segment.block as Record<string, unknown>
    for (const key of ['items', 'accounts', 'rows', 'sprint']) {
      const value = block[key]
      if (Array.isArray(value)) objects += value.length
    }
    const groups = block.groups
    if (Array.isArray(groups)) {
      for (const group of groups) {
        const items = (group as { items?: unknown }).items
        if (Array.isArray(items)) objects += items.length
      }
    }
    if (ACCOUNT_CARDS.has(segment.block.type)) accountCards = true
  }
  return { objects, accountCards }
}

/**
 * Les gestes qui ont un sens POUR CETTE réponse, dans l'ordre de l'issue.
 * Une absence ne fait aucune ligne : pas de « plus de comptes » sans compte cité,
 * pas de « liste » sur une liste, pas de « condenser » une réponse déjà courte.
 */
export function replyTransformsFor(text: string): ReplyTransformId[] {
  // RV4-E-FIX 4287.4 — un état vide (carte `missing_data` seule) n'a rien à retravailler : le geste serait répété
  // à l'identique sous chaque vide ; la suite possible est portée par la carte elle-même.
  const segments = splitReplyBlocks(text)
  const blocks = segments.filter(segment => segment.kind === 'block')
  if (blocks.length > 0 && blocks.every(segment => segment.block.type === 'missing_data')) return []
  const layout = replyLayoutOf(text)
  const cards = replyCardObjects(text)
  const accounts = accountIdsInReply(text).length + (cards.accountCards ? 1 : 0)
  const items = text.split('\n').filter(line => LIST_ITEM.test(line) || TABLE_ROW.test(line)).length + cards.objects
  const long = text.length >= LONG_REPLY
  return REPLY_TRANSFORM_IDS.filter(id => {
    switch (id) {
      case 'more_accounts':
        return accounts > 0
      case 'synthesize':
      case 'less_detail':
        return long
      case 'priorities_only':
        return items >= 2
      case 'action_plan':
        return layout !== 'plan'
      case 'exportable_list':
        return layout !== 'list'
      default:
        return true
    }
  })
}

/** Le corps envoyé avec le tour : la réponse source et ce qu'on en a lu. */
export function replyTransformRequestFor(id: ReplyTransformId, sourceText: string): ReplyTransformRequest {
  return {
    id,
    sourceText: sourceText.slice(0, SOURCE_MAX),
    layout: replyLayoutOf(sourceText),
    accountIds: accountIdsInReply(sourceText),
    reserves: replyReservesOf(sourceText),
  }
}
