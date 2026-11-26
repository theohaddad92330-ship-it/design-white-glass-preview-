import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  CARD_STATES_IN_ACTIONS_CURRENT,
  CARD_STATES_IN_ACTIONS_HISTORY,
  CARD_TYPES_OBSOLETE_ONCE_EXECUTED,
  MAX_CARDS_PER_REPLY,
  capReplyProposals,
  cardTargetKey,
  isPrimaryCardIndex,
  cardAllowedGestures,
  cardExpiresAt,
  cardPreviewSchema,
  cardResultSchema,
  cardStateOf,
  copilotCardIdempotencyKey,
  copilotCardStateSchema,
  copilotCardViewSchema,
  PENDING_CHAT_ACTION_TYPES,
  pendingChatActionSchema,
  type CopilotCardApproval,
  type CopilotCardRun,
} from './copilot-card.js'
import { FEEDBACK_MESSAGE_MAX } from './beta-feedback-limits.js'
import { APPROVAL_TTL_MS, type WorkflowRunStatus } from './action-os.js'
import {
  createMailDraftIntentSchema,
  generateMessageIntentSchema,
  pinMemoryFactIntentSchema,
  scheduleReminderIntentSchema,
} from './action-router.js'

const UUID = '11111111-1111-1111-1111-111111111111'
const NOW = new Date('2026-09-12T10:00:00.000Z')

// Same repo-root resolution as `apps/web/src/architecture/chat-actions-cross-language.test.ts`
// — four levels up from `packages/contracts/src/schemas`.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const CHAT_TOOLS = join(REPO_ROOT, 'apps', 'ia', 'app', 'services', 'chat_tools.py')

/** The `"action": "…"` literals the IA service emits — same extraction as the web guard. */
function emittedActions(python: string): string[] {
  // `matchAll`, never a reused `RegExp.test()` — the `g` flag is STATEFUL
  // (`gardes-index.md`'s own lesson, already paid once in this repo).
  return [...new Set([...python.matchAll(/"action":\s*"([a-z_]+)"/g)].map(m => m[1] as string))].sort()
}

function bareCardPreview() {
  return cardPreviewSchema.parse({
    whatWillHappen: 'Créer un brouillon Gmail pour Julie Martin.',
    targetObject: 'Julie Martin',
    destination: 'julie@example.com',
    content: 'Bonjour Julie,',
    dataUsed: 'Dernier échange (12/09)',
    costCredits: 0,
    connectionUsed: 'votre messagerie',
    whatWillNotHappen: 'Aucun envoi automatique.',
  })
}

describe('pendingChatActionSchema — parity with apps/ia/app/services/chat_tools.py', () => {
  const python = readFileSync(CHAT_TOOLS, 'utf8')

  it('LIT quelque chose — le corpus python n’est pas vide, et les deux listes ont trente-six éléments (G.1 `prepare_calendar_event`, 19/10 + #3894.3 `prepare_message_audience`, lot RAE2 10/10 + #2434.56 `propose_bulk_enrichment` + #3345.2 `decide_qualification_lead` + #2770.55-.62 `propose_weekly_plan` + #2391 `propose_focus_plan` + #2324.39 `propose_opportunity_update` + #2376 `prepare_cold_call` + épopée #2853 `create_target_list_from_account` + épopée #2781 `add_account_to_portfolio` + épopée #2872 `push_profile` + épopée #2967 `propose_need_transition` + #2987.56 `decide_expense_report` + épopée #2955 `propose_crm_note` + épopée #2844 `propose_long_job`, LOT écrivain 28/09-30/09 + #3871.1 `propose_contact_departure`, lot V11 07/10 + #3950.1 `launch_vivier_export`, lot G01 09/10 + #3869.a `propose_people_search`, lot M05 09/10 + #2433.7 `prepare_bug_report`, lot M10 09/10)', () => {
    // Without this witness, a moved/emptied file would make every assertion
    // below pass vacuously — exactly the defect this repo's memory already names.
    expect(python.length).toBeGreaterThan(10_000)
    expect(emittedActions(python)).toHaveLength(36)
    expect(PENDING_CHAT_ACTION_TYPES).toHaveLength(36)
  })

  it('toute action ÉMISE par chat_tools.py a un variant zod', () => {
    const emitted = emittedActions(python)
    const known = new Set(PENDING_CHAT_ACTION_TYPES)
    const orphans = emitted.filter(name => !known.has(name))
    expect(`actions émises sans schéma zod → ${orphans.join(', ')}`).toBe('actions émises sans schéma zod → ')
  })

  it('tout variant zod correspond à une action ÉMISE — le contrat ne connaît rien que Laura ne propose', () => {
    const emitted = new Set(emittedActions(python))
    const invented = PENDING_CHAT_ACTION_TYPES.filter(name => !emitted.has(name))
    expect(`variants zod sans émission côté IA → ${invented.join(', ')}`).toBe('variants zod sans émission côté IA → ')
  })

  it('#1995 — la fiche créée depuis le CRM se parse SANS contact_id, et le refuse sans nom', () => {
    const parsed = pendingChatActionSchema.parse({
      action: 'create_contact_from_crm',
      account_id: UUID,
      company: 'THALES',
      full_name: 'Sandrine Pata',
    })
    expect(parsed.action).toBe('create_contact_from_crm')
    // Sait dire NON : un nom vide ne désigne personne, la carte ne se monte pas.
    expect(
      pendingChatActionSchema.safeParse({ action: 'create_contact_from_crm', account_id: UUID, company: 'THALES' })
        .success,
    ).toBe(false)
  })

  it('#1995 bis — la carte de création porte le rappel à poser une fois la fiche là, ou rien', () => {
    const withReminder = pendingChatActionSchema.parse({
      action: 'create_contact_from_crm',
      account_id: UUID,
      company: 'THALES',
      full_name: 'Sandrine Pata',
      pending_reminder_at: '2026-09-18T07:30:00Z',
      pending_reminder_note: 'Relancer après la présentation',
    })
    expect(withReminder.action).toBe('create_contact_from_crm')
    if (withReminder.action !== 'create_contact_from_crm') throw new Error('unreachable')
    expect(withReminder.pending_reminder_at).toBe('2026-09-18T07:30:00Z')
    expect(withReminder.pending_reminder_note).toBe('Relancer après la présentation')

    // Aucune demande de rappel dans le message d'origine : la carte reste valide sans lui.
    const withoutReminder = pendingChatActionSchema.parse({
      action: 'create_contact_from_crm',
      account_id: UUID,
      company: 'THALES',
      full_name: 'Sandrine Pata',
    })
    if (withoutReminder.action !== 'create_contact_from_crm') throw new Error('unreachable')
    expect(withoutReminder.pending_reminder_at ?? null).toBeNull()
  })

  it('#2433.7 — le signalement préparé depuis une capture se parse, et le refuse sans constat ni au-delà du plafond', () => {
    const parsed = pendingChatActionSchema.parse({
      action: 'prepare_bug_report',
      message: 'L’écran Comptes affiche « Erreur 500 » après le clic sur « Analyser ».',
      route: '/accounts',
      cost_credits: 0,
    })
    expect(parsed.action).toBe('prepare_bug_report')
    // Sait dire NON : un signalement vide ne dit rien à l'équipe.
    expect(pendingChatActionSchema.safeParse({ action: 'prepare_bug_report', message: '' }).success).toBe(false)
    // …et le même plafond que le formulaire (`FEEDBACK_MESSAGE_MAX`) : la carte ne promet pas un envoi que `POST /feedback` refuserait.
    expect(
      pendingChatActionSchema.safeParse({ action: 'prepare_bug_report', message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) })
        .success,
    ).toBe(false)
  })

  it('sait dire NON — un littéral inventé est REJETÉ, jamais silencieusement accepté', () => {
    expect(pendingChatActionSchema.safeParse({ action: 'burn_the_crm', cost_credits: 0 }).success).toBe(false)
    expect(PENDING_CHAT_ACTION_TYPES).not.toContain('burn_the_crm')
  })

  it('épopée #2781 (#2150.30) — « ajouter au portefeuille » se parse avec le seul nom, et refuse un nom vide', () => {
    const minimal = pendingChatActionSchema.parse({ action: 'add_account_to_portfolio', company_name: 'OGF' })
    expect(minimal.action).toBe('add_account_to_portfolio')
    if (minimal.action !== 'add_account_to_portfolio') throw new Error('unreachable')
    expect(minimal.siren ?? null).toBeNull()

    const withIdentifiers = pendingChatActionSchema.parse({
      action: 'add_account_to_portfolio',
      company_name: 'OGF',
      siren: '123456789',
      sector: 'Funéraire',
      website: 'ogf.fr',
    })
    if (withIdentifiers.action !== 'add_account_to_portfolio') throw new Error('unreachable')
    expect(withIdentifiers.siren).toBe('123456789')
    expect(withIdentifiers.sector).toBe('Funéraire')
    expect(withIdentifiers.website).toBe('ogf.fr')

    expect(pendingChatActionSchema.safeParse({ action: 'add_account_to_portfolio', company_name: '' }).success).toBe(
      false,
    )
  })

  it('accepte les treize formes réelles, avec leurs champs requis minimaux', () => {
    expect(
      pendingChatActionSchema.parse({ action: 'prepare_message', contact_id: UUID, channel: 'email' }).action,
    ).toBe('prepare_message')
    expect(
      pendingChatActionSchema.parse({ action: 'schedule_reminder', contact_id: UUID, at: '2026-09-13T09:00:00Z' })
        .action,
    ).toBe('schedule_reminder')
    expect(
      pendingChatActionSchema.parse({
        action: 'enrich_contact',
        contact_id: UUID,
        contact_name: 'Julie Martin',
        organization_name: 'ACME',
      }).action,
    ).toBe('enrich_contact')
    expect(
      pendingChatActionSchema.parse({ action: 'export_contact_to_crm', contact_id: UUID, provider: 'attio' }).action,
    ).toBe('export_contact_to_crm')
    expect(
      pendingChatActionSchema.parse({
        action: 'prepare_mail_draft',
        to: 'julie@example.com',
        subject: 'Suite à notre échange',
        body: 'Bonjour Julie,',
      }).action,
    ).toBe('prepare_mail_draft')
    expect(pendingChatActionSchema.parse({ action: 'find_accounts', cost_credits: 0 }).action).toBe('find_accounts')
    // #2454.4/.5/.9 — le mode de contexte RÉSOLU du tour voyage sur la
    // proposition, jusqu'au clic qui pose `?context=` sur le lien Découvrir
    // (`discoverSearch`, apps/web). Absent : la clé reste absente (jamais
    // devinée, comportement byte-identique aux appelants d'avant ce lot).
    expect(
      pendingChatActionSchema.parse({ action: 'find_accounts', cost_credits: 0, context_mode: 'neutral' }),
    ).toMatchObject({ context_mode: 'neutral' })
    expect(pendingChatActionSchema.parse({ action: 'find_accounts', cost_credits: 0 })).not.toHaveProperty(
      'context_mode',
    )
    // #3392 (reste, recette prod 30/09) — le code région (INSEE, ex. « 84 »
    // pour Auvergne-Rhône-Alpes) entre au contrat : sans champ, `discoverSearch`
    // (apps/web) n'avait rien à lire pour composer l'URL de Découvrir.
    expect(pendingChatActionSchema.parse({ action: 'find_accounts', cost_credits: 0, region: ['84'] })).toMatchObject({
      region: ['84'],
    })
    expect(pendingChatActionSchema.parse({ action: 'find_accounts', cost_credits: 0 })).not.toHaveProperty('region')
    expect(
      pendingChatActionSchema.parse({ action: 'open_screen', route: '/discover', label: 'Découvrir' }).action,
    ).toBe('open_screen')
    expect(
      pendingChatActionSchema.parse({
        action: 'prepare_consultant_record',
        route: '/talents/new',
        full_name: 'Marc Dupont',
      }).action,
    ).toBe('prepare_consultant_record')
    expect(
      pendingChatActionSchema.parse({ action: 'toggle_routine', key: 'morning_brief', enabled: true }).action,
    ).toBe('toggle_routine')
    expect(
      pendingChatActionSchema.parse({ action: 'update_setting', screen: 'pipeline', field: 'sla', new_value: 5 })
        .action,
    ).toBe('update_setting')
    expect(pendingChatActionSchema.parse({ action: 'pin_memory_fact', fact: 'Facture à 45 jours' }).action).toBe(
      'pin_memory_fact',
    )
    // D1 — décision Louis 14/09/2026 : proposer une analyse est une CARTE.
    // Le minimum est l'entreprise et le jeton de préparation : sans lui, rien
    // n'a été préparé, donc il n'y a rien à lancer.
    expect(
      pendingChatActionSchema.parse({ action: 'start_account_analysis', company: 'THALES', plan_token: 'tok' }).action,
    ).toBe('start_account_analysis')
    // #1935 — la charge RÉELLE de `chat_tools.py::prepare_campaign` (l'objectif
    // et l'audience sont requis, tout le reste est optionnel côté Python : le
    // persona, la relation et le ton ne sont posés que s'ils ont été dits).
    const campaign = pendingChatActionSchema.parse({
      action: 'prepare_campaign',
      objective: 'Reprendre contact après le salon',
      output_kind: 'sequence_campaign',
      mode: 'audience',
      channels: ['email'],
      contacts: [{ contact_id: UUID, full_name: 'Julie Martin', has_email: true, has_phone: false }],
      excluded: [{ contact_id: UUID, full_name: 'Marc Dupont', reason: 'Aucune adresse connue' }],
      cost_credits: 0,
    })
    expect(campaign.action).toBe('prepare_campaign')
    // L'audience écartée reste NOMMÉE avec sa raison — un contact retiré en
    // silence se relit comme un oubli.
    expect(campaign).toMatchObject({ excluded: [{ reason: 'Aucune adresse connue' }] })
  })

  it('#2367.16 — les 6 dimensions encore anonymes du contrat d’intention survivent au contrat partagé', () => {
    // nombre / urgence / niveau d'autonomie / résultat attendu / durée / besoin
    // de connecteur : posées par `chat_tools.py::prepare_campaign` UNIQUEMENT
    // quand la personne les a dites — le contrat web ne doit pas les jeter en
    // silence à la frontière NestJS → web (zod strip par défaut les clés
    // inconnues d'un schéma).
    const campaign = pendingChatActionSchema.parse({
      action: 'prepare_campaign',
      objective: 'Reprendre contact après le salon',
      contacts: [{ contact_id: UUID, full_name: 'Julie Martin', has_email: true, has_phone: false }],
      expected_count: 50,
      urgency: 'cette semaine',
      autonomy_level: 'valide chaque étape',
      expected_outcome: 'obtenir un rendez-vous',
      duration: 'deux semaines',
      needs_connector: true,
    })
    expect(campaign).toMatchObject({
      expected_count: 50,
      urgency: 'cette semaine',
      autonomy_level: 'valide chaque étape',
      expected_outcome: 'obtenir un rendez-vous',
      duration: 'deux semaines',
      needs_connector: true,
    })
    // Absentes → absentes, jamais une valeur devinée (même contrat que `relation`).
    const bare = pendingChatActionSchema.parse({
      action: 'prepare_campaign',
      objective: 'Reprendre contact',
      contacts: [],
    })
    expect(bare).not.toHaveProperty('expected_count')
    expect(bare).not.toHaveProperty('needs_connector')
  })

  it('dit NON — une campagne sans objectif, ou sans audience, n’est pas une proposition', () => {
    // Témoin que la garde sait refuser : sans objectif il n'y a rien à préparer,
    // et sans le tableau `contacts` l'écran Séquences n'a personne à pré-remplir.
    expect(() => pendingChatActionSchema.parse({ action: 'prepare_campaign', contacts: [] })).toThrow()
    expect(() =>
      pendingChatActionSchema.parse({ action: 'prepare_campaign', objective: 'Reprendre contact' }),
    ).toThrow()
    // …et le cas légitime voisin passe : une audience VIDE après filtrage reste
    // une charge valide, c'est `excluded` qui dit pourquoi.
    expect(
      pendingChatActionSchema.parse({ action: 'prepare_campaign', objective: 'Reprendre contact', contacts: [] })
        .action,
    ).toBe('prepare_campaign')
  })

  it('D1 — un coût ABSENT reste absent : le contrat ne le remplace jamais par 0', () => {
    // Doctrine GA-18/GA-19 : « non mesuré » n'est pas « mesuré à zéro ». Si ce
    // schéma posait `.default(0)`, l'écran annoncerait la gratuité juste avant
    // un débit de huit crédits.
    const parsed = pendingChatActionSchema.parse({
      action: 'start_account_analysis',
      company: 'THALES',
      plan_token: 'tok',
    })
    expect(parsed).not.toHaveProperty('cost_credits')
    expect(parsed).not.toHaveProperty('credits_left_after')
    expect(parsed).not.toHaveProperty('objects_count')
  })

  it('#1957.3 — le nombre de sources/objets visés est ACCEPTÉ, et jamais zéro', () => {
    // Le pont n'émet cette clé QUE mesurée et positive (`_analysis_card`,
    // chat_tools.py) — le schéma le tient à la source : « non mesuré » n'est
    // jamais « mesuré à zéro » (GA-18/GA-19), donc 0 est un rejet, pas une valeur.
    const withCount = pendingChatActionSchema.parse({
      action: 'start_account_analysis',
      company: 'THALES',
      plan_token: 'tok',
      objects_count: 12,
    })
    expect(withCount).toMatchObject({ objects_count: 12 })
    expect(() =>
      pendingChatActionSchema.parse({
        action: 'start_account_analysis',
        company: 'THALES',
        plan_token: 'tok',
        objects_count: 0,
      }),
    ).toThrow()
  })

  it('n’attrape pas ce qu’elle ne vise pas — un champ optionnel absent reste valide', () => {
    // Témoin du cas légitime voisin : `contact_name` etc. sont optionnels et
    // NULLABLE dans `PendingActions.tsx` — une garde qui les exigerait romprait
    // des cartes réelles où le modèle ne les a pas remplis.
    const parsed = pendingChatActionSchema.parse({ action: 'prepare_message', contact_id: UUID, channel: 'phone' })
    expect(parsed).toMatchObject({ action: 'prepare_message', channel: 'phone' })
  })
})

/**
 * #1958.18 — RDV INTERNATIONAL : le fuseau retenu par l'escalier
 * (`resolve_applicable_timezone`, personne → rendez-vous → espace → défaut,
 * `apps/ia/app/prompts/current_time.py`) et celui, propre au CONTACT, qui a pu
 * y contribuer, sont déjà calculés et renvoyés par `schedule_reminder_for_contact`
 * (`chat_tools.py:3699-3716`, `timezone` / `contact_timezone`) — mesuré 17/09 :
 * ce schéma les ignorait, donc un rappel Paris → Montréal perdait cette
 * transparence en silence AVANT d'atteindre l'écran, alors que
 * `pendingChatActionSchema` est justement l'étage qui décide ce qui survit.
 */
describe('scheduleReminderActionSchema — le fuseau du rappel survit au schéma (#1958.18)', () => {
  it('accepte et conserve `timezone` et `contact_timezone` quand ils sont connus', () => {
    const parsed = pendingChatActionSchema.parse({
      action: 'schedule_reminder',
      contact_id: UUID,
      at: '2026-09-14T09:00:00+02:00',
      timezone: 'Europe/Paris',
      contact_timezone: 'America/Montreal',
    })
    expect(parsed).toMatchObject({ timezone: 'Europe/Paris', contact_timezone: 'America/Montreal' })
  })

  it('n’attrape pas le cas voisin — absents ou `null` (rien de réglé nulle part), le rappel reste valide', () => {
    expect(
      pendingChatActionSchema.safeParse({ action: 'schedule_reminder', contact_id: UUID, at: '2026-09-14T09:00:00Z' })
        .success,
    ).toBe(true)
    expect(
      pendingChatActionSchema.safeParse({
        action: 'schedule_reminder',
        contact_id: UUID,
        at: '2026-09-14T09:00:00Z',
        timezone: null,
        contact_timezone: null,
      }).success,
    ).toBe(true)
  })
})

/**
 * #2423.9 — LAURA PROPOSE UN AVENANT, LE CONTRAT MIROIRE DE
 * `chat_tools.py::propose_mission_amendment` (~l.6551).
 *
 * `event_type`/`pause_cause` sont importés de `mission-amendment.ts`
 * (`MISSION_AMENDMENT_EVENT_TYPES`/`MISSION_PAUSE_CAUSES`), jamais recopiés —
 * une troisième copie du même vocabulaire diverge au premier type ajouté.
 */
describe('proposeMissionAmendmentActionSchema — mirrors chat_tools.py::propose_mission_amendment (#2423.9)', () => {
  it('accepte le minimum : mission, type d’événement, date d’effet, preuve', () => {
    const parsed = pendingChatActionSchema.parse({
      action: 'propose_mission_amendment',
      mission_id: UUID,
      event_type: 'daily_rate_change',
      effective_from: '2026-10-01',
      proof: 'Email du 20/09, confirmation du client',
    })
    expect(parsed.action).toBe('propose_mission_amendment')
  })

  it('porte le DIFF quand il est connu, et rien du tout quand il ne l’est pas — jamais un terme inventé', () => {
    const withTerms = pendingChatActionSchema.parse({
      action: 'propose_mission_amendment',
      mission_id: UUID,
      event_type: 'daily_rate_change',
      effective_from: '2026-10-01',
      proof: 'Avenant signé',
      previous_term: { daily_rate: 550 },
      new_term: { daily_rate: 600 },
    })
    expect(withTerms).toMatchObject({ previous_term: { daily_rate: 550 }, new_term: { daily_rate: 600 } })

    const bare = pendingChatActionSchema.parse({
      action: 'propose_mission_amendment',
      mission_id: UUID,
      event_type: 'work_site_change',
      effective_from: '2026-10-01',
      proof: 'Ticket client #4821',
    })
    expect(bare).not.toHaveProperty('previous_term')
    expect(bare).not.toHaveProperty('new_term')
  })

  it('#2423.7 — la cause de pause survit au contrat, réutilisée sans copie de `mission-amendment.ts`', () => {
    const parsed = pendingChatActionSchema.parse({
      action: 'propose_mission_amendment',
      mission_id: UUID,
      event_type: 'pause_start',
      effective_from: '2026-10-01',
      proof: 'Arrêt maladie confirmé',
      pause_cause: 'consultant_absence',
    })
    expect(parsed).toMatchObject({ pause_cause: 'consultant_absence' })
    // Sait dire NON — une cause qui n'existe pas dans `MISSION_PAUSE_CAUSES`.
    expect(() =>
      pendingChatActionSchema.parse({
        action: 'propose_mission_amendment',
        mission_id: UUID,
        event_type: 'pause_start',
        effective_from: '2026-10-01',
        proof: 'Arrêt maladie confirmé',
        pause_cause: 'burnout',
      }),
    ).toThrow()
  })

  it('sait dire NON — sans preuve, sans date d’effet, ou sur un type d’événement inventé', () => {
    expect(() =>
      pendingChatActionSchema.parse({
        action: 'propose_mission_amendment',
        mission_id: UUID,
        event_type: 'daily_rate_change',
        effective_from: '2026-10-01',
      }),
    ).toThrow()
    expect(() =>
      pendingChatActionSchema.parse({
        action: 'propose_mission_amendment',
        mission_id: UUID,
        event_type: 'daily_rate_change',
        proof: 'Email',
      }),
    ).toThrow()
    expect(() =>
      pendingChatActionSchema.parse({
        action: 'propose_mission_amendment',
        mission_id: UUID,
        event_type: 'invented_event',
        effective_from: '2026-10-01',
        proof: 'Email',
      }),
    ).toThrow()
  })
})

/**
 * #2376 — LE BRIEF D'APPEL, LE CONTRAT MIROIR de
 * `chat_tools.py::prepare_cold_call`. Identité/entreprise/fonction sont lues
 * sur la fiche (jamais inventées) ; le reste est la préparation de Laura.
 */
describe('prepareColdCallActionSchema — mirrors chat_tools.py::prepare_cold_call (#2376)', () => {
  const minimal = {
    action: 'prepare_cold_call' as const,
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
  }

  it('accepte le minimum, avec exactement les deux questions suivantes', () => {
    const parsed = pendingChatActionSchema.parse(minimal)
    expect(parsed.action).toBe('prepare_cold_call')
    expect(parsed).toMatchObject({ contact_name: 'Claire Dubois', organization_name: 'ACME Digital' })
  })

  it('un contact sans fonction connue ou sans contexte ne fait AUCUNE ligne inventée — `null`, jamais un texte de comblement', () => {
    const parsed = pendingChatActionSchema.parse({ ...minimal, contact_title: null, context: null })
    expect(parsed.contact_title).toBeNull()
    expect(parsed.context).toBeNull()
  })

  it('sait dire NON — sans identité, sans entreprise, ou sans préparation (raison/objectif/ouverture/objection/repli/résultat)', () => {
    for (const field of [
      'contact_name',
      'organization_name',
      'reason',
      'objective',
      'opening_question',
      'objection',
      'fallback',
      'expected_outcome',
    ] as const) {
      const { [field]: _omitted, ...rest } = minimal
      expect(() => pendingChatActionSchema.parse(rest)).toThrow()
    }
    expect(() => pendingChatActionSchema.parse({ ...minimal, next_questions: [] })).toThrow()
  })
})

/**
 * R7 — revue de sécurité du 13/09/2026. Une proposition de Laura est une SORTIE
 * DE MODÈLE persistée telle quelle (`workflow_runs.proposal`), et « Modifier » la
 * ré-écrit depuis le navigateur. Ses champs de texte n'avaient AUCUNE borne : un
 * corps de plusieurs mégaoctets passait la validation, était stocké, et ne
 * devenait invalide qu'à la construction de l'intent.
 *
 * Chaque borne est CELLE du champ d'intent que le champ devient — lue ici sur le
 * schéma d'intent, jamais recopiée (un réglage vit à un seul endroit, GA-26).
 */
describe('pendingChatActionSchema — bornes de longueur, celles des intents (R7)', () => {
  const cap = (value: number | null): number => {
    if (value === null) throw new Error('borne absente du schéma d’intent')
    return value
  }
  const CAPS = {
    angle: cap(generateMessageIntentSchema.shape.angle.unwrap().maxLength),
    note: cap(scheduleReminderIntentSchema.shape.note.unwrap().maxLength),
    subject: cap(createMailDraftIntentSchema.shape.subject.maxLength),
    body: cap(createMailDraftIntentSchema.shape.body.maxLength),
    threadId: cap(createMailDraftIntentSchema.shape.threadId.unwrap().maxLength),
    fact: cap(pinMemoryFactIntentSchema.shape.fact.maxLength),
  }
  const MESSAGE = { action: 'prepare_message', contact_id: UUID, channel: 'email' }
  const REMINDER = { action: 'schedule_reminder', contact_id: UUID, at: '2026-09-13T09:00:00Z' }
  const DRAFT = { action: 'prepare_mail_draft', to: 'julie@example.com', subject: 'Objet', body: 'Bonjour Julie,' }
  const FACT = { action: 'pin_memory_fact', fact: 'Facture à 45 jours' }

  it('LIT quelque chose — les six bornes sont lues sur les schémas d’intent', () => {
    expect(CAPS).toEqual({ angle: 300, note: 2000, subject: 300, body: 20_000, threadId: 200, fact: 2000 })
  })

  const cases: [string, Record<string, unknown>, string, number][] = [
    ['prepare_message.angle', MESSAGE, 'angle', CAPS.angle],
    ['schedule_reminder.note', REMINDER, 'note', CAPS.note],
    ['prepare_mail_draft.subject', DRAFT, 'subject', CAPS.subject],
    ['prepare_mail_draft.body', DRAFT, 'body', CAPS.body],
    ['prepare_mail_draft.thread_id', DRAFT, 'thread_id', CAPS.threadId],
    ['pin_memory_fact.fact', FACT, 'fact', CAPS.fact],
  ]

  it.each(cases)('%s — acceptée à la borne, REJETÉE au-delà', (_name, base, field, limit) => {
    expect(pendingChatActionSchema.safeParse({ ...base, [field]: 'x'.repeat(limit) }).success).toBe(true)
    expect(pendingChatActionSchema.safeParse({ ...base, [field]: 'x'.repeat(limit + 1) }).success).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un champ facultatif absent ou `null` reste valide', () => {
    expect(pendingChatActionSchema.safeParse({ ...MESSAGE, angle: null }).success).toBe(true)
    expect(pendingChatActionSchema.safeParse(REMINDER).success).toBe(true)
    expect(pendingChatActionSchema.safeParse({ ...REMINDER, note: null }).success).toBe(true)
  })
})

describe('cardPreviewSchema — les huit lignes de #1930', () => {
  it('accepte une prévisualisation complète', () => {
    expect(bareCardPreview().whatWillNotHappen).toBe('Aucun envoi automatique.')
  })

  it('un coût NON MESURÉ est `null`, jamais 0 par défaut — et un coût réellement gratuit reste `0`', () => {
    expect(cardPreviewSchema.parse({ ...bareCardPreview(), costCredits: null }).costCredits).toBeNull()
    expect(cardPreviewSchema.parse({ ...bareCardPreview(), costCredits: 0 }).costCredits).toBe(0)
  })

  it('destination/contenu/donnée/connexion sont NULLABLES — une action interne n’en a pas', () => {
    const internal = cardPreviewSchema.parse({
      ...bareCardPreview(),
      destination: null,
      content: null,
      dataUsed: null,
      connectionUsed: null,
    })
    expect(internal.destination).toBeNull()
    expect(internal.connectionUsed).toBeNull()
  })

  it('rejette une prévisualisation sans "ce qui va être fait" ou sans "ce qui ne sera pas fait"', () => {
    expect(() => cardPreviewSchema.parse({ ...bareCardPreview(), whatWillHappen: '' })).toThrow()
    expect(() => cardPreviewSchema.parse({ ...bareCardPreview(), whatWillNotHappen: '' })).toThrow()
  })
})

describe('cardResultSchema — les champs après-action de #1931', () => {
  it('accepte un résultat complet, avec acteur/date/coût NULLABLES', () => {
    const result = cardResultSchema.parse({
      outcome: 'Le brouillon a été créé dans Gmail. Aucun message n’a été envoyé.',
      occurredAt: null,
      actorName: null,
      targetObject: 'Julie Martin',
      destination: null,
      externalRef: null,
      creditsSpent: null,
      nextStep: null,
      connectionUsed: null,
    })
    expect(result.creditsSpent).toBeNull()
  })
})

// #2105.39 — le résultat nomme l'OUTIL utilisé, comme la prévisualisation le
// fait déjà (`cardPreviewSchema.connectionUsed`) : sans ce champ, une carte
// EXÉCUTÉE ne pouvait tenir aucun outil nommé pour 5 des 7 actions à effet.
describe('cardResultSchema.connectionUsed — #2105.39', () => {
  const BASE = {
    outcome: 'La fiche a été mise à jour dans votre CRM.',
    occurredAt: '2026-09-17T10:00:00.000Z',
    actorName: null,
    targetObject: 'Julie Martin',
    destination: null,
    externalRef: null,
    creditsSpent: 0,
    nextStep: null,
  }

  it('porte le nom de la capacité injectée, jamais un fournisseur', () => {
    const result = cardResultSchema.parse({ ...BASE, connectionUsed: 'votre CRM' })
    expect(result.connectionUsed).toBe('votre CRM')
  })

  it('reste NULLABLE — une action sans outil connecté ne devient pas "aucun"', () => {
    const result = cardResultSchema.parse({ ...BASE, connectionUsed: null })
    expect(result.connectionUsed).toBeNull()
  })

  it('exige le champ — un résultat qui l’omet échoue, il ne le rend pas silencieusement absent', () => {
    const { connectionUsed: _omitted, ...withoutField } = { ...BASE, connectionUsed: null }
    expect(() => cardResultSchema.parse(withoutField)).toThrow()
  })
})

describe('cardStateOf — table exhaustive (TDD-first)', () => {
  function runAt(status: WorkflowRunStatus, preview: CopilotCardRun['preview'] = null): CopilotCardRun {
    return { status, preview }
  }

  const NO_APPROVAL: CopilotCardApproval | null = null
  const PENDING_FRESH: CopilotCardApproval = {
    state: 'pending',
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
  }
  const PENDING_PAST: CopilotCardApproval = {
    state: 'pending',
    expiresAt: new Date(NOW.getTime() - 60_000).toISOString(),
  }
  const EXPIRED_APPROVAL: CopilotCardApproval = { state: 'expired', expiresAt: new Date(NOW).toISOString() }

  const CASES: Array<{ name: string; run: CopilotCardRun; approval: CopilotCardApproval | null; expected: string }> = [
    { name: 'planned, no preview → suggested', run: runAt('planned'), approval: NO_APPROVAL, expected: 'suggested' },
    {
      name: 'planned, preview ready → prepared',
      run: runAt('planned', bareCardPreview()),
      approval: NO_APPROVAL,
      expected: 'prepared',
    },
    {
      name: 'awaiting_approval, pending & fresh → awaiting_review',
      run: runAt('awaiting_approval'),
      approval: PENDING_FRESH,
      expected: 'awaiting_review',
    },
    {
      name: 'awaiting_approval, pending but past expiresAt → expired',
      run: runAt('awaiting_approval'),
      approval: PENDING_PAST,
      expected: 'expired',
    },
    {
      name: 'awaiting_approval, approval already expired → expired',
      run: runAt('awaiting_approval'),
      approval: EXPIRED_APPROVAL,
      expected: 'expired',
    },
    { name: 'running → running', run: runAt('running'), approval: NO_APPROVAL, expected: 'running' },
    { name: 'done → executed', run: runAt('done'), approval: NO_APPROVAL, expected: 'executed' },
    { name: 'partial → partial', run: runAt('partial'), approval: NO_APPROVAL, expected: 'partial' },
    { name: 'failed → failed', run: runAt('failed'), approval: NO_APPROVAL, expected: 'failed' },
    { name: 'cancelled → rejected', run: runAt('cancelled'), approval: NO_APPROVAL, expected: 'rejected' },
    { name: 'blocked → blocked (rien n’est parti)', run: runAt('blocked'), approval: NO_APPROVAL, expected: 'blocked' },
    {
      name: 'unknown → unknown_outcome, JAMAIS failed',
      run: runAt('unknown'),
      approval: NO_APPROVAL,
      expected: 'unknown_outcome',
    },
    { name: 'snoozed → snoozed (reportée)', run: runAt('snoozed'), approval: NO_APPROVAL, expected: 'snoozed' },
    {
      name: 'superseded → superseded (obsolète)',
      run: runAt('superseded'),
      approval: NO_APPROVAL,
      expected: 'superseded',
    },
  ]

  it.each(CASES)('$name', ({ run, approval, expected }) => {
    expect(cardStateOf(run, approval, NOW)).toBe(expected)
  })

  it('couvre les treize noms — aucun n’est orphelin de test', () => {
    const covered = new Set(CASES.map(c => c.expected))
    for (const state of copilotCardStateSchema.options) {
      expect(`${state} couvert par un cas → ${covered.has(state)}`).toBe(`${state} couvert par un cas → true`)
    }
  })

  it('sait dire NON — un run `failed` n’est jamais lu comme `unknown_outcome`', () => {
    expect(cardStateOf(runAt('failed'), null, NOW)).not.toBe('unknown_outcome')
  })

  it('est PURE — même run, même approbation, même horloge ⇒ même résultat, deux fois', () => {
    const run = runAt('awaiting_approval')
    expect(cardStateOf(run, PENDING_FRESH, NOW)).toBe(cardStateOf(run, PENDING_FRESH, NOW))
  })
})

/**
 * L2 (#1931, #1943) — ce que la table reconstruite par L1 ne savait pas encore.
 *
 * L1 a posé les treize noms et une table exhaustive sur le STATUT du run. Deux
 * lignes y étaient incomplètes, faute des deux dates qu'une carte porte :
 *
 *  - `planned` ne pouvait jamais EXPIRER. Or une carte de copilote expire
 *    3 jours après sa proposition (plan lot 4, « expiration 3 j calculée ») —
 *    et une `awaiting_approval` expirait déjà, elle. Une proposition vieille
 *    d'une semaine se lisait « Préparée », et partait au premier clic.
 *  - `snoozed` restait « Reportée » POUR TOUJOURS, même la date passée. Or
 *    l'arbitrage du 12/09 dit : reporter = date choisie, et l'expiration de
 *    3 jours est RELANCÉE à partir de cette date.
 *
 * Les deux champs sont optionnels : un appelant de L1 qui ne les passe pas
 * obtient exactement la table d'avant (aucune expiration calculable sans date).
 */
describe('L2 — cardStateOf lit les DATES d’une carte, pas seulement son statut', () => {
  const DAY = 24 * 60 * 60 * 1000
  const prepared = bareCardPreview()

  it('une proposition « prepared » de moins de 3 jours reste « prepared »', () => {
    const run: CopilotCardRun = {
      status: 'planned',
      preview: prepared,
      createdAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
    }
    expect(cardStateOf(run, null, NOW)).toBe('prepared')
  })

  it('une proposition « planned » de plus de 3 jours est « expired » — jamais un clic sur un contexte périmé', () => {
    const run: CopilotCardRun = {
      status: 'planned',
      preview: prepared,
      createdAt: new Date(NOW.getTime() - APPROVAL_TTL_MS - 1).toISOString(),
    }
    expect(cardStateOf(run, null, NOW)).toBe('expired')
  })

  it('une carte reportée AVANT sa date reste « snoozed »', () => {
    const run: CopilotCardRun = {
      status: 'snoozed',
      preview: prepared,
      createdAt: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      snoozedUntil: new Date(NOW.getTime() + DAY).toISOString(),
    }
    expect(cardStateOf(run, null, NOW)).toBe('snoozed')
  })

  it('une carte reportée dont la date est PASSÉE revient « prepared » — l’expiration repart de la date du report', () => {
    // Proposée il y a 10 jours : sans relance de l'expiration, elle serait
    // expirée. Le report a eu lieu, sa date est passée depuis un jour : elle vit.
    const run: CopilotCardRun = {
      status: 'snoozed',
      preview: prepared,
      createdAt: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      snoozedUntil: new Date(NOW.getTime() - DAY).toISOString(),
    }
    expect(cardStateOf(run, null, NOW)).toBe('prepared')
  })

  it('… et « expired » quand 3 jours ont passé DEPUIS la date du report', () => {
    const run: CopilotCardRun = {
      status: 'snoozed',
      preview: prepared,
      createdAt: new Date(NOW.getTime() - 10 * DAY).toISOString(),
      snoozedUntil: new Date(NOW.getTime() - APPROVAL_TTL_MS - 1).toISOString(),
    }
    expect(cardStateOf(run, null, NOW)).toBe('expired')
  })

  it('sait dire NON — sans date fournie, rien n’expire (la table de L1 reste exacte pour ses appelants)', () => {
    expect(cardStateOf({ status: 'planned', preview: prepared }, null, NOW)).toBe('prepared')
    expect(cardStateOf({ status: 'snoozed', preview: prepared }, null, NOW)).toBe('snoozed')
  })

  it('n’attrape pas ce qu’elle ne vise pas — une carte déjà lancée n’expire jamais (elle a un résultat)', () => {
    const old = new Date(NOW.getTime() - 30 * DAY).toISOString()
    expect(cardStateOf({ status: 'done', preview: prepared, createdAt: old }, null, NOW)).toBe('executed')
    expect(cardStateOf({ status: 'running', preview: prepared, createdAt: old }, null, NOW)).toBe('running')
    expect(cardStateOf({ status: 'unknown', preview: prepared, createdAt: old }, null, NOW)).toBe('unknown_outcome')
  })
})

describe('L2 — cardExpiresAt : UNE dérivation de la date limite', () => {
  it('part de la création, ou de la date du report quand il y en a une', () => {
    const createdAt = '2026-09-10T08:00:00.000Z'
    const snoozedUntil = '2026-09-14T07:00:00.000Z'
    expect(cardExpiresAt({ createdAt })?.toISOString()).toBe(
      new Date(new Date(createdAt).getTime() + APPROVAL_TTL_MS).toISOString(),
    )
    expect(cardExpiresAt({ createdAt, snoozedUntil })?.toISOString()).toBe(
      new Date(new Date(snoozedUntil).getTime() + APPROVAL_TTL_MS).toISOString(),
    )
  })

  it('rend null quand aucune date n’est connue — jamais une échéance inventée', () => {
    expect(cardExpiresAt({})).toBeNull()
  })
})

describe('L2 — les gestes offerts par état (#1943 : réessayer sans envoyer deux fois)', () => {
  it('« Réessayer » n’existe QUE sur un échec — jamais sur un résultat inconnu', () => {
    expect(cardAllowedGestures('failed')).toContain('retry')
    expect(cardAllowedGestures('unknown_outcome')).not.toContain('retry')
    expect(cardAllowedGestures('unknown_outcome')).toEqual([])
  })

  it('une carte préparée se confirme, se refuse, se reporte, se modifie', () => {
    expect([...cardAllowedGestures('prepared')].sort()).toEqual(['confirm', 'modify', 'reject', 'snooze'])
  })

  it('une carte sans prévisualisation ne se CONFIRME pas — on ne valide pas ce qu’on n’a pas vu', () => {
    expect(cardAllowedGestures('suggested')).not.toContain('confirm')
  })

  it('une carte en attente d’un responsable s’annule par son auteur — le responsable, lui, tranche l’approbation', () => {
    expect(cardAllowedGestures('awaiting_review')).toEqual(['cancel'])
  })

  it('une carte partie, refusée, expirée ou obsolète n’offre plus rien', () => {
    for (const state of ['running', 'executed', 'rejected', 'expired', 'superseded', 'blocked'] as const) {
      expect(cardAllowedGestures(state)).toEqual([])
    }
  })

  it('couvre les treize états — un quatorzième ne compile pas sans réponse', () => {
    for (const state of copilotCardStateSchema.options) {
      expect(Array.isArray(cardAllowedGestures(state))).toBe(true)
    }
  })
})

describe('L2 — les deux lectures de l’écran Actions (arbitrage du 12/09)', () => {
  it('« en cours » : dès qu’elle est lancée ou attend un responsable', () => {
    expect(CARD_STATES_IN_ACTIONS_CURRENT).toEqual(
      expect.arrayContaining(['awaiting_review', 'running', 'executed', 'partial', 'failed', 'unknown_outcome']),
    )
  })

  it('« historique » : refusées et expirées', () => {
    expect([...CARD_STATES_IN_ACTIONS_HISTORY].sort()).toEqual(['expired', 'rejected'])
  })

  it('les simples propositions RESTENT dans la conversation — ni en cours, ni historique', () => {
    const shelved = new Set<string>([...CARD_STATES_IN_ACTIONS_CURRENT, ...CARD_STATES_IN_ACTIONS_HISTORY])
    for (const state of ['suggested', 'prepared', 'snoozed'] as const) expect(shelved.has(state)).toBe(false)
  })

  it('aucun état n’est dans les deux lectures', () => {
    const current = new Set<string>(CARD_STATES_IN_ACTIONS_CURRENT)
    for (const state of CARD_STATES_IN_ACTIONS_HISTORY) expect(current.has(state)).toBe(false)
  })
})

describe('L2 — cardResultSchema.content : ce qu’une carte a PRODUIT (un brouillon généré)', () => {
  it('reste optionnel — un résultat de L1 sans contenu est toujours valide', () => {
    const base = {
      outcome: 'Rappel posé.',
      occurredAt: NOW.toISOString(),
      actorName: null,
      targetObject: 'Julie Martin',
      destination: null,
      externalRef: null,
      creditsSpent: 0,
      nextStep: null,
      connectionUsed: null,
    }
    expect(cardResultSchema.parse(base).content).toBeUndefined()
    expect(cardResultSchema.parse({ ...base, content: 'Bonjour Julie,' }).content).toBe('Bonjour Julie,')
  })
})

// #1943.17 — « champ support si nécessaire » : un lien support n'apparaît QUE
// sur les échecs qui le justifient (aujourd'hui, un résultat inconnu — un
// timeout que la personne ne peut pas diagnostiquer seule). Optionnel comme
// `content` : chaque résultat déjà écrit ailleurs dans ce dépôt reste valide
// sans y toucher — l'absence se lit « pas suggéré », jamais un blocage.
describe('cardResultSchema.supportSuggested — #1943.17', () => {
  const BASE = {
    outcome: 'Rappel posé.',
    occurredAt: NOW.toISOString(),
    actorName: null,
    targetObject: 'Julie Martin',
    destination: null,
    externalRef: null,
    creditsSpent: 0,
    nextStep: null,
    connectionUsed: null,
  }

  it('reste optionnel — un résultat sans le champ est toujours valide et ne suggère rien', () => {
    expect(cardResultSchema.parse(BASE).supportSuggested).toBeUndefined()
  })

  it('accepte true sur un échec qui le justifie', () => {
    expect(cardResultSchema.parse({ ...BASE, supportSuggested: true }).supportSuggested).toBe(true)
  })

  it('accepte false — dit explicitement, pas seulement absent', () => {
    expect(cardResultSchema.parse({ ...BASE, supportSuggested: false }).supportSuggested).toBe(false)
  })
})

// #2366.1 / #2366.2 — le lien vers le message canonique que ce résultat a
// éventuellement créé (`outreach_messages`, source `laura`) : c'est CE lien
// qui permet à la carte de relire l'objet à jour au lieu de garder pour
// toujours le texte figé qu'elle a produit une fois — le même objet que lit
// la fiche Contact et le centre d'approbation Outreach.
describe('cardResultSchema.outreachMessageId — #2366.1 / #2366.2', () => {
  const BASE = {
    outcome: 'Brouillon généré.',
    occurredAt: NOW.toISOString(),
    actorName: null,
    targetObject: 'Julie Martin',
    destination: null,
    externalRef: null,
    creditsSpent: 0,
    nextStep: null,
    connectionUsed: null,
  }

  it('reste optionnel — un résultat déjà écrit ailleurs reste valide sans lui', () => {
    expect(cardResultSchema.parse(BASE).outreachMessageId).toBeUndefined()
  })

  it('accepte un identifiant de message canonique', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(cardResultSchema.parse({ ...BASE, outreachMessageId: id }).outreachMessageId).toBe(id)
  })

  it('refuse une valeur qui n’est pas un UUID — jamais un texte libre glissé par erreur', () => {
    expect(() => cardResultSchema.parse({ ...BASE, outreachMessageId: 'draft-1' })).toThrow()
  })
})

// #1952.32 (#2844) — « ce qui doit être vérifié », le champ que le RÉSULTAT
// d'une carte n'avait encore pour AUCUN domaine. Optionnel comme `content` :
// chaque résultat déjà écrit ailleurs dans ce dépôt reste valide sans lui.
// Une LISTE vide ne s'écrit jamais — absente, elle ne fait aucune ligne
// (doctrine : on n'affiche pas ce qu'on n'a pas).
describe('cardResultSchema.toVerify — #1952.32', () => {
  const BASE = {
    outcome: 'Analyse terminée.',
    occurredAt: NOW.toISOString(),
    actorName: null,
    targetObject: 'ACME',
    destination: null,
    externalRef: null,
    creditsSpent: 8,
    nextStep: null,
    connectionUsed: null,
  }

  it('reste optionnel — un résultat sans le champ est toujours valide', () => {
    expect(cardResultSchema.parse(BASE).toVerify).toBeUndefined()
  })

  it('accepte une liste de lignes à vérifier', () => {
    const lines = ['Camille Nguyen — e-mail trouvé, non confirmé']
    expect(cardResultSchema.parse({ ...BASE, toVerify: lines }).toVerify).toEqual(lines)
  })

  it('refuse une ligne vide — jamais une entrée sans contenu', () => {
    expect(() => cardResultSchema.parse({ ...BASE, toVerify: [''] })).toThrow()
  })

  it('borne la liste à 20 lignes — jamais une carte qui déborde', () => {
    const lines = Array.from({ length: 21 }, (_, i) => `Contact ${i}`)
    expect(() => cardResultSchema.parse({ ...BASE, toVerify: lines })).toThrow()
  })
})

describe('decideExpenseReportActionSchema (#2987.56)', () => {
  it('valide une note SANS motif — un refus l’exige, une validation ne l’a jamais', () => {
    const parsed = pendingChatActionSchema.parse({
      action: 'decide_expense_report',
      expense_report_id: UUID,
      decision: 'validate',
      reference: 'NF-2026-014',
      bearer_name: 'Julie Martin',
      account_name: 'Orange',
      period_month: '2026-09',
      reason: null,
    })
    expect(parsed.action).toBe('decide_expense_report')
    if (parsed.action !== 'decide_expense_report') throw new Error('unreachable')
    expect(parsed.decision).toBe('validate')
    expect(parsed.reason).toBeNull()
  })

  it('refuse une note avec un motif — le montant n’apparaît NULLE PART dans le schéma', () => {
    const parsed = pendingChatActionSchema.parse({
      action: 'decide_expense_report',
      expense_report_id: UUID,
      decision: 'reject',
      reference: 'NF-2026-014',
      bearer_name: 'Julie Martin',
      account_name: null,
      period_month: '2026-09',
      reason: 'Justificatif illisible',
    })
    if (parsed.action !== 'decide_expense_report') throw new Error('unreachable')
    expect(parsed.reason).toBe('Justificatif illisible')
    expect(Object.keys(decideExpenseReportActionSchemaShape())).not.toContain('amount')
  })

  it('sait dire NON — une décision inventée hors `validate`/`reject` est REJETÉE', () => {
    expect(
      pendingChatActionSchema.safeParse({
        action: 'decide_expense_report',
        expense_report_id: UUID,
        decision: 'approve',
        reference: null,
        bearer_name: null,
        account_name: null,
        period_month: null,
        reason: null,
      }).success,
    ).toBe(false)
  })
})

function decideExpenseReportActionSchemaShape() {
  const option = pendingChatActionSchema.options.find(
    candidate => candidate.shape.action.value === 'decide_expense_report',
  )
  if (!option) throw new Error('decide_expense_report variant missing')
  return option.shape
}

describe('copilotCardViewSchema — l’assemblage', () => {
  it('accepte une vue complète, résultat null tant que rien n’est parti', () => {
    const view = copilotCardViewSchema.parse({
      id: UUID,
      action: { action: 'prepare_mail_draft', to: 'julie@example.com', subject: 'Suite', body: 'Bonjour,' },
      state: 'prepared',
      preview: bareCardPreview(),
      result: null,
      snoozedUntil: null,
    })
    expect(view.result).toBeNull()
  })
})

describe('copilotCardIdempotencyKey — un format, un seul endroit', () => {
  it('produit `card:<turnId>:<index>`', () => {
    expect(copilotCardIdempotencyKey('turn-1', 0)).toBe('card:turn-1:0')
    expect(copilotCardIdempotencyKey('turn-1', 2)).toBe('card:turn-1:2')
  })

  it('deux rangs différents du même tour donnent des clés différentes', () => {
    expect(copilotCardIdempotencyKey('turn-1', 0)).not.toBe(copilotCardIdempotencyKey('turn-1', 1))
  })
})

// ── L3 (#1924.6/.7, décision de Louis du 13/09) — 3 cartes au plus, 1 principale ──

const CHAT_ORCHESTRATOR = join(REPO_ROOT, 'apps', 'ia', 'app', 'services', 'chat_orchestrator.py')

describe('capReplyProposals — 3 cartes au plus par réponse (garde dans le CODE)', () => {
  it('au-delà de trois, les propositions sont ABANDONNÉES, dans l’ordre, et comptées', () => {
    const { kept, dropped } = capReplyProposals(['a', 'b', 'c', 'd', 'e'])
    expect(MAX_CARDS_PER_REPLY).toBe(3)
    expect(kept).toEqual(['a', 'b', 'c'])
    expect(dropped).toBe(2)
  })

  it('n’attrape pas ce qu’elle ne vise pas : trois propositions passent toutes, aucune n’est comptée', () => {
    expect(capReplyProposals(['a', 'b', 'c'])).toEqual({ kept: ['a', 'b', 'c'], dropped: 0 })
    expect(capReplyProposals([])).toEqual({ kept: [], dropped: 0 })
  })

  it('la première est la principale — et seulement elle', () => {
    expect(isPrimaryCardIndex(0)).toBe(true)
    expect(isPrimaryCardIndex(1)).toBe(false)
    expect(isPrimaryCardIndex(null)).toBe(false)
  })

  it('le service IA tient le MÊME plafond (une valeur, deux langages : la parité est lue, pas supposée)', () => {
    const python = readFileSync(CHAT_ORCHESTRATOR, 'utf8')
    // Le corpus est bien lu — sans cette ligne, un chemin cassé rendrait l'égalité inoffensive.
    expect(python).toContain('async def _run_tool_round')
    const match = python.match(/^_MAX_CARDS_PER_REPLY\s*=\s*(\d+)\s*$/m)
    expect(match?.[1]).toBe(String(MAX_CARDS_PER_REPLY))
  })
})

describe('cardTargetKey — ce que « la même cible » veut dire pour une carte (#1943, obsolète)', () => {
  const CONTACT_A = '11111111-1111-4111-8111-111111111111'
  const CONTACT_B = '22222222-2222-4222-8222-222222222222'

  it('deux enrichissements du même contact désignent la même cible, deux contacts non', () => {
    const one = cardTargetKey({
      action: 'enrich_contact',
      contact_id: CONTACT_A,
      contact_name: 'A',
      organization_name: 'X',
    })
    const same = cardTargetKey({
      action: 'enrich_contact',
      contact_id: CONTACT_A,
      contact_name: 'A.',
      organization_name: 'Y',
    })
    const other = cardTargetKey({
      action: 'enrich_contact',
      contact_id: CONTACT_B,
      contact_name: 'B',
      organization_name: 'X',
    })
    expect(one).not.toBeNull()
    expect(one).toBe(same)
    expect(one).not.toBe(other)
  })

  it('le TYPE fait partie de la cible : un rappel et un message au même contact ne se remplacent pas', () => {
    const reminder = cardTargetKey({ action: 'schedule_reminder', contact_id: CONTACT_A, at: '2026-09-14T09:00:00Z' })
    const message = cardTargetKey({ action: 'prepare_message', contact_id: CONTACT_A, channel: 'email' })
    expect(reminder).not.toBe(message)
  })

  it('un brouillon vise son destinataire sans tenir compte de la casse de l’adresse', () => {
    const lower = cardTargetKey({ action: 'prepare_mail_draft', to: 'claire@acme.example', subject: 'A', body: 'x' })
    const upper = cardTargetKey({ action: 'prepare_mail_draft', to: ' Claire@ACME.example', subject: 'B', body: 'y' })
    expect(lower).toBe(upper)
  })

  it('une carte de navigation n’a pas de cible (elle n’est jamais persistée)', () => {
    expect(cardTargetKey({ action: 'open_screen', route: '/pipeline', label: 'Pipeline' })).toBeNull()
    expect(cardTargetKey({ action: 'find_accounts' })).toBeNull()
  })

  it('épopée #2781 (#2150.30) — « ajouter au portefeuille » n’a pas de cible : le clic passe par la route de l’écran', () => {
    expect(cardTargetKey({ action: 'add_account_to_portfolio', company_name: 'OGF' })).toBeNull()
  })

  it('« déjà faite ailleurs » ne vaut que pour les effets qu’on ne refait pas : un second brouillon ou rappel reste légitime', () => {
    expect(CARD_TYPES_OBSOLETE_ONCE_EXECUTED).toEqual(
      expect.arrayContaining(['enrich_contact', 'export_contact_to_crm', 'pin_memory_fact']),
    )
    for (const legit of ['prepare_message', 'prepare_mail_draft', 'schedule_reminder']) {
      expect(CARD_TYPES_OBSOLETE_ONCE_EXECUTED).not.toContain(legit)
    }
  })
})

/**
 * #2324.39 — LA MISE À JOUR D'UNE OPPORTUNITÉ, PRÉPARÉE PAR LAURA : le diff
 * (« avant → après ») voyage FIGÉ dans la carte — l'« avant » est lu par
 * l'outil au moment de préparer (`projects/read`), jamais deviné par l'écran.
 */
describe('proposeOpportunityUpdateActionSchema (#2324.39)', () => {
  const base = {
    action: 'propose_opportunity_update',
    project_id: 'p-1',
    project_label: 'Refonte data',
    proof: 'Compte rendu du 22/09',
    cost_credits: 0,
  }

  it('accepte un diff par champ, avec un « avant » inconnu dit null — jamais 0', () => {
    const parsed = pendingChatActionSchema.parse({
      ...base,
      changes: [
        { field: 'stage', previous: 'qualified', next: 'confirmed' },
        { field: 'estimated_amount', previous: null, next: 120000 },
        { field: 'next_step', previous: null, next: 'Atelier de cadrage' },
      ],
    })
    expect(parsed.action).toBe('propose_opportunity_update')
  })

  it('refuse un diff VIDE, une étape hors vocabulaire, et une clôture (gagné/perdu se décide à l’écran)', () => {
    expect(pendingChatActionSchema.safeParse({ ...base, changes: [] }).success).toBe(false)
    expect(
      pendingChatActionSchema.safeParse({ ...base, changes: [{ field: 'stage', previous: null, next: 'signed' }] })
        .success,
    ).toBe(false)
    expect(
      pendingChatActionSchema.safeParse({
        ...base,
        changes: [{ field: 'stage', previous: 'negotiation', next: 'won' }],
      }).success,
    ).toBe(false)
  })

  // #2324.37 — le RISQUE d'une opportunité entre dans le même diff.
  it('accepte un risque proposé (#2324.37), refuse un risque vide', () => {
    expect(
      pendingChatActionSchema.safeParse({
        ...base,
        changes: [{ field: 'risk', previous: null, next: 'Budget 2027 non voté' }],
      }).success,
    ).toBe(true)
    expect(
      pendingChatActionSchema.safeParse({ ...base, changes: [{ field: 'risk', previous: null, next: '  ' }] }).success,
    ).toBe(false)
  })

  it('refuse une preuve absente : jamais une mise à jour sans source', () => {
    const { proof: _proof, ...withoutProof } = base
    expect(
      pendingChatActionSchema.safeParse({
        ...withoutProof,
        changes: [{ field: 'next_step', previous: null, next: 'Relancer' }],
      }).success,
    ).toBe(false)
  })
})

describe('decideQualificationLeadActionSchema (#3345.2)', () => {
  const base = {
    action: 'decide_qualification_lead',
    account_id: UUID,
    account_name: 'Decathlon',
    lead_key: UUID,
    lead_label: 'Refonte data',
    note: null,
  } as const

  it('valide un écartement AVEC motif', () => {
    const parsed = pendingChatActionSchema.parse({
      ...base,
      decision: 'dismissed',
      reason: 'no_real_demand',
      snoozed_until: null,
    })
    if (parsed.action !== 'decide_qualification_lead') throw new Error('unreachable')
    expect(parsed.reason).toBe('no_real_demand')
  })

  it('valide une veille AVEC échéance, sans motif', () => {
    expect(
      pendingChatActionSchema.safeParse({
        ...base,
        decision: 'snoozed',
        reason: null,
        snoozed_until: '2026-11-15',
      }).success,
    ).toBe(true)
  })

  it('sait dire NON — une décision inventée, un motif inventé (la cohérence motif/échéance est tenue par l’outil ET par l’API au clic)', () => {
    const bad = [
      { ...base, decision: 'deleted', reason: null, snoozed_until: null },
      { ...base, decision: 'dismissed', reason: 'inventé', snoozed_until: null },
      { ...base, decision: 'dismissed', reason: 'bad_timing' },
    ]
    for (const candidate of bad) expect(pendingChatActionSchema.safeParse(candidate).success).toBe(false)
  })
})

describe('proposeBulkEnrichmentActionSchema (#2434.56)', () => {
  const contact = (n: number) => ({
    contact_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    contact_name: `Contact ${n}`,
    organization_name: 'Decathlon',
  })

  it('valide un lot de 1 à 10 contacts relus, avec son coût total', () => {
    const parsed = pendingChatActionSchema.parse({
      action: 'propose_bulk_enrichment',
      contacts: [contact(1), contact(2)],
      cost_credits: 2,
      credit_kind: 'enrichment',
    })
    if (parsed.action !== 'propose_bulk_enrichment') throw new Error('unreachable')
    expect(parsed.contacts).toHaveLength(2)
  })

  it('refuse un lot vide ou de plus de dix contacts — une dépense qu’on ne peut pas relire', () => {
    const base = { action: 'propose_bulk_enrichment' } as const
    expect(pendingChatActionSchema.safeParse({ ...base, contacts: [] }).success).toBe(false)
    const eleven = Array.from({ length: 11 }, (_, i) => contact(i + 1))
    expect(pendingChatActionSchema.safeParse({ ...base, contacts: eleven }).success).toBe(false)
  })

  it('la clé de cible ne dépend pas de l’ordre des contacts', () => {
    const a = pendingChatActionSchema.parse({ action: 'propose_bulk_enrichment', contacts: [contact(1), contact(2)] })
    const b = pendingChatActionSchema.parse({ action: 'propose_bulk_enrichment', contacts: [contact(2), contact(1)] })
    expect(cardTargetKey(a)).toBe(cardTargetKey(b))
  })
})

describe('prepareMessageAudienceActionSchema (#3894.3)', () => {
  const recipient = (n: number) => ({
    contact_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    contact_name: `Contact ${n}`,
    contact_title: null,
    account_id: null,
  })
  const base = { action: 'prepare_message_audience', channel: 'email', explicit_multi_contact: true } as const

  it('valide 2 destinataires nommés, sur demande explicite attestée', () => {
    const parsed = pendingChatActionSchema.parse({ ...base, recipients: [recipient(1), recipient(2)] })
    if (parsed.action !== 'prepare_message_audience') throw new Error('unreachable')
    expect(parsed.recipients).toHaveLength(2)
  })

  it('dit NON à un seul destinataire, à l’attestation absente et aux doublons — jamais une audience devinée', () => {
    expect(pendingChatActionSchema.safeParse({ ...base, recipients: [recipient(1)] }).success).toBe(false)
    expect(
      pendingChatActionSchema.safeParse({
        action: 'prepare_message_audience',
        channel: 'email',
        recipients: [recipient(1), recipient(2)],
      }).success,
    ).toBe(false)
    expect(pendingChatActionSchema.safeParse({ ...base, recipients: [recipient(1), recipient(1)] }).success).toBe(false)
  })

  it('la clé de cible ne dépend pas de l’ordre des destinataires', () => {
    const a = pendingChatActionSchema.parse({ ...base, recipients: [recipient(1), recipient(2)] })
    const b = pendingChatActionSchema.parse({ ...base, recipients: [recipient(2), recipient(1)] })
    expect(cardTargetKey(a)).toBe(cardTargetKey(b))
  })
})

// LOT (15/10) DATA-B.5 — « e-mail seul » / « téléphone seul » voyage dans la carte, jamais une autre valeur.
describe('enrich_contact — only', () => {
  const base = { action: 'enrich_contact', contact_id: 'c1', contact_name: 'Claire Dubois', organization_name: 'ACME' }
  it('accepte email et phone, refuse le reste', async () => {
    const { pendingChatActionSchema } = await import('./copilot-card')
    expect(pendingChatActionSchema.safeParse({ ...base, only: 'phone' }).success).toBe(true)
    expect(pendingChatActionSchema.safeParse({ ...base, only: 'email' }).success).toBe(true)
    expect(pendingChatActionSchema.safeParse(base).success).toBe(true)
    expect(pendingChatActionSchema.safeParse({ ...base, only: 'linkedin' }).success).toBe(false)
  })
})
