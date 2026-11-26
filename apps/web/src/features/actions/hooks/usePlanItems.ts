import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ActionExecutionStatus,
  ActionPlanItem,
  ActionPlanOutcome,
  CreatedPlanAction,
  CreatePlanAction,
  UpdateActionPlanItem,
} from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'
import { planItemsApi } from '@/features/actions/planItems.api'
import { myPlanActionsKey } from '@/features/actions/hooks/useMyPlanActions'
import { actionOsKeys } from '@/features/action-os/api'

export const planItemsKey = (accountId: string) => ['plan-items', accountId] as const

type UpdateVars = { id: string; patch: UpdateActionPlanItem }

/** #2123.46 — ce que le formulaire du plan saisit ; le compte vient du hook. */
type CreateVars = Pick<CreatePlanAction, 'label' | 'reason' | 'expected_outcome'> & { owner_name: string | null }

/** Snooze N days → the ISO timestamp the item resurfaces at (end of day). */
export function snoozeUntil(days: number, from: Date = new Date()): string {
  const until = new Date(from)
  until.setDate(until.getDate() + days)
  return until.toISOString()
}

/**
 * The persistent, per-item state of an account's action plan: `done` /
 * `due_date` plus the executable lifecycle (`execution_status` / `snoozed_until`
 * / `assigned_to`), seeded from the generated plan on first read and owned by the
 * user thereafter. Exposes optimistic mutators (`setDone` / `setDueDate` /
 * `markDone` / `snooze` / `assign`) that patch a single item and roll back on
 * failure. Disabled when logged out — the board then falls back
 * to local (non-persisted) checkbox state.
 */
export function usePlanItems(accountId: string) {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const enabled = !!user && !!accountId

  const query = useQuery({
    queryKey: planItemsKey(accountId),
    queryFn: () => planItemsApi.list(accountId),
    enabled,
    staleTime: 30_000,
  })

  const mutation = useMutation<ActionPlanItem, Error, UpdateVars, { previous?: ActionPlanItem[] }>({
    mutationFn: ({ id, patch }) => planItemsApi.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: planItemsKey(accountId) })
      const previous = queryClient.getQueryData<ActionPlanItem[]>(planItemsKey(accountId))
      if (previous) {
        queryClient.setQueryData<ActionPlanItem[]>(
          planItemsKey(accountId),
          previous.map(item => (item.id === id ? applyPatch(item, patch) : item)),
        )
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(planItemsKey(accountId), context.previous)
    },
    onSuccess: (updated, vars) => {
      // #2395.1 — une étape jamais actée est envoyée sous son id de POSITION
      // (`plan:…`) ; le serveur la matérialise et rend la vraie ligne. On remplace
      // donc aussi l'entrée dont l'id est celui ENVOYÉ, pas seulement celui rendu.
      queryClient.setQueryData<ActionPlanItem[]>(planItemsKey(accountId), current =>
        (current ?? []).map(item => (item.id === updated.id || item.id === vars.id ? updated : item)),
      )
    },
    onSettled: () => {
      // « Mes relances à faire » et « Mes priorités » LISENT ces mêmes items
      // (#1285). Sans cette invalidation, marquer une action faite depuis le
      // plan d'un compte la laissait affichée sur le tableau de bord jusqu'au
      // prochain rechargement — l'utilisateur croyait son geste perdu.
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'inactive' })
      // #2871 — la projection canonique (fiche compte ET `/actions`) lit la
      // MÊME ligne : préfixe commun, une seule invalidation pour les deux.
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.actions })
    },
  })

  /**
   * #2123.46 / #2123.47 — créer une action du plan, sur l'objet CANONIQUE.
   *
   * La ligne rendue par le serveur entre dans CE cache (le tableau l'affiche
   * sans relire) et la liste transversale de `/actions` est invalidée : c'est
   * la même ligne, jamais une copie. Une liste pas encore chargée n'est pas
   * fabriquée ici — elle est relue, sinon le semis paresseux du plan généré
   * serait masqué par une liste d'une seule ligne.
   */
  const createMutation = useMutation<CreatedPlanAction, Error, CreateVars>({
    mutationFn: input => planItemsApi.create({ account_id: accountId, target: null, ...input }),
    onSuccess: created => {
      rememberCreatedPlanAction(queryClient, created)
      announceCreatedPlanAction(created)
    },
    onError: () => toast.error(i18n.t('accounts:toast.actionAddError')),
  })

  const items = query.data ?? []
  const byKey = new Map<string, ActionPlanItem>()
  for (const item of items) byKey.set(positionKey(item.week_index, item.step_index), item)

  return {
    isEnabled: enabled,
    /** #2123.28 — la liste entière : une dépendance se lit par le libellé d'une AUTRE action. */
    items,
    /**
     * #1888 — « on ne sait pas encore », à distinguer de « rien n'est fait ».
     *
     * Tant que la requête est en vol, `itemFor` rend `undefined` pour tout le
     * monde, donc « aucune action faite » — ce qui est le zéro de chargement,
     * pas un vrai zéro. La phase à ouvrir se calcule sur cet état : sans ce
     * drapeau, le tableau ouvrirait la phase 1 sur un plan dont les deux
     * premières sont finies, puis la refermerait à l'arrivée des données.
     *
     * Requête désactivée (déconnecté, démo) ⇒ `false` : on ne sait pas parce
     * qu'on ne demandera rien, le repli local fait foi immédiatement.
     */
    isLoading: query.isLoading,
    itemFor: (weekIndex: number, stepIndex: number): ActionPlanItem | undefined =>
      byKey.get(positionKey(weekIndex, stepIndex)),
    create: (input: CreateVars): Promise<CreatedPlanAction> => createMutation.mutateAsync(input),
    setDone: (id: string, done: boolean) => mutation.mutate({ id, patch: { done } }),
    setDueDate: (id: string, dueDate: string | null) => mutation.mutate({ id, patch: { due_date: dueDate } }),
    // #2396.2 — `outcome` n'a de sens QUE pour une transition vers `done` ; le
    // serveur la refuse sinon (voir `ActionPlanItemsService.update`).
    // #3416.2b — `callbackDate` n'accompagne QUE l'issue « À rappeler » ; absent,
    // la clé n'est pas envoyée (aucune date inventée, aucune tâche créée).
    setStatus: (id: string, status: ActionExecutionStatus, outcome?: ActionPlanOutcome, callbackDate?: string) =>
      mutation.mutate({
        id,
        patch: { execution_status: status, outcome, ...(callbackDate ? { callback_date: callbackDate } : {}) },
      }),
    markDone: (id: string, outcome?: ActionPlanOutcome) =>
      mutation.mutate({ id, patch: { execution_status: 'done', outcome } }),
    snooze: (id: string, days: number) =>
      mutation.mutate({ id, patch: { execution_status: 'snoozed', snoozed_until: snoozeUntil(days) } }),
    // #4158.31 — déléguer à un autre membre exige `handoffNote` (le serveur refuse sinon).
    assign: (id: string, assignedTo: string | null, handoffNote?: string) =>
      mutation.mutate({
        id,
        patch: { assigned_to: assignedTo, ...(handoffNote ? { handoff_note: handoffNote } : {}) },
      }),
    // #2153.57 — le résultat, DÉCLARATIF : `null` l'efface, jamais une preuve d'envoi vérifiée.
    setResult: (id: string, result: string | null) => mutation.mutate({ id, patch: { result } }),
    // #3287 (#3265.2) — l'événement d'agenda réellement créé pour cette action.
    setExternalExecution: (id: string, externalId: string) =>
      mutation.mutate({ id, patch: { external_execution_id: externalId } }),
  }
}

/**
 * #2123.46 — ce que TOUTE écriture d'une action du plan fait du cache, à un
 * seul endroit (GA-26) : le formulaire du plan, la veille, la fiche contact, le
 * panneau besoin et l'ajout en masse passent par ici.
 *
 * La ligne entre dans le cache du plan de SON compte (le tableau l'affiche sans
 * relire) — une seule fois : une ligne déjà là (`added: false`, ou déjà en
 * cache) n'est pas ajoutée en double. Une liste pas encore chargée n'est pas
 * fabriquée : elle est relue, sinon le semis paresseux du plan généré serait
 * masqué par une liste d'une seule ligne. La liste transversale de `/actions`
 * et le tableau de bord sont invalidés : c'est la même ligne, jamais une copie.
 */
export function rememberCreatedPlanAction(queryClient: QueryClient, created: CreatedPlanAction): void {
  const { added: _added, ...item } = created
  const key = planItemsKey(item.account_id)
  const current = queryClient.getQueryData<ActionPlanItem[]>(key)
  if (!current) void queryClient.invalidateQueries({ queryKey: key })
  else if (!current.some(existing => existing.id === item.id)) queryClient.setQueryData(key, [...current, item])
  void queryClient.invalidateQueries({ queryKey: myPlanActionsKey })
  // #2871 — une ligne neuve a une identité canonique neuve (fiche compte, `/actions`).
  void queryClient.invalidateQueries({ queryKey: actionOsKeys.actions })
  void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'inactive' })
}

/**
 * #2123.46 — « ajoutée » n'est dit que si la ligne VIENT d'être écrite. Une
 * action déjà au plan le dit, sans faux succès. `added` absent (une API
 * antérieure) = le serveur ne sait pas le dire : l'appel a réussi, on annonce
 * l'ajout.
 */
export function announceCreatedPlanAction(created: CreatedPlanAction): void {
  if (created.added === false) toast.info(i18n.t('accounts:toast.actionAlreadyInPlan'))
  else toast.success(i18n.t('accounts:toast.actionAdded'))
}

function positionKey(weekIndex: number, stepIndex: number): string {
  return `${weekIndex}-${stepIndex}`
}

export function applyPatch(item: ActionPlanItem, patch: UpdateActionPlanItem): ActionPlanItem {
  const next: ActionPlanItem = { ...item }
  if (patch.done !== undefined) {
    next.done = patch.done
    next.execution_status = patch.done ? 'done' : 'todo'
    next.completed_at = patch.done ? new Date().toISOString() : null
  }
  if (patch.due_date !== undefined) next.due_date = patch.due_date
  // #3287 — écrit UNE fois : un identifiant déjà posé reste.
  if (patch.external_execution_id !== undefined && !item.external_execution_id)
    next.external_execution_id = patch.external_execution_id
  if (patch.execution_status !== undefined) {
    next.execution_status = patch.execution_status
    next.done = patch.execution_status === 'done'
    next.completed_at = patch.execution_status === 'done' ? new Date().toISOString() : null
    if (patch.execution_status !== 'snoozed') next.snoozed_until = null
    // #2396.1/.2 — même règle que côté serveur : l'issue et le mode ne se posent
    // qu'à l'ENTRÉE dans « fait », jamais sur un re-patch d'une ligne déjà faite.
    if (patch.execution_status === 'done' && item.execution_status !== 'done' && patch.outcome) {
      next.outcome = patch.outcome
      next.completion_mode = 'manual'
    }
  }
  if (patch.snoozed_until !== undefined) next.snoozed_until = patch.snoozed_until
  if (patch.assigned_to !== undefined) {
    next.assigned_to = patch.assigned_to
    // #4158.31 — la note suit la délégation ; libérer l'action l'efface.
    next.handoff_note = patch.assigned_to ? (patch.handoff_note ?? item.handoff_note ?? null) : null
  }
  if (patch.result !== undefined) next.result = patch.result
  return next
}
