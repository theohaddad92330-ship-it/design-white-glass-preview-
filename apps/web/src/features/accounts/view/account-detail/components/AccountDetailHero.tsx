import { readReferenceArchive, type Account, type Contact } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, CircleCheck, Eye, FileDown, FileText, PlayCircle, RefreshCw, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { compactSector } from '@bellum/utils'
import { useAccountPdfExport } from '@/features/accounts/hooks/useAccountPdfExport'
import { useAccountRelaunch } from '@/features/accounts/hooks/useAccountRelaunch'
import { useContactsStore } from '@/features/contacts/store/useContactsStore'
import { CrmPushDialog } from '@/features/crm/view/CrmPushDialog'
import { CompleteCrmAccountDialog } from '@/features/crm/view/CompleteCrmAccountDialog'
import { AccountGateControl } from '@/features/accounts/gate/AccountGateControl'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { trackActionStarted } from '@/lib/product-tracker'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { appLocale, formatDate } from '@/lib/locale'
import { lastAnalyzedDate } from '../../../model/lastAnalyzed'
import { AccountCollaborationAlerts, AccountCollaborationMenuItems } from '../collaboration/AccountCollaborationBand'
import { AccountTeamDialog } from '../collaboration/AccountTeamDialog'
import { DossierCtaButton } from '../cta/DossierCta'
import { EXPORTS_NOT_IN_PLAN } from '../cta/dossier-cta-blocked'
import { askLauraSearch } from '../helpers/ask-laura-search'
import { AccountDetailMoreActionsMenu } from './AccountDetailMoreActionsMenu'
import type { TabId } from './AccountDetailTabsBar'
import { AccountFollowMenuItem, AccountHeaderWorkMenuItems } from './AccountHeaderMenuItems'
import { AccountIdentityLine } from './AccountIdentityLine'
import { AccountGroupEntityLine } from './AccountGroupEntityLine'
import { AccountPdfPreviewSheet } from './AccountPdfPreviewSheet'
import { AccountPinButton } from './AccountPinButton'
import { AccountScopePanel } from './AccountScopePanel'
import { AccountShareDialog } from './AccountShareDialog'
import { AgendaSlotProposalTrigger } from './AgendaSlotProposalTrigger'
import { useCanCompleteCrmAccount } from './CompleteCrmAccountButton'
import { RelaunchConfirmDialog, RelaunchImpactNote, RelaunchImpactTooltip } from './RelaunchImpact'
import { useHeroPrimaryAction } from './useHeroPrimaryAction'
import { CrmFieldSourceTag } from './AccountCrmSays'

/** #2130.65 — même convention que `TabPartners.tsx` : le motif de route littéral (GA-276). */
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'

type AccountDetailHeroProps = {
  account: Account
  contacts: Contact[]
  /** #2446.15 — l'écrivain UNIQUE de l'onglet actif (`AccountDetail.handleTabChange`, GA-26). */
  onTabChange?: (tab: TabId) => void
}

/**
 * L'EN-TÊTE DU DOSSIER — refonte V22 (#4507, contrat validé par Louis le 23/10/2026).
 *
 * ⚠️ REVIENT SUR, daté et assumé (décision Louis 24/10, #4507) :
 *  · #2117.6 / .25-30 (le geste principal PAR ÉTAT au premier niveau) : « Tout le reste dans « … » ». Rien
 *    n'est supprimé, chaque geste garde son contrat (`DOSSIER_CTA_CONTRACTS`) et sa destination ;
 *  · NE REVIENT PAS sur (arbitrage Louis 24/10) : la porte de priorité « Signaler » et les quatre livrables
 *    (Aperçu PDF, Brief, Partager, Exporter) gardent leur place visible de `main` ;
 *  · #3279 / #3499 (deux rangées denses : sept pastilles d'état et une ligne de fraîcheur) et #3379 / #4459
 *    (pastille CRM dans l'en-tête) : ces faits passent dans « Périmètre & données » (`AccountScopePanel`) ;
 *  · #2117.84 (rangée mobile d'icônes) : la même barre à toutes les largeurs — trois cibles, elle tient à
 *    375 px ;
 *  · `.x-collab` de la refonte Théo (23/10) et #4158.24/.25 : le porteur passe sur la ligne d'identité, les
 *    gestes d'équipe dans « … ».
 *
 * Le dessin, dans l'ordre de la maquette (`.a4-dossier-hero`) :
 *  1. la barre — « ← Portefeuille » à gauche ; porte de priorité · épingle · **Actualiser** (le SEUL bouton plein) · livrables · « … » ;
 *  2. l'identité — logo, sur-titre « secteur · taille », nom, la ligne ville · effectif · statut · responsable ;
 *  3. à droite, « ✓ Dossier consultable · date · Périmètre & données ».
 *
 * « Actualiser » est la relance d'un dossier livré (confirmation d'abord, #2555). Sur un dossier dont
 * l'analyse n'est pas allée au bout, le même bouton plein dit ce qu'il fait (« Analyser le compte » /
 * « Terminer l'analyse », #4459.1) : c'est le même geste, et il n'existe qu'une fois (GA-26). Pendant un run,
 * et sur une archive de référence (comptes-fiche-reference.A2), il n'y a rien à actualiser : aucun bouton.
 */
export function AccountDetailHero({ account, contacts, onTabChange }: AccountDetailHeroProps) {
  const { t } = useTranslation('accounts')
  const navigate = useNavigate()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [relaunchOpen, setRelaunchOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [crmPushOpen, setCrmPushOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)

  const currentContact = useContactsStore(state => state.currentContact)
  const contactsForActions = currentContact
    ? [currentContact, ...contacts.filter(c => c.id !== currentContact.id)]
    : contacts

  const { relaunch } = useAccountRelaunch(account)
  const { exportPdf, isExporting, locked: exportsLocked, lockDialog } = useAccountPdfExport(account, contactsForActions)
  const isReferenceArchive = readReferenceArchive(account.raw_analysis) !== null
  const choice = useHeroPrimaryAction(account)
  const canComplete = useCanCompleteCrmAccount(account)
  const openLauraInPlace = useOpenLauraInPlace()

  const goToTab = (tab: 'plan' | 'veille' | 'history') => {
    if (onTabChange) {
      onTabChange(tab)
      return
    }
    void navigate({ to: '/accounts/$id', params: { id: account.id }, search: prev => ({ ...prev, tab }) })
  }
  const goToBrief = () => {
    void navigate({ to: '/accounts/$id/brief', params: { id: account.id } })
  }
  const askLaura = () => {
    trackActionStarted('laura_opened_from_account', ACCOUNT_DETAIL_SCREEN)
    // F1-FIX #4345 — la bulle s'ouvre sur place (contexte de la fiche) ; le lien /chat reste le repli.
    if (openLauraInPlace) {
      openLauraInPlace(askLauraSearch(account).prompt ?? '')
      return
    }
    void navigate({ to: '/chat', search: askLauraSearch(account) })
  }
  // #2130.55 — un nom d'action agrégé pour le geste principal, jamais lequel des cinq états l'a produit.
  const trackPrimary = () => trackActionStarted('primary_action_clicked', ACCOUNT_DETAIL_SCREEN)
  const nextAction =
    choice.state === 'analysis-incomplete'
      ? null
      : {
          state: choice.state,
          onSelect: () => {
            trackPrimary()
            if (choice.state === 'meeting-booked') goToBrief()
            else goToTab(choice.state === 'watching' ? 'veille' : 'plan')
          },
        }

  const canRefresh = account.status !== 'analyzing' && !isReferenceArchive
  const isComplete = account.status === 'completed'
  const sector = compactSector(account.sector)
  // Le sur-titre « secteur · taille » : la taille est le chiffre d'affaires quand l'effectif, lui, est déjà
  // sur la ligne d'identité (jamais deux fois la même valeur). Une valeur absente ne fait aucun segment.
  const revenue = account.employees?.trim() ? revenueLabel(account.revenue) : null
  const eyebrow = [sector, revenue ? t('header.revenue', { value: revenue }) : null].filter(Boolean).join(' · ')
  const analyzedAt = formatDate(lastAnalyzedDate(account), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      <header data-testid="account-hero" className="flex flex-col gap-4 pt-2 md:pt-4">
        {/* 1. `.a4-dossier-top` */}
        <div data-testid="hero-toolbar" className="flex items-center justify-between gap-2">
          <Link
            to="/accounts"
            aria-label={t('header.backAria')}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('header.back')}
          </Link>
          <div data-testid="hero-tools" className="flex flex-wrap items-center justify-end gap-1">
            {/* Arbitrage Louis 24/10 (#4507) : la porte de priorité (« Signaler », icône drapeau) reprend sa place
                de `main` — le PREMIER outil de la barre, même déclencheur — et ne vit plus dans « Périmètre &
                données » (un réglage, un seul endroit, GA-26). */}
            <AccountGateControl
              accountId={account.id}
              gate={account.priority_gate ?? 'pending'}
              reason={account.gate_reason ?? null}
              companyName={account.company_name ?? null}
              iconOnly
            />
            <AccountPinButton accountId={account.id} companyName={account.company_name} />
            {canRefresh && isComplete ? (
              <RelaunchImpactTooltip account={account}>
                {/* #2116.28-30 — l'effet est une NAVIGATION vers la recherche pré-remplie, après confirmation. */}
                <DossierCtaButton
                  cta="dossier.analysis.relaunch"
                  variant="default"
                  size="default"
                  icon={RefreshCw}
                  ownTooltip
                  onClick={() => setRelaunchOpen(true)}
                >
                  {t('header.refresh')}
                </DossierCtaButton>
              </RelaunchImpactTooltip>
            ) : null}
            {canRefresh && !isComplete ? (
              <DossierCtaButton
                cta="dossier.hero.finishAnalysis"
                variant="default"
                size="default"
                icon={PlayCircle}
                onClick={() => {
                  trackPrimary()
                  relaunch()
                }}
              >
                {choice.neverAnalyzed ? t('hero.primary.analyzeAccount') : t('hero.primary.finishAnalysis')}
              </DossierCtaButton>
            ) : null}
            {/* Arbitrage Louis 24/10 (#4507) : « Exporter » n'est PAS « Brief + PDF » — les quatre livrables
                reprennent leurs boutons visibles de `main` (Q-1816 renversée), même ordre, mêmes contrats. */}
            <DossierCtaButton
              cta="dossier.pdf.preview"
              variant="ghost"
              size="icon"
              aria-label={t('moreActions.previewPdf')}
              icon={Eye}
              onClick={() => {
                // #2130.65 — anonyme, par écran : jamais l'accountId.
                trackActionStarted('export_previewed', ACCOUNT_DETAIL_SCREEN)
                setPreviewOpen(true)
              }}
            />
            <DossierCtaButton
              cta="dossier.brief.open"
              variant="ghost"
              size="icon"
              aria-label={t('hero.brief')}
              icon={FileText}
              onClick={goToBrief}
            />
            <DossierCtaButton
              cta="dossier.share.open"
              variant="ghost"
              size="icon"
              aria-label={t('common:actions.share')}
              icon={Share2}
              onClick={() => setShareOpen(true)}
            />
            {/* #2081.14 — livrable commercial, décision Louis 19/09 : plus masqué par la règle d'espace. */}
            <DossierCtaButton
              cta="dossier.pdf.export"
              variant="ghost"
              size="icon"
              aria-label={t('moreActions.downloadPdf')}
              icon={FileDown}
              blockedBy={exportsLocked ? EXPORTS_NOT_IN_PLAN : null}
              busy={isExporting}
              unblockOnClick
              onClick={exportPdf}
            />
            <AccountDetailMoreActionsMenu
              accountId={account.id}
              companyName={account.company_name}
              showRefreshDimensions={isComplete && !isReferenceArchive}
              isCustomer={account.commercial_status === 'customer'}
              website={account.website}
              siren={account.siren}
              nextAction={nextAction}
              onCompleteAccount={canComplete ? () => setCompleteOpen(true) : null}
              onAskLaura={askLaura}
              workItems={
                <>
                  <AccountHeaderWorkMenuItems
                    onComment={onTabChange ? () => onTabChange('history') : undefined}
                    onPlan={() => setPlanOpen(true)}
                    onCrmPush={() => setCrmPushOpen(true)}
                  />
                  <AccountFollowMenuItem accountId={account.id} />
                </>
              }
              teamItems={<AccountCollaborationMenuItems account={account} onOpenTeam={() => setTeamOpen(true)} />}
            />
          </div>
        </div>

        {/* 2. `.a4-dossier-identity` puis 3. `.a4-dossier-check` */}
        <div data-testid="hero-top" className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden="true"
              className="flex shrink-0 items-center justify-center rounded-2xl border border-[var(--bellum-border)] bg-card p-2 shadow-sm"
            >
              <CompanyAvatar
                size="lg"
                name={account.company_name ?? '?'}
                logoUrl={account.logo_url}
                website={account.website}
              />
            </span>
            <div className="min-w-0">
              {eyebrow ? (
                <span
                  data-testid="hero-eyebrow"
                  title={account.sector ?? undefined}
                  className="block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-muted)]"
                >
                  {eyebrow}
                </span>
              ) : null}
              <Text
                element="h1"
                size="3xl"
                weight="semibold"
                leading="tight"
                className="break-words tracking-tight text-[var(--bellum-text-primary)] md:text-4xl"
              >
                {account.company_name}
              </Text>
              {/* #4604 — la provenance du nom, là où on le lit (« vient de HubSpot » / « corrigé dans Bellum »). */}
              <CrmFieldSourceTag field="company_name" />
              <AccountIdentityLine account={account} />
              {/* #4988.1 — « Groupe X · entité analysée Y » quand le compte est une entité d'un groupe connu. */}
              <AccountGroupEntityLine rawAnalysis={account.raw_analysis} />
            </div>
          </div>
          <div
            data-testid="hero-dossier-check"
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--bellum-text-secondary)] md:justify-end"
          >
            {isComplete ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[var(--success-soft-text)]">
                <CircleCheck className="size-4" aria-hidden />
                {t('header.dossierReady')}
              </span>
            ) : null}
            {analyzedAt ? (
              <span data-testid="hero-analyzed-at">{t('hero.analyzedOn', { date: analyzedAt })}</span>
            ) : null}
            <AccountScopePanel account={account} onTabChange={onTabChange} />
          </div>
        </div>

        {/* Le repli tactile de la garantie d'« Actualiser » (au doigt, pas de survol). */}
        {!isReferenceArchive ? <RelaunchImpactNote status={account.status} /> : null}
        {/* Les collisions avec un collègue, seulement quand il y en a (ex-bandeau `.x-collab`). */}
        <AccountCollaborationAlerts account={account} onOpenHistory={() => goToTab('history')} />
      </header>

      <AccountPdfPreviewSheet
        account={account}
        contacts={contactsForActions}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
      <RelaunchConfirmDialog
        account={account}
        open={relaunchOpen}
        onOpenChange={setRelaunchOpen}
        onConfirm={relaunch}
      />
      <AccountShareDialog
        accountId={account.id}
        companyName={account.company_name}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <AgendaSlotProposalTrigger
        accountId={account.id}
        companyName={account.company_name}
        open={planOpen}
        onOpenChange={setPlanOpen}
      />
      <CrmPushDialog
        open={crmPushOpen}
        onOpenChange={setCrmPushOpen}
        selection={{ accountIds: [account.id], contactIds: [] }}
      />
      <CompleteCrmAccountDialog open={completeOpen} onOpenChange={setCompleteOpen} contacts={contacts} />
      <AccountTeamDialog
        accountId={account.id}
        companyName={account.company_name}
        open={teamOpen}
        onOpenChange={setTeamOpen}
      />
      {lockDialog}
    </>
  )
}

/**
 * Le chiffre d'affaires, LISIBLE : le registre le rend en euros bruts (« 57412795000 »), qui se formate en notation
 * compacte (« 57,4 Md € ») ; une valeur déjà rédigée (« 210 M€ ») passe telle quelle. Absente → `null`.
 */
function revenueLabel(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  if (!/^\d+(\.\d+)?$/.test(value)) return value
  return new Intl.NumberFormat(appLocale(), {
    notation: 'compact',
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 1,
  }).format(Number(value))
}
