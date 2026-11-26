import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bell, Plus, X } from 'lucide-react'
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger, TYPE_SCALE, cn } from '@bellum/ui'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { useAccountFollows, useToggleAccountFollow } from '@/features/account-follows/api'
import { useSavedSearches } from '@/features/discover/hooks/useSavedSearches'
import { WatchlistRulesSection } from '@/features/watchlist/rules/WatchlistRulesSection'
import { useWatchlistRules } from '@/features/watchlist/rules/useWatchlistRules'

/* ------------------------------------------------------------------ */
/*  « Mes veilles » — la sous-page de Signaux (Théo signaux-veilles).   */
/*                                                                     */
/*  Une vue de `/mes-cibles` (`?view=veilles`), jamais une route neuve. */
/*  Trois onglets, chacun branché sur sa donnée réelle :                */
/*   · Règles transverses — secteur, technologie, mot-clé… (l'éditeur   */
/*     UNIQUE, Réglages › Notifications y renvoie, GA-26) ;             */
/*   · Comptes suivis — ce que tu suis, et la suggestion du moment ;    */
/*   · Alertes de recherche — tes recherches enregistrées à cadence.    */
/*  Une absence ne fait aucune ligne ; aucun compteur n'écrit « 0 ».    */
/* ------------------------------------------------------------------ */

const CARD = 'overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]'

function Count({ children }: { children: React.ReactNode }) {
  return <span className="ml-2 text-xs font-normal text-[var(--bellum-text-muted)]">{children}</span>
}

function FollowsTab() {
  const { t } = useTranslation('watchlist', { keyPrefix: 'watches' })
  const follows = useAccountFollows()
  const toggle = useToggleAccountFollow()
  if (follows.isPending) return null
  if (follows.isError || !follows.data) {
    return (
      <p role="alert" className="text-sm text-[var(--bellum-text-secondary)]">
        {t('follows.loadError')}
      </p>
    )
  }
  const { followed, suggestion, max } = follows.data
  const atCap = followed.length >= max
  return (
    <div className="flex flex-col gap-5" data-testid="watches-follows">
      <p className="text-sm text-[var(--bellum-text-secondary)]">{t('follows.intro')}</p>
      {followed.length > 0 && (
        <>
          <p className="text-xs font-medium text-[var(--bellum-text-muted)]">
            {t('follows.meter', { count: followed.length, max })}
          </p>
          <ul className="flex flex-wrap gap-2">
            {followed.map(account => (
              <li
                key={account.account_id}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] py-1 pl-1.5 pr-1 text-sm text-[var(--bellum-text-primary)]"
              >
                <CompanyAvatar name={account.company_name} />
                <Link to="/accounts/$id" params={{ id: account.account_id }} className="hover:underline">
                  {account.company_name}
                </Link>
                <Button
                  type="button"
                  variant="plain"
                  size="icon"
                  className="size-7 rounded-full"
                  aria-label={t('follows.unfollowNamed', { name: account.company_name })}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ accountId: account.account_id, follow: false })}
                >
                  <X aria-hidden="true" className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {followed.length === 0 && !suggestion && (
        <p className="text-sm text-[var(--bellum-text-primary)]">{t('follows.none')}</p>
      )}
      {suggestion && followed.length === 0 && (
        <section aria-labelledby="watches-suggestions">
          <h2
            id="watches-suggestions"
            className={cn(TYPE_SCALE.sectionTitle, 'mb-2 text-[var(--bellum-text-primary)]')}
          >
            {t('follows.suggestions')}
          </h2>
          <ul className={cn(CARD, 'divide-y divide-[var(--bellum-border)]')}>
            <li className="flex items-center gap-3 p-3">
              <CompanyAvatar name={suggestion.company_name} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--bellum-text-primary)]">{suggestion.company_name}</p>
                <p className="text-xs text-[var(--bellum-text-muted)]">{t('follows.suggestionHint')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={toggle.isPending || atCap}
                aria-label={t('follows.followNamed', { name: suggestion.company_name })}
                onClick={() => toggle.mutate({ accountId: suggestion.account_id, follow: true })}
              >
                {t('follows.follow')}
              </Button>
            </li>
          </ul>
        </section>
      )}
      {atCap && (
        <p role="status" className="text-sm text-[var(--bellum-text-secondary)]">
          {t('follows.capReached', { max })}
        </p>
      )}
    </div>
  )
}

function AlertsTab() {
  const { t, i18n } = useTranslation('watchlist', { keyPrefix: 'watches' })
  const { t: tDiscover } = useTranslation('discover')
  const { searches } = useSavedSearches()
  const alerts = searches.filter(search => search.alertFrequency !== 'manual')
  return (
    <div className="flex flex-col gap-4" data-testid="watches-alerts">
      <p className="text-sm text-[var(--bellum-text-secondary)]">{t('alerts.intro')}</p>
      {alerts.length === 0 ? (
        <p className="text-sm text-[var(--bellum-text-primary)]">{t('alerts.none')}</p>
      ) : (
        <ul className={cn(CARD, 'divide-y divide-[var(--bellum-border)]')}>
          {alerts.map(search => {
            const lastRun = search.lastRunAt ? new Date(search.lastRunAt) : null
            const ranOn =
              lastRun && !Number.isNaN(lastRun.getTime())
                ? lastRun.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })
                : null
            return (
              <li key={search.id} className="flex flex-wrap items-center gap-3 p-4">
                <Bell className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--bellum-text-primary)]">{search.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--bellum-text-muted)]">
                    {tDiscover(`sidebar.frequency.${search.alertFrequency}`)}
                    {search.alertChannel && ` · ${tDiscover(`sidebar.channel.${search.alertChannel}`)}`}
                    {' · '}
                    {ranOn ? tDiscover('sidebar.savedLastRun', { date: ranOn }) : tDiscover('sidebar.savedNeverRun')}
                  </p>
                </div>
                <Badge variant="success">{t('alerts.active')}</Badge>
              </li>
            )
          })}
        </ul>
      )}
      <Link
        to="/discover"
        search={{ view: 'history' }}
        className="text-sm font-medium text-[var(--bellum-text-accent)] underline underline-offset-2"
      >
        {t('alerts.allSearches')}
      </Link>
    </div>
  )
}

/** « Mes veilles » : les trois lectures de ce que Bellum surveille pour toi. */
export function WatchesPage() {
  const { t } = useTranslation('watchlist', { keyPrefix: 'watches' })
  const { rules } = useWatchlistRules()
  const follows = useAccountFollows()
  const { searches } = useSavedSearches()
  const alertCount = searches.filter(search => search.alertFrequency !== 'manual').length
  const followed = follows.data?.followed.length ?? 0
  const [tab, setTab] = useState('rules')
  // Théo `dlg-watch` — « Configurer une veille » mène au SEUL éditeur de veille qui existe (les règles
  // transverses, GA-26) : l'onglet s'ouvre et le champ prend le focus. La veille « par compte » de la
  // maquette (nom, comptes, cadence, échéance, état) n'a pas d'API : elle n'est pas dessinée à vide.
  const [focusRule, setFocusRule] = useState(0)
  const configure = () => {
    setTab('rules')
    setFocusRule(count => count + 1)
  }
  return (
    <div className={cn(PAGE_GUTTER_X, 'flex min-w-0 flex-col gap-6')} data-testid="watches-page">
      <Link
        to="/signals"
        className="-ml-2 inline-flex min-h-11 items-center gap-2 self-start px-2 text-sm text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
            {t('eyebrow')}
          </p>
          <h1 className={cn(TYPE_SCALE.pageTitle, 'mt-1 text-[var(--bellum-text-primary)]')}>{t('title')}</h1>
          <p className="mt-2 text-sm text-[var(--bellum-text-secondary)]">{t('subtitle')}</p>
        </div>
        <Button onClick={configure}>
          <Plus aria-hidden="true" />
          {t('configure')}
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="underline" aria-label={t('tabsAria')} className="max-w-full overflow-x-auto">
          <TabsTrigger value="rules">
            {t('tabs.rules')}
            {rules.length > 0 && <Count>{rules.length}</Count>}
          </TabsTrigger>
          <TabsTrigger value="follows">
            {t('tabs.follows')}
            {followed > 0 && follows.data && (
              <Count>
                {followed} / {follows.data.max}
              </Count>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts">
            {t('tabs.alerts')}
            {alertCount > 0 && <Count>{alertCount}</Count>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="pt-4">
          <p className="mb-4 text-sm text-[var(--bellum-text-secondary)]">{t('rules.intro')}</p>
          <WatchlistRulesSection focusSignal={focusRule} />
        </TabsContent>
        <TabsContent value="follows" className="pt-4">
          <FollowsTab />
        </TabsContent>
        <TabsContent value="alerts" className="pt-4">
          <AlertsTab />
        </TabsContent>
      </Tabs>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] pt-4">
        <p className="text-xs text-[var(--bellum-text-muted)]">{t('footer')}</p>
        <Button asChild variant="plain" size="sm">
          <Link to="/settings/notifications">
            <Bell aria-hidden="true" />
            {t('notificationPrefs')}
          </Link>
        </Button>
      </footer>
    </div>
  )
}
