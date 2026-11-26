import { describe, expect, it } from 'vitest'
import {
  PERSISTED_CHAT_CONTEXT_MAX_BYTES,
  persistedChatContext,
  type PersistedChatContext,
} from './chat-message-context.js'

/**
 * #1914.14 — CE QU'ON GARDE D'UN TOUR, ET CE QU'ON NE GARDE PAS.
 *
 * Le panneau de transparence d'une réponse (« d'où vient ce que je te dis »)
 * disparaissait au rechargement : `Chat.tsx` le disait en toutes lettres à deux
 * endroits, « le `context` n'est PAS persisté ». Ce fichier tient la LISTE
 * BLANCHE de ce qui est conservé — et surtout les trois champs qui n'y entrent
 * pas, chacun pour sa raison.
 */
const full = {
  active: {
    profile: { present: true, name: 'Sarah' },
    account: { present: true, name: 'Latécoère', as_of: '2026-09-10' },
    contacts_count: 4,
    signals_count: 2,
    plan: { present: true },
    portfolio: { present: true, count: 12, names: ['Latécoère'], total: 40 },
    memory: { pinned_facts: 3, has_summary: true },
  },
  sources: [{ kind: 'crm', label: 'CRM', as_of: null }],
  not_consulted: ['Site web'],
  not_consulted_actions: [{ label: 'Lancer la collecte', action: 'collect' }],
  clarification: { question: 'Quel Martin ?', options: ['Martin Dupuis', { label: 'Martin Roy', company: 'ACME' }] },
  // #2679 — les réponses possibles d'une précision posée en TEXTE.
  reply_options: [{ question: 'Sur quel territoire ?', options: ['Île-de-France', 'Toute la France'] }],
  pending_actions: [{ action: 'create_mail_draft', to: 'dsi@latecoere.fr', body: 'Bonjour, suite à votre message…' }],
  permissions: ['accounts:write'],
  cards: [{ id: 'card-1', turnId: 't-1' }],
  // #2840 (#2441.13) — le repère MACHINE d'un tour qui s'est arrêté avant la
  // fin (délai dépassé ou panne) : voir `apps/ia/app/routers/chat.py`,
  // `_partial_response`. `reason` vaut `turn_timeout` ou `turn_error` — jamais
  // reparsé depuis le texte de la réponse.
  partial: { reason: 'turn_timeout', as_of: '2026-09-25T10:00:00.000Z' },
  // #2955 (#2394.57) — les participants d'un fil lu par `search_mailbox` ce tour.
  mail_threads: [{ thread_id: 'th-1', participants: ['dsi@latecoere.fr', 'autre@latecoere.fr'] }],
  // #3193.2/.3 (épopée #3217) — le reçu de connaissance structuré, onze couches.
  knowledge_receipt: {
    workspace: { status: 'consulted', result_count: 4 },
    crm: { status: 'consulted', freshness: '2026-09-25T10:00:00.000Z' },
    messaging: { status: 'not_requested' },
    agenda: { status: 'not_requested' },
    documents: { status: 'not_requested' },
    account_dossier: { status: 'consulted', freshness: '2026-09-10T00:00:00.000Z' },
    dataforge: { status: 'not_requested' },
    market_memory: { status: 'not_requested' },
    current_public_sources: { status: 'not_requested' },
    bellum_method: { status: 'not_requested' },
    inference: { status: 'consulted', caveat: 'réponse combinée par raisonnement' },
  },
  // #3176.10 (épopée #3216) — la trace d'observabilité du SourcePlan.
  source_plan: {
    source_plan_requested: 'internal_only',
    source_plan_effective: 'internal_only',
    matched_marker: 'seulement en interne',
    layers_called: ['thread_memory', 'profile', 'workspace'],
    layers_unavailable: ['dataforge', 'market_memory'],
    internal_memory_used: true,
    public_search_avoided: true,
    source_plan_override_reason: null,
  },
  // #3183.11 (recette prod 29-30/09, LAU-FINAL-189) — la preuve de
  // l'approfondissement progressif : combien de passages d'outils étaient
  // prévus contre combien ont réellement eu lieu.
  turn_observability: {
    execution_plan: 'mode_approfondi',
    planned_steps: 3,
    completed_steps: 2,
    skipped_steps: 1,
    parallel_calls: 4,
    budget_exhausted: false,
    degraded_answer: false,
    job_created: false,
  },
  // #3223.1 (#3198) — la trace de raisonnement du tour (diagnostic seulement).
  reasoning_trace: {
    detected_intent: 'preparer_prospection',
    tools_planned: ['search_accounts', 'get_account_briefing'],
    tools_called: ['get_account_briefing'],
    verifier_status: 'pass',
    account_verdict: 'NO_GO_NOW',
  },
}

describe('persistedChatContext', () => {
  it('garde ce qui RE-REND le panneau : les sources, le contexte actif, la clarification', () => {
    const kept = persistedChatContext(full)
    expect(kept?.sources).toEqual([{ kind: 'crm', label: 'CRM', as_of: null }])
    expect(kept?.active.account.name).toBe('Latécoère')
    expect(kept?.not_consulted).toEqual(['Site web'])
    expect(kept?.clarification?.options).toHaveLength(2)
  })

  /**
   * #2679 — une précision posée en TEXTE se clique aussi, et elle doit survivre
   * au rechargement du fil comme la carte : sans ce champ dans la liste blanche,
   * un fil relu retomberait sur des boutons disparus alors que la question, elle,
   * reste écrite dans le texte — la pire des deux formes.
   *
   * Et le TÉMOIN, juste après : un contexte sans ce champ n'en invente pas un
   * vide, sinon l'écran aurait un groupe de boutons à rendre sans option.
   */
  /**
   * #2840 (#2441.13) — un tour PARTIEL survit au rechargement : sans ce champ
   * dans la liste blanche, un fil relu montrerait la prose du résultat partiel
   * (persistée dans `message.content`) SANS le repère structuré qui permet à
   * l'écran de l'annoncer distinctement plutôt que de reparser le texte.
   */
  it('garde le repère machine d’un tour partiel (`context.partial`)', () => {
    const kept = persistedChatContext(full)
    expect(kept?.partial).toEqual({ reason: 'turn_timeout', as_of: '2026-09-25T10:00:00.000Z' })
  })

  it('n’invente aucun repère partiel quand le tour s’est terminé normalement', () => {
    const kept = persistedChatContext({ active: full.active, sources: [], not_consulted: [] })
    expect(kept?.partial).toBeUndefined()
  })

  it('garde les réponses possibles d’une précision posée en texte', () => {
    const kept = persistedChatContext(full)
    expect(kept?.reply_options).toEqual([
      { question: 'Sur quel territoire ?', options: ['Île-de-France', 'Toute la France'] },
    ])
  })

  /**
   * #3193.2/.3 (épopée #3217) — le reçu de connaissance survit au rechargement
   * comme les sources et le contexte actif : sans lui dans la liste blanche, un
   * fil relu perdrait les onze couches nommées, exactement le défaut d'origine
   * que ce fichier corrige pour `sources`/`active`.
   */
  it('garde le reçu de connaissance structuré (`context.knowledge_receipt`)', () => {
    const kept = persistedChatContext(full)
    expect(kept?.knowledge_receipt?.crm).toEqual({ status: 'consulted', freshness: '2026-09-25T10:00:00.000Z' })
    expect(kept?.knowledge_receipt?.agenda).toEqual({ status: 'not_requested' })
    expect(kept?.knowledge_receipt?.dataforge.status).toBe('not_requested')
  })

  it('n’invente aucun reçu de connaissance sur une réponse d’avant ce champ', () => {
    const kept = persistedChatContext({ active: full.active, sources: [], not_consulted: [] })
    expect(kept?.knowledge_receipt).toBeUndefined()
  })

  it('rejette une couche portant un état hors des quatre déclarés', () => {
    const kept = persistedChatContext({
      ...full,
      knowledge_receipt: { ...full.knowledge_receipt, crm: { status: 'sometimes' } },
    })
    // #catch(undefined) — un reçu malformé n'invente pas un panneau à moitié
    // rendu : la clé entière disparaît plutôt qu'une couche cassée.
    expect(kept?.knowledge_receipt).toBeUndefined()
  })

  /**
   * #3176.10 (épopée #3216) — recette prod 29/09 : le SourcePlan existait déjà
   * côté IA (`data["context"]["source_plan"]`) mais n'était lu par AUCUN
   * appelant côté web. Il doit d'abord survivre au rechargement comme le reçu
   * de connaissance, sans quoi aucun écran ne peut jamais le rendre.
   */
  it('garde la trace du plan de sources (`context.source_plan`)', () => {
    const kept = persistedChatContext(full)
    expect(kept?.source_plan).toEqual({
      source_plan_requested: 'internal_only',
      source_plan_effective: 'internal_only',
      matched_marker: 'seulement en interne',
      layers_called: ['thread_memory', 'profile', 'workspace'],
      layers_unavailable: ['dataforge', 'market_memory'],
      internal_memory_used: true,
      public_search_avoided: true,
      source_plan_override_reason: null,
    })
  })

  it('n’invente aucun plan de sources sur un tour sans mode détecté (le cas normal)', () => {
    const kept = persistedChatContext({ active: full.active, sources: [], not_consulted: [] })
    expect(kept?.source_plan).toBeUndefined()
  })

  it('rejette un plan de sources malformé plutôt qu’un panneau à moitié rendu', () => {
    const kept = persistedChatContext({
      ...full,
      source_plan: { ...full.source_plan, layers_called: 'workspace' },
    })
    expect(kept?.source_plan).toBeUndefined()
  })

  /**
   * #3183.11 (recette prod 29-30/09, LAU-FINAL-189) — la preuve de
   * l'approfondissement progressif doit survivre au rechargement comme le
   * plan de sources : sans elle dans la liste blanche, aucun écran ne peut
   * jamais montrer qu'un second passage a réellement eu lieu.
   */
  it('garde la preuve d’approfondissement (`context.turn_observability`)', () => {
    const kept = persistedChatContext(full)
    expect(kept?.turn_observability).toEqual({
      execution_plan: 'mode_approfondi',
      planned_steps: 3,
      completed_steps: 2,
      skipped_steps: 1,
      parallel_calls: 4,
      budget_exhausted: false,
      degraded_answer: false,
      job_created: false,
    })
  })

  it('n’invente aucune preuve d’approfondissement sur un tour d’avant ce champ', () => {
    const kept = persistedChatContext({ active: full.active, sources: [], not_consulted: [] })
    expect(kept?.turn_observability).toBeUndefined()
  })

  it('rejette une preuve d’approfondissement malformée plutôt qu’un panneau à moitié rendu', () => {
    const kept = persistedChatContext({
      ...full,
      turn_observability: { ...full.turn_observability, planned_steps: 'trois' },
    })
    expect(kept?.turn_observability).toBeUndefined()
  })

  // #3861.5 — un repli vers un modèle économique (#2276.43) sur une demande
  // complexe se GARDE dans la preuve du tour, jamais masqué comme équivalent.
  it('garde `capability_fallback` quand l’IA le pose', () => {
    const kept = persistedChatContext({
      ...full,
      turn_observability: { ...full.turn_observability, capability_fallback: true },
    })
    expect(kept?.turn_observability?.capability_fallback).toBe(true)
  })

  it('n’invente aucun repli sur un tour d’avant ce champ', () => {
    const kept = persistedChatContext(full)
    expect(kept?.turn_observability?.capability_fallback).toBeUndefined()
  })

  it('garde la trace de raisonnement du tour (`context.reasoning_trace`, #3223.1)', () => {
    const kept = persistedChatContext(full)
    expect(kept?.reasoning_trace).toEqual(full.reasoning_trace)
  })

  it('garde la correction reconnue et son rerun dans la trace (#3223 X17), et les laisse absents sinon', () => {
    const withCorrection = persistedChatContext({
      ...full,
      reasoning_trace: { ...full.reasoning_trace, correction_recognized: true, correction_rerun: false },
    })
    expect(withCorrection?.reasoning_trace?.correction_recognized).toBe(true)
    expect(withCorrection?.reasoning_trace?.correction_rerun).toBe(false)
    expect(persistedChatContext(full)?.reasoning_trace?.correction_recognized).toBeUndefined()
  })

  it('garde les motifs du vérificateur (#2442.15 X17) : liste vide = vérifié, absent = non vérifié', () => {
    const kept = persistedChatContext({
      ...full,
      reasoning_trace: { ...full.reasoning_trace, verifier_reasons: ['action_declaree_sans_preuve'] },
    })
    expect(kept?.reasoning_trace?.verifier_reasons).toEqual(['action_declaree_sans_preuve'])
    const empty = persistedChatContext({ ...full, reasoning_trace: { ...full.reasoning_trace, verifier_reasons: [] } })
    expect(empty?.reasoning_trace?.verifier_reasons).toEqual([])
    expect(persistedChatContext(full)?.reasoning_trace?.verifier_reasons).toBeUndefined()
  })

  it('garde le détail des outils (#3391 : mode + clés d’entrée), absent sur un ancien message, jamais fatal', () => {
    const detail = [{ tool: 'get_pipeline', mode: 'read', input_keys: ['limit'], silent: false }]
    const kept = persistedChatContext({ ...full, reasoning_trace: { ...full.reasoning_trace, tools_detail: detail } })
    expect(kept?.reasoning_trace?.tools_detail).toEqual(detail)
    // Ancien message : la trace reste valide, le champ reste absent.
    expect(persistedChatContext(full)?.reasoning_trace).toBeDefined()
    expect(persistedChatContext(full)?.reasoning_trace?.tools_detail).toBeUndefined()
    // Détail malformé : on perd le détail, pas la trace.
    const bad = persistedChatContext({ ...full, reasoning_trace: { ...full.reasoning_trace, tools_detail: 'x' } })
    expect(bad?.reasoning_trace?.tools_called).toEqual(full.reasoning_trace.tools_called)
    expect(bad?.reasoning_trace?.tools_detail).toBeUndefined()
  })

  it('n’invente aucune trace de raisonnement sur un tour d’avant ce champ, et rejette une trace malformée', () => {
    expect(
      persistedChatContext({ active: full.active, sources: [], not_consulted: [] })?.reasoning_trace,
    ).toBeUndefined()
    const bad = persistedChatContext({ ...full, reasoning_trace: { ...full.reasoning_trace, tools_called: 'x' } })
    expect(bad?.reasoning_trace).toBeUndefined()
  })

  it('n’invente aucune option quand le tour n’en porte pas', () => {
    const kept = persistedChatContext({ active: full.active, sources: [], not_consulted: [] })
    expect(kept?.reply_options).toBeUndefined()
  })

  /**
   * #2955 (#2394.57, décision Louis 28/09) — L'ÉTAT DE CONVERSATION qui permet
   * de vérifier le destinataire d'un brouillon « en réponse » SANS une nouvelle
   * méthode de lecture de la messagerie : les participants d'un fil, tels que
   * `search_mailbox` les a déjà rendus publics à l'écran de messagerie
   * (`counterpart`/`otherParticipants`), jamais le corps d'un message.
   */
  it('garde les participants d’un fil lu par `search_mailbox` (#2955, #2394.57)', () => {
    const kept = persistedChatContext(full)
    expect(kept?.mail_threads).toEqual([
      { thread_id: 'th-1', participants: ['dsi@latecoere.fr', 'autre@latecoere.fr'] },
    ])
  })

  it('n’invente aucun fil quand le tour n’en a lu aucun', () => {
    const kept = persistedChatContext({ active: full.active, sources: [], not_consulted: [] })
    expect(kept?.mail_threads).toBeUndefined()
  })

  it('refuse un fil sans identifiant ou sans aucun participant, plutôt que de le garder vide', () => {
    expect(
      persistedChatContext({
        active: full.active,
        sources: [],
        not_consulted: [],
        mail_threads: [{ thread_id: '', participants: ['a@b.fr'] }],
      })?.mail_threads,
    ).toBeUndefined()
    expect(
      persistedChatContext({
        active: full.active,
        sources: [],
        not_consulted: [],
        mail_threads: [{ thread_id: 'th-1', participants: [] }],
      })?.mail_threads,
    ).toBeUndefined()
  })

  /**
   * 🔴 D65 — le CORPS d'un message ne sort jamais vers un humain ni vers le
   * modèle. Une proposition brute du modèle (`pending_actions`) porte du texte
   * libre qu'il a rédigé à partir de ce qu'il a lu, corps de courriel compris :
   * elle n'a rien à faire dans une colonne qu'on relit des mois plus tard. Et la
   * forme GOUVERNÉE de la même proposition — la carte — est DÉJÀ persistée
   * côté serveur par son tour : en garder une seconde copie ici ferait deux
   * sources d'un même geste, qui divergeraient (GA-26).
   */
  it('ne garde JAMAIS les propositions brutes, les droits, ni les cartes', () => {
    const kept = persistedChatContext(full) as PersistedChatContext & Record<string, unknown>
    expect(kept).not.toHaveProperty('pending_actions')
    expect(kept).not.toHaveProperty('permissions')
    expect(kept).not.toHaveProperty('cards')
    // Et le corps du courriel n'est nulle part dans ce qui est écrit.
    expect(JSON.stringify(kept)).not.toContain('Bonjour, suite à votre message')
  })

  /** Au-delà du budget, on ne garde RIEN plutôt qu'une moitié de panneau : un
   *  contexte tronqué ferait lire « deux sources » là où il y en avait trente. */
  it('renonce au-dessus du budget, au lieu de tronquer', () => {
    const huge = { ...full, not_consulted: [Array.from({ length: 20_000 }, () => 'x').join('')] }
    expect(persistedChatContext(huge)).toBeNull()
    expect(PERSISTED_CHAT_CONTEXT_MAX_BYTES).toBeGreaterThan(0)
  })

  /**
   * LE TÉMOIN DE COMPATIBILITÉ : un tour d'AVANT ce lot n'a aucun contexte, et
   * une réponse illisible n'en est pas un. Les deux valent `null` — c'est-à-dire
   * exactement le comportement d'aujourd'hui (aucun panneau), jamais un objet
   * à moitié rempli qui ferait planter le rendu.
   */
  it('rend `null` sur un contexte absent ou illisible — jamais un objet inventé', () => {
    expect(persistedChatContext(undefined)).toBeNull()
    expect(persistedChatContext(null)).toBeNull()
    expect(persistedChatContext({ sources: 'non' })).toBeNull()
  })

  /** N'attrape pas ce qu'elle ne vise pas : un contexte MINIMAL (aucune
   *  clarification, aucune action non consultée) reste conservé tel quel. */
  it('conserve un contexte minimal', () => {
    const minimal = { active: full.active, sources: [], not_consulted: [] }
    const kept = persistedChatContext(minimal)
    expect(kept).not.toBeNull()
    expect(kept?.sources).toEqual([])
  })

  /**
   * #3775.2b — une source issue d'une connexion PERSONNELLE (`owner: 'user'`,
   * `tool-registry.ts`) reste lisible une fois écrite, même si cette connexion
   * se ferme ensuite : `restricted` la marque pour que « Partager » (écran)
   * puisse le dire, sans relire le registre à chaque ouverture d'un vieux fil.
   * `ia-proxy.controller.ts` (`createChatMessage`) le pose ; cette liste
   * blanche se contente de le LAISSER PASSER, comme pour les deux autres
   * champs de `persistedSourceSchema`.
   */
  it('garde `restricted` quand une source le porte (#3775.2b)', () => {
    const kept = persistedChatContext({
      active: full.active,
      sources: [{ kind: 'email', label: 'Gmail', as_of: null, restricted: true }],
      not_consulted: [],
    })
    expect(kept?.sources).toEqual([{ kind: 'email', label: 'Gmail', as_of: null, restricted: true }])
  })

  it('n’invente aucune restriction sur une source qui ne la porte pas', () => {
    const kept = persistedChatContext(full)
    expect(kept?.sources[0]).not.toHaveProperty('restricted')
  })
})

describe('#1950.4 / .7 / .12 / .13 — le résumé du plan se garde', () => {
  it('garde l’objectif et les listes NOMMÉES, sans en inventer une', () => {
    const brief = { objective: 'Relancer ACTIA', expected_results: ['Un brouillon prêt'], impossible: ['Envoyer'] }
    const kept = persistedChatContext({ ...full, plan_brief: brief })
    expect(kept?.plan_brief).toEqual(brief)
    expect(kept?.plan_brief).not.toHaveProperty('missing_data')
  })

  it('refuse un résumé sans objectif plutôt que de le garder vide', () => {
    const kept = persistedChatContext({ ...full, plan_brief: { expected_results: ['x'] } })
    expect(kept?.plan_brief).toBeUndefined()
  })
})

/**
 * #3229 (recette prod 01/10) — « Périmètre de recherche » absent d'une réponse
 * « contacts DSI » RELUE : le rapport de couverture (`coverage_report`, forme EXACTE
 * de `CoverageReport.to_wire()` côté IA, liste tronquée : seul « détecté » posé)
 * doit survivre à la liste blanche de persistance, ses paliers non mesurés restant
 * `null` — jamais « 0 ».
 */
describe('#3229 — le rapport de couverture traverse la persistance', () => {
  const truncatedContactsWire = {
    detected: 37,
    resolved: null,
    verified: null,
    relevant: null,
    enriched: null,
    excluded: 0,
    unresolved: 0,
    sources_unavailable: [],
    estimated_coverage: null,
    coverage_basis: "contacts de l'espace correspondant aux filtres — lecture de l'espace, pas du marché",
  }

  it('garde `coverage_report` tel quel, paliers non mesurés compris', () => {
    const kept = persistedChatContext({ ...full, coverage_report: truncatedContactsWire })
    expect(kept?.coverage_report).toEqual(truncatedContactsWire)
    expect(kept?.coverage_report?.resolved).toBeNull()
  })

  it('SAIT DIRE NON — un rapport illisible est retiré, le reste du panneau reste', () => {
    const kept = persistedChatContext({ ...full, coverage_report: { detected: 'trente-sept' } })
    expect(kept).not.toBeNull()
    expect(kept?.coverage_report).toBeUndefined()
    expect(kept?.sources).toHaveLength(1)
  })
})

describe('#3227 — le périmètre de groupe du fil traverse la persistance', () => {
  const scope = { root: 'La Poste', included: ['Docaposte'], excluded: [], unresolved: [] }

  it('garde `thread_scope`, des libellés seulement', () => {
    expect(persistedChatContext({ ...full, thread_scope: scope })?.thread_scope).toEqual(scope)
  })

  it('SAIT DIRE NON — une racine vide est retirée, le reste du panneau reste', () => {
    const kept = persistedChatContext({ ...full, thread_scope: { ...scope, root: '' } })
    expect(kept?.thread_scope).toBeUndefined()
    expect(kept?.sources).toHaveLength(1)
  })
})
