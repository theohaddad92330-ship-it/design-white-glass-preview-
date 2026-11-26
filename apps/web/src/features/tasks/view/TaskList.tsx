import type { Task, TaskBucket, TaskPostponeOption, TaskScope } from '@bellum/contracts'
import { buildTaskAgenda, isTaskOpen, taskPostponedDueOn } from '@bellum/contracts'
import { Badge, Box, Button, Checkbox, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { CalendarClock, CalendarDays, History, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { trackTaskCompleted } from '@/lib/product-tracker'
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from '../hooks/useTasks'
import { TaskComposer } from './TaskComposer'

/**
 * #2105.17/.18/.19/.22/.52 — le délai avant qu'une confirmation « marquée
 * terminée » ne s'efface seule. Assez long pour cliquer « Annuler » sans se
 * presser, assez court pour ne pas encombrer la liste.
 */
const COMPLETION_GRACE_MS = 6_000

/**
 * La liste des tâches d'un périmètre — les miennes, celles d'un compte, d'un
 * contact ou d'un projet.
 *
 * Deux décisions d'affichage :
 *
 *  - **le retard est un panier À PART**, en tête et en rouge. Le fondre dans
 *    « aujourd'hui » afficherait un total juste et une lecture fausse ;
 *  - **cocher est un clic**, pas un menu. C'est le geste le plus fréquent d'une
 *    liste de tâches, et tout ce qui le ralentit fait abandonner la liste.
 */
export function TaskList({
  scope,
  entityId,
  accountId,
  contactId,
  projectId,
  /** Titre de section, quand la liste est encadrée par autre chose qu'une carte. */
  compact = false,
  maxItems,
  moreHref,
  screen,
}: {
  scope: TaskScope
  entityId?: string
  accountId?: string
  contactId?: string
  projectId?: string
  compact?: boolean
  /**
   * #2108.54 — l'écran qui monte cette liste, pour `task_completed`
   * (`product-tracker.ts`). Optionnel et sans repli deviné : un appelant qui
   * ne le passe pas reste muet plutôt que de mentir sur son écran.
   */
  screen?: string
  /**
   * Combien de tâches AU PLUS, quand la liste n'est pas chez elle (#1396).
   *
   * ⚠️ Absent par défaut, et c'est délibéré : sur `/tasks`, la liste EST la
   * page, et la borner y cacherait du travail. Un écran qui l'emprunte — le
   * brief du matin — la borne et DIT combien il en reste, avec le chemin pour
   * les voir toutes. Une liste tronquée en silence affirme « c'est tout ».
   */
  maxItems?: number
  /** Où voir la suite. Sans lui, la borne cacherait sans offrir de sortie. */
  moreHref?: string
}) {
  const { t } = useTranslation('tasks')
  const [composing, setComposing] = useState(false)
  // #2105.20 — l'historique se demande, il n'est pas là par défaut.
  const [historyOpen, setHistoryOpen] = useState(false)
  const { data: tasks, isLoading, isError } = useTasks(scope, entityId, { includeDone: historyOpen })
  const create = useCreateTask()
  const update = useUpdateTask()
  const remove = useDeleteTask()

  // #2105.17/.18/.19/.22/.52 — une tâche cochée reste VISIBLE, sous forme de
  // confirmation nommée avec un « Annuler », au lieu de disparaître sans
  // feedback dès que la liste se rafraîchit.
  const [justCompleted, setJustCompleted] = useState<Task[]>([])
  const graceTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  function completeWithConfirmation(task: Task) {
    setJustCompleted(prev => [...prev, task])
    update.mutate({ id: task.id, status: 'done' })
    if (screen) trackTaskCompleted(screen)
    const timeout = setTimeout(() => {
      setJustCompleted(prev => prev.filter(entry => entry.id !== task.id))
      graceTimeouts.current.delete(task.id)
    }, COMPLETION_GRACE_MS)
    graceTimeouts.current.set(task.id, timeout)
  }

  function undoCompletion(task: Task) {
    const timeout = graceTimeouts.current.get(task.id)
    if (timeout) clearTimeout(timeout)
    graceTimeouts.current.delete(task.id)
    setJustCompleted(prev => prev.filter(entry => entry.id !== task.id))
    update.mutate({ id: task.id, status: 'todo' })
  }

  // #4134 — reporter en un geste. Même schéma que la complétion : la tâche
  // reportée QUITTE son panier au rafraîchissement, donc la confirmation (avec
  // son « Annuler le report ») vit hors des paniers, avec l'échéance d'origine.
  const [justPostponed, setJustPostponed] = useState<{ task: Task; option: TaskPostponeOption }[]>([])

  function postpone(task: Task, option: TaskPostponeOption) {
    update.mutate({ id: task.id, dueOn: taskPostponedDueOn(option, new Date()) })
    setJustPostponed(prev => [...prev.filter(entry => entry.task.id !== task.id), { task, option }])
    const previous = graceTimeouts.current.get(task.id)
    if (previous) clearTimeout(previous)
    graceTimeouts.current.set(
      task.id,
      setTimeout(() => {
        setJustPostponed(prev => prev.filter(entry => entry.task.id !== task.id))
        graceTimeouts.current.delete(task.id)
      }, COMPLETION_GRACE_MS),
    )
  }

  function undoPostpone(task: Task) {
    const timeout = graceTimeouts.current.get(task.id)
    if (timeout) clearTimeout(timeout)
    graceTimeouts.current.delete(task.id)
    setJustPostponed(prev => prev.filter(entry => entry.task.id !== task.id))
    // L'échéance d'ORIGINE, relue de la tâche telle qu'elle était au clic.
    update.mutate({ id: task.id, dueOn: task.dueOn })
  }

  const agenda = useMemo(() => buildTaskAgenda(tasks ?? [], new Date()), [tasks])
  // #2105.20 — la même lecture, filtrée sur ce qui n'attend plus personne.
  // Vide tant que l'historique n'est pas ouvert : la requête n'inclut alors
  // pas les tâches closes (`includeDone`), donc ce filtre est un NO-OP côté
  // réseau, jamais une seconde source de vérité.
  const closedTasks = useMemo(() => (tasks ?? []).filter(item => !isTaskOpen(item.status)), [tasks])

  /**
   * La coupe se fait sur le FLUX, pas par panier (#1396).
   *
   * Borner chaque panier à N rendrait « 5 en retard, 5 aujourd'hui, 5 cette
   * semaine » — quinze lignes pour une borne de cinq. On garde donc les N
   * premières tâches dans l'ORDRE de l'agenda, ce qui met le retard en premier,
   * et on compte ce qui reste.
   */
  const visible = useMemo(() => {
    if (maxItems === undefined) return { buckets: agenda.buckets, hidden: 0 }
    let left = maxItems
    const buckets: typeof agenda.buckets = []
    for (const entry of agenda.buckets) {
      if (left <= 0) break
      buckets.push({ ...entry, tasks: entry.tasks.slice(0, left) })
      left -= entry.tasks.length
    }
    const total = agenda.buckets.reduce((sum, entry) => sum + entry.tasks.length, 0)
    return { buckets, hidden: Math.max(0, total - maxItems) }
  }, [agenda.buckets, maxItems])

  return (
    <Box className="space-y-3">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Box display="flex" className="items-center gap-2">
          {agenda.overdueCount > 0 ? (
            <Badge variant="warning">{t('counts.overdue', { count: agenda.overdueCount })}</Badge>
          ) : null}
          {agenda.todayCount > 0 ? (
            <Badge variant="default">{t('counts.today', { count: agenda.todayCount })}</Badge>
          ) : null}
          {agenda.overdueCount === 0 && agenda.todayCount === 0 && !isLoading && !isError ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('counts.clear')}
            </Text>
          ) : null}
        </Box>
        <Box display="flex" className="flex-wrap items-center gap-1">
          {/* #2105.20 — l'historique se demande, il n'est pas là par défaut. */}
          <Button variant="ghost" size="sm" aria-pressed={historyOpen} onClick={() => setHistoryOpen(open => !open)}>
            <History className="size-3.5" aria-hidden />
            {t('actions.history')}
          </Button>
          <Button variant={compact ? 'ghost' : 'black'} size="sm" onClick={() => setComposing(true)}>
            {t('actions.add')}
          </Button>
        </Box>
      </Box>

      {/* #2105.17/.18/.19/.22/.52 — la confirmation vit ICI, hors des paniers :
          la tâche cochée en sort dès le prochain rafraîchissement (elle est
          close), et disparaîtrait donc sans un mot si elle n'était pas
          reprise ici. */}
      {justCompleted.length > 0 ? (
        <Box className="space-y-1.5">
          {justCompleted.map(item => (
            <Box
              key={item.id}
              display="flex"
              className="items-center justify-between gap-2 rounded-md border border-border bg-card p-2"
            >
              <Text size="xs" color="text-muted-foreground">
                {t('states.completedNotice', { title: item.title })}
              </Text>
              <Button variant="ghost" size="sm" onClick={() => undoCompletion(item)}>
                <Undo2 className="size-3.5" aria-hidden />
                {t('actions.undo')}
              </Button>
            </Box>
          ))}
        </Box>
      ) : null}

      {justPostponed.length > 0 ? (
        <Box className="space-y-1.5" role="status">
          {justPostponed.map(({ task: item, option }) => (
            <Box
              key={item.id}
              display="flex"
              className="items-center justify-between gap-2 rounded-md border border-border bg-card p-2"
            >
              <Text size="xs" color="text-muted-foreground">
                {t(`states.postponedNotice.${option}`, { title: item.title })}
              </Text>
              <Button variant="ghost" size="sm" onClick={() => undoPostpone(item)}>
                <Undo2 className="size-3.5" aria-hidden />
                {t('actions.undoPostpone')}
              </Button>
            </Box>
          ))}
        </Box>
      ) : null}

      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : isError ? (
        // Une lecture en échec n'est PAS « rien à faire » : c'est exactement le
        // genre de vide qui rassure à tort, et il a déjà coûté une demi-heure
        // de recherche en production sur les notes.
        <Box className="rounded-md border border-dashed border-destructive/40 p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('states.loadError')}
          </Text>
        </Box>
      ) : agenda.buckets.length === 0 ? (
        <Box className="rounded-md border border-dashed border-border p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('states.empty')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-4">
          {visible.buckets.map(entry => (
            <Box key={entry.bucket} className="space-y-1.5">
              <Text
                element="p"
                size="xs"
                weight="medium"
                color={entry.bucket === 'overdue' ? 'text-[var(--danger-soft-text)]' : 'text-muted-foreground'}
              >
                {t(`buckets.${entry.bucket}` satisfies `buckets.${TaskBucket}`)}
              </Text>
              {entry.tasks.map(item => (
                <TaskRow
                  key={item.id}
                  task={item}
                  onToggle={() => completeWithConfirmation(item)}
                  onPostpone={option => postpone(item, option)}
                  onDelete={() => remove.mutate({ id: item.id })}
                />
              ))}
            </Box>
          ))}
          {/* Ce qui reste est COMPTÉ et atteignable. Une liste coupée qui ne dit
              pas qu'elle est coupée affirme « c'est tout » — et sur des tâches
              en retard, c'est l'affirmation la plus coûteuse de l'écran. */}
          {visible.hidden > 0 && moreHref ? (
            <Link to={moreHref} className="underline">
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('states.more', { count: visible.hidden })}
              </Text>
            </Link>
          ) : null}
        </Box>
      )}

      {/* #2105.20 — l'HISTORIQUE : ce qui n'attend plus personne, replié par
          défaut. `closedTasks` est vide tant que `historyOpen` est faux (la
          requête n'a alors pas demandé `includeDone`), donc ce bloc ne rend
          jamais rien sans que l'utilisateur l'ait ouvert. */}
      {historyOpen ? (
        <Box className="space-y-1.5 border-t border-border pt-3">
          <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
            {t('actions.history')}
          </Text>
          {closedTasks.length === 0 ? (
            <Text size="xs" color="text-muted-foreground">
              {t('states.historyEmpty')}
            </Text>
          ) : (
            closedTasks.map(item => <ClosedTaskRow key={item.id} task={item} />)
          )}
        </Box>
      ) : null}

      {composing ? (
        <TaskComposer
          open
          onOpenChange={setComposing}
          isPending={create.isPending}
          onSubmit={draft =>
            create.mutate({ ...draft, accountId, contactId, projectId }, { onSuccess: () => setComposing(false) })
          }
        />
      ) : null}
    </Box>
  )
}

function TaskRow({
  task,
  onToggle,
  onDelete,
  onPostpone,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
  onPostpone: (option: TaskPostponeOption) => void
}) {
  const { t, i18n } = useTranslation('tasks')
  const due = new Date(`${task.dueOn}T12:00:00`).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
  })
  // Le contexte de la tâche : le compte d'abord, la personne ensuite. Une tâche
  // sans contexte est une tâche personnelle — on ne la déguise pas en tâche de
  // compte avec un tiret vide.
  const context = [task.accountName, task.contactName, task.projectLabel].filter(Boolean).join(' · ')

  // #2105.55 — « une tâche liée ouvre son objet » : le contexte était un texte
  // mort, jamais un `<Link>`. Le compte d'abord (le CTA le plus fréquent),
  // la personne ensuite — même priorité que la construction de `context`
  // ci-dessus. `projectId` référence `opportunities`, sans écran dédié : pas
  // de lien tant que cette route n'existe pas (mieux vaut un texte juste
  // qu'un lien mort).
  const linkTarget = task.accountId
    ? ({ to: '/accounts/$id', params: { id: task.accountId } } as const)
    : task.contactId
      ? ({ to: '/contacts/$id', params: { id: task.contactId } } as const)
      : null

  return (
    <Box display="flex" className="items-start gap-2 rounded-md border border-border bg-card p-2">
      {/* #4134 — la case reste petite, sa zone cliquable fait 44 px. */}
      <label className="-m-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center">
        <Checkbox checked={task.status === 'done'} onCheckedChange={onToggle} aria-label={t('actions.complete')} />
      </label>
      <Box className="min-w-0 flex-1">
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Text element="span" size="sm" weight="medium">
            {task.title}
          </Text>
          {task.priority === 'high' ? <Badge variant="warning">{t('priority.high')}</Badge> : null}
        </Box>
        {task.details ? (
          <Text size="xs" color="text-muted-foreground" className="mt-0.5 whitespace-pre-wrap">
            {task.details}
          </Text>
        ) : null}
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
          {due}
          {context ? (
            <>
              {' · '}
              {linkTarget ? (
                <Link to={linkTarget.to} params={linkTarget.params} className="underline">
                  {context}
                </Link>
              ) : (
                context
              )}
            </>
          ) : null}
        </Text>
      </Box>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        onClick={() => onPostpone('tomorrow')}
        aria-label={t('actions.postponeTomorrow')}
        title={t('actions.postponeTomorrow')}
      >
        <CalendarClock className="size-3.5" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        onClick={() => onPostpone('next_week')}
        aria-label={t('actions.postponeNextWeek')}
        title={t('actions.postponeNextWeek')}
      >
        <CalendarDays className="size-3.5" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        onClick={onDelete}
        aria-label={t('actions.delete')}
        title={t('actions.delete')}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </Box>
  )
}

/**
 * #2105.20 — une ligne de l'HISTORIQUE : ce qui n'attend plus personne.
 * Lecture seule — aucune case à cocher, aucune suppression : rouvrir ou
 * effacer une tâche close se fait depuis sa fiche, pas d'ici.
 */
function ClosedTaskRow({ task }: { task: Task }) {
  const { t, i18n } = useTranslation('tasks')
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR'
  const closedOn = task.completedAt
    ? new Date(task.completedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    : null

  return (
    <Box className="rounded-md border border-dashed border-border p-2">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Text element="span" size="sm" color="text-muted-foreground" className="line-through">
          {task.title}
        </Text>
        {/* Une date d'achèvement absente ne s'affiche jamais comme un « fait
            aujourd'hui » silencieux (GA-18/19) — elle ne s'affiche pas du tout. */}
        {closedOn ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {task.status === 'cancelled'
              ? t('states.closedStatus.cancelled', { date: closedOn })
              : t('states.closedStatus.done', { date: closedOn })}
          </Text>
        ) : null}
      </Box>
      {task.resultNote ? (
        <Text size="xs" color="text-muted-foreground" className="mt-0.5 whitespace-pre-wrap">
          {task.resultNote}
        </Text>
      ) : null}
    </Box>
  )
}
