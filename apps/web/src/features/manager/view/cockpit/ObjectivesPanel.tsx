import type { ManagerMemberStats, MemberObjective, MemberObjectiveProgress } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMyObjective, useTeamObjectives, useUpsertMyObjective } from '../../hooks/useObjectives'

function formatEur(amount: number, language: string): string {
  return new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Objectif commercial chiffré par membre (cockpit manager §10).
 *
 * Deux surfaces : le manager déclare SON objectif du mois (éditeur), et le cockpit
 * affiche l'atteinte de l'équipe (barres réalisé vs objectif). Un membre sans
 * objectif n'a pas de barre — jamais un 0/0 factice. Le réalisé vient de données
 * réelles calculées côté serveur (rendez-vous, comptes, montants convertis).
 *
 * Masqué tant qu'aucune des deux requêtes n'a abouti : une API antérieure au
 * module (deploy-skew) n'a pas l'endpoint → on ne dessine pas un bloc vide.
 */
export function ObjectivesPanel({ members }: { members: ManagerMemberStats[] }) {
  const { t } = useTranslation('manager')
  const team = useTeamObjectives()
  const mine = useMyObjective()

  if (!team.isSuccess && !mine.isSuccess) return null

  const progress = team.data?.members ?? []
  const declared = mine.isSuccess && mine.data.objective !== null
  // L'éditeur de SON objectif s'ouvre en fenêtre (Théo `dlg-goal`) — « Définir » tant que rien
  // n'est déclaré, « Ajuster » ensuite. Le même éditeur, la même porte d'écriture.
  const editor = mine.isSuccess ? (
    <MyObjectiveDialog
      key={mine.data.objective?.updated_at ?? 'none'}
      objective={mine.data.objective}
      label={declared ? t('objectives.adjust') : t('objectives.define')}
    />
  ) : null

  return (
    <section aria-label={t('objectives.title')} data-board-block="goals" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('board.chosen.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('board.chosen.body')}
          </Text>
        </div>
        {editor}
      </div>

      {progress.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('objectives.teamEmpty')}
        </Text>
      ) : (
        <ul aria-label={t('objectives.teamTitle')} className="grid gap-4 md:grid-cols-2">
          {progress.map(member => {
            const stats = members.find(m => m.user_id === member.user_id)
            const name = stats?.name ?? t('activity.unknownMember')
            return (
              <li
                key={member.user_id}
                data-goal-member={member.user_id}
                className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 md:p-5"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-sm font-semibold text-[var(--accent-soft-text)]"
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-[var(--bellum-text-primary)]">
                      {name}
                    </strong>
                    {stats?.role ? (
                      <small className="block text-xs text-[var(--bellum-text-secondary)]">
                        {t(`roles.${stats.role}`, { defaultValue: stats.role })}
                      </small>
                    ) : null}
                  </span>
                </div>
                <MemberBars progress={member} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** « Définir / Ajuster mon objectif » — l'éditeur du mois, dans une fenêtre. */
function MyObjectiveDialog({ objective, label }: { objective: MemberObjective | null; label: string }) {
  const { t } = useTranslation(['manager', 'common'])
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 shrink-0">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('manager:objectives.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('manager:objectives.subtitle')}</DialogDescription>
        </DialogHeader>
        <MyObjectiveEditor objective={objective} />
      </DialogContent>
    </Dialog>
  )
}

/** Les barres d'atteinte d'un membre — une par axe RÉELLEMENT déclaré (cible non nulle). */
function MemberBars({ progress }: { progress: MemberObjectiveProgress }) {
  const { t, i18n } = useTranslation('manager')
  const { targets, achieved } = progress
  const eur = (n: number) => formatEur(n, i18n.language)

  const rows = [
    targets.meetings !== null
      ? { key: 'meetings', label: t('objectives.axis.meetings'), achieved: achieved.meetings, target: targets.meetings }
      : null,
    targets.accounts !== null
      ? { key: 'accounts', label: t('objectives.axis.accounts'), achieved: achieved.accounts, target: targets.accounts }
      : null,
    targets.revenue !== null
      ? {
          key: 'revenue',
          label: t('objectives.axis.revenue'),
          achieved: achieved.revenue,
          target: targets.revenue,
          format: eur,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null)

  // Une cible nulle sur tous les axes ne devrait pas arriver (le serveur filtre),
  // mais si c'était le cas on ne dessine rien plutôt qu'un cadre vide.
  if (rows.length === 0) return null

  return (
    <div className="mt-1 space-y-2">
      {rows.map(row => {
        const fmt = 'format' in row && row.format ? row.format : (n: number) => String(n)
        const percent = row.target > 0 ? Math.min(100, Math.round((row.achieved / row.target) * 100)) : 0
        return (
          <div key={row.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {row.label}
              </Text>
              <Text size="xs" className="tabular-nums text-[var(--bellum-text-muted)]">
                {t('objectives.progress', { achieved: fmt(row.achieved), target: fmt(row.target), percent })}
              </Text>
            </div>
            <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
              <div className="bg-[var(--bellum-primary-500)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** L'éditeur de l'objectif perso du mois — trois champs facultatifs, vide = non fixé. */
function MyObjectiveEditor({ objective }: { objective: MemberObjective | null }) {
  const { t } = useTranslation('manager')
  const upsert = useUpsertMyObjective()

  const [meetings, setMeetings] = useState(objective?.target_meetings != null ? String(objective.target_meetings) : '')
  const [accounts, setAccounts] = useState(objective?.target_accounts != null ? String(objective.target_accounts) : '')
  const [revenue, setRevenue] = useState(objective?.target_revenue != null ? String(objective.target_revenue) : '')

  // Vide → `null` (cible non fixée) ; sinon le nombre saisi. Une saisie invalide
  // reste `null` plutôt que d'inventer une cible.
  const toTarget = (value: string): number | null => {
    const trimmed = value.trim().replace(/\s/g, '').replace(',', '.')
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }

  const submit = () => {
    upsert.mutate({
      target_meetings: toTarget(meetings) === null ? null : Math.round(toTarget(meetings)!),
      target_accounts: toTarget(accounts) === null ? null : Math.round(toTarget(accounts)!),
      target_revenue: toTarget(revenue),
    })
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
      <Text size="xs" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('objectives.myTitle')}
      </Text>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field
          label={t('objectives.axis.meetings')}
          value={meetings}
          onChange={setMeetings}
          disabled={upsert.isPending}
        />
        <Field
          label={t('objectives.axis.accounts')}
          value={accounts}
          onChange={setAccounts}
          disabled={upsert.isPending}
        />
        <Field
          label={t('objectives.axis.revenueEur')}
          value={revenue}
          onChange={setRevenue}
          disabled={upsert.isPending}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={upsert.isPending}>
          {upsert.isPending ? t('objectives.saving') : t('objectives.save')}
        </Button>
        {upsert.isSuccess ? (
          <Text size="xs" className="text-[var(--success-soft-text)]">
            {t('objectives.saved')}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm text-[var(--bellum-text-primary)] disabled:opacity-60"
      />
    </label>
  )
}
