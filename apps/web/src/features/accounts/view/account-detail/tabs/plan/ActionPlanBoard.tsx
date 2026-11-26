import type { ActionPlanItem } from '@bellum/contracts'
import { blockedByDependency, MANUAL_ACTION_WEEK_INDEX, NEXT_ACTIONS_MAX, nextActions } from '@bellum/contracts'
import { Badge, Button, Card, CardContent, EmptyState, Progress, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { ClipboardCheck, ListChecks } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dossierItemAnchorId } from '../../search/dossierSearch'
import { revealTarget } from '@/lib/reveal-target'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PlanActionItem } from '../../components/PlanActionItem'
import type { PlanAction, PlanWeek } from '../../helpers/plan'
import { cardFade } from '../../motion'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'
import { firstUnfinishedPhaseIndex } from './planPhases'
import { useTrackAction } from '@/features/actions/hooks/useTrackAction'
import { trackActionStarted } from '@/lib/product-tracker'
import { usePlanItems } from '@/features/actions/hooks/usePlanItems'
import { useAccountCanonicalActions } from '@/features/action-os/hooks/useAccountCanonicalActions'
import { ActionExecuteMenu } from '@/features/actions/components/ActionExecuteMenu'
import { HandoffNoteDialog } from '@/features/actions/components/HandoffNoteDialog'
import { useWorkspaceMembers, type WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { useCrmStatus } from '@/features/crm/hooks/useCrmStatus'
import { AddToCalendarButton } from '@/features/google/components/AddToCalendarButton'
import { OutlookScheduleButton } from '@/features/microsoft/components/OutlookScheduleButton'
import { AddPlanActionForm } from './AddPlanActionForm'
import type { PlanAbsence } from './planAbsence'
import { PlayFeedbackButtons } from './PlayFeedbackButtons'
import { PlanItemFacts } from './PlanItemFacts'
import { verificationFirst } from './planItemFactsData'
import { canonicalIdsOf, type CanonicalIds } from './planCanonicalIds'

/**
 * #2130.60 / #2130.61 — le motif de route littéral, jamais dérivé d'un
 * `accountId` (même convention que `TabPartners.tsx`, GA-276).
 */
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'

/**
 * L'état vide du tableau, par CAUSE — quatre copies, jamais une seule.
 *
 * Écrire « crée une première action » à quelqu'un dont la phase 4 vient de
 * dépasser son budget lui demande de faire le travail que le moteur n'a pas
 * su faire. Les clés vivent dans `accountDetail.plan.*` (FR + EN).
 */
const ABSENCE_COPY: Readonly<Record<PlanAbsence, { title: string; description: string }>> = {
  'analysis-running': { title: 'plan.absentRunningTitle', description: 'plan.absentRunningDescription' },
  'analysis-incomplete': { title: 'plan.absentIncompleteTitle', description: 'plan.absentIncompleteDescription' },
  'not-analyzed': { title: 'plan.absentNotAnalyzedTitle', description: 'plan.absentNotAnalyzedDescription' },
  // La copie d'origine, INCHANGÉE — elle était juste pour ce cas-là, et pour
  // lui seul : l'analyse a abouti, le plan ne porte rien, écrire une action est
  // effectivement le geste utile.
  'no-actions': { title: 'plan.emptyTitle', description: 'plan.emptyDescription' },
}

/**
 * #2123.46 — une ligne `action_plan_items` MANUELLE, lue comme le `PlanAction`
 * que la ligne de plan sait afficher. Le responsable est celui SAISI
 * (`owner_name`), jamais une délégation ; aucune échéance relative n'est
 * inventée — la date réelle passe par `dueDate`.
 */
function manualItemAsPlanAction(item: ActionPlanItem): PlanAction {
  return {
    text: item.label,
    responsable: item.owner_name ?? undefined,
    outil: 'manuel',
    // #2123.46 — ce que la veille et le panneau besoin écrivent sur la ligne ;
    // la carte les montrait depuis le blob, elle les montre depuis la ligne.
    expectedOutcome: item.expected_outcome ?? undefined,
    kpi: item.kpi ?? undefined,
  }
}

/** #2123.46 — la bande de position des actions saisies à la main (MCP, formulaire du plan). */
function isManualItem(item: ActionPlanItem): boolean {
  return item.week_index >= MANUAL_ACTION_WEEK_INDEX
}

/** Bellum account URL appended to a calendar event so it points back at the folder. */
function accountLink(accountId: string): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/accounts/${accountId}`
}

type UserAction = PlanAction & {
  id: string
}

type PlanItems = ReturnType<typeof usePlanItems>

export function ActionPlanBoard({
  accountId,
  persistedActions = [],
  weeks,
  planGeneratedAt = null,
  absence = 'no-actions',
  highlightActionId = null,
}: {
  accountId: string
  /**
   * Les actions de l'utilisateur DÉJÀ enregistrées (`raw_analysis.user_plan_actions`),
   * quelle que soit leur origine — la veille, la fiche contact, le panneau besoin,
   * ou le formulaire ci-dessous.
   *
   * Elle s'appelait `signalActions`, et ce nom a coûté cher : il laissait croire
   * que seule la veille alimentait cette liste, si bien que personne n'a vu que
   * le formulaire du plan, lui, n'y écrivait jamais.
   *
   * #2123.46 / #2123.47 — ce blob n'est plus qu'une LECTURE DE REPLI : il porte
   * l'historique saisi avant l'objet canonique, et on ne supprime pas ce qu'un
   * commercial a écrit. Le formulaire ci-dessous n'y écrit plus — il crée une
   * ligne `action_plan_items` (`usePlanItems().create`), celle que `/actions`
   * liste aussi.
   */
  persistedActions?: PlanAction[]
  weeks: PlanWeek[]
  /**
   * La date qui a PRODUIT le plan (`accounts.last_analyzed_at`).
   *
   * Les échéances du pipeline sont RELATIVES (`J+1`, `S+5`, `M+3S+2`) : sans
   * cette base, « J+10 » est un horizon, pas une date. Le passer permet de
   * proposer une vraie date d'agenda ; l'omettre laisse l'horizon en clair —
   * jamais une date inventée.
   */
  planGeneratedAt?: string | null
  /**
   * POURQUOI le plan est vide, quand il l'est — calculé par {@link planAbsence}.
   *
   * Le tableau ne le devine pas : il ne voit que ses actions, et « zéro action »
   * a quatre causes qui appellent quatre gestes différents. Par défaut
   * `'no-actions'`, la copie d'origine — un appelant qui ne le passe pas obtient
   * exactement l'écran d'avant.
   */
  absence?: PlanAbsence
  /**
   * #2107.32 — l'action que le lien d'ARRIVÉE désigne (`item=action:<id>` de
   * l'URL, posé par ex. par « Voir dans le plan » depuis la Veille). Une fois
   * la ligne trouvée dans les actions saisies à la main, elle est amenée à
   * l'écran et reçoit le focus — une seule fois, jamais à chaque frappe sur
   * une case à cocher ailleurs dans le tableau.
   */
  highlightActionId?: string | null
}) {
  const { t } = useTranslation('accountDetail')
  const trackAction = useTrackAction()
  const plan = usePlanItems(accountId)
  // #2871 (#2395.1/.5/.11) — le plan du compte au CONTRAT CANONIQUE : chaque
  // ligne porte l'identité que la projection lui donne (`plan_item:<id>` pour
  // une étape actée, `generated_plan:<…>` pour une étape proposée). Les gestes
  // restent dans la maison native (`usePlanItems`) ; le rendu ne change pas.
  const canonical = useAccountCanonicalActions(accountId)
  const canonicalIds = useMemo(
    () => canonicalIdsOf(canonical.data?.actions, plan.items ?? []),
    [canonical.data, plan.items],
  )
  const members = useWorkspaceMembers().data ?? []
  const crmConnected = !!useCrmStatus().data?.connected
  const generatedActions = useMemo(() => flattenPlanWeeks(weeks), [weeks])
  // Local checkbox state — the fallback for generated items in demo mode / while
  // the server list is still loading.
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set())
  // Les actions saisies à l'instant, le temps que le serveur réponde. Elles
  // sortent de cette liste dès que `persistedActions` les porte (voir
  // `addAction`), sinon elles s'afficheraient deux fois. Une saisie que le
  // serveur REFUSE y reste : le toast d'erreur a parlé, on ne fait pas
  // disparaître le texte que quelqu'un vient d'écrire.
  const [pendingActions, setPendingActions] = useState<UserAction[]>([])
  const savedActions = persistedActions.map((action, index) => ({ ...action, id: `saved-${index}` }))
  const allUserActions = [...savedActions, ...pendingActions]
  // #2123.46 — les actions saisies à la main, lues sur l'objet CANONIQUE.
  const manualItems = (plan.items ?? []).filter(isManualItem)

  // #2107.32 — amène et focalise la ligne visée, UNE FOIS qu'elle est dans le
  // DOM. `plan.items` arrive par le réseau : au premier rendu la ligne n'y
  // est souvent pas encore, `revealTarget` échoue simplement (elle rend
  // `false` sans rien casser) et cet effet réessaie au rendu suivant, quand
  // `manualItems` porte la ligne. Le drapeau empêche de réamener la ligne à
  // chaque frappe sur une case à cocher ailleurs dans le tableau, une fois
  // le premier geste réussi.
  const revealed = useRef(false)
  useEffect(() => {
    if (!highlightActionId || revealed.current) return
    if (!manualItems.some(item => item.id === highlightActionId)) return
    revealed.current = revealTarget(dossierItemAnchorId({ kind: 'action', id: highlightActionId }))
  }, [highlightActionId, manualItems])

  const toggleLocal = (id: string, isCompleted: boolean) => {
    setCompleted(current => {
      const next = new Set(current)
      if (isCompleted) next.add(id)
      else next.delete(id)
      return next
    })
  }

  // Generated item state resolves to the persisted row when we have one, else to
  // the local set (keeps demo / logged-out interactivity working).
  const isGeneratedDone = (weekIndex: number, stepIndex: number, localId: string): boolean => {
    const item = plan.itemFor(weekIndex, stepIndex)
    return item ? item.done : completed.has(localId)
  }

  const generatedDone = weeks.reduce(
    (sum, week, weekIndex) =>
      sum +
      week.items.reduce(
        (inner, _item, stepIndex) =>
          inner + (isGeneratedDone(weekIndex, stepIndex, actionId(week.week, stepIndex)) ? 1 : 0),
        0,
      ),
    0,
  )
  // #1888 — la phase OUVERTE est celle qui appelle une action : la première qui
  // n'est pas finie. Le choix se lit sur l'état RÉEL (`ActionPlanItem.done`,
  // sinon la case cochée localement), jamais sur un rang — voir `planPhases.ts`.
  // ⚠️ Tant que `usePlanItems` est en vol, personne n'est « fait » : on ne se
  // prononce pas (`null`), sinon la phase 1 s'ouvrirait puis se refermerait.
  const activePhase = plan.isLoading
    ? null
    : firstUnfinishedPhaseIndex(weeks, (weekIndex, stepIndex) =>
        isGeneratedDone(weekIndex, stepIndex, actionId(weeks[weekIndex].week, stepIndex)),
      )
  // Le geste de l'utilisateur gagne, phase par phase et pour la durée de la
  // visite : replier ce que l'avancement ouvre, ou l'inverse. Rien n'est
  // persisté — au prochain montage, l'avancement reprend la main (c'est
  // l'invariant de `CollapsedSection`, jamais restauré ouvert).
  const [phaseOverrides, setPhaseOverrides] = useState<ReadonlyMap<number, boolean>>(() => new Map())
  const isPhaseOpen = (index: number): boolean => phaseOverrides.get(index) ?? index === activePhase
  const setPhaseOpen = (index: number, open: boolean) => setPhaseOverrides(current => new Map(current).set(index, open))

  const userDone =
    allUserActions.filter(action => completed.has(action.id)).length + manualItems.filter(item => item.done).length
  const total = generatedActions.length + allUserActions.length + manualItems.length
  const doneTotal = generatedDone + userDone
  const completion = total > 0 ? Math.round((doneTotal / total) * 100) : 0

  const setUserCompleted = (id: string, isCompleted: boolean) => {
    toggleLocal(id, isCompleted)
    trackPlanCompletion(trackAction.mutate, accountId, id, isCompleted)
  }

  const addAction = (action: PlanAction, objective: string, expectedOutcome: string) => {
    const id = crypto.randomUUID()
    setPendingActions(current => [...current, { ...action, id }])
    trackPlanAddition(trackAction.mutate, accountId, id, action)
    // #2130.60 — anonyme, par écran — distinct de `trackPlanAddition` ci-dessus.
    trackActionStarted('plan_action_created', ACCOUNT_DETAIL_SCREEN)
    // #2123.46 / #2123.47 — UNE écriture, sur l'objet canonique : la ligne
    // `action_plan_items` que `/actions` liste aussi. Plus rien ne part dans
    // `raw_analysis.user_plan_actions` depuis ce formulaire.
    void plan
      .create({
        label: action.text,
        owner_name: action.responsable ?? null,
        reason: objective,
        expected_outcome: expectedOutcome,
      })
      // La ligne est dans le cache de `usePlanItems` : la copie optimiste part.
      .then(() => setPendingActions(current => current.filter(pending => pending.id !== id)))
      .catch(() => undefined)
  }

  return (
    <motion.div variants={cardFade} className="p-1">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <ActionBoardHeader
          total={total}
          completed={doneTotal}
          completion={completion}
          manualTotal={allUserActions.length + manualItems.length}
          manualDone={userDone}
        />
        <CardContent className="p-0">
          {total > 0 ? (
            <>
              <GeneratedActionSections
                accountId={accountId}
                canonicalIds={canonicalIds}
                track={trackAction.mutate}
                weeks={weeks}
                plan={plan}
                members={members}
                crmConnected={crmConnected}
                localCompleted={completed}
                onLocalToggle={toggleLocal}
                planGeneratedAt={planGeneratedAt}
                isPhaseOpen={isPhaseOpen}
                onPhaseOpenChange={setPhaseOpen}
              />
              <UserActionSection
                accountId={accountId}
                canonicalIds={canonicalIds}
                actions={allUserActions}
                manualItems={manualItems}
                plan={plan}
                members={members}
                crmConnected={crmConnected}
                completed={completed}
                track={trackAction.mutate}
                onCompletedChange={setUserCompleted}
                planGeneratedAt={planGeneratedAt}
                highlightActionId={highlightActionId}
              />
            </>
          ) : (
            <EmptyState
              size="md"
              align="start"
              icon={<ClipboardCheck className="size-8" />}
              title={t(ABSENCE_COPY[absence].title)}
              description={t(ABSENCE_COPY[absence].description)}
              className="border-b border-[var(--bellum-border)] px-5 py-16 min-h-60"
            />
          )}
          <AddPlanActionForm onAdd={addAction} />
        </CardContent>
      </Card>
    </motion.div>
  )
}

function ActionBoardHeader({
  total,
  completed,
  completion,
  manualTotal,
  manualDone,
}: {
  total: number
  completed: number
  completion: number
  manualTotal: number
  manualDone: number
}) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--bellum-border)] px-5 py-4">
      <div>
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-[var(--bellum-text-accent)]" />
          <Text element="h3" size="base" weight="semibold">
            {t('plan.boardTitle')}
          </Text>
        </div>
        {/* #3670 (R2 07/10) — un plan sans action ne compte pas « 0 actions » ni « 0/0 » : une valeur
            absente ne s'affiche jamais 0 (GA-18/19) ; l'état vide dessous dit pourquoi. */}
        {total > 0 ? (
          <Text size="sm" element="p" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('plan.boardSubtitle', { count: total })}
          </Text>
        ) : null}
      </div>
      {total > 0 ? (
        <div className="flex min-w-52 py-2 flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-[var(--bellum-text-secondary)]">
            <div className="flex items-center gap-2">
              <Text size="xs">{t('plan.progress')}</Text>
            </div>
            <Text size="xs" weight="medium">
              {completed}/{total}
            </Text>
          </div>
          <Progress value={completion} variant={completion === 100 ? 'success' : 'default'} size="sm" neutralTrack />
          {/* #3938.1 — la part saisie à la main est NOMMÉE dans le compteur (SKAIZen : « surtout quand
              les actions ont été faites hors plan »). Absente = rien (jamais « 0 », GA-18/19). */}
          {manualTotal > 0 ? (
            <Text size="xs" data-testid="plan-manual-progress" className="text-[var(--bellum-text-secondary)]">
              {t('plan.progressManual', { count: manualTotal, done: manualDone })}
            </Text>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function GeneratedActionSections({
  accountId,
  canonicalIds,
  track,
  weeks,
  plan,
  members,
  crmConnected,
  localCompleted,
  onLocalToggle,
  planGeneratedAt,
  isPhaseOpen,
  onPhaseOpenChange,
}: {
  accountId: string
  canonicalIds: CanonicalIds
  track: TrackPlanAction
  weeks: PlanWeek[]
  plan: PlanItems
  members: WorkspaceMember[]
  crmConnected: boolean
  localCompleted: ReadonlySet<string>
  onLocalToggle: (id: string, completed: boolean) => void
  planGeneratedAt: string | null
  /** #1888 — `true` pour la phase qui appelle une action, ou celle que l'utilisateur a ouverte. */
  isPhaseOpen: (weekIndex: number) => boolean
  onPhaseOpenChange: (weekIndex: number, open: boolean) => void
}) {
  const { t } = useTranslation('accountDetail')
  return weeks.map((week, weekIndex) => (
    /* #1888 — une phase est un disclosure, et c'est le PATRON PARTAGÉ
       (`CollapsedSection`, GA-26) : même bouton, même `aria-expanded`, même
       mouvement `MOTION.expand`, même cible tactile de 44 px que le tableau de
       bord et la vue d'ensemble. Mode CONTRÔLÉ parce que l'ouverture ne dépend
       pas que du clic : elle suit l'avancement du plan.

       ⚠️ Repliée, la phase garde tout ce qui QUALIFIE ses chiffres — son
       numéro, son intitulé, son objectif et son nombre d'actions. Le compteur
       d'ensemble du tableau, lui, compte les actions qui EXISTENT et non celles
       qui sont dépliées : un repli ne peut pas le faire mentir. */
    <CollapsedSection
      key={`${week.week}-${week.title}`}
      title={`${t('plan.phase', { number: week.week })} · ${week.title}`}
      description={week.objective}
      badge={<Badge variant="outline">{t('plan.actionCount', { count: week.items.length })}</Badge>}
      open={isPhaseOpen(weekIndex)}
      onOpenChange={next => onPhaseOpenChange(weekIndex, next)}
      className="mx-2 my-2 bg-[var(--bellum-bg)]"
    >
      {/* Les lignes portent déjà leur propre gouttière (`mx-2 my-2` de
          `PlanActionItem`) : on annule celle du disclosure pour ne pas les
          empiler et rendre la liste étroite. */}
      <div className="-mx-4 -my-2">
        {/* #2123.35 — ce qu'il faut vérifier passe devant. L'index reste celui
            du PLAN : l'état persisté se superpose par (phase, rang), et un rang
            recalculé ferait changer de ligne une case cochée. */}
        {verificationFirst(
          week.items.map((item, index) => ({ item, index, persisted: plan.itemFor(weekIndex, index) })),
          row => row.persisted,
        ).map(({ item, index, persisted }) => {
          const localId = actionId(week.week, index)
          const done = persisted ? persisted.done : localCompleted.has(localId)
          // #2317.9 — une action conditionnelle gèle sa case tant que sa
          // dépendance n'est pas faite. Non applicable à une ligne pas encore
          // persistée : sans id, aucune dépendance ne peut la viser.
          const blocked = persisted ? blockedByDependency(persisted, plan.items ?? []) : null
          // #4158.48 — la ligne d'un collègue se lit, elle ne s'écrit pas.
          const readOnly = persisted?.can_edit === false
          return (
            <PlanActionItem
              key={localId}
              canonicalActionId={canonicalIds.forStep(weekIndex, index)}
              item={item}
              completed={done}
              disabled={!!blocked || readOnly}
              disabledReason={
                readOnly
                  ? t('plan.readOnlyColleague')
                  : blocked
                    ? t('plan.blockedByDependency', { label: blocked.label })
                    : undefined
              }
              dueDate={persisted ? persisted.due_date : undefined}
              deadlineBase={planGeneratedAt}
              // #2715.1 — lu sur la ligne persistée, jamais deviné sur une
              // action pas encore matérialisée.
              sendStatus={persisted ? persisted.send_status : null}
              onOpen={() => trackPlanOpened(track, accountId, localId, item)}
              onCompletedChange={next => {
                if (persisted) plan.setDone(persisted.id, next)
                else onLocalToggle(localId, next)
                trackPlanCompletion(track, accountId, localId, next)
                // #1931.19 — COCHER N'EST PAS CONTACTER : cette case ne prouve
                // aucun geste réel vers le contact, seulement que quelqu'un l'a
                // dit fait. Sans ce message, une tâche « Appeler Jean » cochée à
                // la main se lit comme une preuve d'appel — Laura ne le sait pas
                // plus que l'écran ne le montre.
                if (next) toast.info(t('plan.taskCheckedNoOutreach'))
              }}
              onDueDateChange={persisted && !readOnly ? date => plan.setDueDate(persisted.id, date) : undefined}
              // #2123.1 / .21-.33 — l'objet visé, le contact, la dépendance, la
              // source, la confiance, le coût et le statut, LUS sur la ligne
              // persistée. Une ligne non persistée n'en invente aucun.
              details={
                persisted ? (
                  <PlanItemFacts
                    item={persisted}
                    items={plan.items}
                    onSetResult={readOnly ? undefined : value => plan.setResult(persisted.id, value)}
                  />
                ) : null
              }
              trailing={
                <>
                  {/* Feedback loop A2 : pouce/signaler → mémoire du compte. */}
                  <PlayFeedbackButtons accountId={accountId} targetRef={item.text} />
                  <AddToCalendarButton
                    summary={item.text}
                    description={item.expectedOutcome ?? undefined}
                    dueDate={persisted ? persisted.due_date : (item.deadline ?? null)}
                    dueDateBase={planGeneratedAt}
                    link={accountLink(accountId)}
                    onCreated={persisted ? id => plan.setExternalExecution(persisted.id, id) : undefined}
                  />
                  <OutlookScheduleButton
                    summary={item.text}
                    description={item.expectedOutcome ?? undefined}
                    dueDate={persisted ? persisted.due_date : (item.deadline ?? null)}
                    dueDateBase={planGeneratedAt}
                    onCreated={persisted ? id => plan.setExternalExecution(persisted.id, id) : undefined}
                  />
                  {persisted ? (
                    <PersistedActionMenu
                      persisted={persisted}
                      plan={plan}
                      members={members}
                      crmConnected={crmConnected}
                      copyText={item.text}
                    />
                  ) : (
                    <ActionExecuteMenu copyText={item.text} lifecycleHint={t('plan.trackingWhenConnected')} />
                  )}
                </>
              }
            />
          )
        })}
      </div>
    </CollapsedSection>
  ))
}

/** Le menu d'exécution d'une ligne PERSISTÉE — plan généré ou saisie manuelle, même geste. */
function PersistedActionMenu({
  persisted,
  plan,
  members,
  crmConnected,
  copyText,
}: {
  persisted: ActionPlanItem
  plan: PlanItems
  members: WorkspaceMember[]
  crmConnected: boolean
  copyText: string
}) {
  const { t } = useTranslation('accountDetail')
  // #2317.9 — une action conditionnelle n'est pas exécutable tant que sa
  // dépendance n'est pas faite : le geste « marquer fait » se gèle, la ligne
  // reste visible et sa dépendance nommée (`PlanItemFacts`).
  const blocked = blockedByDependency(persisted, plan.items ?? [])
  // #2317.12 — une action OBSOLÈTE n'est plus exécutable non plus : elle est
  // MARQUÉE (jamais supprimée), pas un fait qu'on peut encore déclarer.
  const isObsolete = persisted.execution_status === 'obsolete'
  // #4158.31 — déléguer à un COLLÈGUE passe par une note de contexte ; s'attribuer l'action n'en demande pas.
  const [delegateTo, setDelegateTo] = useState<WorkspaceMember | null>(null)
  return (
    <>
      <HandoffNoteDialog
        open={delegateTo !== null}
        assigneeName={delegateTo?.fullName ?? delegateTo?.email ?? ''}
        onCancel={() => setDelegateTo(null)}
        onConfirm={note => {
          if (delegateTo) plan.assign(persisted.id, delegateTo.userId, note)
          setDelegateTo(null)
        }}
      />
      <ActionExecuteMenu
        status={persisted.execution_status}
        // #2396.2/.5/.6 — la complétion manuelle exige l'issue choisie ; le
        // sous-menu la propose déjà adaptée au type d'action visée.
        onMarkDone={
          blocked || isObsolete
            ? undefined
            : (outcome, extra) => plan.setStatus(persisted.id, 'done', outcome, extra?.callbackDate)
        }
        onUndoDone={() => plan.setStatus(persisted.id, 'todo')}
        targetKind={persisted.target?.kind ?? null}
        lifecycleHint={
          blocked
            ? t('plan.blockedByDependency', { label: blocked.label })
            : isObsolete
              ? t('plan.facts.status.obsolete')
              : undefined
        }
        // #2123.37 — « Préparée » : le geste est prêt, pas encore fait. Pas
        // gelé par la dépendance : préparer n'est pas déclarer fait.
        onMarkPrepared={
          isObsolete
            ? undefined
            : () => plan.setStatus(persisted.id, persisted.execution_status === 'prepared' ? 'todo' : 'prepared')
        }
        // #2317.12 — bascule : re-cliqué sur une action déjà obsolète, la remet
        // « à faire » (« proposer de les annuler ou modifier », jamais figée).
        onMarkObsolete={() =>
          plan.setStatus(persisted.id, persisted.execution_status === 'obsolete' ? 'todo' : 'obsolete')
        }
        onSnooze={days => plan.snooze(persisted.id, days)}
        onAssign={userId => {
          const member = members.find(candidate => candidate.userId === userId)
          if (member && !member.isSelf && userId !== persisted.assigned_to) setDelegateTo(member)
          else plan.assign(persisted.id, userId)
        }}
        members={members}
        assignedTo={persisted.assigned_to}
        copyText={copyText}
        crm={{
          // A plan action targets an account, not a single contact —
          // the CRM export path is contact-based, so it stays disabled
          // here with an honest reason (never faked).
          onExport: () => {},
          connected: false,
          disabledReason: crmConnected ? t('plan.noContactLinked') : t('plan.crmNotConnected'),
        }}
      />
    </>
  )
}

function UserActionSection({
  accountId,
  canonicalIds,
  actions,
  manualItems,
  plan,
  members,
  crmConnected,
  completed,
  track,
  onCompletedChange,
  planGeneratedAt,
  highlightActionId,
}: {
  accountId: string
  canonicalIds: CanonicalIds
  actions: UserAction[]
  /** #2123.46 — les lignes `action_plan_items` saisies à la main (objet canonique). */
  manualItems: ActionPlanItem[]
  plan: PlanItems
  members: WorkspaceMember[]
  crmConnected: boolean
  completed: ReadonlySet<string>
  track: TrackPlanAction
  onCompletedChange: (id: string, completed: boolean) => void
  planGeneratedAt: string | null
  /** #2107.32 — la ligne que `ActionPlanBoard` amène à l'écran, par son id. */
  highlightActionId?: string | null
}) {
  const { t } = useTranslation('accountDetail')
  // #2317.6 / #2317.7 — une petite équipe ne reçoit pas quinze actions : au-delà
  // de NEXT_ACTIONS_MAX lignes saisies à la main, seule la tête PRIORISÉE
  // (`nextActions` — ce qu'il faut vérifier passe devant, GA-26) s'affiche par
  // défaut. Un bouton révèle le reste ; rien n'est caché pour toujours.
  // Le hook précède le retour anticipé ci-dessous (règle des Hooks).
  const [showAll, setShowAll] = useState(false)
  const count = actions.length + manualItems.length
  if (count === 0) return null

  const visibleManualItems = showAll || manualItems.length <= NEXT_ACTIONS_MAX ? manualItems : nextActions(manualItems)
  const hiddenCount = manualItems.length - visibleManualItems.length

  return (
    <section className="border-b border-[var(--bellum-border)]">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <Text size="sm" weight="semibold">
            {t('plan.addedTitle')}
          </Text>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('plan.addedSubtitle')}
          </Text>
        </div>
        <Badge variant="primary">{t('plan.actionCount', { count })}</Badge>
      </div>
      <div className="border-t border-[var(--bellum-border)]">
        {visibleManualItems.map(persisted => {
          const item = manualItemAsPlanAction(persisted)
          // #2317.9 — même gel que les actions générées.
          const blocked = blockedByDependency(persisted, plan.items ?? [])
          // #4158.48 — idem : en lecture pour qui n'a pas le droit d'écrire.
          const readOnly = persisted.can_edit === false
          return (
            <PlanActionItem
              key={persisted.id}
              canonicalActionId={canonicalIds.forItem(persisted.id)}
              item={item}
              completed={persisted.done}
              disabled={!!blocked || readOnly}
              disabledReason={
                readOnly
                  ? t('plan.readOnlyColleague')
                  : blocked
                    ? t('plan.blockedByDependency', { label: blocked.label })
                    : undefined
              }
              dueDate={persisted.due_date}
              deadlineBase={planGeneratedAt}
              // #2715.1 — les lignes manuelles portent aussi un contact visé.
              sendStatus={persisted.send_status}
              // #2107.32 — seule la ligne visée porte une destination.
              anchorId={
                persisted.id === highlightActionId
                  ? dossierItemAnchorId({ kind: 'action', id: persisted.id })
                  : undefined
              }
              onOpen={() => trackPlanOpened(track, accountId, persisted.id, item)}
              onCompletedChange={next => {
                // #2123.46 — cochée sur la LIGNE : `/actions` voit le même état.
                plan.setDone(persisted.id, next)
                trackPlanCompletion(track, accountId, persisted.id, next)
                // #1931.19 — même garantie que les deux autres chemins de case à
                // cocher de cet écran : une ligne manuelle PERSISTÉE cochée ne
                // prouve pas plus un contact réel que les deux autres.
                if (next) toast.info(t('plan.taskCheckedNoOutreach'))
              }}
              onDueDateChange={readOnly ? undefined : date => plan.setDueDate(persisted.id, date)}
              details={
                <PlanItemFacts
                  item={persisted}
                  items={plan.items}
                  onSetResult={readOnly ? undefined : value => plan.setResult(persisted.id, value)}
                />
              }
              trailing={
                <>
                  <AddToCalendarButton
                    summary={item.text}
                    dueDate={persisted.due_date}
                    dueDateBase={planGeneratedAt}
                    link={accountLink(accountId)}
                  />
                  <OutlookScheduleButton
                    summary={item.text}
                    dueDate={persisted.due_date}
                    dueDateBase={planGeneratedAt}
                  />
                  <PersistedActionMenu
                    persisted={persisted}
                    plan={plan}
                    members={members}
                    crmConnected={crmConnected}
                    copyText={item.text}
                  />
                </>
              }
            />
          )
        })}
        {hiddenCount > 0 && (
          <div className="px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              {t('plan.showMoreActions', { count: manualItems.length })}
            </Button>
          </div>
        )}
        {showAll && manualItems.length > NEXT_ACTIONS_MAX && (
          <div className="px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => setShowAll(false)}>
              {t('plan.showFewerActions', { count: NEXT_ACTIONS_MAX })}
            </Button>
          </div>
        )}
        {actions.map(action => (
          <PlanActionItem
            key={action.id}
            item={action}
            completed={completed.has(action.id)}
            deadlineBase={planGeneratedAt}
            onOpen={() => trackPlanOpened(track, accountId, action.id, action)}
            onCompletedChange={next => {
              onCompletedChange(action.id, next)
              // #1931.19 — même garantie que sur les actions générées par
              // l'analyse : cocher une action ajoutée à la main ne prouve pas
              // plus un contact réel.
              if (next) toast.info(t('plan.taskCheckedNoOutreach'))
            }}
            trailing={
              <>
                <AddToCalendarButton
                  summary={action.text}
                  description={action.expectedOutcome ?? undefined}
                  dueDate={action.deadline ?? null}
                  dueDateBase={planGeneratedAt}
                  link={accountLink(accountId)}
                />
                <OutlookScheduleButton
                  summary={action.text}
                  description={action.expectedOutcome ?? undefined}
                  dueDate={action.deadline ?? null}
                  dueDateBase={planGeneratedAt}
                />
                <ActionExecuteMenu copyText={action.text} lifecycleHint={t('plan.notTracked')} />
              </>
            }
          />
        ))}
      </div>
    </section>
  )
}

function flattenPlanWeeks(weeks: PlanWeek[]) {
  return weeks.flatMap(week => week.items.map((item, itemIndex) => ({ ...item, id: actionId(week.week, itemIndex) })))
}

function actionId(week: number, index: number) {
  return `generated-${week}-${index}`
}

type TrackPlanAction = ReturnType<typeof useTrackAction>['mutate']

function trackPlanOpened(track: TrackPlanAction, accountId: string, actionIdValue: string, action: PlanAction) {
  track({
    action_type: 'plan_action_opened',
    account_id: accountId,
    channel: channelFromTool(action.outil),
    metadata: actionMetadata(actionIdValue, action, 'Action consultée', 'Plan d’action'),
  })
}

function trackPlanCompletion(track: TrackPlanAction, accountId: string, actionIdValue: string, completed: boolean) {
  track({
    action_type: completed ? 'plan_action_completed' : 'plan_action_uncompleted',
    account_id: accountId,
    channel: 'other',
    metadata: {
      label: completed ? 'Action marquée comme faite' : 'Action remise à faire',
      detail: completed ? 'Progression mise à jour' : 'Action replacée dans les tâches à faire',
      plan_action_id: actionIdValue,
      source: 'action_plan_board',
      source_label: 'Plan d’action',
    },
  })
  // #2130.61 — VALIDER, jamais décocher : seul le fait de cocher parle (même
  // garantie que le toast #1931.19). Anonyme, par écran — les TROIS chemins de
  // case à cocher de cet écran passent tous par cette fonction partagée, donc
  // un seul appel suffit à les couvrir.
  if (completed) trackActionStarted('plan_action_validated', ACCOUNT_DETAIL_SCREEN)
}

function trackPlanAddition(track: TrackPlanAction, accountId: string, actionIdValue: string, action: PlanAction) {
  track({
    action_type: 'plan_action_added',
    account_id: accountId,
    channel: channelFromTool(action.outil),
    metadata: actionMetadata(actionIdValue, action, 'Action ajoutée au plan', 'Action créée par l’utilisateur'),
  })
}

function actionMetadata(actionIdValue: string, action: PlanAction, label: string, detail: string) {
  return {
    label,
    detail,
    plan_action_id: actionIdValue,
    source: 'action_plan_board',
    source_label: 'Plan d’action',
    text: action.text,
    responsable: action.responsable ?? null,
    deadline: action.deadline ?? null,
    channel_hint: action.outil ?? null,
  }
}

function channelFromTool(tool?: string) {
  const value = tool?.toLowerCase() ?? ''
  if (value.includes('linkedin')) return 'linkedin'
  if (value.includes('email') || value.includes('mail')) return 'email'
  if (value.includes('phone') || value.includes('tel')) return 'phone'
  return 'other'
}
