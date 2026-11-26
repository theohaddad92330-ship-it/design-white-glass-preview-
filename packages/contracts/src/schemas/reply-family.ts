import { z } from 'zod'
import { REPLY_BLOCK_TYPES, splitReplyBlocks } from './reply-blocks.js'

/**
 * #3758 (BEL-LAU-1001) — LES FAMILLES DE RÉPONSE DE LAURA.
 *
 * Miroir de `apps/ia/app/services/reply_family.py` (le routeur, côté tour de
 * chat) : même liste de familles, même table famille → cartes qui la
 * satisfont. La parité est tenue par `reply-family.parity.test.ts`, qui LIT le
 * fichier Python — deux langages, une seule liste (GA-26).
 *
 * #3758 (reste du lot J14) — `post_meeting_summary` est désormais ROUTÉE : sa
 * source existe (`notes.meeting_recap_snapshot`), lue par `get_account_briefing`
 * et bâtie en carte par `known_shape_gate.py` — jamais le texte libre du modèle.
 * `generic_rich_answer` reste la seule famille SANS carte (`cards` vide) :
 * le repli, jamais exigé.
 */
export const REPLY_FAMILY_KEYS = [
  'account_map',
  'account_analysis',
  'contacts_list',
  'action_plan',
  'meeting_brief',
  'post_meeting_summary',
  'market_memory_summary',
  'sequence_audience',
  'opportunity_review',
  'generic_rich_answer',
  // #3767 / #3771 (lot L1 07/10) — priorisation et classement de comptes, après les dix du ticket #3758.
  'account_priorities',
  'account_ranking',
  // #2985 (lot R22 07/10) — « point manager » sans compte nommé, après #3767/#3771.
  'account_manager_overview',
  // #4287.4 (29/10) — « prochaine action et ce qui manque » sur un compte : une seule famille de rendu.
  'account_next_step',
] as const

export type ReplyFamilyKey = (typeof REPLY_FAMILY_KEYS)[number]

type ReplyBlockType = (typeof REPLY_BLOCK_TYPES)[number]

/** Les cartes qui SATISFONT chaque famille — la première est celle que la consigne du tour demande. */
export const REPLY_FAMILY_CARDS: Readonly<Record<ReplyFamilyKey, readonly ReplyBlockType[]>> = {
  account_map: ['account_map', 'account_ranking'],
  account_analysis: ['account_card', 'verdict', 'approach'],
  contacts_list: ['contact_list'],
  action_plan: ['action_plan'],
  meeting_brief: ['meeting_brief'],
  post_meeting_summary: ['post_meeting_summary'],
  market_memory_summary: ['account_volume_sprint', 'count_contract', 'account_map', 'account_ranking'],
  sequence_audience: ['contact_list'],
  opportunity_review: ['account_ranking', 'verdict', 'comparison'],
  generic_rich_answer: [],
  account_priorities: ['account_ranking', 'file_export'],
  account_ranking: ['account_ranking'],
  // #2985 (lot E07 08/10) — la MÊME famille sert les deux formes : « point manager »
  // sans compte nommé rend le portefeuille (`account_ranking`/`file_export`,
  // lot R22 07/10) ; sur UN compte nommé, `get_account_manager_review` est
  // appelé et sa carte `manager_review` la satisfait aussi — jamais une
  // seconde famille pour la même phrase (GA-26).
  account_manager_overview: ['account_ranking', 'file_export', 'manager_review'],
  // #4287.4 — la carte `verdict` porte les quatre sections du CONSEIL ; `known_shape_gate.py` y ramène toute autre forme.
  account_next_step: ['verdict'],
}

/**
 * Ce que le tour a RÉELLEMENT produit pour sa famille : une carte attendue
 * (`structured`), ou du texte alors que la famille est connue (`text_fallback`).
 */
export const REPLY_FAMILY_OUTCOMES = ['structured', 'text_fallback'] as const

export const replyFamilyContextSchema = z.object({
  family: z.enum(REPLY_FAMILY_KEYS),
  outcome: z.enum(REPLY_FAMILY_OUTCOMES),
})

export type ReplyFamilyContext = z.infer<typeof replyFamilyContextSchema>

/**
 * Lot L1 07/10 (#3760 / #3762) — le repli en texte se juge AUSSI sur la réponse rendue : si elle porte une
 * carte que la famille accepte (posée par la porte de forme `known_shape_gate.py`, ou écrite par Laura), ou
 * une absence NOMMÉE (`missing_data`), le bandeau « restée en texte » mentirait — même pour un message
 * persisté avant la porte. Miroir de `reply_family_outcome` (Python).
 */
export function replyFamilyFellBackToText(family: ReplyFamilyContext | undefined, text: string): boolean {
  if (!family || family.outcome !== 'text_fallback') return false
  const accepted: readonly string[] = REPLY_FAMILY_CARDS[family.family]
  return !splitReplyBlocks(text).some(
    segment =>
      segment.kind === 'block' && (accepted.includes(segment.block.type) || segment.block.type === 'missing_data'),
  )
}
