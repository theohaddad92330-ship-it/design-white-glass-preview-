import type { Account } from '@bellum/contracts'
import { Badge, Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TagChips } from '@/components/primitives/TagChips'
import { companyRegistryUrl } from '@/lib/company-registry'
import { getStatusConfig, statusLabelKey } from '../../accounts-list/types'
import { AccountTeamFacts } from '../collaboration/AccountCollaborationBand'
import { AccountAnalysisVerdictButtons } from './AccountAnalysisVerdictButtons'
import { AccountCostChip } from './AccountCostChip'
import { AccountDetailHeroIdentity } from './AccountDetailHeroIdentity'
import { AccountDetailHeroNextAction } from './AccountDetailHeroNextAction'
import { AccountFreshness } from './AccountFreshness'
import { AccountImportLine } from './AccountImportLine'
import { CadrageApplied } from './CadrageApplied'
import { CommercialStatusHistory } from './CommercialStatusHistory'
import { CrmOpenDealsBatchAdvance } from './CrmOpenDealsBatchAdvance'
import { CrmPresenceBadge } from './CrmPresenceBadge'
import { CrmFieldSourceTag } from './AccountCrmSays'

/**
 * #4507 — « PÉRIMÈTRE & DONNÉES » : le panneau qui porte tout ce qui sort de la ligne d'identité.
 *
 * Maquette V22 (`.a4-dossier-check` → `dlg-scope`) : l'en-tête ne garde qu'« ✓ Dossier consultable · date ·
 * Périmètre & données ». Ce qui était une rangée de sept pastilles et une ligne de fraîcheur (#3279, #3499)
 * vit ici, rien supprimé : statut d'analyse, nombre d'analyses, fraîcheur, cadrage ; présence CRM et lot
 * d'affaires (#3379, #4459 — revient sur la pastille dans l'en-tête) ; SIREN et siège ; statut commercial et son
 * historique ; identité (nom commercial, pays, zone, intermédiaire, étiquettes) ;
 * prochaine action ; équipe ; et les boutons de verdict ✓ – ✕ ?.
 *
 * Une rubrique dont tous les faits sont absents ne se rend pas (`:has(> [data-body]:empty)`) : chaque
 * composant enfant est present-only, et un titre orphelin serait une ligne pour une absence.
 */
export function AccountScopePanel({
  account,
  onTabChange,
}: {
  account: Account
  onTabChange?: (tab: 'plan' | 'veille') => void
}) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)
  const status = getStatusConfig(account.status)
  const registryUrl = account.siren ? companyRegistryUrl(account.siren) : null
  const headquarters = account.headquarters?.trim() || null

  return (
    <>
      <Button type="button" variant="plain" size="sm" icon={SlidersHorizontal} onClick={() => setOpen(true)}>
        {t('header.scope.open')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          closeLabel={t('common:actions.close')}
          className="w-full overflow-y-auto sm:max-w-md"
          data-testid="account-scope-panel"
        >
          <SheetHeader className="border-b border-[var(--bellum-border)] px-4 py-4 md:px-6">
            <SheetTitle>{t('header.scope.title')}</SheetTitle>
            <SheetDescription>{t('header.scope.description', { company: account.company_name })}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-5 px-4 py-4 md:px-6">
            <ScopeSection testId="scope-analysis" title={t('header.scope.analysis')}>
              <Badge
                title={t('hero.analysisState')}
                className={`w-fit border-0 px-2 py-0.5 text-xs ${status.bg} ${status.text}`}
              >
                {t('hero.analysisStateBadge', { state: t(statusLabelKey(account.status)) })}
              </Badge>
              <AccountCostChip accountId={account.id} />
              <AccountFreshness account={account} />
              <CadrageApplied accountId={account.id} className="min-w-0" />
            </ScopeSection>
            <ScopeSection testId="scope-crm" title={t('header.scope.crm')}>
              <CrmPresenceBadge account={account} />
              {/* #4680 — le compte vient d'un import : on le DIT (rien sinon). */}
              <AccountImportLine />
              {/* #2854 (#2201.9) — le lot d'affaires ouvertes, PROPOSÉ jamais écrit d'ici. */}
              <CrmOpenDealsBatchAdvance account={account} />
            </ScopeSection>
            <ScopeSection testId="scope-registry" title={t('header.scope.registry')}>
              {account.siren ? (
                registryUrl ? (
                  // #1884 — le SIREN est un IDENTIFIANT : il ouvre la fiche du registre, sous un nom qui dit où il mène.
                  <a
                    href={registryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('hero.sirenLink', { siren: account.siren })}
                    className="inline-flex min-h-6 w-fit items-center text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
                  >
                    {t('hero.siren', { siren: account.siren })}
                  </a>
                ) : (
                  <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t('hero.siren', { siren: account.siren })}
                  </Text>
                )
              ) : null}
              {/* #4604 — d'où vient le SIREN affiché (CRM du client, ou corrigé à la main) ; inconnu ⇒ rien. */}
              {account.siren ? <CrmFieldSourceTag field="siren" /> : null}
              {headquarters ? (
                <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                  <span className="text-[var(--bellum-text-muted)]">{t('header.scope.headquarters')} · </span>
                  {headquarters}
                </Text>
              ) : null}
            </ScopeSection>
            <ScopeSection testId="scope-status" title={t('header.scope.status')}>
              {/* #2117.23, .24 — le motif et l'historique du statut commercial. */}
              <CommercialStatusHistory accountId={account.id} />
            </ScopeSection>
            <ScopeSection testId="scope-identity" title={t('header.scope.identity')}>
              <AccountDetailHeroIdentity account={account} />
              <TagChips tags={account.tags} list="accounts" label={t('hero.tags')} />
            </ScopeSection>
            <ScopeSection testId="scope-next-action" title={t('header.scope.nextAction')}>
              <AccountDetailHeroNextAction account={account} onTabChange={onTabChange} />
            </ScopeSection>
            <ScopeSection testId="scope-team" title={t('header.scope.team')}>
              <AccountTeamFacts account={account} />
            </ScopeSection>
            <ScopeSection testId="scope-verdict" title={t('header.scope.verdict')}>
              {/* #2076.9-.12 — « Première preuve sur une situation connue » : verdict de JUSTESSE. */}
              <AccountAnalysisVerdictButtons accountId={account.id} />
            </ScopeSection>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function ScopeSection({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="flex flex-col gap-2 [&:has(>[data-body]:empty)]:hidden">
      <Text
        element="h3"
        size="xs"
        weight="semibold"
        className="uppercase tracking-widest text-[var(--bellum-text-muted)]"
      >
        {title}
      </Text>
      <div data-body="" className="flex flex-col gap-2">
        {children}
      </div>
    </section>
  )
}
