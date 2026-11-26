import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'

/**
 * « ASSISTANTE IA » — la mention, rendue par le PRODUIT, sur chaque surface où
 * Laura parle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Article 50 de l'EU AI Act, applicable depuis le 02/08/2026 : une personne qui
 * interagit avec un système d'IA doit le savoir. La mention existait dans le
 * système-prompt de Laura (« tu es une assistante IA et tu le dis si on te le
 * demande »), ce qui n'est pas la même chose : **l'obligation est de le savoir
 * SANS avoir à le demander.**
 *
 * Et un prompt n'est pas une garantie. Il se réécrit sans qu'aucun test ne
 * tombe, il dépend d'un modèle qui décide, et il n'existe pas du tout sur les
 * surfaces qui affichent du texte préparé plutôt qu'une réponse en direct. Le
 * seul endroit où la mention peut être TENUE est le rendu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PATRON EST CELUI DU SITE PUBLIC, PAS UN SECOND
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/website/src/features/chatbot/ChatWidget.tsx` le fait déjà, et sa garde
 * GL-07 le tient : la mention vit dans l'EN-TÊTE, à côté du nom, lue avant le
 * premier message, et **jamais dans l'avatar** — un avatar la ferait disparaître
 * partout où il est petit. On emprunte les trois décisions telles quelles.
 *
 * Ce qui change ici : elle est rendue par UN composant partagé et non recopiée
 * sur chaque écran. Trois surfaces l'affichent aujourd'hui ; la quatrième
 * naîtra sans elle si la mention est un bout de JSX qu'il faut penser à
 * recopier. GA-246 refuse qu'une surface conversationnelle naisse sans elle.
 *
 * ⚠️ Elle n'est pas une note de bas de page et ne se réduit pas à un
 * `title`/`aria-label` : elle est du texte VISIBLE. Le `size="xs"` est le
 * plancher de l'échelle (12 px, D80), pas une taille arbitraire, et la couleur
 * passe par un jeton — les deux thèmes sont une promesse.
 */
export function AiDisclosure({ className }: { className?: string }) {
  const { t } = useTranslation('laura')
  return (
    <Text
      element="p"
      size="xs"
      color="text-[var(--bellum-text-secondary)]"
      leading="tight"
      className={className}
      data-ai-disclosure
    >
      {t('disclosure.role')}
    </Text>
  )
}
