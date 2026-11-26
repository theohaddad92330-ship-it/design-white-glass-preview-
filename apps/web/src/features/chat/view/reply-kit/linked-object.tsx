import type { LucideIcon } from 'lucide-react'
import { cn } from '@bellum/ui'
import { appRouteTarget } from '@/components/navigation/known-routes'
import { InternalLink } from '../markdown'

/**
 * #3761 — PASTILLE D'OBJET LIÉ (compte, contact, mission, opportunité).
 *
 * Elle mène à un écran qui EXISTE : `appRouteTarget` (GA-277), comme les cartes
 * de réponse. Une route inconnue reste un libellé lisible, jamais un lien mort.
 */
export function ReplyObjectPill({
  label,
  href,
  icon: Icon,
}: {
  label: string
  href?: string | null
  icon?: LucideIcon
}) {
  const target = href ? appRouteTarget(href) : null
  const body = (
    <>
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      <span className="truncate">{label}</span>
    </>
  )
  const frame =
    'inline-flex min-h-6 max-w-full items-center gap-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 text-xs font-medium'
  if (!target) {
    return (
      <span data-reply-object-pill className={cn(frame, 'text-[var(--bellum-text-secondary)]')}>
        {body}
      </span>
    )
  }
  return (
    <span data-reply-object-pill className={cn(frame, 'text-[var(--bellum-text-accent)] pointer-coarse:min-h-11')}>
      <InternalLink to={target} label={body} />
    </span>
  )
}
