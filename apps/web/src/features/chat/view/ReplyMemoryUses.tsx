import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Brain, Lock, Users } from 'lucide-react'
import type { ReplyMemoryUses as ReplyMemoryUsesData } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useReplyMemoryUses } from '@/features/memory/hooks/useReplyMemoryUses'

/**
 * #1916.18 / #1916.24 — SOUS UNE RÉPONSE : LA MÉMOIRE CONSULTÉE.
 *
 * ⚠️ Le libellé dit ce qu'on sait PROUVER. Ces éléments étaient dans le contexte
 * transmis à Laura pour cette réponse ; rien ne dit qu'elle s'en est servie. Le
 * panneau dit donc « consultée » et « avait en tête », jamais « utilisée ».
 *
 * Un élément « Toi uniquement » d'un collègue n'arrive ici que comme un COMPTE :
 * le serveur ne sert ni son texte ni son identifiant (`replyMemoryUsesSchema`,
 * `.strict()`). Un élément supprimé depuis se dit « retiré depuis ».
 *
 * Monté à l'OUVERTURE du panneau seulement (`ReplyFooter`) : c'est ce qui borne
 * la lecture réseau à un panneau ouvert, et non à chaque bulle.
 */
export function ReplyMemoryUses({ messageId }: { messageId: string }) {
  const { t } = useTranslation('chat')
  const { data, isLoading, isError } = useReplyMemoryUses(messageId)

  return (
    <section>
      <div className="mb-1 flex items-center gap-1.5">
        <Brain className="size-3.5 text-[var(--bellum-text-secondary)]" aria-hidden />
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('disclosure.memoryUses.title')}
        </Text>
      </div>
      {isLoading ? (
        <MutedLine text={t('disclosure.memoryUses.loading')} />
      ) : isError || !data ? (
        <MutedLine text={t('disclosure.memoryUses.unavailable')} />
      ) : (
        <ReplyMemoryUsesBody data={data} />
      )}
    </section>
  )
}

function ReplyMemoryUsesBody({ data }: { data: ReplyMemoryUsesData }) {
  const { t } = useTranslation('chat')
  if (data.consulted.length === 0 && data.privateCount === 0 && data.removedCount === 0) {
    return <MutedLine text={t('disclosure.memoryUses.none')} />
  }
  return (
    <div className="space-y-1">
      <MutedLine text={t('disclosure.memoryUses.caption')} />
      {data.consulted.length > 0 ? (
        <ul className="space-y-1">
          {data.consulted.map(item => (
            <li key={item.id} className="flex flex-wrap items-center gap-1.5">
              <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="line-clamp-2 break-words">
                {item.text}
              </Text>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--bellum-border)] px-1.5 text-xs text-[var(--bellum-text-muted)]">
                {item.scope === 'user' ? (
                  <Lock className="size-2.5" aria-hidden />
                ) : (
                  <Users className="size-2.5" aria-hidden />
                )}
                {t(`disclosure.memoryUses.scope.${item.scope}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {data.privateCount > 0 ? (
        <MutedLine text={t('disclosure.memoryUses.private', { count: data.privateCount })} />
      ) : null}
      {data.removedCount > 0 ? (
        <MutedLine text={t('disclosure.memoryUses.removed', { count: data.removedCount })} />
      ) : null}
      <Link
        to="/settings/memory"
        className="inline-flex items-center gap-0.5 rounded text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
      >
        {t('disclosure.memoryUses.manage')}
        <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  )
}

function MutedLine({ text }: { text: string }) {
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]">
      {text}
    </Text>
  )
}
