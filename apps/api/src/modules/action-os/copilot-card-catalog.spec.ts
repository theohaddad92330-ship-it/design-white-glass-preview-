import {
  actionIntentSchema,
  cardPreviewSchema,
  creditCostOf,
  PENDING_CHAT_ACTION_TYPES,
  workflowDefinitionSchema,
  type PendingChatAction,
} from '@bellum/contracts'
import { buildCard, cardDefinitionForKey, CARD_STEP_KEY } from './copilot-card-catalog'

/**
 * #1931 L2 — la table « proposition de Laura → pas gouverné ».
 */

const UUID = '11111111-1111-4111-8111-111111111111'

/** Une proposition RÉALISTE par forme — le corpus que les tests balaient. */
const SAMPLES: PendingChatAction[] = [
  {
    action: 'enrich_contact',
    contact_id: UUID,
    contact_name: 'Claire Dubois',
    organization_name: 'ACME',
    cost_credits: 99,
  },
  { action: 'schedule_reminder', contact_id: UUID, contact_name: 'Claire Dubois', at: '2026-09-15T09:00:00.000Z' },
  {
    action: 'export_contact_to_crm',
    contact_id: UUID,
    provider: 'hubspot',
    contact_name: 'Claire Dubois',
    contact_email: 'claire@acme.example',
    contact_title: 'CTO',
    company: 'ACME',
  },
  { action: 'export_contact_to_crm', contact_id: UUID, provider: 'pipedrive', contact_name: 'Claire Dubois' },
  { action: 'prepare_message', contact_id: UUID, channel: 'email', contact_name: 'Claire Dubois', angle: 'Suite POC' },
  { action: 'prepare_mail_draft', to: 'claire@acme.example', subject: 'Suite', body: 'Bonjour Claire,' },
  { action: 'prepare_calendar_event', title: 'Point SNCF', starts_at: '2026-10-20T21:00:00Z' },
  { action: 'toggle_routine', key: 'morning_brief', label: 'Brief du matin', enabled: true, hour: 8 },
  {
    action: 'update_setting',
    screen: '/settings/notifications',
    field: 'weekly_digest',
    new_value: true,
    old_value: false,
  },
  { action: 'pin_memory_fact', fact: 'Facturation à 45 jours' },
  { action: 'find_accounts', sectors: ['banque'] },
  { action: 'open_screen', route: '/pipeline', label: 'Pipeline' },
  { action: 'prepare_consultant_record', route: '/consultants/new', full_name: 'Jean Martin' },
  { action: 'push_profile', route: '/consultants?matchProjectId=proj-1', project_id: 'proj-1' },
  // #1903.10 / #1935 — préparer une campagne OUVRE l'écran Séquences pré-rempli.
  // La charge est celle de `chat_tools.py::prepare_campaign` : objectif et
  // audience requis, le reste posé seulement s'il a été dit.
  {
    action: 'prepare_campaign',
    objective: 'Reprendre contact après le salon',
    output_kind: 'sequence_campaign',
    mode: 'audience',
    channels: ['email'],
    contacts: [{ contact_id: UUID, full_name: 'Julie Martin', has_email: true, has_phone: false }],
    excluded: [{ contact_id: UUID, full_name: 'Marc Dupont', reason: 'Aucune adresse connue' }],
    cost_credits: 0,
  },
  // #3894.3 — plusieurs destinataires NOMMÉS par la personne : chacun devient sa
  // propre carte côté web ; l'audience, elle, n'est pas un pas gouverné.
  {
    action: 'prepare_message_audience',
    explicit_multi_contact: true,
    channel: 'email',
    recipients: [
      { contact_id: UUID, contact_name: 'Marie Durand' },
      { contact_id: '22222222-2222-2222-2222-222222222222', contact_name: 'Paul Martin' },
    ],
  },
  // D1 — décision Louis 14/09/2026 : proposer une analyse est une carte à valider.
  { action: 'start_account_analysis', company: 'THALES', plan_token: 'tok', cost_credits: 8 },
  // #1995 — décision Louis 14/09/2026 : créer la fiche d'une personne que seul
  // le CRM connecté nomme. Même porte que l'analyse — la route de l'écran.
  {
    action: 'create_contact_from_crm',
    account_id: 'acc-1',
    company: 'THALES',
    full_name: 'Sandrine Pata',
  },
  // #2322 — un besoin COMPILÉ depuis une source. Carte de navigation : elle se
  // lit, puis elle ouvre le créateur de besoin. Rien à gouverner ici.
  {
    action: 'compile_need',
    cost_credits: 0,
    compiled: {
      status: 'proposition',
      source: { kind: 'email', locator: 'fil « besoin EDI »', stated_at: '2026-09-12' },
      account_id: null,
      company_hint: 'THALES',
      fields: [
        {
          field: 'work_to_do',
          value: 'reprendre les flux EDI fournisseurs',
          provenance: {
            source_kind: 'email',
            excerpt: 'il faut reprendre les flux EDI fournisseurs',
            locator: null,
            stated_at: '2026-09-12',
            confidence: 'explicite',
          },
        },
      ],
      proposed_contacts: [],
      unknowns: [],
      contradictions: [],
      not_understood: ['expected_outcome', 'skills'],
      confirmation_level: 'rapporte',
      clarification: null,
    },
  },
  // #2392 — la clôture de fin de journée. Carte d'ÉCRAN : ses décisions
  // s'écrivent par `PATCH /tasks/:id`, au clic — rien à gouverner ici.
  {
    action: 'day_closure',
    cost_credits: 0,
    closure: {
      date: '2026-09-23',
      timeZone: 'Europe/Paris',
      tasksState: 'ready',
      tasksReason: null,
      results: [],
      commitments: [],
      waitingOn: { state: 'not_connected', reason: null, threads: [] },
      blocked: [],
      toDecide: [],
      toValidate: { state: 'ready', reason: null, cards: [] },
      firstTomorrow: null,
    },
  },
  // #2423.9 — un avenant PROPOSÉ sur une mission déjà signée. Carte d'ÉCRAN :
  // le clic enregistre la proposition par la route du dossier de la mission
  // (`POST delivery/missions/:id/amendments`) — rien à gouverner ici.
  {
    action: 'propose_mission_amendment',
    mission_id: UUID,
    event_type: 'daily_rate_change',
    effective_from: '2026-10-01',
    proof: 'Email du 20/09, confirmation du client',
    previous_term: { daily_rate: 550 },
    new_term: { daily_rate: 600 },
    cost_credits: 0,
  },
  // #2391 — un plan de journée PROPOSÉ. Carte d'ÉCRAN : rendue par
  // `FocusPlanCard`, rien à gouverner ici (créer les blocs dans l'agenda
  // réel, #2391.38, reste `retenu`, hors de ce lot).
  {
    action: 'propose_focus_plan',
    cost_credits: 0,
    plan: {
      date: '2026-10-01',
      time_zone: 'Europe/Paris',
      energy: null,
      blocks: [],
      deferred_blocks: [],
      margin_minutes: 0,
    },
  },
  // #2770.55-.62 — un plan de SEMAINE proposé : même famille, rendu par `WeeklyPlanCard`.
  {
    action: 'propose_weekly_plan',
    cost_credits: 0,
    plan: {
      week_start: '2026-10-05',
      time_zone: 'Europe/Paris',
      energy: null,
      days: [],
      deferred_blocks: [],
      margin_minutes: 0,
    },
  },
  // #2324.39 — une mise à jour d'opportunité PRÉPARÉE, diff figé.
  // #3076 (épopée #2858) — REDEVENUE gouvernée : le clic reste le geste du
  // commercial (auto-approuvé, MÊMES routes que l'écran) mais la proposition
  // est désormais persistée avant le clic (voir le docblock de `ScreenRouteAction`).
  {
    action: 'propose_opportunity_update',
    project_id: UUID,
    project_label: 'Refonte data',
    changes: [{ field: 'stage', previous: 'qualified', next: 'confirmed' }],
    proof: 'Compte rendu du 22/09',
    cost_credits: 0,
  },
  // #2376 — un brief d'appel COMPILÉ pour un contact du portefeuille. Carte de
  // navigation : elle se lit et se décide entièrement sur `CallBriefCard.tsx`
  // (branches, mode live) — rien à gouverner ici.
  {
    action: 'prepare_cold_call',
    contact_id: UUID,
    contact_name: 'Claire Dubois',
    contact_title: 'DSI',
    organization_name: 'ACME Digital',
    context: null,
    reason: 'Aucun échange depuis le salon VivaTech (avril).',
    objective: 'Qualifier un besoin de renfort DevOps pour le T4.',
    opening_question: 'Vous avez trente secondes pour que je vous explique pourquoi je vous appelle ?',
    next_questions: ['Qui pilote le périmètre applicatif chez vous ?', 'Où en est le projet de migration cloud ?'],
    objection: 'On a déjà un prestataire sur ce périmètre.',
    fallback: 'Demander qui pilote le sujet en interne, sans insister.',
    expected_outcome: 'Un besoin identifié ou une orientation vers le bon interlocuteur.',
    cost_credits: 0,
  },
  // Épopée #2853 (#2157.1) — une cible PROPOSÉE depuis Laura. Carte d'ÉCRAN :
  // le clic appelle `POST /target-lists` puis `.../items` — même porte que
  // `create_contact_from_crm`, rien à gouverner ici.
  {
    action: 'create_target_list_from_account',
    account_id: 'acc-1',
    company: 'THALES',
    name: null,
    cost_credits: 0,
  },
  // Épopée #2781 (#2150.30, LOT j1 26/09) — un ajout au portefeuille PROPOSÉ
  // depuis Laura. Carte d'ÉCRAN : le clic appelle `POST /accounts/portfolio`
  // — même porte que #2150.32/#2150.42, rien à gouverner ici.
  {
    action: 'add_account_to_portfolio',
    company_name: 'OGF',
    cost_credits: 0,
  },
  // #2320.26/.27 (épopée #2967) — une transition de besoin PROPOSÉE. Carte
  // d'ÉCRAN : le clic passe par la porte d'état du besoin (`PATCH
  // /projects/needs/:id/status`) — rien à gouverner ici.
  {
    action: 'propose_need_transition',
    need_id: UUID,
    from_status: 'qualified',
    to_status: 'matching',
    reason: null,
    cost_credits: 0,
  },
  // #2987.56 — une décision de note de frais PROPOSÉE. Carte d'ÉCRAN : le
  // clic passe par la route de l'écran (`POST expenses/reports/:id/
  // validate|reject`) — rien à gouverner ici.
  {
    action: 'decide_expense_report',
    expense_report_id: UUID,
    decision: 'validate',
    reference: 'NF-2026-014',
    bearer_name: 'Julie Martin',
    account_name: 'Orange',
    period_month: '2026-09',
    reason: null,
    cost_credits: 0,
  },
  // #3345.2 — un écartement de piste PROPOSÉ. Carte d'ÉCRAN : le clic passe
  // par la route de l'onglet Opportunités — rien à gouverner ici.
  {
    action: 'decide_qualification_lead',
    account_id: UUID,
    account_name: 'Decathlon',
    lead_key: UUID,
    lead_label: 'Refonte data',
    decision: 'dismissed',
    reason: 'no_real_demand',
    note: null,
    snoozed_until: null,
    cost_credits: 0,
  },
  // #3871.1 (lot V11, 07/10) — un passage en historique PROPOSÉ. Carte
  // d'ÉCRAN : le clic passe par la route de la fiche contact (`POST
  // /contacts/:id/departed`) — rien à gouverner ici.
  {
    action: 'propose_contact_departure',
    contact_id: UUID,
    contact_name: 'Pierre Eynatte',
    account_id: UUID,
    cost_credits: 0,
  },
  // Épopée #2955 (#2394.6/.19/.43) — une note CRM PROPOSÉE depuis un fil de
  // messagerie. Carte GOUVERNÉE (comme `export_contact_to_crm`) : le clic
  // dispatche `create_crm_note` par le routeur.
  {
    action: 'propose_crm_note',
    contact_id: UUID,
    contact_name: 'Claire Dubois',
    note: 'Relancer sur le devis, silence depuis 8 jours.',
    thread_id: 'thread-42',
    cost_credits: 0,
  },
  // #1952.3 / #1952.7 (épopée #2844, lot P07) — le lancement d'un travail long
  // PROPOSÉ. Carte d'ÉCRAN : le clic passe par `POST needs/match/bulk` — rien à
  // gouverner ici.
  {
    action: 'propose_long_job',
    job: 'bulk_matching',
    need_ids: [UUID],
    cost_credits: 0,
  },
  // #2434.56 (épopée #3579) — l'enrichissement EN MASSE proposé, coût total annoncé.
  // Carte d'ÉCRAN : le clic passe par `POST contacts/:id/enrich`, contact par contact.
  {
    action: 'propose_bulk_enrichment',
    contacts: [{ contact_id: UUID, contact_name: 'Claire Dubois', organization_name: 'Decathlon' }],
    cost_credits: 1,
    credit_kind: 'enrichment',
  },
  // #3950.1 (décision Louis 09/10/2026, lot G01) — le lancement de l'export
  // du vivier PROPOSÉ. Carte d'ÉCRAN : le clic passe par `GET
  // talents/export/ats` ou `POST talents/export/bulk` — rien à gouverner ici.
  {
    action: 'launch_vivier_export',
    mode: 'ats',
    cost_credits: 0,
  },
  // #3869.a (lot M05, 09/10) — la recherche de personnes sur un rôle non pourvu
  // PROPOSÉE. Carte d'ÉCRAN : le clic passe par `POST contacts/discover/:accountId`.
  {
    action: 'propose_people_search',
    account_id: UUID,
    company_name: 'Decathlon',
    roles: ['Responsable achats'],
    cost_credits: 1,
    credit_kind: 'enrichment',
  },
  // #2433.7 (lot M10, 09/10) — le signalement PRÉPARÉ depuis une capture.
  // Carte de FORMULAIRE : le clic passe par `POST /feedback` — rien à gouverner ici.
  {
    action: 'prepare_bug_report',
    message: 'L’écran Comptes affiche « Erreur 500 » après le clic sur « Analyser ».',
    cost_credits: 0,
  },
]

/** Les formes qu'Action OS ne DISPATCHE pas : rien à gouverner, rien à persister. */
const UNDISPATCHED = [
  'find_accounts',
  'open_screen',
  'prepare_consultant_record',
  'prepare_campaign',
  'prepare_message_audience',
  'start_account_analysis',
  'create_contact_from_crm',
  'compile_need',
  'day_closure',
  'propose_mission_amendment',
  'propose_focus_plan',
  'propose_weekly_plan',
  'prepare_cold_call',
  'create_target_list_from_account',
  'add_account_to_portfolio',
  'push_profile',
  'propose_need_transition',
  'decide_expense_report',
  'decide_qualification_lead',
  'propose_long_job',
  'propose_bulk_enrichment',
  'propose_contact_departure',
  'launch_vivier_export',
  'propose_people_search',
  'prepare_bug_report',
]

describe('buildCard — ce qu’une proposition devient', () => {
  it('le corpus couvre les trente-cinq formes que Laura émet', () => {
    expect(new Set(SAMPLES.map(sample => sample.action))).toEqual(new Set(PENDING_CHAT_ACTION_TYPES))
  })

  it.each(SAMPLES.filter(s => !UNDISPATCHED.includes(s.action)))(
    '$action → un intent VALIDE, une prévisualisation valide, une définition valide',
    sample => {
      const card = buildCard(sample)
      expect(card).not.toBeNull()
      const intent = card?.intents?.[CARD_STEP_KEY]
      expect(actionIntentSchema.safeParse(intent).success).toBe(true)
      expect(cardPreviewSchema.safeParse(card?.preview).success).toBe(true)
      expect(workflowDefinitionSchema.safeParse(card?.definition).success).toBe(true)
      expect(card?.definition.trigger).toBe('copilot_proposal')
    },
  )

  it('les cartes de NAVIGATION ne sont pas des actions — rien à persister', () => {
    for (const action of [
      'find_accounts',
      'open_screen',
      'prepare_consultant_record',
      'prepare_campaign',
      'prepare_message_audience',
      'push_profile',
    ]) {
      expect(buildCard(SAMPLES.find(sample => sample.action === action) as PendingChatAction)).toBeNull()
    }
  })

  /**
   * D1 — LA CARTE D'ANALYSE N'EST PAS UN PAS GOUVERNÉ PAR LE ROUTEUR.
   *
   * Le clic emprunte la route de l'écran (`POST /analysis/start`, permission
   * `analysis:run`) : aucun intent du routeur ne lance une analyse, et en
   * inventer un ferait un second chemin de débit à côté de celui que l'écran
   * utilise. Action OS SUIT le lancement (`ANALYSIS_TRACKING_DEFINITION_KEY`,
   * `adoptAnalysisLaunches`) au lieu de le déclencher.
   */
  it('D1 — la carte d’analyse n’est pas dispatchée par le routeur : rien à persister ici', () => {
    const sample = SAMPLES.find(s => s.action === 'start_account_analysis') as PendingChatAction
    expect(buildCard(sample)).toBeNull()
    expect(cardDefinitionForKey('card_start_account_analysis')).toBeNull()
  })

  /**
   * #1995 — LA CRÉATION D'UNE FICHE DEPUIS UNE LIGNE CRM NE PASSE PAS PAR LE
   * ROUTEUR, pour la MÊME raison que la carte d'analyse : le clic emprunte la
   * route de l'écran (`POST /accounts/:id/contacts/from-crm`, permission
   * `records:write`). Lui inventer un intent ferait un SECOND chemin
   * d'écriture sur le même geste.
   */
  it('#1995 — la carte « créer la fiche » n’est pas dispatchée par le routeur', () => {
    const sample = SAMPLES.find(s => s.action === 'create_contact_from_crm') as PendingChatAction
    expect(buildCard(sample)).toBeNull()
    expect(cardDefinitionForKey('card_create_contact_from_crm')).toBeNull()
  })

  /**
   * Épopée #2853 (#2157.1) — LA CARTE « CRÉER UNE CIBLE » NE PASSE PAS PAR LE
   * ROUTEUR, même raison que #1995 juste au-dessus : le clic emprunte la route
   * de l'écran (`POST /target-lists` puis `.../items`, permission
   * `records:write`). Lui inventer un intent ferait un SECOND chemin
   * d'écriture sur le même geste.
   */
  it('épopée #2853 — la carte « créer une cible » n’est pas dispatchée par le routeur', () => {
    const sample = SAMPLES.find(s => s.action === 'create_target_list_from_account') as PendingChatAction
    expect(buildCard(sample)).toBeNull()
    expect(cardDefinitionForKey('card_create_target_list_from_account')).toBeNull()
  })

  /**
   * Épopée #2781 (#2150.30, LOT j1 26/09) — LA CARTE « AJOUTER AU
   * PORTEFEUILLE » NE PASSE PAS PAR LE ROUTEUR, même raison que #2853
   * juste au-dessus : le clic emprunte la route déjà là
   * (`POST /accounts/portfolio`, #2150.32/#2150.42, permission
   * `records:write`). Lui inventer un intent ferait un SECOND chemin
   * d'écriture sur le même geste.
   */
  it('épopée #2781 — la carte « ajouter au portefeuille » n’est pas dispatchée par le routeur', () => {
    const sample = SAMPLES.find(s => s.action === 'add_account_to_portfolio') as PendingChatAction
    expect(buildCard(sample)).toBeNull()
    expect(cardDefinitionForKey('card_add_account_to_portfolio')).toBeNull()
  })

  it('I1 — le coût vient de la GRILLE ; le `cost_credits` écrit par le modèle n’est jamais lu', () => {
    const enrich = buildCard(SAMPLES[0] as PendingChatAction)
    expect(enrich?.preview?.costCredits).toBe(creditCostOf('contact_enrichment'))
    expect(enrich?.definition.steps[0]?.estimatedCredits).toBe(creditCostOf('contact_enrichment'))
    expect(enrich?.preview?.costCredits).not.toBe(99)
  })

  it('D4 — un enrichissement depuis une carte part EN FILE, jamais en synchrone', () => {
    expect(buildCard(SAMPLES[0] as PendingChatAction)?.intents?.[CARD_STEP_KEY]).toMatchObject({ mode: 'queued' })
  })

  it('une proposition mal formée donne une carte SUGGÉRÉE (ni intent ni prévisualisation), jamais un intent deviné', () => {
    const card = buildCard({ action: 'schedule_reminder', contact_id: UUID, at: 'demain matin' })
    expect(card?.intents).toBeNull()
    expect(card?.preview).toBeNull()
  })

  it('aucune prévisualisation ne NOMME un éditeur — la capacité seulement (« votre CRM »)', () => {
    const vendors = /hubspot|salesforce|pipedrive|attio|gmail|outlook|google|microsoft|apollo|dropcontact/i
    const previews = SAMPLES.map(sample => buildCard(sample)?.preview).filter(Boolean)
    expect(previews.length).toBeGreaterThanOrEqual(8) // la garde lit quelque chose
    for (const preview of previews) expect(JSON.stringify(preview)).not.toMatch(vendors)
    // …et sait dire non : le mot interdit est bien présent dans la PROPOSITION d'origine.
    expect(JSON.stringify(SAMPLES[2])).toMatch(vendors)
  })

  it('le brouillon de messagerie promet ce qu’il tient : « aucun message n’est envoyé »', () => {
    expect(buildCard(SAMPLES[5] as PendingChatAction)?.preview?.whatWillNotHappen).toMatch(/aucun message/i)
  })

  it('G.2 — le brouillon de messagerie : « Objet » porte l’OBJET du mail, le destinataire va en destination', () => {
    const preview = buildCard(SAMPLES[5] as PendingChatAction)?.preview
    expect(preview?.targetObject).toBe('Suite')
    expect(preview?.targetObject).not.toContain('@')
    expect(preview?.destination).toBe('claire@acme.example')
  })

  it('G.1 — « crée un événement demain 23 h » : une carte à valider, qui part par l’intent d’agenda existant', () => {
    const card = buildCard({
      action: 'prepare_calendar_event',
      title: 'Point SNCF',
      starts_at: '2026-10-20T23:00:00+02:00',
      duration_minutes: 45,
      attendees: ['claire@acme.example'],
    })
    expect(card?.definition.steps[0]?.intentType).toBe('create_calendar_event')
    expect(card?.intents?.[CARD_STEP_KEY]).toMatchObject({
      type: 'create_calendar_event',
      title: 'Point SNCF',
      startsAt: '2026-10-20T21:00:00.000Z',
      durationMinutes: 45,
      attendees: ['claire@acme.example'],
    })
    expect(card?.preview).toMatchObject({ targetObject: 'Point SNCF', destination: 'votre agenda' })
    // Sait dire NON : sans invité, la carte dit qu'aucune invitation ne part.
    const solo = buildCard({ action: 'prepare_calendar_event', title: 'Bloc focus', starts_at: '2026-10-20T10:00:00Z' })
    expect(solo?.preview?.whatWillNotHappen).toMatch(/aucune invitation/i)
    expect(solo?.intents?.[CARD_STEP_KEY]).toMatchObject({ attendees: [] })
  })

  it('#1930.14 — l’export CRM montre les champs qui changent, avant/après', () => {
    const card = buildCard(SAMPLES[2] as PendingChatAction)
    // Le "avant" n'est jamais LU (`previewOf` reste pure, aucun appel CRM) :
    // chaque ligne le dit explicitement plutôt que d'inventer un blanc, qui se
    // lirait comme « le champ est vide côté CRM » — deux affirmations
    // différentes (GA-18/19).
    expect(card?.preview?.content).toContain('E-mail : non vérifié → claire@acme.example')
    expect(card?.preview?.content).toContain('Fonction : non vérifié → CTO')
    expect(card?.preview?.content).toContain('Entreprise : non vérifié → ACME')
    // Aucun LinkedIn dans la proposition d'origine : pas de ligne inventée pour lui.
    expect(card?.preview?.content).not.toContain('LinkedIn')
  })

  it('#1930.14 — sans champ à comparer au-delà du nom, aucun diff inventé', () => {
    // SAMPLES[3] : même export, mais seul `contact_name` est connu.
    const card = buildCard(SAMPLES[3] as PendingChatAction)
    expect(card?.preview?.content).toBeNull()
  })

  /**
   * #3076 (épopée #2858) — LA CARTE D'OPPORTUNITÉ EST DÉSORMAIS GOUVERNÉE : elle
   * PERSISTE (un `intentType`, une définition), montre son diff figé
   * « avant → après », et son `capability` reste ABSENT du catalogue de badges
   * (#2858) plutôt que d'en inventer un — Bellum n'est pas un connecteur externe.
   */
  it('#3076 — la carte d’opportunité EST gouvernée : un intent, une définition, un diff figé', () => {
    const sample = SAMPLES.find(s => s.action === 'propose_opportunity_update') as PendingChatAction
    const card = buildCard(sample)
    expect(card).not.toBeNull()
    expect(card?.intents?.[CARD_STEP_KEY]).toMatchObject({
      type: 'update_opportunity',
      projectId: UUID,
      changes: [{ field: 'stage', next: 'confirmed' }],
    })
    expect(card?.preview?.content).toBe('Stade : qualified → confirmed')
    expect(card?.preview?.targetObject).toBe('Refonte data')
    expect(cardDefinitionForKey('card_propose_opportunity_update')).not.toBeNull()
  })
})

describe('cardDefinitionForKey', () => {
  it('relit la définition depuis la clé persistée', () => {
    expect(cardDefinitionForKey('card_enrich_contact')?.steps[0]?.intentType).toBe('enrich_contact')
    expect(cardDefinitionForKey('card_prepare_mail_draft')?.steps[0]?.intentType).toBe('create_mail_draft')
  })

  it('rend null pour un workflow, une carte de navigation ou le suivi d’analyse', () => {
    expect(cardDefinitionForKey('crm_hygiene')).toBeNull()
    expect(cardDefinitionForKey('card_open_screen')).toBeNull()
    expect(cardDefinitionForKey('card_account_analysis')).toBeNull()
  })
})
