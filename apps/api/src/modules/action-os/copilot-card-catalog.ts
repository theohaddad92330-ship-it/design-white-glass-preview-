import {
  actionIntentSchema,
  creditCostOf,
  DEFAULT_RETRY_POLICY,
  type ActionIntent,
  type ActionRisk,
  type CardPreview,
  type CreditedAction,
  type PendingChatAction,
  type WorkflowDefinition,
} from '@bellum/contracts'

/**
 * #1931 L2 — ce qu'une carte de Laura DEVIENT dans Action OS.
 *
 * Une carte est un run `copilot_proposal` à UN pas. Ce fichier est la table qui
 * dit, pour chacune des formes que Laura propose et que le routeur exécute
 * (`pendingChatActionSchema` en compte quatorze ; quatre ouvrent un écran et une
 * passe par la route de l'écran d'analyse — voir plus bas) :
 *
 *  - le PAS gouverné (intent, capacité, coût, risque) — lu par la politique
 *    d'approbation exactement comme un pas de workflow ;
 *  - l'INTENT concret que le routeur exécutera, validé par `actionIntentSchema`
 *    (une proposition mal formée donne une carte « Suggérée », jamais un intent
 *    deviné) ;
 *  - les huit lignes de prévisualisation de #1930.
 *
 * Pure : aucune base, aucun service. La vérification que la cible appartient à
 * l'espace est faite par `CopilotCardService` (elle lit la base), et le routeur
 * la refait au dispatch — un identifiant venu du modèle ne prouve rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES PRIX (I1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque pas tire son coût de `creditCostOf` — la grille. Le `cost_credits` que
 * le modèle écrit dans sa proposition n'est JAMAIS lu : un chiffre produit par
 * un LLM n'est pas un prix. Les gestes internes sans ligne propre dans la grille
 * sont rattachés à la ligne « incluse » qui les décrit (`copilot_message`,
 * `message_generation`, `export_or_note`) plutôt qu'à un `0` écrit à la main.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS UNE CARTE D'ACTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `find_accounts`, `open_screen`, `prepare_consultant_record` et
 * `prepare_campaign` n'écrivent rien : ils ouvrent un écran. Le plan lot 4 les exclut (« cartes de navigation :
 * journal sans dispatch ») — `buildCard` rend `null`, rien n'est persisté.
 *
 * `start_account_analysis` (D1, 14/09/2026) écrit et débite, mais pas par le
 * routeur : voir `ScreenRouteAction`. `buildCard` rend `null` pour elle aussi.
 *
 * ⚠️ Les textes de prévisualisation sont en FRANÇAIS et stockés. C'est la forme
 * du contrat L1 (`cardPreviewSchema` porte du texte). La traduction de l'écran
 * (L4) devra soit relire ces clés, soit recalculer — voir le rapport L2.
 */

type NavigationAction =
  | 'find_accounts'
  | 'open_screen'
  | 'prepare_consultant_record'
  // #2322 — un besoin COMPILÉ se lit sur la carte et s'ouvre dans le
  // créateur de besoin : aucune écriture, donc ni permission, ni débit, ni
  // risque à lui inventer. La création garde sa porte (`POST /projects/needs`).
  | 'compile_need'
  // #1903.10 / #1935 — `prepare_campaign` rejoint les cartes de NAVIGATION,
  // pas les effectives, et sa propre documentation le dit : « comme
  // `find_accounts`, le clic n'appelle rien : il ouvre l'écran Séquences
  // déjà pré-rempli ». La création reste un geste PAR CONTACT, sur cet
  // écran, avec sa propre porte.
  //
  // ⚠️ La classer `EffectfulAction` lui inventerait une permission, un
  // débit et un risque qu'elle n'a pas — et un SECOND chemin à côté de
  // celui que l'écran Séquences utilise déjà. Le `cost_credits` de sa
  // charge utile ANNONCE ce que coûtera la suite ; il ne débite rien au
  // clic. Même raisonnement que le docblock de `ScreenRouteAction`.
  | 'prepare_campaign'
  | 'prepare_message_audience'
  // #2376 — le brief d'appel se lit et se décide ENTIÈREMENT sur SA carte
  // (`CallBriefCard.tsx` : branches, mode live) : aucun clic n'appelle le
  // routeur, rien n'est persisté comme run Action OS. Même famille que
  // `compile_need` — une carte de LECTURE, pas d'écriture.
  | 'prepare_cold_call'
  // Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — même famille que
  // `open_screen`/`prepare_consultant_record` : le clic ouvre le panneau de
  // matching, aucun appel au routeur, rien n'est persisté.
  | 'push_profile'
/**
 * D1 — décision Louis 14/09/2026 : proposer une analyse est une CARTE à valider.
 *
 * Elle écrit et elle débite — ce n'est donc pas une carte de navigation — mais
 * le routeur ne la dispatche pas : le clic emprunte la route de l'écran
 * (`POST /analysis/start`, permission `analysis:run`), et Action OS SUIT le
 * lancement (`ANALYSIS_TRACKING_DEFINITION_KEY`, `adoptAnalysisLaunches`). Lui
 * inventer un intent de routeur ferait un SECOND chemin de débit à côté de celui
 * que l'écran utilise depuis toujours — deux vérités sur le même geste.
 */
// #2392 — `day_closure` : la clôture de journée écrit au clic, tâche par tâche,
// par la route de l'écran des tâches (`PATCH /tasks/:id`) — jamais par le routeur.
// #2423.9 — `propose_mission_amendment` : même famille — le clic emprunte la
// route du dossier de la mission (`POST delivery/missions/:id/amendments`,
// `records:write`), jamais le routeur d'intents.
// #2391 — `propose_focus_plan` : même famille, sa propre carte (`plan`),
// aucun run Action OS persisté. Ce lot n'écrit RIEN au clic (créer les blocs
// dans l'agenda réel, #2391.38, reste `retenu`) : c'est une lecture proposée,
// jamais un geste de routeur.
//
// ⚠️ #3076 (épopée #2858) — `propose_opportunity_update` a QUITTÉ cette
// famille. #2324.39 la posait ici (« le clic emprunte les routes de l'écran »),
// mais une carte de CETTE famille n'est jamais persistée (voir le docblock de
// fichier) : `context.pending_actions` ne survit délibérément pas au
// rechargement (`chat-message-context.ts`), et la SEULE façon pour un geste de
// Laura de survivre est de devenir une carte GOUVERNÉE (#1998). Une carte de
// diff CRM (stade/montant/étape/risque) qu'on perd en rechargeant `/chat`
// n'est pas un défaut d'affichage : c'est la proposition qui s'évapore, et le
// Centre d'actions n'en garde aucune trace. Elle est donc redevenue une
// `EffectfulAction` (`STEP_SPECS`), avec `intentType: 'update_opportunity'` —
// le clic reste le geste du commercial (auto-approuvé au clic, comme
// `export_contact_to_crm`), mais la proposition, elle, est désormais persistée
// AVANT le clic.
type ScreenRouteAction =
  | 'start_account_analysis'
  | 'create_contact_from_crm'
  | 'day_closure'
  | 'propose_mission_amendment'
  | 'propose_focus_plan'
  // #2770.55-.62 — le plan de semaine : même famille, même carte de lecture.
  | 'propose_weekly_plan'
  // Épopée #2853 (#2157.1) — même famille que `create_contact_from_crm` :
  // le clic emprunte les routes de l'écran « Mes cibles »
  // (`POST /target-lists` puis `.../items`), jamais le routeur d'intents.
  | 'create_target_list_from_account'
  // Épopée #2781 (#2150.30, LOT j1 26/09) — même famille : le clic emprunte
  // la route déjà là (`POST /accounts/portfolio`, #2150.32/#2150.42), jamais
  // le routeur d'intents.
  | 'add_account_to_portfolio'
  // #2320.26/.27 (épopée #2967) — même famille que `propose_opportunity_update` :
  // le clic emprunte la porte d'état du besoin (`PATCH /projects/needs/:id
  // /status`), jamais le routeur d'intents.
  | 'propose_need_transition'
  // #2987.56 — même famille que `propose_need_transition` (décision binaire
  // sur UN objet déjà RE-VÉRIFIÉ pending côté outil, pas un diff multi-champs
  // comme `propose_opportunity_update` avant sa sortie de cette famille en
  // #3076) : le clic emprunte la route déjà là de l'écran (`POST
  // expenses/reports/:id/validate|reject`, `finance:write`), jamais le
  // routeur d'intents.
  | 'decide_expense_report'
  | 'decide_qualification_lead'
  // #1952.3 / #1952.7 (épopée #2844, lot P07 30/09) — même famille : le clic emprunte
  // les routes déjà là de l'écran (`POST needs/match/bulk`, `POST projects/needs/
  // :id/external-sourcing/search/bulk`), jamais le routeur d'intents.
  | 'propose_long_job'
  // #2434.56 (épopée #3579) — même famille : le clic emprunte la route unitaire déjà là
  // (`POST contacts/:id/enrich`, facturée au contact RÉSOLU), jamais le routeur d'intents.
  | 'propose_bulk_enrichment'
  // #3871.1 (lot V11, 07/10) — même famille que `/exclude` (#3345.2) : le clic
  // emprunte la route unitaire déjà là de la fiche contact (`POST
  // contacts/:id/departed`), jamais le routeur d'intents.
  | 'propose_contact_departure'
  // #3950.1 (décision Louis 09/10/2026) — le lancement de l'export du vivier :
  // le clic emprunte la MÊME route que le bouton de l'écran (`GET
  // talents/export/ats` ou `POST talents/export/bulk`), jamais le routeur
  // d'intents. Même famille que `propose_long_job` juste au-dessus.
  | 'launch_vivier_export'
  // #3869.a (lot M05, 09/10) — la recherche de personnes sur un rôle non pourvu :
  // le clic emprunte la MÊME route que la découverte de `/accounts` (`POST
  // contacts/discover/:accountId`), jamais le routeur d'intents.
  | 'propose_people_search'
  // #2433.7 (lot M10, 09/10) — le signalement préparé depuis une capture : le
  // clic emprunte la porte du formulaire (`POST /feedback`), jamais le routeur
  // d'intents. Même famille que `launch_vivier_export` juste au-dessus.
  | 'prepare_bug_report'
type EffectfulAction = Exclude<PendingChatAction['action'], NavigationAction | ScreenRouteAction>

const NAVIGATION_ACTIONS: ReadonlySet<string> = new Set<NavigationAction>([
  'find_accounts',
  'open_screen',
  'prepare_consultant_record',
  'prepare_campaign',
  'prepare_message_audience',
  'compile_need',
  'prepare_cold_call',
  'push_profile',
])

/** La clé du pas unique d'une carte — une partie de la clé de dispatch `<runId>:effect:<tentative>`. */
export const CARD_STEP_KEY = 'effect'

/** Le run de SUIVI d'une analyse lancée depuis la conversation : aucun pas à exécuter ici. */
export const ANALYSIS_TRACKING_DEFINITION_KEY = 'card_account_analysis'

type StepSpec = {
  intentType: ActionIntent['type']
  intent: string
  capability: string
  permission: string
  credited: CreditedAction
  risk: ActionRisk
  expectedResult: string
  name: { fr: string; en: string }
  /**
   * #1931.17 — CE QUI VIENT APRÈS, quand la carte a RÉUSSI.
   *
   * `expectedResult` dit ce que la carte a obtenu ; celle-ci dit le geste
   * suivant. Deux phrases distinctes parce que ce sont deux questions
   * distinctes — « c'est fait ? » et « et maintenant ? » — et parce qu'une
   * seule des deux s'affiche sous le résultat (`cards.result.next`).
   *
   * Elle vit ici, avec l'intent et le coût de la même carte : c'est le seul
   * endroit qui sait ce que la carte FAIT, donc le seul qui sache ce qui suit.
   * Elle nomme une CAPACITÉ (« ton CRM », « ta messagerie »), jamais un
   * éditeur — un nom d'outil n'arrive que par injection, depuis les connexions
   * de l'espace, et une phrase stockée ne sait pas qui a branché quoi.
   */
  nextStepOnSuccess: string
}

const STEP_SPECS: Record<EffectfulAction, StepSpec> = {
  enrich_contact: {
    intentType: 'enrich_contact',
    intent: "Retrouver les coordonnées professionnelles de l'interlocuteur",
    capability: 'prospection',
    permission: 'contacts:enrich',
    credited: 'contact_enrichment',
    risk: 'low',
    expectedResult: 'Un email ou un téléphone professionnel est présent sur la fiche',
    name: { fr: 'Enrichir un contact', en: 'Enrich a contact' },
    nextStepOnSuccess:
      'Ouvrir la fiche du contact pour relire ce qui a été trouvé, puis préparer une prise de contact.',
  },
  schedule_reminder: {
    intentType: 'schedule_reminder',
    intent: 'Programmer un rappel daté',
    capability: 'calendar',
    permission: 'actions:write',
    credited: 'export_or_note',
    risk: 'low',
    expectedResult: "Un rappel daté existe (agenda connecté, sinon journal d'actions)",
    name: { fr: 'Programmer un rappel', en: 'Schedule a reminder' },
    nextStepOnSuccess:
      'Préparer dès maintenant ce que tu diras le jour du rappel — au moment venu, le contexte aura vieilli.',
  },
  export_contact_to_crm: {
    intentType: 'create_crm_task',
    intent: 'Créer ou mettre à jour la fiche du contact dans le CRM',
    capability: 'crm',
    // La permission de la matrice que porte déjà l'export vers un CRM
    // (« push a contact to a connected CRM ») — la carte n'en invente pas une.
    permission: 'data:export',
    credited: 'export_or_note',
    risk: 'medium',
    expectedResult: 'La fiche existe dans le CRM',
    name: { fr: 'Exporter vers le CRM', en: 'Export to the CRM' },
    nextStepOnSuccess: "Vérifier la fiche dans ton CRM, puis y poser la prochaine action pour que l'équipe la voie.",
  },
  // Épopée #2955 (#2394.6/.19/.43) — le writeback CRM depuis un fil de
  // messagerie : une NOTE sur une fiche déjà là, jamais un export (voir
  // `create_crm_note` vs `create_crm_task`, `action-router.service.ts`).
  // Risque `low` (jamais `medium` comme l'export) : `dispatchCrmNote` n'écrit
  // JAMAIS ni ne crée de fiche — un contact absent du CRM fait échouer le pas
  // avec une raison, sans upsert.
  propose_crm_note: {
    intentType: 'create_crm_note',
    intent: 'Écrire une note sur la fiche déjà présente du contact dans le CRM',
    capability: 'crm',
    // Même permission que `create_crm_note` porte déjà (`intent-permission.ts`).
    permission: 'data:export',
    credited: 'export_or_note',
    risk: 'low',
    expectedResult: 'La note apparaît sur la fiche du contact dans le CRM',
    name: { fr: 'Écrire une note CRM', en: 'Write a CRM note' },
    nextStepOnSuccess: 'Vérifier la note dans ton CRM, puis y poser la prochaine action si besoin.',
  },
  prepare_message: {
    intentType: 'generate_message',
    intent: 'Générer un brouillon de message à relire',
    capability: 'copilot',
    permission: 'contacts:write',
    credited: 'message_generation',
    risk: 'low',
    expectedResult: 'Un brouillon est prêt à relire — rien n’est envoyé',
    name: { fr: 'Préparer un message', en: 'Prepare a message' },
    nextStepOnSuccess: "Relire le brouillon, l'ajuster, puis l'envoyer toi-même — rien ne part sans ton geste.",
  },
  prepare_mail_draft: {
    intentType: 'create_mail_draft',
    intent: 'Déposer un brouillon dans la messagerie',
    capability: 'email',
    permission: 'mailbox:draft',
    credited: 'message_generation',
    risk: 'low',
    expectedResult: 'Un brouillon existe dans la messagerie — rien n’est envoyé',
    name: { fr: 'Préparer un brouillon', en: 'Prepare a draft' },
    nextStepOnSuccess: "Ouvrir le brouillon dans ta messagerie, le relire, puis l'envoyer toi-même.",
  },
  prepare_calendar_event: {
    intentType: 'create_calendar_event',
    intent: "Créer un événement dans l'agenda branché",
    capability: 'calendar',
    permission: 'actions:write',
    credited: 'export_or_note',
    risk: 'low',
    expectedResult: "L'événement existe dans l'agenda — aucune invitation n'est envoyée sans invité déclaré",
    name: { fr: 'Créer un événement', en: 'Create an event' },
    nextStepOnSuccess: "Ouvrir l'événement dans ton agenda pour vérifier l'heure, puis préparer ce que tu diras.",
  },
  toggle_routine: {
    intentType: 'update_routine',
    intent: 'Modifier une routine personnelle',
    capability: 'routines',
    permission: 'routines:write',
    credited: 'copilot_message',
    risk: 'low',
    expectedResult: 'La routine porte le réglage demandé',
    name: { fr: 'Régler une routine', en: 'Adjust a routine' },
    nextStepOnSuccess: "Attendre le prochain passage de la routine, puis vérifier qu'elle rend ce que tu attendais.",
  },
  update_setting: {
    intentType: 'update_setting',
    intent: 'Modifier un réglage',
    capability: 'settings',
    permission: 'settings:write',
    credited: 'copilot_message',
    risk: 'low',
    expectedResult: 'Le réglage porte la nouvelle valeur',
    name: { fr: 'Modifier un réglage', en: 'Change a setting' },
    nextStepOnSuccess: 'Reprendre la demande qui avait buté sur ce réglage — elle passe maintenant.',
  },
  pin_memory_fact: {
    intentType: 'pin_memory_fact',
    intent: "Épingler un fait à la mémoire de l'espace",
    capability: 'memory',
    permission: 'memory:write',
    credited: 'copilot_message',
    risk: 'low',
    expectedResult: 'Le fait apparaît dans Réglages › Mémoire',
    name: { fr: 'Épingler à la mémoire', en: 'Pin to memory' },
    nextStepOnSuccess: 'Reposer ta question : le fait épinglé compte dès la réponse suivante.',
  },
  // #3076 (épopée #2858) — voir le docblock de `ScreenRouteAction` : cette carte
  // ÉTAIT posée là, elle est redevenue gouvernée pour survivre au rechargement.
  // `capability` ne vaut ni `crm` ni `ats` : rien ici ne touche un connecteur
  // externe (l'opportunité vit dans `projects`, chez Bellum) — comme
  // `settings`/`routines`/`memory` juste au-dessus, absente de
  // `CAPABILITY_LABEL_KEYS` (#2858) : aucun badge plutôt qu'un badge inventé.
  propose_opportunity_update: {
    intentType: 'update_opportunity',
    intent: "Appliquer le diff préparé sur l'opportunité",
    capability: 'pipeline',
    permission: 'records:write',
    credited: 'copilot_message',
    // Même famille de risque que l'export CRM : ça change ce que toute l'équipe
    // voit du pipeline (stade, montant, prochaine étape ou risque de l'affaire).
    risk: 'medium',
    expectedResult: "L'opportunité porte les champs préparés",
    name: { fr: 'Mettre à jour une opportunité', en: 'Update an opportunity' },
    nextStepOnSuccess: "Ouvrir le dossier de l'opportunité pour vérifier ce qui vient de changer.",
  },
}

function isEffectful(type: string): type is EffectfulAction {
  return Object.prototype.hasOwnProperty.call(STEP_SPECS, type)
}

function definitionOf(type: EffectfulAction): WorkflowDefinition {
  const spec = STEP_SPECS[type]
  return {
    key: `card_${type}`,
    version: 1,
    name: spec.name,
    description: spec.name,
    trigger: 'copilot_proposal',
    // Un plancher, jamais un plafond (voir `workflowDefinitionSchema`) : la
    // politique relève selon le pas, le volume et la dépense de l'espace.
    minimumLevel: 'n2_user_approval',
    enabled: true,
    steps: [
      {
        key: CARD_STEP_KEY,
        intentType: spec.intentType,
        intent: spec.intent,
        capability: spec.capability,
        permission: spec.permission,
        estimatedCredits: creditCostOf(spec.credited),
        risk: spec.risk,
        expectedResult: spec.expectedResult,
        dependsOn: [],
        retry: DEFAULT_RETRY_POLICY,
      },
    ],
  }
}

/** La définition d'une carte depuis la clé persistée (`workflow_runs.definition_key`). `null` pour tout le reste. */
export function cardDefinitionForKey(key: string): WorkflowDefinition | null {
  if (!key.startsWith('card_')) return null
  const type = key.slice('card_'.length)
  return isEffectful(type) ? definitionOf(type) : null
}

/**
 * #1931.17 — la prochaine étape à proposer quand CETTE carte a réussi.
 *
 * `null` hors de la table : une carte de navigation n'a rien exécuté, et une
 * clé inconnue ne se devine pas. Un `null` ne produit AUCUNE ligne à l'écran
 * (`resultRowsOf` saute les valeurs vides) — c'est « il n'y a pas de suite à
 * annoncer », jamais une phrase de remplissage.
 */
export function cardNextStepOnSuccess(definitionKey: string): string | null {
  if (!definitionKey.startsWith('card_')) return null
  const type = definitionKey.slice('card_'.length)
  return isEffectful(type) ? STEP_SPECS[type].nextStepOnSuccess : null
}

const CHANNEL_LABEL = { email: 'e-mail', linkedin: 'message LinkedIn', phone: "script d'appel" } as const

/** L'intent candidat, AVANT validation — `null` quand la forme n'a pas d'intent possible. */
function candidateIntent(action: PendingChatAction): unknown {
  switch (action.action) {
    case 'enrich_contact':
      // D4 — une carte ne tient jamais la conversation pendant la cascade : 202 + suivi.
      return { type: 'enrich_contact', contactId: action.contact_id, mode: 'queued' }
    case 'schedule_reminder':
      return {
        type: 'schedule_reminder',
        contactId: action.contact_id,
        at: action.at,
        ...(action.note ? { note: action.note } : {}),
      }
    case 'export_contact_to_crm':
      return { type: 'create_crm_task', contactId: action.contact_id, crmProvider: action.provider }
    // Épopée #2955 (#2394.6/.19/.43) — jamais `crmProvider` : `create_crm_note`
    // cherche la fiche existante par email, il ne route pas par fournisseur.
    case 'propose_crm_note':
      return { type: 'create_crm_note', contactId: action.contact_id, note: action.note }
    case 'prepare_message':
      return {
        type: 'generate_message',
        contactId: action.contact_id,
        channel: action.channel,
        ...(action.angle ? { angle: action.angle } : {}),
      }
    case 'prepare_mail_draft':
      return {
        type: 'create_mail_draft',
        to: action.to,
        subject: action.subject,
        body: action.body,
        ...(action.thread_id ? { threadId: action.thread_id } : {}),
      }
    case 'prepare_calendar_event':
      return {
        type: 'create_calendar_event',
        title: action.title,
        // L'intent exige un instant UTC (`Z`) ; la proposition peut porter un décalage.
        startsAt: new Date(action.starts_at).toISOString(),
        ...(action.duration_minutes ? { durationMinutes: action.duration_minutes } : {}),
        ...(action.attendees?.length ? { attendees: action.attendees } : {}),
        ...(action.note ? { note: action.note } : {}),
      }
    case 'toggle_routine':
      return {
        type: 'update_routine',
        key: action.key,
        enabled: action.enabled,
        ...(action.hour !== undefined ? { hour: action.hour } : {}),
        ...(action.weekday !== undefined ? { weekday: action.weekday } : {}),
        ...(action.channel ? { channel: action.channel } : {}),
      }
    case 'update_setting':
      return { type: 'update_setting', screen: action.screen, field: action.field, newValue: action.new_value }
    case 'pin_memory_fact':
      return {
        type: 'pin_memory_fact',
        fact: action.fact,
        ...(action.account_id ? { accountId: action.account_id } : {}),
      }
    // #3076 (épopée #2858) — le diff FIGÉ, tel quel : `previous` ne traverse pas
    // (l'intent n'a besoin que de ce qu'il va ÉCRIRE), et `changes` reste dans
    // l'ordre de la carte — c'est aussi celui dans lequel `dispatchOne` les
    // appliquera, une à une.
    case 'propose_opportunity_update':
      return {
        type: 'update_opportunity',
        projectId: action.project_id,
        projectLabel: action.project_label,
        changes: action.changes.map(change => ({ field: change.field, next: change.next })),
      }
    case 'find_accounts':
    case 'open_screen':
    case 'prepare_consultant_record':
    case 'prepare_campaign':
    case 'prepare_message_audience':
    case 'compile_need':
    case 'start_account_analysis':
    case 'create_contact_from_crm':
    case 'day_closure':
    case 'propose_mission_amendment':
    case 'propose_focus_plan':
    case 'propose_weekly_plan':
    case 'prepare_cold_call':
    case 'create_target_list_from_account':
    case 'add_account_to_portfolio':
    case 'push_profile':
    case 'propose_need_transition':
    case 'decide_expense_report':
    case 'decide_qualification_lead':
    case 'propose_long_job':
    case 'propose_bulk_enrichment':
    case 'propose_contact_departure':
    case 'launch_vivier_export':
    case 'propose_people_search':
    case 'prepare_bug_report':
      // D1 — l'analyse part par la route de l'écran, pas par le routeur (voir
      // `ScreenRouteAction` plus haut) : aucun intent à construire ici.
      // Épopée #2853 (#2157.1) — même raison que `create_contact_from_crm` :
      // le clic appelle `POST /target-lists` puis `.../items` directement,
      // jamais le routeur d'intents.
      // Épopée #2781 (#2150.30, LOT j1 26/09) — même raison : le clic appelle
      // `POST /accounts/portfolio` directement (#2150.32/#2150.42), jamais le
      // routeur d'intents.
      // #1995 — la création d'une fiche depuis une ligne CRM part par la même
      // porte (`POST /accounts/:id/contacts/from-crm`) : un intent de routeur
      // ferait un SECOND chemin d'écriture sur le même geste.
      // #1903.10 / #1935 — `prepare_campaign` OUVRE l'écran Séquences
      // pré-rempli : elle est dans `NavigationAction` (voir en tête), et ce
      // `switch` lit la forme BRUTE, pas `EffectfulAction` — la liste des cas
      // est donc littérale et doit citer chaque navigation une seconde fois.
      return null
    default: {
      const exhaustive: never = action
      throw new Error(`copilot-card-catalog: forme inconnue ${JSON.stringify(exhaustive)}`)
    }
  }
}

function formatAt(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 16).replace('T', ' à ')
}

/**
 * #1930.14 — les champs que l'export CRM va écrire, un « avant → après » par
 * ligne. Chaîne vide quand aucun champ au-delà du nom n'est connu : `content`
 * reste `null` dans ce cas (voir l'appelant), jamais une ligne inventée.
 */
function crmFieldChanges(action: PendingChatAction & { action: 'export_contact_to_crm' }): string {
  const lines = [
    action.contact_email?.trim() ? `E-mail : non vérifié → ${action.contact_email.trim()}` : null,
    action.contact_title?.trim() ? `Fonction : non vérifié → ${action.contact_title.trim()}` : null,
    action.company?.trim() ? `Entreprise : non vérifié → ${action.company.trim()}` : null,
    action.linkedin_url?.trim() ? `LinkedIn : non vérifié → ${action.linkedin_url.trim()}` : null,
  ].filter((line): line is string => line !== null)
  // ' · ' plutôt que des sauts de ligne : `content` se rend dans une seule
  // cellule sans `white-space: pre-wrap` (`CopilotCards.tsx`) — un saut de
  // ligne y disparaîtrait en silence et recollerait les champs entre eux.
  return lines.join(' · ')
}

/** #3076 — le libellé FRANÇAIS d'un champ d'opportunité, pour le diff figé (jamais l'inverse : un champ non couvert ne se devine pas). */
const OPPORTUNITY_FIELD_LABEL: Record<'stage' | 'estimated_amount' | 'next_step' | 'risk', string> = {
  stage: 'Stade',
  estimated_amount: 'Montant estimé',
  next_step: 'Prochaine étape',
  risk: 'Risque',
}

/**
 * #3076 — le diff « avant → après », champ par champ. `previous` absent ou
 * `null` se dit « non connu » plutôt qu'un blanc qui se lirait comme une
 * valeur vide (GA-18/19) — même raison que `crmFieldChanges` ci-dessous.
 */
function opportunityChangeLines(action: PendingChatAction & { action: 'propose_opportunity_update' }): string {
  return action.changes
    .map(change => {
      const previous = change.previous === null || change.previous === undefined ? 'non connu' : String(change.previous)
      return `${OPPORTUNITY_FIELD_LABEL[change.field]} : ${previous} → ${String(change.next)}`
    })
    .join(' · ')
}

function previewOf(action: PendingChatAction & { action: EffectfulAction }, cost: number): CardPreview {
  switch (action.action) {
    case 'enrich_contact':
      return {
        whatWillHappen: `Chercher les coordonnées professionnelles de ${action.contact_name} (${action.organization_name}).`,
        targetObject: action.contact_name,
        destination: null,
        content: null,
        dataUsed: "Le nom et l'entreprise de la fiche",
        costCredits: cost,
        connectionUsed: null,
        whatWillNotHappen: "Aucun crédit n'est débité si rien n'est trouvé. Personne n'est contacté.",
      }
    case 'schedule_reminder':
      return {
        whatWillHappen: `Programmer un rappel le ${formatAt(action.at)}.`,
        targetObject: action.contact_name?.trim() || 'Contact',
        destination: "votre agenda, sinon le journal d'actions",
        content: action.note ?? null,
        dataUsed: null,
        costCredits: cost,
        connectionUsed: 'votre agenda',
        whatWillNotHappen: "Aucune invitation n'est envoyée.",
      }
    case 'export_contact_to_crm':
      return {
        whatWillHappen: `Créer ou mettre à jour la fiche de ${action.contact_name?.trim() || 'ce contact'} dans votre CRM.`,
        targetObject: action.contact_name?.trim() || 'Contact',
        destination: 'votre CRM',
        // #1930.14 — LE DIFF AVANT/APRÈS. `previewOf` reste PURE (aucun appel
        // CRM, voir le docblock de fichier) : le « avant » n'est donc jamais
        // LU, et chaque ligne le dit — « non vérifié » — plutôt que de laisser
        // un blanc qui se lirait comme « le champ est vide côté CRM », une
        // affirmation différente qu'on n'a pas les moyens de faire (GA-18/19).
        // Seuls les champs que Laura s'apprête RÉELLEMENT à écrire entrent
        // dans la liste : un champ que la proposition ne porte pas n'est pas
        // un changement inventé. Le nom n'y figure pas une seconde fois — il
        // est déjà `targetObject` (loi 4, rien ne se répète sous la même forme).
        content: crmFieldChanges(action) || null,
        dataUsed: 'Les champs de la fiche contact',
        costCredits: cost,
        connectionUsed: 'votre CRM',
        whatWillNotHappen: "Aucun message n'est envoyé au contact.",
      }
    // Épopée #2955 (#2394.6/.19/.43) — même style que `export_contact_to_crm`
    // juste au-dessus, mais SANS diff champ à champ : une note n'écrase rien
    // d'existant, `content` porte le texte lui-même.
    case 'propose_crm_note':
      return {
        whatWillHappen: `Écrire une note sur la fiche de ${action.contact_name?.trim() || 'ce contact'} dans votre CRM.`,
        targetObject: action.contact_name?.trim() || 'Contact',
        destination: 'votre CRM',
        content: action.note,
        dataUsed: null,
        costCredits: cost,
        connectionUsed: 'votre CRM',
        whatWillNotHappen:
          "Aucune fiche n'est créée : la note s'ajoute seulement si le contact existe déjà dans votre CRM.",
      }
    case 'prepare_message':
      return {
        whatWillHappen: `Générer un brouillon (${CHANNEL_LABEL[action.channel]}) pour ${action.contact_name?.trim() || 'ce contact'}.`,
        targetObject: action.contact_name?.trim() || 'Contact',
        destination: null,
        content: action.angle ?? null,
        dataUsed: null,
        costCredits: cost,
        connectionUsed: null,
        whatWillNotHappen: 'Aucun envoi : le brouillon reste à relire.',
      }
    case 'prepare_mail_draft':
      return {
        whatWillHappen: 'Créer un brouillon dans votre messagerie.',
        // G.2 — l'écran étiquette `targetObject` « Objet » : c'est l'objet du mail,
        // le destinataire a sa propre ligne (« Destination »).
        targetObject: action.subject,
        destination: action.to,
        content: action.body.slice(0, 5000),
        dataUsed: null,
        costCredits: cost,
        connectionUsed: 'votre messagerie',
        whatWillNotHappen: "Aucun message n'est envoyé.",
      }
    case 'prepare_calendar_event': {
      const guests = action.attendees ?? []
      return {
        whatWillHappen: `Créer l'événement « ${action.title} » le ${formatAt(action.starts_at)}.`,
        targetObject: action.title,
        destination: 'votre agenda',
        content:
          [guests.length > 0 ? `Invités : ${guests.join(', ')}` : null, action.note ?? null]
            .filter((line): line is string => line !== null)
            .join(' · ')
            .slice(0, 5000) || null,
        dataUsed: null,
        costCredits: cost,
        connectionUsed: 'votre agenda',
        whatWillNotHappen:
          guests.length > 0
            ? "Rien n'est créé avant ta validation ; à la validation, ton agenda envoie l'invitation aux invités listés."
            : "Rien n'est créé avant ta validation. Aucune invitation n'est envoyée.",
      }
    }
    case 'toggle_routine':
      return {
        whatWillHappen: `${action.enabled ? 'Activer' : 'Désactiver'} la routine « ${action.label?.trim() || action.key} ».`,
        targetObject: action.label?.trim() || action.key,
        destination: null,
        content: null,
        dataUsed: null,
        costCredits: cost,
        connectionUsed: null,
        whatWillNotHappen: "La routine n'est pas exécutée maintenant.",
      }
    case 'update_setting':
      return {
        whatWillHappen: `Modifier le réglage « ${action.field_label?.trim() || action.field} ».`,
        targetObject: action.field_label?.trim() || action.field,
        destination: null,
        content: `${action.old_value === null || action.old_value === undefined ? 'valeur actuelle non lue' : String(action.old_value)} → ${String(action.new_value)}`,
        dataUsed: null,
        costCredits: cost,
        connectionUsed: null,
        whatWillNotHappen: "Aucun autre réglage n'est modifié.",
      }
    case 'pin_memory_fact':
      return {
        whatWillHappen: "Épingler un fait à la mémoire de l'espace.",
        targetObject: "Mémoire de l'espace",
        destination: null,
        content: action.fact,
        dataUsed: null,
        costCredits: cost,
        connectionUsed: null,
        whatWillNotHappen: "Personne n'est notifié.",
      }
    case 'propose_opportunity_update':
      return {
        whatWillHappen: `Mettre à jour l'opportunité ${action.project_label}.`,
        targetObject: action.project_label,
        destination: null,
        content: opportunityChangeLines(action),
        dataUsed: action.proof,
        costCredits: cost,
        connectionUsed: null,
        whatWillNotHappen: "Aucun autre champ n'est modifié. Gagné/perdu ne passent pas par cette carte.",
      }
    default: {
      const exhaustive: never = action
      throw new Error(`copilot-card-catalog: prévisualisation inconnue ${JSON.stringify(exhaustive)}`)
    }
  }
}

export type BuiltCard = {
  definition: WorkflowDefinition
  /** `null` = la proposition ne donne pas d'intent valide : la carte reste « Suggérée ». */
  intents: Record<string, ActionIntent> | null
  preview: CardPreview | null
  /** Les cibles à VÉRIFIER contre l'espace avant de persister (jamais crues sur parole). */
  contactId: string | null
  accountId: string | null
}

/** La carte d'une proposition — `null` pour une carte de navigation (rien à gouverner). */
export function buildCard(action: PendingChatAction): BuiltCard | null {
  if (NAVIGATION_ACTIONS.has(action.action) || !isEffectful(action.action)) return null
  const definition = definitionOf(action.action)
  const parsed = actionIntentSchema.safeParse(candidateIntent(action))
  const step = definition.steps[0]
  const intent = parsed.success ? parsed.data : null
  return {
    definition,
    intents: intent && step ? { [step.key]: intent } : null,
    preview:
      intent && step
        ? previewOf(action as PendingChatAction & { action: EffectfulAction }, step.estimatedCredits)
        : null,
    contactId: 'contact_id' in action && intent ? action.contact_id : null,
    accountId:
      'account_id' in action && typeof action.account_id === 'string' && action.account_id ? action.account_id : null,
  }
}
