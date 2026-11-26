"""LA MATRICE DE DROITS DU COPILOTE — rôle, permission, connecteur (#2445.4, #2766).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
#2766 (« console d'opérations IA ») demande une MATRICE DE DROITS croisant
plan / rôle / connecteur. Le tri du 27/09 (lot n4, commentaire #2766) avait
trouvé les DEUX pièces déjà écrites — la famille de rôle utilisateur
(`Famille` / `FAMILLE_PAR_ROLE`, #1920) et la classification lecture /
proposition / dépense d'un outil (`Permission` / `READ_ONLY_TOOLS` /
`SPENDING_TOOLS`, #1948.21) — mais les deux vivaient sous `tests/`, du code de
TEST, jamais importées par une route de service. Construire l'écran/API de
#2445.4 dessus aurait importé du code de test dans une surface de production,
ou l'aurait dupliqué (GA-26 l'interdit).

Ce module est le déplacement demandé : LA MÊME classification, à un seul
endroit, sous `app/`, pour qu'elle soit lue À LA FOIS par le code de
production (`app/services/chat_orchestrator.py` : un outil de DÉPENSE n'est
jamais traité comme lisible-en-lot) ET par les tests
(`tests/copilote_scenario_metadata.py`, `tests/test_copilote_security_eval.py`
ré-exportent ces noms — aucun des huit fichiers qui les importaient n'a dû
changer).

Ce que ceci n'est PAS : un nouvel écran, une nouvelle API, ni le croisement
avec le PLAN d'abonnement (absent du produit aujourd'hui sous cette forme) —
seulement le socle rôle × permission déjà écrit, sorti du seul endroit où le
reste du service ne pouvait pas le lire.

─────────────────────────────────────────────────────────────────────────────
GA-26 — UN SEUL ENDROIT, DEUX FICHIERS CANONIQUES DÉSORMAIS
─────────────────────────────────────────────────────────────────────────────
Avant ce module, `tests/copilote_scenario_metadata.py` était l'unique fichier
canonique du schéma de scénario (§11 de `test_copilote_scenario_corpus.py`).
Il reste le fichier canonique du schéma de SCÉNARIO ; CE fichier-ci devient le
second fichier canonique, pour la classification RÔLE/PERMISSION qui a
vocation à être lue par du code de production. La garde GA-26
(`test_copilote_scenario_corpus.py::test_the_scenario_vocabulary_is_defined_in_a_single_file`)
lit désormais les DEUX fichiers et refuse qu'un troisième redéfinisse un de
leurs noms.
"""

from __future__ import annotations

from enum import StrEnum

# ── #1948.13 / #1920 — PERSONA : les cinq familles de rôles ─────────────────

# ── #1948.13 — PERSONA : les cinq familles de rôles (#1920) ──────────────────


class Famille(StrEnum):
    """Les cinq familles de #1920. Le questionnaire de profil portait DIX rôles
    (`user_role`) et aucun ne s'appelait « directeur d'agence », « dirigeant » ni
    « nouvel arrivant » : la décision du 12/09 a été de MAPPER, sans changer le
    schéma. #1920.4 (15/09/2026) a depuis ajouté la valeur « Directeur
    d'agence » à l'énumération elle-même — le mapping la porte comme les dix
    autres. Le nouvel arrivant n'est pas un rôle mais une ANCIENNETÉ."""

    BUSINESS_MANAGER = "business manager"
    RECRUTEUR = "recruteur"
    DIRECTEUR_AGENCE = "directeur d'agence"
    DIRIGEANT = "dirigeant"
    NOUVEL_ARRIVANT = "nouvel arrivant"


#: Une règle écrite dans le prompt ou dans une description vaut pour tout le
#: monde : c'est la valeur par défaut, et elle est VRAIE — pas un remplissage.
TOUTES_LES_FAMILLES: frozenset[Famille] = frozenset(Famille)

#: #1920 — les onze valeurs RÉELLES de `user_role` vers les quatre familles de
#: rôle. La garde `test_every_questionnaire_role_has_a_family` lit le
#: questionnaire : un onzième rôle ajouté côté contrats la fait tomber.
FAMILLE_PAR_ROLE: dict[str, Famille] = {
    "Fondateur / CEO": Famille.DIRIGEANT,
    "Directeur commercial": Famille.DIRECTEUR_AGENCE,
    "Head of Sales": Famille.DIRECTEUR_AGENCE,
    "Directeur de BU": Famille.DIRECTEUR_AGENCE,
    "Business Manager": Famille.BUSINESS_MANAGER,
    "Account Manager": Famille.BUSINESS_MANAGER,
    "Business Developer": Famille.BUSINESS_MANAGER,
    "SDR / BDR": Famille.BUSINESS_MANAGER,
    "Consultant / Ingénieur d'affaires": Famille.BUSINESS_MANAGER,
    "Talent Manager / Recruteur": Famille.RECRUTEUR,
    # #1920.4 — décision Louis 15/09/2026.
    "Directeur d'agence": Famille.DIRECTEUR_AGENCE,
    # #2032.2-.8 (16/09/2026) — le PARCOURS, distinct du titre. #2032.15 :
    # BUSINESS_MANAGER est le défaut générique pour tout parcours technique ou
    # mixte, jamais une famille « en dessous » (miroir de
    # `app/prompts/laura_role_and_voice.DECLARED_ROLE_FAMILY`).
    "Pur commercial": Famille.BUSINESS_MANAGER,
    "Commercial avec culture technique": Famille.BUSINESS_MANAGER,
    "Hybride business / delivery": Famille.BUSINESS_MANAGER,
    "Ancien consultant devenu commercial": Famille.BUSINESS_MANAGER,
    "Pur technique / delivery": Famille.BUSINESS_MANAGER,
    "Recrutement / talent": Famille.RECRUTEUR,
    "Direction / management": Famille.DIRIGEANT,
    # BEL-SC-222 (#3251) — trois titres ajoutés au catalogue le 28/09/2026
    # (`profile-questionnaire.ts`), mappés ici avec la même prudence que
    # #2032.15 : jamais une famille « en dessous » faute de mieux.
    # « Responsable staffing » place des consultants sur des missions — même
    # métier que « Talent Manager / Recruteur ».
    "Responsable staffing": Famille.RECRUTEUR,
    # « ADV / Finance » est un siège transversal (admin des ventes/finance),
    # sans agence ni équipe à diriger : BUSINESS_MANAGER, le défaut générique.
    "ADV / Finance": Famille.BUSINESS_MANAGER,
    # Un freelance mène seul commercial ET delivery : même défaut générique
    # que les parcours techniques/mixtes ci-dessus, jamais DIRIGEANT déduit
    # d'une taille d'équipe qu'il n'a pas.
    "Freelance / activité individuelle": Famille.BUSINESS_MANAGER,
    # #3386.1 (beta #3386, 30/09/2026) — siège transversal (process, outillage,
    # données), sans book de comptes ni équipe à diriger : même défaut
    # générique qu'« ADV / Finance » juste au-dessus.
    "Opérations commerciales": Famille.BUSINESS_MANAGER,
    # Onboarding V23 (d621bee69, 22/10/2026) — cinq sièges « Responsable … » sans book de comptes ni agence
    # déclarés : le défaut générique (#2032.15), jamais une famille « en dessous » ni au-dessus faute de décision.
    "Responsable ADV": Famille.BUSINESS_MANAGER,
    "Responsable delivery / opérations": Famille.BUSINESS_MANAGER,
    "Responsable achats / partenariats": Famille.BUSINESS_MANAGER,
    "Responsable marketing": Famille.BUSINESS_MANAGER,
    "Responsable d’un bureau d’études": Famille.BUSINESS_MANAGER,
}

#: #1920.6 — le nouvel arrivant se DÉRIVE de `role_tenure`, il n'est pas un rôle.
ANCIENNETE_DU_NOUVEL_ARRIVANT = "Moins de 3 mois"


# ── #1948.21 — PERMISSION REQUISE PAR UN OUTIL ───────────────────────────────


class Permission(StrEnum):
    """#1948.21 — la permission requise, DÉRIVÉE de la classification tenue
    juste plus bas (`READ_ONLY_TOOLS` / `SPENDING_TOOLS`)."""

    CONVERSATION = "aucun outil — une règle de conduite du prompt"
    LECTURE = "lecture de l'espace, scopée à la personne"
    PROPOSITION = "proposition — seul le clic de la personne exécute"
    DEPENSE = "dépense de crédits, après confirmation"


# ── #1948.21 / #2445.4 — LA CLASSIFICATION LECTURE / DÉPENSE, PAR OUTIL ──────
#
# Outils de LECTURE : ils n'écrivent rien, donc rien à confirmer. Le
# dispatcher du copilote est verrouillé (aucun verbe d'écriture dans son
# source, `tests/test_copilote_security_eval.py::
# test_copilote_dispatcher_never_writes_to_a_bridge`), et le pont interne
# qu'ils empruntent n'expose que des lectures — c'est cette double barrière
# qui justifie l'exemption, pas le nom de l'outil.
#
# La permission requise d'un scénario (lecture, proposition, dépense) se
# DÉRIVE de cette liste dans `permission_de`, plus bas.
READ_ONLY_TOOLS: frozenset[str] = frozenset(
    {
        "compare_accounts",
        # #4792 — `search_our_base` relit ce que NOTRE base porte déjà : rien
        # n'est écrit ni débité.
        "search_our_base",
        # #3214/#220 (LAU-FINAL-220) — même garde que `compare_accounts` juste
        # au-dessus, dont `compare_scenarios` reprend la carte `comparison` :
        # rien n'est calculé ni écrit, les scénarios sont NOMMÉS par le modèle
        # et `scenario_comparison.compare_scenarios` ne fait que les borner.
        "compare_scenarios",
        "get_account_briefing",
        "search_mailbox",
        # #4016 L3 — le corps d'un fil de SA boîte : une lecture, rien n'est écrit.
        "read_mail_thread",
        # #4406.5 — une conversation Beeper de SA messagerie : une lecture, jamais un envoi.
        "read_beeper_conversation",
        "list_agenda",
        # #4065 — le listing générique : relit les sources par le pont, n'écrit rien.
        "list_records",
        "find_free_slots",
        "get_daily_briefing",
        # Vivier, missions, facturation, preuves (PDF 6 §9). Même justification
        # que les précédents, et elle porte sur le CHEMIN, pas sur le nom : ces
        # six outils passent par `/internal/copilot/*`, dont un test énumère les
        # méthodes publiques et tombe si quelqu'un y ajoute un verbe d'écriture.
        "search_talents",
        "search_missions",
        "get_timesheets",
        "get_invoice_blockers",
        "search_proofs",
        "get_interventions",
        # Les sept qui ferment l'écart des vingt requêtes prioritaires. Même
        # chemin, même garde : le contrôleur du pont n'expose aucun verbe
        # d'écriture, et `run_matching` ne fait pas exception — un classement
        # écrit sa trace d'audit, jamais un positionnement.
        "find_needs",
        "run_matching",
        "get_mission_risks",
        # #2409.8 — même chemin, même garde : la checklist de démarrage d'une
        # mission est une LECTURE, rien de plus.
        "get_mission_start_readiness",
        "list_reactivation_pool",
        "search_rfps",
        "list_accounts_to_act",
        "list_actions_awaiting_outcome",
        "select_message_template",
        "check_message_before_send",
        "prepare_day_brief",
        # Laura Produit (PDF 10 §5.8). Même chemin et même garde que les
        # précédents : elles passent par `/internal/copilot/laura/*`, dont le
        # test des méthodes publiques tombe si quelqu'un y ajoute un verbe
        # d'écriture. `propose_guided_action` n'y figure PAS : c'est une
        # proposition, et sa description l'annonce.
        "get_user_context",
        "get_workspace_health",
        "get_feature_adoption",
        "get_blocking_issues",
        # BEL-SC-224 (#3253) — même chemin, même garde : le diagnostic passe
        # par `/internal/copilot/laura/weakest-link-diagnosis`, une LECTURE ;
        # la persistance d'historique est un effet de bord côté service, pas
        # un verbe d'écriture exposé au pont.
        "get_weakest_link_diagnosis",
        # Le back-office (PDF 2 §5.1). Même justification que les précédents, et
        # elle porte sur le CHEMIN : ces quatre outils passent par
        # `/internal/copilot/{pipeline,finance,invoicing}/*`, sur le contrôleur
        # dont `copilot-bridge.controller.spec.ts` énumère les méthodes
        # publiques et tombe si quelqu'un y ajoute un verbe d'écriture.
        #
        # ⚠️ `prepare_consultant_record` n'y figure PAS, et c'est le point du
        # §5.3 : « l'enregistrement d'un consultant qu'elle dicte ouvre le
        # formulaire prérempli, elle ne l'enregistre pas seule ». C'est une
        # PROPOSITION, sa description l'annonce, et elle doit continuer de
        # l'annoncer — l'exempter ici retirerait la seule chose qui empêche le
        # modèle de dire « c'est ajouté ».
        "get_pipeline",
        # #4016.1d — le CA probable : même contrôleur, droit `finance:read:own` tenu côté pont.
        "get_probable_quarter",
        # #2324 — même chemin et même garde : `/internal/copilot/pipeline/health`,
        # sur le MÊME contrôleur que `get_pipeline` juste au-dessus.
        "get_pipeline_health",
        # #4611 — l'état du travail lancé : `/internal/copilot/work-progress`, une LECTURE (le contrôleur n'expose
        # aucun verbe d'écriture), l'espace et le périmètre de portefeuille résolus côté pont depuis le userId.
        "get_work_progress",
        "get_revenue",
        "get_capacity",
        # #2900 (#2415.10, 26/09) — même chemin, même garde : `finance/confirmed-revenue`
        # est sur le MÊME contrôleur que `get_revenue`/`get_capacity`, couvert par la
        # même garde `copilot-bridge-finance-doors.spec.ts`.
        "get_confirmed_revenue",
        # #2857 (#2201.31, 26/09) — une LECTURE seule : explique une carte de
        # validation en attente, ne décide rien (ni valider, ni refuser, ni
        # reporter).
        "explain_approval_card",
        # #2425.8 (W43, 24/09) — même chemin, même garde : `finance/forecast`
        # est sur le MÊME contrôleur que `get_revenue`/`get_capacity`
        # (`copilot-bridge.controller.ts:1446`), couvert par la même garde
        # `copilot-bridge-finance-doors.spec.ts` qui énumère les trois routes
        # `finance/*` et tombe si l'une d'elles gagne un verbe d'écriture.
        "get_forecast_horizons",
        "get_overdue_payments",
        # Le second marché et l'accès (tome 6 §16). Même justification, et elle
        # porte sur le CHEMIN : ces cinq outils passent par
        # `/internal/copilot/{accounts,partners,territory,contacts}/*`, sur le
        # contrôleur dont `copilot-bridge.controller.spec.ts` énumère les
        # méthodes publiques et tombe si quelqu'un y ajoute un verbe d'écriture.
        #
        # ⚠️ Ils sont NOMMÉS ici plutôt que laissés à la règle du mot-clé, et
        # c'est délibéré : la description de `get_account_access` contient
        # « proposer une approche », ce qui la ferait passer par accident, pour
        # une raison qui n'a rien à voir avec sa lecture seule. Une garde qui
        # passe par hasard ne garde rien.
        #
        # ⚠️ `declare_access_fact` (N1) et `create_partner_opportunity` (N2), du
        # même §16, ne sont PAS livrés : ils écrivent, et Laura n'écrit pas.
        "get_account_access",
        "get_esn_on_account",
        "search_partners",
        "get_territory_overview",
        "search_dormant_network",
        # #1506 — les blocages de parcours. NOMMÉ ici plutôt que laissé à la
        # règle du mot-clé, pour la même raison que les cinq du dessus : sa
        # description contient « je peux préparer la relance », donc elle
        # passerait par accident sur « propos »… non, sur rien du tout — et une
        # garde qui passe par hasard ne garde rien. Le fait qui le rend lisible
        # est ailleurs : il passe par `/internal/copilot/chains/blockers`, une
        # route qui APPELLE `ChainsService.blockers`, dont le service n'a plus
        # aucun chemin d'écriture depuis que les parcours se dérivent (#1503).
        "get_chain_blockers",
        # #1596.6-10 / #1628.1 — la mémoire marché interrogée PAR FILTRE. NOMMÉ
        # ici pour la même raison que les précédents : rien à confirmer,
        # aucun chemin d'écriture. Le mot-clé qui suffirait pour les outils
        # d'écriture (« propos… ») n'a pas de raison d'apparaître dans une
        # lecture, et c'est justement le point — une garde qui passerait par
        # accident ne garderait rien.
        "search_market_memory",
        # #1948.21 — les CINQ lectures ajoutées depuis (#1822 / #1823 : routines,
        # aperçu d'import, réglages, mémoire, lexique) n'étaient pas nommées. Elles
        # passaient la règle du mot-clé PAR ACCIDENT : « ne propose jamais »,
        # « PROPOSER de changer », ou le simple nom `propose_guided_action` cité
        # dans leur description — exactement la garde qui passe par hasard que ce
        # test refuse. Même chemin que Laura Produit : `/internal/copilot/laura/*`
        # (`bellum_api.py`, routines-summary, import-overview, settings-overview,
        # memory-ledger, workspace-vocabulary), et chacune dit qu'elle ne change
        # rien. La permission dérivée du corpus canonique l'a mesuré.
        "get_routines",
        "get_import_overview",
        "get_settings_overview",
        "get_memory",
        "get_workspace_vocabulary",
        # #1948.21 — la SIXIÈME lecture non nommée : le 14ᵉ outil de territoire
        # (§16), ajouté après les cinq du §16 plus haut. Sa description dit
        # « Lecture seule » ; il passe par `/internal/copilot/contacts/job-changes`
        # (`chat_tools.py`, branche `get_job_changes`), le même contrôleur que
        # ses cinq voisins. Il passait la règle du mot-clé par « propose de
        # vérifier avant d'agir » — un conseil, pas une confirmation.
        "get_job_changes",
        # #1949.23 (décision Louis 13/09 batch 12) — le signal silencieux d'une
        # demande non routée. NOMMÉ ici, jamais laissé au mot-clé : il n'écrit
        # RIEN côté moteur (son exécuteur rend `{"status": "noted"}` et ne touche
        # aucun pont), et la trace qu'il déclenche est écrite par l'API, anonyme,
        # sans aucun effet sur les données du client. Il n'a donc rien à faire
        # confirmer — et le lui faire annoncer pousserait le modèle à le DIRE.
        "note_unrouted_request",
        # #2470 (16/09/2026) — le tour d'horizon EXÉCUTÉ dans la conversation.
        # NOMMÉ ici, jamais laissé au mot-clé : il interroge le REGISTRE PUBLIC
        # (`POST /discover/registry`, `app/routers/discover.py`) et ne touche
        # aucune donnée de l'espace ; son exécuteur (`_run_account_search`) ne
        # fait qu'un appel de lecture et projette le résultat. Aucun chemin
        # d'écriture n'existe depuis lui — c'est l'ABSENCE de code, pas une
        # convention —, et rien à confirmer : lui faire annoncer une
        # confirmation peindrait une porte sur un mur.
        "run_account_search",
        # #3181.1 (LAU-FINAL-187, 28/09/2026) — le générateur d'alternatives
        # proactif. NOMMÉ ici, même justification que `run_account_search` :
        # son exécuteur (`_suggest_account_alternatives`) ne fait que lire le
        # compte visé (ownership, même chemin que `get_account_briefing`) puis
        # réutilise `_run_account_search` — le MÊME appel au registre public.
        # Aucun chemin d'écriture, rien à confirmer.
        "suggest_account_alternatives",
        # #2268.1 / #2268.5 / #2268.10 (17/09/2026) — la continuité du fil.
        # NOMMÉ ici, jamais laissé au mot-clé : il n'écrit RIEN côté moteur
        # (son exécuteur rend `{"status": "thread_note", ...}` et ne touche
        # aucun pont ni aucune donnée du client) — seul `ThreadStateCollector`
        # le projette sur l'état EN MÉMOIRE de ce tour. Rien à confirmer.
        "note_thread_context",
        # #2271.19 (18/09/2026) — l'historique d'un compte, pour la carte
        # `timeline` de la conversation. NOMMÉ ici, même chemin que les cinq du
        # §16 plus haut : `/internal/copilot/account/timeline`, sur le
        # contrôleur dont `copilot-bridge.controller.spec.ts` énumère les
        # méthodes publiques. Rien à confirmer : une lecture, comme sa voisine
        # `get_account_briefing`.
        "get_account_timeline",
        # #2327.26 (18/09/2026) — expliquer un rapprochement de talents. NOMMÉ
        # ici plutôt que laissé au mot-clé : sa description contient « on
        # PROPOSE un rapprochement, on ne fusionne JAMAIS », qui la ferait
        # passer par accident sur « propos » — une raison qui n'a rien à voir
        # avec sa lecture seule. Le fait qui le rend lisible est ailleurs : il
        # passe par `/internal/copilot/talents/identity/explain`
        # (`copilot-bridge.controller.ts`, méthode `talentIdentityExplain`),
        # sur le même contrôleur dont `copilot-bridge.controller.spec.ts`
        # énumère les méthodes publiques et tombe si quelqu'un y ajoute un
        # verbe d'écriture — et `TalentIdentityService.decide` (la SEULE
        # écriture du domaine identité) n'est appelée nulle part depuis lui.
        "explain_talent_duplicate",
        # #2857 (#2201.31, 26/09) — une LECTURE, comme `explain_talent_duplicate`
        # juste au-dessus : `/internal/copilot/approvals/explain`
        # (`copilot-bridge.controller.ts`, méthode `approvalExplain`), sur le
        # même contrôleur gardé par `copilot-bridge.controller.spec.ts` —
        # `WorkflowRunnerService.explainApprovalRequest` ne décide rien
        # (`decideApprovalRequest` n'est appelé nulle part sur ce chemin).
        "explain_approval_card",
        # #2623.1 (20/09/2026) — QUI approcher sur un compte déjà analysé.
        # NOMMÉ ici, même chemin que sa voisine `get_account_timeline` :
        # `/internal/copilot/account/contacts`, sur le même contrôleur dont
        # `copilot-bridge.controller.spec.ts` énumère les méthodes publiques.
        # Rien à confirmer : une lecture, le MÊME classement que l'onglet
        # Contacts d'un compte, jamais un contact ajouté ou modifié.
        "get_account_contacts",
        # #2679 (21/09/2026) — les réponses possibles d'une précision posée en
        # TEXTE. NOMMÉ ici, jamais laissé au mot-clé : il n'écrit RIEN et ne LIT
        # rien non plus — son exécuteur (`_reply_options`) ne fait que borner ce
        # que le modèle vient de nommer, sans toucher un pont ni une donnée du
        # client. Rien à confirmer, et surtout rien à annoncer : lui faire dire
        # « je propose » ferait lire un GESTE là où il n'y a qu'une réponse à
        # cliquer. Ce que le clic envoie est un message, jamais une exécution.
        "offer_reply_options",
        # #2301 (22/09/2026) — la prélecture de compte. NOMMÉ ici, même chemin
        # que ses voisines `get_account_briefing`/`get_account_timeline`/
        # `get_account_contacts` : ownership appliqué par `fetch_owned_account`
        # (compte) et `/internal/copilot/account/contacts` (contacts), aucune
        # écriture. Rien à confirmer : une lecture assemblée, jamais un geste.
        "get_account_preflight",
        # #3179 (28/09/2026) — le verdict d'aptitude commerciale. NOMMÉ ici,
        # même chemin que sa voisine `get_account_preflight` : ownership
        # appliqué par `fetch_owned_account`, le calcul (`account_suitability
        # .py`) est PUR et déterministe, aucune écriture. Rien à confirmer :
        # une lecture, jamais un geste.
        "get_account_suitability_verdict",
        # #2300 (22/09/2026) — le contrat de travail de compte. NOMMÉ ici :
        # son exécuteur vérifie l'ownership du compte (`fetch_owned_account`,
        # lecture Supabase directe) puis appelle un compilateur PUR
        # (`app/services/compilers/account_work_contract.py`) qui n'écrit
        # nulle part — aucun pont, aucune donnée modifiée. Rien à confirmer :
        # une lecture, comme sa voisine `get_account_briefing`.
        "get_account_work_contract",
        # #2302 (22/09/2026) — DÉFAUT D'INTÉGRATION mesuré à la fusion de la
        # vague 14 (22/09) : le lot n'avait pas nommé son propre outil ici. Le
        # résolveur de territoire commercial. NOMMÉ ici : son exécuteur vérifie
        # l'ownership du compte (`fetch_owned_account`) puis appelle un
        # compilateur PUR (`app/services/compilers/territory_resolver.py`) qui
        # ne recalcule ni n'écrit rien — aucun pont, aucune donnée modifiée.
        # Rien à confirmer : une lecture, comme sa voisine `get_account_briefing`.
        "resolve_account_territory",
        # #2273 (LAU-FINAL-015, épopée #2959, LOT g10 26/09) — les 5 filtres de
        # qualification commerciale. NOMMÉ ici, même chemin que sa voisine
        # `resolve_account_territory` : son exécuteur vérifie l'ownership du
        # compte (`fetch_owned_account`) puis appelle un compilateur PUR
        # (`app/services/compilers/sales_qualification_filters.py`) qui ne
        # recalcule ni n'écrit rien. Rien à confirmer : une lecture.
        "evaluate_account_qualification_filters",
        # #2308 (22/09/2026) — la carte de couverture d'un compte et ses trous
        # actionnables. NOMMÉ ici, même chemin que ses voisines
        # `get_account_timeline`/`get_account_contacts` :
        # `/internal/copilot/account/coverage-map`, sur le même contrôleur dont
        # `copilot-bridge.controller.spec.ts` énumère les méthodes publiques.
        # Rien à confirmer : une lecture, le MÊME calcul que
        # `CoverageService.computeChatCoverageMapForAccount`, jamais une
        # écriture de contact ou de compte.
        "get_account_coverage_map",
        # #2721 (22/09/2026) — la recherche web exécutée par Laura. NOMMÉ ici,
        # jamais laissé au mot-clé : son exécuteur (`execute_web_search`,
        # `web_search_tool.py`) ne fait qu'une requête Brave en lecture et
        # projette titre/extrait/adresse — aucun pont d'écriture, aucune
        # donnée de l'espace touchée. Rien à confirmer : c'est une LECTURE du
        # web public, exactement comme `run_account_search` interroge le
        # registre public.
        "web_search",
        # #2294 (23/09/2026) — une personne à travers TOUS les comptes de
        # l'espace. NOMMÉ ici : `/internal/copilot/contacts/search`
        # (`CopilotContactsSearchController`, une seule méthode, un `@Post` de
        # LECTURE) réutilise `ContactsService.findAllForUser` bornée au
        # périmètre (BU) de l'appelant. Rien à confirmer : une lecture, jamais
        # un contact ajouté ou modifié.
        "search_workspace_contacts",
        # #2337 (23/09/2026) — le terrain de jeu multi-talents. NOMMÉ ici : le
        # pont `talents/territory-plan` (`CopilotTerritoryPlanController`) ne
        # fait que LIRE — il refait la boucle du matching inverse précisément
        # pour ne journaliser aucun run —, et le compilateur ne rend que des
        # cartes à lire ou à télécharger localement. Aucune action, aucun message.
        "plan_talent_territory",
        # #2338.8 (23/09/2026) — le dernier point ouvert de #2338 : ce qui
        # manque avant qu'une mission démarre. NOMMÉ ici, jamais laissé au
        # mot-clé : `POST /internal/copilot/missions/start-readiness`
        # (`CopilotBridgeController.missionStartReadiness`) ne fait qu'y
        # ajouter le libellé FR de chaque manque, LA MÊME lecture que
        # `GET /delivery/missions/:id/start-readiness`
        # (`MissionStartReadinessService.readiness`, GA-26). Rien à confirmer :
        # une lecture, jamais un accord ou un contrat enregistré à sa place.
        "get_mission_start_readiness",
        # #1950.4 / .7 / .12 / .13 — le résumé du plan. NOMMÉ ici : il ne LIT
        # rien et n'ÉCRIT rien — son exécuteur (`_plan_brief`) ne fait que
        # borner ce que le modèle vient de nommer. Rien à confirmer : les
        # gestes du plan gardent chacun leur carte et leur clic.
        "describe_plan",
        # #2425.8 (24/09/2026, vague 33) — le prévisionnel par horizon en chat.
        # NOMMÉ ici : `get_forecast_horizons` ne fait que LIRE le MÊME calcul
        # que l'écran « Pourquoi le cash n'est pas le CA » (aucune écriture,
        # aucune probabilité de closing). Rien à confirmer : une lecture,
        # jamais un accord enregistré à sa place.
        "get_forecast_horizons",
        # #2910 (#2322.10, 26/09/2026) — le CRM externe branché, en lecture,
        # pour UN compte. NOMMÉ ici, même chemin que ses voisines
        # `get_account_timeline`/`get_esn_on_account` : `/internal/copilot/
        # crm/presence` (`CopilotBridgeController.crmPresence`, #1791.2), sur
        # le même contrôleur dont `copilot-bridge.controller.spec.ts` énumère
        # les méthodes publiques et tombe si quelqu'un y ajoute un verbe
        # d'écriture. Rien à confirmer : une lecture — le seul effet de bord
        # est une trace best-effort (`recordCrmLookup`) qui ne modifie rien
        # dans le CRM, un tiers, ou chez quelqu'un d'autre.
        "get_crm_presence",
        # #2148.4 (#2848, 25/09) — un compte déjà analysé, à travers TOUT le
        # portefeuille (« réutiliser avant de rechercher »). Même chemin,
        # même garde : `/internal/copilot/accounts/search`
        # (`CopilotAccountsSearchController.search`), et le cloisonnement
        # (portefeuille ET business unit) est appliqué AVANT la lecture, pas
        # relu ici.
        "search_workspace_accounts",
        # #3094 (26/09) — les comptes d'un membre NOMMÉ. Une LECTURE :
        # `CopilotAccountsSearchController.byOwner` résout le membre via
        # `WorkspaceContextService.listMembers` (bornée à CET espace) puis lit
        # `AccountsService.accountsAssignedTo`, jamais une écriture.
        "get_accounts_by_owner",
        # Épopée #2872 (#2367.11, 25-26/09) — le REX d'un push consultant.
        # Une LECTURE : `ConsultantsService.listFeedback` (pont NestJS)
        # vérifie déjà que le consultant appartient à l'espace de l'appelant,
        # et cet outil n'a aucun chemin d'écriture (`recordFeedback` n'est
        # jamais appelé).
        "get_consultant_push_feedback",
        # #3265.12 (épopée #3287) — une LECTURE : `ownership.fetch_orientation_actions`
        # ne fait qu'un `select` sur les actions faites de l'appelant (filtré par
        # `user_id`) ; la création de l'action sur le nouveau contact reste une
        # proposition confirmée par le commercial, jamais faite par cet outil.
        "get_orientations_to_follow",
        # #2319/#2985 (revue manager, 26/09) — une LECTURE : `accountManagerReview`
        # (pont NestJS, `/internal/copilot/account/manager-review`) ne fait que
        # relayer un tiroir déjà calculé ailleurs (changement, plan, risques),
        # aucun chemin d'écriture. NOMMÉ ici plutôt que laissé au mot-clé : sa
        # description dit « ne JAMAIS les inventer », pas « propose ».
        "get_account_manager_review",
        # #2320.24 (épopée #2967, 26/09) — une LECTURE : `CommercialTransitionsService
        # .history()` relit un journal APPEND-ONLY déjà écrit par `changeNeedStatus`,
        # aucun chemin d'écriture ici. NOMMÉ ici plutôt que laissé au mot-clé : sa
        # description ne contient ni « confirm », ni « valid », ni « propos ».
        "get_need_transition_history",
        # #2339.1/.2/.3/.5/.6/.8/.10/.11/.13 (épopée #2795, 27/09) — sept LECTURES :
        # `NeedCommercialStateService` (pont NestJS, `/internal/copilot/needs/*`)
        # et `get_mission_start_readiness` (déjà exempté ci-dessus, juste reformé
        # en checklist). Aucun chemin d'écriture. NOMMÉES ici plutôt que laissées
        # au mot-clé : leurs descriptions ne contiennent pas toutes « confirm »,
        # « valid » ou « propos ».
        "get_need_journal",
        "get_need_mission_handoff_check",
        "get_need_field_overview",
        "find_need_duplicates",
        "get_mission_start_checklist",
        "get_need_summary",
        "get_need_conversion_result",
        "get_need_no_go_state",
        # #2987.56 (épopée #2987, 28/09) — la file des notes de frais en
        # attente de décision. NOMMÉ ici, jamais laissé au mot-clé : sa
        # description contient « avant de proposer une décision avec
        # `propose_expense_report_decision` », qui la ferait passer par
        # accident sur « propos » — une raison qui n'a rien à voir avec sa
        # lecture seule. Son exécuteur ne fait qu'un appel de lecture
        # (`bellum_api.expense_reports_pending_decision`) sans jamais écrire ;
        # l'écriture reste `propose_expense_report_decision`, classée à part
        # dans `WRITE_TOOL_NAMES` (chat_tools.py).
        "list_expense_reports_awaiting_decision",
        # #3209/#3210/#3214 (LAU-FINAL-215/216/220, intégration vague X2 28/09) —
        # trois LECTURES, pas des propositions : chacune relaie TEL QUEL un
        # résultat déjà calculé ailleurs (NestJS pour les deux premières, un
        # simple bornage local pour la troisième), sans aucun chemin
        # d'écriture. NOMMÉES ici plutôt que laissées au mot-clé : aucune des
        # trois descriptions ne contient « confirm », « valid » ou « propos ».
        "get_portfolio_priorities",
        "find_similar_cases",
        "compare_scenarios",
        # #3278.3 (#3259.7) — une LECTURE : relaie la mesure des canaux de
        # l'espace, sans aucun chemin d'écriture.
        "get_channel_performance",
        # #3919 — une LECTURE : relaie la Veille de signaux (compte ou
        # portefeuille), sans aucun chemin d'écriture.
        "get_account_signals",
        # #3895 — une LECTURE : relaie les notes d'un compte et leur portée de groupe.
        "get_account_notes",
        # #4759 — une LECTURE : une page de l'historique des besoins d'un compte, sans écriture.
        "get_account_needs_history",
        # LOT (15/10) DATA-B — trois LECTURES du dossier déjà collecté : le cache commun (`peek`), la
        # firmographie du compte et l'organigramme. Aucun chemin d'écriture, aucun appel externe.
        "get_company_public_facts",
        "get_account_firmographics",
        "get_account_org_chart",
        # #4055.4/.6 — deux LECTURES agrégées (signaux, besoins, contacts, organigramme ; comptes par secteur) :
        # aucune écriture, les collectes manquantes sont seulement PROPOSÉES.
        "complete_account",
        "get_portfolio_sectors",
        # #3903 — une LECTURE : relaie le bilan de relance (journal d'activités
        # sur une fenêtre), sans aucun chemin d'écriture.
        "get_reengagement_report",
        # #3904.1 — une LECTURE : compose le bilan de relance par geste, sans
        # aucun chemin d'écriture (le commercial fait chaque geste).
        "get_action_plan",
        # #3193.2 (épopée #3217, lot E3 28/09 suite) — le référentiel sectoriel
        # Bellum, interrogé EN LECTURE SEULE via `search_dataforge_rag_chunks`
        # (`dataforge_rag_chunks.py`) : aucun chemin d'écriture, même famille
        # que `search_market_memory` juste au-dessus (un corpus partagé, lu
        # par filtre/requête, jamais modifié depuis le chat).
        "search_sector_referential",
        # #3182.3 (épopée #3248) — les prérequis d'un positionnement, LUS
        # ensemble (`bellum_api` → `needs/submissions/preflight`) : aucun
        # chemin d'écriture, « Lecture seule, aucun crédit débité » dit sa
        # description. NOMMÉ ici, jamais laissé au mot-clé : « AVANT que
        # positionner ne soit proposé » la ferait passer sur « propos ».
        "check_consultant_positioning",
        # #3262.23 (épopée #3284, lot P05 29/09) — une LECTURE : relaie TEL
        # QUEL `PilotageService.focusReviewForAccount` (pont NestJS), aucun
        # chemin d'écriture. NOMMÉ ici plutôt que laissé au mot-clé : sa
        # description contient « avant de proposer de le faire sortir du
        # Focus », qui la ferait passer par accident sur « propos ».
        "get_focus_review",
        # #3277.1 (épopée #3277, BEL-SC-225 suite) — une LECTURE : le pont
        # interne (`/internal/copilot/account/strategy-5p`) relaie EXACTEMENT
        # `AccountStrategy5PService.strategyFor`, aucun chemin d'écriture.
        # NOMMÉ ici plutôt que laissé au mot-clé : sa description ne contient
        # ni « confirm », ni « valid », ni « propos ».
        "get_account_strategy_5p",
        # #3258.14 (épopée #3362, lot E25 30/09) — une LECTURE : le pont
        # interne (`/internal/copilot/account/interest-penetrability`) relaie
        # EXACTEMENT `AccountInterestPenetrabilityService.matrixFor`, aucun
        # chemin d'écriture. NOMMÉ ici plutôt que laissé au mot-clé : sa
        # description ne contient ni « confirm », ni « valid », ni « propos ».
        "get_account_interest_penetrability",
        # #3345.2 (LAU-FINAL-255, lot E04 30/09) — une LECTURE : relaie les
        # décisions déjà prises sur les pistes à qualifier d'un compte
        # (`QualificationLeadsService`), aucun chemin d'écriture. NOMMÉ ici :
        # sa description contient « repropose », qui passerait par accident
        # sur « propos ».
        "get_qualification_lead_decisions",
        # #3441/#3442/#3444/#3445 (lot C20, 30/09/2026) — une LECTURE : filtre
        # localement `content_library.CONTENT_LIBRARY_ENTRIES` (contenu
        # versionné en code, aucun pont externe, aucun chemin d'écriture).
        # NOMMÉ ici plutôt que laissé au mot-clé : sa description contient
        # « conditions … avant de citer le texte », qui pourrait la faire
        # passer par accident sur « propos ».
        "search_content_library",
        # #3289 (lot P09, 30/09/2026) — une LECTURE : relaie
        # `/internal/copilot/outreach/send-timing` (mesure des gestes FAITS de
        # l'espace). NOMMÉ ici : sa description contient « recommander », qui
        # pourrait la faire passer par accident sur « propos ».
        "get_send_timing",
        # #3816.1 (lot C4, 07/10) — les comptes où placer UN consultant. NOMMÉ ici : le pont
        # `talents/reverse-market` (`CopilotReverseMarketController`) relaie la LECTURE de
        # l'écran du marché inversé — aucun crédit, aucune écriture. #4421.8 / #4421.10 (24/10) : la collecte
        # fraîche d'offres et la recherche de personnes des comptes hors espace partent seules, sous les plafonds
        # espace × jour (`fresh_jobs`) ; elles n'écrivent rien (les personnes ne deviennent pas des contacts).
        "find_accounts_for_talent",
        # #3865.2 (lot X05, 08/10) — les besoins DÉJÀ OUVERTS pour UN consultant. NOMMÉ ici :
        # le pont `talents/needs-match` journalise un run (comme `run_matching`, lui aussi
        # LECTURE au sens de ce tableau), aucun crédit, aucun appel sortant.
        "find_needs_for_talent",
        # #3889 (épopée #3977, 11/10) — les projets décrits dans les documents de l'espace,
        # par compte. LECTURE de `rag_documents`, scopée comme la récupération générale ;
        # aucun crédit, aucun appel sortant, aucune écriture.
        "search_document_projects",
        # #3219 (#190.2 côté contact, décision Louis 11/10) — le contrôle avant action d'UN
        # contact. LECTURE relayée par le pont (`ContactsService.preflight`) ; aucun crédit,
        # aucun appel sortant, aucune écriture — il ne tranche rien.
        "get_contact_preflight",
        # #4282.9 / #4281.1 (19/10) — le radar par technologie et les besoins historiques de la
        # base commune : LECTURES (sources publiques mises en cache, table partagée) ; aucun
        # crédit, aucune écriture.
        "technology_radar",
        "search_historical_needs",
        # LAURA-OFFRES-4563 (25/10) — les OFFRES du marché pour une compétence et un lieu : LECTURE (sources
        # d'offres, cache 30 j, plafond d'appels payés de la cascade) ; aucune écriture, aucun crédit de l'espace.
        "search_job_offers",
    }
)

#: ⚠️ L'EXCEPTION EST NOMMÉE, ET ELLE EST UNIQUE (#1489) — voir
#: `test_only_one_tool_spends_a_credit_and_it_requires_a_real_plan_token`.
#: #4462.1 (décision Louis 22/10/2026) — SECONDE exception, nommée : `analyze_named_companies` lance une
#: LISTE d'analyses, mais chacune par la même porte (`analysis/plan` puis `analysis/start`, jeton serveur).
SPENDING_TOOLS: frozenset[str] = frozenset({"start_account_analysis", "analyze_named_companies"})


def permission_de(outil: str | None) -> Permission:
    """#1948.21 — la permission requise pour appeler `outil` (`None` = une
    règle de conduite du prompt, sans outil)."""
    if outil is None:
        return Permission.CONVERSATION
    if outil in SPENDING_TOOLS:
        return Permission.DEPENSE
    if outil in READ_ONLY_TOOLS:
        return Permission.LECTURE
    return Permission.PROPOSITION


def is_spending_tool(outil: str) -> bool:
    """#2445.4 — vrai pour l'unique outil qui dépense un crédit (#1489).

    Premier appelant réel de production : `app/services/chat_orchestrator.py`
    ne doit jamais traiter un outil de DÉPENSE comme lisible-en-lot, même si un
    futur outil de dépense oubliait d'entrer dans `WRITE_TOOL_NAMES` — cette
    fonction est le filet, dérivé de la MÊME liste que le gate de sécurité."""
    return outil in SPENDING_TOOLS
