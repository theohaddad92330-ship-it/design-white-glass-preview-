import type { ActionHistoryItem } from '@bellum/contracts'
import { Link, useNavigate } from '@tanstack/react-router'
import { Badge, TableCell, TableRow, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { actionIconByCategory, actionStatusLabel, formatActionDate } from './actionHistoryPresentation'
import { ActionCell, EntityCell, RowActions, UserCell } from './ActionHistoryTableCells'

const cellClass =
  'bg-[var(--bellum-surface-1)] py-2.5 transition-colors group-hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)]'

export function ActionHistoryRow({ item }: { item: ActionHistoryItem }) {
  const { t } = useTranslation('actions')
  const Icon = actionIconByCategory[item.category]
  const navigate = useNavigate()
  const openDetail = () => navigate({ to: '/actions/$id', params: { id: item.id } })

  return (
    <TableRow
      role="link"
      tabIndex={0}
      className="group cursor-pointer border-transparent outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] active:scale-[0.998]"
      onClick={() => void openDetail()}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          void openDetail()
        }
      }}
    >
      <TableCell className={`${cellClass} rounded-l-xl pl-4`}>
        {/* #2719.2 — LA LIGNE NAVIGUAIT PAR `onClick` + `navigate()` SUR LE
            `TableRow` (`role="link"` compris) : ni clic droit, ni
            ctrl/cmd-clic, ni clic molette ne fonctionnaient (même défaut que
            `ContactTableRow.tsx` avant #2719). L'entité porte désormais un
            vrai `<Link>` — le seul geste natif du navigateur qui rend ces
            trois clics possibles sans rien coder pour eux. `stopPropagation` :
            le `onClick` du `TableRow` reste (clic simple ailleurs sur la
            ligne), et ne doit pas naviguer une seconde fois quand c'est ce
            lien qui vient de le faire. */}
        <Link to="/actions/$id" params={{ id: item.id }} onClick={event => event.stopPropagation()} className="block">
          <EntityCell name={item.target.label} initials={item.target.initials} />
        </Link>
      </TableCell>
      <TableCell className={`${cellClass} rounded-r-xl pr-4 md:rounded-none md:pr-0`}>
        <ActionCell item={item} icon={Icon} />
      </TableCell>
      <TableCell className={`${cellClass} hidden md:table-cell`}>
        <UserCell name={item.actor.name} initials={item.actor.initials} />
      </TableCell>
      <TableCell
        className={`${cellClass} hidden text-xs tabular-nums text-[var(--bellum-text-secondary)] md:table-cell`}
      >
        {formatActionDate(item.created_at)}
      </TableCell>
      <TableCell className={`${cellClass} hidden md:table-cell`}>
        {/* Pas de statut = issue réellement inconnue (ligne antérieure à la clé
            de corrélation). On n'affiche AUCUN badge plutôt qu'un « En cours »
            qui rendrait un run mort indiscernable d'un run vivant. */}
        {item.status ? (
          <Badge variant={statusVariant(item.status)} className="w-fit px-2 py-0 text-xs">
            {actionStatusLabel(t, item.status)}
          </Badge>
        ) : (
          <Text element="span" size="xs" color="text-[var(--text-ghost)]" aria-label={t('status.unknown')}>
            —
          </Text>
        )}
      </TableCell>
      <TableCell className={`${cellClass} hidden rounded-r-xl pr-4 md:table-cell`}>
        <RowActions item={item} />
      </TableCell>
    </TableRow>
  )
}

function statusVariant(status: string) {
  if (status === 'Terminée' || status === 'En hausse') return 'success'
  // Un échec doit SE VOIR. Il était jusqu'ici indiscernable d'un succès.
  if (status === 'Échouée') return 'destructive'
  // Un score en baisse est un signal négatif à VOIR, sans être une erreur.
  if (status === 'En baisse') return 'warning'
  if (status === 'Envoyé' || status === 'Copié' || status === 'Mis à jour') return 'info'
  if (status === 'Programmé') return 'primary'
  return 'outline'
}
