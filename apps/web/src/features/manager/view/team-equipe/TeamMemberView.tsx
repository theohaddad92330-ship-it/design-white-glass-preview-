import { useMemo, useState } from 'react'
import { PROJECT_STAGES, workspaceRoleLabels, type WorkspaceRole } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ArrowRightLeft, KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAssignAccount } from '@/features/manager/hooks/useAssignAccount'
import { useManagerStats } from '@/features/manager/hooks/useManagerStats'
import { useTeamObjectives } from '@/features/manager/hooks/useObjectives'
import { Initial, TeamActionCard, TeamCreateActionButton } from './TeamEquipeActions'
import { TeamEquipeShell } from './TeamEquipeShell'

const PANEL = 'overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card'
const KNOWN_STAGES: readonly string[] = PROJECT_STAGES

/** Les trois derniers mois, au 1er (`YYYY-MM-01`) — la forme que lit `/objectives/team`. */
function objectiveMonths(now: Date, language: string): { value: string; label: string }[] {
  return [0, 1, 2].map(back => {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
    const label = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(date)
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) }
  })
}

/**
 * Théo D team-member — la fiche d'une personne de l'équipe, dans l'ordre de la
 * maquette : retour à toute l'équipe ; le bandeau (initiale, « Léa, au bon
 * endroit. », le portefeuille en une phrase, « Plan de travail », et à droite le
 * signé du mois face à sa cible) ; puis à gauche les prochaines actions
 * (« Créer une action ») et le portefeuille (« Attribuer »), à droite les
 * affaires et le rôle dans l'équipe. C'est un état de `/team?membre=<id>`, pas
 * une route.
 *
 * Doctrine tenue ici : le rôle change l'ORDRE, jamais le CONTENU ; l'analytique
 * mesure le produit, jamais la personne — aucune colonne d'activité ni de
 * « dernier passage » par membre (retirée par la maquette, team-member.A1) ;
 * aucun crédit affiché.
 */
export function TeamMemberView({ memberId }: { memberId: string }) {
  const { t, i18n } = useTranslation('manager')
  const { t: tProjects } = useTranslation('projects')
  const { data, isLoading, error } = useManagerStats(7)
  const months = useMemo(() => objectiveMonths(new Date(), i18n.language), [i18n.language])
  const [month, setMonth] = useState(months[0]?.value ?? '')
  const objectives = useTeamObjectives(month)

  const member = data?.members.find(m => m.user_id === memberId)
  const mine = useMemo(
    () => (data?.shared_actions?.items ?? []).filter(i => (i.assigned_to ?? i.owner_user_id) === memberId),
    [data, memberId],
  )
  const deals = useMemo(
    () => (data?.pipeline_review?.items ?? []).filter(i => i.owner_user_id === memberId),
    [data, memberId],
  )
  const accounts = useMemo(() => {
    const seen = new Map<string, { label: string; next: string }>()
    for (const item of mine)
      if (!seen.has(item.account_id)) seen.set(item.account_id, { label: item.company_name, next: item.label })
    return [...seen]
  }, [mine])
  const progress = objectives.data?.members.find(m => m.user_id === memberId)

  const roleLabel = member ? (workspaceRoleLabels[member.role as WorkspaceRole] ?? member.role) : ''
  const first = member?.name.split(' ')[0] ?? ''
  const shell = (body: React.ReactNode) => (
    <TeamEquipeShell
      active="overview"
      title={member?.name ?? t('equipe.member.fallback')}
      tagline={member ? t('equipe.member.tagline', { role: roleLabel }) : ''}
      memberId={memberId}
      objectives={{ value: month, options: months, onChange: setMonth }}
    >
      {body}
    </TeamEquipeShell>
  )
  if (isLoading) return shell(<Text size="sm">{t('states.loading')}</Text>)
  if (error || !data) return shell(<Text size="sm">{t('errors.load')}</Text>)
  if (!member) return shell(<Text size="sm">{t('equipe.member.unknown')}</Text>)

  const eur = (n: number) =>
    new Intl.NumberFormat(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n)
  const stageLabel = (stage: string) => (KNOWN_STAGES.includes(stage) ? tProjects(`stage.states.${stage}`) : stage)
  const accountOptions = accounts.map(([value, account]) => ({ value, label: account.label }))
  const portfolio = [
    member.accounts > 0 ? t('equipe.member.accounts', { count: member.accounts }) : null,
    deals.length > 0 ? t('equipe.member.deals', { count: deals.length }) : null,
    mine.length > 0 ? t('equipe.member.actions', { count: mine.length }) : null,
  ].filter(Boolean)

  return shell(
    <div className="space-y-6">
      <Link
        to="/team"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--bellum-text-accent)] hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('equipe.member.back')}
      </Link>

      <section
        aria-label={t('equipe.member.heroLabel')}
        className="flex flex-wrap items-center gap-6 rounded-card border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] p-6"
      >
        <Initial name={first} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Text element="h2" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('equipe.member.hello', { name: first })}
          </Text>
          {portfolio.length > 0 ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {portfolio.join(' · ')}
            </Text>
          ) : null}
          <Button asChild variant="plain" size="sm" icon={ArrowRight}>
            <Link to="/team" search={{ vue: 'plans' }}>
              {t('equipe.member.workPlan')}
            </Link>
          </Button>
        </div>
        {progress && progress.targets.revenue !== null ? (
          <div className="text-right">
            <Text element="p" size="3xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {progress.achieved.revenue > 0
                ? t('equipe.member.signed', { amount: eur(progress.achieved.revenue) })
                : t('equipe.member.nothingSigned')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('equipe.member.target', { amount: eur(progress.targets.revenue) })}
            </Text>
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section aria-labelledby="member-actions" className={PANEL}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bellum-border)] px-5 py-4">
              <Text
                element="h2"
                id="member-actions"
                size="xl"
                weight="semibold"
                className="text-[var(--bellum-text-primary)]"
              >
                {t('equipe.member.nextActions')}
              </Text>
              <TeamCreateActionButton members={data.members} accounts={accountOptions} defaultOwner={memberId} />
            </header>
            {mine.length === 0 ? (
              <Text size="sm" className="p-5 text-[var(--bellum-text-secondary)]">
                {t('equipe.member.noActions')}
              </Text>
            ) : (
              <ul className="divide-y divide-[var(--bellum-border)]">
                {mine.map(item => (
                  <TeamActionCard key={item.id} item={item} who={first} />
                ))}
              </ul>
            )}
          </section>

          {accounts.length > 0 ? (
            <section aria-labelledby="member-portfolio" className={PANEL}>
              <header className="border-b border-[var(--bellum-border)] px-5 py-4">
                <Text
                  element="h2"
                  id="member-portfolio"
                  size="xl"
                  weight="semibold"
                  className="text-[var(--bellum-text-primary)]"
                >
                  {t('equipe.member.portfolio')}
                </Text>
              </header>
              <ul className="divide-y divide-[var(--bellum-border)]">
                {accounts.map(([id, account]) => (
                  <li key={id} className="flex items-center gap-4 px-5 py-4">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-control bg-[var(--bellum-surface-2)] text-sm font-semibold text-[var(--bellum-text-primary)]"
                    >
                      {account.label
                        .split(/\s+/)
                        .slice(0, 2)
                        .map(word => word.charAt(0).toUpperCase())
                        .join('')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                        <Link to="/accounts/$id" params={{ id }} className="hover:underline">
                          {account.label}
                        </Link>
                      </Text>
                      <Text size="sm" className="truncate text-[var(--bellum-text-secondary)]">
                        {account.next}
                      </Text>
                    </div>
                    <AssignAccountButton
                      accountId={id}
                      accountLabel={account.label}
                      currentOwner={memberId}
                      members={data.members}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          {deals.length > 0 ? (
            <section aria-labelledby="member-deals" className={`${PANEL} p-5`}>
              <Text
                element="h2"
                id="member-deals"
                size="lg"
                weight="semibold"
                className="text-[var(--bellum-text-primary)]"
              >
                {t('equipe.member.deals_title')}
              </Text>
              <ul className="mt-3 divide-y divide-[var(--bellum-border)]">
                {deals.map(deal => (
                  <li key={deal.opportunity_id}>
                    <Link
                      to="/accounts/$id"
                      params={{ id: deal.account_id }}
                      className="block min-h-11 py-3 hover:underline"
                    >
                      <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                        {deal.label}
                      </Text>
                      <Text size="sm" className="text-[var(--bellum-text-accent)]">
                        {stageLabel(deal.stage)}
                      </Text>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section aria-labelledby="member-role" className={`${PANEL} space-y-3 p-5`}>
            <Text
              element="h2"
              id="member-role"
              size="lg"
              weight="semibold"
              className="text-[var(--bellum-text-primary)]"
            >
              {t('equipe.member.roleTitle')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('equipe.member.roleBody', { role: roleLabel })}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('equipe.member.privacy')}
            </Text>
            <Button asChild variant="plain" size="sm" icon={KeyRound}>
              <Link to="/settings/team">{t('equipe.member.admin')}</Link>
            </Button>
          </section>
        </aside>
      </div>
    </div>,
  )
}

/** Théo D `#dlg-attr*` — confier un compte du portefeuille à un autre membre (la porte existante). */
function AssignAccountButton({
  accountId,
  accountLabel,
  currentOwner,
  members,
}: {
  accountId: string
  accountLabel: string
  currentOwner: string
  members: readonly { user_id: string; name: string }[]
}) {
  const { t } = useTranslation('manager')
  const { t: tc } = useTranslation('common')
  const assign = useAssignAccount()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState(currentOwner)
  return (
    <>
      <Button
        variant="plain"
        size="sm"
        icon={ArrowRightLeft}
        onClick={() => setOpen(true)}
        aria-label={t('equipe.member.assignAria', { account: accountLabel })}
      >
        {t('equipe.member.assign')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc('actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('equipe.member.assignTitle', { account: accountLabel })}</DialogTitle>
            <DialogDescription>{t('equipe.member.assignHint')}</DialogDescription>
          </DialogHeader>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger aria-label={t('equipe.member.assignTo')} className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {members.map(member => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="plain" onClick={() => setOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button
              variant="default"
              disabled={assign.isPending || target === currentOwner}
              onClick={() => assign.mutate({ accountId, assignedTo: target }, { onSuccess: () => setOpen(false) })}
            >
              {t('equipe.member.assignConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
