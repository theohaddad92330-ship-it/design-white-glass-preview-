import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, Contact } from '@bellum/contracts'
import { parseAccountAnalysis } from '@bellum/contracts'
import { useNavigate } from '@tanstack/react-router'
import { i18n } from '@/i18n'
import { useCancelAnalysis } from '@/features/accounts/hooks/useCancelAnalysis'
import { useCoverageGaps } from '@/features/accounts/hooks/useCoverageGaps'
import { SearchAnalyzingState } from '@/features/search/components/SearchAnalyzingState'
import { useAnalysisProgress } from '@/hooks/useAnalysisProgress'
import { coverageOffersAction } from './account-detail/tabs/coverage/coverageGrid'
import { evaluationField } from './account-detail/tabs/useAccountOverviewData'
import { readDossierRead } from './account-detail/tabs/evaluation/dossierReadViewData'
import { AccountDetailHero } from './account-detail/components/AccountDetailHero'
import { AccountDetailStatusBanners } from './account-detail/components/AccountDetailStatusBanners'
import { AnalysisEntityQuestionCard } from './account-detail/components/AnalysisEntityQuestionCard'
import { NotificationsProposalBanner } from './account-detail/components/NotificationsProposalBanner'
import { AccountDetailTabContent } from './account-detail/components/AccountDetailTabContent'
import { AccountDetailTabsBar, sectionOfTab, type TabId } from './account-detail/components/AccountDetailTabsBar'
import type { LegacyTabNotice } from './account-detail/accountDetailSearch'
import { parseCommercialBrief } from './account-detail/tabs/brief/parseCommercialBrief'
import { overviewHasEntityNotice } from './account-detail/overviewEntityNotice'

interface AccountDetailProps {
  account: Account
  contacts: Contact[]
  initialTab?: TabId
  /** #3720 — la notice de migration capturée à l'arrivée par l'écran de page (voir `AccountDetailPage`). */
  legacyTabNotice?: LegacyTabNotice | undefined
}

/**
 * #3674.1 — l'onglet d'ARRIVÉE d'un dossier : la STRATÉGIE DE COMPTE, partout.
 *
 * ⚠️ RENVERSEMENT DATÉ du 05/10/2026 de #1817 (Louis, `agent_docs/doctrine.md`).
 * #1817 (09/09/2026, 65,8 % de comptes avec organigramme) ouvrait l'organigramme
 * quand le graphe existait ; le brief « Ce que je sais » (01/10) ouvrait le
 * brief quand il existait. Les deux faisaient d'un clic général sur un nom
 * d'entreprise une entrée par les PERSONNES. Désormais : sans onglet demandé,
 * `overview` — la synthèse dont la section « Stratégie de compte » s'ouvre en
 * premier —, avec ou sans organigramme, avec ou sans brief. L'organigramme et le
 * brief restent à un clic.
 *
 * Un onglet DEMANDÉ explicitement (lien profond, recherche de contacts, retour
 * d'une fiche) gagne toujours : « clic général » ≠ « lien intentionnel vers une
 * sous-partie ». Seul `?tab=brief` sans brief valide retombe sur `overview`
 * (aucun onglet vide), comme avant.
 *
 * ⚠️ RENVERSEMENT DATÉ du 12/10/2026 de #3674.1 (Louis, « la démo comme le produit
 * soit carré ») : quand le compte porte un brief commercial VALIDE
 * (`raw_analysis.commercial_brief` passe le contrat), la fiche s'ouvre sur « Ce que
 * je sais » (`brief`) ; sans brief valide, sur la vue d'ensemble. Le paragraphe
 * ci-dessus est conservé pour être lu, pas effacé.
 *
 * ⚠️ FUSION DATÉE du 19/10/2026 (Louis, lot COMPTE-SAIS K.1) : avec un brief valide, l'onglet
 * `overview` n'est plus listé et `?tab=overview` redirige vers `brief` ; son contenu devient le
 * sous-onglet « Le dossier » de « Ce que je sais ». Le repli sans brief reste la vue d'ensemble.
 *
 * Exportée pour être testée sans monter tout `AccountDetail`.
 */
export function resolveArrivalTab(rawAnalysis: Account['raw_analysis'], requested: TabId | undefined): TabId {
  const hasBrief = parseCommercialBrief(rawAnalysis) !== null
  if (requested === 'brief') return hasBrief ? 'brief' : 'overview'
  // K.1 (Louis 19/10/2026) — « Vue d'ensemble » est FUSIONNÉE dans « Ce que je sais » : avec un brief valide,
  // `?tab=overview` (lien partagé, retour d'une fiche, notification) ouvre « Ce que je sais » — aucun lien
  // orphelin. Sans brief valide, la vue d'ensemble reste l'arrivée de repli.
  // Kineis / FNAC (recette prod 31/10) — SAUF si l'aperçu porte ce que le brief n'a pas (filiale, entité ambiguë) :
  // un `?tab=overview` explicite y reste, sinon l'avertissement « Filiale de X » est injoignable.
  if (requested === 'overview' && hasBrief && !overviewHasEntityNotice(rawAnalysis)) return 'brief'
  return requested ?? (hasBrief ? 'brief' : 'overview')
}

/**
 * #2164.16 — LAISSER CONSULTER LE DOSSIER PENDANT QU'UNE ANALYSE TOURNE.
 *
 * `status === 'analyzing'` bloquait TOUJOURS l'écran derrière `SearchAnalyzingState`
 * (plein écran), y compris pour une actualisation sur un compte qui porte déjà
 * un dossier lisible — l'utilisateur perdait alors de vue le dossier EXISTANT
 * pendant les 3-6 minutes du run, sans pouvoir le consulter. `AnalysisProgressCard`
 * porte depuis longtemps un variant `embed` prévu pour exactement ce cas
 * (« Compact variant when embedded inside AccountDetail ») ; rien ne l'appelait
 * en production (seul son propre test le montait).
 *
 * Même dérivation que la lecture Synthèse (`readDossierRead` + `evaluationField`,
 * GA-26) : un dossier « lisible » est celui que l'onglet Synthèse afficherait
 * déjà s'il n'y avait pas de run en cours. Un compte JAMAIS analysé (aucune
 * lecture structurée) garde le plein écran — il n'y a rien à montrer derrière.
 */
export function hasReadableDossierWhileAnalyzing(rawAnalysis: Account['raw_analysis']): boolean {
  // `evaluationField` suppose un objet (elle lit `a['plan']` sans garde) — un
  // compte jamais analysé porte `raw_analysis: null`, le cas le plus courant
  // de cette fonction ; on le tranche ICI plutôt que d'ajouter une garde à une
  // dérivation partagée par d'autres appelants qui ne l'ont jamais eu besoin.
  if (!rawAnalysis) return false
  return readDossierRead(evaluationField(parseAccountAnalysis(rawAnalysis), 'dossier_read')) !== null
}

export function AccountDetail({ account, contacts, initialTab, legacyTabNotice }: AccountDetailProps) {
  const navigate = useNavigate()
  const resolvedInitialTab = useMemo(
    () => resolveArrivalTab(account.raw_analysis, initialTab),
    [account.raw_analysis, initialTab],
  )
  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab)
  // K.1 — le sous-onglet de « Ce que je sais » : le brief, ou le dossier (l'ancienne vue d'ensemble).
  const hasBrief = parseCommercialBrief(account.raw_analysis) !== null
  const progress = useAnalysisProgress(account.id, account.status)
  const cancel = useCancelAnalysis()
  // §33 : l'onglet Couverture ne s'affiche que s'il propose une action. Même clé
  // de requête que l'onglet lui-même — la réponse est en cache, aucun appel de plus.
  const coverage = useCoverageGaps(account.id)
  const hiddenTabs: TabId[] = coverageOffersAction(coverage.data) ? [] : ['coverage']
  // Pas de brief valide → pas d'onglet « Ce que je sais » (on n'affiche pas ce qu'on n'a pas).
  if (!hasBrief) hiddenTabs.push('brief')
  // K.1 — avec un brief valide, « Vue d'ensemble » n'est plus listée : son contenu est le sous-onglet « Le dossier ».
  else if (!overviewHasEntityNotice(account.raw_analysis)) hiddenTabs.push('overview')

  // #2479 — CET EFFET NE SE REJOUE QU'À L'ARRIVÉE SUR UN COMPTE, JAMAIS À
  // CHAQUE RELECTURE DE L'URL.
  //
  // ⚠️ Mesuré en production (SHA 63d34e295) : la sélection ne suivait plus le
  // clic sur les sous-sections du dossier (Signaux → Opportunités). Avant ce
  // garde-fou, ses dépendances incluaient `resolvedInitialTab` ET `navigate` —
  // et `resolvedInitialTab` recalcule à CHAQUE fois que `?tab=` change dans
  // l'URL, y compris en écho de la navigation que `handleTabChange` vient
  // lui-même de poser. Un aller-retour entre la navigation de CANONICALISATION
  // (posée ici, avec l'onglet d'ARRIVÉE) et la navigation du CLIC (posée par
  // `handleTabChange`, avec le nouvel onglet) peut se conclure dans le
  // mauvais ordre : si la canonicalisation « gagne » après coup, cet effet se
  // redéclenche et rappelle `setActiveTab(resolvedInitialTab)` — avec
  // l'ANCIEN onglet, celui de l'arrivée, pas celui du clic. Deux écrivains
  // pour un seul réglage (GA-26) : l'arrivée fixe l'onglet UNE FOIS par
  // compte, `handleTabChange` le fixe pour tout le reste — ils ne doivent
  // jamais se redisputer la même valeur. Le test qui prouve le rouge exact
  // est `AccountDetail.tabRace.test.tsx`.
  const syncedAccountId = useRef<string | null>(null)
  useEffect(() => {
    if (syncedAccountId.current === account.id) return
    syncedAccountId.current = account.id
    setActiveTab(resolvedInitialTab)
    void navigate({
      to: '/accounts/$id',
      params: { id: account.id },
      // #2120.77 — la réécriture canonique ne touche QUE l'onglet : un lien
      // partagé avec ses filtres (`?tab=contacts&role=…`) les garde.
      // #2128.53 — on FUSIONNE avec la recherche courante : remplacer l'objet
      // entier effaçait la requête du dossier (`find`) et l'objet ouvert
      // (`item`) à chaque arrivée, donc un retour navigateur ne restaurait rien.
      search: prev => ({ ...prev, tab: resolvedInitialTab }),
      replace: true,
    })
  }, [account.id, resolvedInitialTab, navigate])

  const handleTabChange = useCallback(
    (requested: TabId, item?: string) => {
      // K.1 — un appelant interne qui vise encore `overview` (retour d'une fiche, « Retour au résumé »)
      // atterrit sur « Ce que je sais » quand un brief existe : jamais l'onglet fusionné.
      const tab =
        requested === 'overview' && hasBrief && !overviewHasEntityNotice(account.raw_analysis) ? 'brief' : requested
      setActiveTab(tab)
      // #2120.77 — `prev` et non `{ tab }` : écraser la recherche effaçait les
      // filtres de l'onglet Contacts à chaque changement de section.
      // #2128.50 — `item` désigne l'objet ouvert depuis la recherche ; un
      // changement de section ordinaire le retire, la requête (`find`) reste.
      void navigate({ to: '/accounts/$id', params: { id: account.id }, search: prev => ({ ...prev, tab, item }) })
    },
    [account.id, account.raw_analysis, navigate, hasBrief],
  )

  // #2164.16 — plein écran SEULEMENT quand il n'y a rien à montrer derrière.
  // Une actualisation sur un dossier déjà lisible tombe dans le rendu normal
  // ci-dessous, où `AccountDetailStatusBanners` embarque la même carte de
  // progression en variant compact.
  if (account.status === 'analyzing' && !hasReadableDossierWhileAnalyzing(account.raw_analysis)) {
    return (
      // #1846 — DOUBLE gouttière : `AccountDetailPage` (hors de ce fichier)
      // rend `AccountDetail` DANS le contenu par défaut de `CustomerPage`, qui
      // porte déjà `CONTENT_PADDING` (`page-gutter.ts`). Ce conteneur ajoutait
      // sa PROPRE échelle par-dessus — trois paliers (`px-4`/`sm:px-8`/`lg:px-16`)
      // qu'aucun autre écran ne porte — pour un résultat qui ne correspondait
      // ni à l'un ni à l'autre. Le centrage (`mx-auto max-w-5xl`) suffit ; la
      // gouttière vient du parent, comme partout ailleurs.
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        {/* #2164.17 — l'analyse en pause sur des homonymes pose sa question ICI. */}
        <AnalysisEntityQuestionCard accountId={account.id} />
        <SearchAnalyzingState
          companyName={account.company_name || ''}
          phase={progress.phase || i18n.t('analysis:progressCard.inProgress')}
          accountId={account.id}
          onCancel={() => {
            if (cancel.isPending) return
            cancel.mutate(account.id)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col mx-auto max-w-[1480px] w-full">
      {/* #4507 (refonte V22, décision Louis 24/10) — l'en-tête au dessin de la maquette : barre, identité,
          « Dossier consultable · Périmètre & données ». Revient sur le bandeau `.x-collab` de la refonte Théo
          (23/10, f9ad64334c / f3457b41cd) et sur #4158.24/.25 : propriétaire et équipe passent dans « … ». */}
      <AccountDetailHero account={account} contacts={contacts} onTabChange={handleTabChange} />
      {/* #3516 — la barre « Sections du dossier » vient JUSTE sous l'en-tête. */}
      {/* #4508 (décision Louis 24/10) — la ligne `account-context-row` (recherche dans le dossier + parcours
          compact) est retirée de TOUS les onglets : revient sur #2273.2 et #3381. Chercher = ⌘K ; les parcours
          vivent dans Pilotage › Pipe. */}
      <div className="flex flex-col pt-4">
        <AccountDetailTabsBar activeTab={activeTab} onTabChange={handleTabChange} hiddenTabs={hiddenTabs} />
      </div>
      <div className="flex flex-col gap-4 pb-3">
        {/* #2164.17 — même question pendant une actualisation (dossier lisible derrière). */}
        {account.status === 'analyzing' ? <AnalysisEntityQuestionCard accountId={account.id} /> : null}
        {/* `.x-banner-row` — les bandeaux d'état du dossier, sur tous les onglets. */}
        <AccountDetailStatusBanners
          account={account}
          // #2164.16 — `null` hors run : la bannière ne rend rien pour un compte
          // au repos, elle n'a pas à connaître la distinction elle-même.
          analyzing={
            account.status === 'analyzing'
              ? {
                  phase: progress.phase || i18n.t('analysis:progressCard.inProgress'),
                  onCancel: () => {
                    if (cancel.isPending) return
                    cancel.mutate(account.id)
                  },
                }
              : null
          }
        />
        {/* #2115.21-27 — les mêmes sous-parties masquées dans la barre ET dans
            le contenu : depuis que la section EMPILE ses sous-parties, une
            sous-partie retirée de la barre mais rendue quand même réapparaîtrait
            en défilant, sans être nommée nulle part. */}
        <AccountDetailTabContent
          account={account}
          contacts={contacts}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          hiddenTabs={hiddenTabs}
          legacyTabNotice={legacyTabNotice}
        />
        {/* #3523 — geste secondaire et refusable : sous le contenu, plus au-dessus.
            Recette prod 02/10 : « 0 occurrence » — il n'était monté que sur
            l'onglet `overview`, or la page d'entrée d'un compte à brief commercial
            est `brief` (même section Synthèse). Toute la SECTION le porte. */}
        {sectionOfTab(activeTab) === 'synthesis' ? <NotificationsProposalBanner account={account} /> : null}
      </div>
    </div>
  )
}
