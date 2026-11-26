import { useState } from 'react'
import { isCalendarDate } from '@bellum/contracts'
import { Badge, Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger, Text, cn } from '@bellum/ui'
import { AtSign, CalendarDays, Mail, MessageSquare, Phone, Target, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCalendarDate, formatDeadline } from '@/lib/deadline'
import { revealTargetProps } from '@/lib/reveal-target'

interface PlanActionItemProps {
  item: {
    text: string
    responsable?: string
    outil?: string
    deadline?: string
    kpi?: string
    expectedOutcome?: string
    /** POURQUOI cette action (p27). C'est ce qui rend le plan discutable plutôt
     *  qu'une liste de tâches : « Demander une intro » ne dit pas pourquoi cette
     *  porte-là. Généré depuis toujours, affiché depuis ce chantier. */
    reason?: string
    /** Le contact visé par l'action (p27) — une action sans destinataire n'est
     *  pas exécutable. */
    contact?: string
  }
  completed?: boolean
  onCompletedChange?: (completed: boolean) => void
  onOpen?: () => void
  /** Persisted calendar deadline (`YYYY-MM-DD`) when this item is trackable. */
  dueDate?: string | null
  /**
   * La date qui a PRODUIT le plan (`accounts.last_analyzed_at`).
   *
   * `item.deadline` est RELATIF (`J+10`, `M+3S+2`) : c'est cette base qui lui
   * donne un jour. Absente, l'échéance se dit en clair (« sous 10 jours ») —
   * jamais une date, et surtout jamais celle que `new Date('J+10')` fabrique
   * (le 1ᵉʳ octobre 2001).
   */
  deadlineBase?: string | null
  /** When provided, the item shows an interactive, persisted due-date picker in
   *  place of the static `deadline` badge. Absent for non-persisted items. */
  onDueDateChange?: (dueDate: string | null) => void
  /** Executable-action menu (fait / snooze / assigner / copier / CRM) rendered
   *  in the row's trailing slot. Provided by the board per row. */
  trailing?: ReactNode
  /** #2123.1 — ce que l'action persistée dit d'elle-même (objet, contact,
   *  dépendance, source, confiance, coût, statut), sous les échéances. */
  details?: ReactNode
  /**
   * #2715.1 (corrigé 23/09) — le statut d'envoi (`ActionPlanItem.send_status`),
   * LU sur `user_actions`, jamais deviné. DEUX valeurs, jamais fondues sous
   * un badge unique — une première version les fondait, ce que la doctrine
   * interdit : « "Fait" ne porte jamais de preuve d'envoi » (CLAUDE.md
   * § Doctrine, `c73_fait_ne_porte_pas_preuve_denvoi`). `'email_sent'` = un
   * e-mail VÉRIFIÉ ; `'declared'` = un geste DÉCLARATIF (LinkedIn, un appel
   * renseigné) — jamais affiché comme un envoi prouvé. `null`/absent = rien
   * affiché, jamais un badge inventé.
   */
  sendStatus?: 'email_sent' | 'declared' | null
  /**
   * #2107.32 — la destination d'un lien pointé sur CETTE ligne précise
   * (`dossierItemAnchorId({ kind: 'action', id })`, même contrat que la
   * recherche transversale du dossier, #2128.50). `revealTarget` amène et
   * focalise la ligne ; sans `anchorId`, la ligne se rend exactement comme
   * avant — ce n'est pas un second réglage de mise en avant.
   */
  anchorId?: string
  /**
   * #2871 — l'`action_id` canonique de la ligne (projection du compte,
   * `GET /accounts/:id/actions`), le même que `/actions` lit. Absent tant que
   * la projection n'est pas lue : rien n'est deviné.
   */
  canonicalActionId?: string
  /**
   * #2317.9 — gèle la case à cocher tant qu'une dépendance n'est pas faite.
   * La ligne reste visible et cliquable (elle s'ouvre toujours) ; seul le
   * geste de complétion est gelé, avec sa raison en infobulle.
   */
  disabled?: boolean
  disabledReason?: string
}

export function PlanActionItem({
  item,
  completed,
  onCompletedChange,
  onOpen,
  dueDate,
  deadlineBase = null,
  onDueDateChange,
  trailing,
  details,
  sendStatus = null,
  anchorId,
  canonicalActionId,
  disabled = false,
  disabledReason,
}: PlanActionItemProps) {
  const { t } = useTranslation('accounts')
  const [internalChecked, setInternalChecked] = useState(false)
  const checked = completed ?? internalChecked
  const channel = getChannelMeta(item.outil)
  const setChecked = (value: boolean | 'indeterminate') => {
    const next = value === true
    if (onCompletedChange) onCompletedChange(next)
    else setInternalChecked(next)
  }
  // Une comparaison de CHAÎNES n'est juste que sur des dates ISO : « J+10 » y
  // gagnerait toujours, et « Fri Aug 29 » toujours pas.
  const overdue = isCalendarDate(dueDate) && !checked && (dueDate as string) < todayIso()
  // L'échéance planifiée telle qu'elle s'AFFICHE : une date quand elle est
  // calculable depuis la base du plan, sinon l'horizon en clair, sinon le
  // libellé du pipeline tel quel.
  const plannedLabel = formatDeadline(item.deadline, deadlineBase)

  return (
    <div
      {...(anchorId ? revealTargetProps(anchorId) : {})}
      data-action-id={canonicalActionId}
      data-state={checked ? 'selected' : undefined}
      // Pas un `<button>` : la ligne CONTIENT déjà une case à cocher, et
      // imbriquer deux commandes est invalide. Le rôle et le clavier sont donc
      // recopiés à la main — sans quoi la ligne s'ouvre à la souris et par
      // aucun autre moyen.
      //
      // #2107.32 — `revealTargetProps` pose AUSSI `tabIndex={-1}` quand
      // `anchorId` est fourni : la valeur écrite ICI, après, GAGNE (React
      // n'applique que le dernier attribut du même nom) — la ligne reste
      // tabulable normalement, seule sa fiche EXTERNE (le lien depuis la
      // Veille) l'atteint par le focus programmatique de `revealTarget`.
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.()
        }
      }}
      className="group grid min-h-14 grid-cols-[44px_minmax(0,1fr)] mx-2 my-2 items-start transition-colors hover:bg-[var(--bellum-bg-lighter)] dark:hover:bg-[var(--bellum-bg-darker)] rounded-lg data-[state=selected]:bg-[color-mix(in_srgb,var(--bellum-success)_4%,transparent)] sm:grid-cols-[44px_minmax(0,1fr)_auto]"
    >
      <div
        className="flex h-full items-start justify-center px-3 py-4"
        onClick={event => event.stopPropagation()}
        title={disabled ? disabledReason : undefined}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={setChecked}
          disabled={disabled}
          aria-label={checked ? t('planAction.markTodo') : t('planAction.markDone')}
          className="mt-0.5"
        />
      </div>

      <div className="min-w-0 px-1 py-3">
        <Text
          element="p"
          size="sm"
          weight="medium"
          className={cn(
            'line-clamp-2 break-words leading-snug',
            checked ? 'text-[var(--bellum-text-muted)] line-through' : 'text-[var(--bellum-text-primary)]',
          )}
        >
          {item.text || '—'}
        </Text>
        {item.expectedOutcome ? (
          <Text element="p" size="xs" className="mt-1 line-clamp-2 break-words text-[var(--bellum-text-secondary)]">
            {item.expectedOutcome}
          </Text>
        ) : null}
        {item.reason ? (
          // « Chaque recommandation cite la règle, le profil et les preuves »
          // (DoD p31 n°6). La raison était produite et jetée : le commercial
          // voyait QUOI faire, jamais POURQUOI — donc ne pouvait pas contester.
          <Text element="p" size="xs" className="mt-1 line-clamp-2 break-words text-[var(--bellum-text-muted)]">
            {t('planAction.reasonPrefix')} {item.reason}
          </Text>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.responsable ? <MetaBadge icon={<UserRound className="size-3" />} label={item.responsable} /> : null}
          {item.contact ? <MetaBadge icon={<AtSign className="size-3" />} label={item.contact} /> : null}
          {onDueDateChange ? (
            <DueDateControl
              value={dueDate ?? null}
              // Échéance produite par l'analyse. Elle servait déjà à l'export
              // agenda mais n'était PAS affichée : la puce restait vide alors
              // que la donnée existait.
              plannedLabel={plannedLabel}
              overdue={overdue}
              onChange={onDueDateChange}
            />
          ) : plannedLabel ? (
            <MetaBadge icon={<CalendarDays className="size-3" />} label={plannedLabel} />
          ) : null}
          {item.kpi ? <MetaBadge icon={<Target className="size-3" />} label={item.kpi} /> : null}
        </div>
        {details}
      </div>

      {item.outil || trailing || sendStatus ? (
        <div className="flex items-center justify-end gap-1 px-4 pb-3 sm:py-3">
          {item.outil ? (
            <Badge variant={channel.variant} className="h-fit gap-1">
              {channel.icon}
              {item.outil}
            </Badge>
          ) : null}
          {/* #2715.1 (corrigé 23/09) — DEUX badges distincts : un e-mail
              VÉRIFIÉ n'est jamais montré comme un geste déclaratif, et
              inversement — jamais fondus sous un « Succès » unique. */}
          {sendStatus === 'email_sent' ? (
            <Badge variant="success" className="h-fit gap-1">
              {t('planAction.sendStatusEmailSent')}
            </Badge>
          ) : sendStatus === 'declared' ? (
            <Badge variant="outline" className="h-fit gap-1">
              {t('planAction.sendStatusDeclared')}
            </Badge>
          ) : null}
          {trailing}
        </div>
      ) : null}
    </div>
  )
}

function MetaBadge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
      {icon}
      {label}
    </span>
  )
}

/** Interactive, persisted deadline. Renders a chip that opens a native date
 *  input; overdue-and-open items go red so the "relance" is visible at a glance.
 *
 *  With no calendar date set, it falls back to the textual deadline the analysis
 *  produced (`plannedLabel`), and only then to an explicit "add" affordance —
 *  it used to render a bare « Échéance » chip that read as a broken empty field. */
function DueDateControl({
  value,
  plannedLabel,
  overdue,
  onChange,
}: {
  value: string | null
  plannedLabel: string | null
  overdue: boolean
  onChange: (dueDate: string | null) => void
}) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)
  const label = value ? formatDueDate(value) : (plannedLabel ?? t('planAction.addDueDate'))
  const isPlaceholder = !value && !plannedLabel
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={event => event.stopPropagation()}
          title={!value && plannedLabel ? t('planAction.plannedDeadline') : undefined}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors',
            value
              ? overdue
                ? 'border-[var(--bellum-danger)] text-[var(--danger-soft-text)]'
                : 'border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-secondary)]'
              : isPlaceholder
                ? 'border-dashed border-[var(--bellum-border)] text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-secondary)]'
                : 'border-dashed border-[var(--bellum-border)] text-[var(--bellum-text-secondary)]',
          )}
        >
          <CalendarDays className="size-3" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3" onClick={event => event.stopPropagation()}>
        <div className="flex flex-col gap-2">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {t('planAction.dueDateLabel')}
          </Text>
          <Input
            type="date"
            value={value ?? ''}
            onChange={event => onChange(event.target.value ? event.target.value : null)}
            className="w-44"
          />
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              {t('planAction.removeDueDate')}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Local calendar date `YYYY-MM-DD` for the overdue comparison. */
function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** La date persistée, en jour + mois court. Une valeur qui n'est pas une date
 *  calendaire s'affiche telle quelle : on ne la relit pas avec `new Date()`. */
function formatDueDate(value: string): string {
  return formatCalendarDate(value, { day: '2-digit', month: 'short' }) ?? value
}

function getChannelMeta(channel?: string): {
  variant: 'default' | 'info' | 'warning' | 'success' | 'outline'
  icon: ReactNode
} {
  const value = channel?.toLowerCase() ?? ''
  if (value.includes('linkedin')) {
    return {
      variant: 'info',
      icon: <MessageSquare className="size-3" />,
    }
  }
  if (value.includes('email') || value.includes('mail')) {
    return {
      variant: 'warning',
      icon: <Mail className="size-3" />,
    }
  }
  if (value.includes('phone') || value.includes('tel')) {
    return {
      variant: 'success',
      icon: <Phone className="size-3" />,
    }
  }
  return {
    variant: 'outline',
    icon: <Target className="size-3" />,
  }
}
