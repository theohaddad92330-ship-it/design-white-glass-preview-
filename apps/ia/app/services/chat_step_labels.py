"""#3491 — LE LIBELLÉ D'ATTENTE D'UN OUTIL EST UNE PHRASE, JAMAIS SON NOM.

Recette prod du 01/10 : « Lecture de account suitability verdict… » — le repli
par préfixe d'avant ce lot fabriquait le libellé en recopiant le nom technique
de l'outil (``get_account_suitability_verdict``) derrière un verbe. Aucun accent,
aucune traduction : le nom d'un outil n'est pas du français.

Désormais : UNE table fermée, FR + EN, qui couvre CHAQUE outil de `CHAT_TOOLS`
(garde : `tests/test_chat_step_labels.py` lit la liste complète et échoue
dès qu'un outil n'a pas son libellé). Un outil inconnu — jamais censé arriver
une fois la garde verte — retombe sur « Action en cours… », jamais sur son nom.
"""

from __future__ import annotations

# (français, anglais) — verbe d'action + objet lisible, sans le « … » final.
_LABELS: dict[str, tuple[str, str]] = {
    "compare_accounts": ("Comparaison de tes comptes", "Comparing your accounts"),
    "get_account_briefing": ("Lecture du dossier du compte", "Reading the account file"),
    "prepare_message_for_contact": ("Préparation d'un message pour le contact", "Preparing a message for the contact"),
    "schedule_reminder_for_contact": ("Planification d'une relance", "Scheduling a follow-up"),
    "enrich_contact": ("Enrichissement du contact", "Enriching the contact"),
    "export_contact_to_crm": ("Export du contact vers ton CRM", "Exporting the contact to your CRM"),
    "create_contact_from_crm_presence": ("Création du contact depuis ton CRM", "Creating the contact from your CRM"),
    "find_accounts": ("Recherche dans tes comptes", "Searching your accounts"),
    "search_mailbox": ("Lecture de ta messagerie", "Reading your mailbox"),
    "read_mail_thread": ("Lecture d'un fil de ta messagerie", "Reading a thread in your mailbox"),
    # #4406.5 — Beeper est l'outil de l'utilisateur : il se nomme (décision 14, #4314).
    "read_beeper_conversation": ("Lecture d'une conversation Beeper", "Reading a Beeper conversation"),
    "list_agenda": ("Lecture de ton agenda", "Reading your calendar"),
    # #4065 — le listing générique.
    "list_records": ("Préparation de ta liste", "Building your list"),
    "find_free_slots": ("Recherche de créneaux dans ton agenda", "Looking for free slots in your calendar"),
    "get_daily_briefing": ("Préparation de ton briefing du jour", "Preparing your daily briefing"),
    "prepare_mail_draft": ("Préparation d'un brouillon de mail", "Preparing an email draft"),
    "prepare_calendar_event": ("Préparation d'un événement d'agenda", "Preparing a calendar event"),
    "search_talents": ("Recherche de consultants", "Searching consultants"),
    "search_missions": ("Recherche de missions", "Searching missions"),
    "get_timesheets": ("Lecture des relevés d'activité", "Reading timesheets"),
    "get_invoice_blockers": ("Recherche de ce qui bloque la facturation", "Looking for invoicing blockers"),
    "search_proofs": ("Recherche de preuves", "Searching proofs"),
    "get_interventions": ("Lecture des interventions", "Reading interventions"),
    "find_needs": ("Recherche de besoins", "Searching needs"),
    "run_matching": ("Rapprochement besoin-consultants", "Matching needs with consultants"),
    "get_mission_risks": ("Lecture des risques de la mission", "Reading mission risks"),
    "list_reactivation_pool": ("Lecture des contacts à réactiver", "Reading contacts to reactivate"),
    "search_rfps": ("Recherche d'appels d'offres", "Searching tenders"),
    "list_accounts_to_act": ("Lecture des comptes à traiter", "Reading accounts to work on"),
    "prepare_day_brief": ("Préparation de ta journée", "Preparing your day"),
    "get_user_context": ("Lecture de ton contexte", "Reading your context"),
    "get_workspace_health": ("Lecture de la santé de ton espace", "Reading your workspace health"),
    "get_feature_adoption": ("Lecture de l'usage des fonctions", "Reading feature usage"),
    "get_blocking_issues": ("Recherche des points bloquants", "Looking for blocking issues"),
    "propose_guided_action": ("Préparation d'une action guidée", "Preparing a guided action"),
    "ask_clarification": ("Préparation d'une question", "Preparing a question"),
    "get_pipeline": ("Lecture de ton pipeline", "Reading your pipeline"),
    "get_probable_quarter": ("Calcul du CA probable", "Computing the probable revenue"),
    "get_revenue": ("Lecture du chiffre d'affaires", "Reading revenue"),
    "get_capacity": ("Lecture de la capacité", "Reading capacity"),
    "get_overdue_payments": ("Lecture des paiements en retard", "Reading overdue payments"),
    "prepare_consultant_record": ("Préparation de la fiche consultant", "Preparing the consultant record"),
    "get_account_access": ("Lecture de l'accès au compte", "Reading account access"),
    "get_esn_on_account": ("Lecture des ESN en place sur le compte", "Reading the IT services firms in place"),
    "search_partners": ("Recherche de partenaires", "Searching partners"),
    "get_territory_overview": ("Lecture de ton territoire", "Reading your territory"),
    "search_dormant_network": ("Recherche dans ton réseau dormant", "Searching your dormant network"),
    # #3904.1 — le plan d'actions par geste.
    "get_action_plan": ("Construction de ton plan d'actions", "Building your action plan"),
    # #3869.a — la recherche de personnes sur un rôle non pourvu.
    "propose_people_search": ("Préparation d'une recherche de personnes", "Preparing a people search"),
    "get_job_changes": ("Lecture des changements de poste", "Reading job changes"),
    "plan_account_analysis": ("Préparation de l'analyse du compte", "Planning the account analysis"),
    "start_account_analysis": ("Lancement de l'analyse du compte", "Starting the account analysis"),
    "analyze_named_companies": ("Lancement des analyses de la liste", "Starting the listed analyses"),
    "get_chain_blockers": ("Recherche des blocages de la chaîne", "Looking for chain blockers"),
    "search_market_memory": ("Recherche dans les observations du marché", "Searching market observations"),
    "get_routines": ("Lecture de tes routines", "Reading your routines"),
    "get_import_overview": ("Lecture de tes imports", "Reading your imports"),
    "toggle_routine": ("Mise à jour d'une routine", "Updating a routine"),
    "get_settings_overview": ("Lecture de tes réglages", "Reading your settings"),
    "propose_settings_update": ("Préparation d'un changement de réglage", "Preparing a settings change"),
    "pin_memory_fact": ("Mise en mémoire d'un fait", "Saving a fact to memory"),
    "get_memory": ("Lecture de ta mémoire", "Reading your memory"),
    "get_workspace_vocabulary": ("Lecture du vocabulaire de ton espace", "Reading your workspace vocabulary"),
    "note_unrouted_request": ("Prise de note", "Taking a note"),
    "propose_mission_proof": ("Préparation d'une preuve de mission", "Preparing a mission proof"),
    "prepare_campaign": ("Préparation de la campagne", "Preparing the campaign"),
    "run_account_search": ("Recherche de comptes", "Searching for accounts"),
    "note_thread_context": ("Prise de note", "Taking a note"),
    "get_account_timeline": ("Lecture de la chronologie du compte", "Reading the account timeline"),
    "explain_talent_duplicate": ("Analyse d'un doublon de consultant", "Analyzing a consultant duplicate"),
    "get_account_contacts": ("Lecture des contacts du compte", "Reading the account contacts"),
    "offer_reply_options": ("Préparation d'options de réponse", "Preparing reply options"),
    "get_account_preflight": ("Vérification avant analyse du compte", "Checking the account before analysis"),
    "get_account_work_contract": ("Lecture du cadre de travail du compte", "Reading the account work framework"),
    "resolve_account_territory": ("Rattachement du compte à un territoire", "Assigning the account to a territory"),
    "get_account_coverage_map": ("Lecture de la couverture du compte", "Reading the account coverage"),
    "get_company_public_facts": ("Lecture des faits publics déjà connus", "Reading the public facts already known"),
    "get_account_firmographics": ("Lecture de la firmographie du compte", "Reading the account firmographics"),
    "get_account_org_chart": ("Lecture de l'organigramme du compte", "Reading the account org chart"),
    "complete_account": ("Recherche de ce qui manque sur le compte", "Checking what the account is missing"),
    "dismiss_completion_person": ("Mise de côté d'une personne proposée", "Setting a suggested person aside"),
    "get_portfolio_sectors": ("Lecture des secteurs du portefeuille", "Reading the portfolio sectors"),
    # #4282.9 / #4281.1 (19/10)
    "technology_radar": ("Construction du radar par technologie", "Building the technology radar"),
    "search_historical_needs": ("Lecture des besoins historiques", "Reading past needs"),
    "compile_opportunity": ("Rédaction de l'opportunité", "Compiling the opportunity"),
    "get_pipeline_health": ("Lecture de la santé du pipeline", "Reading pipeline health"),
    "get_work_progress": ("Lecture de l'avancement du travail lancé", "Reading the progress of the launched work"),
    "get_account_needs_history": (
        "Lecture de l'historique des besoins du compte",
        "Reading the account's needs history",
    ),
    "compile_need": ("Rédaction du besoin", "Compiling the need"),
    "web_search": ("Recherche sur le web", "Searching the web"),
    "search_job_offers": ("Recherche d'offres", "Searching job offers"),
    "search_workspace_contacts": ("Recherche dans tes contacts", "Searching your contacts"),
    "plan_talent_territory": ("Préparation du territoire des consultants", "Planning the consultant territory"),
    "compile_day_closure": ("Préparation du bilan de ta journée", "Preparing your end-of-day review"),
    "get_mission_start_readiness": ("Vérification du démarrage de mission", "Checking mission start readiness"),
    "propose_mission_amendment": ("Préparation d'un avenant de mission", "Preparing a mission amendment"),
    "describe_plan": ("Description du plan", "Describing the plan"),
    "propose_focus_plan": ("Préparation d'un plan de focus", "Preparing a focus plan"),
    "propose_weekly_plan": ("Préparation d'un plan de semaine", "Preparing a weekly plan"),
    "propose_opportunity_update": ("Préparation d'une mise à jour d'opportunité", "Preparing an opportunity update"),
    "prepare_cold_call": ("Préparation d'un appel à froid", "Preparing a cold call"),
    "plan_laura_job": ("Préparation d'une tâche de fond", "Planning a background job"),
    "get_forecast_horizons": ("Lecture des horizons de prévision", "Reading forecast horizons"),
    "declare_known_contact": ("Enregistrement d'un contact connu", "Recording a known contact"),
    "create_target_list_from_account": ("Création d'une liste cible", "Creating a target list"),
    "add_account_to_portfolio": ("Ajout du compte à ton portefeuille", "Adding the account to your portfolio"),
    # #2433.7 (lot M10, 09/10) — le signalement préparé depuis une capture.
    "prepare_bug_report": ("Préparation du signalement", "Preparing the bug report"),
    "compile_account_expansion": ("Rédaction du plan d'expansion du compte", "Compiling the account expansion plan"),
    "search_workspace_accounts": ("Recherche dans tes comptes", "Searching your accounts"),
    "get_consultant_push_feedback": ("Lecture des retours sur les profils proposés", "Reading feedback on proposed profiles"),
    "get_crm_presence": ("Lecture de la présence dans ton CRM", "Reading presence in your CRM"),
    "get_confirmed_revenue": ("Lecture du chiffre d'affaires confirmé", "Reading confirmed revenue"),
    "get_account_manager_review": ("Lecture de la revue du compte", "Reading the account review"),
    "get_need_transition_history": ("Lecture de l'historique du besoin", "Reading the need history"),
    "propose_need_transition": ("Préparation d'un changement d'étape du besoin", "Preparing a need stage change"),
    "evaluate_account_qualification_filters": ("Évaluation des critères de qualification", "Evaluating qualification criteria"),
    "explain_approval_card": ("Explication d'une proposition", "Explaining a proposal"),
    "get_accounts_by_owner": ("Lecture des comptes par responsable", "Reading accounts by owner"),
    "get_need_journal": ("Lecture du journal du besoin", "Reading the need journal"),
    "get_need_mission_handoff_check": ("Vérification du passage besoin-mission", "Checking the need-to-mission handoff"),
    "get_need_field_overview": ("Lecture des champs du besoin", "Reading the need fields"),
    "find_need_duplicates": ("Recherche de doublons de besoins", "Looking for duplicate needs"),
    "get_mission_start_checklist": ("Lecture de la checklist de démarrage", "Reading the start checklist"),
    "get_need_summary": ("Lecture de la synthèse du besoin", "Reading the need summary"),
    "get_need_conversion_result": ("Lecture du résultat de conversion du besoin", "Reading the need conversion result"),
    "get_need_no_go_state": ("Lecture de l'état no-go du besoin", "Reading the need no-go state"),
    "list_expense_reports_awaiting_decision": ("Lecture des notes de frais en attente", "Reading pending expense reports"),
    "propose_expense_report_decision": ("Préparation d'une décision sur une note de frais", "Preparing an expense report decision"),
    "get_account_suitability_verdict": ("Lecture du verdict sur le compte", "Reading the account verdict"),
    "suggest_account_alternatives": ("Recherche de comptes alternatifs", "Looking for alternative accounts"),
    "get_weakest_link_diagnosis": ("Lecture du diagnostic du maillon faible", "Reading the weakest-link diagnosis"),
    "search_sector_referential": ("Recherche dans le référentiel sectoriel", "Searching the sector reference"),
    "check_consultant_positioning": ("Vérification du positionnement du consultant", "Checking the consultant positioning"),
    "get_portfolio_priorities": ("Lecture des priorités de ton portefeuille", "Reading your portfolio priorities"),
    "find_similar_cases": ("Recherche de cas similaires", "Looking for similar cases"),
    "compare_scenarios": ("Comparaison de scénarios", "Comparing scenarios"),
    "get_orientations_to_follow": ("Lecture des orientations à suivre", "Reading orientations to follow"),
    "get_focus_review": ("Lecture de la revue de focus", "Reading the focus review"),
    "get_account_strategy_5p": ("Lecture de la stratégie du compte", "Reading the account strategy"),
    "propose_crm_note": ("Préparation d'une note CRM", "Preparing a CRM note"),
    "get_qualification_lead_decisions": ("Lecture des décisions de qualification", "Reading qualification decisions"),
    "prepare_proposal_pack": ("Préparation du dossier de proposition", "Preparing the proposal pack"),
    "get_account_interest_penetrability": ("Lecture de la pénétrabilité du compte", "Reading account penetrability"),
    "search_content_library": ("Recherche dans ta bibliothèque de contenus", "Searching your content library"),
    "propose_long_job": ("Préparation d'une tâche longue", "Preparing a long-running job"),
    "propose_qualification_lead_decision": (
        "Préparation d'une décision sur une piste à qualifier",
        "Preparing a qualification lead decision",
    ),
    "propose_bulk_enrichment": ("Préparation d'un enrichissement en masse", "Preparing a bulk enrichment"),
    "get_send_timing": ("Lecture des meilleurs moments d'envoi", "Reading the best send times"),
    "get_channel_performance": ("Lecture des réponses par canal ou par rôle", "Reading replies by channel or role"),
    "push_profile": ("Préparation de la proposition d'un profil", "Preparing a profile proposal"),
    "find_accounts_for_talent": ("Recherche des comptes pour ce profil", "Finding accounts for this profile"),
    "propose_contact_departure": ("Préparation du passage du contact en historique", "Preparing the contact's move to historical"),
    "get_contact_preflight": ("Vérification du contact avant d'agir", "Checking the contact before acting"),
    "search_document_projects": (
        "Recherche des projets du compte dans tes documents",
        "Searching the account's projects in your documents",
    ),
}

_GENERIC = ("Action en cours", "Working on it")


def step_label(tool_name: str, language: str = "fr") -> str:
    """Libellé d'attente d'un outil, dans la langue de l'interface (« fr » par
    défaut, « en » sinon). Jamais le nom technique, jamais une exception."""
    fr, en = _LABELS.get(tool_name, _GENERIC)
    return f"{en if language == 'en' else fr}…"


def known_tool_names() -> frozenset[str]:
    """Les outils couverts — lu par la garde, pas par la production."""
    return frozenset(_LABELS)
