import {
  REPLY_PLAIN_TEXT_LABEL_KEYS,
  replyCompact as contractReplyCompact,
  replyMarkdown as contractReplyMarkdown,
  replyPlainText as contractReplyPlainText,
  type ReplyPlainTextLabels,
} from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * #1914 — UNE RÉPONSE À CARTES, EN TEXTE, DANS LA LANGUE DE L'INTERFACE.
 *
 * Deux gestes du web reçoivent le TEXTE d'une réponse et non son rendu : la
 * copie et l'épingle en mémoire (`ReplyFooter`, via `Chat.tsx`), et la bulle
 * flottante, qui rend du texte brut. Sans conversion ils recevraient la clôture
 * `bellum-block` et son JSON.
 *
 * L'algorithme vit dans le contrat (`replyPlainText`, partagé avec l'API) ; ce
 * module ne fait que lui passer les TRADUCTIONS : `i18n` est la même instance
 * que l'interface (`laura-turn.ts` la lit déjà ainsi), donc les libellés suivent
 * la langue affichée — ceux des cartes à l'écran (`blocks.*`), et « non mesuré »
 * de `UnknownValue`.
 */
function interfaceLabels(): ReplyPlainTextLabels {
  return Object.fromEntries(
    REPLY_PLAIN_TEXT_LABEL_KEYS.map(key => [
      key,
      key === 'notMeasured' ? i18n.t('unknownValue', { ns: 'common' }) : i18n.t(`blocks.${key}`, { ns: 'chat' }),
    ]),
  ) as ReplyPlainTextLabels
}

export function replyPlainText(text: string): string {
  return contractReplyPlainText(text, interfaceLabels())
}

/** #3770 — la forme STRUCTURÉE d'une réponse (titres, tableaux, étapes), mêmes libellés que l'écran. */
export function replyMarkdown(text: string): string {
  return contractReplyMarkdown(text, interfaceLabels())
}

/** #3770 — la forme COMPACTE d'une réponse : conclusions et éléments classés, sans le détail. */
export function replyCompact(text: string): string {
  return contractReplyCompact(text, interfaceLabels())
}
