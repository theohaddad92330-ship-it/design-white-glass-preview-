import type { WatchItem } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Pause, Play, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { TheoNote, TheoPill, TheoTabPanel, TheoTabs } from '@/components/page/theo-page-grammar'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { ScreenState } from '@/components/primitives/ScreenState'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { useAccountFollows } from '@/features/account-follows/api'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { WatchlistRulesSection } from '@/features/watchlist/rules/WatchlistRulesSection'
import { useArchiveWatch, useSetWatchState, useUnfollowAccount, useWatches } from '../api'
import { WatchFormDialog } from './WatchFormDialog'

const dateFormat = (isoDay: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${isoDay}T00:00:00Z`),
  )

const WATCH_TABS = ['watches', 'rules', 'follows'] as const
type WatchTab = (typeof WATCH_TABS)[number]

/**
 * #4506 — « MES VEILLES » (`/signals/watches`), au dessin de la maquette V22 (`_appliquees/a/signaux-veilles.html`).
 *
 * De haut en bas : « ← Revenir à la bibliothèque » ; le surtitre, le titre, la phrase et « Configurer une veille » ;
 * trois onglets — le TABLEAU des veilles (Veille · Cadence · Prochaine échéance prévue · État · Régler / pause /
 * supprimer), les règles transverses (un seul éditeur, GA-26) et les COMPTES SUIVIS (n / 3, « Ne plus suivre »),
 * qui ont quitté la page Signaux (#4505.6). « À connecter » dit qu'un compte de la veille n'est plus suivi : elle
 * ne le relit plus tant qu'il ne l'est pas. Supprimer ARCHIVE : les informations déjà collectées restent.
 */
export function SignalWatchesPage() {
  const { t } = useTranslation('signalsLibrary')
  return (
    <CustomerPage anchorId="veilles" titleInScreen pageTitle={t('watches.title')} contentClassName="px-0 py-4">
      <SignalWatchesContent />
    </CustomerPage>
  )
}

/** Le corps de l'écran, sans la coque : c'est lui que les tests montent. */
export function SignalWatchesContent() {
  const { t, i18n } = useTranslation('signalsLibrary')
  const watches = useWatches()
  const follows = useAccountFollows()
  const setState = useSetWatchState()
  const archive = useArchiveWatch()
  const unfollow = useUnfollowAccount()
  const [tab, setTab] = useState<WatchTab>('watches')
  const [formFor, setFormFor] = useState<WatchItem | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<WatchItem | null>(null)
  useLauraContext({ kind: 'screen', label: t('watches.title'), entityId: null, facets: [], state: 'ready' })

  const followed = useMemo(() => follows.data?.followed ?? [], [follows.data])
  const followMax = watches.data?.follow_max ?? follows.data?.max ?? 3
  const items = watches.data?.items ?? []

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <div className={PAGE_GUTTER_X}>
          <Button asChild variant="ghost" className="min-h-11 gap-1 px-2">
            <Link to="/signals">
              <ArrowLeft className="size-4" aria-hidden />
              {t('watches.back')}
            </Link>
          </Button>
        </div>

        <header data-testid="watches-header" className={PAGE_GUTTER_X}>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--bellum-text-accent)]">
            {t('watches.eyebrow')}
          </p>
          <ScreenIntro
            title={t('watches.heading')}
            titleWithoutName={t('watches.heading')}
            subtitle={t('watches.subtitle')}
            action={
              <Button type="button" className="min-h-11" onClick={() => setFormFor('new')}>
                {t('watches.create')}
              </Button>
            }
          />
        </header>

        <div className={PAGE_GUTTER_X}>
          <TheoTabs
            idPrefix="watches"
            label={t('watches.tabs.aria')}
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'watches', label: t('watches.tabs.watches'), count: watches.data ? items.length : undefined },
              { key: 'rules', label: t('watches.tabs.rules') },
              { key: 'follows', label: t('watches.tabs.follows') },
            ]}
          />
        </div>

        <div className={PAGE_GUTTER_X}>
          {tab === 'watches' ? (
            <TheoTabPanel idPrefix="watches" tabKey="watches">
              {watches.isError ? (
                <ScreenState state="error" title={t('watches.loadError')} message="" />
              ) : watches.data && items.length === 0 ? (
                <ScreenState
                  state="empty_never"
                  title={t('watches.emptyTitle')}
                  message={t('watches.emptyMessage')}
                  action={{ label: t('watches.create'), onClick: () => setFormFor('new') }}
                />
              ) : (
                <div className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="hidden border-b border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs text-[var(--bellum-text-muted)] md:table-header-group">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          {t('watches.headers.name')}
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          {t('watches.headers.cadence')}
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          {t('watches.headers.next')}
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          {t('watches.headers.state')}
                        </th>
                        <th scope="col" className="px-4 py-3">
                          <span className="sr-only">{t('watches.headers.actions')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(watch => (
                        <WatchRow
                          key={watch.id}
                          watch={watch}
                          locale={i18n.language}
                          pending={setState.isPending}
                          onAdjust={() => setFormFor(watch)}
                          onToggleState={() =>
                            setState.mutate({ id: watch.id, state: watch.state === 'active' ? 'paused' : 'active' })
                          }
                          onDelete={() => setToDelete(watch)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <TheoNote tone="neutral">
                {t('watches.cadenceNote')} {t('watches.deleteNote')}
              </TheoNote>
            </TheoTabPanel>
          ) : tab === 'rules' ? (
            <TheoTabPanel idPrefix="watches" tabKey="rules">
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('watches.rulesIntro')}
              </Text>
              <WatchlistRulesSection />
            </TheoTabPanel>
          ) : (
            <TheoTabPanel idPrefix="watches" tabKey="follows">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('watches.followsIntro')}
                </Text>
                {follows.data ? (
                  <Text size="sm" className="tabular-nums text-[var(--bellum-text-secondary)]">
                    <strong className="text-[var(--bellum-text-primary)]">{followed.length}</strong>{' '}
                    {t('watches.followsMeter', { max: followMax })}
                  </Text>
                ) : null}
              </div>
              {follows.data && followed.length === 0 ? (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('watches.followsEmpty')}
                </Text>
              ) : (
                <ul aria-label={t('watches.tabs.follows')} className="flex flex-wrap gap-2">
                  {followed.map(account => (
                    <li
                      key={account.account_id}
                      className="flex min-h-11 items-center gap-2 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] pl-2"
                    >
                      <CompanyAvatar name={account.company_name} size="sm" />
                      <span className="text-sm text-[var(--bellum-text-primary)]">{account.company_name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11"
                        disabled={unfollow.isPending}
                        aria-label={t('watches.unfollow', { name: account.company_name })}
                        onClick={() => unfollow.mutate(account.account_id)}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </TheoTabPanel>
          )}
        </div>

        <footer className={`${PAGE_GUTTER_X} flex flex-wrap items-center justify-between gap-2`}>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('watches.scopeNote')}
          </Text>
          <Button asChild variant="link" className="min-h-11 px-0">
            <Link to="/settings/notifications">{t('watches.preferences')}</Link>
          </Button>
        </footer>
      </div>

      {formFor ? (
        <WatchFormDialog
          key={formFor === 'new' ? 'new' : formFor.id}
          open
          onOpenChange={open => {
            if (!open) setFormFor(null)
          }}
          watch={formFor === 'new' ? null : formFor}
          followed={followed}
          followMax={followMax}
        />
      ) : null}

      <Dialog
        open={toDelete !== null}
        onOpenChange={open => {
          if (!open) setToDelete(null)
        }}
      >
        <DialogContent closeLabel={t('form.close')}>
          <DialogHeader>
            <DialogTitle>{t('watches.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('watches.deleteBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setToDelete(null)}>
              {t('form.cancel')}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={archive.isPending}
              onClick={() => {
                if (toDelete) archive.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })
              }}
            >
              {t('watches.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Une ligne du tableau : en mobile, elle s'empile en carte (une borne, 768 px). */
function WatchRow({
  watch,
  locale,
  pending,
  onAdjust,
  onToggleState,
  onDelete,
}: {
  watch: WatchItem
  locale: string
  pending: boolean
  onAdjust: () => void
  onToggleState: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('signalsLibrary')
  const notFollowed = watch.accounts.filter(account => !account.followed)
  const toConnect = notFollowed.length > 0
  const topics = [
    watch.natures.length === 0
      ? t('watches.allNatures')
      : watch.natures.map(nature => t(`natures.${nature}`)).join(', '),
    ...watch.keywords,
  ].join(' · ')
  const cell = 'block px-4 py-1 align-top md:table-cell md:py-3'

  return (
    <tr
      data-testid="watch-row"
      className="grid border-b border-[var(--bellum-border)] py-2 last:border-b-0 md:table-row md:py-0"
    >
      <td className={cell}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 -space-x-1.5">
            {watch.accounts.slice(0, 3).map(account => (
              <CompanyAvatar key={account.account_id} name={account.company_name} size="sm" />
            ))}
          </span>
          <span className="min-w-0 truncate font-semibold text-[var(--bellum-text-primary)]">{watch.name}</span>
          {watch.shared ? <TheoPill tone="accent">{t('watches.sharedTag')}</TheoPill> : null}
        </div>
        <p className="mt-1 text-xs text-[var(--bellum-text-secondary)]">
          {watch.accounts.map(account => account.company_name).join(', ')}
        </p>
        <p className="text-xs text-[var(--bellum-text-muted)]">{topics}</p>
        <p className="text-xs text-[var(--bellum-text-muted)]">{t(`channels.${watch.channel}`)}</p>
      </td>
      <td className={cell}>
        <p className="text-[var(--bellum-text-primary)]">{t(`cadences.${watch.cadence}`)}</p>
        <p className="text-xs text-[var(--bellum-text-muted)]">{watch.timezone}</p>
      </td>
      <td className={cell}>
        {watch.next_run_on ? (
          <p className="tabular-nums text-[var(--bellum-text-primary)]">{dateFormat(watch.next_run_on, locale)}</p>
        ) : (
          <p className="text-[var(--bellum-text-secondary)]">{t('watches.nextPaused')}</p>
        )}
        {toConnect ? (
          <p className="text-xs text-[var(--bellum-text-muted)]">
            {t('watches.toFollowHint', { names: notFollowed.map(account => account.company_name).join(', ') })}
          </p>
        ) : null}
      </td>
      <td className={cell}>
        {watch.state === 'paused' ? (
          <TheoPill>{t('watches.statePaused')}</TheoPill>
        ) : toConnect ? (
          <TheoPill tone="warning">{t('watches.stateToConnect')}</TheoPill>
        ) : (
          <TheoPill tone="success">{t('watches.stateActive')}</TheoPill>
        )}
      </td>
      <td className={cell}>
        {watch.mine ? (
          <div className="flex items-center justify-start gap-1 md:justify-end">
            <Button type="button" variant="ghost" className="min-h-11" onClick={onAdjust}>
              {t('watches.adjust')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              disabled={pending}
              aria-label={watch.state === 'active' ? t('watches.pause') : t('watches.resume')}
              onClick={onToggleState}
            >
              {watch.state === 'active' ? (
                <Pause className="size-4" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              aria-label={t('watches.deleteAria', { name: watch.name })}
              onClick={onDelete}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-[var(--bellum-text-muted)]">{t('watches.readOnlyShort')}</p>
        )}
      </td>
    </tr>
  )
}
