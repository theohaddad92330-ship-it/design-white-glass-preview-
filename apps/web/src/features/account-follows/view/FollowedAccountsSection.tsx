import { Box, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { ACCOUNT_FOLLOW_CAP_REACHED, type AccountFollowItem } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { useAccountSignals } from '@/features/accounts/hooks/useAccountSignals'
import { nextReanalysisText } from '@/features/accounts/view/account-detail/components/NextReanalysisLine'
import { ApiError } from '@/lib/api-error'
import { useAccountFollows, useMarkMigrationNoticeSeen, useToggleAccountFollow } from '../api'

/**
 * #4267 — « COMPTES SUIVIS », EN TÊTE DE /mes-cibles.
 *
 * Décisions de Louis (18/10/2026) : personne n'est suivi par défaut ; suivre est un geste explicite ;
 * 3 comptes au plus par utilisateur (Louis 23/10 : la maquette a6 à 5 n'est pas retenue). L'écran tient les quatre promesses :
 *  · 4267.1 — la liste de CE QUE TU SUIS, avec « Ne plus suivre » ;
 *  · 4267.2 — sans suivi, UNE carte : ton compte analysé le plus récent et « Suivre » ; sans compte
 *    analysé, la phrase qui le dit et la porte vers l'analyse ;
 *  · 4267.3 — au plafond, l'écran le dit AVANT le clic (bouton désactivé + la phrase) ; le 409 du
 *    serveur se lit avec la même phrase, reconnu à son CODE, jamais au texte ;
 *  · 4267.4 — la notice de reprise, une fois ; les suivis archivés se re-suivent en un clic.
 *
 * Refonte Théo (23/10/2026, maquette validée `decouvrir/mes-cibles.html`) — l'ancien repli « Comptes
 * suivis · 3 / 3 » devient UNE phrase au-dessus du tableau de la veille : « Tu suis 3 comptes sur 3 :
 * A, B, C. Gérer ». Le chiffre vit là, une fois. « Gérer » ouvre la
 * fenêtre des suivis (Ne plus suivre, plafond, anciens suivis, Analyser une entreprise) : la promesse
 * de Louis du 21/10 (« ne pas pousser ce qui bouge sous la ligne de flottaison ») tient toujours.
 *
 * N-SUIVIS (#4538) — garde #4267 ; précise la refonte Théo du 23/10 sur l'onglet Suivis : la phrase ne
 * tient pas lieu de liste. Chaque compte réellement suivi a SA ligne (un par ligne, les mêmes que « Gérer »
 * et que le compteur) ; les faits de la veille l'enrichissent, et leur absence se NOMME sur la ligne
 * (« Aucun fait dans ta veille ») au lieu de la supprimer. « On n'affiche pas ce qu'on n'a pas » porte sur
 * le FAIT absent, jamais sur le COMPTE qu'on a.
 *
 * Le plafond vient de la réponse (`max`, lui-même `ACCOUNT_FOLLOW_MAX_PER_USER`) : il n'est pas recopié ici (GA-26).
 */
export function FollowedAccountsSection({ crmAccountIds }: { crmAccountIds?: ReadonlySet<string> }) {
  const { t, i18n } = useTranslation('targets')
  const { t: tAccounts } = useTranslation('accounts')
  const follows = useAccountFollows()
  const signals = useAccountSignals()
  const toggle = useToggleAccountFollow()
  const noticeSeen = useMarkMigrationNoticeSeen()
  const [capRefused, setCapRefused] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)

  // N-SUIVIS (#4538) — les faits de la veille ENRICHISSENT la ligne d'un compte suivi, ils ne décident
  // plus de sa présence. `null` tant que la veille n'a pas répondu : la ligne n'affirme alors rien.
  const factsByAccount = useMemo(() => {
    if (!signals.data) return null
    const counts = new Map<string, number>()
    for (const signal of signals.data) counts.set(signal.account_id, (counts.get(signal.account_id) ?? 0) + 1)
    return counts
  }, [signals.data])

  if (follows.isPending) return null
  if (follows.isError || !follows.data) {
    return (
      <Box className={PAGE_GUTTER_X}>
        <p role="alert" className="text-sm text-[var(--bellum-text-secondary)]">
          {t('follows.loadError')}
        </p>
      </Box>
    )
  }

  const { max, followed, archived, suggestion, migration_notice } = follows.data
  const atCap = followed.length >= max
  // #4526.3 — « Suivis » ∩ « Mon CRM » : sous la puce CRM, la liste ne garde que les suivis qui y sont aussi (les
  // filtres se COMBINENT, ils ne s'excluent pas). Le plafond et « Gérer » parlent, eux, de TOUS les suivis.
  const shown = crmAccountIds ? followed.filter(account => crmAccountIds.has(account.account_id)) : followed
  const capMessage = t('follows.capReached', { max })
  const listFormat = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' })

  const setFollow = (accountId: string, follow: boolean) => {
    setCapRefused(false)
    toggle.mutate(
      { accountId, follow },
      {
        onError: error => {
          if (error instanceof ApiError && error.code === ACCOUNT_FOLLOW_CAP_REACHED) setCapRefused(true)
        },
      },
    )
  }

  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Paris',
    })

  /** #4283.8 — « Prochaine mise à jour le … · dernière le … » d'un suivi actif, lu de l'API (jamais calculé ici). */
  const refreshLine = (account: AccountFollowItem): string | null => {
    const next = account.next_reanalysis_at ? new Date(`${account.next_reanalysis_at}T12:00:00Z`) : null
    if (next && !Number.isNaN(next.getTime())) {
      const nextLabel = dayLabel(next.toISOString())
      return account.last_analyzed_at
        ? t('follows.refreshWithLast', { next: nextLabel, last: dayLabel(account.last_analyzed_at) })
        : t('follows.refreshNext', { next: nextLabel })
    }
    return nextReanalysisText(tAccounts, i18n.language, null, account.next_reanalysis_reason)
  }

  const row = (account: AccountFollowItem, action: 'follow' | 'unfollow') => {
    const refresh = action === 'unfollow' ? refreshLine(account) : null
    return (
      <li
        key={account.account_id}
        className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--bellum-border)] py-1.5 last:border-b-0"
      >
        <span className="flex min-w-0 items-center gap-3">
          {/* Les initiales, teintées : le repère visuel d'un compte, comme dans la liste des comptes. */}
          <span
            aria-hidden
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-badge bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
          >
            {account.company_name.trim().slice(0, 2).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col">
            <Link
              to="/accounts/$id"
              params={{ id: account.account_id }}
              className="min-w-0 truncate text-sm font-medium text-[var(--bellum-text-primary)] hover:underline"
            >
              {account.company_name}
            </Link>
            {/* #4283.8 — la prochaine mise à jour d'un suivi actif, lue de l'API. */}
            {refresh ? (
              <span data-testid="followed-refresh-line" className="text-xs text-[var(--bellum-text-secondary)]">
                {refresh}
              </span>
            ) : null}
          </span>
        </span>
        <Button
          type="button"
          variant={action === 'follow' ? 'secondary' : 'ghost'}
          size="sm"
          className="min-h-11 shrink-0"
          disabled={toggle.isPending || (action === 'follow' && atCap)}
          aria-label={t(action === 'follow' ? 'follows.followNamed' : 'follows.unfollowNamed', {
            name: account.company_name,
          })}
          onClick={() => setFollow(account.account_id, action === 'follow')}
        >
          {t(action === 'follow' ? 'follows.follow' : 'follows.unfollow')}
        </Button>
      </li>
    )
  }

  const capLine =
    atCap || capRefused ? (
      <Text role="status" size="sm" color="text-[var(--bellum-text-secondary)]">
        {capMessage}
      </Text>
    ) : null

  const manageButton =
    followed.length > 0 || archived.length > 0 ? (
      <button
        type="button"
        aria-label={t('follows.manageAria')}
        aria-haspopup="dialog"
        onClick={() => setManageOpen(true)}
        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline md:min-h-0"
      >
        {t('follows.manage')}
      </button>
    ) : null

  return (
    <Box
      as="section"
      aria-label={t('follows.heading')}
      data-testid="followed-accounts"
      className={`${PAGE_GUTTER_X} flex min-w-0 flex-col gap-2`}
    >
      {/* #4267.4 — la notice de reprise : un encart, une fois, refermable. */}
      {migration_notice ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-[var(--info-soft-border)] bg-[var(--info-soft-bg)] px-3 py-2">
          <Text size="sm" color="text-[var(--info-soft-text)]">
            {t('follows.migrationNotice')}
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={noticeSeen.isPending}
            onClick={() => noticeSeen.mutate()}
          >
            {t('follows.migrationNoticeDismiss')}
          </Button>
        </div>
      ) : null}

      {crmAccountIds && followed.length > 0 && shown.length === 0 ? (
        // #4526.3 — l'intersection est vide : l'écran le DIT (jamais les suivis hors CRM à la place).
        <p className="text-sm text-[var(--bellum-text-secondary)]" data-testid="followed-crm-none">
          {t('follows.crmNone', { count: followed.length })} {manageButton}
        </p>
      ) : shown.length > 0 ? (
        <>
          <p className="text-sm text-[var(--bellum-text-secondary)]" data-testid="followed-sentence">
            <Trans
              t={t}
              i18nKey="follows.sentence"
              count={shown.length}
              values={{ max, names: listFormat.format(shown.map(account => account.company_name)) }}
              components={{
                strong: <strong className="font-semibold text-[var(--bellum-text-primary)] tabular-nums" />,
              }}
            />{' '}
            {manageButton}
          </p>
          <ul aria-label={t('follows.heading')} className="flex flex-col" data-testid="followed-list">
            {shown.map(account => (
              <li
                key={account.account_id}
                data-testid={`followed-row-${account.account_id}`}
                className="flex min-w-0 items-center gap-3 border-b border-[var(--bellum-border)] py-1.5 last:border-b-0"
              >
                <span
                  aria-hidden
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-badge bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
                >
                  {account.company_name.trim().slice(0, 2).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-col">
                  <Link
                    to="/accounts/$id"
                    params={{ id: account.account_id }}
                    className="min-w-0 truncate text-sm font-medium text-[var(--bellum-text-primary)] hover:underline"
                  >
                    {account.company_name}
                  </Link>
                  {factsByAccount ? (
                    <span className="text-xs text-[var(--bellum-text-secondary)]">
                      {t('follows.rowFacts', { count: factsByAccount.get(account.account_id) ?? 0 })}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : suggestion ? (
        <div className="flex max-w-xl flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-3">
          <p className="text-sm font-medium text-[var(--bellum-text-primary)]">{t('follows.emptyTitle')}</p>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('follows.suggestionLead')}
          </Text>
          <ul className="flex flex-col">
            {row(
              {
                account_id: suggestion.account_id,
                company_name: suggestion.company_name,
                sector: suggestion.sector,
                followed_at: suggestion.analyzed_at,
                archived_at: null,
                archived_reason: null,
              },
              'follow',
            )}
          </ul>
          {manageButton}
        </div>
      ) : (
        <div className="flex max-w-xl flex-col items-start gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-3">
          <p className="text-sm text-[var(--bellum-text-primary)]">{t('follows.noAnalysis')}</p>
          <Button asChild variant="secondary" size="sm" className="min-h-11">
            <Link to="/search">{t('follows.analyse')}</Link>
          </Button>
          {manageButton}
        </div>
      )}

      {/* Hors de la fenêtre aussi : le refus du serveur se lit là où le geste a eu lieu. */}
      {!manageOpen && capRefused ? capLine : null}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-lg" closeLabel={t('follows.close')}>
          <DialogHeader>
            <DialogTitle>{t('follows.manageTitle')}</DialogTitle>
            <DialogDescription>{t('follows.manageDescription', { max })}</DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-3">
            {followed.length > 0 ? (
              <ul className="flex flex-col" aria-label={t('follows.heading')}>
                {followed.map(account => row(account, 'unfollow'))}
              </ul>
            ) : null}
            {capLine}
            {archived.length > 0 ? (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-expanded={archivedOpen}
                  onClick={() => setArchivedOpen(current => !current)}
                  className="flex min-h-11 items-center gap-2 text-left text-sm font-medium text-[var(--bellum-text-secondary)]"
                >
                  {archivedOpen ? (
                    <ChevronDown className="size-4" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4" aria-hidden />
                  )}
                  {t('follows.archivedToggle', { count: archived.length })}
                </button>
                {archivedOpen ? (
                  <ul className="flex flex-col">{archived.map(account => row(account, 'follow'))}</ul>
                ) : null}
              </div>
            ) : null}
            <Button asChild variant="outline" size="sm" className="min-h-11 self-start">
              <Link to="/search">{t('follows.analyse')}</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
