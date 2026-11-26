import type { ReactNode } from 'react'
import { useColleagueContactGuard } from '@/features/team-guardrails/components/ColleagueContactDialog'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useNavigate } from '@tanstack/react-router'
import { CHAT_SURFACE } from './chat-surface'
import { ReplyActionBlock } from './reply-kit'
import { isNavigationOnlyAction } from './navigation-only-action'
import { AddCvFromThread } from './AddCvFromThread'
// #2472 — la dérivation « critères → paramètres d'URL » vit à UN endroit (GA-26) :
// la carte de proposition et le lien écrit dans le texte de la réponse l'appellent
// tous les deux. La recopier ici l'aurait fait diverger au premier critère ajouté.
import { REGISTRY_REGIONS } from '@/features/discover/lib/discover-registry-vocab'
import { discoverSearch } from './discover-handoff'
import type { ChatScope } from '@/features/chat/scope/chat-scope'
// #1933.8 / #1903.20 — même dérivation « fil source → `from=chat:<id>` »
// pour toutes les navigations d'ici (GA-26).
import { returnToConversationSearch, withReturnToConversation } from '@/lib/return-to-conversation'

import {
  ArrowRightLeft,
  ListChecks,
  Briefcase,
  Bug,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  ClipboardList,
  Compass,
  Copy,
  Download,
  FileSignature,
  GitPullRequestArrow,
  CalendarPlus,
  Mail,
  Megaphone,
  PanelsTopLeft,
  PenLine,
  Pin,
  PhoneCall,
  Receipt,
  Archive,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UserSearch,
  SlidersHorizontal,
  StickyNote,
  Sunset,
  Target,
  ToggleLeft,
  Upload,
  UserPlus,
  UserRoundPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import type {
  Contact,
  CrmTaskProvider,
  MemoryScopeOffer,
  NeedStoredStatus,
  PendingChatAction,
  PipelineStage,
  ProjectStage,
  UpdateNotificationPreferences,
} from '@bellum/contracts'
import {
  defaultMemoryScope,
  FEEDBACK_MESSAGE_MAX,
  mailboxToolName,
  mailDraftHasProof,
  offerableMemoryScopes,
} from '@bellum/contracts'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Text, cn } from '@bellum/ui'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import type { MessageInsight } from '@/lib/message-insight'
import { actionsApi } from '@/features/actions/api'
import { assignPendingAction } from '@/features/chat/api/agentChatApi'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { gestureIdempotency } from '@/features/actions/lib/gesture-idempotency'
import { claimNotice } from '@/features/actions/lib/claim-notice'
import { attioApi } from '@/features/attio/api'
import { crmApi, type ExportContactInput } from '@/features/crm/api'
import { pipedriveApi } from '@/features/pipedrive/api'
import { zohoApi } from '@/features/zoho/api'
import { salesforceApi } from '@/features/salesforce/api'
import { contactsApi } from '@/features/contacts/api'
import { consultantsApi } from '@/features/consultants/api'
import { generateAtsCSV } from '@/features/consultants/lib/atsExport'
import { downloadDocument } from '@/features/documents/api'
import { downloadCSV } from '@/lib/export-csv'
import { feedbackApi } from '@/features/feedback/api'
import { collectReportContext } from '@/features/feedback/reportContext'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { targetListsApi } from '@/features/target-lists/api'
import { DEMO_CONTACT_ID_PREFIX } from '@/features/demo/demo-bulk-enrichment'
import { DEMO_NEED_ID_PREFIX } from '@/features/demo/demo-long-job'
import { mailboxApi } from '@/features/mailbox/api'
import { routinesApi } from '@/features/routines/api'
import { missionsApi, useMissionTerms } from '@/features/missions/api'
import { MarginScenarioSimulator } from '@/features/missions/view/MissionMarginEngine'
import { amendmentSimulationScenarioKind } from '@/features/missions/amendment-simulation'
import { projectsApi } from '@/features/projects/api'
import {
  bulkMatchingApi,
  needStatusApi,
  openNeedsKeys,
  startExternalSourcingSearchJob,
} from '@/features/projects/open-needs/api'
import { expensesApi } from '@/features/expenses/api'
import { notificationsApi } from '@/features/notifications/api'
import { stageSlaApi } from '@/features/settings/lib/stage-sla-api'
import { memoryApi, memoryKeys } from '@/features/memory/api'
import { MemoryScopeChoice } from '@/features/memory/view/MemoryScopeChoice'
import { MemoryDurationChoice } from '@/features/memory/view/MemoryDurationChoice'
import { memoryDurationIso, type MemoryDuration } from '@/features/memory/lib/memory-dates'
import { queryClient } from '@/lib/query-client'
import { useAnalysisStore } from '@/stores/analysisStore'
import { appRouteTarget } from '@/components/navigation/known-routes'
import { PlanRecap } from './PlanRecap'
import { DayClosureCard } from './DayClosureCard'
import { FocusPlanCard } from './FocusPlanCard'
import { WeeklyPlanCard } from './WeeklyPlanCard'
import { CallBriefCard } from './CallBriefCard'
import { MessageInsightPanel } from '@/components/message-insight/MessageInsightPanel'
import { chatErrorMessage } from '@/features/chat/chat-error'
import { ActionPreview } from '@/components/ActionPreview'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'

/**
 * Actions que le copilote PROPOSE — et que l'utilisateur seul déclenche.
 *
 * Le rapport V2 veut un copilote qui agit ; la règle produit interdit qu'un chat
 * écrive ou débite tout seul. La couture est ici : l'IA renvoie une action
 * *préparée* (`data.context.pending_actions`, cf. `apps/ia/app/services/chat_tools.py`,
 * qui ne fait QUE des lectures), l'écran l'affiche avec ce qu'elle fera exactement,
 * et c'est le clic qui appelle l'endpoint réel. Aucun effet avant le clic.
 *
 * ⚠️ LE TYPE `PendingChatAction` NE VIT PLUS ICI (16/09/2026, GA-26).
 *
 * Cet écran a déclaré pendant des mois sa propre union de treize variantes en
 * TypeScript pur, alors que `packages/contracts/src/schemas/copilot-card.ts`
 * dérive déjà la sienne d'un `z.discriminatedUnion` — celui que l'API valide à
 * l'exécution et que `copilotCardsApi.ts`, à trois fichiers d'ici, importait
 * déjà de `@bellum/contracts`. Deux chemins qui refont la même dérivation
 * divergent : `prepare_campaign` avait reçu son variant zod et attendait sur une
 * branche d'intégration, sans branche correspondante dans l'union d'ici.
 *
 * La source unique est le CONTRAT : un type validé au runtime bat un type
 * déclaré. Les variantes, leurs champs, leur optionalité et leurs bornes se
 * lisent là-bas ; l'écran ne fait que les rendre. Garde :
 * `apps/web/src/architecture/chat-actions-cross-language.test.ts`.
 *
 * Snake_case = la forme JSON exacte renvoyée par l'IA, comme `ChatResponseContext`.
 *
 * Même raison pour les 4 CRM exportables : `CrmTaskProvider` est l'enum du
 * contrat (`crmTaskProviderSchema`), celui qui pilote déjà l'export côté routeur
 * d'actions — l'écran en tenait une copie littérale sous le nom `CrmProviderId`.
 */

/**
 * Le CRM est nommé par sa capacité, jamais par son éditeur (addendum final p12,
 * décision Louis 02/08). Le `provider` continue de piloter l'appel réel — c'est
 * seulement sa restitution au commercial qui se généralise : « votre CRM » dit
 * la même chose sans exposer la chaîne d'outillage devant un client.
 */
function crmLabel(t: TFunction<'chat'>, _provider: CrmTaskProvider): string {
  return t('pending.crmGeneric')
}

const CRM_EXPORT: Record<CrmTaskProvider, (input: ExportContactInput) => Promise<{ id: string; created: boolean }>> = {
  hubspot: crmApi.exportContact,
  salesforce: salesforceApi.exportContact,
  pipedrive: pipedriveApi.exportContact,
  attio: attioApi.exportContact,
  zoho: zohoApi.exportContact,
}

/**
 * #3894.3 — une audience NOMMÉE se déplie en une carte `prepare_message` par
 * destinataire : le même geste, la même garantie (rien n'est envoyé), validé un
 * destinataire à la fois. Toute autre action passe telle quelle.
 */
function expandAudience(action: PendingChatAction): PendingChatAction[] {
  if (action.action !== 'prepare_message_audience') return [action]
  return action.recipients.map(recipient => ({
    action: 'prepare_message' as const,
    depends_on: action.depends_on,
    contact_id: recipient.contact_id,
    contact_name: recipient.contact_name ?? null,
    contact_title: recipient.contact_title ?? null,
    account_id: recipient.account_id ?? null,
    channel: action.channel,
    angle: action.angle ?? null,
    cost_credits: action.cost_credits,
    sends_email: action.sends_email,
  }))
}

const ACTION_ICON: Record<PendingChatAction['action'], LucideIcon> = {
  prepare_message: PenLine,
  // #3894.3 — l'audience est dépliée en cartes « prepare_message » avant le rendu ; l'icône reste exigée par le Record.
  prepare_message_audience: PenLine,
  schedule_reminder: CalendarClock,
  enrich_contact: Sparkles,
  export_contact_to_crm: Upload,
  find_accounts: Compass,
  prepare_mail_draft: Mail,
  prepare_calendar_event: CalendarPlus,
  open_screen: PanelsTopLeft,
  prepare_consultant_record: UserPlus,
  toggle_routine: ToggleLeft,
  update_setting: SlidersHorizontal,
  pin_memory_fact: Pin,
  start_account_analysis: ScanSearch,
  create_contact_from_crm: UserRoundPlus,
  // Épopée #2853 (#2157.1) — même geste que « Créer une cible » du dossier compte.
  create_target_list_from_account: Target,
  // Épopée #2781 (#2150.30, LOT j1 26/09) — même geste que CRM/recherche globale.
  add_account_to_portfolio: Briefcase,
  prepare_campaign: Megaphone,
  compile_need: ClipboardList,
  day_closure: Sunset,
  // #2423.9 — l'avenant : un changement sur une mission déjà signée.
  propose_mission_amendment: FileSignature,
  // #2391 — le plan de journée : des blocs de temps sur l'agenda.
  propose_focus_plan: CalendarRange,
  // #2770.55-.62 — le plan de semaine : la même famille, une semaine d'agenda.
  propose_weekly_plan: CalendarDays,
  // #2324.39 — une mise à jour d'opportunité, diff à l'appui.
  propose_opportunity_update: GitPullRequestArrow,
  // #2376 — le brief d'appel avant une prospection.
  prepare_cold_call: PhoneCall,
  // Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — même geste que
  // `prepare_consultant_record` : une route vers un écran déjà réel.
  push_profile: UserPlus,
  // #2320.26/.27 (épopée #2967) — une transition de statut sur un besoin.
  propose_need_transition: ArrowRightLeft,
  // #2987.56 — une décision (valider/refuser) sur une note de frais soumise.
  decide_expense_report: Receipt,
  // #3345.2 — une piste à qualifier écartée ou reportée.
  decide_qualification_lead: Archive,
  // Épopée #2955 (#2394.6/.19/.43) — une note écrite sur une fiche CRM déjà là.
  propose_crm_note: StickyNote,
  // #1952.3 / #1952.7 (épopée #2844) — un travail long lancé en tâche de fond.
  propose_long_job: ListChecks,
  // #2434.56 (épopée #3579) — l'enrichissement en masse, même glyphe que l'enrichissement d'un contact.
  propose_bulk_enrichment: Sparkles,
  // #3871.1 (lot V11, 07/10) — un contact qui passe en historique, même glyphe qu'un écartement.
  propose_contact_departure: Archive,
  // #3950.1 (décision Louis 09/10/2026, lot G01) — même glyphe que le bouton
  // de l'écran (`VivierExportMenu`, `AtsExportButton`, `BulkExportButton`).
  launch_vivier_export: Download,
  // #3869.a (lot M05, 09/10) — chercher de nouvelles personnes sur un rôle non pourvu.
  propose_people_search: UserSearch,
  // #2433.7 (lot M10, 09/10) — le signalement préparé depuis une capture.
  prepare_bug_report: Bug,
}

/**
 * #1768 — UNE ROUTE PROPOSÉE PAR LE MODÈLE RESTE DANS L'APPLICATION.
 *
 * `route` traverse le modèle, et l'union TypeScript n'est validée par personne
 * à l'exécution (le JSON de l'IA est casté tel quel). « Commence par `/` » ne
 * suffit pas : `//ailleurs.example` commence par `/` et quitte le domaine, et
 * `/\ailleurs.example` en fait autant dans plusieurs navigateurs. Une
 * redirection ouverte pilotée par un modèle n'est pas un défaut d'affichage.
 *
 * ⚠️ #1778 — ET ELLE DOIT EXISTER. La version du 09/09 refusait ce qui SORT du
 * domaine, et acceptait `/decouvrir` — qui reste dans l'application et rend un
 * 404 (l'écran est `/discover`). Ce dépôt a déjà servi une route émise par
 * l'API que la SPA ne portait pas (`/messagerie` contre `/mailbox`). La
 * vérification vit désormais à UN seul endroit, partagée avec les liens du
 * texte de Laura (GA-277).
 */
function internalRoute(route: string): string | null {
  return appRouteTarget(route)
}

/** Une carte à la fois : préparée → en cours → faite (ou refusée). */
type CardState =
  | { phase: 'proposed' }
  | { phase: 'running' }
  | { phase: 'dismissed' }
  | { phase: 'failed'; reason: string }
  | ({ phase: 'draft'; subject: string; body: string } & MessageInsight)
  /** #1995 — `contactId` : la fiche que le clic vient de créer (ou celle qui
   *  existait déjà). Présent = l'issue porte un LIEN vers elle, sinon la carte
   *  dirait « c'est fait » sans dire où.
   *  #1931.18 — `webUrl` : le lien RÉEL rendu par le serveur (aujourd'hui, le
   *  brouillon mail déposé) — jamais deviné, absent quand le fournisseur n'en
   *  donne pas. */
  /** #2423.9 — `missionId` : la mission dont l'avenant vient d'être enregistré
   *  comme `proposed`, pour le lien « Ouvrir la mission ». */
  /** #2277.34 (épopée #2771) — `draftId` : l'identifiant RÉEL rendu par la
   *  messagerie pour un brouillon `prepare_mail_draft`, seule cible que
   *  `delete_draft` accepte. Présent = le rollback a un sens ici. */
  | { phase: 'scheduled'; label: string; contactId?: string; webUrl?: string; missionId?: string; draftId?: string }
  /** #1940.7 — attribuée à un collègue plutôt que confirmée soi-même : une
   *  notification RÉELLE est partie (`assignPendingAction`), jamais un simple
   *  texte. Terminal, comme `scheduled` — la carte ne propose plus de confirmer. */
  | { phase: 'assigned'; assigneeName: string }

export function PendingActions({
  actions,
  mailboxName = null,
  obsolete = false,
  scopeOptions,
  scope,
  onOpenScope,
  conversationId = null,
  isDemo = false,
}: {
  actions: PendingChatAction[]
  /**
   * #3950.1 — la salle de démonstration, dite par l'APPELANT (`MessageBubble`,
   * qui seul a accès à `useIsDemo()` dans l'arbre RÉEL du produit) — jamais
   * un hook posé ici : cette carte générique est aussi montée, nue, par
   * `PendingActions.test.tsx`, sans fournisseur de session. `false` par
   * défaut : une surface réelle ne bascule jamais en démo sans le dire.
   */
  isDemo?: boolean
  /**
   * #1933.8 / #1903.20 — le fil qui a produit CETTE proposition, pour que le
   * lien qu'elle ouvre porte `?from=chat:<id>` (« Revenir à la conversation »,
   * `ReturnToConversationBanner.tsx`). `null` = appelant qui ne le connaît
   * pas encore : la route reste inchangée, jamais un `from` deviné.
   */
  conversationId?: string | null
  /**
   * #1912.11 — décision Louis 13/09/2026, batch 11 : le nom de la messagerie
   * que l'espace a BRANCHÉE, quand il n'en a qu'une (`connectedMailboxName`).
   * `null` = on dit « ta messagerie », jamais un nom deviné.
   */
  mailboxName?: string | null
  /**
   * #1953.14 — cette proposition vient d'une branche ABANDONNÉE (réessai,
   * autre angle, message modifié) : `PendingActionCard` ne l'offre plus à la
   * confirmation. Un résultat DÉJÀ CONNU (`scheduled`/`failed`) reste affiché
   * tel quel — on archive, on ne supprime pas.
   */
  obsolete?: boolean
  /**
   * #1918.2 / #1918.5 — les portées PROPOSABLES ici, calculées par l'écran
   * (`useMemoryScopeOptions`) et descendues en prop. Absentes : les deux
   * portées durables, c'est-à-dire exactement ce que cette carte offrait avant
   * ce lot — une suite montée sans fournisseur react-query en reste là.
   */
  scopeOptions?: readonly MemoryScopeOffer[]
  /**
   * #1957.4 — le périmètre COURANT de la conversation. Absent (appelant qui ne
   * le connaît pas encore) = le raccourci « Limiter le périmètre » ne s'affiche
   * pas, plutôt que de supposer un périmètre large.
   */
  scope?: ChatScope
  /** Ouvre le SEUL sélecteur du produit (`ScopeDialog`, celui de l'en-tête) —
   *  jamais un second, posé ici (GA-26). */
  onOpenScope?: () => void
}) {
  // ⚠️ CE HOOK EST AU-DESSUS DE LA SORTIE ANTICIPÉE, ET IL DOIT Y RESTER.
  // `react-hooks/rules-of-hooks` a rougi la CI le 16/09/2026 : posé après le
  // `return null`, il n'était appelé que sur les rendus où `actions` n'était pas
  // vide. Une liste qui se vide puis se remplit changeait alors l'ordre des
  // hooks entre deux rendus du MÊME composant — React associe son état par
  // rang d'appel, donc l'état des cartes ignorées serait allé se coller sur le
  // hook suivant. Un `new Set()` vide ne coûte rien quand il n'y a rien à rendre.
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(new Set())
  const { t: tChat } = useTranslation('chat')
  if (actions.length === 0) return null
  // #3894.3 — une audience (plusieurs contacts NOMMÉS par la personne) se déplie
  // en UNE carte « préparer un message » par destinataire, chacune validable à part.
  const audiences = actions.filter(
    (action): action is Extract<PendingChatAction, { action: 'prepare_message_audience' }> =>
      action.action === 'prepare_message_audience',
  )
  const cards = actions.flatMap(expandAudience)
  /**
   * Numérotées à partir de DEUX, jamais à partir d'une.
   *
   * La maquette montre « 1. / 2. / 3. » et c'est juste : quand Laura propose
   * plusieurs gestes, ils s'enchaînent, et le rang dit par où commencer. Mais un
   * « 1. » solitaire n'apprend rien et laisse attendre un « 2. » qui n'existe
   * pas — il annonce une séquence là où il n'y a qu'un geste.
   *
   * ⚠️ Le rang est un ORDRE SUGGÉRÉ, pas une dépendance : rien n'empêche de
   * confirmer la troisième d'abord. Le verrouiller supposerait que le modèle
   * sache que l'étape 2 a besoin de l'étape 1, ce qu'il ne dit nulle part — et
   * griser un bouton sur une dépendance devinée bloquerait un geste légitime.
   *
   * #1950.22 — sur les cartes GOUVERNÉES (`CopilotCards.tsx`), le modèle peut
   * désormais DÉCLARER une dépendance (`depends_on`) : elle bloque l'étape si son
   * prérequis a échoué. Ici (legs, état local non persisté), rien ne change : le
   * rang reste un ordre suggéré, et une dépendance n'est jamais devinée.
   */
  const numbered = cards.length > 1
  /**
   * #1950.16 — SUPPRIMER UNE ÉTAPE MET À JOUR LE PLAN, PAS SEULEMENT LA CARTE.
   *
   * `dismissed` était un état PUREMENT LOCAL à `PendingActionCard` (son
   * `CardState`) : ignorer une carte la faisait disparaître sans jamais
   * toucher au tableau `actions` que ce composant reçoit — `PlanRecap`
   * continuait donc à compter et à facturer une étape que plus personne ne
   * voyait. Le lever ICI est le seul endroit qui touche aux DEUX : il ne crée
   * aucun nouvel état de PLAN (juste posé au-dessus de ce qui est TOUJOURS
   * dérivé des cartes encore proposées), donc #1950.24 (« pas de deuxième
   * vérité ») reste vrai — le décompte est recalculé à chaque rendu, jamais
   * mémorisé à part.
   */
  const visibleActions = cards.filter(
    (action, index) => !dismissedKeys.has(`${action.action}-${cardKey(action)}-${index}`),
  )
  return (
    <>
      {/* #1950.3 — le récapitulatif du plan, AU-DESSUS des cartes : il les lit,
          il ne touche à aucune (`PlanRecap`). */}
      <PlanRecap actions={visibleActions} />
      {/* #3894.3 — c74 assoupli : plusieurs destinataires NOMMÉS par la personne.
          Le bandeau dit combien, et NOMME ceux que les garde-fous ont écartés
          (opt-out, relance identique…) — jamais retirés en silence. */}
      {audiences.map(audience => (
        <div
          key={`audience-${cardKey(audience)}`}
          role="note"
          className="mt-2 space-y-1 text-sm text-[var(--bellum-text-secondary)]"
        >
          <p>{tChat('pending.audienceTitle', { count: audience.recipients.length })}</p>
          {(audience.skipped ?? []).map((skipped, index) => (
            <p key={`${skipped.contact_name ?? 'unknown'}-${index}`}>
              {tChat('pending.audienceSkipped', {
                name: skipped.contact_name ?? tChat('pending.audienceSkippedUnknown'),
                reason: skipped.reason,
              })}
            </p>
          ))}
        </div>
      ))}
      <ol className="mt-2 w-full space-y-2">
        {cards.map((action, index) => {
          const key = `${action.action}-${cardKey(action)}-${index}`
          return (
            <li key={key} className="flex items-start gap-2">
              {numbered ? (
                <span
                  aria-hidden
                  className="mt-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]"
                >
                  {index + 1}
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                {/* #2392 — la clôture de journée a SA carte : sept sections et une
                    décision par tâche, pas la prévisualisation d'un geste unique. */}
                {action.action === 'day_closure' ? (
                  <DayClosureCard closure={action.closure} />
                ) : action.action === 'propose_focus_plan' ? (
                  // #2391 — même raison : le plan de journée a SA carte, pas la
                  // prévisualisation d'un geste unique.
                  <FocusPlanCard plan={action.plan} />
                ) : action.action === 'propose_weekly_plan' ? (
                  // #2770.55-.62 — le plan de semaine a SA carte : les jours de la semaine.
                  <WeeklyPlanCard plan={action.plan} />
                ) : action.action === 'prepare_cold_call' ? (
                  <CallBriefCard action={action} scope={scope} onOpenScope={onOpenScope} />
                ) : (
                  <PendingActionCard
                    action={action}
                    mailboxName={mailboxName}
                    obsolete={obsolete}
                    scopeOptions={scopeOptions}
                    scope={scope}
                    onOpenScope={onOpenScope}
                    conversationId={conversationId}
                    isDemo={isDemo}
                    onDismiss={() => setDismissedKeys(prev => new Set(prev).add(key))}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )
}

/**
 * #2322 — LA VALEUR D'UN CHAMP DU BESOIN COMPILÉ, ou `null`.
 *
 * `null` ne fait AUCUNE ligne à l'écran : un champ que la source n'a pas dit
 * n'est pas un champ vide, c'est une inconnue — et elle se dit ailleurs, avec
 * sa question.
 */
function needField(action: Extract<PendingChatAction, { action: 'compile_need' }>, field: string): string | null {
  const entry = action.compiled.fields.find(candidate => candidate.field === field)
  if (!entry) return null
  const value = entry.value
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    const items = value
      .map(item => (typeof item === 'object' && item !== null && 'term' in item ? String(item.term) : String(item)))
      .filter(Boolean)
    return items.length > 0 ? items.join(', ') : null
  }
  return null
}

/** Le titre compilé, sinon le travail à réaliser — jamais une carte sans nom. */
function needTitle(action: Extract<PendingChatAction, { action: 'compile_need' }>): string | null {
  return needField(action, 'title') ?? needField(action, 'work_to_do')
}

/**
 * #2423.9 — UN TERME D'AVENANT (`previous_term`/`new_term`) EN TEXTE LISIBLE, ou `null`.
 *
 * Ces deux champs sont des `Record<string, unknown>` libres côté contrat —
 * seize types d'événements ne partagent pas la même forme de terme (un TJM est
 * un nombre, une pause n'en a pas). Cette fonction ne TRADUIT rien, elle rend
 * la matière que Laura a posée. Absent ou vide → `null` : jamais une valeur
 * inventée pour « faire complet ».
 */
function amendmentTermLabel(term: Record<string, unknown> | null | undefined): string | null {
  if (!term) return null
  const entries = Object.entries(term).filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (entries.length === 0) return null
  return entries.map(([key, value]) => `${key} : ${String(value)}`).join(', ')
}

/**
 * Le DIFF affiché AVANT le clic : « ancien → nouveau » quand les deux sont
 * connus, le nouveau seul quand l'ancien ne l'est pas — jamais un ancien terme
 * inventé. `null` quand il n'y a rien de nouveau à annoncer (les événements
 * sans « terme », comme une pause) : aucune ligne plutôt qu'un diff vide.
 */
function amendmentDiffLabel(
  action: Extract<PendingChatAction, { action: 'propose_mission_amendment' }>,
): string | null {
  const next = amendmentTermLabel(action.new_term)
  if (!next) return null
  const previous = amendmentTermLabel(action.previous_term)
  return previous ? `${previous} → ${next}` : next
}

/** Les trois champs qu'on peut avoir à NOMMER comme manquants (#2322.77). */
const NEED_MISSING_LABEL: Record<string, string> = {
  work_to_do: 'pending.needMissingWork',
  expected_outcome: 'pending.needMissingOutcome',
  skills: 'pending.needMissingSkills',
}

/** Clé stable par carte — une recherche n'a pas de contact à nommer, et une
 *  ouverture d'écran non plus. */
function cardKey(action: PendingChatAction): string {
  if (action.action === 'find_accounts') return action.keywords ?? ''
  if (action.action === 'prepare_mail_draft') return action.to
  if (action.action === 'prepare_calendar_event') return `${action.starts_at}:${action.title}`
  if (action.action === 'open_screen') return action.route
  if (action.action === 'prepare_consultant_record') return action.full_name
  // Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — l'affaire ET le consultant
  // visé (s'il est connu) : deux propositions de push sur la même affaire ne
  // sont pas la même carte dès qu'elles ciblent des profils différents.
  if (action.action === 'push_profile') return `${action.project_id}:${action.consultant_id ?? ''}`
  if (action.action === 'toggle_routine') return action.key
  if (action.action === 'update_setting') return `${action.screen}:${action.field}`
  if (action.action === 'pin_memory_fact') return action.fact
  // D1 — une analyse ne porte pas de contact : c'est le compte qui l'identifie.
  if (action.action === 'start_account_analysis') return action.company
  // #1995 — la fiche n'existe pas encore : il n'y a pas de contact_id à donner,
  // seulement le nom que le CRM porte, sur ce compte-là.
  if (action.action === 'create_contact_from_crm') return `${action.account_id}:${action.full_name}`
  if (action.action === 'prepare_campaign') return action.contacts.map(c => c.contact_id).join(',')
  // #2322 — deux emails différents sur le même compte ne sont pas le même
  // besoin : la clé porte la SOURCE, jamais le seul compte.
  // #2392 — une clôture par jour : la date suffit à la distinguer.
  if (action.action === 'day_closure') return `day_closure:${action.closure.date}`
  if (action.action === 'compile_need')
    return `${action.compiled.source.kind}:${action.compiled.source.locator ?? ''}:${needTitle(action) ?? ''}`
  // #2423.9 — la mission, le type de changement et sa date d'effet : deux
  // avenants différents sur la même mission ne sont pas la même proposition.
  if (action.action === 'propose_mission_amendment')
    return `${action.mission_id}:${action.event_type}:${action.effective_from}`
  // #2391 — même raison que `day_closure` : un plan par jour, la date suffit.
  if (action.action === 'propose_focus_plan') return `focus_plan:${action.plan.date}`
  // #2770.55-.62 — une semaine par lundi, comme un plan par jour.
  if (action.action === 'propose_weekly_plan') return `weekly_plan:${action.plan.week_start}`
  // #2324.39 — l'opportunité et CE qui change : deux diffs sur la même
  // opportunité ne sont pas la même proposition.
  if (action.action === 'propose_opportunity_update')
    return `${action.project_id}:${action.changes.map(c => `${c.field}=${String(c.next)}`).join(',')}`
  // Épopée #2853 (#2157.1) — le compte ET le nom de liste demandé : deux
  // listes différentes proposées sur le même compte ne sont pas la même carte.
  if (action.action === 'create_target_list_from_account') return `${action.account_id}:${action.name ?? ''}`
  // Épopée #2781 (#2150.30) — le nom d'entreprise et le SIREN (s'il est
  // connu) : deux propositions d'ajout pour la même entreprise sont la même
  // carte, même raison que `enrich_contact`.
  if (action.action === 'add_account_to_portfolio') return `${action.company_name}:${action.siren ?? ''}`
  // #2320.26/.27 (épopée #2967) — le besoin ET le statut visé : deux
  // transitions différentes sur le même besoin ne sont pas la même carte.
  if (action.action === 'propose_need_transition') return `${action.need_id}:${action.to_status}`
  // #2987.56 — la note ET la décision visée : valider puis refuser (ou
  // l'inverse) sur la même note ne sont pas la même carte.
  if (action.action === 'decide_expense_report') return `${action.expense_report_id}:${action.decision}`
  // #3345.2 — la piste ET la décision : écarter puis reporter la même piste ne sont pas la même carte.
  if (action.action === 'decide_qualification_lead') return `${action.lead_key}:${action.decision}`
  // #1952.3 / #1952.7 — le travail ET les besoins visés : deux lots différents ne sont pas la même carte.
  if (action.action === 'propose_long_job') return `${action.job}:${[...action.need_ids].sort().join(',')}`
  // #2434.56 — l'ensemble des contacts visés : un autre lot n'est pas la même carte.
  if (action.action === 'propose_bulk_enrichment')
    return action.contacts
      .map(c => c.contact_id)
      .sort()
      .join(',')
  // #3950.1 — deux lancements du même mode ne sont pas deux propositions distinctes.
  if (action.action === 'launch_vivier_export') return action.mode
  // #3869.a — le compte ET les rôles cherchés : d'autres rôles ne sont pas la même carte.
  if (action.action === 'propose_people_search')
    return `${action.account_id}:${[...action.roles].sort().join(',')}:${action.expertise ?? ''}:${action.sector ?? ''}:${action.scope ?? ''}`
  // #2433.7 — le constat lui-même : deux signalements différents ne sont pas la même carte.
  if (action.action === 'prepare_bug_report') return `bug:${action.message}`
  // #3894.3 — l'ensemble des destinataires : une autre audience n'est pas la même carte.
  if (action.action === 'prepare_message_audience') return action.recipients.map(r => r.contact_id).join(',')
  return action.contact_id
}

function PendingActionCard({
  action,
  mailboxName,
  obsolete = false,
  scopeOptions,
  scope,
  onOpenScope,
  conversationId = null,
  isDemo = false,
  onDismiss,
}: {
  action: PendingChatAction
  mailboxName: string | null
  /** #1953.14 — voir `PendingActions`. */
  obsolete?: boolean
  /** #1918.2 / #1918.5 — voir `PendingActions`. */
  scopeOptions?: readonly MemoryScopeOffer[]
  /** #1957.4 — voir `PendingActions`. */
  scope?: ChatScope
  onOpenScope?: () => void
  /** #1933.8 / #1903.20 — voir `PendingActions`. */
  conversationId?: string | null
  /** #3950.1 — voir `PendingActions`. */
  isDemo?: boolean
  /** #1950.16 — prévient le parent, qui seul sait recalculer `PlanRecap`. */
  onDismiss: () => void
}) {
  const { t, i18n } = useTranslation('chat')
  // #1912.11 — décision 13/09 batch 11 : « brouillon dans Gmail » quand l'espace
  // a branché UNE messagerie, « dans ta messagerie » sinon.
  const mailbox = mailboxName ?? t('pending.yourMailbox')
  const navigate = useNavigate()
  const [state, setState] = useState<CardState>({ phase: 'proposed' })
  // #2081.14 — pousser la fiche dans le CRM est une SORTIE de données : sous la
  // règle d'espace « administrateurs seulement », la carte ne l'offre pas (le
  // bouton est masqué) et dit pourquoi. L'API refuse aussi la route.
  const dataExit = useDataExit()
  // #3950.1 — même règle d'espace que l'export CRM : la règle « qui peut
  // exporter » tient aussi le lancement de l'export du vivier depuis Laura.
  const refusedByRule =
    (action.action === 'export_contact_to_crm' || action.action === 'launch_vivier_export') && !dataExit.allowed
  // #1930.14 — LE DIFF CHAMP À CHAMP QUE L'EXPORT CRM N'AFFICHAIT PAS.
  //
  // La proposition fige les champs à l'instant où Laura l'a construite
  // (`chat_tools.py::export_contact_to_crm`, lecture directe de la fiche). S'ils
  // ont changé depuis — une correction humaine arrivée entre la proposition et le
  // clic — le clic écraserait cette correction dans le CRM SANS le montrer.
  // `currentContact` relit la fiche RÉELLE juste avant d'afficher la
  // prévisualisation ; `null` tant qu'elle n'est pas là, jamais une valeur
  // devinée — `previewRows` retombe alors sur la valeur qui va partir, sans diff.
  const [currentCrmContact, setCurrentCrmContact] = useState<Contact | null>(null)
  const crmContactId = action.action === 'export_contact_to_crm' ? action.contact_id : null
  useEffect(() => {
    if (!crmContactId) return
    let cancelled = false
    contactsApi
      .getOne(crmContactId)
      .then(contact => {
        if (!cancelled) setCurrentCrmContact(contact)
      })
      .catch(() => {
        // Une lecture manquée ne bloque rien : la carte retombe sur la valeur
        // qui va partir (voir `pushCrmFieldRow`), jamais une donnée inventée.
      })
    return () => {
      cancelled = true
    }
  }, [crmContactId])
  // #2783 — L'IMPACT D'UN AVENANT AVANT VALIDATION (épopée « simulation impact
  // avenant », #2423.6). `simulateMissionMarginScenario` (#2420.14) existe côté
  // serveur depuis le moteur de marge, mais AUCUN chemin de l'avenant ne
  // l'appelait (constat du tri : `mission-amendment.service.ts`/`.controller.ts`,
  // zéro appelant). `amendmentSimulationScenarioKind` décide seule quels types
  // d'événement portent un TJM ou une date à chiffrer (TJM, durée, dates —
  // portée de l'épopée) ; les treize autres rendent `null` et n'affichent rien.
  // Déclaré pour toute carte (règle des hooks), lu par la seule carte d'avenant
  // dont le type s'y prête. `useMissionTerms` reste `enabled: false` sinon —
  // aucun aller-retour réseau pour les cartes qui n'en ont pas l'usage.
  const amendmentSimKind =
    action.action === 'propose_mission_amendment' ? amendmentSimulationScenarioKind(action.event_type) : null
  const amendmentTerms = useMissionTerms(
    action.action === 'propose_mission_amendment' && amendmentSimKind ? action.mission_id : undefined,
  )
  // #1917.3 — POUR QUI Laura enregistre ce qu'elle propose d'épingler, choisi
  // AVANT le clic. Défaut de la décision du 12/09 (`defaultMemoryScope`) : « toi
  // uniquement ». La proposition de Laura ne porte pas de nature (`kind`), donc
  // l'exception « correction d'un compte » ne s'y applique pas — voir le rapport
  // du lot. Déclaré pour toute carte (règle des hooks), lu par la seule carte
  // d'épinglage.
  // #1918.2 / #1918.5 — les portées PROPOSABLES, et le choix courant qui en est
  // un. `offerableMemoryScopes({})` — les deux durables — quand l'écran n'en a
  // pas fourni : le comportement d'avant ce lot, mot pour mot.
  const offers = scopeOptions ?? offerableMemoryScopes({})
  const [memoryScope, setMemoryScope] = useState<MemoryScopeOffer>(() => ({
    scope: defaultMemoryScope({ accountId: action.action === 'pin_memory_fact' ? (action.account_id ?? null) : null }),
  }))

  // #1917.6 — JUSQU'À QUAND ce que Laura propose d'épingler vaut. « Sans
  // échéance » par défaut : c'est ce que faisait tout épinglage avant ce lot.
  // Déclaré pour toute carte (règle des hooks), lu par la seule carte d'épinglage.
  const [memoryDuration, setMemoryDuration] = useState<MemoryDuration>('none')

  // #1995 bis — LE SECOND GESTE, APRÈS LE PREMIER CLIC, SANS NOUVEAU TOUR DE
  // MODÈLE. `create_contact_from_crm` peut porter un rappel demandé dans le
  // même message (`pending_reminder_at`) — hors de portée tant que la fiche
  // n'existe pas. Une fois le premier clic terminé (`state.phase ===
  // 'scheduled'`, `contactId` connu), ce second état PROPRE gère le second
  // clic : deux gestes, deux validations, mais la MÊME réponse de Laura les a
  // annoncés tous les deux. Déclaré pour toute carte (règle des hooks), lu par
  // la seule carte de création CRM qui porte un rappel en attente.
  const [reminderFollowUp, setReminderFollowUp] = useState<
    { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; label: string } | { phase: 'failed'; reason: string }
  >({ phase: 'idle' })

  /**
   * #2277.34 (épopée #2771) — le rollback de `prepare_mail_draft` : `delete_draft`
   * était livré et testé côté routeur sans aucun appelant web. Aucune trace
   * persistée d'un brouillon créé n'existe ailleurs (`create_mail_draft` ne
   * journalise rien) — seul CET état, tenu tant que la carte reste montée,
   * connaît encore `draftId`. Même état propre que `reminderFollowUp`
   * ci-dessus, déclaré pour toute carte, lu par la seule carte `prepare_mail_draft`.
   */
  const [draftRemoval, setDraftRemoval] = useState<
    { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; label: string } | { phase: 'failed'; reason: string }
  >({ phase: 'idle' })

  const Icon = ACTION_ICON[action.action] as LucideIcon | undefined
  const running = state.phase === 'running'

  /**
   * #1940.7 — ATTRIBUER LA PROCHAINE ACTION À UN COLLÈGUE, plutôt que la
   * confirmer soi-même. `useWorkspaceMembers` (même registre que #1940.1 et
   * `ActionExecuteMenu.tsx`, GA-26) ; on ne se propose jamais soi-même — c'est
   * ce que « Confirmer » fait déjà.
   */
  const workspaceMembers = useWorkspaceMembers()
  const assignableMembers = (workspaceMembers.data ?? []).filter(member => !member.isSelf)
  const [assigning, setAssigning] = useState(false)
  async function assignTo(memberId: string, memberName: string) {
    setAssigning(true)
    try {
      // Beaucoup de variantes de `PendingChatAction` portent `account_id`
      // (pas toutes — `open_screen`/`find_accounts` par exemple) : `in` lit
      // celle-ci quand elle existe, jamais devinée sinon.
      const accountId = 'account_id' in action ? (action.account_id ?? null) : null
      await assignPendingAction({ conversationId, accountId }, describe(action, t, i18n.language), memberId)
      setState({ phase: 'assigned', assigneeName: memberName })
      onDismiss()
    } catch {
      toast.error(t('pending.assignError'))
    } finally {
      setAssigning(false)
    }
  }

  async function confirm() {
    setState({ phase: 'running' })
    try {
      // Le clic — et lui seul — appelle l'endpoint réel. Tous les chemins
      // réutilisent des routes existantes, dont les gardes (appartenance,
      // opt-out, crédits) restent la vérité côté serveur.
      if (action.action === 'prepare_message') {
        // #3894.3 — un destinataire de la SALLE (identifiant `demo-contact-…`) n'existe pas en
        // base : rien n'est généré, la carte le dit au lieu d'échouer (même règle que le lot
        // d'enrichissement de la salle).
        if (action.contact_id.startsWith(DEMO_CONTACT_ID_PREFIX)) {
          setState({ phase: 'scheduled', label: t('pending.messageDemo') })
          return
        }
        const draft = await generateDraft(action)
        setState({
          phase: 'draft',
          subject: draft.subject,
          body: draft.body,
          rationale: draft.rationale,
          alternativeAngle: draft.alternativeAngle,
          brief: draft.brief,
          specificity: draft.specificity,
          toneOptions: draft.toneOptions,
          knowledgeSources: draft.knowledgeSources,
          lexiconWarning: draft.lexiconWarning,
        })
        return
      }
      if (action.action === 'enrich_contact') {
        const result = await contactsApi.enrich(action.contact_id, {
          ...splitFullName(action.contact_name),
          organization_name: action.organization_name,
          // LOT (15/10) DATA-B.5 — la coordonnée absente seule : l'autre n'est ni cherchée ni facturée.
          ...(action.only ? { only: action.only } : {}),
        })
        const found = [result.email && t('pending.enrichEmail'), result.phone && t('pending.enrichPhone')]
          .filter(Boolean)
          .join(' + ')
        // Rien trouvé = rien débité : on le dit plutôt que d'afficher un succès
        // vide (le serveur ne facture que ce qu'il a résolu).
        setState({
          phase: 'scheduled',
          label: found ? t('pending.enrichDone', { found }) : t('pending.enrichNotFound'),
          // #2150.41 — la porte d'entrée Laura > Contact : `action.contact_id`
          // était déjà connu (c'est l'entrée de l'appel), il ne restait
          // porté nulle part. `Ouvrir la fiche` (#1995) est déjà générique
          // sur tout `contactId` — aucun bouton neuf.
          contactId: action.contact_id,
        })
        return
      }
      if (action.action === 'propose_bulk_enrichment') {
        // #2434.56 (épopée #3579) — LE CLIC EST LA PORTE DE DÉPENSE : Laura a annoncé le
        // plafond, le commercial le lit et valide UNE fois. Route unitaire déjà là
        // (`POST contacts/:id/enrich`), contact par contact — facturée au contact RÉSOLU
        // seulement, aucun second chemin d'écriture. Une erreur ARRÊTE le lot (solde épuisé,
        // service tombé) : on dit où on s'est arrêté, on ne continue pas à débiter à l'aveugle.
        // La carte de la SALLE (identifiants `demo-contact-…`) ne débite rien et le dit.
        if (action.contacts.every(contact => contact.contact_id.startsWith(DEMO_CONTACT_ID_PREFIX))) {
          setState({ phase: 'scheduled', label: t('pending.bulkEnrichDemo') })
          return
        }
        let found = 0
        let processed = 0
        let stopped = false
        for (const contact of action.contacts) {
          try {
            const result = await contactsApi.enrich(contact.contact_id, {
              ...splitFullName(contact.contact_name),
              organization_name: contact.organization_name,
              // LOT (15/10) DATA-B.5 — voir `enrich_contact` ci-dessus.
              ...(contact.only ? { only: contact.only } : {}),
            })
            if (result.email || result.phone) found += 1
            processed += 1
          } catch (error) {
            if (processed === 0) throw error
            stopped = true
            break
          }
        }
        void queryClient.invalidateQueries({ queryKey: ['contacts'] })
        setState({
          phase: 'scheduled',
          label: t(stopped ? 'pending.bulkEnrichStopped' : 'pending.bulkEnrichDone', {
            found,
            processed,
            total: action.contacts.length,
          }),
        })
        return
      }
      if (action.action === 'export_contact_to_crm') {
        // #1959.4 / #1959.6 — LE CHAT APPELLE CET ENDPOINT EN DIRECT, sans
        // passer par `dispatchIdempotent` : un double clic ou deux onglets
        // créaient deux fiches CRM. La porte `OutboundWriteService` savait
        // déjà dédupliquer par clé — seul HubSpot la reçoit ici : les trois
        // autres fournisseurs n'ont pas cette porte (leur schéma HubSpot est
        // `.strict()` chez Salesforce ; ajouter le champ à leur charge utile
        // romprait l'export au lieu de le protéger).
        const crmGesture = gestureIdempotency('chat-card.export_contact_to_crm', [action.contact_id, action.provider])
        const result =
          action.provider === 'hubspot'
            ? await crmApi.exportContact({ ...buildCrmInput(action), idempotencyKey: crmGesture.key })
            : await CRM_EXPORT[action.provider](buildCrmInput(action))
        crmGesture.release()
        setState({
          phase: 'scheduled',
          label: t(result.created ? 'pending.crmCreated' : 'pending.crmUpdated', {
            provider: crmLabel(t, action.provider),
          }),
          // #2150.41 — même geste que l'enrichissement : le contact exporté
          // est déjà connu (`action.contact_id`), la fiche reste ouvrable.
          contactId: action.contact_id,
        })
        return
      }
      if (action.action === 'create_contact_from_crm') {
        // #1995 — LE CLIC CRÉE, ET LUI SEUL. La proposition n'a aucun chemin
        // d'écriture : côté service IA l'outil ne fait que relire le compte.
        // Le serveur refuse ici le doublon (e-mail puis nom) et l'ambiguïté —
        // « on PROPOSE une fusion de doublons, on ne fusionne JAMAIS ».
        const result = await contactsApi.createFromCrm(action.account_id, {
          full_name: action.full_name,
          title: action.job_title ?? null,
          email: action.email ?? null,
          crm_reference: action.crm_reference ?? null,
        })
        if (result.status === 'ambiguous') {
          // Plusieurs fiches répondent au même critère : on le DIT, on ne
          // choisit pas à la place de quelqu'un.
          setState({ phase: 'failed', reason: t('pending.contactAmbiguous', { count: result.matches }) })
          return
        }
        setState({
          phase: 'scheduled',
          label: t(result.status === 'created' ? 'pending.contactCreated' : 'pending.contactAlreadyExists', {
            name: action.full_name,
          }),
          contactId: result.contact_id,
        })
        return
      }
      if (action.action === 'create_target_list_from_account') {
        // Épopée #2853 (#2157.1) — LE CLIC CRÉE, ET LUI SEUL : même patron que
        // `useCreateTargetFromAccount.ts` (#2164.44, la surface « Analyser »),
        // réutilisé tel quel via `targetListsApi` (GA-26) plutôt que recodé —
        // seules la source et la provenance changent (`'laura'`, jamais
        // `'analysis'` : les deux surfaces sont routées séparément par #2853).
        const name = action.name?.trim() || t('pending.createTargetListDefaultName', { company: action.company })
        const list = await targetListsApi.create({ name, source: 'laura' })
        await targetListsApi.addItem(list.id, { kind: 'account', ref_id: action.account_id, provenance: 'laura' })
        setState({ phase: 'scheduled', label: t('pending.createTargetListDone', { list: list.name }) })
        return
      }
      if (action.action === 'add_account_to_portfolio') {
        // Épopée #2781 (#2150.30) — LE CLIC APPELLE LA PORTE, ET LUI SEUL :
        // même route que #2150.32 (CRM) et #2150.42 (recherche globale),
        // réutilisée telle quelle via `accountsApi.addToPortfolio` (GA-26).
        // Les facultatifs ne partent QUE s'ils étaient déjà dans la carte —
        // jamais un `undefined` transformé en valeur devinée.
        const input: Parameters<typeof accountsApi.addToPortfolio>[0] = { company_name: action.company_name }
        if (action.siren) input.siren = action.siren
        if (action.sector) input.sector = action.sector
        if (action.website) input.website = action.website
        const account = await accountsApi.addToPortfolio(input)
        setState({
          phase: 'scheduled',
          label: t('pending.addToPortfolioDone', { company: account.company_name }),
        })
        return
      }
      if (action.action === 'propose_mission_amendment') {
        // #2423.9 — LE CLIC ENREGISTRE LA PROPOSITION, RIEN DE PLUS.
        //
        // Même porte que le dossier de la mission (`POST delivery/missions/:id
        // /amendments`, `records:write`, espace vérifié) : aucun second chemin
        // d'écriture. L'avenant reste `proposed` — l'accepter puis le mettre
        // en vigueur restent des gestes distincts, posés dans le dossier de la
        // mission (doctrine : Laura prépare, un humain valide, jamais un
        // accord obtenu).
        await missionsApi.proposeAmendment(action.mission_id, {
          eventType: action.event_type,
          effectiveFrom: action.effective_from,
          proof: action.proof,
          ...(action.previous_term ? { previousTerm: action.previous_term } : {}),
          ...(action.new_term ? { newTerm: action.new_term } : {}),
          ...(action.pause_cause ? { pauseCause: action.pause_cause } : {}),
          ...(action.note ? { note: action.note } : {}),
        })
        setState({ phase: 'scheduled', label: t('pending.missionAmendmentProposed'), missionId: action.mission_id })
        return
      }
      if (action.action === 'propose_opportunity_update') {
        // #2324.39 — LE CLIC DU COMMERCIAL EST LA DÉCISION (doctrine : une
        // écriture sur geste utilisateur s'auto-approuve), et il n'écrit QUE ce
        // que la carte a montré. Mêmes routes que l'écran de l'opportunité
        // (`PATCH /projects/:id/stage|amount|btmmp|risks`, `records:write`, espace
        // vérifié) : aucun second chemin d'écriture.
        for (const change of action.changes) {
          if (change.field === 'stage') await projectsApi.updateStage(action.project_id, change.next as ProjectStage)
          else if (change.field === 'estimated_amount') await projectsApi.updateAmount(action.project_id, change.next)
          else if (change.field === 'next_step')
            await projectsApi.updateBtmmp(action.project_id, { nextStep: change.next })
          // #2324.37 — le risque a sa propre route : jamais glissé dans la qualification.
          else await projectsApi.updateRisks(action.project_id, change.next)
        }
        setState({ phase: 'scheduled', label: t('pending.opportunityUpdated', { label: action.project_label }) })
        return
      }
      if (action.action === 'propose_need_transition') {
        // #2320.26/.27 (épopée #2967) — LE CLIC DU COMMERCIAL EST LA DÉCISION,
        // même doctrine que `propose_opportunity_update` juste au-dessus. Même
        // route que la porte d'état du besoin (`PATCH /projects/needs/:id
        // /status`, `needStatusApi.change`) : aucun second chemin d'écriture.
        // Le verdict a déjà été vérifié côté outil (`needTransitionCheck`)
        // avant l'émission de cette carte — le clic ne fait que rejouer la
        // même route que l'écran du besoin.
        // #2967 (lot V39) — source `laura` : le journal dira que cette
        // transition a été PROPOSÉE par Laura et VALIDÉE par ce clic.
        await needStatusApi.change(action.need_id, action.to_status as NeedStoredStatus, action.reason, 'laura')
        // #3345.2 (LAU-FINAL-255, recette prod 30/09) — MÊMES clés que
        // `useNeedActions` (l'écran du besoin, GA-26) : sans elles, Matching /
        // Aujourd'hui / Vivier / Pilotage restaient sur leur cache TanStack
        // Query PÉRIMÉ jusqu'à leur propre refetch, alors que l'écriture avait
        // déjà eu lieu par la même route.
        void queryClient.invalidateQueries({ queryKey: openNeedsKeys.all })
        void queryClient.invalidateQueries({ queryKey: ['projects'] })
        setState({ phase: 'scheduled', label: t('pending.needTransitionDone') })
        return
      }
      if (action.action === 'propose_contact_departure') {
        // #3871.1 (lot V11, 07/10) — LE CLIC DU COMMERCIAL EST LA DÉCISION,
        // même doctrine que `propose_need_transition` juste au-dessus. Même
        // route que la fiche contact (`POST /contacts/:id/departed`,
        // `contactsApi.markDeparted`) : aucun second chemin d'écriture. On
        // ARCHIVE (`historique`), jamais de suppression.
        await contactsApi.markDeparted(action.contact_id)
        void queryClient.invalidateQueries({ queryKey: ['contacts'] })
        setState({
          phase: 'scheduled',
          label: t('pending.contactDepartureDone', { name: action.contact_name || t('pending.unknownContact') }),
          contactId: action.contact_id,
        })
        return
      }
      if (action.action === 'propose_long_job') {
        // #1952.3 / #1952.7 (épopée #2844) — LE CLIC LANCE, Laura n'a fait que
        // proposer. Mêmes routes que l'écran (`POST needs/match/bulk`,
        // `POST projects/needs/:id/external-sourcing/search/bulk`) : aucun second
        // chemin d'écriture. Le travail tourne en tâche de fond — la carte dit
        // « lancé », jamais « terminé ».
        // #2844 — la carte de la SALLE (identifiants `demo-need-…`) ne lance rien
        // et le dit : un lancement annoncé sans avoir eu lieu serait faux.
        if (action.need_ids.every(id => id.startsWith(DEMO_NEED_ID_PREFIX))) {
          setState({ phase: 'scheduled', label: t('pending.longJobDemo') })
          return
        }
        if (action.job === 'bulk_matching') await bulkMatchingApi.enqueue(action.need_ids)
        else await startExternalSourcingSearchJob(action.need_ids[0] as string, action.max_per_source)
        setState({ phase: 'scheduled', label: t('pending.longJobStarted') })
        return
      }
      if (action.action === 'propose_people_search') {
        // #3869.a (lot M05, 09/10) — LE CLIC EST LA PORTE DE DÉPENSE : Laura a
        // proposé le compte et les rôles, le commercial lit le coût et valide.
        // MÊME route que la découverte fraîche de `/accounts`
        // (`POST contacts/discover/:accountId`) — aucun second chemin
        // d'écriture ; débit APRÈS succès, seulement si quelqu'un est trouvé.
        // Une personne trouvée devient un contact À VÉRIFIER : rien n'est
        // envoyé. La carte de la SALLE ne lance rien et le dit.
        if (isDemo) {
          setState({ phase: 'scheduled', label: t('pending.peopleSearchDemo') })
          return
        }
        // #4058 — expertise, secteur et périmètre voyagent SÉPARÉS jusqu'à l'exécution.
        const intent = {
          ...(action.expertise ? { expertise: action.expertise } : {}),
          ...(action.sector ? { sector: action.sector } : {}),
          ...(action.scope ? { scope: action.scope } : {}),
        }
        const outcome =
          Object.keys(intent).length > 0
            ? await accountsApi.discoverFreshContacts(action.account_id, action.roles, intent)
            : await accountsApi.discoverFreshContacts(action.account_id, action.roles)
        void queryClient.invalidateQueries({ queryKey: ['contacts'] })
        // #4058 — une panne de recherche n'est JAMAIS présentée comme une absence
        // de personnes : seuls `ok`/`empty` disent « personne de nouveau ».
        const searchRan = outcome.status === 'ok' || outcome.status === 'empty'
        setState({
          phase: 'scheduled',
          label:
            outcome.created > 0
              ? t('pending.peopleSearchDone', { count: outcome.created })
              : searchRan
                ? t('pending.peopleSearchNone')
                : t('pending.peopleSearchUnavailable'),
        })
        return
      }
      if (action.action === 'prepare_bug_report') {
        // #2433.7 (épopée #2876, lot M10 09/10) — LE CLIC ENVOIE, ET LUI SEUL,
        // par LA porte du formulaire de signalement (`POST /feedback`,
        // `feedbackApi.create`) — jamais un second chemin. La salle de
        // démonstration n'envoie rien et le dit (l'API la refuse aussi).
        if (isDemo) {
          setState({ phase: 'scheduled', label: t('pending.bugReportDemo') })
          return
        }
        // Ne part que ce que la carte a MONTRÉ (#1960.7 : on ne consent pas à ce
        // qu'on ne voit pas) — la page, le navigateur, la version ; ni journaux
        // ni appels en échec, que la carte n'affiche pas.
        const report = collectReportContext()
        const message = action.route
          ? `${action.message}\n\n${t('pending.bugReportRouteLine', { route: action.route })}`
          : action.message
        await feedbackApi.create({
          category: 'bug',
          message: message.slice(0, FEEDBACK_MESSAGE_MAX),
          pageUrl: report.pageUrl,
          userAgent: report.userAgent,
          appContext: report.appContext,
        })
        setState({ phase: 'scheduled', label: t('pending.bugReportSent') })
        return
      }
      if (action.action === 'launch_vivier_export') {
        // #3950.1 (décision Louis 09/10/2026, lot G01) — LE CLIC APPELLE LE
        // MÊME SERVICE QUE LE BOUTON DE L'ÉCRAN (`VivierExportMenu`, Réglages
        // › Mes données › Exports) : `talents/export/ats` ou `talents/export/bulk`
        // — aucun second chemin d'export. La carte de la SALLE ne lance rien
        // et le dit, même raison que `propose_long_job` juste au-dessus.
        if (isDemo) {
          setState({ phase: 'scheduled', label: t('pending.vivierExportDemo') })
          return
        }
        if (action.mode === 'ats') {
          if (!dataExit.grant) return
          const report = await consultantsApi.exportAts()
          if (report.items.length === 0) {
            setState({ phase: 'scheduled', label: t('pending.vivierExportEmpty') })
            return
          }
          const csv = generateAtsCSV(report.items)
          downloadCSV(csv, `vivier-ats-${new Date().toISOString().slice(0, 10)}.csv`, dataExit.grant)
          setState({ phase: 'scheduled', label: t('pending.vivierExportDone') })
          return
        }
        const started = await consultantsApi.enqueueBulkExport()
        let job = started
        while (job.status === 'queued' || job.status === 'processing') {
          await new Promise(resolve => setTimeout(resolve, 1500))
          job = await consultantsApi.bulkExportJobState(started.id)
        }
        if (job.status === 'failed') {
          setState({ phase: 'failed', reason: t('pending.vivierExportFailed') })
          return
        }
        if (job.rowCount === 0) {
          setState({ phase: 'scheduled', label: t('pending.vivierExportEmpty') })
          return
        }
        await downloadDocument(`/talents/export/bulk/${job.id}/download`, `vivier-${job.id}.csv`)
        setState({ phase: 'scheduled', label: t('pending.vivierExportDone') })
        return
      }
      if (action.action === 'decide_qualification_lead') {
        // #3345.2 — LE CLIC EST LA DÉCISION : MÊME route que l'écran Opportunités
        // (`QualificationLeadsQueue.tsx`, `records:write`), le MÊME corps — l'API
        // revalide (`leadDecisionInputSchema` : écartement = motif, report =
        // échéance). Rien n'est supprimé : la décision se reprend depuis l'écran.
        await apiFetch({
          path: `/accounts/${action.account_id}/qualification-leads/${action.lead_key}/decision`,
          method: 'POST',
          body: {
            decision: action.decision,
            reason: action.decision === 'dismissed' ? action.reason : null,
            note: action.note,
            snoozed_until: action.decision === 'snoozed' ? action.snoozed_until : null,
          },
        })
        void queryClient.invalidateQueries({ queryKey: ['qualification-leads', 'decisions', action.account_id] })
        setState({
          phase: 'scheduled',
          label: t(action.decision === 'dismissed' ? 'pending.leadDismissed' : 'pending.leadSnoozed'),
        })
        return
      }
      if (action.action === 'decide_expense_report') {
        // #2987.56 — LE CLIC EST LA DÉCISION, même doctrine que
        // `propose_need_transition` juste au-dessus : même route que l'écran
        // des notes de frais (`POST /expenses/reports/:id/validate|reject`,
        // `finance:write`) — aucun second chemin d'écriture. La note a déjà
        // été RELUE côté outil (toujours dans la file des SOUMISES) avant
        // l'émission de cette carte — « confirmation vocale seule
        // insuffisante pour une dépense importante » (#2434) est tenue par
        // construction : ce clic reste un geste explicite, jamais un
        // enchaînement automatique depuis une session vocale.
        if (action.decision === 'validate') await expensesApi.validate(action.expense_report_id)
        else await expensesApi.reject(action.expense_report_id, action.reason ?? '')
        setState({
          phase: 'scheduled',
          label: t(action.decision === 'validate' ? 'pending.expenseReportValidated' : 'pending.expenseReportRejected'),
        })
        return
      }
      if (action.action === 'prepare_mail_draft') {
        // Le brouillon est déposé dans la VRAIE messagerie : c'est la preuve
        // d'exécution que les rapports réclament, et rien n'est envoyé.
        //
        // #1959.3 — LE CHAT APPELLE CET ENDPOINT EN DIRECT, sans passer par
        // `dispatchIdempotent` : un double clic ou deux onglets déposaient
        // deux brouillons. Même mécanique que `schedule_reminder` juste plus
        // bas : une clé par geste, relâchée sur une issue CONNUE (ici, tout
        // retour réussi — cet appel n'a pas d'état `unknown` séparé).
        const draftGesture = gestureIdempotency('chat-card.prepare_mail_draft', [
          action.to,
          action.subject,
          action.body,
        ])
        const draft = await mailboxApi.createDraft({
          to: action.to,
          cc: [],
          subject: action.subject,
          body: action.body,
          appendSignature: true,
          documentIds: [],
          idempotencyKey: draftGesture.key,
          ...(action.thread_id ? { threadId: action.thread_id } : {}),
          // #2955 (#2394.57, décision Louis 28/09) — le fil de CETTE
          // conversation : sert au serveur à relire les participants déjà
          // connus de `action.thread_id` (état de conversation persisté),
          // jamais une nouvelle lecture de la messagerie. Sans fil déclaré,
          // aucune vérification côté serveur — comportement inchangé.
          ...(action.thread_id && conversationId ? { conversationId } : {}),
        })
        draftGesture.release()
        // #1912.11 — l'outil où le brouillon a VRAIMENT atterri, lu sur le
        // résultat réel : il peut différer de celui supposé avant le clic.
        const landedIn = mailboxToolName(draft.provider) ?? t('pending.yourMailbox')
        // #2394.62 — « déposé » exige la MÊME preuve ici que côté serveur
        // (`mailDraftHasProof`, GA-26) : un `draftId` seul, sans `messageId`
        // ni `threadId`, ne dit RIEN de vérifiable sur où le brouillon a
        // atterri — l'affirmer quand même serait le NO-GO de #2394.
        if (!mailDraftHasProof(draft)) {
          setState({ phase: 'failed', reason: t('pending.mailDraftNoProof', { mailbox: landedIn }) })
          return
        }
        setState({
          phase: 'scheduled',
          label: draft.webUrl
            ? t('pending.mailDraftSavedWithLink', { mailbox: landedIn })
            : t('pending.mailDraftSaved', { mailbox: landedIn }),
          // #1931.18 — le lien RÉEL du brouillon déposé, quand le fournisseur en rend un.
          webUrl: draft.webUrl ?? undefined,
          // #2277.34 (épopée #2771) — l'id RÉEL du brouillon, seule cible que
          // `delete_draft` accepte (`MailDraftPort.deleteDraft`).
          draftId: draft.draftId,
        })
        return
      }
      if (action.action === 'find_accounts') {
        // Aucun appel : on ouvre Découvrir pré-rempli sur les critères annoncés.
        // #1933.8 — `from=chat:<id>` quand le fil source est connu, pour le
        // bouton « Revenir à la conversation » de l'écran ouvert.
        await navigate({
          to: '/discover',
          search: { ...discoverSearch(action), ...returnToConversationSearch(conversationId) },
        })
        return
      }
      if (action.action === 'prepare_campaign') {
        // #1935.22 — aucun appel : on ouvre Séquences pré-rempli sur l'audience
        // et le contexte annoncés. La création réelle reste le geste de cet
        // écran, contact par contact. #1933.8 — même `from` que ci-dessus.
        await navigate({
          to: '/actions/sequences',
          search: { ...campaignSearch(action), ...returnToConversationSearch(conversationId) },
        })
        return
      }
      // #2392 — la clôture s'exécute dans `DayClosureCard` (une décision par
      // tâche, puis `PATCH /tasks/:id`) : jamais par ce bouton générique.
      if (action.action === 'day_closure') return
      // #2391 — même raison : `FocusPlanCard` se rend seule, et ce lot n'a
      // aucun bouton « créer » (#2391.38 reste `retenu`) — rien à faire ici.
      if (action.action === 'propose_focus_plan') return
      // #2770.55-.62 — `WeeklyPlanCard` se rend seule, ses gestes sont ceux de chaque jour.
      if (action.action === 'propose_weekly_plan') return
      // #2376 — le brief d'appel se lit lui-même dans `CallBriefCard` (branches,
      // mode live) : aucune écriture, aucun bouton générique à câbler ici.
      if (action.action === 'prepare_cold_call') return
      // #3894.3 — l'audience est dépliée en cartes `prepare_message` (`expandAudience`) :
      // aucun clic ne porte sur l'audience elle-même, chaque destinataire se valide seul.
      if (action.action === 'prepare_message_audience') return
      if (action.action === 'compile_need') {
        // #2322 — aucun appel : on ouvre le créateur de besoin. La création
        // reste le geste de cet écran-là, qui porte déjà sa porte
        // (`POST /projects/needs`) — un second chemin d'écriture ici ferait
        // deux façons de créer le même objet.
        //
        // ⚠️ #2942 — RÉFUTÉ le 26/09/2026 : `create: '1'` ouvrait le créateur
        // D'OPPORTUNITÉ (`CreateProjectDialog`, `POST /projects`), jamais le
        // créateur DE BESOIN que le paragraphe ci-dessus annonce depuis
        // #2322 — les deux portes ne créent PAS le même objet.
        // `create_need: '1'` ouvre la BONNE porte (`CreateNeedDialog`), avec
        // `provenance: 'model'` : c'est ce qui manquait pour que la
        // provenance d'un besoin issu de Laura s'écrive enfin.
        //
        // ⚠️ #2942 (reste du 26/09) — la provenance voyageait seule, le
        // formulaire restait vide : le titre et le contexte compilés (déjà
        // LUS pour l'affichage de cette même carte, `needTitle`/`needField`
        // ci-dessus) voyagent maintenant avec elle. Rien d'autre n'est
        // inventé : `undefined` quand Laura ne les a pas dits, jamais un
        // champ vide envoyé pour « faire complet ».
        //
        // ⚠️ #2942 (reste du 26/09, 2ᵉ tranche) — compétences et TJM voyagent
        // à leur tour. `needField(action, 'skills')` rend déjà la MÊME liste
        // jointe par virgules pour l'aperçu de cette carte (`pending.needSkills`
        // ci-dessus) : ce n'est pas une structure nouvelle, c'est la forme
        // déjà affichée. `target_tjm_cents` est un entier compilé par Laura,
        // en centimes — jamais reconverti.
        //
        // ⚠️ #2942 (recette écran 27/09/2026) — LE COMPTE VISÉ voyage à son
        // tour : `compiled.account_id` (le compte RAPPROCHÉ, #2322.16) quand
        // il l'est, sinon `compiled.company_hint` (le nom lu dans la source,
        // déjà celui qu'affiche `describeCompileNeed` ci-dessus, jamais un
        // compte deviné au plus proche). Sans lui, la recherche de
        // compte/projet de l'étape 1 s'ouvrait vide — comme si Laura n'avait
        // rien dit du client.
        await navigate({
          to: '/projects',
          search: {
            create_need: 1 as const,
            need_title: needTitle(action) ?? undefined,
            need_context: needField(action, 'work_to_do') ?? undefined,
            need_skills: needField(action, 'skills') ?? undefined,
            need_tjm_cents: (() => {
              const raw = needField(action, 'target_tjm_cents')
              const parsed = raw ? Number(raw) : NaN
              return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
            })(),
            need_account_id: action.compiled.account_id ?? undefined,
            need_account_name: action.compiled.company_hint ?? undefined,
            ...returnToConversationSearch(conversationId),
          },
        })
        return
      }
      if (
        action.action === 'open_screen' ||
        action.action === 'prepare_consultant_record' ||
        action.action === 'push_profile'
      ) {
        // Aucun appel, aucune écriture : ces propositions n'ouvrent qu'un
        // écran. La route vient du modèle — on refuse tout ce qui sortirait de
        // l'application plutôt que de « faire au mieux ».
        const target = internalRoute(action.route)
        if (!target) {
          setState({ phase: 'failed', reason: t('pending.failed') })
          return
        }
        // #1933.8 — le lien porte le fil source, quand il est connu.
        await navigate({ to: withReturnToConversation(target, conversationId) })
        return
      }
      if (action.action === 'toggle_routine') {
        // La route existante de Réglages › Routines — authentifiée JWT,
        // idempotente. On rapporte l'état RÉEL que le serveur renvoie, jamais
        // ce qui a été demandé : un second clic sur « désactiver » doit
        // toujours lire `enabled: false`, jamais son propre optimisme.
        // #1822 — le patch ne porte QUE ce qui change. `PATCH /routines/:key`
        // accepte un patch partiel : y glisser un `hour` ou un `channel` par
        // défaut écraserait le réglage de la personne au passage, sans qu'elle
        // l'ait demandé ni vu.
        const updated = await routinesApi.update(action.key, {
          enabled: action.enabled,
          ...(typeof action.hour === 'number' ? { hour: action.hour } : {}),
          ...(typeof action.weekday === 'number' ? { weekday: action.weekday } : {}),
          ...(action.channel ? { channel: action.channel } : {}),
        })
        setState({
          phase: 'scheduled',
          label: t(updated.subscription.enabled ? 'pending.routineToggled.on' : 'pending.routineToggled.off', {
            label: routineLabel(action, t),
          }),
        })
        return
      }
      if (action.action === 'update_setting') {
        // LOT 16 (#1822) — le clic appelle la MÊME route authentifiée que
        // l'écran de réglages lui-même : aucune nouvelle porte. `screen`
        // choisit LAQUELLE — deux écrans seulement, les deux vérifiés côté
        // service IA contre le catalogue réel avant d'arriver ici.
        if (action.screen === '/settings/notifications') {
          // `field` est une chaîne RÉSOLUE server-side contre le catalogue
          // réel (`get_settings_overview`) — jamais devinée ici. Le cast est
          // nécessaire parce que `UpdateNotificationPreferences` est un type
          // à clés NOMMÉES, et cette carte ne connaît le nom qu'à l'exécution.
          await notificationsApi.updatePreferences({
            [action.field]: action.new_value,
          } as unknown as UpdateNotificationPreferences)
        } else if (action.screen === '/settings/pipeline') {
          await stageSlaApi.set(action.field as PipelineStage, action.new_value as number)
        } else {
          // Un écran que ce front ne sait pas encore écrire — la fenêtre
          // « front ancien, serveur neuf » déjà payée ailleurs dans ce dépôt.
          setState({ phase: 'failed', reason: t('pending.failed') })
          return
        }
        setState({
          phase: 'scheduled',
          label: t('pending.settingUpdated', { label: settingLabel(action, t) }),
        })
        return
      }
      if (action.action === 'start_account_analysis') {
        // D1 — décision Louis 14/09/2026 : proposer une analyse = une carte à valider, le clic est la décision.
        //
        // Le clic emprunte la MÊME route que l'écran (`POST /analysis/start`,
        // permission `analysis:run`, coût résolu par la grille côté serveur) :
        // aucune porte neuve, et aucun second chemin de débit à côté de celui
        // que le produit utilise depuis toujours. Le coût affiché plus haut vient
        // de la proposition du serveur — l'écran ne le recalcule jamais.
        //
        // ⚠️ Le jeton de préparation est la PREUVE qu'un plan existe. Sans lui,
        // on ne lance pas : c'est l'ordre que le serveur tient déjà sur le
        // chemin conversationnel (« prépare d'abord »), et une carte sans plan
        // serait une carte qu'on ne sait pas justifier.
        if (!action.plan_token.trim()) {
          setState({ phase: 'failed', reason: t('pending.analysisNeedsPlan') })
          return
        }
        const started = await apiFetch<
          { jobId: string; accountId: string; launched?: boolean; reason?: 'cache_hit' | 'in_flight' | 'demo_replay' },
          { company_name: string }
        >({
          path: '/analysis/start',
          method: 'POST',
          // #2520 — même démarrage dédoublonné par le serveur que `/search` :
          // rejouable sur une panne de redéploiement (`transient-retry.ts`).
          idempotent: true,
          body: { company_name: action.company },
        })
        // `launched === false` = le serveur a court-circuité (dossier déjà frais) :
        // RIEN n'a été enqueué, donc rien n'a été débité. On le DIT, plutôt que
        // d'afficher un lancement qui n'a pas eu lieu (même règle que
        // « rien trouvé = rien débité » de l'enrichissement).
        //
        // #2729 — un run réellement en vol entre dans `analysisStore`, le
        // magasin PARTAGÉ que `/search`, la fiche de compte ET la pastille
        // « Tâches de fond » (visible depuis N'IMPORTE QUEL écran, y compris
        // /chat, dans l'en-tête de la barre latérale) lisent tous les trois.
        // Sans ce geste, une analyse lancée d'ici qui se bloquait ou échouait
        // n'était annoncée NULLE PART tant qu'on ne rouvrait pas la fiche du
        // compte à la main — c'était le trou nommé par #2729.
        //
        // Même distinction que `useAnalysis.ts` (`/search`) : `reason ===
        // 'in_flight'` REJOINT un run déjà en cours ailleurs — `adopt()` ne
        // réinitialise jamais une position déjà avancée, contrairement à
        // `start()`, qui la remettrait à 0 %.
        if (started.launched !== false) {
          if (started.reason === 'in_flight') {
            useAnalysisStore.getState().adopt(started.accountId, started.jobId, action.company)
          } else {
            useAnalysisStore.getState().start(started.accountId, started.jobId, action.company)
          }
          // #4667 — « Mes analyses » lit la liste des comptes (`staleTime` 30 s) : sans ce geste, l'analyse lancée
          // d'ici n'y apparaissait qu'une fois le cache périmé (même geste que `useAnalysis` au lancement de /search).
          void queryClient.invalidateQueries({ queryKey: accountKeys.all })
        }
        setState({
          phase: 'scheduled',
          label:
            started.launched === false
              ? t('pending.analysisAlreadyFresh', { company: action.company })
              : t('pending.analysisStarted', { company: action.company }),
        })
        return
      }
      if (action.action === 'pin_memory_fact') {
        // #1793 — la MÊME route que le pin manuel de Réglages › Mémoire.
        // `origin: 'copilot'` distingue ce qui vient de Laura de ce que la
        // personne a tapé elle-même, sans changer où ça atterrit.
        // #1917.3 — la portée choisie sur la carte part avec l'épinglage.
        await memoryApi.pinFact({
          fact: action.fact,
          accountId: action.account_id ?? null,
          origin: 'copilot',
          scope: memoryScope.scope,
          // #1918.2 / #1918.5 — ce que la portée DÉSIGNE. Le serveur vérifie
          // l'appartenance au périmètre : le corps désigne, il n'autorise pas.
          businessUnitId: memoryScope.businessUnitId ?? null,
          conversationId: memoryScope.conversationId ?? null,
          // #1917.6 — l'échéance CHOISIE part avec l'épinglage. `null` tant que
          // personne n'en a choisi une : « sans échéance » est une réponse.
          expiresAt: memoryDurationIso(memoryDuration),
        })
        // #1901.10 — « une information ajoutée à la mémoire depuis une bulle doit
        // être visible dans la page principale ». Cette carte vit dans `/chat` ET
        // dans la bulle, mais les deux lectures de la mémoire (« garde en tête »
        // sous le fil, Réglages › Mémoire) sont en cache 30 s : sans ceci, le fait
        // qu'on vient d'épingler n'y apparaissait pas. Le client IMPORTÉ (celui que
        // `App.tsx` fournit) plutôt que `useQueryClient` : cette carte se monte
        // dans des suites qui n'ont pas de fournisseur, et un hook de plus les
        // ferait toutes tomber.
        void queryClient.invalidateQueries({ queryKey: memoryKeys.all })
        // #1917 — « après validation », la carte dit POUR QUI c'est enregistré.
        setState({
          phase: 'scheduled',
          label: t(`pending.factPinnedScope.${memoryScope.scope}`, { name: memoryScope.businessUnitName ?? '' }),
        })
        return
      }
      // G.1 (recette R3 19/10) — l'événement préparé par Laura se CRÉE ici, au clic, dans l'agenda branché
      // (`create_calendar_event`, le routeur d'actions). La clé d'idempotence est celle de la proposition :
      // un double clic ne crée pas deux événements.
      if (action.action === 'prepare_calendar_event') {
        const gesture = gestureIdempotency('chat-card.prepare_calendar_event', [action.title, action.starts_at])
        const result = await actionsApi.dispatch({
          type: 'create_calendar_event',
          title: action.title,
          startsAt: new Date(action.starts_at).toISOString(),
          durationMinutes: action.duration_minutes ?? 30,
          attendees: action.attendees ?? [],
          ...(action.note ? { note: action.note } : {}),
          idempotencyKey: gesture.key,
        })
        if (result.status !== 'unknown') gesture.release()
        const claimed = claimNotice(result.claim, t, i18n.language)
        if (result.status === 'done' || result.status === 'queued') {
          setState({ phase: 'scheduled', label: claimed ?? result.reason ?? t('pending.calendarEventDone') })
          return
        }
        if (claimed) {
          setState({ phase: 'scheduled', label: claimed })
          return
        }
        setState({ phase: 'failed', reason: result.reason ?? t('pending.failed') })
        return
      }
      // Épopée #2955 (#2394.6/.19/.43) — le writeback CRM depuis un fil de
      // messagerie : une NOTE sur une fiche DÉJÀ là, jamais un export. Même
      // route que `export_contact_to_crm` (`actionsApi.dispatch`), mais
      // `create_crm_note` cherche la fiche par email côté routeur — rien à
      // résoudre ici, contrairement à `crmProvider` sur l'export.
      if (action.action === 'propose_crm_note') {
        const gesture = gestureIdempotency('chat-card.propose_crm_note', [action.contact_id, action.note])
        const result = await actionsApi.dispatch({
          type: 'create_crm_note',
          contactId: action.contact_id,
          note: action.note,
          idempotencyKey: gesture.key,
        })
        if (result.status !== 'unknown') gesture.release()
        const claimed = claimNotice(result.claim, t, i18n.language)
        if (result.status === 'done' || result.status === 'queued') {
          setState({ phase: 'scheduled', label: claimed ?? result.reason ?? t('pending.crmNoteDone') })
          return
        }
        if (claimed) {
          setState({ phase: 'scheduled', label: claimed })
          return
        }
        setState({ phase: 'failed', reason: result.reason ?? t('pending.failed') })
        return
      }
      // #1952.38 — LA CLÉ D'IDEMPOTENCE DU GESTE, QUI MANQUAIT ICI.
      //
      // `ActionRouterService.dispatchIdempotent` rend la main à `dispatchOne`
      // dès que `idempotencyKey` est absente : la protection existait et ne
      // protégeait rien depuis le chat. Un double clic, ou un renvoi réseau,
      // programmait DEUX rappels.
      //
      // Les coordonnées sont celles de la PROPOSITION qu'on accepte — le
      // contact, l'échéance et la note portées par la carte. Deux relances à
      // trois semaines d'écart sont deux propositions, donc deux clés ; la
      // même carte reconfirmée après un rafraîchissement est le même geste,
      // donc la même. La règle entière : `gestureIdempotency`.
      const gesture = gestureIdempotency('chat-card.schedule_reminder', [action.contact_id, action.at, action.note])
      const result = await actionsApi.dispatch({
        type: 'schedule_reminder',
        contactId: action.contact_id,
        at: action.at,
        note: action.note ?? undefined,
        idempotencyKey: gesture.key,
      })
      // L'issue est CONNUE et la carte va la dire : le geste est fini. Jamais
      // sur `unknown` — la requête a peut-être abouti, et relâcher la clé
      // laisserait un re-clic reprogrammer ce qui est déjà parti (doctrine
      // « un timeout n'est pas un échec »).
      if (result.status !== 'unknown') gesture.release()
      // #1959.9 / #1959.10 — « déjà lancé » NOMME quelqu'un et une heure.
      //
      // Le routeur refuse de réexécuter un geste dont la clé est déjà réclamée
      // (double clic, second onglet, un collègue une seconde plus tôt) ; il
      // rendait « Une action identique (même clé) est déjà en cours » — qui ne
      // dit ni à qui parler ni si l'effet a eu lieu. Quand le serveur sait,
      // cette phrase-là passe devant la raison générique.
      const claimed = claimNotice(result.claim, t, i18n.language)
      if (result.status === 'done' || result.status === 'queued') {
        setState({ phase: 'scheduled', label: claimed ?? result.reason ?? t('pending.reminderDone') })
        return
      }
      // Un rejeu dont l'effet est encore EN VOL n'est pas un échec : il est
      // rendu `skipped`, et la carte le dit sans crier à l'erreur.
      if (claimed) {
        setState({ phase: 'scheduled', label: claimed })
        return
      }
      setState({ phase: 'failed', reason: result.reason ?? t('pending.failed') })
    } catch (error) {
      // #1943.6 — LE TROU : cette carte maquillait TOUT échec en un générique
      // unique, y compris quand le serveur avait dit pourquoi (« crédits
      // insuffisants », un 4xx métier) — exactement ce que `chatErrorMessage`
      // répare déjà pour un tour de conversation (`chat-error.ts`). Même règle
      // ici : un refus EXPLIQUÉ (4xx) se répète tel quel, une panne (réseau,
      // session morte, 5xx) garde la phrase générique de cette carte.
      setState({
        phase: 'failed',
        // #2081.14 — un refus de la règle d'espace se dit par sa phrase, dans la langue de l'écran.
        reason:
          workspaceRuleRefusalText(error) ??
          chatErrorMessage(error, {
            fallback: t('pending.failed'),
            networkLost: t('pending.failed'),
            sessionExpired: t('pending.failed'),
          }),
      })
    }
  }

  /**
   * #1995 bis — LE SECOND CLIC, QUAND LE PREMIER A RÉVÉLÉ UN `contact_id`.
   *
   * Constat en prod (46df969d7, 17/09) : « Rappelle-moi de relancer X demain »
   * sur une personne connue du seul CRM faisait REFUSER Laura entièrement.
   * `create_contact_from_crm_presence` porte désormais le rappel demandé
   * (`pending_reminder_at`/`pending_reminder_note`) ; ce bouton pose le rappel
   * une fois la fiche créée, EXACTEMENT comme `schedule_reminder_for_contact`
   * l'aurait fait s'il avait pu — même route (`actionsApi.dispatch`), même
   * clé d'idempotence, même lecture du refus serveur. Deux clics, deux
   * validations (doctrine du 14/09) : celui-ci n'est jamais déclenché tout
   * seul par le premier.
   */
  async function confirmReminderFollowUp() {
    if (action.action !== 'create_contact_from_crm') return
    const at = action.pending_reminder_at
    if (!at || state.phase !== 'scheduled' || !state.contactId) return
    const contactId = state.contactId
    setReminderFollowUp({ phase: 'running' })
    try {
      const note = action.pending_reminder_note ?? undefined
      const gesture = gestureIdempotency('chat-card.schedule_reminder', [contactId, at, note])
      const result = await actionsApi.dispatch({
        type: 'schedule_reminder',
        contactId,
        at,
        note,
        idempotencyKey: gesture.key,
      })
      if (result.status !== 'unknown') gesture.release()
      const claimed = claimNotice(result.claim, t, i18n.language)
      if (result.status === 'done' || result.status === 'queued') {
        setReminderFollowUp({ phase: 'done', label: claimed ?? result.reason ?? t('pending.reminderDone') })
        return
      }
      if (claimed) {
        setReminderFollowUp({ phase: 'done', label: claimed })
        return
      }
      setReminderFollowUp({ phase: 'failed', reason: result.reason ?? t('pending.failed') })
    } catch (error) {
      setReminderFollowUp({
        phase: 'failed',
        reason: chatErrorMessage(error, {
          fallback: t('pending.failed'),
          networkLost: t('pending.failed'),
          sessionExpired: t('pending.failed'),
        }),
      })
    }
  }

  /**
   * #2277.34 (épopée #2771) — supprime le brouillon que CETTE carte vient de
   * déposer, tant que `draftId` est encore connu. Même route
   * (`actionsApi.dispatch`), même clé d'idempotence que le reste de l'écran.
   */
  async function removeDraft() {
    if (action.action !== 'prepare_mail_draft' || state.phase !== 'scheduled' || !state.draftId) return
    const draftId = state.draftId
    setDraftRemoval({ phase: 'running' })
    try {
      const gesture = gestureIdempotency('chat-card.delete_draft', [draftId])
      const result = await actionsApi.dispatch({ type: 'delete_draft', targetId: draftId, idempotencyKey: gesture.key })
      if (result.status !== 'unknown') gesture.release()
      if (result.status === 'done') {
        setDraftRemoval({ phase: 'done', label: result.reason ?? t('pending.draftRemoved') })
        return
      }
      setDraftRemoval({ phase: 'failed', reason: result.reason ?? t('pending.failed') })
    } catch (error) {
      setDraftRemoval({
        phase: 'failed',
        reason: chatErrorMessage(error, {
          fallback: t('pending.failed'),
          networkLost: t('pending.failed'),
          sessionExpired: t('pending.failed'),
        }),
      })
    }
  }

  // #1768 — LE FILET, ET IL EST APRÈS LES HOOKS (règle des hooks de React).
  //
  // Les huit formes de `chat_tools.py` sont désormais toutes connues ici, et une
  // garde de croisement le tient. Mais le contrat est une union TypeScript que
  // RIEN ne valide à l'exécution : la prochaine action ajoutée côté Python
  // arrivera dans un navigateur qui sert encore l'ancien front — c'est la
  // fenêtre « front ancien, serveur neuf » que ce dépôt a déjà payée.
  // Une carte qu'on ne sait pas rendre ne s'affiche pas ; elle ne fait pas
  // tomber la conversation avec elle.
  if (!Icon) return null

  // #1953.14 — UNE PROPOSITION NON DÉCIDÉE, DANS UNE BRANCHE ABANDONNÉE, DEVIENT
  // OBSOLÈTE. Toujours APRÈS les hooks (même règle que les deux filets
  // ci-dessus) : aucun hook n'est déclaré ici, seul le RENDU change. Un
  // résultat déjà CONNU (`scheduled`/`failed`) n'entre pas dans ce cas — il
  // reste affiché par la branche normale plus bas, on ne l'efface jamais.
  if (obsolete && (state.phase === 'proposed' || state.phase === 'running')) {
    return (
      <div data-chat-kind="action" className={cn('p-3 opacity-70', CHAT_SURFACE.action)}>
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" />
          <div className="min-w-0 flex-1 space-y-1">
            <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
              {t('pending.title')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-muted)] line-through">
              {describe(action, t, i18n.language)}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('pending.obsolete')}
            </Text>
          </div>
        </div>
      </div>
    )
  }

  // #3776.6 — ouvrir un écran ne change rien : pas de carte « Action à valider », une ligne légère
  // (le libellé, ce que l'écran met en avant, le geste), même fonction de clic et même état d'échec.
  if (isNavigationOnlyAction(action) && action.action === 'open_screen') {
    return (
      <div data-chat-kind="action" className={cn('p-3', CHAT_SURFACE.action)}>
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <div className="min-w-0 flex-1">
            <Text size="sm" className="text-[var(--bellum-text-primary)]">
              {describe(action, t, i18n.language)}
            </Text>
            {action.highlight ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {action.highlight}
              </Text>
            ) : null}
          </div>
          {/* #AM.58 — la carte d'import de CV (`/consultants?importCv=true`) ouvre le dépôt EN SURIMPRESSION ;
              le renvoi vers le vivier reste offert à côté. Sans le droit d'import, seul ce renvoi demeure. */}
          {action.route.includes('importCv=true') ? <AddCvFromThread /> : null}
          <Button size="sm" variant="ghost" onClick={confirm} disabled={running}>
            {running ? t('pending.running') : confirmLabel(action, t)}
          </Button>
        </div>
        {state.phase === 'failed' ? <Outcome tone="error" text={state.reason} /> : null}
      </div>
    )
  }

  // #4129.1 — le bloc d'action n'offre ses gestes que tant qu'il y a quelque chose à valider : ni brouillon,
  // ni issue (fait, échec, attribuée, ignorée), ni sortie de données refusée par la règle d'espace.
  const awaitingGesture = (state.phase === 'proposed' || state.phase === 'running') && !refusedByRule
  const proposalGestures = (
    <>
      {/* #2104.30 — COPIER AVANT CONFIRMATION : `DraftPanel` (`prepare_message`,
              phase `draft`) et `DraftDialog` (réponse/relance messagerie) ont ce
              geste depuis longtemps ; la carte de PROPOSITION d'un brouillon de
              messagerie (avant le clic qui le crée vraiment) en était dépourvue.
              100% local, ne dépose rien — même vocabulaire (`pending.copy`) que
              `DraftPanel` juste plus bas dans ce fichier. */}
      {action.action === 'prepare_mail_draft' ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(action.subject ? `${action.subject}\n\n${action.body}` : action.body)
            toast.success(t('pending.copied'))
          }}
        >
          <Copy className="size-3.5" />
          {t('pending.copy')}
        </Button>
      ) : null}
      {/* #1940.7 — ATTRIBUER LA PROCHAINE ACTION : un sélecteur « assigner
              à », relié à `useWorkspaceMembers` (même registre que #1940.1 et
              `ActionExecuteMenu.tsx`, GA-26). N'apparaît que dans un espace
              d'ÉQUIPE (au moins un autre membre) — un espace solo n'a personne
              à qui déléguer. */}
      {assignableMembers.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={running || assigning}>
              <UserPlus className="size-3.5" />
              {t('pending.assignTo')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            {assignableMembers.map(member => (
              <DropdownMenuItem
                key={member.userId}
                onSelect={() => void assignTo(member.userId, member.fullName ?? member.email ?? '')}
              >
                {member.fullName ?? member.email ?? t('pending.memberFallback')}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )

  return (
    // #1907.13 / #1907.10 — une action se tient par un liseré violet et un relief doux : elle ne porte plus
    // la peau de la bulle de réponse juste au-dessus d'elle (`chat-surface.ts`).
    // #4129.1 — la carte à valider EST le bloc d'action de la bibliothèque de réponses (`reply-kit`) : même cadre,
    // mêmes gestes « valider / ignorer », la peau de l'action du fil en plus. Le coût (aperçu) et la confirmation
    // (`confirm()`, seul chemin qui exécute) restent ceux d'avant (#4129.2) ; « Laura prépare, tu envoies »
    // est déjà dit par la garantie juste dessous, donc la mention du kit est retirée (`note={null}`).
    <ReplyActionBlock
      chatKind="action"
      className={cn('p-3', CHAT_SURFACE.action)}
      icon={Icon}
      title={t('pending.title')}
      description={describe(action, t, i18n.language)}
      note={null}
      disabled={running}
      onValidate={awaitingGesture ? confirm : undefined}
      validateLabel={running ? t('pending.running') : confirmLabel(action, t)}
      onDismiss={
        awaitingGesture
          ? () => {
              setState({ phase: 'dismissed' })
              onDismiss()
            }
          : undefined
      }
      dismissLabel={t('pending.dismiss')}
      extraActions={awaitingGesture ? proposalGestures : null}
    >
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {guarantee(action, t, mailbox)}
        </Text>
      </div>

      {state.phase === 'proposed' || state.phase === 'running' ? (
        <ActionPreview
          rows={[
            ...previewRows(action, t, i18n.language, mailbox, currentCrmContact),
            // #1917.5 — la ligne qui SUIT la portée choisie, donc calculée ici
            // et non dans `previewRows`, qui ne connaît pas l'état de la carte.
            ...(action.action === 'pin_memory_fact'
              ? [memoryChangesRow(memoryScope, action.account_id ?? null, t)]
              : []),
          ]}
          title={t('pending.previewTitle')}
        />
      ) : null}

      {/*
        #2783 — Impact chiffré AVANT validation, réservé à `finance:read`
        (doctrine : marge visible seulement avec ce droit ; sans lui, ni la
        devise ni le moteur ne sont même lus par `useMissionTerms`, donc ce
        bloc ne s'affiche pas — jamais un chiffre pour qui n'a pas le droit).
        Réutilise TEL QUEL le simulateur existant (`MarginScenarioSimulator`,
        #2420.14) plutôt que d'en reconstruire un second (GA-26).
      */}
      {(state.phase === 'proposed' || state.phase === 'running') &&
      action.action === 'propose_mission_amendment' &&
      amendmentSimKind &&
      amendmentTerms.data?.canReadFinance &&
      amendmentTerms.data.marginEngine ? (
        <div className="mt-2.5 space-y-1">
          <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {t('pending.simulateImpactIntro')}
          </Text>
          <MarginScenarioSimulator
            missionId={action.mission_id}
            currency={amendmentTerms.data.marginEngine.currency}
            defaultKind={amendmentSimKind}
            poTerms={
              amendmentTerms.data.terms
                ? {
                    poVolumeDays: amendmentTerms.data.terms.poVolumeDays,
                    poConsumedDays: amendmentTerms.data.terms.poConsumedDays,
                  }
                : null
            }
          />
        </div>
      ) : null}

      {/*
        #1957.4 — AVANT une demande lourde (une analyse compte 3 à 6 minutes et
        des crédits, `guarantee()` juste au-dessus), un raccourci propose de
        limiter le périmètre de LA CONVERSATION — pas cette carte-là, qui vise
        déjà un compte précis, mais celles qui suivront. Il n'apparaît que sur
        un périmètre LARGE (`portfolio` / `none`) : un fil déjà scopé sur un
        compte, un consultant ou un besoin n'a rien à limiter de plus.

        Il OUVRE le sélecteur existant (`ScopeDialog`, celui de l'en-tête) —
        il n'en recrée aucun (GA-26, loi 1 du tome 7 : un réglage vit à un seul
        endroit). `scope`/`onOpenScope` restent optionnels pour ne rien casser
        chez un appelant plus ancien qui ne les connaît pas encore : dans ce
        cas, on ne devine rien, le raccourci ne s'affiche pas.
      */}
      {action.action === 'start_account_analysis' &&
      state.phase === 'proposed' &&
      onOpenScope &&
      scope &&
      (scope.kind === 'portfolio' || scope.kind === 'none') ? (
        <button
          type="button"
          onClick={onOpenScope}
          className="mt-1.5 text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
        >
          {t('pending.limitScope')}
        </button>
      ) : null}

      {/* #1917.3 / #1917.4 / #1918.9 — « Pour qui ? » et « qui pourra le voir »,
          AVANT le clic : aucune mémorisation dont la visibilité se découvre après. */}
      {action.action === 'pin_memory_fact' && (state.phase === 'proposed' || state.phase === 'running') ? (
        <>
          <MemoryScopeChoice options={offers} value={memoryScope} onChange={setMemoryScope} disabled={running} />
          {/* #1917.6 — et JUSQU'À QUAND : Laura proposait d'épingler pour toujours. */}
          <MemoryDurationChoice value={memoryDuration} onChange={setMemoryDuration} disabled={running} />
        </>
      ) : null}

      {state.phase === 'draft' ? (
        <DraftPanel
          subject={state.subject}
          body={state.body}
          insight={state}
          t={t}
          contactId={'contact_id' in action && typeof action.contact_id === 'string' ? action.contact_id : null}
        />
      ) : state.phase === 'scheduled' ? (
        <>
          <Outcome tone="ok" text={state.label}>
            {/* #1995 — « la fiche existe » sans dire OÙ laisserait le geste à
                moitié fait : le lien mène à la fiche que le clic vient de créer. */}
            {state.contactId ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigate({ to: '/contacts/$id', params: { id: state.contactId as string } })
                }}
              >
                {t('pending.openContact')}
              </Button>
            ) : null}
            {/* #1931.18 — le CTA « Ouvrir » que #1930 réclamait déjà en exemple :
                un lien RÉEL devient un bouton, jamais une ligne de texte copiable. */}
            {state.webUrl ? (
              <Button asChild size="sm" variant="ghost">
                <a href={state.webUrl} target="_blank" rel="noreferrer">
                  {t('cards.result.open')}
                </a>
              </Button>
            ) : null}
            {/* #2423.9 — l'avenant reste `proposed` : le lien mène au dossier
                où il se valide, jamais à un « c'est fait ». */}
            {state.missionId ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const target = internalRoute(`/missions/${state.missionId}`)
                  if (target) void navigate({ to: target })
                }}
              >
                {t('pending.openMission')}
              </Button>
            ) : null}
          </Outcome>
          {/* #1995 bis — LE RAPPEL QUI S'Y RATTACHE, MAINTENANT QUE LA FICHE
              EXISTE. `pending_reminder_at` n'apparaît que si l'utilisateur en
              avait demandé un dans le même message — jamais un bouton proposé
              d'office. Deux clics, deux validations : celui-ci reste un GESTE
              séparé du premier, jamais déclenché par lui. */}
          {action.action === 'create_contact_from_crm' && action.pending_reminder_at ? (
            reminderFollowUp.phase === 'done' ? (
              <Outcome tone="ok" text={reminderFollowUp.label} />
            ) : reminderFollowUp.phase === 'failed' ? (
              <Outcome tone="error" text={reminderFollowUp.reason} />
            ) : (
              <div className="mt-2.5">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={reminderFollowUp.phase === 'running'}
                  onClick={() => void confirmReminderFollowUp()}
                >
                  {reminderFollowUp.phase === 'running' ? t('pending.running') : t('pending.confirmReminder')}
                </Button>
              </div>
            )
          ) : null}
          {/* #2277.34 (épopée #2771) — rollback de `prepare_mail_draft` : le
              brouillon vient d'être déposé, `draftId` est encore connu (aucune
              trace n'en survivra ailleurs). Terminal une fois supprimé —
              aucun geste de plus n'est possible sur un brouillon disparu. */}
          {action.action === 'prepare_mail_draft' && state.draftId ? (
            draftRemoval.phase === 'done' ? (
              <Outcome tone="muted" text={draftRemoval.label} />
            ) : draftRemoval.phase === 'failed' ? (
              <Outcome tone="error" text={draftRemoval.reason} />
            ) : (
              <div className="mt-2.5">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={draftRemoval.phase === 'running'}
                  onClick={() => void removeDraft()}
                >
                  {draftRemoval.phase === 'running' ? t('pending.running') : t('pending.deleteDraft')}
                </Button>
              </div>
            )
          ) : null}
        </>
      ) : state.phase === 'failed' ? (
        <Outcome tone="error" text={state.reason} />
      ) : state.phase === 'assigned' ? (
        // #1940.7 — terminale, comme `scheduled` : une notification RÉELLE est
        // déjà partie, la carte ne propose plus de la confirmer soi-même.
        <Outcome tone="ok" text={t('pending.assignedTo', { name: state.assigneeName })} />
      ) : state.phase === 'dismissed' ? (
        // #1931.9 — UN REFUS LAISSE UNE TRACE : la carte disait « rejected »,
        // signifiait sa disparition (`return null`, tôt dans ce composant), et
        // c'était une contradiction nommée par l'audit (#1931.21) — un
        // rafraîchissement perdait même ce non-geste. Elle reste montée, avec
        // le même nom d'état que `CopilotCards` (`cards.state.rejected`) : un
        // seul vocabulaire pour « refusée » dans les deux surfaces.
        <Outcome tone="muted" text={t('cards.state.rejected')} />
      ) : refusedByRule ? (
        // #2081.14 — le bouton d'export est MASQUÉ ; la carte dit la règle.
        <Outcome tone="muted" text={i18n.t('workspaceRules:refusal.exportPolicy')} />
      ) : null}
    </ReplyActionBlock>
  )
}

/** Tableau compact « ce que cette action va faire », rendu avant l'approbation. */
/**
 * #1917.5 — CE QUE L'ENREGISTREMENT VA MODIFIER, dans les mots de la personne :
 * quelles réponses seront influencées, et pour qui. Quatre phrases entières
 * plutôt qu'une phrase assemblée — un fragment traduit se recolle mal, et
 * « pour toi » n'a pas la même place dans les deux langues.
 */
function memoryChangesRow(
  offer: MemoryScopeOffer,
  accountId: string | null,
  t: TFunction,
): { label: string; value: string } {
  // #1918.2 / #1918.5 — quatre portées, quatre phrases. Le repli `changesUser`
  // pour tout ce qui n'était pas « espace » aurait fait dire « pour toi
  // uniquement » d'une règle d'équipe : un libellé faux, lu AVANT le clic.
  const key =
    offer.scope === 'workspace'
      ? 'changesWorkspace'
      : offer.scope === 'business_unit'
        ? 'changesBusinessUnit'
        : offer.scope === 'conversation'
          ? 'changesConversation'
          : 'changesUser'
  return {
    label: t('pending.previewChanges'),
    value: t(`pending.${key}${accountId ? 'Account' : 'All'}`, { name: offer.businessUnitName ?? '' }),
  }
}

/**
 * Un MESSAGE PRÉPARÉ, pas un brouillon : il vit ici, on l'affiche et on le
 * copie, rien n'est déposé dans la messagerie (règle produit « on prépare,
 * l'utilisateur envoie »).
 *
 * La nuance est de vocabulaire et elle se paie cher (PDF 1 §13) : « brouillon »
 * désignerait un objet de la boîte de l'utilisateur, qu'il irait chercher et ne
 * trouverait pas. Le dépôt d'un VRAI brouillon existe, mais c'est l'autre
 * action (`prepare_mail_draft`), et elle passe par la messagerie.
 */
function DraftPanel({
  subject,
  body,
  insight,
  t,
  contactId,
}: {
  subject: string
  body: string
  /** #4158.21/.22 — le contact visé : copier passe par la garde « contacté par un collègue / ne pas contacter ». */
  contactId: string | null
  /**
   * #1926.28-.31, #1925 — « pourquoi ce message », en LECTURE SEULE : cette
   * carte ne pose ni bouton « Utiliser cet angle » ni bouton de ton — Action OS
   * réécrit son propre geste de confirmation ailleurs, hors du périmètre de cet
   * écran (voir le composer de fiche contact pour la version régénérable).
   */
  insight: MessageInsight
  t: TFunction<'chat'>
}) {
  const guard = useColleagueContactGuard(contactId)
  return (
    <div className="mt-2.5 space-y-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-2.5">
      {guard.dialog}
      {subject ? (
        <Text size="xs" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {subject}
        </Text>
      ) : null}
      <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
        {body}
      </Text>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            guard.run(() => {
              void navigator.clipboard?.writeText(subject ? `${subject}\n\n${body}` : body)
              toast.success(t('pending.copied'))
            })
          }
        >
          <Copy className="size-3.5" />
          {t('pending.copy')}
        </Button>
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('pending.draftOnly')}
        </Text>
      </div>
      <MessageInsightPanel insight={insight} />
    </div>
  )
}

/**
 * #1931.9 — `muted` : une carte REFUSÉE reste visible, mais ne doit ni
 * ressembler à un succès (`ok`, icône accent) ni à une panne (`error`, rouge)
 * — un refus n'est ni l'un ni l'autre. Même palette que le libellé d'état
 * (`text-muted`), pour rester cohérente avec le reste de la carte au repos.
 */
function Outcome({ tone, text, children }: { tone: 'ok' | 'error' | 'muted'; text: string; children?: ReactNode }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-start gap-1.5">
      {tone === 'ok' ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-accent)]" />
      ) : (
        <X
          className={cn(
            'mt-0.5 size-3.5 shrink-0',
            tone === 'error' ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-muted)]',
          )}
        />
      )}
      <Text
        size="xs"
        className={cn(
          tone === 'error' && 'text-[var(--danger-soft-text)]',
          tone === 'muted' && 'text-[var(--bellum-text-muted)]',
        )}
      >
        {text}
      </Text>
      {children}
    </div>
  )
}

/** Phrase exacte de ce que le clic va faire — jamais un verbe vague. */
/**
 * La PRÉVISUALISATION exigée avant toute action externe (addendum final p12) :
 * cible, canal, échéance, coût et objets qui seront écrits.
 *
 * La carte disait déjà CE QU'ELLE FAIT en une phrase et ce qu'elle garantit ;
 * ce qui manquait, c'est le détail vérifiable — « sur qui », « par quel canal »,
 * « quand », « combien », « qu'est-ce que ça modifie ». Sans lui, approuver
 * revient à faire confiance à une phrase.
 *
 * Aucune ligne n'est inventée : une valeur inconnue ne produit pas de ligne.
 */
function previewRows(
  action: PendingChatAction,
  t: TFunction<'chat'>,
  language: string,
  mailbox: string,
  /** #1930.14 — la fiche RÉELLE, pour détecter une correction survenue depuis la
   *  proposition. `null` = pas encore chargée : aucun diff, jamais une valeur devinée. */
  currentContact?: Contact | null,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const push = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) rows.push({ label, value: value.trim() })
  }
  /**
   * #1930.14 — UN CHAMP, DEUX LIGNES QUAND IL A BOUGÉ.
   *
   * Même grammaire que `previewSettingOld`/`previewSettingNew` (#1930.5) :
   * la valeur ACTUELLEMENT connue de Bellum d'abord, puis celle qui va partir.
   * Silencieux (une seule ligne, la valeur qui part) tant que la fiche n'est pas
   * chargée ou que les deux valeurs concordent — un export qui ne change rien
   * n'a pas besoin de le crier.
   */
  const pushCrmFieldRow = (fieldLabel: string, current: string | null | undefined, next: string | null | undefined) => {
    const currentTrimmed = current?.trim()
    const nextTrimmed = next?.trim()
    if (currentTrimmed && nextTrimmed && currentTrimmed !== nextTrimmed) {
      push(t('pending.previewFieldCurrentValue', { field: fieldLabel }), currentTrimmed)
    }
    push(fieldLabel, next)
  }
  switch (action.action) {
    case 'prepare_message':
      push(t('pending.previewTarget'), action.contact_name)
      push(t('pending.previewChannel'), t(`pending.channel.${action.channel}`))
      push(t('pending.previewAngle'), action.angle)
      push(t('pending.previewWrites'), t('pending.writesDraftOnly'))
      break
    case 'schedule_reminder':
      push(t('pending.previewTarget'), action.contact_name)
      push(t('pending.previewWhen'), formatDate(action.at, language))
      // #1958.18 — RDV INTERNATIONAL. Le fuseau réellement retenu par
      // l'escalier (`resolve_applicable_timezone`, personne → rendez-vous →
      // espace → défaut) était calculé côté outil et jamais montré : la
      // personne validait « 9 h » sans savoir DE QUEL fuseau. Absent des deux
      // côtés (rien de réglé nulle part) = pas de ligne, comme avant ce champ.
      push(t('pending.previewTimezone'), action.timezone?.replace(/_/g, ' '))
      push(t('pending.previewNote'), action.note)
      push(t('pending.previewWrites'), t('pending.writesReminder'))
      break
    case 'enrich_contact':
      push(t('pending.previewTarget'), action.contact_name)
      push(t('pending.previewOrg'), action.organization_name)
      push(t('pending.previewWrites'), t('pending.writesEnrich'))
      break
    case 'export_contact_to_crm':
      // #1930.14 — CHAMP À CHAMP, PAS UN RÉSUMÉ : chacun des quatre champs que
      // `buildCrmInput` envoie réellement (voir plus bas) obtient sa ligne, et
      // celle-ci dit s'il ÉCRASE une valeur différente de la fiche actuelle.
      pushCrmFieldRow(t('pending.previewTarget'), currentContact?.full_name, action.contact_name)
      push(t('pending.previewDestination'), crmLabel(t, action.provider))
      pushCrmFieldRow(t('pending.previewEmail'), currentContact?.email, action.contact_email)
      pushCrmFieldRow(t('pending.previewRole'), currentContact?.title, action.contact_title)
      pushCrmFieldRow(t('pending.previewOrg'), currentContact?.entity, action.company)
      push(t('pending.previewWrites'), t('pending.writesCrm'))
      break
    // Épopée #2955 (#2394.6/.19/.43) — une NOTE, jamais un diff de fiche : le
    // contenu est le texte lui-même, pas un « avant → après » par champ.
    case 'propose_crm_note':
      push(t('pending.previewTarget'), action.contact_name)
      push(t('pending.previewDestination'), t('pending.crmGeneric'))
      push(t('pending.previewContent'), action.note)
      push(t('pending.previewWrites'), t('pending.writesCrmNote'))
      break
    case 'prepare_mail_draft':
      push(t('pending.previewTarget'), action.to)
      // #1930.4 — la CIBLE (à qui) et la DESTINATION (où ça atterrit) sont deux
      // questions distinctes : `mailbox` porte l'outil BRANCHÉ par l'espace
      // (injecté, jamais un littéral — même règle que `guarantee()`).
      push(t('pending.previewDestination'), mailbox)
      push(t('pending.previewSubject'), action.subject)
      // #1930.5 — le CORPS avant confirmation : cette carte n'a pas de panneau
      // de relecture comme `prepare_message` (`DraftPanel`), donc sans cette
      // ligne, personne ne voit ce qui part dans la messagerie avant de cliquer.
      push(t('pending.previewContent'), action.body)
      // #2104.25 — LE CONTEXTE UTILISÉ : rien n'est deviné, `thread_id` est le
      // seul fait dont l'écran dispose déjà (posé par `search_mailbox`, jamais
      // par ce tour-ci). Un fil connu veut dire que l'historique de CE fil a
      // servi de contexte de rédaction ; son absence veut dire un message
      // neuf, sans historique à afficher.
      push(
        t('pending.previewContext'),
        action.thread_id ? t('pending.previewContextThread') : t('pending.previewContextNew'),
      )
      // #2104.26 — LE TON : jamais déduit du corps, seulement rendu quand le
      // modèle l'a lui-même déclaré (même règle que `prepare_campaign.tone`,
      // #1935.6). `push` omet déjà la ligne sur une valeur absente.
      push(t('pending.previewTone'), action.tone)
      // #1930.17 — la signature et les pièces jointes sont des faits du CODE
      // (`appendSignature: true`, `documentIds: []`, toujours, voir le clic
      // plus bas) : les nommer ici n'invente rien, ça rend visible ce qui l'était déjà.
      push(t('pending.previewSignature'), t('pending.previewSignatureIncluded'))
      push(t('pending.previewWrites'), t('pending.writesMailDraft', { mailbox }))
      break
    case 'prepare_calendar_event':
      push(t('pending.previewTarget'), action.title)
      push(t('pending.previewWhen'), formatDate(action.starts_at, language))
      push(t('pending.previewGuests'), action.attendees?.length ? action.attendees.join(', ') : null)
      push(t('pending.previewContent'), action.note)
      push(t('pending.previewWrites'), t('pending.writesCalendarEvent'))
      break
    case 'find_accounts':
      push(t('pending.previewCriteria'), criteriaLabel(action, t))
      push(t('pending.previewWrites'), t('pending.writesNothing'))
      break
    case 'open_screen':
      push(t('pending.previewScreen'), action.label)
      push(t('pending.previewHighlight'), action.highlight)
      push(t('pending.previewWrites'), t('pending.writesScreenOnly'))
      break
    case 'prepare_consultant_record':
      push(t('pending.previewConsultant'), action.full_name)
      push(t('pending.previewWhen'), action.available_from ? formatDate(action.available_from, language) : null)
      push(t('pending.previewNote'), action.note)
      push(t('pending.previewWrites'), t('pending.writesScreenOnly'))
      break
    case 'push_profile':
      push(t('pending.previewConsultant'), action.consultant_id)
      push(t('pending.previewWrites'), t('pending.writesScreenOnly'))
      break
    case 'toggle_routine':
      push(t('pending.previewRoutine'), routineLabel(action, t))
      push(t('pending.previewState'), t(action.enabled ? 'pending.routineStateOn' : 'pending.routineStateOff'))
      // #1822 — l'horaire annoncé AVANT le clic : sans lui, « Appliquer »
      // demande de faire confiance à une phrase de conversation déjà défilée.
      push(t('pending.previewSchedule'), scheduleLabel(action, t, language))
      push(t('pending.previewChannel'), action.channel ? t(`pending.routineChannel.${action.channel}`) : null)
      push(t('pending.previewWrites'), t('pending.writesRoutineToggle'))
      break
    case 'update_setting':
      push(t('pending.previewSettingOld'), settingValueLabel(action.old_value, t))
      push(t('pending.previewSettingNew'), settingValueLabel(action.new_value, t))
      push(t('pending.previewWrites'), t('pending.writesSettingUpdate'))
      break
    case 'pin_memory_fact':
      // #2258.4 — la donnée AVANT / APRÈS : l'outil n'écrit jamais par-dessus
      // une ligne existante (pur ajout, jamais une mise à jour), donc l'état
      // « avant » est TOUJOURS « rien » — une phrase honnête, pas un silence.
      push(t('pending.previewMemoryBefore'), t('pending.previewMemoryBeforeValue'))
      // #1917.2 — « Ce que je retiens », pas « Fait » : la fiche se lit comme
      // une phrase de Laura, et c'est elle qu'on valide.
      push(t('pending.previewRemembered'), action.fact)
      // #1917.5 — « Ce que cela modifiera » DÉPEND de la portée choisie : elle
      // est jointe par la carte (`memoryChangesRow`), pas figée ici.
      push(t('pending.previewWrites'), t('pending.writesPinFact'))
      break
    case 'start_account_analysis':
      push(t('pending.previewTarget'), action.company)
      // D1 — le statut du dossier, DIT : « analysé le … » ou « jamais analysé ».
      // Jamais une date devinée, jamais un silence qui se lirait « à jour ».
      push(
        t('pending.previewDossier'),
        action.analysed_at
          ? t('pending.dossierAnalysedOn', { date: formatDate(action.analysed_at, language) })
          : t('pending.dossierNeverAnalysed'),
      )
      push(t('pending.previewReason'), action.reason)
      // #1957.3 — le nombre de sources/objets visés, sur la MÊME carte que le
      // coût. Absent = rien à afficher, jamais un « 0 » (GA-18/GA-19).
      push(
        t('pending.previewObjectsCount'),
        typeof action.objects_count === 'number'
          ? t('pending.objectsCountValue', { count: action.objects_count })
          : null,
      )
      push(t('pending.previewWrites'), t('pending.writesAnalysis'))
      break
    case 'create_contact_from_crm':
      // #1995 — les champs AVANT le clic : sans eux, « Créer la fiche »
      // demanderait de faire confiance à une phrase. Un champ absent ne
      // produit pas de ligne — jamais un « — » qui se lirait « pas d'e-mail ».
      push(t('pending.previewTarget'), action.full_name)
      push(t('pending.previewRole'), action.job_title)
      push(t('pending.previewEmail'), action.email)
      push(t('pending.previewOrg'), action.company)
      push(t('pending.previewOrigin'), t('pending.originCrm'))
      // #1995 bis — le rappel qui suivra, dit AVANT le clic — sinon le second
      // bouton apparaîtrait comme une surprise après la création.
      push(
        t('pending.previewReminder'),
        action.pending_reminder_at ? formatDate(action.pending_reminder_at, language) : null,
      )
      push(t('pending.previewWrites'), t('pending.writesContactRecord'))
      break
    case 'create_target_list_from_account':
      // Épopée #2853 (#2157.1) — même grammaire que `create_contact_from_crm`
      // juste au-dessus : les champs AVANT le clic, un champ absent ne produit
      // pas de ligne.
      push(t('pending.previewOrg'), action.company)
      push(t('pending.previewListName'), action.name)
      push(t('pending.previewWrites'), t('pending.writesTargetList'))
      break
    case 'add_account_to_portfolio':
      // Épopée #2781 (#2150.30) — même grammaire : les champs AVANT le clic,
      // un champ absent (jamais cité dans la conversation) ne produit pas de ligne.
      push(t('pending.previewOrg'), action.company_name)
      push(t('pending.previewSector'), action.sector)
      push(t('pending.previewWebsite'), action.website)
      push(t('pending.previewWrites'), t('pending.writesPortfolio'))
      break
    case 'prepare_bug_report':
      // #2433.7 — le constat ET l'écran nommé, AVANT le clic ; une route jamais
      // donnée ne fait aucune ligne. Ce qui sera joint se dit aussi.
      push(t('pending.previewBugObserved'), action.message)
      push(t('pending.previewBugRoute'), action.route)
      push(t('pending.previewBugJoined'), t('pending.bugReportJoined'))
      break
    case 'prepare_campaign':
      push(t('pending.previewObjective'), action.objective)
      push(t('pending.previewAudience'), t('pending.campaignAudience', { count: action.contacts.length }))
      push(t('pending.previewPersona'), action.persona)
      push(t('pending.previewRelation'), action.relation ? t(`pending.campaignRelation.${action.relation}`) : null)
      push(t('pending.previewTone'), action.tone)
      push(t('pending.previewWrites'), t('pending.writesScreenOnly'))
      break
    case 'compile_need': {
      // #2322 — la carte PORTE le besoin : c'est elle qui se lit, pas le
      // formulaire qui s'ouvrira. Chaque ligne absente ne fait aucune ligne.
      push(t('pending.previewTarget'), needTitle(action))
      push(t('pending.needWorkToDo'), needField(action, 'work_to_do'))
      push(t('pending.needOutcome'), needField(action, 'expected_outcome'))
      push(t('pending.needSkills'), needField(action, 'skills'))
      push(t('pending.previewOrg'), action.compiled.company_hint)
      push(t('pending.previewOrigin'), t(`pending.needSource.${action.compiled.source.kind}`))
      // Ce qui n'a pas pu être compris est NOMMÉ — jamais compté, jamais tu.
      const missing = (action.compiled.not_understood ?? [])
        .map(field => NEED_MISSING_LABEL[field])
        .filter((key): key is string => Boolean(key))
      push(t('pending.needMissing'), missing.length > 0 ? missing.map(key => t(key)).join(', ') : null)
      push(
        t('pending.needContradictions'),
        action.compiled.contradictions.length > 0
          ? t('pending.needContradictionsValue', { count: action.compiled.contradictions.length })
          : null,
      )
      push(t('pending.needConfirmation'), t(`pending.needConfirmation_${action.compiled.confirmation_level}`))
      // Ce qui a été ÉCARTÉ : une extraction amputée en silence est pire
      // qu'une extraction refusée.
      push(
        t('pending.needDropped'),
        action.dropped && action.dropped.length > 0
          ? t('pending.needDroppedValue', { count: action.dropped.length })
          : null,
      )
      push(t('pending.previewWrites'), t('pending.writesScreenOnly'))
      break
    }
    case 'day_closure':
      // #2392 — rendue par `DayClosureCard`, jamais par cette prévisualisation.
      break
    case 'propose_focus_plan':
      // #2391 — même raison : rendue par `FocusPlanCard`.
      break
    case 'propose_weekly_plan':
      // #2770.55-.62 — rendue par `WeeklyPlanCard`.
      break
    case 'propose_mission_amendment':
      // #2423.9 — LE DIFF (ancien → nouveau), la date d'effet, la preuve. Un
      // terme non donné ne fait AUCUNE ligne (`amendmentDiffLabel`/`push`) —
      // jamais un « 0 » ni un terme inventé.
      push(t('pending.previewMissionAmendmentEvent'), t(`pending.missionAmendmentEvent.${action.event_type}`))
      push(t('pending.previewMissionAmendmentDiff'), amendmentDiffLabel(action))
      push(t('pending.previewMissionAmendmentEffective'), formatDate(action.effective_from, language))
      push(t('pending.previewMissionAmendmentProof'), action.proof)
      push(
        t('pending.previewMissionAmendmentPauseCause'),
        action.pause_cause ? t(`pending.missionAmendmentPauseCause.${action.pause_cause}`) : null,
      )
      push(t('pending.previewNote'), action.note)
      push(t('pending.previewWrites'), t('pending.writesMissionAmendment'))
      break
    case 'propose_opportunity_update':
      // #2324.39 — LE DIFF FIGÉ, un champ par ligne : « avant → après » quand
      // l'avant est connu, la valeur proposée seule sinon — jamais un « 0 ».
      for (const change of action.changes) {
        const format = (value: string | number | null): string | null =>
          value === null
            ? null
            : change.field === 'stage'
              ? t(`projects:stage.states.${String(value)}`)
              : change.field === 'estimated_amount'
                ? new Intl.NumberFormat(language, {
                    style: 'currency',
                    currency: 'EUR',
                    maximumFractionDigits: 0,
                  }).format(Number(value))
                : String(value)
        const previous = format(change.previous)
        const next = format(change.next)
        push(t(`pending.opportunityField.${change.field}`), previous ? `${previous} → ${next}` : next)
      }
      push(t('pending.previewMissionAmendmentProof'), action.proof)
      push(t('pending.previewWrites'), t('pending.writesOpportunityUpdate'))
      break
    case 'prepare_cold_call':
      // #2376 — rendue par `CallBriefCard`, jamais par cette prévisualisation.
      break
    case 'propose_need_transition':
      // #2320.26/.27 (épopée #2967) — le statut ACTUEL, le statut VISÉ, puis le
      // motif : `reason` reste `null` quand l'outil n'en a pas reçu (jamais
      // deviné) — même règle que `previewMissionAmendmentPauseCause`.
      push(t('pending.previewNeedTransitionFrom'), t(`projects:needStatus.${action.from_status}`))
      push(t('pending.previewNeedTransitionTo'), t(`projects:needStatus.${action.to_status}`))
      push(t('pending.previewNeedTransitionReason'), action.reason)
      // #2967 (lot V39, #2320.27) — les preuves que les gardes canoniques
      // traversées exigent. Liste vide ou absente = aucune ligne (on n'affiche
      // pas ce qu'on n'a pas).
      push(
        t('pending.previewNeedTransitionMissing'),
        action.missing_evidence?.length
          ? action.missing_evidence.map(key => t(`pending.commercialEvidence.${key}`)).join(', ')
          : null,
      )
      push(t('pending.previewWrites'), t('pending.writesNeedTransition'))
      break
    case 'propose_bulk_enrichment':
      // #2434.56 — les contacts tels que l'outil les a LUS (nom et entreprise), jamais un identifiant seul.
      push(
        t('pending.previewBulkEnrichContacts'),
        action.contacts.map(contact => `${contact.contact_name} (${contact.organization_name})`).join(', '),
      )
      push(t('pending.previewWrites'), t('pending.writesBulkEnrich'))
      break
    case 'propose_people_search':
      // #3869.a — le compte tel que l'outil l'a LU, puis les rôles cherchés :
      // des fonctions, jamais des noms de personnes.
      push(t('pending.previewPeopleSearchAccount'), action.company_name)
      // #4057/#4058 — chaque critère sous SON libellé ; une valeur absente ne fait aucune ligne.
      if (action.roles.length > 0) push(t('pending.previewPeopleSearchRoles'), action.roles.join(', '))
      if (action.expertise) push(t('pending.previewPeopleSearchExpertise'), action.expertise)
      if (action.sector) push(t('pending.previewPeopleSearchSector'), action.sector)
      if (action.scope) push(t('pending.previewPeopleSearchScope'), action.scope)
      push(t('pending.previewWrites'), t('pending.writesPeopleSearch'))
      break
    case 'propose_contact_departure':
      // #3871.1 (lot V11, 07/10) — le contact visé, tel que l'outil l'a LU
      // (jamais un identifiant seul), puis ce qui sera écrit : archivage
      // (`historique`), jamais une suppression.
      push(t('pending.previewContactDepartureContact'), action.contact_name || t('pending.unknownContact'))
      push(t('pending.previewWrites'), t('pending.writesContactDeparture'))
      break
    case 'propose_long_job':
      // #1952.3 / #1952.7 — le travail, puis les besoins tels que l'outil les a LUS
      // (le libellé absent n'est jamais deviné : l'identifiant reste affiché).
      push(t('pending.previewLongJobKind'), t(`pending.longJobKind.${action.job}`))
      push(
        t('pending.previewLongJobNeeds'),
        (action.needs ?? action.need_ids.map(need_id => ({ need_id, label: null })))
          .map(need => need.label ?? need.need_id)
          .join(', '),
      )
      push(t('pending.previewWrites'), t('pending.writesLongJob'))
      break
    case 'decide_expense_report':
      // #2987.56 — QUI, QUAND, QUOI décider — jamais le montant (le pont
      // interne ne le rend pas à Laura, `canReadFinance: false` en dur).
      push(t('pending.previewExpenseReportBearer'), action.bearer_name)
      push(t('pending.previewExpenseReportAccount'), action.account_name)
      push(t('pending.previewExpenseReportPeriod'), action.period_month)
      push(
        t('pending.previewExpenseReportDecision'),
        t(
          action.decision === 'validate'
            ? 'pending.expenseReportDecisionValidate'
            : 'pending.expenseReportDecisionReject',
        ),
      )
      push(t('pending.previewExpenseReportReason'), action.reason)
      push(t('pending.previewWrites'), t('pending.writesExpenseReportDecision'))
      break
    case 'decide_qualification_lead':
      // #3345.2 — QUELLE piste (jamais devinée : absente, la ligne n'existe pas),
      // sur quel compte, quelle décision, pourquoi ou jusqu'à quand.
      push(t('pending.previewLeadLabel'), action.lead_label)
      push(t('pending.previewLeadAccount'), action.account_name)
      push(
        t('pending.previewLeadDecision'),
        t(action.decision === 'dismissed' ? 'pending.leadDecisionDismissed' : 'pending.leadDecisionSnoozed'),
      )
      push(t('pending.previewLeadReason'), action.reason ? t(`pending.leadDismissReason.${action.reason}`) : null)
      push(t('pending.previewLeadUntil'), action.snoozed_until)
      push(t('pending.previewWrites'), t('pending.writesLeadDecision'))
      break
  }
  return rows
}

function describe(action: PendingChatAction, t: TFunction<'chat'>, language: string): string {
  switch (action.action) {
    case 'prepare_message_audience':
      return t('pending.audienceTitle', { count: action.recipients.length })
    case 'prepare_message':
      return t(`pending.describeMessage.${action.channel}`, {
        name: action.contact_name || t('pending.unknownContact'),
      })
    case 'schedule_reminder':
      return t('pending.describeReminder', {
        name: action.contact_name || t('pending.unknownContact'),
        date: formatDate(action.at, language),
      })
    case 'enrich_contact':
      return t('pending.describeEnrich', { name: action.contact_name, company: action.organization_name })
    case 'export_contact_to_crm':
      return t('pending.describeCrm', {
        name: action.contact_name || t('pending.unknownContact'),
        provider: crmLabel(t, action.provider),
      })
    case 'prepare_mail_draft':
      return t('pending.describeMailDraft', { to: action.to })
    case 'prepare_calendar_event':
      return t('pending.describeCalendarEvent', { title: action.title, date: formatDate(action.starts_at, language) })
    case 'find_accounts':
      return t('pending.describeFind', { criteria: criteriaLabel(action, t) })
    case 'open_screen':
      return t('pending.describeScreen', { label: action.label })
    case 'prepare_consultant_record':
      return t('pending.describeConsultant', { name: action.full_name })
    case 'push_profile':
      return t('pending.describePushProfile')
    case 'toggle_routine':
      return t(action.enabled ? 'pending.describeToggleRoutine.on' : 'pending.describeToggleRoutine.off', {
        label: routineLabel(action, t),
      })
    case 'update_setting':
      return t('pending.describeUpdateSetting', { label: settingLabel(action, t) })
    case 'pin_memory_fact':
      return t('pending.describePinFact')
    case 'create_contact_from_crm':
      return t('pending.describeCreateContact', { name: action.full_name, company: action.company })
    case 'create_target_list_from_account':
      return t('pending.describeCreateTargetList', { company: action.company })
    case 'add_account_to_portfolio':
      return t('pending.describeAddToPortfolio', { company: action.company_name })
    case 'prepare_campaign':
      // #1935.14 — une audience 100% téléphone EST une liste d'appels, pas une
      // campagne e-mail : le distinguer ICI, avant même le clic qui ouvre
      // Séquences (`output_kind`, calculé par `chat_tools.py`).
      return action.output_kind === 'call_list'
        ? t('pending.describeCallList', { count: action.contacts.length, objective: action.objective })
        : t('pending.describeCampaign', { count: action.contacts.length, objective: action.objective })
    case 'day_closure':
      return t('dayClosure.title', { date: action.closure.date })
    case 'propose_focus_plan':
      return t('focusPlan.title', { date: action.plan.date })
    case 'propose_weekly_plan':
      return t('weeklyPlan.title', { date: action.plan.week_start })
    case 'compile_need':
      // Le compte RAPPROCHÉ quand il l'est, sinon le nom lu dans la source :
      // « chez Decathlon » et « pour une entreprise nommée Decathlon » ne
      // disent pas la même chose, et la seconde est la vérité tant que le
      // rapprochement n'a pas tranché (#2322.16).
      return action.compiled.company_hint
        ? t('pending.describeCompileNeed', {
            title: needTitle(action) ?? t('pending.needUntitled'),
            company: action.compiled.company_hint,
          })
        : t('pending.describeCompileNeedNoCompany', { title: needTitle(action) ?? t('pending.needUntitled') })
    case 'start_account_analysis':
      // D1 — les deux chiffres viennent de la PROPOSITION (le pont les a lus sur
      // la grille et sur le solde réel). Quand le serveur n'a pas su les dire,
      // la phrase les OMET plutôt que d'écrire « 0 crédit, il t'en restera 0 ».
      return t('pending.describeAnalysisPlain', { company: action.company })
    case 'propose_mission_amendment':
      return t('pending.describeMissionAmendment', {
        event: t(`pending.missionAmendmentEvent.${action.event_type}`),
      })
    case 'propose_opportunity_update':
      return t('pending.describeOpportunityUpdate', { label: action.project_label })
    case 'prepare_cold_call':
      return t('callBrief.describe', { name: action.contact_name })
    case 'propose_need_transition':
      return t('pending.describeNeedTransition', { status: t(`projects:needStatus.${action.to_status}`) })
    case 'propose_bulk_enrichment':
      return t('pending.describeBulkEnrich', { count: action.contacts.length })
    case 'propose_people_search':
      return t('pending.describePeopleSearch', { company: action.company_name })
    case 'propose_contact_departure':
      return t('pending.describeContactDeparture', { name: action.contact_name || t('pending.unknownContact') })
    case 'propose_long_job':
      return t(`pending.describeLongJob_${action.job}`, { count: action.need_ids.length })
    case 'decide_expense_report':
      return t('pending.describeExpenseReportDecision', {
        decision: t(
          action.decision === 'validate'
            ? 'pending.expenseReportDecisionValidate'
            : 'pending.expenseReportDecisionReject',
        ),
      })
    case 'decide_qualification_lead':
      return t('pending.describeLeadDecision', {
        decision: t(action.decision === 'dismissed' ? 'pending.leadDecisionDismissed' : 'pending.leadDecisionSnoozed'),
      })
    case 'propose_crm_note':
      return t('pending.describeCrmNote', { name: action.contact_name || t('pending.unknownContact') })
    case 'launch_vivier_export':
      return t(`pending.describeVivierExport.${action.mode}`)
    case 'prepare_bug_report':
      return t('pending.describeBugReport')
  }
}

/** Ce que l'action ne fera PAS — la promesse qui rend le clic sûr. */
function guarantee(action: PendingChatAction, t: TFunction<'chat'>, mailbox: string): string {
  switch (action.action) {
    case 'prepare_message_audience':
    case 'prepare_message':
      return t('pending.guaranteeMessage')
    case 'schedule_reminder':
      return t('pending.guaranteeReminder')
    case 'enrich_contact':
      // Le SEUL geste du copilote qui coûte : on l'annonce avant le clic. Le
      // chiffre vient de la GRILLE, jamais de la copie — la phrase écrivait
      // « 1 crédit » en dur, ce qui faisait deux sources pour un seul prix.
      return t('pending.guaranteeEnrich')
    case 'export_contact_to_crm':
      return t('pending.guaranteeCrm', { provider: crmLabel(t, action.provider) })
    case 'prepare_mail_draft':
      return t('pending.guaranteeMailDraft', { mailbox })
    case 'prepare_calendar_event':
      return t('pending.guaranteeCalendarEvent')
    case 'find_accounts':
      return t('pending.guaranteeFind')
    case 'open_screen':
      return t('pending.guaranteeScreen')
    case 'prepare_consultant_record':
      return t('pending.guaranteeConsultant')
    case 'push_profile':
      return t('pending.guaranteeScreen')
    case 'toggle_routine':
      return t('pending.guaranteeToggleRoutine')
    case 'update_setting':
      return t('pending.guaranteeUpdateSetting')
    case 'pin_memory_fact':
      return t('pending.guaranteePinFact')
    case 'start_account_analysis':
      // #1957.1 / #1957.2 — le coût (`previewRows`, ligne `previewCost`) ET la
      // durée approximative (« Compte 3 à 6 minutes ») sont dits ICI, AVANT le
      // clic qui lance vraiment l'analyse et débite : `guarantee()` est rendu
      // inconditionnellement, dans TOUTES les phases de la carte.
      return t('pending.guaranteeAnalysis')
    case 'create_contact_from_crm':
      return t('pending.guaranteeCreateContact')
    case 'create_target_list_from_account':
      return t('pending.guaranteeCreateTargetList')
    case 'add_account_to_portfolio':
      return t('pending.guaranteeAddToPortfolio')
    case 'prepare_campaign':
      return t('pending.guaranteeCampaign')
    case 'compile_need':
      return t('pending.guaranteeCompileNeed')
    case 'day_closure':
      return t('dayClosure.guarantee')
    case 'propose_focus_plan':
    case 'propose_weekly_plan':
      return t('focusPlan.guarantee')
    case 'propose_mission_amendment':
      return t('pending.guaranteeMissionAmendment')
    case 'propose_opportunity_update':
      return t('pending.guaranteeOpportunityUpdate')
    case 'prepare_cold_call':
      return t('callBrief.guarantee')
    case 'propose_need_transition':
      return t('pending.guaranteeNeedTransition')
    case 'decide_expense_report':
      return t('pending.guaranteeExpenseReportDecision')
    case 'propose_bulk_enrichment':
      // Le chiffre vient de la GRILLE × le nombre de contacts, jamais de la copie (même règle qu'`enrich_contact`).
      return t('pending.guaranteeBulkEnrich')
    case 'propose_contact_departure':
      return t('pending.guaranteeContactDeparture')
    case 'propose_long_job':
      return t('pending.guaranteeLongJob')
    case 'decide_qualification_lead':
      return t('pending.guaranteeLeadDecision')
    case 'propose_crm_note':
      return t('pending.guaranteeCrmNote')
    case 'launch_vivier_export':
      return t('pending.guaranteeVivierExport')
    case 'propose_people_search':
      // Le chiffre vient de la GRILLE, jamais de la copie (même règle qu'`enrich_contact`).
      return t('pending.guaranteePeopleSearch')
    case 'prepare_bug_report':
      return t('pending.guaranteeBugReport')
  }
}

function confirmLabel(action: PendingChatAction, t: TFunction<'chat'>): string {
  switch (action.action) {
    case 'prepare_message_audience':
    case 'prepare_message':
      return t('pending.confirmMessage')
    case 'schedule_reminder':
      return t('pending.confirmReminder')
    case 'enrich_contact':
      return t('pending.confirmEnrich')
    case 'export_contact_to_crm':
      return t('pending.confirmCrm', { provider: crmLabel(t, action.provider) })
    case 'prepare_mail_draft':
      return t('pending.confirmMailDraft')
    case 'prepare_calendar_event':
      return t('pending.confirmCalendarEvent')
    case 'find_accounts':
      return t('pending.confirmFind')
    case 'open_screen':
      return t('pending.confirmScreen')
    case 'prepare_consultant_record':
      return t('pending.confirmConsultant')
    case 'push_profile':
      return t('pending.confirmScreen')
    case 'toggle_routine':
      return t(action.enabled ? 'pending.confirmToggleRoutine.on' : 'pending.confirmToggleRoutine.off')
    case 'update_setting':
      return t('pending.confirmUpdateSetting')
    case 'pin_memory_fact':
      return t('pending.confirmPinFact')
    case 'start_account_analysis':
      return t('pending.confirmAnalysis')
    case 'create_contact_from_crm':
      return t('pending.confirmCreateContact')
    case 'create_target_list_from_account':
      return t('pending.confirmCreateTargetList')
    case 'add_account_to_portfolio':
      return t('pending.confirmAddToPortfolio')
    case 'prepare_campaign':
      return t('pending.confirmCampaign')
    case 'compile_need':
      return t('pending.confirmCompileNeed')
    case 'day_closure':
      return t('dayClosure.validate', { count: 0 })
    // #2391 — jamais atteint : `FocusPlanCard` n'offre aucun bouton de
    // confirmation dans ce lot (#2391.38 reste `retenu`). Même motif que
    // `day_closure` juste au-dessus : une valeur cohérente malgré tout,
    // jamais un texte inventé au hasard.
    case 'propose_focus_plan':
      return t('focusPlan.title', { date: action.plan.date })
    case 'propose_weekly_plan':
      return t('weeklyPlan.title', { date: action.plan.week_start })
    case 'propose_mission_amendment':
      return t('pending.confirmMissionAmendment')
    case 'propose_opportunity_update':
      return t('pending.confirmOpportunityUpdate')
    case 'prepare_cold_call':
      return t('callBrief.liveModeOn')
    case 'propose_need_transition':
      return t('pending.confirmNeedTransition')
    case 'decide_expense_report':
      return t('pending.confirmExpenseReportDecision')
    case 'propose_bulk_enrichment':
      return t('pending.confirmBulkEnrich', { count: action.contacts.length })
    case 'propose_contact_departure':
      return t('pending.confirmContactDeparture')
    case 'propose_long_job':
      return t('pending.confirmLongJob')
    case 'decide_qualification_lead':
      return t('pending.confirmLeadDecision')
    case 'propose_crm_note':
      return t('pending.confirmCrmNote')
    case 'launch_vivier_export':
      return t(`pending.confirmVivierExport.${action.mode}`)
    case 'propose_people_search':
      return t('pending.confirmPeopleSearch')
    case 'prepare_bug_report':
      return t('pending.confirmBugReport')
  }
}

/** Le libellé résolu server-side (`chat_tools.py`, contre le catalogue RÉEL de
 *  la personne) — jamais retraduit ici. Un libellé absent retombe sur un texte
 *  honnête plutôt qu'une carte à moitié vide. */
function routineLabel(action: Extract<PendingChatAction, { action: 'toggle_routine' }>, t: TFunction<'chat'>): string {
  return action.label?.trim() || t('pending.unknownRoutine')
}

/**
 * #1822 — QUAND la routine passera, en clair, avant le clic.
 *
 * `null` quand rien de l'horaire ne change : `previewRows` saute alors la
 * ligne, plutôt que d'afficher « — » ou de répéter l'horaire actuel comme s'il
 * faisait partie du geste.
 *
 * ⚠️ Le jour vient d'`Intl`, jamais d'une liste de sept noms écrite ici : sept
 * chaînes × deux langues, c'est un libellé d'affichage de plus à traduire, et
 * `weekday` suit la convention ISO (1 = lundi). Le 5 janvier 2026 est un lundi
 * — c'est l'ancre qui transforme 1..7 en une date, sans table.
 */
function scheduleLabel(
  action: Extract<PendingChatAction, { action: 'toggle_routine' }>,
  t: TFunction<'chat'>,
  language: string,
): string | null {
  const parts: string[] = []
  if (typeof action.weekday === 'number' && action.weekday >= 1 && action.weekday <= 7) {
    const mondayAnchor = new Date(Date.UTC(2026, 0, 4 + action.weekday))
    parts.push(new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(mondayAnchor))
  }
  if (typeof action.hour === 'number' && Number.isFinite(action.hour)) {
    parts.push(t('pending.routineHour', { hour: String(action.hour).padStart(2, '0') }))
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Le libellé résolu server-side (`get_settings_overview`) — jamais retraduit
 *  ici, comme `routineLabel`. Un libellé absent retombe sur un texte honnête
 *  plutôt qu'une carte à moitié vide. */
function settingLabel(action: Extract<PendingChatAction, { action: 'update_setting' }>, t: TFunction<'chat'>): string {
  return action.field_label?.trim() || t('pending.unknownSetting')
}

/** Une valeur de réglage, lisible — un booléen se traduit, un nombre s'affiche
 *  tel quel, une valeur absente dit « non mesuré » plutôt qu'un vide qui se
 *  lirait comme un zéro. */
function settingValueLabel(value: boolean | number | null | undefined, t: TFunction<'chat'>): string {
  if (typeof value === 'boolean') return t(value ? 'pending.settingValueOn' : 'pending.settingValueOff')
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return t('pending.settingValueUnknown')
}

/** Les critères, en clair, dans la langue de l'utilisateur — la carte doit dire
 *  ce que la recherche va chercher, pas « des comptes ». */
function criteriaLabel(action: Extract<PendingChatAction, { action: 'find_accounts' }>, t: TFunction<'chat'>): string {
  const parts = [
    ...(action.sectors ?? []).map(sector => t(`pending.sector.${sector}`, { defaultValue: sector })),
    ...(action.signals ?? []).map(signal => t(`pending.signal.${signal}`, { defaultValue: signal })),
    // #3392 — la région (AURA…) se nomme comme le département : une contrainte
    // géographique déclarée ne disparaît pas de la carte à valider.
    ...(action.region ?? []).map(code => REGISTRY_REGIONS.find(region => region.code === code)?.label ?? code),
    // #3876.5 — une ville se nomme comme une ville : jamais confondue avec son département.
    action.city ? t('pending.criteriaCity', { city: action.city }) : '',
    action.department ? t('pending.criteriaDepartment', { code: action.department }) : '',
    action.headcount ? t('pending.criteriaHeadcount', { range: action.headcount }) : '',
    action.keywords ?? '',
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Critères → paramètres d'URL lus par l'écran Séquences (`campaign-prefill`). */
function campaignSearch(action: Extract<PendingChatAction, { action: 'prepare_campaign' }>): Record<string, string> {
  const search: Record<string, string> = {
    contact_ids: action.contacts.map(c => c.contact_id).join(','),
    objective: action.objective,
  }
  if (action.persona) search.persona = action.persona
  if (action.relation) search.relation = action.relation
  if (action.channels?.length) search.channels = action.channels.join(',')
  if (action.tone) search.tone = action.tone
  if (action.mode) search.mode = action.mode
  if (action.template) search.template = action.template
  // #1935.14 — le type de sortie (« liste d'appels » quand SEUL le téléphone
  // est visé) était déjà calculé côté outil et déjà au contrat, mais
  // s'arrêtait là : cet appelant ne le lisait pas parmi les champs transmis.
  if (action.output_kind) search.output_kind = action.output_kind
  return search
}

/** Date illisible → on rend la chaîne brute plutôt qu'un « Invalid Date ». */
function formatDate(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(language, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

/** « Prénom Nom » → first / last, comme le bouton « Enrichir » d'une fiche. */
function splitFullName(fullName: string): { first_name: string; last_name?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? fullName.trim()
  const last = parts.slice(1).join(' ')
  return last ? { first_name: first, last_name: last } : { first_name: first }
}

function buildCrmInput(action: Extract<PendingChatAction, { action: 'export_contact_to_crm' }>): ExportContactInput {
  const { first_name, last_name } = splitFullName(action.contact_name ?? '')
  return {
    firstName: first_name || undefined,
    // Les CRM veulent un nom de famille ; sur un mononyme on réutilise le prénom
    // plutôt que d'échouer à la validation.
    lastName: last_name || first_name || undefined,
    email: action.contact_email ?? undefined,
    jobTitle: action.contact_title ?? undefined,
    company: action.company ?? undefined,
    linkedinUrl: action.linkedin_url ?? undefined,
  }
}

// #1926.28-.31, #1925 — la réponse porte AUSSI la matière de « pourquoi ce
// message ». Tous facultatifs : une réponse d'API plus ancienne (déploiement en
// cours) n'en porte aucun, et la carte doit rester byte-identique dans ce cas.
async function generateDraft(
  action: Extract<PendingChatAction, { action: 'prepare_message' }>,
): Promise<{ subject: string; body: string } & MessageInsight> {
  const response = await apiFetch<
    { success: boolean; data?: { subject?: string; body?: string } & MessageInsight },
    { contactId: string; channel: string; context?: string }
  >({
    path: '/ia/message',
    method: 'POST',
    body: {
      contactId: action.contact_id,
      channel: action.channel,
      context: action.angle?.trim() || undefined,
    },
  })
  const body = response?.data?.body?.trim() ?? ''
  if (!response?.success || !body) throw new Error('generation failed')
  return {
    subject: response.data?.subject?.trim() ?? '',
    body,
    rationale: response.data?.rationale,
    alternativeAngle: response.data?.alternativeAngle,
    brief: response.data?.brief,
    specificity: response.data?.specificity,
    toneOptions: response.data?.toneOptions,
    knowledgeSources: response.data?.knowledgeSources,
    lexiconWarning: response.data?.lexiconWarning,
  }
}
