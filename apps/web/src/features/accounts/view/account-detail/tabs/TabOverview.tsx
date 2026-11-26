import type { Account, AnalysisApolloOrgEnrichment, AttackAngle, Contact, PainPoint } from '@bellum/contracts'
import { readEntityResolution } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ArrowRight, Banknote, BookOpen } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'
import { RoleBadge } from '@/components/contacts/RoleBadge'
import { useRecordHistory } from '@/features/crm-core/hooks/useRecordEdit'
import { useHiringDomainProfile } from '@/features/discover/hooks/useHiringDomainProfile'
import { CrmProvenanceSummary } from '@/features/crm/view/CrmProvenance'
import { stagger } from '../motion'
import { latestFieldAudit } from './synthesis/accountHeadcount'
import { AccountChangesCard } from './sections/AccountChangesCard'
import { VerdictUnchangedLine } from './sections/VerdictUnchangedLine'
import { AccountKnownMovementsCard } from './sections/AccountKnownMovementsCard'
import { ConsultantsKnowSectorCard } from './sections/ConsultantsKnowSectorCard'
import { AccountHistoryFactsSection } from './veille/AccountHistoryFactsSection'
import { useAccountFactsBrief } from '@/features/account-facts/useAccountFactsBrief'
import { AccountMarketMemoryCard } from './sections/AccountMarketMemoryCard'
import { AccountTechStructureSection } from './sections/AccountTechStructureSection'
import { AccountRecordCard } from './sections/AccountRecordCard'
import { AccountRunsContainer } from './sections/AccountRunsContainer'
import { AccountVocabularySection } from './sections/AccountVocabularySection'
import { useAccountFieldConflicts } from '../../../hooks/useAccountFieldConflicts'
import { AccountProvenancePanel } from './sections/AccountProvenancePanel'
import { buildAccountProvenance } from './sections/accountProvenance'
import type { AccountProvenance } from './sections/accountProvenance'
import type { TabId } from '../components/AccountDetailTabsBar'
import { EntityResolutionPanel } from '../components/EntityResolutionPanel'
import { ImportedExtraCard } from '@/features/universal-import/view/ImportedExtraCard'
import { AccountAttachedDocumentsCard } from './sections/AccountAttachedDocumentsCard'
import { RefreshOutcomeCard } from '../components/RefreshOutcomeCard'
import { KnownAccountValueCard } from '../components/KnownAccountValueCard'
import { SegmentStaleCollectionNotice } from '../components/SegmentStaleCollectionNotice'
import { ApolloFirmographicsCard } from './sections/ApolloFirmographicsCard'
import { BattlecardCard } from './sections/BattlecardCard'
import { NextReanalysisLine } from '../components/NextReanalysisLine'
import { CompanyPublicDataSection } from './sections/CompanyPublicDataSection'
import { mergeLegalNotices } from './sections/legalNotices'
import { useAccountRegistryAnnouncements } from '../../../hooks/useAccountRegistryAnnouncements'
import { MeetingPrepBrief } from '@/features/google/components/MeetingPrepBrief'
import { BellumReadCard } from './sections/BellumReadCard'
import { DossierAccessPathCard, DossierScopeCard, DossierWorthCard, MainRiskCard } from './sections/DossierReadBlocks'
import { OffersAndPositioningSection } from './sections/OffersAndPositioningSection'
import { OpeningStrategyCard } from './sections/OpeningStrategyCard'
import { EsnAndPositioning } from './sections/EsnAndPositioning'
import { KeyNotesCard } from './sections/KeyNotesCard'
import { WhyNowSection } from './sections/WhyNowSection'
import { readOverviewNeeds, readOverviewSignals } from './overviewNeeds'
import { mergeTechStack } from './sections/publicDataViewData'
import { useAccountOverviewData } from './useAccountOverviewData'
import { AccountCanonicalContextSection } from './sections/AccountCanonicalContextSection'
import { AccountInterestPenetrabilitySection } from './sections/AccountInterestPenetrabilitySection'
import { AccountVariationSignalsSection } from './sections/AccountVariationSignalsSection'
import { AccountOfferLensBanner } from './AccountOfferLensBanner'
import { NeedProposalsPanel } from '@/features/projects/open-needs/view/NeedProposalsPanel'
import { contactOriginSearch } from '@/features/contacts/lib/contactOrigin'
import { countRelevantContacts } from '@/features/contacts/lib/contactFunnel'
import { useAccountRelaunch } from '../../../hooks/useAccountRelaunch'
import { lastAnalyzedDate } from '../../../model/lastAnalyzed'
import {
  buildTechPills,
  countPlanActions,
  visibleSynthesisSections,
  type SynthesisSectionId,
} from './synthesis/accountSynthesis'
import { dedupeRecentSignals, foldSameTitleOffers } from '@/lib/signal-dedupe'
import { stripRegistryJargon, stripRegistryJargonDeep } from '@/lib/strip-registry-jargon'
import { AccountCrmSaysCard } from '../components/AccountCrmSays'

type TabOverviewProps = {
  account: Account
  contacts: Contact[]
  onTabChange: (tab: TabId) => void
  /** #2164.29…39 — l'écran « Ce que je sais » monte déjà le diff d'actualisation et la prochaine action : on ne les redit pas. */
  refreshLifted?: boolean
}

/**
 * recette 10/09 — « Sources et confiance » annonçait « Dossier pas encore
 * analysé » sur un compte Terminé, analysé le 13 juillet 2026. Cause : cette
 * fonction lisait `account.last_analyzed_at` BRUT, alors que ce champ est
 * `null` sur tout dossier analysé AVANT le suivi des runs (legacy) — c'est
 * exactement le cas que `lastAnalyzedDate()` existe pour couvrir. Exportée pour
 * être testée sans monter tout l'onglet.
 */
export function buildOverviewProvenance(
  account: Account,
  overview: ReturnType<typeof useAccountOverviewData>,
): AccountProvenance {
  return buildAccountProvenance({
    lastAnalyzedAt: lastAnalyzedDate(account),
    reliability: overview.dossierReliability,
    tier: overview.confidenceTier,
    analysis: overview,
    apolloEnrichment: (account.apollo_enrichment as Record<string, unknown> | null) ?? null,
  })
}

/**
 * Les compteurs qui viennent du DOSSIER — offres, entités (filiales), signaux.
 *
 * #2091 — `undefined` tant que le calcul qui produit la liste n'a jamais
 * tourné ; un VRAI zéro (le calcul a tourné et n'a rien trouvé) reste un vrai
 * zéro. #3499 — ils nourrissent désormais le résumé d'une ligne des en-têtes
 * repliés (une section sans contenu n'a pas d'en-tête du tout).
 */
export function buildOverviewStatsCounts(
  account: Account,
  overview: Pick<ReturnType<typeof useAccountOverviewData>, 'plan' | 'offers_to_propose' | 'recent_signals'>,
): { offersCount: number | undefined; subsidiariesCount: number | undefined; signalsCount: number | undefined } {
  const offers = overview.plan?.offers_to_propose ?? overview.offers_to_propose
  return {
    offersCount: offers?.length,
    subsidiariesCount: account.subsidiaries?.length,
    // #4142 — le même repli que la liste rendue : la pastille ne compte pas un fait deux fois.
    signalsCount: overview.recent_signals
      ? dedupeRecentSignals(foldSameTitleOffers(overview.recent_signals)).length
      : undefined,
  }
}

/** Les trois questions auxquelles la synthèse répond, dans l'ordre (#3499). */
const SYNTHESIS_GROUPS: { key: 'business' | 'memory' | 'searched'; ids: readonly SynthesisSectionId[] }[] = [
  { key: 'business', ids: ['strategy', 'plan', 'contacts', 'angles', 'meeting'] },
  { key: 'memory', ids: ['technologies', 'sources'] },
  { key: 'searched', ids: ['history'] },
]

/** Contacts listés dans l'aperçu replié — le reste vit dans l'onglet Contacts. */
const CONTACTS_PREVIEW = 5

/**
 * #3499 — LA SYNTHÈSE D'UN COMPTE, EN UN SCROLL.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE RETOUR (Louis + Théo, 01/10/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * « la première page c'est devenu un bordel sans nom », « la majorité des
 * éléments sont vides, inconnus, non renseignés », « on comprend rien en
 * première impression ». Mesure faite sur le code : une vingtaine de cartes
 * empilées par les lots successifs (#2115, #2118, #3088, #3254, #3258,
 * #3261…), dont TROIS lectures du verdict (en-tête de décision, lecture
 * Bellum, bandeau du dossier), DEUX « prochaine action », DEUX « porte
 * d'entrée », une colonne de droite de dix cartes et des comptes « du même
 * secteur » sans rapport.
 *
 * Et Louis : « Bellum doit dire : voici où est le business, voici ce que je
 * sais du compte, voici ce qu'on a cherché ensemble ». C'est l'ossature :
 *
 *  1. OÙ EST LE BUSINESS — au-dessus de la ligne de flottaison, rendu au
 *     niveau du dossier (`AccountDetail`) : « Ce qu'il faut retenir » puis
 *     trois cartes au plus (`AccountSynthesisCards`). Ici : Plan d'action,
 *     Contacts, Angles d'attaque, Préparer le rendez-vous.
 *  2. CE QUE BELLUM SAIT DU COMPTE — Stratégie, Technologies et chiffres
 *     clés, Sources et confiance (le SCORE et ses axes vivent ICI : sous un
 *     score, les axes non évaluables restent nommés — doctrine).
 *  3. CE QU'ON A CHERCHÉ ENSEMBLE — l'historique des analyses.
 *
 * (#2115.22 — `ItProgramsCard` vit dans la section « Périmètres » via
 * `TabPrograms`, et `RelationshipMemoryCard` dans « Historique & preuves » :
 * ni l'une ni l'autre n'est rendue ici, GA-334.)
 *
 * Toutes les sections sont REPLIÉES par défaut (`CollapsedSection`, le même
 * repli que le tableau de bord — GA-26), avec un résumé d'une ligne. Une
 * section SANS contenu réel n'est pas rendue (`visibleSynthesisSections`) :
 * ni « non renseigné », ni « 0 », ni état vide.
 *
 * Retirés de la synthèse : l'en-tête de décision (doublon du verdict), les
 * compteurs (doublon des résumés), le panneau Laura (le bouton « Demander à
 * Laura » de l'en-tête suffit), les comptes « du même secteur » (décision 4 :
 * BPCE → LCL, Compass, Elior… rien à voir).
 */
export function TabOverview({ account, contacts, onTabChange, refreshLifted = false }: TabOverviewProps) {
  const { t, i18n } = useTranslation('accountDetail')
  const overview = useAccountOverviewData(account)
  // #4396.1 — le profil de l'espace : « Offres d'emploi IT » ne montre que les offres de son métier.
  const hiringProfile = useHiringDomainProfile()

  const pains = stripRegistryJargonDeep((overview.pains ?? []) as PainPoint[])
  // #3673 — enjeux et expertises lus là où ils vivent (blob, colonne du compte, domaines
  // d'opportunité importés) : voir `overviewNeeds.ts`.
  const needs = readOverviewNeeds(account, overview)
  // #4994 — les textes de données (enjeux, signaux, offres, stratégie) passent par le filtre de jargon de registre.
  const itChallenges = stripRegistryJargonDeep(needs.challenges)
  const itImplications = stripRegistryJargonDeep(needs.implications)
  // #3928.1 — recette R7a (prod 429335a9c8), SNCF RESEAU : lu sur les deux sources
  // (blob + colonne), comme le lecteur unique des autres écrans. Voir `readOverviewSignals`.
  const signals = stripRegistryJargonDeep(readOverviewSignals(account, overview))
  const angles = ((overview.angles ?? []) as AttackAngle[]).filter(angle => angle.title || angle.description)
  const offers = stripRegistryJargonDeep(overview.plan?.offers_to_propose ?? overview.offers_to_propose ?? [])
  const competitiveStrategy = stripRegistryJargonDeep(overview.plan?.competitive_strategy)
  const statsCounts = buildOverviewStatsCounts(account, overview)
  const provenance = useMemo<AccountProvenance>(() => buildOverviewProvenance(account, overview), [account, overview])
  const dossierRead = overview.dossierRead
  const entityResolution = useMemo(() => readEntityResolution(account.raw_analysis), [account.raw_analysis])
  const { data: fieldConflicts } = useAccountFieldConflicts(account.id)
  // #3917.9 — la dernière écriture de l'effectif (source + date) : une correction humaine gagne sur toute estimation.
  const { data: recordHistory } = useRecordHistory('account', account.id, true)
  const employeesAudit = useMemo(() => latestFieldAudit(recordHistory, 'employees'), [recordHistory])
  const apolloEnrichment = (account.apollo_enrichment as AnalysisApolloOrgEnrichment | null) ?? undefined
  const lastAnalyzed = lastAnalyzedDate(account)

  const planActions = countPlanActions(overview)
  const techStack = mergeTechStack(
    overview.detected_tech_stack,
    apolloEnrichment?.technologies,
    overview.technology_stack,
  )
  const techCount = techStack.length
  // #3916 — recette R25 : les annonces légales vivent dans cette section ; sans elles dans son
  // contenu, un compte qui n'a QUE des annonces n'avait aucune section et la carte restait invisible.
  const registryAnnouncements = useAccountRegistryAnnouncements(account.id).data ?? null
  // #4284.18 — même lecture que le bloc « Historique » (clé de cache commune, aucun appel de plus) : l'en-tête replié
  // compte les faits datés, anciens compris, pour que la fiche se VÉRIFIE sans dépliage.
  const factsBrief = useAccountFactsBrief(account.id)
  const datedFactCount = factsBrief
    ? factsBrief.deals.length +
      factsBrief.missions.length +
      factsBrief.recurringNeeds.length +
      factsBrief.exchanges.length
    : 0
  const legalCount = mergeLegalNotices(
    overview.legal_signals,
    registryAnnouncements?.announcements,
    overview.recent_signals,
  ).length
  // #3499 — les pastilles de « Stack technique » ne se répètent pas dans « Technologies en place ».
  const techPillNames = buildTechPills(techStack).map(pill => pill.name)
  const hasStrategy =
    Boolean(competitiveStrategy?.positioning_statement || competitiveStrategy?.vs_competitors?.length) ||
    Boolean(dossierRead) ||
    (overview.structural_reading_axes?.length ?? 0) > 0
  const sections = visibleSynthesisSections({
    planActions,
    offers: statsCounts.offersCount ?? 0,
    risk: Boolean(overview.mainRisk) || Boolean(dossierRead?.accessPath),
    contacts: contacts.length,
    angles: angles.length,
    meetingMaterial: pains.length + itChallenges.length + signals.length,
    // #3293 — les cartes stratégiques (5P, Colonnes du compte) se lisent sur les contacts, via leur
    // propre requête : sans cette clause, un compte sans lecture rédigée perdait la section entière.
    // #3674.5 — jamais analysé : pas de section 5P (elle serait vide), la carte « Analyser ce compte » la remplace.
    strategyMaterial: lastAnalyzed !== null && (hasStrategy || contacts.length > 0) ? 1 : 0,
    technologyMaterial:
      techCount +
      legalCount +
      (overview.financials_history?.length ?? 0) +
      (overview.financial_indicators?.length ?? 0),
    sourcesMaterial:
      provenance.sources.length +
      (account.priority_score !== null ? 1 : 0) +
      (dossierRead ? 1 : 0) +
      // #3231 (recette 10/10) — une direction interne déclarée porte ses 4 rôles dans la fiche : la section existe.
      (account.declared_internal_client_mode === 'internal_service' ? 1 : 0),
    analysed: lastAnalyzed !== null,
  })

  const planSummary = [
    planActions > 0 ? t('synthesis.sections.planSummary', { count: planActions }) : null,
    offers.length > 0 ? t('synthesis.sections.planOffers', { count: offers.length }) : null,
    planActions === 0 && offers.length === 0 ? t('synthesis.sections.planRisk') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // #4099 — « contacts clés » = contacts PERTINENTS, jamais tous les contacts du compte ; aucun pertinent = pas de résumé.
  const relevantContacts = countRelevantContacts(contacts)

  const render: Record<SynthesisSectionId, () => ReactNode> = {
    plan: () => (
      <CollapsedSection key="plan" title={t('synthesis.sections.plan')} description={planSummary}>
        <div className="space-y-4">
          <NeedProposalsPanel accountId={account.id} />
          <MainRiskCard risk={stripRegistryJargonDeep(overview.mainRisk)} />
          <OpeningStrategyCard accountId={account.id} />
          <DossierAccessPathCard accessPath={stripRegistryJargonDeep(dossierRead?.accessPath ?? null)} />
          <OffersAndPositioningSection offers={offers} />
          <OpenTabButton label={t('synthesis.sections.planOpen')} onClick={() => onTabChange('plan')} />
        </div>
      </CollapsedSection>
    ),
    contacts: () => (
      <CollapsedSection
        key="contacts"
        title={t('synthesis.sections.contacts')}
        description={
          relevantContacts === null ? undefined : t('synthesis.sections.contactsSummary', { count: relevantContacts })
        }
      >
        <div className="space-y-3">
          <ul className="divide-y divide-[var(--bellum-border)]">
            {contacts.slice(0, CONTACTS_PREVIEW).map(contact => (
              <li key={contact.id}>
                {/* #3594 — chaque contact ouvre SA fiche (toute la ligne est la cible). */}
                <Link
                  to="/contacts/$id"
                  params={{ id: contact.id }}
                  // #3674.3 — le retour depuis la fiche ramène à la stratégie, pas à Contacts.
                  search={contactOriginSearch({ kind: 'account', accountId: account.id, tab: 'overview' })}
                  className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-[var(--bellum-surface-2)]"
                >
                  <Text size="sm" weight="medium" className="min-w-0 break-words text-[var(--bellum-text-primary)]">
                    {contact.full_name}
                  </Text>
                  {contact.title ? (
                    <Text size="sm" className="min-w-0 flex-1 truncate text-[var(--bellum-text-secondary)]">
                      {contact.title}
                    </Text>
                  ) : null}
                  {contact.decision_role ? <RoleBadge role={contact.decision_role} /> : null}
                </Link>
              </li>
            ))}
          </ul>
          <OpenTabButton label={t('synthesis.sections.contactsOpen')} onClick={() => onTabChange('contacts')} />
        </div>
      </CollapsedSection>
    ),
    angles: () => (
      <CollapsedSection
        key="angles"
        title={t('synthesis.sections.angles')}
        description={t('synthesis.sections.anglesSummary', { count: angles.length })}
      >
        <ul className="space-y-3">
          {angles.map((angle, index) => (
            <li key={`${angle.title ?? 'angle'}-${index}`} className="min-w-0">
              {angle.title ? (
                <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                  {angle.title}
                </Text>
              ) : null}
              {stripRegistryJargon(angle.description || angle.strategy || '') ? (
                <Text element="p" size="sm" className="line-clamp-3 break-words text-[var(--bellum-text-secondary)]">
                  {stripRegistryJargon(angle.description || angle.strategy || '')}
                </Text>
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsedSection>
    ),
    meeting: () => (
      <CollapsedSection
        key="meeting"
        persistKey="account-overview.meeting"
        // #3673.10 (recette prod 09/10) — un compte ANALYSÉ ouvre ce repli à
        // l'arrivée (la recette l'exige) ; un compte jamais analysé le garde
        // replié, même règle que `strategy` (#3674.5) juste au-dessus.
        defaultOpen={lastAnalyzed !== null}
        title={t('synthesis.sections.meeting')}
        description={t('synthesis.sections.meetingSummary')}
      >
        <div className="space-y-4">
          <MeetingPrepBrief account={account} angles={angles} />
          <WhyNowSection
            pains={pains}
            challenges={itChallenges}
            implications={itImplications}
            signals={signals}
            signalCoverage={overview.signal_coverage}
          />
          <BattlecardCard account={account} />
        </div>
      </CollapsedSection>
    ),
    strategy: () => (
      <CollapsedSection
        key="strategy"
        // #4965.3 — plié/déplié mémorisé aussi pour l'entrée commerciale.
        persistKey="account-overview.strategy"
        defaultOpen
        title={t('synthesis.sections.strategy')}
        description={t('synthesis.sections.strategySummary')}
      >
        <div className="space-y-4">
          <AccountOfferLensBanner />
          {/* #3777 — « Cinq questions de terrain » vit désormais sur l'onglet Plan (GA-26). */}
          <AccountInterestPenetrabilitySection accountId={account.id} />
          {/* #3920.10 — les quatre signaux de variation, datés ; inconnu = « non mesuré ». */}
          <AccountVariationSignalsSection accountId={account.id} />
          <DossierScopeCard scope={dossierRead?.recommendedScope ?? null} />
          {/* #4078 — les cinq blocs du dossier (axes, écosystème, domaines, indicateurs, garde-fous)
              ne sortent d'une vraie analyse que depuis leur capacité : un compte analysé avant le DIT.
              Sans date du segment, la date de l'analyse fait foi ; jamais analysé, aucune ligne. */}
          <SegmentStaleCollectionNotice
            dimension="dossier_blocks"
            collectedAt={account.dossier_blocks_collected_at ?? account.last_analyzed_at ?? null}
            hideWhenUndated
          />
          <KeyNotesCard
            title={t('structuralReading.title')}
            icon={<BookOpen className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}
            notes={stripRegistryJargonDeep(overview.structural_reading_axes)}
          />
          {/* K.2 / #4323 (+ #4323.3 sans brief aussi) — les ESN présentes vivent dans UNE seule liste, sous « Ce que je sais » :
              ni « Qui est déjà en place » ni « Sociétés de services observées » ne la redisent ici (GA-26). */}
          <EsnAndPositioning strategy={competitiveStrategy} />
          <AccountCanonicalContextSection
            accountId={account.id}
            onTabChange={onTabChange}
            excludeTechnologies={techPillNames}
            contacts={contacts}
          />
          <AccountVocabularySection
            accountId={account.id}
            verifiedContactCount={contacts.filter(contact => contact.email_verified === true).length}
          />
        </div>
      </CollapsedSection>
    ),
    technologies: () => (
      <CollapsedSection
        key="technologies"
        // #4965.3 — section secondaire : plié/déplié mémorisé (revient sur #4399, arbitrage Louis 31/10).
        persistKey="account-overview.technologies"
        // #3916.r40 — recette EDF : « 88 annonces légales » n'était qu'un compteur dans un repli fermé.
        // Des annonces à lire ouvrent la section ; la liste, elle, se replie au-delà de 8 (« Voir plus (k) »).
        // #4965.1 (recette 01/11) — section secondaire : REPLIÉE à l'arrivée même avec des annonces ; le compteur
        // reste dans l'en-tête (« 2 annonces légales ») et l'état ouvert est mémorisé par utilisateur.
        defaultOpen={false}
        title={t('synthesis.sections.technologies')}
        description={
          [
            techCount > 0 ? t('synthesis.sections.technologiesSummary', { count: techCount }) : null,
            legalCount > 0 ? t('synthesis.sections.technologiesLegal', { count: legalCount }) : null,
          ]
            .filter(Boolean)
            .join(' · ') || t('synthesis.sections.technologiesFacts')
        }
      >
        <div className="space-y-4">
          <CompanyPublicDataSection
            analysis={overview}
            apolloEnrichment={apolloEnrichment}
            accountId={account.id}
            signalsCollectedAt={account.signals_collected_at}
            groupRevenue={account.revenue}
            hiringProfile={hiringProfile}
          />
          <KeyNotesCard
            title={t('financialIndicators.title')}
            icon={<Banknote className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}
            notes={stripRegistryJargonDeep(overview.financial_indicators)}
          />
        </div>
      </CollapsedSection>
    ),
    sources: () => (
      <CollapsedSection
        key="sources"
        // #4965.3 — section secondaire : plié/déplié mémorisé (revient sur #4399, arbitrage Louis 31/10).
        persistKey="account-overview.sources"
        // #3231 (recette 10/10) — « Compléter la fiche » et les 4 rôles étaient au fond de ce repli :
        // une direction interne déclarée l'ouvre à l'arrivée (sinon replié, GA-26).
        // #3231 (décision Louis 10/10) — rôles non déclarés : la fiche est servie D'OFFICE (section ouverte) ;
        // seul un client direct déclaré garde le repli.
        // #4965.1 (recette 01/11, arbitrage Louis 31/10 Q11) — REPLIÉE par défaut ; seule une direction interne
        // déclarée l'ouvre (ses 4 rôles et « Compléter la fiche » sont alors le sujet).
        defaultOpen={account.declared_internal_client_mode === 'internal_service'}
        title={t('synthesis.sections.sources')}
        description={t('synthesis.sections.sourcesSummary')}
      >
        <div className="space-y-4">
          <SegmentStaleCollectionNotice
            dimension="dossier_read"
            collectedAt={account.dossier_read_collected_at ?? null}
            hideWhenUndated
          />
          <BellumReadCard
            data={overview.bellumRead}
            score={account.priority_score}
            storedVerdict={overview.storedVerdict}
            score25={overview.score25}
            dossierReliability={overview.dossierReliability}
            confidenceTier={overview.confidenceTier}
            hasAxisBreakdown={dossierRead !== null}
            hasNoGoTrigger={dossierRead?.noGo?.trigger != null}
            hideNextAction={refreshLifted}
          />
          {dossierRead ? <DossierWorthCard read={dossierRead} /> : null}
          <AccountProvenancePanel provenance={provenance} conflicts={fieldConflicts ?? []} />
          {/* Refonte Théo (23/10) — l'hypothèse d'entité vit dans « Entités & sites », sous les entités (un seul endroit). */}
          <EntityResolutionPanel accountId={account.id} resolution={entityResolution} />
          {apolloEnrichment ? (
            <ApolloFirmographicsCard
              enrichment={apolloEnrichment}
              registry={{
                creationDate: overview.creation_date ?? null,
                financials: overview.financials_history ?? null,
              }}
              hasOwnSummary={Boolean(overview.bellumRead?.description)}
              recordedAddresses={[account.address, account.headquarters]}
              recordedEmployees={account.employees}
              recordedRevenue={account.revenue}
              recordedAudit={employeesAudit}
            />
          ) : null}
          <AccountMarketMemoryCard accountId={account.id} companyName={account.company_name} hideEsnEcosystem />
          <AccountTechStructureSection accountId={account.id} />
          <AccountRecordCard account={account} />
          <ImportedExtraCard extra={account.extra} />
          <AccountAttachedDocumentsCard accountId={account.id} companyName={account.company_name} />
        </div>
      </CollapsedSection>
    ),
    history: () => (
      <CollapsedSection
        key="history"
        // #4965.3 — section secondaire : plié/déplié mémorisé (revient sur #4399, arbitrage Louis 31/10).
        persistKey="account-overview.history"
        title={t('synthesis.sections.history')}
        description={
          [
            datedFactCount > 0 ? t('synthesis.sections.historyFacts', { count: datedFactCount }) : null,
            lastAnalyzed
              ? t('synthesis.sections.historySummary', {
                  date: new Date(lastAnalyzed).toLocaleDateString(i18n.language),
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
      >
        <div className="space-y-4">
          {refreshLifted ? null : <RefreshOutcomeCard account={account} />}
          <AccountKnownMovementsCard accountId={account.id} />
          {/* #4068.6 — les faits historiques datés et typés, lus où le compte se lit (comme la veille et le PDF). */}
          <AccountHistoryFactsSection accountId={account.id} />
          {refreshLifted ? null : <AccountChangesCard accountId={account.id} />}
          <AccountRunsContainer accountId={account.id} hasCompletedAnalysis={lastAnalyzed !== null} />
        </div>
      </CollapsedSection>
    ),
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      data-testid="account-synthesis-sections"
      className="flex min-h-0 flex-col gap-3"
    >
      {lastAnalyzed === null ? <UnanalyzedAccountCard account={account} contactsCount={contacts.length} /> : null}
      {/* #4459.2 — compte venu du CRM : « N dans ton CRM · M trouvés par l'analyse » (une part absente ⇒ pas écrite). */}
      <CrmProvenanceSummary />
      {/* #4604 — « Ce que dit ton CRM » : propriétaire, étape, affaires, activités, fusion #4603 (rien ⇒ rien). */}
      <AccountCrmSaysCard />
      {/* #2556 — compte déjà connu du CRM : ce que BellumAI y ajoute (rien ⇒ rien). */}
      <KnownAccountValueCard account={account} contacts={contacts} />
      {/* #5017.2 — consultants de l'espace dont le CV cite le secteur du compte (aucun ⇒ rien). */}
      <ConsultantsKnowSectorCard sector={account.sector} />
      {/* #4180 (R41) — « Même verdict depuis le … » À L'OUVERTURE, plus au fond du repli « Historique ». */}
      {lastAnalyzed !== null ? <VerdictUnchangedLine accountId={account.id} /> : null}
      {/* #4283.8 / recette 21/10 K4 — la prochaine ré-analyse d'un compte SUIVI (ou pourquoi il n'y en a pas) ; non suivi ⇒ rien. */}
      {/* #4283.8 (23/10) — la DATE vit dans la fraîcheur du hero (`AccountFreshness`) : ici seule la raison d'absence. */}
      <NextReanalysisLine reason={account.next_reanalysis_reason} />
      {/* Louis (01/10) : « Bellum doit dire : voici où est le business, voici
          ce que je sais du compte, voici ce qu'on a cherché ensemble ». Trois
          groupes, chacun TITRÉ seulement s'il a au moins une section. */}
      {SYNTHESIS_GROUPS.map(group => {
        const ids = sections.filter(id => group.ids.includes(id))
        if (ids.length === 0) return null
        return (
          <div key={group.key} className="flex flex-col gap-3">
            <Text element="h2" size="xs" weight="semibold" className="pt-2 uppercase text-[var(--bellum-text-muted)]">
              {t(`synthesis.groups.${group.key}`)}
            </Text>
            {ids.map(id => render[id]())}
          </div>
        )
      })}
    </motion.div>
  )
}

/**
 * #3674.5 — compte JAMAIS analysé : ce qu'on sait en une ligne et UN geste. Jamais un tableau
 * 5P vide ni « 0 » : un fait absent n'a pas de ligne (le secteur, les contacts n'apparaissent
 * que s'ils existent).
 */
function UnanalyzedAccountCard({ account, contactsCount }: { account: Account; contactsCount: number }) {
  const { t } = useTranslation('accountDetail')
  const { relaunch } = useAccountRelaunch(account)
  const facts = [
    account.sector,
    contactsCount > 0 ? t('synthesis.unanalyzed.contacts', { count: contactsCount }) : null,
  ].filter((fact): fact is string => Boolean(fact))
  return (
    <div
      data-testid="account-unanalyzed"
      className="flex flex-col items-start gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-4"
    >
      <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('synthesis.unanalyzed.title')}
      </Text>
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {facts.length > 0 ? `${t('synthesis.unanalyzed.known', { facts: facts.join(' · ') })} ` : ''}
        {t('synthesis.unanalyzed.body')}
      </Text>
      <Button type="button" size="sm" variant="black" onClick={relaunch}>
        {t('synthesis.unanalyzed.cta')}
      </Button>
    </div>
  )
}

function OpenTabButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      icon={ArrowRight}
      iconPosition="right"
      variant="ghost"
      size="sm"
      className="w-fit px-0"
    >
      {label}
    </Button>
  )
}
