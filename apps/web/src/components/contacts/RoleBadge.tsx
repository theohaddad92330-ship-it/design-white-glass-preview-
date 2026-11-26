import { cn } from '@bellum/ui'
import { getRoleColors, getRoleLabel } from '@/lib/contactRoles'
import { RoleHint } from './RoleHint'

type RoleBadgeProps = {
  role: string
}

/** Pastille colorée du rôle décisionnel — Sponsor / Champion / etc. */
export function RoleBadge({ role }: RoleBadgeProps) {
  // 13/10/2026 — on n'affiche pas ce qu'on n'a pas : « Inconnu » répété sur chaque ligne n'informe de rien.
  if (!role || role === 'unknown' || role === '-') return null
  const colors = getRoleColors(role)
  return (
    <RoleHint role={role}>
      <span
        className={cn(
          'inline-flex max-w-full items-center whitespace-normal break-words rounded-md px-2.5 py-0.5 text-left text-xs font-medium capitalize leading-tight text-black',
          colors.bg,
          colors.border,
        )}
      >
        {getRoleLabel(role)}
      </span>
    </RoleHint>
  )
}
