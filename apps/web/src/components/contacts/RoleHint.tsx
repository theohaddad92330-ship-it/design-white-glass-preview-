import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { getRoleDescription } from '@/lib/contactRoles'

type RoleHintProps = {
  role: string | null | undefined
  children: ReactNode
}

/**
 * #4985.1 — « Bloqueur » s'explique partout où il s'affiche. Le survol seul (`title`) ne se lit ni au clavier ni au
 * toucher : le badge devient un arrêt de tabulation dont l'info-bulle porte la définition (`contacts:roleDescriptions`,
 * UN seul texte — GA-26). Les autres rôles se lisent d'eux-mêmes : aucun arrêt de tabulation de plus.
 */
export function RoleHint({ role, children }: RoleHintProps) {
  const description = role === 'blocker' ? getRoleDescription('blocker') : ''
  if (!description) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex max-w-full rounded-md focus-visible:outline focus-visible:outline-2">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{description}</TooltipContent>
    </Tooltip>
  )
}
