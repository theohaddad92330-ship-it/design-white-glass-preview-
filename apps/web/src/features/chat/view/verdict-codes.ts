import { i18n } from '@/i18n'
import { stripMarkdownEmphasis } from '@/lib/strip-markdown-emphasis'

/**
 * #3395 — « NO_GO_NOW s'affiche brut » (recette prod 30/09). Les six verdicts
 * d'aptitude d'un compte (`apps/ia/app/services/account_suitability.py`,
 * `VERDICTS`) sont des constantes techniques : le modèle les recopie parfois
 * telles quelles dans sa réponse. L'écran les traduit, il ne les montre pas.
 */
const VERDICT_CODES = ['GO_NOW', 'GO_VIA_PARTNER', 'GO_AFTER_PROOF', 'WATCH', 'NO_GO_NOW', 'NOT_EVALUABLE'] as const

/**
 * #3513 — le modèle écrit aussi « NO GO NOW » / « NO-GO-NOW » (recette prod
 * 01/10, 2×) : la forme à espaces ou tirets, en majuscules, est le même code.
 */
const VERDICT_PATTERN = new RegExp(
  `\`?\\b(${VERDICT_CODES.map(code => code.replace(/_/g, '[_ -]')).join('|')})\\b\`?`,
  'g',
)

export function translateVerdictCodes(text: string): string {
  return text.replace(VERDICT_PATTERN, (_match, written: string) =>
    i18n.t(`chat:accountVerdict.${written.replace(/[ -]/g, '_')}`),
  )
}

/**
 * #3243 — UN LIBELLÉ DE CHAT qui ne passe pas par le moteur markdown (bouton
 * d'option, ligne « écarté », hypothèse) : verdict traduit ET emphase retirée.
 * Les rendre `{option}` brut affichait « NO_GO_NOW » et `**gras**` tels quels.
 */
export function chatPlainText(text: string): string {
  return stripMarkdownEmphasis(translateVerdictCodes(text))
}
