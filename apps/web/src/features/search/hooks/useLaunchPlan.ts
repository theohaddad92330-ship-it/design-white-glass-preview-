import { useQuery } from '@tanstack/react-query'
import type { AnalysisRunDepth, AnalysisScopeMode, PublicSourceId } from '@bellum/contracts'
import { useDebounce } from '@/hooks/useDebounce'
import { apiFetch } from '@/lib/api'

const DEBOUNCE_MS = 300

/**
 * #1583 — ce que « Lancer » ferait MAINTENANT, lu AVANT le clic. Le serveur
 * (`AnalysisService.planLaunch`) répond aussi `{ scenario: 'demo' }`, mais ce
 * hook n'a jamais à le lire : l'appelant coupe la requête en démo
 * (`useIsDemo()`) — le bandeau global le dit déjà, et le serveur n'a de toute
 * façon aucun cache de résultat à interroger dans cet espace.
 */
export type LaunchPlan =
  | { scenario: 'cache_hit'; accountId: string; companyName: string }
  | {
      scenario: 'fresh'
      credits: number
      /**
       * #3288 — les trois paliers de profondeur : prix (même fonction que le
       * débit), pages lues, durée MÉDIANE mesurée (`null` = non mesurée).
       * Optionnel : un serveur antérieur ne dit rien.
       */
      depths?: readonly { depth: AnalysisRunDepth; credits: number; pages: number; medianSeconds: number | null }[]
      /**
       * #2288.4 (c66) — BOAMP/DECP quand la gate de collecte les gardera à coup
       * sûr pour CE lancement (`AnalysisService.planLaunch`). Optionnel : une
       * réponse d'un serveur antérieur ne dit rien, et « rien » n'annonce rien.
       */
      publicTenderSources?: readonly PublicSourceId[]
      /**
       * #2292.17/.18 (épopée #2929) — ce nom résout un dossier DÉJÀ analysé,
       * hors de la fenêtre de cache (`AnalysisService.planLaunch`). Optionnel :
       * absent sur un serveur antérieur, et absent = nom jamais vu.
       */
      knownAccount?: { accountId: string; companyName: string }
      /**
       * Théo B r1-recherche.A12 — un run est DÉJÀ en vol sur ce nom (`AnalysisService.planLaunch`) : « Analyse déjà en
       * cours, lancée par {prénom} » se lit avant le clic. Optionnel : absent = rien en vol (ou serveur antérieur).
       */
      inFlight?: { accountId: string; companyName: string; startedBy?: { firstName: string } }
    }

export const launchPlanKeys = {
  all: ['launch-plan'] as const,
  plan: (
    companyName: string,
    siren: string | undefined,
    scopeMode: AnalysisScopeMode | undefined,
    relaunch?: boolean,
  ) =>
    // SIMON-FIX S.18 — un plan de RELANCE n'est pas le plan d'un premier lancement : autre clé de cache.
    relaunch
      ? (['launch-plan', companyName, siren ?? '', scopeMode ?? 'groupe', 'relaunch'] as const)
      : (['launch-plan', companyName, siren ?? '', scopeMode ?? 'groupe'] as const),
}

/**
 * La requête `GET /analysis/launch-plan`, écrite UNE fois (GA-26) : le lanceur
 * la lit pour UNE entreprise, un devis de lot (#2166.56) ou de vérification
 * (#2288.4) la lit pour chaque candidat présélectionné — même clé, même
 * chemin, donc même cache.
 */
export function launchPlanQueryOptions(
  companyName: string,
  siren?: string,
  scopeMode?: AnalysisScopeMode,
  relaunch?: boolean,
) {
  return {
    queryKey: launchPlanKeys.plan(companyName, siren, scopeMode, relaunch),
    queryFn: () => {
      const params = new URLSearchParams({ company_name: companyName })
      if (siren) params.set('siren', siren)
      // `groupe` (défaut serveur) → omis pour que la requête reste
      // byte-identique à celle d'aujourd'hui, comme `startAnalysis`.
      if (scopeMode && scopeMode !== 'groupe') params.set('scope_mode', scopeMode)
      // SIMON-FIX S.18 — « Actualiser » : le cache de résultat ne s'applique pas, l'aperçu le sait.
      if (relaunch) params.set('relaunch', 'true')
      return apiFetch<LaunchPlan>({ path: `/analysis/launch-plan?${params.toString()}` })
    },
  }
}

type UseLaunchPlanParams = {
  companyName: string
  siren?: string
  scopeMode?: AnalysisScopeMode
  /** SIMON-FIX S.18 — relance explicite (« Actualiser ») : le plan ne rend jamais `cache_hit`. */
  relaunch?: boolean
  /** Coupe la requête — démo (l'appelant sait déjà répondre), relance déjà
   *  explicite (le récap l'annonce déjà), champ encore vide. */
  enabled: boolean
  /** Seam de test — la production garde le défaut de 300 ms. */
  debounceMs?: number
}

/**
 * Lit `GET /analysis/launch-plan` (débounce comme `useCompanySearch`, même
 * durée) pour savoir si CE lancement rouvrirait un dossier récent (0 crédit)
 * ou en démarrerait un neuf (coût canonique) — jamais une seconde estimation
 * du prix : `LaunchPlanNote` retombe sur `estimateAnalysisCredits` tant que
 * la réponse n'est pas connue, exactement le comportement d'avant #1583.
 *
 * Échoue OUVERT : un réseau lent ou une erreur ne bloque jamais l'écran, `plan`
 * reste `null` et l'appelant affiche son estimation par défaut — comme
 * `findCompletedByUserAndCompany` échoue ouvert côté serveur (« un cache miss
 * n'est jamais pire qu'une analyse neuve »).
 */
export function useLaunchPlan({
  companyName,
  siren,
  scopeMode,
  relaunch,
  enabled,
  debounceMs = DEBOUNCE_MS,
}: UseLaunchPlanParams): { plan: LaunchPlan | null; loading: boolean } {
  const trimmed = companyName.trim()
  const [debouncedName] = useDebounce(trimmed, debounceMs)
  const active = enabled && debouncedName.length > 0 && debouncedName === trimmed

  const { data, isFetching } = useQuery<LaunchPlan>({
    ...launchPlanQueryOptions(debouncedName, siren, scopeMode, relaunch),
    enabled: active,
    staleTime: 30_000,
    retry: false,
    placeholderData: previous => previous,
  })

  return {
    plan: active ? (data ?? null) : null,
    loading: active && isFetching,
  }
}
