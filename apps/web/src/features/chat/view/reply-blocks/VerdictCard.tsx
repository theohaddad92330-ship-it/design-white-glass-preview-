import { useTranslation } from 'react-i18next'
import { Gavel, User } from 'lucide-react'
import { Text } from '@bellum/ui'
import { renderInlineMarkdown } from '../markdown'
import { ReplyDisclosure } from '../ReplyDisclosure'
import { ReplyObjectPill } from '../reply-kit'
import { CardLink, InlineLabel, LabeledLines, ReplyCard, type BlockOf } from './ReplyCard'

const LEAD_REASONS = 3

/**
 * #1914.2 — un verdict : la conclusion, ses raisons nommées, ses limites. Jamais une probabilité.
 *
 * #3395.1 (recette prod 30/09/2026) — deux champs de plus, seulement quand Laura
 * les a réellement remplis : la ROUTE recommandée (le périmètre d'approche, en
 * une phrase — distincte de la conclusion et du prochain geste) et la PERSONNE
 * utile MAINTENANT (jamais devinée — seulement un contact qu'un outil a rendu).
 * « On n'affiche pas ce qu'on n'a pas » : les deux restent absents tant que
 * Laura ne les écrit pas, aucune ligne vide.
 *
 * #3763.1 (recette prod 08/10, 8c42a4032c) — c'est CETTE carte que Laura rend
 * le plus souvent, pas le gabarit markdown : `ReplyDisclosure`/niveau 2
 * existaient déjà (#3763) mais n'étaient câblés que sur `StructuredReply`,
 * jamais ici — 0 repli, tout ouvert. Les trois premières raisons restent au
 * niveau 1 (la raison courte, jamais cachée) ; la suite se plie derrière
 * « Voir pourquoi ». « Ce qui manque » (ex-« Limites ») ne se plie jamais —
 * c'est une réserve principale, pas du détail (voir `reply-disclosure.ts`).
 */
export function VerdictCard({ block }: { block: BlockOf<'verdict'> }) {
  const { t } = useTranslation('chat')
  const reasons = block.reasons ?? []
  const leadReasons = reasons.slice(0, LEAD_REASONS)
  const restReasons = reasons.slice(LEAD_REASONS)
  return (
    <ReplyCard type={block.type} title={t('blocks.kind.verdict')} icon={Gavel}>
      <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
        {renderInlineMarkdown(block.conclusion)}
      </Text>
      <LabeledLines label={t('blocks.why')} lines={leadReasons} />
      {restReasons.length ? (
        <ReplyDisclosure kind="why">
          <LabeledLines label={t('blocks.why')} lines={restReasons} />
        </ReplyDisclosure>
      ) : null}
      <LabeledLines label={t('blocks.limits')} lines={block.limits} />
      {block.route ? <InlineLabel label={t('blocks.route')}>{renderInlineMarkdown(block.route)}</InlineLabel> : null}
      {block.contact ? (
        <InlineLabel label={t('blocks.contact')}>
          {/* #3761.12 — la personne utile est la pastille d'objet lié de la bibliothèque. */}
          <ReplyObjectPill
            label={block.contact.role ? `${block.contact.name} — ${block.contact.role}` : block.contact.name}
            href={block.contact.href}
            icon={User}
          />
        </InlineLabel>
      ) : null}
      {block.next_action ? (
        <InlineLabel label={t('blocks.nextAction')}>
          <CardLink href={block.next_action.href}>{block.next_action.label}</CardLink>
        </InlineLabel>
      ) : null}
    </ReplyCard>
  )
}
