import { Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@bellum/ui'
import type { ProjectRow } from '@bellum/contracts'
import { Check, ChevronDown, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProjectOwners } from '../hooks/useProjectOwners'
import { useUpdateProjectOwner } from '../hooks/useUpdateProjectOwner'

/**
 * #2170.26 — ATTRIBUER, PAS SEULEMENT LIRE.
 *
 * L'owner d'une opportunité se LISAIT déjà partout (carte du pipe, tableau, ce
 * même tiroir) — `ownerName` sur `useProjectOwners`. Rien ne l'ÉCRIVAIT :
 * `PATCH /projects/:id/owner` existe côté serveur depuis la conversion d'une
 * piste (`ProjectsController.updateOwner`), sans second appelant. C'est
 * exactement le motif que `CLAUDE.md` nomme : « du code juste, calculé,
 * testé, que personne n'appelle ».
 *
 * Même forme que `ProjectStageControl` (badge + menu déroulant) : un porteur
 * absent affiche « Non attribué », jamais un nom deviné — l'attribuer hors de
 * l'espace serait un porteur fantôme, refusé côté serveur
 * (`workspaceContext.assertMember`).
 */
export function ProjectOwnerControl({ opportunity }: { opportunity: ProjectRow }) {
  const { t } = useTranslation('projects')
  const { members } = useProjectOwners()
  const update = useUpdateProjectOwner()
  const current = opportunity.owner_id
  const currentName = current ? (members.find(member => member.id === current)?.name ?? null) : null

  const choose = (ownerId: string | null) => {
    if (ownerId === current) return
    update.mutate({ id: opportunity.id, ownerId })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={update.isPending}
            className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:opacity-60"
            aria-label={t('owner.change')}
          >
            <UserRound className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden="true" />
            <Badge variant="secondary">{currentName ?? t('owner.unassigned')}</Badge>
            <ChevronDown className="size-3 text-[var(--bellum-text-muted)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem disabled={update.isPending} onSelect={() => choose(null)}>
            <span className="flex-1">{t('owner.unassigned')}</span>
            {current === null ? <Check className="size-3.5 text-[var(--bellum-text-accent)]" /> : null}
          </DropdownMenuItem>
          {members.map(member => (
            <DropdownMenuItem key={member.id} disabled={update.isPending} onSelect={() => choose(member.id)}>
              <span className="flex-1">{member.name}</span>
              {current === member.id ? <Check className="size-3.5 text-[var(--bellum-text-accent)]" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
