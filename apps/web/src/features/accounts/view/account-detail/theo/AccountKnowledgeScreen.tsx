import type { Account, Contact } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { ArrowRight, Clock, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BriefKnowledge } from '@/features/brief-blocks/BriefKnowledge'
import { DuplicateCandidatesCard } from '@/features/team-guardrails/components/DuplicateCandidatesCard'
import { lastAnalyzedDate } from '../../../model/lastAnalyzed'
import { AccountSellerTargeting } from '../components/AccountSellerTargeting'
import { RefreshOutcomeCard } from '../components/RefreshOutcomeCard'
import { AccountVerdictSummary } from '../components/AccountVerdictSummary'
import type { TabId } from '../components/AccountDetailTabsBar'
import { GroupEntitiesCard } from '../components/GroupEntitiesCard'
import { LinkedAccountsCard } from '../components/LinkedAccountsCard'
import { withoutEsnOverlap } from '../tabs/brief/briefEsnOverlap'
import { parseCommercialBrief } from '../tabs/brief/parseCommercialBrief'
import { AccountKnowledgeCounters } from '../tabs/knowledge/AccountKnowledgeCounters'
import { AccountChangesCard } from '../tabs/sections/AccountChangesCard'
import { PresentEsnList } from '../tabs/sections/PresentEsnList'
import { mentionsExEsnProfiles } from '../tabs/sections/presentEsn'
import { AccountSynthesisTop, useSynthesisNextAction } from '../tabs/synthesis/AccountSynthesisCards'
import { BriefEntitiesList, BriefPricesByChannel, TabCommercialBrief } from '../tabs/TabCommercialBrief'
import { TabEvaluation } from '../tabs/TabEvaluation'
import { TabOverview } from '../tabs/TabOverview'
import { overviewHasEntityNotice } from '../overviewEntityNotice'
import { useAccountOverviewData } from '../tabs/useAccountOverviewData'
import { DossierAccordion, DossierCard, DossierEyebrow, DossierGrid, DossierMore } from './DossierBlocks'

/** L'ancre de « Pour aller plus loin » : « Source & portée » y mène (la provenance détaillée y vit, une fois). */
export const KNOWLEDGE_MORE_ANCHOR = 'pour-aller-plus-loin'

type AccountKnowledgeScreenProps = {
  account: Account
  contacts: Contact[]
  onTabChange: (tab: TabId) => void
}

/**
 * Refonte Théo (23/10/2026) — l'onglet « CE QUE JE SAIS », bloc pour bloc dans l'ordre de la maquette appliquée
 * `a/comptes-fiche.html` (`[data-when="sec:know"]`). « Vue d'ensemble » et « Score » y sont FONDUS (Louis) : rien
 * de ce qu'ils portaient n'est retiré, tout descend dans « Pour aller plus loin », replié.
 *
 *   1. `.ac20-provenance`  — la date de l'analyse, « Source & portée ».
 *   2. `.ac20-opening`     — « Le regard de Laura » (la lecture du dossier) | « À faire ensuite ».
 *   3. `.ac20-metrics`     — les repères (entités, besoins, TJM, contacts, intérêt EN MOTS).
 *   4. `.ac20-knowledge-grid` — les cartes : signal, porte d'entrée, ce que je sais, organisation, TJM, écosystème.
 *   5. `.x-more`           — « Pour aller plus loin » : brief, lectures de la synthèse, score et ses axes.
 *
 * Une carte sans donnée ne se rend pas (une absence ne fait aucune ligne, jamais « 0 »).
 */
export function AccountKnowledgeScreen({ account, contacts, onTabChange }: AccountKnowledgeScreenProps) {
  const { t, i18n } = useTranslation('accountDetail', { keyPrefix: 'knowledgeScreen' })
  const { t: tBrief } = useTranslation('accounts', { keyPrefix: 'commercialBrief' })
  const { t: tRead } = useTranslation('accountDetail', { keyPrefix: 'bellumRead' })
  const brief = parseCommercialBrief(account.raw_analysis)
  const shown = brief ? withoutEsnOverlap(brief) : null
  const overview = useAccountOverviewData(account)
  const hasReading = Boolean(overview.bellumRead.blocks?.verdictLine ?? overview.bellumRead.title)
  const nextAction = useSynthesisNextAction(account)
  // #2164.29 #2164.30 #2164.34 #2164.38 #2164.39 — avec un brief, la lecture est repliée : ce que l'actualisation
  // a dit y restait invisible. On la monte ICI (une fois) ; `TabOverview` ne la redit pas (`refreshLifted`, GA-26).
  const readNextAction = overview.bellumRead.blocks?.nextAction ?? null
  const analysedAt = lastAnalyzedDate(account)
  const economicDeciders =
    contacts.length > 0 ? contacts.filter(contact => contact.decision_role === 'economic').length : undefined

  const scrollToMore = () => {
    document.getElementById(KNOWLEDGE_MORE_ANCHOR)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div data-testid="knowledge-screen" className="flex min-w-0 flex-col gap-6">
      {/* 1 — `.ac20-provenance` */}
      {analysedAt ? (
        <div
          data-testid="knowledge-provenance"
          className="flex flex-wrap items-center gap-2 text-xs text-[var(--bellum-text-muted)]"
        >
          <Clock aria-hidden className="size-3.5 shrink-0" />
          <span>{t('provenance', { date: new Date(analysedAt).toLocaleDateString(i18n.language) })}</span>
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={scrollToMore}>
            {t('sourceScope')}
          </Button>
        </div>
      ) : null}

      {/* 2 — `.ac20-opening` : la lecture de Laura à gauche, la prochaine étape à droite. */}
      {hasReading || nextAction ? (
        <section
          data-testid="knowledge-opening"
          className="grid min-w-0 overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card md:grid-cols-[minmax(0,1.8fr)_minmax(15rem,1fr)]"
        >
          <div className="min-w-0 p-5 md:p-7">
            <AccountVerdictSummary account={account} />
          </div>
          {nextAction ? (
            <aside
              data-testid="knowledge-next"
              aria-label={t('nextEyebrow')}
              className="flex min-w-0 flex-col border-t border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-5 md:border-l md:border-t-0 md:p-7"
            >
              <DossierEyebrow>{t('nextEyebrow')}</DossierEyebrow>
              <Text element="h3" size="lg" weight="semibold" leading="snug" className="mt-4">
                {nextAction.label}
              </Text>
              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                <Button
                  type="button"
                  variant="black"
                  size="sm"
                  icon={ArrowRight}
                  iconPosition="right"
                  onClick={() => onTabChange(nextAction.tab)}
                >
                  {t('seePlan')}
                </Button>
                <Button type="button" variant="ghost" size="sm" icon={Users} onClick={() => onTabChange('contacts')}>
                  {t('seePeople')}
                </Button>
              </div>
            </aside>
          ) : null}
        </section>
      ) : null}

      {/* #2164.29 #2164.30 #2164.34 #2164.38 #2164.39 — ce que l'actualisation a dit, là où on atterrit (brief seulement :
          sans brief la lecture est ouverte d'office). Compte jamais actualisé ⇒ chaque carte se tait. */}
      {brief ? (
        <div data-testid="knowledge-refresh" className="flex min-w-0 flex-col gap-3 empty:hidden">
          {readNextAction ? (
            <section className="space-y-1">
              <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                {tRead('nextAction')}
              </Text>
              <Text element="p" size="sm" className="text-[var(--bellum-text-accent)] leading-relaxed">
                {readNextAction}
              </Text>
            </section>
          ) : null}
          <RefreshOutcomeCard account={account} />
          <AccountChangesCard accountId={account.id} />
        </div>
      ) : null}

      {/* 3 — `.ac20-metrics` */}
      <AccountKnowledgeCounters account={account} contacts={contacts} brief={brief} onTabChange={onTabChange} />

      {/* 4 — `.ac20-knowledge-grid` */}
      <DossierGrid testId="knowledge-grid">
        <AccountSynthesisTop account={account} contacts={contacts} onTabChange={onTabChange} layout="bare" />
        {brief && shown && shown.what_i_know.length > 0 ? (
          <DossierCard wide testId="knowledge-card-know" eyebrow={t('cards.knowEyebrow')} title={t('cards.knowTitle')}>
            <BriefKnowledge rows={shown.what_i_know} t={tBrief} />
          </DossierCard>
        ) : null}
        {brief && brief.entities.length > 0 ? (
          <DossierCard
            testId="knowledge-card-entities"
            eyebrow={t('cards.entitiesEyebrow')}
            title={t('cards.entitiesTitle')}
            footer={<CardLink label={t('cards.entitiesCta')} onClick={() => onTabChange('sites')} />}
          >
            <BriefEntitiesList brief={brief} />
          </DossierCard>
        ) : null}
        {brief && brief.prices.length > 0 ? (
          <DossierCard
            testId="knowledge-card-tjm"
            eyebrow={t('cards.tjmEyebrow')}
            title={t('cards.tjmTitle')}
            footer={<CardLink label={t('cards.tjmCta')} onClick={() => onTabChange('veille')} />}
          >
            <BriefPricesByChannel brief={brief} />
            <Text size="xs" className="mt-3 block text-[var(--bellum-text-muted)]">
              {tBrief('prices.hint')}
            </Text>
          </DossierCard>
        ) : null}
        {brief ? (
          <DossierCard
            wide
            testId="knowledge-card-ecosystem"
            eyebrow={t('cards.ecosystemEyebrow')}
            title={t('cards.ecosystemTitle')}
            footer={<CardLink label={t('cards.ecosystemCta')} onClick={() => onTabChange('partners')} />}
          >
            <PresentEsnList
              accountId={account.id}
              esn={brief.esn}
              generatedAt={brief.generated_at}
              showMoreT={tBrief}
              meaning={shown?.esnMeaning ?? null}
              exEsnProfilesNote={mentionsExEsnProfiles(brief.what_i_know)}
            />
          </DossierCard>
        ) : null}
      </DossierGrid>

      {/* #4323.3 — sans brief, la liste UNIQUE des ESN présentes se monte quand même : elle fusionne le contexte
          canonique et l'historique observé, sans le brief. Vide, elle ne rend rien (`empty:hidden`). */}
      {brief ? null : (
        <div data-testid="knowledge-present-esn-nobrief" className="min-w-0 empty:hidden">
          <PresentEsnList accountId={account.id} esn={[]} generatedAt={null} showMoreT={tBrief} />
        </div>
      )}

      {/* Hors maquette, gardé (Louis tranche) : ciblage fourni, comptes liés, entités du groupe, doublon probable.
          Chacun ne rend rien tant qu'il n'a rien à dire. #4508 (décision Louis 24/10) — le parcours compact
          (`ChainProgressBlock`) en est retiré, revient sur #3381 : les parcours vivent dans Pilotage › Pipe. */}
      <div data-testid="knowledge-context" className="flex min-w-0 flex-col gap-3">
        <AccountSellerTargeting accountId={account.id} />
        <div className="flex flex-wrap items-start gap-2">
          <LinkedAccountsCard accountId={account.id} />
          <GroupEntitiesCard accountId={account.id} />
          <DuplicateCandidatesCard kind="account" id={account.id} />
        </div>
      </div>

      {/* 5 — `.x-more` : « Pour aller plus loin », replié. */}
      <div id={KNOWLEDGE_MORE_ANCHOR} className="scroll-mt-4">
        <DossierMore testId="knowledge-more" eyebrow={t('moreEyebrow')} lead={t('moreLead')}>
          {brief ? (
            <DossierAccordion testId="knowledge-more-brief" title={t('moreBrief')}>
              <TabCommercialBrief
                brief={brief}
                accountId={account.id}
                economicDeciders={economicDeciders}
                omit={['header', 'knowledge', 'entities', 'prices', 'esn']}
                onOpenProcurement={() => onTabChange('access')}
              />
            </DossierAccordion>
          ) : null}
          {/* Kineis / FNAC (recette prod 31/10) — une filiale ou une entité ambiguë : la lecture est OUVERTE d'office, l'avertissement
              « Filiale de X » (EntityResolutionPanel) se lit sans geste. */}
          <DossierAccordion
            testId="knowledge-more-reading"
            title={t('moreReading')}
            defaultOpen={!brief || overviewHasEntityNotice(account.raw_analysis)}
          >
            <TabOverview
              account={account}
              contacts={contacts}
              onTabChange={onTabChange}
              refreshLifted={Boolean(brief)}
            />
          </DossierAccordion>
          <DossierAccordion testId="knowledge-more-evaluation" title={t('moreEvaluation')}>
            <TabEvaluation account={account} />
          </DossierAccordion>
        </DossierMore>
      </div>
    </div>
  )
}

function CardLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" icon={ArrowRight} iconPosition="right" onClick={onClick}>
      {label}
    </Button>
  )
}
