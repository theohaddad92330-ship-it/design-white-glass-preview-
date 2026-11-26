import { useTranslation } from 'react-i18next'
import { GitCommitVertical, History, Send, Workflow } from 'lucide-react'
import { Text } from '@bellum/ui'
import { formatDate } from '@/lib/locale'
import { CardLink, ItemName, ReplyCard, type BlockOf } from './ReplyCard'

type TimelineEvent = BlockOf<'timeline'>['events'][number]

// #2271.19 — l'historique d'UN compte, rendu DANS la conversation.
//
// Réutilise la MÊME lecture que la fiche de compte (`GET /accounts/:id/timeline`,
// `AccountTimelineCard.tsx`) : cette carte ne recalcule rien, elle montre ce que
// l'écran de fiche montre déjà. Un compte réellement sans historique rend
// `events: []`, et cette carte le DIT (GA-18/19) plutôt que de rendre une bulle
// vide ou de disparaître.
//
// #2271.16/.19 (recette écran 18/09/2026) — la date d'un événement passe
// TOUJOURS par `formatDate` (`@/lib/locale`, GA-26 : une dérivation « date
// lisible » vit à un seul endroit, déjà établi pour `Provenance`). Avant ce
// correctif, la carte appelait `.toLocaleDateString(language)` à la main —
// `language` valait `i18n.language` ('fr'/'en'), jamais le couple canonique
// `fr-FR`/`en-GB` — et rendait l'ISO BRUT dès que `new Date(event.at)`
// échouait (un jour de calendrier impossible passe la regex du contrat mais
// pas `Date`). Une date illisible se NOMME désormais (GA-18/19), elle ne
// s'affiche plus telle quelle.
export function TimelineCard({ block }: { block: BlockOf<'timeline'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.timeline')} icon={History}>
      {block.account ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          <ItemName name={block.account.name} href={block.account.href} />
        </Text>
      ) : null}
      {block.events.length === 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('blocks.timelineEmpty')}
        </Text>
      ) : (
        <ol className="flex flex-col gap-3">
          {block.events.map((event, index) => (
            <TimelineRow key={`event-${index}`} event={event} />
          ))}
        </ol>
      )}
    </ReplyCard>
  )
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const { t } = useTranslation('chat')
  const when = formatDate(event.at)
  return (
    <li className="flex gap-2">
      <span className="mt-0.5 shrink-0">
        <EventIcon kind={event.kind} />
      </span>
      <div className="min-w-0">
        <Text element="p" size="sm" className="line-clamp-2" title={event.label}>
          {event.label}
        </Text>
        {event.detail ? (
          <Text element="p" size="xs" className="line-clamp-2 text-[var(--bellum-text-secondary)]" title={event.detail}>
            {event.detail}
          </Text>
        ) : null}
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {when ?? t('blocks.dateUnreadable')}
        </Text>
      </div>
    </li>
  )
}

function EventIcon({ kind }: { kind: TimelineEvent['kind'] }) {
  if (kind === 'action') return <Send className="size-3.5 text-[var(--bellum-text-accent)]" />
  if (kind === 'workflow') return <Workflow className="size-3.5 text-[var(--bellum-text-accent)]" />
  return <GitCommitVertical className="size-3.5 text-[var(--bellum-text-secondary)]" />
}
