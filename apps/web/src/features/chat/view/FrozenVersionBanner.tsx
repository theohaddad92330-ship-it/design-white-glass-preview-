import { useTranslation } from 'react-i18next'
import { Link, useLocation } from '@tanstack/react-router'
import { Snowflake } from 'lucide-react'
import { Text } from '@bellum/ui'

/**
 * #2430.4 — `?version=` d'un lien FIGÉ, lu comme un entier strictement positif.
 * Toute autre valeur (absente, vide, « abc », « 0 », « 1.5 ») rend `null` : le
 * fil est alors lu VIVANT — jamais une borne devinée.
 */
export function frozenVersionFrom(raw: string | null | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const version = Number(raw)
  return Number.isSafeInteger(version) && version > 0 ? version : null
}

/**
 * #2430.4 — le bandeau d'une VERSION FIGÉE. Le serveur borne déjà la lecture
 * (`GET chat/messages?version=`) ; ce bandeau DIT que ce qui a été écrit après
 * n'apparaît pas, et mène au fil vivant. Il ne s'affiche que sur le fil que le
 * lien désigne : changer de conversation le fait disparaître.
 */
export function FrozenVersionBanner({
  accountId,
  conversationId,
}: {
  accountId: string | null
  conversationId: string | null
}) {
  const { t } = useTranslation('chat')
  const search = useLocation().search as Record<string, unknown>
  const raw = search.version
  const version = frozenVersionFrom(typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null)
  if (!version || !conversationId || search.conversationId !== conversationId) return null
  return (
    <div
      role="status"
      className="mx-4 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg-darker)] px-3 py-2"
    >
      <Snowflake aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" />
      <Text element="p" size="sm" className="flex-1">
        {t('version.banner', { version })}
      </Text>
      <Link
        to="/chat"
        search={{ conversationId, ...(accountId ? { accountId } : {}) }}
        className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
      >
        {t('version.live')}
      </Link>
    </div>
  )
}
