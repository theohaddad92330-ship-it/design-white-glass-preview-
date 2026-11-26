import { SoftBrake, SoftBrakeContact } from '@/features/credits/components/SoftBrake'
import type {
  Account,
  AnalysisContext,
  AnalysisScopeMode,
  AnalysisScopeSelection,
  CompanySuggestion,
  Contact,
} from '@bellum/contracts'
import {
  analysisContextFromSearch,
  companyNameRejection,
  isScopeSelectionEmpty,
  scopeModeForCadrage,
} from '@bellum/contracts'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ContextMode, DiscoverOriginCriteria, RefreshScopeMode } from '@bellum/contracts'
import { useAddAccountToPortfolio } from '@/features/accounts/hooks/useAddAccountToPortfolio'
import { useRefreshOrganisation } from '@/features/accounts/hooks/useRefreshOrganisation'
import { motion } from 'framer-motion'
import { Target, UserRound } from 'lucide-react'
import { Text } from '@bellum/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccount } from '@/features/accounts/hooks/useAccount'
import { useAnalysis, type AnalysisSuggestionOrigin } from '@/features/search/hooks/useAnalysis'
import { useAnalysisAttachments } from '@/features/search/hooks/useAnalysisAttachments'
import { useLaunchPlan } from '@/features/search/hooks/useLaunchPlan'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { formatDate } from '@/lib/locale'
import { MIN_QUERY_LENGTH, useCompanySearch } from '@/features/search/hooks/useCompanySearch'
import { useSearchCountry } from '@/features/search/hooks/useSearchCountry'
import { useDefaultScopeMode } from '@/features/search/hooks/useDefaultScopeMode'
import { trackErrorShown, trackSearchPerformed } from '@/lib/product-tracker'
import { AnalysisAttachmentsStrip } from '../components/AnalysisAttachmentsStrip'
import { LaunchPlanNote } from '../components/LaunchPlanNote'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { useCredits } from '@/features/billing/hooks/useCredits'
import { creditsRemaining } from '@/features/credits/lib/credits-alert'
import { useRecentDossiers } from '../components/RecentDossiers'
import { AnalyzeHeader, AnalyzeHeaderActions, AnalyzeModeTabs, type AnalyzeMode } from '../components/AnalyzeChrome'
import { AnalyzeImportEntry } from '../components/AnalyzeRecentRail'
import { AnalyzeFooter, HandOffPane, RecentStrip } from '../components/AnalyzeFooter'
import { CadrageColumn } from '../components/CadrageColumn'
import { CompanySearchBox } from '../components/CompanySearchBox'
import { CompanyStep, type PickedCompany } from '../components/CompanyStep'
import { KnownAccountDialog } from '../components/KnownAccountDialog'
import { PurposeStep } from '../components/PurposeStep'
import { AnalysesHistory } from './AnalysesHistory'
import { useCadrageDefaults } from '../hooks/useCadrageDefaults'
import { useKnownAccount } from '../hooks/useKnownAccount'
import { useKnownLine } from '../hooks/useKnownLine'
import { useWorkspaceAccountMatches } from '../hooks/useWorkspaceAccountMatch'
import { SearchAnalyzingState } from '../components/SearchAnalyzingState'
import { SearchErrorCard } from '../components/SearchErrorCard'
import { ScopeConfirmPanel } from '../components/ScopeConfirmPanel'
import { useMarketPreview } from '../hooks/useMarketPreview'
import { focusSuggestions } from '../lib/marketFocus'
import { initialCadrage, knownEntityNames } from '../lib/initialCadrage'
import { prioritySuggestions } from '../lib/prioritySuggestions'
import { registryNameGroupOf, registryNameGroups } from '../lib/relatedEntities'
import { emptyContext } from '../components/searchComposerPresets'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { GroupPerimeterPicker } from '@/features/analysis/components/GroupPerimeterPicker'
import { buildScopeSummary, resolveLaunchSiren, type ScopeSummary } from '../lib/scope-summary'

export function Search({ from = '/search/' }: { from?: '/search/' } = {}) {
  const searchParams = useSearch({ from })
  const sourceAccount = useAccount(searchParams.accountId ?? '')

  // Re-mount the form once the source account loads so the prefill flows in
  // through `useState` initializers (no useEffect-driven sync).
  const formKey = sourceAccount.account?.id ?? 'fresh'

  // Cadrage analyse (15/10, décision E) — l'écran 1 n'a plus de rangée
  // « Périmètre ». Un ancien `scope=…` (lien existant) et le périmètre mémorisé
  // (#4161) se MIGRENT vers la question « Où ? » de l'écran « Cadrer » ; la zone
  // d'une relance (#3742) garde la main. Une seule table : `initialCadrage`.
  const { defaultScope, rememberScope } = useDefaultScopeMode()
  // Propagation suggestion → analyse (Théo P0 §5) : une suggestion cliquée ouvre
  // /search avec company + suggestionId + suggestionReason. On n'hydrate l'origine
  // que si les deux champs sont présents ET qu'aucun compte source n'est reciblé
  // (une reprise `accountId` n'est pas une suggestion). Le brouillon reste ÉDITABLE.
  // #3819 (lot RBB) — les critères Découvrir suivent l'origine ; un candidat
  // sans raison calculée mais avec des critères posés garde quand même son origine.
  const initialSuggestion: SuggestionOrigin | null =
    !sourceAccount.account &&
    searchParams.suggestionId &&
    (searchParams.suggestionReason || searchParams.suggestionCriteria)
      ? {
          id: searchParams.suggestionId,
          reason: searchParams.suggestionReason ?? '',
          ...(searchParams.suggestionCriteria ? { criteria: searchParams.suggestionCriteria } : {}),
        }
      : null
  const searchedCriteria = mergeSearchedZone(initialSuggestion?.criteria, searchParams.zone_regions)
  // « Mes analyses » (refonte Théo R2) : même route, autre vue — `?vue=historique`, aucune route neuve.
  if (searchParams.vue === 'historique') return <AnalysesHistory />
  return (
    <SearchForm
      key={formKey}
      from={from}
      initialQuery={sourceAccount.account?.company_name ?? searchParams.company ?? searchParams.q ?? ''}
      // #2162.27 / épopée #2892 — Laura (ou tout appelant) peut ouvrir /search
      // avec le contexte déjà rédigé : texte libre (`context`) OU preset
      // STRUCTURÉ (`preset` + un paramètre par champ, contrat
      // `analysisContextFromSearch`). Une VALEUR INITIALE éditable, jamais un
      // verrou ; le contexte du compte relancé (`accountId`) garde la main.
      initialContext={
        sourceAccount.account?.user_context
          ? toInitialContext(sourceAccount.account.user_context)
          : (analysisContextFromSearch(searchParams) ?? DEFAULT_INTENT_CONTEXT)
      }
      onScopeApplied={rememberScope}
      // #3742 — « Actualiser » reprend la zone saisie au cadrage de la dernière analyse.
      initialSelection={initialCadrage({
        scope: searchParams.scope,
        remembered: defaultScope,
        geo: searchParams.geo,
        geoAreas: searchParams.geoAreas,
        // #4432.2 — la zone de l'URL (`zone`, Découvrir et cartes de Laura) présélectionne « Où ? ».
        zone: searchParams.zone,
        // #4432.5 — les régions d'un lien direct (`zone_regions`) s'ajoutent à la zone venue de Découvrir.
        ...(searchedCriteria ? { searched: searchedCriteria } : {}),
      })}
      initialSuggestion={initialSuggestion}
      sourceAccount={sourceAccount.account}
    />
  )
}

function mergeSearchedZone(
  criteria: DiscoverOriginCriteria | undefined,
  zoneRegions: string[] | undefined,
): DiscoverOriginCriteria | undefined {
  if (!zoneRegions?.length) return criteria
  return { ...criteria, zone_regions: [...new Set([...(criteria?.zone_regions ?? []), ...zoneRegions])] }
}

/** Origine « suggestion » d'un run — purement traçante (voir contrats `suggestion_id`). */
type SuggestionOrigin = AnalysisSuggestionOrigin

/**
 * #1688.2 — LE MOTIF D'ÉCRAN, jamais dérivé. Cette recherche EST le geste
 * central du produit (« un commercial tape un nom d'entreprise ») : c'est
 * l'exemple le plus direct de la RÈGLE de #1688.2 — la demande se mesure sur
 * les recherches à ZÉRO résultat (« ils cherchent cette entreprise et le
 * registre ne l'a pas »), donc on émet sur TOUTES les recherches avec leur
 * compte, jamais seulement celles qui échouent — c'est la LECTURE qui filtre
 * à zéro, pas l'émission (voir le docblock de `demand()` côté API).
 */
const SEARCH_SCREEN = '/search'

// R19 — délai max d'attente des pièces jointes avant de lancer quand même (jamais un bouton muet).
// #3623.9 — tranché sans Louis : 10 s (était 30 s, lu en recette comme « rien ne se passe »). Une
// pièce qui finit après le départ est rattachée au compte par le filet ci-dessus, rien n'est perdu.
const ATTACHMENT_SEND_DEADLINE_MS = 10_000
/** #1687.3 — un littéral fixe : jamais `error` (texte libre de `useAnalysis`,
 *  qui peut décrire la cause en clair). */
const ANALYSIS_ERROR_CODE = 'analysis_failed'

type SearchFormProps = {
  from: '/search/'
  initialQuery: string
  initialContext: AnalysisContext
  /** #4161 — appelé au lancement confirmé avec le périmètre DÉDUIT de « Où ? »,
   *  pour que la PROCHAINE analyse fraîche reparte de ce choix. */
  onScopeApplied: (mode: AnalysisScopeMode) => void
  /** Cadrage d'ouverture de l'écran « Cadrer » (`initialCadrage`) — France par défaut. */
  initialSelection: AnalysisScopeSelection
  initialSuggestion: SuggestionOrigin | null
  sourceAccount: Account | null
}

const INITIAL_FREE_CONTEXT: AnalysisContext = { preset: 'free', notes: '' }
// #4140 — une arrivée fraîche sur /search (aucun preset dans l'URL, aucun
// compte relancé) allumait « Autre » (preset `free`) : aucun des 7 intents
// posés par #2162.20 n'était coché par défaut. « Ouvrir ce compte » (preset
// `strategic`), premier de la liste `INTENT_SUGGESTIONS`, est le geste le
// plus fréquent du produit — c'est lui le défaut, jamais « Autre ».
const DEFAULT_INTENT_CONTEXT: AnalysisContext = emptyContext('strategic')

function toInitialContext(value: string): AnalysisContext {
  return value ? { preset: 'free', notes: value } : INITIAL_FREE_CONTEXT
}

function SearchForm({
  from,
  initialQuery,
  initialContext,
  onScopeApplied,
  initialSelection,
  initialSuggestion,
  sourceAccount,
}: SearchFormProps) {
  const navigate = useNavigate({ from })
  const { t, i18n } = useTranslation('search')
  const [query, setQuery] = useState(initialQuery)
  const [context, setContext] = useState<AnalysisContext>(initialContext)
  const [showDropdown, setShowDropdown] = useState(false)
  // Scope lock (Théo p.10) : l'entité précise choisie dans l'autocomplétion. Sa
  // présence ancre le run sur ce SIREN au lieu de re-résoudre le nom (SG → ~100
  // SCI). Éditer le champ efface le verrou (l'utilisateur ne cible plus l'entité).
  const [scopedEntity, setScopedEntity] = useState<CompanySuggestion | null>(null)
  /**
   * L'ensemble d'homonymes de l'entité choisie (#1111), CAPTURÉ au moment du
   * clic. Il ne peut pas être recalculé plus tard : la sélection vide la liste
   * de suggestions, et le recalcul rendrait toujours `null` — c'est-à-dire le
   * silence qu'on essaie précisément de retirer.
   */
  const [pendingNameGroup, setPendingNameGroup] = useState<{ label: string; count: number; names: string } | null>(null)
  // Origine « suggestion » (Théo P0 §5) : présente quand le brouillon a été ouvert
  // depuis une suggestion. Purement traçante — elle ACCÉLÈRE (pré-remplit) mais ne
  // VERROUILLE jamais : dès que l'utilisateur édite le nom, on la purge (le run
  // n'est alors plus « celui de la suggestion »).
  const [suggestionOrigin, setSuggestionOrigin] = useState<SuggestionOrigin | null>(initialSuggestion)
  // Confirmation du périmètre AVANT de payer la collecte (Théo restitution P0-02).
  // Un submit ouvre d'abord ce récap ; la collecte (et le crédit) ne partent qu'à
  // la confirmation explicite. Éditer revient au formulaire.
  const [pendingLaunch, setPendingLaunch] = useState<ScopeSummary | null>(null)
  // Cadrage de la collecte saisi sur ce récap (Théo P0-02 étape 3) : priorités +
  // exclusions. Vide par défaut → la requête de lancement est celle d'avant.
  const [scopeSelection, setScopeSelection] = useState<AnalysisScopeSelection>(initialSelection)
  // Cadrage analyse (15/10) — le périmètre n'a plus de sélecteur : il se DÉDUIT de
  // « Où ? » (France/région → france, ville → site, sinon groupe), et c'est lui que
  // l'IA lit encore pour sa consigne et son filtre géo dur.
  const scopeMode = scopeModeForCadrage(scopeSelection)
  // #3288 — la durée MÉDIANE mesurée de chaque palier de profondeur, lue sur
  // `GET /analysis/launch-plan` (jamais inventée). Coupée en démo (le serveur y
  // répond `demo`, sans mesure) et en relance (pas de palier : le mini-plan de
  // rafraîchissement porte son propre mode).
  const isDemoSpace = useIsDemo()
  // #1583, CAS 2 — « Actualiser l'analyse » cliqué depuis la note de coût : ce
  // lancement doit RELANCER le dossier trouvé, pas en ouvrir un second. Distinct
  // de `Boolean(sourceAccount)` (relance venue d'un `/search?accountId=…`) :
  // ici la relance part d'une recherche fraîche, sans dossier pré-chargé.
  // Purgé dès que le nom édité change — sinon un « TF1 » relancé traînerait sur
  // un « BNP » qu'on n'a jamais confirmé relancer.
  const [forceRelaunch, setForceRelaunch] = useState(false)
  // Plan lu sous le champ « entreprise » (dossier récent / déjà connu) — le composant ne fait plus la requête.
  // Une relance explicite (`/search?accountId=…`) connaît déjà son sort : aucun aperçu.
  const { plan: notePlan } = useLaunchPlan({
    companyName: query,
    siren: resolveLaunchSiren({ query, scopedEntity }),
    scopeMode,
    enabled: !isDemoSpace && !sourceAccount,
  })
  const { plan: depthPlan } = useLaunchPlan({
    companyName: pendingLaunch?.objectName ?? '',
    scopeMode: pendingLaunch?.scopeMode,
    enabled: Boolean(pendingLaunch) && !isDemoSpace && !sourceAccount && !forceRelaunch,
  })

  // AnalysisDraft-lite : reflète le brouillon (nom + périmètre + origine) dans
  // l'URL sans recharger la page, pour qu'un refresh/retour le rouvre à l'identique.
  const persistDraft = useCallback(
    (next: { company?: string; suggestion?: SuggestionOrigin | null }) => {
      void navigate({
        replace: true,
        search: prev => ({
          ...prev,
          company: next.company !== undefined ? next.company.trim() || undefined : prev.company,
          suggestionId: next.suggestion !== undefined ? next.suggestion?.id : prev.suggestionId,
          suggestionReason:
            next.suggestion !== undefined ? next.suggestion?.reason || undefined : prev.suggestionReason,
          suggestionCriteria: next.suggestion !== undefined ? next.suggestion?.criteria : prev.suggestionCriteria,
        }),
      })
    },
    [navigate],
  )

  // Marché cible de la barre (recherche multi-pays #494) — drapeau à côté du
  // champ ; défaut = marché du workspace, mémorisé par utilisateur. Pilote la
  // source d'autocomplétion ET le pays du run.
  const { country, setCountry } = useSearchCountry()
  // #1110 — « faudrait savoir sur quoi on peut chercher […] connaître un peu le
  // glossaire pour orienter BELLUM ». Les amorces du champ « Priorités » sortent
  // du profil de CETTE ESN et de nulle part ailleurs : un glossaire produit figé
  // parlerait d'informatique à une ESN d'ingénierie industrielle. Lu ici, où la
  // session existe, pour que le panneau de confirmation reste présentationnel.
  const { data: esnAnswers } = useEsnProfile()
  const prioritySuggestionValues = prioritySuggestions(esnAnswers, i18n.language)
  // #1589.2 — CE QUE BELLUM SAIT DÉJÀ, AVANT LE CLIC QUI DÉBITE.
  //
  // Lue sur l'entité VERROUILLÉE (`scopedEntity`), jamais sur le texte tapé :
  // « dès qu'une entreprise précise est sélectionnée dans le registre ». Un nom
  // en cours de frappe rapprocherait une entreprise à chaque lettre, et
  // rapprocherait souvent la mauvaise.
  const marketPreview = useMarketPreview(scopedEntity?.name ?? null, country)
  // #1591.1 — les expertises déclarées, marquées de ce que le corpus retrouve.
  // Sans compte sélectionné, `focusSuggestions` ne marque RIEN.
  const focus = focusSuggestions(prioritySuggestionValues, marketPreview.preview)
  const recommendedPriorities = focus.filter(entry => entry.recommended).map(entry => entry.label)
  const {
    suggestions,
    broadenedFrom,
    sourceUnavailable,
    loading: suggestionsLoading,
    search,
    clearSuggestions,
  } = useCompanySearch(country)
  // #1688.2 — ÉMIS quand la recherche RÉSOUT (plus de chargement), jamais à
  // chaque frappe : `search()` (appelée à chaque caractère) est débattue en
  // interne par `useCompanySearch` (300 ms) — c'est `suggestionsLoading` qui
  // redescend à `false` qui dit qu'une tentative a été SERVIE. Dédupliqué par
  // requête (`trimmed`) : `placeholderData` de la query garde l'ancien résultat
  // affiché pendant qu'une nouvelle tourne, donc plusieurs rendus peuvent
  // partager le même état « résolu » sans qu'une deuxième recherche ait eu
  // lieu.
  const lastTrackedQueryRef = useRef<string | null>(null)
  useEffect(() => {
    if (suggestionsLoading) return
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      lastTrackedQueryRef.current = null
      return
    }
    if (lastTrackedQueryRef.current === trimmed) return
    lastTrackedQueryRef.current = trimmed
    // #1688.2 — le NOMBRE de suggestions, jamais le nom tapé : aucun des deux
    // arguments ne porte le texte de la recherche.
    trackSearchPerformed(SEARCH_SCREEN, suggestions.length)
  }, [suggestionsLoading, suggestions, query])
  // Ouvrir un dossier existant — chemin UNIQUE, monté à la fois sur la fin
  // d'un run réel (`onComplete`) et sur « Ouvrir le dossier » du cache-hit
  // annoncé AVANT le clic (#1583, CAS 2). Deux dérivations séparées finiraient
  // par diverger sur le tab par défaut ou la forme de la recherche.
  // #2125.42 — le mode « l'organisation » du mini-plan : deux axes rejoués sur
  // le dossier relancé, jamais une analyse complète. La clé vide quand aucun
  // dossier n'est repris est sans effet — la mutation ne part qu'au geste.
  const refreshOrganisation = useRefreshOrganisation(sourceAccount?.id ?? '')

  const openAccount = useCallback((id: string) => navigate({ to: '/accounts/$id', params: { id } }), [navigate])
  // #2451.1 — le mode de contexte CHOISI pour ce lancement ; absent tant que
  // personne n'a choisi (le serveur applique alors le défaut de l'espace).
  const [analyzeContextMode, setAnalyzeContextMode] = useState<ContextMode | undefined>(undefined)
  const { status, phase, accountId, error, softBraked, startAnalysis, retry, reset } = useAnalysis({
    onComplete: openAccount,
  })
  // #3623 — les documents joints à CETTE analyse : envoyés avant le lancement, rattachés au compte
  // dès qu'il existe (`useAnalysisAttachments`). La salle de démonstration n'envoie rien.
  const attachments = useAnalysisAttachments({ sendFailed: t('attachments.failedFallback') })
  // Refonte Théo R1 — ce que l'écran sait de l'entreprise retenue, avant tout débit.
  const [mode, setMode] = useState<AnalyzeMode>('company')
  const [contactQuery, setContactQuery] = useState('')
  const [needText, setNeedText] = useState('')
  const [knownOpen, setKnownOpen] = useState(false)
  const [intents, setIntents] = useState<string[]>([])
  const portfolioMatches = useWorkspaceAccountMatches(scopedEntity ? '' : query)
  // Théo B r1-recherche.R11/A3 (PR11, rebranché) — les dossiers DÉJÀ dans l'espace : « Ou essaie un dossier »,
  // « Récemment », et la reconnaissance d'un nom tapé qui est EXACTEMENT celui d'un dossier (seul chemin en démo).
  const recentDossiers = useRecentDossiers()
  const typedName = query.trim().toLowerCase()
  const matchedRecent = typedName
    ? recentDossiers.find(dossier => dossier.company_name.trim().toLowerCase() === typedName)
    : undefined
  const planKnownId =
    notePlan?.scenario === 'cache_hit'
      ? notePlan.accountId
      : notePlan?.scenario === 'fresh'
        ? notePlan.knownAccount?.accountId
        : undefined
  const known = useKnownAccount(scopedEntity, sourceAccount, planKnownId ?? matchedRecent?.id)
  const knownLines = useKnownLine(known)
  // Théo B r1-recherche.A12 (PR11, rebranché) — un run déjà en vol sur ce nom, et qui l'a lancé.
  const planInFlight = notePlan?.scenario === 'fresh' ? notePlan.inFlight : undefined
  useCadrageDefaults({
    selection: scopeSelection,
    onSelectionChange: setScopeSelection,
    country,
    relaunch: Boolean(sourceAccount) || forceRelaunch,
  })
  // #3623.9 — une tentative de rattachement par PIÈCE et par compte (pas par compte) : une pièce qui
  // finit son envoi après le lancement se rattache à son tour, sans que l'échec d'une autre boucle.
  const boundAttemptsRef = useRef<Set<string>>(new Set())
  const { bindToAccount, entries: attachmentEntries } = attachments
  useEffect(() => {
    if (!accountId || isDemoSpace) return
    const pending = attachmentEntries.filter(
      e => e.phase === 'done' && !e.bound && !boundAttemptsRef.current.has(`${accountId}:${e.key}`),
    )
    if (pending.length === 0) return
    // Une seule tentative par pièce : un échec se lit sur la pièce, il ne boucle pas.
    for (const e of pending) boundAttemptsRef.current.add(`${accountId}:${e.key}`)
    void bindToAccount(accountId)
  }, [accountId, isDemoSpace, attachmentEntries, bindToAccount])
  // #1687.3 — L'ÉTAT D'ERREUR D'ÉCRAN (`SearchErrorCard`, `status === 'error'`).
  // Gardé sur la TRANSITION vers `'error'` : un re-rendu pendant que l'erreur
  // reste affichée ne doit pas ré-émettre.
  useEffect(() => {
    if (status === 'error') trackErrorShown(SEARCH_SCREEN, ANALYSIS_ERROR_CODE)
  }, [status])

  const isAnalyzing = status === 'starting' || status === 'analyzing'
  // Une analyse DÉBITE : sans quota restant, la saisie est verrouillée et la
  // note de coût dit pourquoi — plutôt que de laisser lancer pour se faire
  // refuser côté serveur (429/409) une fois la recherche déjà tapée.
  const gate = useCreditGate()
  // #4464 (PR11, rebranché) — le solde lu au geste qui lance (Vérification) : frein doux et « Passer en Rapide » si
  // réellement permis. Jamais affiché.
  const { credits } = useCredits()
  // Ce champ acceptait n'importe quelle chaîne : une analyse complète a tourné
  // en production sur « Que penses-tu de Saint-Gobain ? » — huit crédits, aucun
  // fait sourcé. Le refus se dit ICI, avant le clic, plutôt qu'en 400 après.
  const nameRejection = query.trim().length > 0 ? companyNameRejection(query) : null
  const canSubmit = query.trim().length > 0 && !nameRejection && !isAnalyzing && gate.canAnalyze

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      // Éditer le nom détache le périmètre verrouillé — sauf si on retape
      // exactement le nom de l'entité choisie (cas rare, on garde le verrou).
      setScopedEntity(prev => (prev && prev.name === value ? prev : null))
      // #1111 : l'ensemble suit son entité. Le garder après un détachement
      // parlerait d'une société qu'on ne cible plus.
      setPendingNameGroup(prev => (scopedEntity && scopedEntity.name === value ? prev : null))
      // « Une suggestion accélère, elle ne verrouille jamais » (Théo P0 §5) :
      // taper dans le champ = l'utilisateur diverge de la suggestion, on purge
      // son origine (état + URL) pour ne pas tracer un run qui n'en vient plus.
      setSuggestionOrigin(null)
      // #1583 — éditer le nom désarme « Actualiser l'analyse » : la relance
      // forcée visait le dossier de LA saisie précédente, jamais celle-ci.
      setForceRelaunch(false)
      persistDraft({ company: value, suggestion: null })
      search(value)
    },
    [search, persistDraft, scopedEntity],
  )

  const handleSelectSuggestion = useCallback(
    (suggestion: CompanySuggestion) => {
      setQuery(suggestion.name)
      setScopedEntity(suggestion)
      const groups = registryNameGroups(suggestions, query)
      const group = registryNameGroupOf(suggestion, groups)
      setPendingNameGroup(
        group
          ? {
              ...group,
              names: suggestions
                .filter(other => registryNameGroupOf(other, groups)?.label === group.label)
                .map(other => other.name)
                .join(' · '),
            }
          : null,
      )
      setShowDropdown(false)
      clearSuggestions()
    },
    [clearSuggestions, suggestions, query],
  )

  // #2150.42 (épopée #2781) — « Ajouter au portefeuille » depuis un résultat
  // de recherche, sans lancer d'analyse ni consommer de crédit : même porte
  // que Découvrir/CRM (`accountsApi.addToPortfolio`).
  const addToPortfolio = useAddAccountToPortfolio()
  const handleAddToPortfolio = useCallback(
    (suggestion: CompanySuggestion) => {
      addToPortfolio.mutate({
        company_name: suggestion.name,
        siren: suggestion.siren || undefined,
        sector: suggestion.sector || undefined,
      })
    },
    [addToPortfolio],
  )

  // Submit n'engage PLUS la collecte : il ouvre le récap de périmètre (P0-02).
  const handleSubmit = useCallback(() => {
    const trimmed = query.trim()
    if (!trimmed || isAnalyzing) return
    clearSuggestions()
    setShowDropdown(false)
    setPendingLaunch(buildScopeSummary({ query, scopedEntity, scopeMode, knownSiren: sourceAccount?.siren }))
  }, [query, isAnalyzing, clearSuggestions, scopedEntity, scopeMode, sourceAccount])

  // #1583, CAS 2 — « Actualiser l'analyse » cliqué depuis la note de coût : le
  // même parcours que Entrée/« Lancer l'analyse » (le récap de périmètre
  // reste la porte AVANT tout débit), mais marqué relance — le lancement
  // rafraîchira le dossier trouvé EN PLACE au lieu d'en ouvrir un second.
  const handleRefreshExisting = useCallback(() => {
    setForceRelaunch(true)
    handleSubmit()
  }, [handleSubmit])

  // Confirmation explicite → la collecte (et le crédit) partent maintenant.
  const handleConfirmLaunch = useCallback(
    (refreshMode?: RefreshScopeMode) => {
      const trimmed = query.trim()
      if (!trimmed || isAnalyzing) return
      // #2125.42 — « ne relire que l'organisation ». Ce n'est pas une analyse :
      // c'est le rerun des deux axes que le dossier sait déjà rafraîchir, au prix
      // que le mini-plan vient d'annoncer. Il n'a de sens que sur un dossier
      // existant — sans lui, il n'y a rien à relire.
      if (refreshMode === 'organisation' && sourceAccount) {
        setPendingLaunch(null)
        setForceRelaunch(false)
        refreshOrganisation.mutate()
        void openAccount(sourceAccount.id)
        return
      }
      // L'identité que ce run va analyser — l'entité choisie à l'autocomplétion,
      // sinon celle du dossier qu'on relance. La règle et sa raison vivent dans
      // `resolveLaunchSiren`, aux côtés du récap qui l'ANNONCE : deux dérivations
      // séparées finiraient par afficher une société et en analyser une autre.
      const siren = resolveLaunchSiren({ query, scopedEntity, knownSiren: sourceAccount?.siren })
      // Reprise d'un dossier existant (`/search?accountId=…`) = RELANCE explicite,
      // tout comme « Actualiser l'analyse » cliqué sur un dossier récent trouvé
      // par la note de coût (#1583) : un dossier déjà `completed` est ré-exécuté
      // EN PLACE (même compte, un crédit) au lieu d'être servi depuis le cache —
      // jamais de 2ᵉ ligne (compte canonique).
      const relaunch = Boolean(sourceAccount) || forceRelaunch
      // #4161 — le périmètre DÉDUIT de « Où ? » devient le défaut de la prochaine analyse.
      onScopeApplied(scopeMode)
      setPendingLaunch(null)
      setForceRelaunch(false)
      // Trace l'origine « suggestion » quand elle est encore vivante (l'édition du
      // nom l'a déjà purgée le cas échéant — voir `handleQueryChange`).
      const launch = () =>
        startAnalysis(
          trimmed,
          context,
          siren,
          scopeMode,
          suggestionOrigin ?? undefined,
          country,
          relaunch,
          // Cadrage confirmé sur le récap : c'est CE qui rend la confirmation autre
          // chose qu'un écran (l'exclu est réellement exclu, côté serveur).
          isScopeSelectionEmpty(scopeSelection) ? undefined : scopeSelection,
          // #2451.1 — le mode choisi sur la chip ; absent = défaut de l'espace.
          analyzeContextMode,
          // #3623 — le serveur rattache ces pièces au compte avant la mise en file.
          attachments.personalDocumentIds(),
        )
      // #3623.1b — les documents joints partent AVANT le débit, mais une pièce qui ne s'envoie pas
      // n'empêche JAMAIS l'analyse : elle part sans elle, et sa ligne (`AnalysisAttachmentsStrip`)
      // nomme ce qui n'a pas pu être lu — payer une analyse qui attendrait une pièce en panne serait
      // pire que la lancer incomplète.
      if (attachments.entries.length > 0 && !isDemoSpace) {
        // R19 (15/10) : l'envoi est BORNÉ — une pièce qui ne répond pas ne retient plus l'analyse
        // (avant : « Confirmer et lancer » semblait ne rien faire, aucun POST d'analyse).
        const sent = attachments.sendAll(sourceAccount ? { accountId: sourceAccount.id } : {}).catch(() => false)
        const deadline = new Promise<void>(resolve => setTimeout(resolve, ATTACHMENT_SEND_DEADLINE_MS))
        void Promise.race([sent, deadline]).then(() => launch())
        return
      }
      launch()
    },
    [
      analyzeContextMode,
      query,
      context,
      isAnalyzing,
      startAnalysis,
      scopedEntity,
      scopeMode,
      suggestionOrigin,
      country,
      sourceAccount,
      scopeSelection,
      forceRelaunch,
      refreshOrganisation,
      openAccount,
      attachments,
      isDemoSpace,
      onScopeApplied,
    ],
  )

  // L'entreprise retenue : l'entité choisie au registre, ou le dossier qu'on reprend (`?accountId=`).
  const idLabelOf = (entity: CompanySuggestion): string =>
    entity.registryId && entity.registryIdLabel
      ? `${entity.registryIdLabel} ${entity.registryId}`
      : entity.registryId
        ? entity.registryId
        : entity.siren
          ? t('scope.siren', { siren: entity.siren })
          : ''
  const picked: PickedCompany | null = scopedEntity
    ? {
        name: scopedEntity.name,
        meta: [scopedEntity.city, scopedEntity.sector, idLabelOf(scopedEntity)].filter(Boolean).join(' · '),
        logo: known.account?.logo_url,
      }
    : sourceAccount && query === sourceAccount.company_name
      ? {
          name: sourceAccount.company_name,
          meta: [
            sourceAccount.headquarters,
            sourceAccount.sector,
            sourceAccount.siren ? t('scope.siren', { siren: sourceAccount.siren }) : '',
          ]
            .filter(Boolean)
            .join(' · '),
          logo: sourceAccount.logo_url,
        }
      : null
  const colleague = known.account?.active_analysis_by_colleague ?? null
  const marketForDialog = {
    preview: marketPreview.preview,
    isPending: marketPreview.isPending,
    notCovered: marketPreview.notCovered,
    unavailable: marketPreview.unavailable,
  }
  const handleOpenRecent = (accountId: string) => void navigate({ to: '/search', search: { accountId } })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative flex min-h-full flex-col items-center bg-[var(--bellum-surface-1)]"
    >
      {pendingLaunch && !isAnalyzing ? (
        <div className="flex w-full flex-1 flex-col">
          <ScopeConfirmPanel
            /* Le périmètre suit « Où ? » EN DIRECT : l'objet annoncé est celui du
             cadrage qu'on s'apprête à lancer, pas celui du clic d'avant. */
            summary={{ ...pendingLaunch, scopeMode }}
            country={country}
            selection={scopeSelection}
            onSelectionChange={setScopeSelection}
            preset={context.preset}
            context={context}
            onContextChange={setContext}
            intents={intents}
            knownLines={knownLines}
            onOpenKnown={() => setKnownOpen(true)}
            onEdit={() => setPendingLaunch(null)}
            onConfirm={handleConfirmLaunch}
            disabled={isAnalyzing}
            /* #1133/#1583 : même booléen que celui passé à `startAnalysis` plus bas — ce qui est
             ANNONCÉ ici est exactement ce qui sera DEMANDÉ au serveur. */
            relaunch={Boolean(sourceAccount) || forceRelaunch}
            /* #2125.35 — la fraîcheur par axe du dossier repris : c'est elle qui permet au
             mini-plan de dire ce qui est ANCIEN, et depuis quand. */
            relaunchFreshness={
              sourceAccount
                ? {
                    signals: sourceAccount.signals_refreshed_at ?? null,
                    contacts: sourceAccount.contacts_refreshed_at ?? null,
                    entities: sourceAccount.entities_refreshed_at ?? null,
                    strategy: sourceAccount.strategy_refreshed_at ?? null,
                  }
                : undefined
            }
            depthMedians={
              depthPlan?.scenario === 'fresh'
                ? Object.fromEntries((depthPlan.depths ?? []).map(d => [d.depth, d.medianSeconds]))
                : undefined
            }
            remaining={credits === null ? null : creditsRemaining(credits)}
          />
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 pb-6 pt-5 md:px-8 md:pt-7">
          {/* #4662 — l'attente d'une analyse est un écran : son <h1> nomme ce qui se passe (et sur quel compte),
              il n'hérite pas de la question de `/search`, qui n'a plus de sens devant trois à six minutes d'attente. */}
          <AnalyzeHeader
            title={
              isAnalyzing
                ? query.trim()
                  ? t('analyze.waiting.title', { company: query.trim() })
                  : t('analyze.waiting.titleNoName')
                : t('analyze.title')
            }
            subtitle={isAnalyzing ? t('analyze.waiting.subtitle') : t('analyze.subtitle')}
            actions={<AnalyzeHeaderActions />}
          />
          {/* #4598 (renverse #4542) — pendant une analyse lancée et payée, la rangée des modes n'a plus de sens et
              se disputait la hauteur avec la carte de progression (#4542 avait ajouté `shrink-0` pour la protéger).
              On tranche pour la progression : la rangée est ABSENTE du DOM, pas masquée. `mode` reste celui de
              l'analyse ; à la fin, en échec ou à l'abandon, la rangée revient sur le même onglet.
              #4598.7 — idem pour l'analyse d'un collègue suivie (`planInFlight`) : l'écran montre alors une analyse
              en vol, pas un choix d'entrée. */}
          {isAnalyzing || planInFlight ? null : (
            <AnalyzeModeTabs
              mode={mode}
              onModeChange={setMode}
              onMany={() => void navigate({ to: '/discover/lots' })}
            />
          )}
          {isAnalyzing ? (
            <SearchAnalyzingState companyName={query} phase={phase} accountId={accountId} onCancel={reset} />
          ) : (
            <>
              {/* #2520 — « Réessayer » REJOUE la demande (reprise du run, ou même lancement) ; il annulait le
                  run et vidait l'écran (`reset`). Le cadrage reste dessous, conservé. */}
              {/* #4464 — un refus 402 du lancement est LE frein doux commun, jamais une erreur à réessayer. */}
              {status === 'error' && softBraked ? (
                <SoftBrake className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-[var(--bellum-text-secondary)]" />
              ) : null}
              {status === 'error' && !softBraked ? (
                <SearchErrorCard message={error} onRetry={() => void retry()} />
              ) : null}
              {mode === 'company' ? (
                /* `.an21-work` : UNE carte — l'entreprise en haut, puis l'objectif à gauche et le
                   cadrage à droite, et le pied avec l'unique bouton principal. */
                <form
                  id="analyze-form"
                  data-analyze-section="work"
                  className="min-w-0 rounded-2xl border border-[var(--bellum-border)] bg-card"
                  onSubmit={event => {
                    event.preventDefault()
                    if (canSubmit) handleSubmit()
                  }}
                >
                  <div
                    data-analyze-section="company"
                    className="flex flex-col gap-3 rounded-t-2xl border-b border-[var(--bellum-border)] px-4 pb-3 pt-3.5 md:px-6"
                  >
                    <CompanyStep
                      picked={picked}
                      onChange={() => handleQueryChange('')}
                      searchBox={
                        <CompanySearchBox
                          query={query}
                          onQueryChange={handleQueryChange}
                          onSubmit={handleSubmit}
                          suggestions={suggestions}
                          suggestionsLoading={suggestionsLoading}
                          broadenedFrom={broadenedFrom}
                          sourceUnavailable={sourceUnavailable}
                          showDropdown={showDropdown}
                          onShowDropdown={setShowDropdown}
                          onSelectSuggestion={handleSelectSuggestion}
                          country={country}
                          onCountryChange={setCountry}
                          portfolioMatches={portfolioMatches}
                          onAddToPortfolio={handleAddToPortfolio}
                          addingToPortfolioSiren={
                            addToPortfolio.isPending ? (addToPortfolio.variables?.siren ?? null) : null
                          }
                        />
                      }
                      nameGroup={pendingNameGroup}
                      groupWhole={(scopeSelection.included_entities ?? []).length === 0}
                      onGroupWholeChange={whole =>
                        setScopeSelection(prev => ({
                          ...prev,
                          included_entities: whole || !scopedEntity ? [] : [scopedEntity.name],
                        }))
                      }
                      colleague={colleague}
                      onFollowColleague={known.account ? () => void openAccount(known.account!.id) : null}
                      inFlight={
                        planInFlight
                          ? {
                              text: planInFlight.startedBy
                                ? t('analysis.inFlightStartedBy', { firstName: planInFlight.startedBy.firstName })
                                : t('frame.inFlight'),
                              onFollow: () => void openAccount(planInFlight.accountId),
                            }
                          : null
                      }
                      recentDossiers={recentDossiers}
                      onPickDossier={handleQueryChange}
                      knownLines={knownLines}
                      onOpenKnown={() => setKnownOpen(true)}
                    />
                    {nameRejection ? (
                      <Text size="sm" className="text-[var(--danger-soft-text)]">
                        {nameRejection}
                      </Text>
                    ) : null}
                    <LaunchPlanNote
                      plan={notePlan}
                      onOpenExisting={openAccount}
                      onRefreshExisting={handleRefreshExisting}
                    />
                  </div>
                  <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,1fr)]">
                    <div data-analyze-section="purpose" className="min-w-0 px-4 pb-3 pt-3.5 md:px-5">
                      <PurposeStep context={context} onContextChange={setContext} onIntentsChange={setIntents} />
                    </div>
                    <div
                      data-analyze-section="cadrage"
                      className="min-w-0 border-t border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-surface-2)_48%,transparent)] px-4 pb-3 pt-3.5 md:px-5 lg:border-l lg:border-t-0"
                    >
                      <CadrageColumn
                        selection={scopeSelection}
                        onSelectionChange={setScopeSelection}
                        country={country}
                        entitySuggestions={knownEntityNames(sourceAccount)}
                        prioritySuggestions={prioritySuggestionValues}
                        recommendedPriorities={recommendedPriorities}
                        focusLookedUp={marketPreview.preview !== null}
                        relaunch={Boolean(sourceAccount) || forceRelaunch}
                        relaunchedOn={
                          known.account?.last_analyzed_at
                            ? formatDate(known.account.last_analyzed_at, { day: 'numeric', month: 'short' })
                            : null
                        }
                        depthMedians={
                          depthPlan?.scenario === 'fresh'
                            ? Object.fromEntries((depthPlan.depths ?? []).map(d => [d.depth, d.medianSeconds]))
                            : undefined
                        }
                        contextMode={analyzeContextMode}
                        onContextModeChange={setAnalyzeContextMode}
                        onAttachFiles={files => void attachments.addFiles(files)}
                        attachmentsStrip={
                          <AnalysisAttachmentsStrip
                            entries={attachments.entries}
                            refusals={attachments.refusals}
                            demo={isDemoSpace}
                            accountName={sourceAccount?.company_name ?? query.trim()}
                            onRemove={attachments.remove}
                          />
                        }
                        disabled={isAnalyzing}
                      />
                      {/* Lot 757 (arbitrage Louis 31/10) — le groupe et ses filiales : où chercher aussi des contacts. */}
                      <div className="mt-3">
                        <GroupPerimeterPicker
                          siren={resolveLaunchSiren({ query, scopedEntity, knownSiren: sourceAccount?.siren })}
                          selection={scopeSelection}
                          onSelectionChange={setScopeSelection}
                          disabled={isAnalyzing}
                        />
                      </div>
                    </div>
                  </div>
                  <AnalyzeFooter
                    onPrepare={handleSubmit}
                    disabled={!canSubmit}
                    note={
                      gate.canAnalyze ? undefined : gate.known && !gate.locked ? (
                        // #4464 — le frein doux commun : une phrase et un contact, ni chiffre ni « recharger ».
                        <SoftBrake />
                      ) : (
                        // Théo B r1-recherche (#4468, PR11) — le quota se DIT, sans aucun nombre. #4464.2 — et l'espace
                        // verrouillé garde son moyen de joindre l'équipe (mesuré : 0 mailto sur la page).
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span role="status">{t('frame.footer.blocked')}</span>
                          <SoftBrakeContact />
                        </span>
                      )
                    }
                  />
                </form>
              ) : mode === 'contact' ? (
                <HandOffPane
                  icon={UserRound}
                  title={t('analyze.contactPane.title')}
                  description={t('analyze.contactPane.description')}
                  placeholder={t('analyze.contactPane.placeholder')}
                  value={contactQuery}
                  onValueChange={setContactQuery}
                  cta={t('analyze.contactPane.cta')}
                  onSubmit={() => void navigate({ to: '/contacts', search: { q: contactQuery.trim() } })}
                />
              ) : (
                <HandOffPane
                  icon={Target}
                  title={t('analyze.needPane.title')}
                  description={t('analyze.needPane.description')}
                  placeholder={t('analyze.needPane.placeholder')}
                  value={needText}
                  onValueChange={setNeedText}
                  multiline
                  cta={t('analyze.needPane.cta')}
                  onSubmit={() => void navigate({ to: '/projects/needs', search: { q: needText.trim() } })}
                />
              )}
            </>
          )}
          {/* #4512 — « Récemment » : UNE analyse (la dernière), « Tout voir » mène à l'historique. */}
          <RecentStrip
            items={recentDossiers.slice(0, 1).map(account => ({
              id: account.id,
              name: account.company_name,
              logo: account.logo_url,
              detail: account.sector ?? '',
            }))}
            onOpenItem={handleOpenRecent}
          />
          {/* Lot comptes-import — « Importer un fichier ou une liste » reste sous le pied (fonction gardée). */}
          <AnalyzeImportEntry />
        </div>
      )}
      <KnownAccountDialog
        open={knownOpen}
        onOpenChange={setKnownOpen}
        companyName={picked?.name ?? query.trim()}
        known={known}
        market={marketForDialog}
      />
    </motion.div>
  )
}
