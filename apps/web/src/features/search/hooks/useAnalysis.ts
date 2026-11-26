import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type {
  AnalysisContext,
  ContextMode,
  AnalysisScopeMode,
  AnalysisScopeSelection,
  DiscoverOriginCriteria,
  WorkspaceMarket,
} from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { isSoftBrakeError } from '@/features/credits/lib/soft-brake'
import { playDemoAnalysis } from '@/features/demo/demo-run'
import { i18n } from '@/i18n'
import { useAuth } from '@/hooks/useAuth'
import { subscribeToAnalysisRun } from '@/lib/analysis-subscription'
import { apiFetch } from '@/lib/api'
import { useAnalysisStore } from '@/stores/analysisStore'

type StartResponse = {
  jobId: string
  accountId: string
  /**
   * Un run tourne-t-il vraiment ? Le serveur court-circuite `start` sans rien
   * enqueuer quand le dossier est déjà frais (result cache) ou en mode démo.
   * Absent = ancienne API (déploiement en cours) → on retombe sur l'ancien
   * comportement optimiste plutôt que de casser un lancement légitime.
   */
  launched?: boolean
  reason?: 'cache_hit' | 'in_flight' | 'demo_replay'
  /**
   * #2704.1 — QUI a lancé le run qu'on rejoint (`reason: 'in_flight'`), quand
   * ce n'est PAS soi. Absent = son propre run, ou rien à nommer — aucun toast.
   */
  startedBy?: { firstName: string; avatarUrl: string | null }
}

/** Origine « suggestion » d'un run. `criteria` (#3819, lot RBB) : les critères
 *  Découvrir posés ET satisfaits, persistés sur le compte. Une raison vide n'est
 *  jamais envoyée (le contrat exige une raison non vide). */
export type AnalysisSuggestionOrigin = { id: string; reason: string; criteria?: DiscoverOriginCriteria }

/** Les arguments d'un lancement, dans l'ordre de `startAnalysis`. */
type StartArgs = [
  companyName: string,
  userContext?: AnalysisContext,
  siren?: string,
  scopeMode?: AnalysisScopeMode,
  suggestion?: AnalysisSuggestionOrigin,
  country?: WorkspaceMarket,
  relaunch?: boolean,
  scopeSelection?: AnalysisScopeSelection,
  contextMode?: ContextMode,
  attachmentDocumentIds?: readonly string[],
]

type UseAnalysisOptions = {
  onComplete?: (accountId: string) => void
}

/**
 * Kicks off an analysis from the search bar and returns the live state of
 * the run held in the shared Zustand store. All WS → store mapping lives in
 * `subscribeToAnalysisRun` — the same helper that `useAnalysisProgress`
 * uses from AccountDetail, so the two views can't diverge.
 */
export function useAnalysis(options: UseAnalysisOptions = {}) {
  const { t } = useTranslation('search')
  const { onComplete } = options
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const { session } = useAuth()
  const qc = useQueryClient()
  const clear = useAnalysisStore(s => s.clear)

  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const run = useAnalysisStore(s => (activeAccountId ? s.runs[activeAccountId] : null))
  const [bootstrapError, setBootstrapErrorRaw] = useState<string | null>(null)
  // #4464.1 — le refus 402 du serveur au lancement est LE frein doux commun : l'écran monte
  // `<SoftBrake>`, jamais le message brut de l'API (qui peut nommer un solde).
  const [softBraked, setSoftBraked] = useState(false)
  const setBootstrapError = useCallback((message: string | null, braked = false) => {
    setBootstrapErrorRaw(message)
    setSoftBraked(braked)
  }, [])
  const failWith = useCallback(
    (err: unknown) => {
      if (isSoftBrakeError(err)) setBootstrapError(i18n.t('common:softBrake.title'), true)
      else setBootstrapError(err instanceof Error ? err.message : t('analysis.unknownError'))
    },
    [setBootstrapError, t],
  )
  const unsubscribeRef = useRef<(() => void) | null>(null)
  /** #2520 — la DERNIÈRE demande de lancement, telle quelle : « Réessayer » la rejoue. */
  const lastStartRef = useRef<StartArgs | null>(null)

  const startAnalysis = useCallback(
    async (
      companyName: string,
      userContext?: AnalysisContext,
      siren?: string,
      scopeMode?: AnalysisScopeMode,
      // Origine « suggestion » (Théo P0 §5) : présent uniquement quand le run
      // part d'un clic sur une suggestion et que l'utilisateur n'a pas édité le
      // nom depuis. Purement traçant — n'influence pas la société analysée.
      suggestion?: AnalysisSuggestionOrigin,
      // Marché cible du run (recherche multi-pays #494) : le drapeau choisi dans
      // la barre. `FR`/absent = chemin français inchangé ; un code non-FR active
      // le country pack correspondant pour CE run.
      country?: WorkspaceMarket,
      // Relance EXPLICITE d'un dossier déjà analysé (compte canonique unique) :
      // présent quand le run part d'une reprise (`/search?accountId=…`). Un dossier
      // déjà `completed` est alors RÉ-EXÉCUTÉ EN PLACE sur le même compte (nouveau
      // run, un crédit) au lieu d'être servi depuis le cache — jamais de doublon.
      relaunch?: boolean,
      // Cadrage de la collecte confirmé avant le débit (Théo P0-02) : priorités
      // + exclusions. Absent = aucun cadrage → run inchangé.
      scopeSelection?: AnalysisScopeSelection,
      // #2451.1 — le mode de contexte CHOISI sur l'écran (Mon activité / Mission
      // ponctuelle / Neutre). Absent = aucun choix → le serveur applique le
      // défaut de l'espace ; la clé est omise, requête byte-identique.
      contextMode?: ContextMode,
      // #3623 — les documents joints (envoyés en `personal`) que le serveur rattache au compte
      // AVANT la mise en file. Absent/vide = clé omise, requête byte-identique.
      attachmentDocumentIds?: readonly string[],
    ) => {
      lastStartRef.current = [
        companyName,
        userContext,
        siren,
        scopeMode,
        suggestion,
        country,
        relaunch,
        scopeSelection,
        contextMode,
        attachmentDocumentIds,
      ]
      if (!session) {
        setBootstrapError(t('analysis.notAuthenticated'))
        return
      }
      setBootstrapError(null)

      let payload: StartResponse
      try {
        payload = await apiFetch<
          StartResponse,
          {
            company_name: string
            user_context?: AnalysisContext
            siren?: string
            scope_mode?: AnalysisScopeMode
            scope_selection?: AnalysisScopeSelection
            suggestion_id?: string
            suggestion_reason?: string
            suggestion_criteria?: DiscoverOriginCriteria
            country?: WorkspaceMarket
            relaunch?: boolean
            context_mode?: ContextMode
            attachment_document_ids?: string[]
          }
        >({
          path: '/analysis/start',
          method: 'POST',
          // #2520 — le serveur dédoublonne ce démarrage (`jobId` déterministe →
          // `in_flight`, rien débité deux fois) : il peut donc se rejouer sur une
          // panne de redéploiement (502/503/504, connexion coupée) au lieu de
          // finir en erreur. Voir `transient-retry.ts`.
          idempotent: true,
          // Scope lock (Théo p.10) : SIREN choisi + périmètre (groupe/france/…).
          body: {
            company_name: companyName,
            user_context: userContext,
            siren,
            // `groupe` = défaut serveur → on ne l'envoie pas pour rester léger.
            scope_mode: scopeMode && scopeMode !== 'groupe' ? scopeMode : undefined,
            // Cadrage confirmé avant le débit — omis quand vide, pour que la
            // requête d'un lancement sans cadrage reste byte-identique.
            scope_selection: scopeSelection,
            // Absents (undefined) hors parcours suggestion → omis du JSON.
            suggestion_id: suggestion?.id,
            suggestion_reason: suggestion?.reason || undefined,
            // #3819 (lot RBB) — les critères Découvrir posés ET satisfaits.
            suggestion_criteria: suggestion?.criteria,
            // FR (défaut) → omis pour que la requête française reste byte-identique.
            country: country && country !== 'FR' ? country : undefined,
            // Relance en place seulement quand demandée → omise (undefined) sinon,
            // pour laisser le chemin « nouvelle analyse » byte-identique.
            relaunch: relaunch ? true : undefined,
            // #2451.1 — omis sans choix (undefined → absent du JSON).
            context_mode: contextMode,
            attachment_document_ids: attachmentDocumentIds?.length ? [...attachmentDocumentIds] : undefined,
          },
        })
      } catch (err) {
        failWith(err)
        return
      }

      const { jobId, accountId, launched, reason, startedBy } = payload

      // #2212.12 — LE RÉSULTAT RÉEL, PAS LE CLIC SUR « LANCER ».
      //
      // Dispatché une fois la réponse du serveur connue — cache, démo, run déjà
      // en vol ou lancement neuf comptent tous comme un résultat réel, aucun
      // n'est un clic sans suite. Le guide `analyser-un-compte`
      // (`guide-registry.ts`) est le seul auditeur ; sans lui, cet événement ne
      // coûte rien et n'a aucun effet.
      window.dispatchEvent(new CustomEvent('bellum:guide-analysis-started', { detail: { accountId } }))

      // Espace de démonstration : rien ne tourne côté serveur, mais ouvrir le
      // dossier instantanément ne montrerait pas le produit. On joue la
      // progression scriptée (mêmes étapes, mêmes libellés) puis on laisse
      // l'effet de complétion habituel naviguer — un seul chemin de sortie.
      if (launched === false && reason === 'demo_replay') {
        setActiveAccountId(accountId)
        unsubscribeRef.current?.()
        unsubscribeRef.current = playDemoAnalysis(accountId, jobId, companyName)
        return
      }

      // Court-circuit serveur : le dossier existe déjà et AUCUN job n'a été
      // enqueué (result cache). Seeder un run ici afficherait une carte
      // « Lancement de l'analyse » à 0% qui n'avancerait jamais — aucun event
      // Socket.IO ne viendra. On ouvre directement le dossier existant.
      // (`launched === undefined` = API antérieure au fix → chemin optimiste.)
      if (launched === false) {
        onCompleteRef.current?.(accountId)
        return
      }

      // `in_flight` = the server did NOT enqueue anything; a run was already
      // going and we are joining it. Calling `start()` here reset that run to
      // "Lancement de l'analyse — 0%", which is how a three-phases-deep ALSEDIS
      // analysis rendered as not-yet-started: the client overwrote a real
      // position with a fabricated one, then waited for events that had already
      // been emitted. `adopt()` claims no position; the reconciler fills it in
      // from state on the next tick.
      if (reason === 'in_flight') {
        useAnalysisStore.getState().adopt(accountId, jobId, companyName)
        // #2704.1 — un rattachement à un run de COLLÈGUE se DIT, sinon il se
        // lit comme un plantage (Bedros/Adel, Apricot Labs, 22/09/2026,
        // #2704). Absent (son propre run, ou rien à nommer) → aucun toast.
        if (startedBy) {
          toast.info(i18n.t('search:analysis.inFlightStartedBy', { firstName: startedBy.firstName }))
        }
      } else {
        useAnalysisStore.getState().start(accountId, jobId, companyName)
      }
      setActiveAccountId(accountId)

      // #3143 — LA FICHE DU COMPTE (`accountKeys.detail`) DOIT SAVOIR QU'UN RUN
      // VIENT DE COMMENCER, PAS SEULEMENT QU'IL VIENT DE FINIR.
      //
      // Mesuré en recette prod le 28/09/2026 (compte LA POSTE) : « Actualiser
      // l'analyse » lancée depuis /search, puis la fiche (URL directe, reload,
      // clic depuis la liste) n'affichait NI le bloc plein écran NI la ligne
      // compacte pendant que l'API confirmait un run réellement actif
      // (`/analysis/status` à 50 % puis 75 %). `AccountDetailStatusBanners`
      // décide tout sur `account.status === 'analyzing'`
      // (`AccountDetail.tsx`) — lu depuis CETTE requête, dont le `staleTime`
      // par défaut est 5 minutes (`lib/api/query-client.ts`). Une fiche
      // consultée juste avant de cliquer « Actualiser » (le cas courant :
      // c'est de LÀ que part le clic) restait donc `completed` en cache pour
      // toute la durée d'un run de 3-6 minutes. Seuls `reset()` (annulation)
      // et la reprise après erreur invalidaient déjà cette clé — jamais le
      // lancement heureux, qu'il enqueue un run neuf ou qu'il rejoigne un run
      // déjà en vol (`in_flight`) : dans les deux cas, `account.status` vaut
      // désormais `analyzing` côté serveur.
      void qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      // #3666.8 — recette prod 08/10 (call bêta) : « si tu actualises ta page, tu
      // auras le truc qui apparaîtra à gauche » — un compte NEUF (première
      // analyse) n'apparaissait dans `/accounts` qu'après un rechargement
      // manuel, parce que seule la fiche (`accountKeys.detail`) était invalidée
      // au lancement, jamais la liste (`accountKeys.list`, `staleTime` 30 s).
      // `list(userId)` est le préfixe à 3 segments : il invalide toutes les
      // combinaisons de filtres déjà en cache pour cet utilisateur.
      void qc.invalidateQueries({ queryKey: accountKeys.list(session.user.id) })

      // Defensive cleanup: starting a second analysis without resetting the
      // first would otherwise leak a subscription.
      unsubscribeRef.current?.()
      // Navigation on completion is NOT wired here: it hangs off the store's
      // `completed` state (see the effect below), which both the stream and the
      // server state read converge on. Wiring it to the stream alone meant a
      // client that missed `analysis:done` — dead socket, reload, tab reopened
      // after the run finished — never left the "Analyse en cours" screen, on a
      // dossier that was ready.
      unsubscribeRef.current = subscribeToAnalysisRun(accountId, qc)
    },
    [session, qc, t, failWith, setBootstrapError],
  )

  const reset = useCallback(() => {
    // Best-effort cancel on the backend before clearing the local UI: the
    // worker would otherwise keep paying for Claude/Apollo/Firecrawl until
    // the run terminated naturally. Errors are swallowed because the UI
    // reset must always succeed (the user has already left the page).
    if (activeAccountId) {
      void accountsApi.cancelAnalysis(activeAccountId).catch(() => {})
      qc.invalidateQueries({ queryKey: accountKeys.detail(activeAccountId) })
      clear(activeAccountId)
    }
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    setActiveAccountId(null)
    setBootstrapError(null)
  }, [activeAccountId, clear, qc, setBootstrapError])

  /**
   * #2520 — « RÉESSAYER » REJOUE LA MÊME DEMANDE, IL N'EFFACE RIEN.
   *
   * Le bouton de la carte d'erreur appelait `reset` : il ANNULAIT le run côté
   * serveur et vidait l'écran, sous un texte qui promettait « relance-la — elle
   * repartira de la dernière étape réussie ». Deux cas, deux gestes :
   *  - le run a démarré puis s'est arrêté (redéploiement, coupure) → REPRISE
   *    (`POST /analysis/:id/resume`) : le serveur saute les phases déjà posées
   *    et ne débite pas une seconde fois un run déjà payé ;
   *  - le démarrage lui-même n'a pas abouti → la MÊME demande repart
   *    (`/analysis/start`, dédoublonné côté serveur).
   * Aucun nouveau message de la personne, aucune saisie à refaire.
   */
  const retry = useCallback(async () => {
    const failedRunAccountId = !bootstrapError && run?.state === 'error' ? activeAccountId : null
    if (failedRunAccountId && run) {
      const companyName = run.companyName
      setBootstrapError(null)
      try {
        const resumed = await accountsApi.resumeAnalysis(failedRunAccountId)
        // Le run repart de ses points de contrôle : on ne lui invente aucune
        // position (`adopt`), la lecture d'état la rétablit.
        clear(failedRunAccountId)
        useAnalysisStore.getState().adopt(resumed.accountId, resumed.jobId, companyName)
        setActiveAccountId(resumed.accountId)
        unsubscribeRef.current?.()
        unsubscribeRef.current = subscribeToAnalysisRun(resumed.accountId, qc)
        qc.invalidateQueries({ queryKey: accountKeys.detail(resumed.accountId) })
        // #3666.8 — même raison que le lancement neuf plus haut : la liste doit
        // refléter la reprise (statut « interrompue » → « en cours ») sans
        // rechargement manuel.
        if (session) qc.invalidateQueries({ queryKey: accountKeys.list(session.user.id) })
      } catch (err) {
        failWith(err)
      }
      return
    }
    const last = lastStartRef.current
    if (last) await startAnalysis(...last)
  }, [activeAccountId, bootstrapError, clear, failWith, qc, run, session, setBootstrapError, startAnalysis, t])

  // Release the screen as soon as the run is known complete, whichever path
  // established that — the Socket.IO `analysis:done` event OR the periodic
  // server state read. Guarded by a ref so the two paths can't navigate twice.
  const navigatedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeAccountId || run?.state !== 'completed') return
    if (navigatedRef.current === activeAccountId) return
    navigatedRef.current = activeAccountId
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    onCompleteRef.current?.(activeAccountId)
  }, [activeAccountId, run?.state])

  useEffect(() => {
    if (run?.state === 'error') {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [run?.state])

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [])

  return {
    status: bootstrapError ? ('error' as const) : (run?.state ?? ('idle' as const)),
    accountId: activeAccountId,
    jobId: run?.jobId ?? null,
    phase: run?.phase ?? '',
    // #3666 — l'étape MESURÉE, jamais le jalon de heartbeat (`percent`) du serveur.
    currentStep: run?.currentStep ?? null,
    error: bootstrapError ?? run?.error ?? null,
    softBraked,
    startAnalysis,
    retry,
    reset,
  }
}
