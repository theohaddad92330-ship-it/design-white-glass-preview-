import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
import { Text } from '@bellum/ui'
import { renderInlineMarkdown } from '../markdown'
import { ReplyPartialState } from '../reply-kit'
import { CardLink, InlineLabel, LabeledLines, ReplyCard, type BlockOf } from './ReplyCard'

/**
 * #1914.9 — erreur ou donnée manquante.
 *
 * Le prompt décrivait déjà ces deux formes en texte (`_BLOCK_FORMAT`, ERREUR et
 * DONNÉE MANQUANTE). La carte les sépare à l'œil : ce qui a ÉCHOUÉ pendant le
 * tour (à reprendre), ce qui MANQUE dans l'espace (à combler, avec le geste qui
 * le comble), et ce qui reste faisable sans. « Il manque la date de fin de la
 * mission », jamais « données incomplètes » : un manque nommé se répare.
 *
 * #3761.16 — la liste « ce qui manque » compose le panneau générique de la
 * bibliothèque (`ReplyPartialState`) plutôt que de bricoler son propre `<ul>` :
 * `title` lui est volontairement OMIS (le cadre `ReplyCard` porte déjà le
 * titre — GA-26, un titre ne s'écrit pas deux fois). Chaque ligne garde sa
 * fidélité d'avant (`why`, et `how` cliquable via `CardLink`) par `detail`.
 */
export function MissingDataCard({ block }: { block: BlockOf<'missing_data'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.missing_data')} icon={AlertCircle}>
      <ReplyPartialState
        missing={block.missing.map(item => ({
          what: item.what,
          detail: (
            <>
              {item.why ? (
                <Text size="sm" element="div" color="text-[var(--bellum-text-secondary)]">
                  {renderInlineMarkdown(item.why)}
                </Text>
              ) : null}
              {/* #2594 — la marche suivante se clique : `href` structuré si Laura
                  l'a rempli, sinon le lien markdown DANS `how` (vu en production
                  le 18/09/2026) — `CardLink` gère les deux avec le même moteur. */}
              <InlineLabel label={t('blocks.howToGet')}>
                <CardLink href={item.href}>{item.how}</CardLink>
              </InlineLabel>
            </>
          ),
        }))}
        footer={<LabeledLines label={t('blocks.stillPossible')} lines={block.still_possible} />}
      >
        <LabeledLines label={t('blocks.failed')} lines={block.failed} />
      </ReplyPartialState>
    </ReplyCard>
  )
}
