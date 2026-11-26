import { relationStatusOf, type CommercialLifecycle } from '@bellum/contracts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { CalendarClock } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountAssignSubmenu } from './AccountAssignSubmenu'
import { CommercialStatusSubmenu } from './CommercialStatusSubmenu'

/**
 * Refonte Théo (comptes-liste) — les cellules que la maquette ajoute au tableau des comptes :
 * « Relation », « Responsable » et la ligne de prochaine action sous le sujet.
 *
 * Chacune LIT la ligne de liste, rien n'est recalculé (GA-26) : la relation est `relationStatusOf`
 * (les trois statuts de Théo + l'état secondaire), le responsable est `owner`, la prochaine action
 * est `next_action_label`. Un clic ouvre le geste qui existait déjà au menu « … » — « Déplacer vers »
 * et « Attribuer » — jamais un second chemin d'écriture.
 */

const CELL_MENU_CLASS =
  'w-56 rounded-overlay border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1.5 text-[var(--bellum-text-primary)] shadow-overlay'

/** La ligne entière ouvre le dossier : un clic sur une cellule-geste (ou dans son menu, que Radix fait
 *  remonter par l'arbre React malgré le portail) ne doit pas le faire aussi. */
function stopRowClick(event: MouseEvent<HTMLElement>) {
  event.stopPropagation()
}

/** La relation : À ouvrir · En ouverture · Client, et l'état secondaire (Hors priorité, En veille) écrit dessous. */
export function AccountRelationCell({
  accountId,
  companyName,
  commercialStatus,
  onRequestStatusReason,
}: {
  accountId: string
  companyName: string
  commercialStatus: CommercialLifecycle | undefined
  onRequestStatusReason: (status: CommercialLifecycle) => void
}) {
  const { t } = useTranslation('accounts')
  const relation = relationStatusOf(commercialStatus)
  const primary = t(`relationStatus.${relation.primary}`)
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={stopRowClick}
            data-testid="account-relation-status"
            data-relation={relation.primary}
            aria-label={t('table.relationChange', { company: companyName, status: primary })}
            className={cn(
              'inline-flex min-h-7 items-center whitespace-nowrap rounded-badge border px-2 text-xs font-medium transition-colors duration-immediate ease-bellum-out pointer-coarse:min-h-11',
              relation.primary === 'client'
                ? 'border-transparent bg-[color-mix(in_srgb,var(--success-soft-text)_14%,transparent)] text-[var(--success-soft-text)]'
                : 'border-[color-mix(in_srgb,var(--bellum-text-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--bellum-text-accent)_10%,transparent)] text-[var(--bellum-text-accent)]',
            )}
          >
            {primary}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={CELL_MENU_CLASS} onClick={stopRowClick}>
          <CommercialStatusSubmenu
            variant="dropdown"
            accountId={accountId}
            current={commercialStatus}
            onRequestReason={onRequestStatusReason}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {relation.secondary ? (
        <Text
          element="span"
          size="xs"
          className="text-[var(--bellum-text-muted)]"
          data-testid="account-relation-secondary"
        >
          {t(`relationStatus.${relation.secondary}`)}
        </Text>
      ) : null}
    </div>
  )
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

/**
 * Le responsable : initiale teintée + prénom (« Toi » pour le sien). Un compte non attribué ne fait
 * AUCUN nom — la cellule ne dit que le geste « Attribuer », jamais un « non attribué » deviné quand
 * l'API ne porte pas le champ (`owner` absent).
 */
export function AccountOwnerCell({
  accountId,
  companyName,
  owner,
  isMine,
}: {
  accountId: string
  companyName: string
  owner: { user_id: string; name: string } | null | undefined
  isMine: boolean
}) {
  const { t } = useTranslation('accounts')
  if (owner === undefined) return null
  const label = owner ? (isMine ? t('list.ownerYou') : (owner.name.split(/\s+/)[0] ?? owner.name)) : null
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={stopRowClick}
            data-testid="account-owner"
            aria-label={
              owner
                ? t('table.ownerChange', { company: companyName, name: owner.name })
                : t('table.ownerAssign', { company: companyName })
            }
            title={owner?.name}
            className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-control px-1 text-xs text-[var(--bellum-text-primary)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
          >
            {owner ? (
              <>
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bellum-text-accent)_14%,transparent)] text-xs font-semibold text-[var(--bellum-text-accent)]"
                >
                  {initialsOf(owner.name).slice(0, 1)}
                </span>
                <span className="truncate">{label}</span>
              </>
            ) : (
              <span className="text-[var(--bellum-text-muted)]">{t('list.assign')}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={CELL_MENU_CLASS} onClick={stopRowClick}>
          <AccountAssignSubmenu variant="dropdown" accountId={accountId} currentOwnerId={owner?.user_id} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * #4497 (V22) — la prochaine action DATÉE, écrite une fois pour la carte et pour la ligne (GA-26) : l'horizon
 * d'abord (« 7j · Relancer… », comme la maquette « Aujourd'hui · Relancer… »), le libellé seul sans horizon.
 */
export function nextActionText(
  t: (key: string, options?: Record<string, unknown>) => string,
  label: string,
  horizon: string | null | undefined,
): string {
  const when = horizon?.trim()
  return when ? t('list.nextActionWithHorizon', { label, horizon: when }) : label
}

/**
 * La ligne « prochaine action » sous le sujet : son horizon puis son libellé, en lien vers le dossier.
 * Sans action écrite, RIEN — une absence ne fait aucune ligne (doctrine 20/09).
 */
export function AccountNextActionLine({
  accountId,
  label,
  horizon,
}: {
  accountId: string
  label: string | null | undefined
  horizon: string | null | undefined
}) {
  const { t } = useTranslation('accounts')
  const text = label?.trim()
  if (!text) return null
  return (
    <Link
      to="/accounts/$id"
      params={{ id: accountId }}
      onClick={event => event.stopPropagation()}
      data-testid="account-next-action-line"
      className="mt-1 flex min-w-0 items-start gap-1.5 text-xs leading-4 text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]"
    >
      <CalendarClock className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span className="line-clamp-2 min-w-0">{nextActionText(t, text, horizon)}</span>
    </Link>
  )
}
