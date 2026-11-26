import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CalendarClock, Check, ListChecks, Pencil, Play, RotateCcw, ShieldCheck, X } from 'lucide-react'
import {
  actionLevelAtClick,
  planHorizonOf,
  planLaunchPreview,
  planStepsOf,
  type CardGesture,
  type PlanBrief,
  type PlanLaunchMode,
  type PlanStepView,
} from '@bellum/contracts'
import { Button, Text, cn } from '@bellum/ui'
import { ContactDialog } from '@/components/ContactDialog'
import { useActionLevel } from '@/features/actions/hooks/useActionLevel'
import { useOutreachMessage } from '@/features/outreach/hooks/useOutreachMessages'
import { trackDraftReused, trackPreparedActionStage } from '@/lib/product-tracker'
import { copilotCardsApi, type CopilotCardWire, type CopilotPlanRun } from '../api/copilotCardsApi'
import { CHAT_SURFACE } from './chat-surface'
import { editableFieldsOf } from './copilot-card-edit'

/** #1946.16 — même écran que `trackSuggestionClicked`/`trackAssistantQuestionSent` (`Chat.tsx`). */
const SCREEN = '/chat'

/**
 * #1998 — LES CARTES D'ACTION OS, DANS LE FIL.
 *
 * L'API calculait, gouvernait, persistait et renvoyait ces cartes
 * (`ia-proxy.controller.ts`, `withTurnCards` → `data.context.cards` ; et
 * `GET /ia/chat/messages` → `message.cards` au rechargement). Aucun fichier de
 * `apps/web/src` ne les lisait : Laura écrivait donc le contenu exact d'une
 * carte EN PROSE (« Analyse proposée : 8 crédits »), sans un seul bouton.
 * Huitième occurrence du défaut n°1 du dépôt — du code juste que personne
 * n'appelle.
 *
 * Trois choses distinguent ces cartes de `PendingActions`, et ce sont elles qui
 * font le lot :
 *
 *  1. **La prévisualisation vient du SERVEUR** (`card.preview`, les huit lignes
 *     de #1930). `PendingActions` reconstruit un sous-ensemble au cas par cas
 *     dans `previewRows()` — il le doit, car une `pending_action` est du JSON de
 *     modèle sans prévisualisation. Une carte en a une, complète et gouvernée :
 *     la rebâtir ici serait une deuxième dérivation, donc une divergence.
 *  2. **L'état vient du SERVEUR**, et il est PERSISTÉ. `PendingActions` porte un
 *     `useState` remis à `proposed` à chaque montage : valider puis recharger la
 *     page effaçait le geste. Ici, le seul état local est la RÉPONSE du serveur
 *     à un geste — rechargée, la carte revient là où elle en était (D1, #1943.2).
 *  3. **Les boutons sont exactement `card.allowedGestures`.** L'écran ne déduit
 *     rien de l'état : c'est ce qui garantit qu'il ne peut pas rouvrir un geste
 *     que la doctrine a fermé — pas de « réessayer » sur un `unknown_outcome`
 *     (un timeout n'est pas un échec), pas d'annulation sur une carte partie
 *     (l'annulation serait plus étroite que l'écriture).
 *
 * Rien ne part sans un clic : c'est le clic qui EST la décision (geste
 * d'utilisateur = auto-approuvé). Laura, elle, n'envoie jamais rien.
 */
export function CopilotCards({
  cards,
  brief = null,
  mailboxName = null,
}: {
  cards: readonly CopilotCardWire[]
  /** G.3 — la messagerie que l'espace a BRANCHÉE (« Gmail », « Outlook »), `null` si absente ou ambiguë. */
  mailboxName?: string | null
  /** #1950.4 / .7 / .12 / .13 — le résumé NOMMÉ par Laura (`context.plan_brief`), absent sinon. */
  brief?: PlanBrief | null
}) {
  const { t } = useTranslation('chat')
  /**
   * #1950.20 — LE PLAN SE LIT SUR LES CARTES TELLES QUE LE SERVEUR LES A RENDUES
   * EN DERNIER. Un geste de carte ou de plan rend des cartes RELUES : elles
   * remontent ici, sans quoi l'état du plan (et le blocage d'une dépendante)
   * resterait celui d'avant le clic. Remis à zéro quand le fil sert d'autres
   * cartes (même motif « ajuster l'état pendant le rendu » que `CopilotCard`).
   * Aucun état de plan n'est STOCKÉ : il se dérive à chaque rendu (`planStepsOf`).
   */
  const [latest, setLatest] = useState<ReadonlyMap<string, CopilotCardWire>>(new Map())
  const [seed, setSeed] = useState(cards)
  if (seed !== cards) {
    setSeed(cards)
    setLatest(new Map())
  }
  if (cards.length === 0) return null
  // Même règle que `PendingActions` : numérotées à partir de DEUX. Un « 1. »
  // solitaire annonce une séquence là où il n'y a qu'un geste.
  const numbered = cards.length > 1
  const ordered = cards
    .map(card => latest.get(card.id) ?? card)
    .sort((a, b) => (a.proposalIndex ?? Number.MAX_SAFE_INTEGER) - (b.proposalIndex ?? Number.MAX_SAFE_INTEGER))
  // #1950.20 — une carte seule n'est pas un plan (même règle que la numérotation).
  const steps = numbered ? planStepsOf(ordered) : null
  // Le numéro AFFICHÉ d'un rang : celui de la pastille, pas `proposalIndex + 1`
  // (une proposition de navigation n'a pas de carte, et décalerait tout).
  const numberOf = (rank: number): number => {
    const index = ordered.findIndex(card => card.proposalIndex === rank)
    return index >= 0 ? index + 1 : rank + 1
  }
  const served = (next: readonly CopilotCardWire[]) =>
    setLatest(previous => {
      const merged = new Map(previous)
      for (const card of next) merged.set(card.id, card)
      return merged
    })
  return (
    <>
      {steps ? (
        <CopilotPlanBar cards={ordered} steps={steps} numberOf={numberOf} onServed={served} brief={brief} />
      ) : null}
      <ol className="mt-2 w-full space-y-2">
        {ordered.map((card, index) => {
          const step = steps?.find(candidate => candidate.id === card.id)
          // #1950.22 — bloquée par un prérequis DÉCLARÉ : « Valider » disparaît,
          // la carte dit par qui (le serveur refuse aussi ce clic).
          const blockedBy = step?.status === 'blocked' ? step.blockedBy : null
          const planNote = blockedBy
            ? t(`cards.plan.blockedBy.${blockedBy.cause}`, { step: numberOf(blockedBy.rank) })
            : step?.waitingOn.length
              ? t('cards.plan.waitingOn', {
                  count: step.waitingOn.length,
                  steps: step.waitingOn.map(numberOf).join(', '),
                })
              : null
          return (
            <li key={card.id} className="flex items-start gap-2">
              {numbered ? (
                <span
                  aria-hidden
                  className="mt-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]"
                >
                  {index + 1}
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <CopilotCard
                  card={card}
                  planNote={planNote}
                  confirmBlocked={blockedBy !== null}
                  mailboxName={mailboxName}
                  onServed={next => served([next])}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )
}

/**
 * #1950.14 / #1950.18 / #1950.20 — LA BARRE DU PLAN, AU-DESSUS DE SES CARTES.
 *
 * #1950.14 revient sur 1950.3, délibérément (décision Louis 19/09/2026) : un
 * geste lance tout le plan, ou sa seule 1re étape. Ce qui tient :
 *  - elle annonce AVANT le clic ce qu'elle enchaîne et ce que ça coûte — la
 *    liste vient de `planLaunchPreview`, la MÊME règle que le serveur, donc
 *    l'écran n'annonce jamais une étape qu'il ne lancerait pas ;
 *  - ce qui écrit hors de Bellum n'est pas lancé : elle le DIT, étape par étape,
 *    et la carte garde son propre « Valider » (sa porte habituelle) ;
 *  - un résultat inconnu arrête la reprise : plus de geste de plan.
 * Rien ici n'est une machine à états : les cartes rendues par le serveur
 * remontent au parent, et tout se redérive.
 */
function CopilotPlanBar({
  cards,
  steps,
  numberOf,
  onServed,
  brief,
}: {
  cards: readonly CopilotCardWire[]
  steps: readonly PlanStepView[]
  numberOf: (rank: number) => number
  onServed: (cards: readonly CopilotCardWire[]) => void
  brief: PlanBrief | null
}) {
  const { t, i18n } = useTranslation('chat')
  // #1950.10 — l'horizon DATÉ du plan (le rappel le plus lointain), jamais une
  // durée estimée : aucune étape datée, aucune ligne.
  const horizon = planHorizonOf(cards.map(card => card.action))
  const [working, setWorking] = useState<PlanLaunchMode | null>(null)
  const [refused, setRefused] = useState<CopilotPlanRun['refused']>([])
  const [failure, setFailure] = useState<string | null>(null)
  const turnId = cards.find(card => card.turnId)?.turnId ?? null
  const chained = turnId ? planLaunchPreview(cards, 'all') : []
  const first = turnId ? planLaunchPreview(cards, 'first')[0] : undefined
  const firstStep = first ? steps.find(step => step.id === first) : undefined
  const unknown = steps.find(step => step.status === 'unknown')
  const gated = steps.filter(step => step.status === 'todo' && step.reach === 'outside')
  const displayed = (step: PlanStepView, index: number) => (step.rank === null ? index + 1 : numberOf(step.rank))

  async function run(mode: PlanLaunchMode) {
    if (!turnId) return
    setWorking(mode)
    setFailure(null)
    setRefused([])
    try {
      const outcome = await copilotCardsApi.runPlan(turnId, mode)
      onServed(outcome.cards)
      setRefused(outcome.refused)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t('cards.gestureFailedUnknown'))
    } finally {
      setWorking(null)
    }
  }

  return (
    <section
      aria-label={t('cards.plan.label')}
      className="mt-2 w-full rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2"
    >
      <div className="flex items-start gap-2">
        <ListChecks className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text size="xs" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('cards.plan.title', { count: steps.length })}
        </Text>
      </div>
      {planBriefLines(brief, horizon, i18n.language, t).map(line => (
        <Text key={line} size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1 pl-6">
          {line}
        </Text>
      ))}
      <ol className="mt-1 space-y-0.5 pl-6">
        {steps.map((step, index) => (
          <li key={step.id}>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('cards.plan.step', {
                step: displayed(step, index),
                status: t(`cards.plan.status.${step.status}`),
              })}
            </Text>
          </li>
        ))}
      </ol>
      {unknown ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1.5 pl-6">
          {t('cards.plan.unknown', { step: displayed(unknown, steps.indexOf(unknown)) })}
        </Text>
      ) : null}
      {gated.map(step => (
        <Text key={step.id} size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1.5 pl-6">
          {t('cards.plan.gated', { step: displayed(step, steps.indexOf(step)) })}
        </Text>
      ))}
      {chained.length > 0 || firstStep ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          {chained.length > 0 ? (
            <Button size="sm" onClick={() => void run('all')} disabled={working !== null}>
              <Play className="size-3.5" />
              {working === 'all' ? t('cards.working') : t('cards.plan.runAll')}
            </Button>
          ) : null}
          {firstStep ? (
            <Button size="sm" variant="ghost" onClick={() => void run('first')} disabled={working !== null}>
              {working === 'first'
                ? t('cards.working')
                : t('cards.plan.runFirst', { step: displayed(firstStep, steps.indexOf(firstStep)) })}
            </Button>
          ) : null}
        </div>
      ) : null}
      {chained.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1.5 pl-6">
          {t('cards.plan.chained', { count: cards.filter(card => chained.includes(card.id)).length })}
        </Text>
      ) : null}
      {failure || refused.length > 0 ? (
        <div role="alert" className="mt-2 space-y-0.5 pl-6">
          {failure ? (
            <Text size="xs" className="text-[var(--danger-soft-text)]">
              {failure}
            </Text>
          ) : null}
          {refused.map((refusal, index) => (
            <Text key={`${refusal.rank ?? 'x'}-${index}`} size="xs" className="text-[var(--danger-soft-text)]">
              {refusal.rank === null
                ? refusal.reason
                : t('cards.plan.refused', { step: numberOf(refusal.rank), reason: refusal.reason })}
            </Text>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/**
 * #1950.4 / .7 / .10 / .12 / .13 — les lignes du résumé du plan. Tranché sans
 * Louis (décision §12) : la barre de plan existante les porte, jamais un second
 * écran. Une liste absente ne fait AUCUNE ligne ; la « durée » est l'horizon
 * DATÉ des étapes (#1950.10, reformulé : jamais une durée estimée).
 */
function planBriefLines(
  brief: PlanBrief | null,
  horizon: string | null,
  language: string,
  t: TFunction<'chat'>,
): string[] {
  const lines: string[] = []
  if (brief) {
    lines.push(t('cards.plan.brief.objective', { text: brief.objective }))
    if (brief.expected_results?.length)
      lines.push(t('cards.plan.brief.expectedResults', { items: brief.expected_results.join(', ') }))
    if (brief.missing_data?.length)
      lines.push(t('cards.plan.brief.missingData', { items: brief.missing_data.join(', ') }))
    if (brief.impossible?.length) lines.push(t('cards.plan.brief.impossible', { items: brief.impossible.join(', ') }))
  }
  const date = horizon ? new Date(horizon) : null
  if (date && !Number.isNaN(date.getTime()))
    lines.push(
      t('cards.plan.brief.horizon', { date: date.toLocaleDateString(language, { day: 'numeric', month: 'long' }) }),
    )
  return lines
}

/**
 * Les gestes qui partent D'UN SEUL CLIC, sans rien à saisir.
 *
 * `modify` n'en est pas : il exige un `patch`, donc un formulaire, donc un
 * second clic pour l'envoyer. Il est rendu à part (#1930.11) — le bouton ouvre
 * la surface d'édition, et c'est « Enregistrer » qui appelle la route. L'ancien
 * docblock disait que cette surface « n'existe pas encore » : c'est ce qui a
 * changé, pas la nature du geste.
 *
 * Le type porte l'exclusion plutôt qu'un commentaire : un geste AJOUTÉ au
 * contrat fait tomber la compilation à deux endroits — la table d'icônes, qui
 * est un `Record` exhaustif, et l'aiguillage de `run`, qui finit sur un `never`.
 */
type RenderedGesture = Exclude<CardGesture, 'modify'>

const RENDERED_GESTURES: readonly RenderedGesture[] = ['confirm', 'reject', 'snooze', 'retry', 'cancel']

const GESTURE_ICON: Record<RenderedGesture, typeof Check> = {
  confirm: Check,
  reject: X,
  snooze: CalendarClock,
  retry: RotateCcw,
  cancel: X,
}

function CopilotCard({
  card,
  planNote = null,
  confirmBlocked = false,
  mailboxName = null,
  onServed,
}: {
  card: CopilotCardWire
  /** G.3 — voir `CopilotCards`. */
  mailboxName?: string | null
  /** #1950.22 — ce que le plan dit de cette étape (bloquée par / attend), `null` hors plan. */
  planNote?: string | null
  /** #1950.22 — un prérequis DÉCLARÉ a échoué : « Valider » ne s'offre pas (le serveur le refuse aussi). */
  confirmBlocked?: boolean
  /** #1950.20 — la carte relue remonte au plan, qui redérive l'état de chaque étape. */
  onServed?: (card: CopilotCardWire) => void
}) {
  const { t, i18n } = useTranslation('chat')
  /**
   * Le SEUL état local : la carte telle que le serveur l'a rendue APRÈS un
   * geste. Jamais un état deviné — et remis à zéro dès que la carte servie
   * change (motif React « ajuster l'état pendant le rendu »), sans quoi une
   * relecture du fil resterait masquée par la réponse d'un geste précédent.
   */
  const [served, setServed] = useState<CopilotCardWire | null>(null)
  const [seed, setSeed] = useState(card)
  /**
   * #1930.11 — le brouillon d'édition. `null` = le formulaire est fermé, ce qui
   * n'est PAS la même chose qu'un brouillon vide : un brouillon vide est une
   * personne qui a tout effacé, et le serveur le refusera pour elle.
   */
  const [draft, setDraft] = useState<Readonly<Record<string, string>> | null>(null)
  if (seed !== card) {
    setSeed(card)
    setServed(null)
    setDraft(null)
  }
  const current = served ?? card
  const [working, setWorking] = useState<CardGesture | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // #1943.17 — le SEUL dialogue support du produit (#1960.20) ; jamais une
  // adresse recopiée ici, qui divergerait en marque blanche.
  const [supportOpen, setSupportOpen] = useState(false)
  // #1946.5/.7 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
  // §1) : le NOM de geste manquant est `action.action`, le discriminant déjà
  // porté par la proposition (« export_contact_to_crm »…) — jamais sa cible,
  // exactement ce que l'émetteur exige. L'ENDROIT où chacune des deux étapes
  // se constate : « préparée » quand le SERVEUR rend l'état `prepared` (les
  // huit lignes de #1930 sont prêtes, un clic manque) ; « exécutée » quand il
  // rend `executed`. Un `useEffect` sur `current.state` ne réémet jamais tant
  // que l'état ne change pas vraiment — une carte relue au rechargement du
  // fil ne réémet donc pas « préparée » à chaque rendu.
  useEffect(() => {
    const actionName = current.action?.action
    if (!actionName) return
    if (current.state === 'prepared') {
      trackPreparedActionStage(actionName, 'preparee')
    } else if (current.state === 'executed') {
      trackPreparedActionStage(actionName, 'executee')
    }
  }, [current.state, current.action?.action])

  async function act(gesture: RenderedGesture) {
    setWorking(gesture)
    setFailure(null)
    // #1946.6 — « validée » se constate ICI, au CLIC de confirmation — le
    // geste humain lui-même, distinct de #1946.7 (« exécutée »), qui attend le
    // résultat serveur. Les deux existent même quand l'exécution échoue
    // ensuite : la personne a bien validé, ce que le traceur mesure ne change
    // pas rétroactivement.
    if (gesture === 'confirm' && current.action?.action) {
      trackPreparedActionStage(current.action.action, 'validee')
    }
    try {
      // Le clic — et lui seul — appelle la route réelle. L'état suivant est
      // celui que le serveur RENVOIE : il a déjà revérifié le droit, le geste
      // permis et l'expiration.
      const next = await run(gesture, current.id)
      setServed(next)
      onServed?.(next)
    } catch (error) {
      // Une erreur porte sa phrase (`ApiError.message`) : on la montre plutôt
      // qu'un « une erreur est survenue », et la carte RESTE dans son état.
      setFailure(error instanceof Error ? error.message : t('cards.gestureFailedUnknown'))
    } finally {
      setWorking(null)
    }
  }

  /**
   * #1930.11 — enregistrer une modification. C'est le SERVEUR qui refait passer
   * la proposition fusionnée par son schéma, recalcule la prévisualisation et le
   * coût, et rend la carte relue : rien n'est deviné ici, pas même le nouveau
   * texte de l'aperçu.
   */
  async function save(patch: Readonly<Record<string, string>>) {
    setWorking('modify')
    setFailure(null)
    // #1946.16 — capturé AVANT l'appel réseau : ce sont les valeurs telles que
    // le formulaire les a ouvertes (`current.action` ne bouge pas pendant
    // l'édition, voir plus haut). `draftExtentOf` ne lit que des LONGUEURS.
    const extent = draftExtentOf(editableFieldsOf(current.action), patch)
    try {
      const next = await copilotCardsApi.modify(current.id, patch)
      setServed(next)
      onServed?.(next)
      setDraft(null)
      // #1946.8 — « corrigée » se constate APRÈS l'acceptation SERVEUR du
      // patch, jamais au clic « Enregistrer » : le serveur revalide la
      // proposition fusionnée (`pendingChatActionSchema`) et peut la refuser
      // — une correction refusée n'a pas eu lieu.
      if (current.action?.action) {
        trackPreparedActionStage(current.action.action, 'corrigee')
      }
      // #1946.16 — même règle que #1946.8 : un patch refusé par le serveur n'a
      // rien repris, donc rien à mesurer.
      if (extent) trackDraftReused(SCREEN, extent)
    } catch (error) {
      // La carte RESTE ouverte en édition : fermer le formulaire sur une erreur
      // ferait perdre ce que la personne vient d'écrire.
      setFailure(error instanceof Error ? error.message : t('cards.gestureFailedUnknown'))
    } finally {
      setWorking(null)
    }
  }

  // #1950.22 — `confirmBlocked` RETIRE un geste, il n'en ajoute jamais : la
  // liste reste bornée par ce que le serveur offre.
  const gestures = RENDERED_GESTURES.filter(
    gesture => current.allowedGestures.includes(gesture) && !(confirmBlocked && gesture === 'confirm'),
  )
  // #1930.11 — « Modifier » ne s'annonce que si le serveur l'autorise ET si
  // cette forme de proposition a quelque chose à réécrire : un bouton qui
  // ouvrirait un formulaire vide serait pire que pas de bouton.
  const editableFields = editableFieldsOf(current.action)
  const canModify = current.allowedGestures.includes('modify') && editableFields.length > 0
  // #2896 / #2449.35 — le niveau d'action ne se dit que TANT QUE le clic est
  // possible : c'est le moment où il décide de ce que le clic fera. Une carte
  // réglée n'a plus rien à valider. Non lu (chargement, échec) : rien — ni un
  // défaut deviné, ni une ligne vide.
  const actionLevel = useActionLevel()
  const clickLevel =
    actionLevel.data && gestures.includes('confirm') ? actionLevelAtClick(actionLevel.data.level) : null
  const previewRows = previewRowsOf(current, t, mailboxName)
  // #2896 / #2449.36 — dans la prévisualisation, AVANT exécution : ce que ce
  // niveau fera du clic (la règle du niveau, la porte serveur tranchant au clic).
  if (clickLevel && previewRows.length > 0) {
    previewRows.push({
      label: t('actions:actionLevel.label'),
      value: t(`actions:actionLevel.levelHelp.${clickLevel.level}`),
    })
  }
  const resultRows = resultRowsOf(current, t, i18n.language, mailboxName)
  // #1952.10 — #1930's own CTA example : « Ouvrir le brouillon ». Une référence
  // en URL devient un LIEN, pas une ligne de texte copiable (`resultRowsOf` la
  // retire déjà de son tableau pour ne pas la répéter — loi 4).
  const openHref = current.result && isHttpUrl(current.result.externalRef) ? current.result.externalRef : null
  // #1952.24 — « bouton voir le détail » d'un travail long suivi (l'analyse de
  // compte, aujourd'hui le seul). `current.action === null` distingue la carte
  // de SUIVI (créée par `trackAnalysisLaunch`, sans proposition) d'une carte
  // d'action ordinaire, qui porte déjà ses propres CTA. `result.externalRef`
  // n'est PAS réutilisable ici : il porte le jobId, lu par le serveur pour
  // interroger le lanceur — jamais une URL.
  const detailAccountId = current.action === null ? current.accountId : null
  // #1952.23 — l'estimation AVANT, le réel APRÈS, par la MÊME formule que
  // l'Action Center (tranché Louis 16/09/2026). Tant qu'aucun résultat n'existe,
  // la ligne n'a rien à comparer : c'est le tableau de prévisualisation qui
  // porte l'estimation, nommée comme telle.

  return (
    <div data-chat-kind="action" className={cn('p-3', CHAT_SURFACE.action)}>
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
        <div className="min-w-0 flex-1 space-y-1">
          <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {t(`cards.state.${current.state}`)}
          </Text>
          {/* La phrase du serveur, pas une phrase reconstruite ici. */}
          {current.preview ? (
            <Text size="sm" className="text-[var(--bellum-text-primary)]">
              {current.preview.whatWillHappen}
            </Text>
          ) : null}
          {/* #2896 / #2449.35 — le niveau d'action, au moment où l'action devient
              possible, et le chemin vers son réglage (Réglages › Laura). */}
          {clickLevel ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t(clickLevel.isDefault ? 'actions:actionLevel.currentDefault' : 'actions:actionLevel.current', {
                level: t(`actions:actionLevel.levels.${clickLevel.level}`),
              })}{' '}
              <Link to="/settings/laura-mode" className="underline">
                {t('actions:actionLevel.change')}
              </Link>
            </Text>
          ) : null}
          {/* #1950.22 — ce que le plan dit de cette étape : bloquée par, ou attend. */}
          {planNote ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {planNote}
            </Text>
          ) : null}
          {/* Doctrine : un timeout n'est PAS un échec — rien n'est rejoué tout seul. */}
          {current.state === 'unknown_outcome' ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('cards.unknownOutcomeNote')}
            </Text>
          ) : null}
        </div>
      </div>

      {previewRows.length > 0 ? <CardRows title={t('cards.preview.title')} rows={previewRows} /> : null}
      {resultRows.length > 0 ? <CardRows title={t('cards.result.title')} rows={resultRows} /> : null}

      {/* #2366.1 / #2366.2 — un brouillon devenu message canonique se RELIT
          par identifiant, jamais gardé pour toujours au texte figé au moment
          de la génération (`content`, plus haut) : une édition faite ailleurs
          (centre d'approbation Outreach) s'y reflète, et c'est le MÊME objet
          que la fiche Contact affiche. */}
      <OutreachMessageLiveState messageId={current.result?.outreachMessageId} />

      {openHref ? (
        <div className="mt-2.5">
          <Button asChild size="sm" variant="outline">
            <a href={openHref} target="_blank" rel="noreferrer">
              {t('cards.result.open')}
            </a>
          </Button>
        </div>
      ) : null}

      {detailAccountId ? (
        <div className="mt-2.5">
          <Button asChild size="sm" variant="outline">
            <Link to="/accounts/$id" params={{ id: detailAccountId }}>
              {t('cards.result.viewDetail')}
            </Link>
          </Button>
        </div>
      ) : null}

      {/* #1943.17 — un échec que la personne ne peut pas diagnostiquer seule
          (aujourd'hui, `unknown_outcome`) propose le support ; `cardResultOf`
          pose le drapeau, rien n'est déduit ici de l'état ou d'un texte. */}
      {current.result?.supportSuggested ? (
        <div className="mt-2.5">
          <Button size="sm" variant="outline" onClick={() => setSupportOpen(true)}>
            {t('cards.result.contactSupport')}
          </Button>
          <ContactDialog open={supportOpen} onOpenChange={setSupportOpen} />
        </div>
      ) : null}

      {failure ? (
        <div role="alert" className="mt-2.5 flex items-start gap-1.5">
          <X className="mt-0.5 size-3.5 shrink-0 text-[var(--danger-soft-text)]" />
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {failure}
          </Text>
        </div>
      ) : null}

      {/* #1930.11 — la surface d'édition, ouverte par « Modifier », fermée par
          « Annuler ». Elle ne s'affiche jamais en même temps que les gestes :
          tant qu'on écrit, valider serait valider l'ANCIENNE version. */}
      {draft ? (
        <CardEditForm
          fields={editableFields}
          draft={draft}
          busy={working !== null}
          onChange={(key, value) => setDraft({ ...draft, [key]: value })}
          onCancel={() => setDraft(null)}
          onSave={() => void save(draft)}
          t={t}
        />
      ) : gestures.length > 0 || canModify ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {gestures.map(gesture => {
            const Icon = GESTURE_ICON[gesture]
            return (
              <Button
                key={gesture}
                size="sm"
                variant={gesture === 'confirm' ? 'default' : 'ghost'}
                onClick={() => void act(gesture)}
                disabled={working !== null}
              >
                <Icon className="size-3.5" />
                {working === gesture ? t('cards.working') : t(`cards.gesture.${gesture}`)}
              </Button>
            )
          })}
          {canModify ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setDraft(
                  Object.fromEntries(editableFields.map(field => [field.key, field.value])) as Record<string, string>,
                )
              }
              disabled={working !== null}
            >
              <Pencil className="size-3.5" />
              {t('cards.gesture.modify')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * #1930.11 — LE FORMULAIRE D'ÉDITION D'UNE CARTE, AVANT CONFIRMATION.
 *
 * Il ne connaît aucune forme de proposition : il rend ce que
 * `copilot-card-edit.ts` lui donne. C'est ce qui permet qu'une quinzième carte
 * n'ait rien à changer ici — et qu'aucune règle sur « ce qui se modifie » ne
 * vive à deux endroits.
 *
 * Chaque champ porte un vrai `<label>` lié par `htmlFor` : la carte vit dans un
 * fil qu'on parcourt au clavier, et un champ sans nom n'y est pas annonçable.
 */
function CardEditForm({
  fields,
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
  t,
}: {
  fields: readonly { key: string; labelKey: string; multiline: boolean }[]
  draft: Readonly<Record<string, string>>
  busy: boolean
  onChange: (key: string, value: string) => void
  onCancel: () => void
  onSave: () => void
  t: TFunction<'chat'>
}) {
  const inputClass = cn(
    'w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 text-xs text-[var(--bellum-text-primary)]',
    CHAT_SURFACE.focusRing,
  )
  return (
    <form
      className="mt-2.5 space-y-2"
      aria-label={t('cards.edit.title')}
      onSubmit={event => {
        event.preventDefault()
        onSave()
      }}
    >
      {fields.map(field => {
        const id = `card-edit-${field.key}`
        return (
          <div key={field.key} className="space-y-1">
            <label htmlFor={id} className="block text-xs text-[var(--bellum-text-muted)]">
              {t(field.labelKey)}
            </label>
            {field.multiline ? (
              <textarea
                id={id}
                rows={4}
                className={inputClass}
                value={draft[field.key] ?? ''}
                disabled={busy}
                onChange={event => onChange(field.key, event.target.value)}
              />
            ) : (
              <input
                id={id}
                type="text"
                className={inputClass}
                value={draft[field.key] ?? ''}
                disabled={busy}
                onChange={event => onChange(field.key, event.target.value)}
              />
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" type="submit" disabled={busy}>
          <Check className="size-3.5" />
          {busy ? t('cards.working') : t('cards.edit.save')}
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t('cards.edit.cancel')}
        </Button>
      </div>
      {/* Ce que le formulaire ne promet PAS : enregistrer ne lance rien. La
          validation reste un geste à part, et le coût est recalculé d'abord. */}
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('cards.edit.note')}
      </Text>
    </form>
  )
}

function run(gesture: RenderedGesture, runId: string): Promise<CopilotCardWire> {
  switch (gesture) {
    case 'confirm':
      return copilotCardsApi.confirm(runId)
    case 'reject':
      return copilotCardsApi.reject(runId)
    case 'snooze':
      return copilotCardsApi.snooze(runId)
    case 'retry':
      return copilotCardsApi.retry(runId)
    case 'cancel':
      return copilotCardsApi.cancel(runId)
    // Le `never` fait tomber la compilation si un geste s'ajoute au contrat sans
    // qu'on décide quoi en faire ici.
    default: {
      const exhaustive: never = gesture
      throw new Error(`CopilotCard: geste non traité ${String(exhaustive)}`)
    }
  }
}

type Row = { label: string; value: string }

/**
 * G.3 — « Outil utilisé : votre messagerie » ne dit pas où part le brouillon.
 * Pour un brouillon de messagerie, on nomme l'outil que l'espace a BRANCHÉ
 * (`connectedMailboxName`, jamais un fournisseur de Bellum) ; sans nom sûr
 * (aucune messagerie, ou deux), la capacité générique du serveur reste.
 */
function connectionLabel(card: CopilotCardWire, serverValue: string | null, mailboxName: string | null): string | null {
  if (card.action?.action === 'prepare_mail_draft' && mailboxName) return mailboxName
  return serverValue
}

/**
 * Les huit lignes de #1930, TELLES QUE LE SERVEUR LES A ÉCRITES.
 *
 * `whatWillHappen` est la phrase d'entête, elle ne se répète pas ici (loi 4 :
 * rien n'apparaît deux fois sous la même forme avec le même contenu). Une valeur
 * `null` ne produit AUCUNE ligne — « non mesuré » n'est pas une ligne vide, et
 * surtout pas un « 0 ».
 */
function previewRowsOf(card: CopilotCardWire, t: TFunction<'chat'>, mailboxName: string | null): Row[] {
  const preview = card.preview
  if (!preview) return []
  const rows: Row[] = []
  push(rows, t('cards.preview.target'), preview.targetObject)
  push(rows, t('cards.preview.destination'), preview.destination)
  push(rows, t('cards.preview.content'), preview.content)
  push(rows, t('cards.preview.dataUsed'), preview.dataUsed)
  push(rows, t('cards.preview.connection'), connectionLabel(card, preview.connectionUsed, mailboxName))
  push(rows, t('cards.preview.notDone'), preview.whatWillNotHappen)
  return rows
}

/** Les huit champs d'après-coup de #1931 — `null` = le run n'y est pas allé. */
function resultRowsOf(
  card: CopilotCardWire,
  t: TFunction<'chat'>,
  language: string,
  mailboxName: string | null,
): Row[] {
  const result = card.result
  if (!result) return []
  const rows: Row[] = []
  push(rows, t('cards.result.outcome'), result.outcome)
  // #1952.10 — « à HH:MM » : la date, quand le run en a une. `null` = pas encore
  // fini, pas une ligne — jamais un horodatage deviné.
  push(rows, t('cards.result.when'), formatDateTime(result.occurredAt, language))
  push(rows, t('cards.result.target'), result.targetObject)
  push(rows, t('cards.result.destination'), result.destination)
  // #2105.39 — l'outil utilisé, comme la prévisualisation le montrait déjà
  // (`cards.preview.connection`) : sans cette ligne, une carte EXÉCUTÉE
  // perdait le seul indice qui nommait la capacité (« votre agenda »…).
  push(rows, t('cards.result.connection'), connectionLabel(card, result.connectionUsed, mailboxName))
  // #1952.10 — une URL devient le lien « Ouvrir » (rendu par `CopilotCard`),
  // jamais les deux à la fois (loi 4) : la ligne ne porte qu'une référence qui
  // N'EST PAS un lien (une clé de routine, par exemple).
  if (!isHttpUrl(result.externalRef)) push(rows, t('cards.result.ref'), result.externalRef)
  push(rows, t('cards.result.actor'), result.actorName)
  // #1943.13 / #1943.14 — SEULEMENT sur un run `partial` (#1943.7) : `cardResultOf`
  // ne les pose que là, jamais devinés pour un `done`/`failed` qui n'ont rien de
  // partiel à nommer — `outcome` le dit déjà en entier.
  push(rows, t('cards.result.succeeded'), result.succeeded)
  push(rows, t('cards.result.notDone'), result.notDone)
  // #1952.32 — une LISTE absente ou vide ne fait aucune ligne (doctrine : on
  // n'affiche pas ce qu'on n'a pas). Les lignes du serveur sont déjà des
  // phrases complètes ; jointes, elles restent une ligne « à vérifier », pas
  // treize.
  if (result.toVerify && result.toVerify.length > 0) {
    push(rows, t('cards.result.toVerify'), result.toVerify.join(' · '))
  }
  push(rows, t('cards.result.next'), result.nextStep)
  return rows
}

function push(rows: Row[], label: string, value: string | null | undefined): void {
  if (value && value.trim()) rows.push({ label, value: value.trim() })
}

/** Une référence externe est un LIEN seulement si c'est vraiment une URL — une
 *  clé de routine ou un identifiant CRM interne reste une ligne de texte. */
function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false
  return value.startsWith('http://') || value.startsWith('https://')
}

/**
 * #1946.16 — tranché sans toi (decisions-louis-22-09-soir.md §12, aucune
 * recommandation écrite dans la ligne de registre) : version la plus
 * CONSERVATRICE. « Sans lire le texte du brouillon » (doctrine GA-264, et le
 * commentaire de `trackDraftReused` — « le DEGRÉ, jamais le texte ») est pris
 * au pied de la lettre : cette fonction ne compare JAMAIS le contenu des
 * champs, ni même leur égalité — seulement leur LONGUEUR. Une conséquence
 * assumée : deux textes de même longueur mais de contenu différent (« Bonjour »
 * → « Bonsoir ») ne se distinguent pas de « tel quel ». C'est le prix du
 * conservatisme, pas un oubli.
 *
 * Un champ dont la longueur n'a PAS bougé ⇒ `tel_quel`. Sinon, l'écart de
 * longueur le plus fort (sur les champs modifiables de cette carte) est
 * comparé à sa base : sous 60 %, une correction (`retouche`) ; à 60 % ou
 * au-delà — un champ vidé, un champ rempli depuis rien, ou une taille qui
 * change du tout au tout — une réécriture (`reecrit`).
 */
const DRAFT_REWRITE_LENGTH_RATIO = 0.6

function draftExtentOf(
  fields: readonly { key: string; value: string }[],
  patch: Readonly<Record<string, string>>,
): 'tel_quel' | 'retouche' | 'reecrit' | null {
  if (fields.length === 0) return null
  let maxRatio = 0
  for (const field of fields) {
    const beforeLength = field.value.length
    const afterLength = (patch[field.key] ?? '').length
    const base = Math.max(beforeLength, afterLength, 1)
    maxRatio = Math.max(maxRatio, Math.abs(afterLength - beforeLength) / base)
  }
  if (maxRatio === 0) return 'tel_quel'
  return maxRatio >= DRAFT_REWRITE_LENGTH_RATIO ? 'reecrit' : 'retouche'
}

/** `null` → aucune ligne — un run pas encore fini n'a pas de date, jamais « maintenant ». */
function formatDateTime(iso: string | null, language: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(language, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

/** Même tableau descriptif que `ActionPreview` : un `dl` encadré en région, donc annonçable. */
function CardRows({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section
      aria-label={title}
      className="mt-2.5 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2.5 py-2"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(row => (
          <div key={row.label} className="contents">
            <dt className="text-xs text-[var(--bellum-text-muted)]">{row.label}</dt>
            <dd className="min-w-0 break-words text-xs text-[var(--bellum-text-secondary)]">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * #2366.1 / #2366.2 — RELIT le message canonique par identifiant plutôt que de
 * garder pour toujours le texte figé de `result.content` : le MÊME objet que
 * `ContactOutreachMessagesCard` affiche sur la fiche Contact. `messageId`
 * `undefined` (aucun message canonique créé pour cette carte) fait passer le
 * hook en no-op strict — rien n'est appelé, rien ne s'affiche. Tant que la
 * relecture n'a encore rien rendu, rien ne s'affiche non plus : jamais un
 * contenu deviné ou un état d'avant l'arrivée de la donnée.
 */
function OutreachMessageLiveState({ messageId }: { messageId: string | undefined }) {
  // Sans message canonique, rien à relire : aucun hook de requête ni de session
  // n'est monté — la carte reste rendable partout où elle l'était avant.
  if (!messageId) return null
  return <OutreachMessageLiveBody messageId={messageId} />
}

function OutreachMessageLiveBody({ messageId }: { messageId: string }) {
  const { t } = useTranslation('outreach')
  const { data: message } = useOutreachMessage(messageId)
  if (!message) return null
  return (
    <div
      data-testid="outreach-message-live"
      className="mt-2.5 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2.5 py-2"
    >
      {/* i18n keys: messageStatus.idea | drafting | drafted | needs_review | approved |
          scheduled | sending | sent | delivered | bounced | replied | failed | cancelled |
          expired | copied_manual — mêmes clés que le centre d'approbation Outreach (GA-26). */}
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {t(`messageStatus.${message.status}`)}
      </Text>
      <Text size="sm" className="mt-1 whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
        {message.body}
      </Text>
    </div>
  )
}
