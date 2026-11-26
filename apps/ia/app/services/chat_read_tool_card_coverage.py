"""#2778 — LA GARDE DE COUVERTURE OUTIL → CARTE (LECTURE).

Quatre lots successifs (25-26/09/2026) ont câblé neuf outils de lecture sur
une carte `REPLY_BLOCK_TYPES`, un à la fois, chacun choisi parce que sa forme
collait déjà à une carte existante. Aucun n'avait de registre : à chaque lot,
« ce qui reste » se retrouvait par un `grep` manuel sur ~90 outils, et rien
n'empêchait qu'un futur outil de lecture reste des mois sans qu'on remarque
qu'aucune carte ne l'habille — le même défaut que celui que
`chat-actions-cross-language.test.ts` (`apps/web/src/architecture`) garde déjà
côté ÉCRITURE (`pending_actions`), jamais construit côté LECTURE.

Ce module est le registre — UN seul endroit (GA-26) — qui classe CHAQUE outil
de lecture de `CHAT_TOOLS` (tout outil absent de `WRITE_TOOL_NAMES`) dans
EXACTEMENT une des deux cases :

  - ``CardCoverage(card_type=...)`` — l'outil instruit sa description avec
    « carte `<type>` », et son `card_type` est un des `REPLY_BLOCK_TYPES`.
  - ``TextCoverage(reason=...)`` — un texte libre est le choix ASSUMÉ, avec la
    raison RÉELLE (jamais « pas encore fait » ni « à trancher plus tard») :
    silencieux, mécanisme propre (proposition `pending_actions`, écran dédié,
    carte hors `REPLY_BLOCK_TYPES`), contrôle de flux, matière de raisonnement
    du modèle plutôt que contenu affiché, prose nuancée qu'une carte figée
    écraserait, forme trop riche pour les 12 cartes existantes (candidate à un
    nouveau variant — chantier séparé, jamais forcé), ou compatible avec une
    carte existante mais pas câblé CE lot (borne du lot, pas un désaccord de
    forme — le prochain lot peut y piocher directement).

La garde (`tests/test_chat_read_tool_card_coverage.py`) vérifie que ce
registre couvre TOUS les outils de lecture, RIEN QUE les outils de lecture,
qu'un `card_type` déclaré existe réellement dans le contrat, et qu'il est
réellement écrit dans la description de l'outil — jamais un registre qui dit
« carte » pendant que l'outil dit encore autre chose.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CardCoverage:
    """L'outil rend sa réponse en carte structurée — `card_type` est un des
    `REPLY_BLOCK_TYPES` (`app.models.reply_blocks`)."""

    card_type: str


@dataclass(frozen=True)
class TextCoverage:
    """Texte libre ASSUMÉ — `reason` dit pourquoi, jamais « pas encore fait »."""

    reason: str


ToolCoverage = CardCoverage | TextCoverage

# ── Catégories de raison — réutilisées par plusieurs outils, jamais une seule ─
# raison générique sans le détail de CET outil (chaque valeur ci-dessous porte
# le détail propre à l'outil après le motif partagé).

_SILENT = "Outil SILENCIEUX (sa description le dit explicitement) : il n'affiche aucun contenu au fil, donc aucune carte de LECTURE ne s'applique — {detail}."
_OWN_MECHANISM = "Émet une proposition ou ouvre un écran (mécanisme `pending_actions`/formulaire/écran dédié), jamais un bloc de LECTURE — hors périmètre de #2778 (cartes d'action déjà couvertes par `pendingChatActionSchema`) — {detail}."
_OWN_CARD_SYSTEM = "Porte déjà son propre système de carte, hors des 13 `REPLY_BLOCK_TYPES` — le dupliquer romprait GA-26 (un réglage vit à un seul endroit) — {detail}."
_FLOW_CONTROL = "Outil de FLUX : son retour est une donnée d'orchestration pour le tour suivant (jeton, état d'étape), jamais un contenu à afficher tel quel — {detail}."
_MODEL_REASONING = "Alimente le raisonnement ou le vocabulaire du modèle pour SA phrase suivante — ce n'est pas un contenu à afficher tel quel dans une carte — {detail}."
_NUANCED_PROSE = "Porte plusieurs causes ou raisons D'ABSENCE nommées, conditionnelles ligne par ligne (doctrine « non mesuré » ≠ 0) — un format de carte figé écraserait cette nuance ; choix assumé, pas un oubli — {detail}."
_NEW_VARIANT = "Forme RICHE propre à cet outil qui ne correspond à AUCUNE des 12 cartes existantes sans perte d'information — candidate à un NOUVEAU variant de carte, chantier séparé (doctrine : ne jamais forcer une carte qui ne correspond pas) — {detail}."
_DEFERRED_FIT = "Forme COMPATIBLE avec une carte déjà instruite ailleurs — non câblé CE lot (borne du lot, ~5 outils/tour, jamais un désaccord de forme) : candidat direct pour le prochain — {detail}."


def _silent(detail: str) -> TextCoverage:
    return TextCoverage(_SILENT.format(detail=detail))


def _own_mechanism(detail: str) -> TextCoverage:
    return TextCoverage(_OWN_MECHANISM.format(detail=detail))


def _own_card_system(detail: str) -> TextCoverage:
    return TextCoverage(_OWN_CARD_SYSTEM.format(detail=detail))


def _flow_control(detail: str) -> TextCoverage:
    return TextCoverage(_FLOW_CONTROL.format(detail=detail))


def _model_reasoning(detail: str) -> TextCoverage:
    return TextCoverage(_MODEL_REASONING.format(detail=detail))


def _nuanced_prose(detail: str) -> TextCoverage:
    return TextCoverage(_NUANCED_PROSE.format(detail=detail))


def _new_variant(detail: str) -> TextCoverage:
    return TextCoverage(_NEW_VARIANT.format(detail=detail))


def _deferred_fit(card_type: str, detail: str) -> TextCoverage:
    return TextCoverage(_DEFERRED_FIT.format(detail=f"carte `{card_type}` — {detail}"))


# ── Le registre — un tuple par outil de lecture de `CHAT_TOOLS` ─────────────

CHAT_READ_TOOL_CARD_COVERAGE: dict[str, ToolCoverage] = {
    # ── Câblés (14 outils, 13 avant ce lot + 1 ce lot) ───────────────────────
    "compare_accounts": CardCoverage("comparison"),
    # #3214 (LAU-FINAL-220, LOT écrivain 28/09) — même carte que
    # `compare_accounts` : colonnes = scénarios plutôt que comptes, un nouveau
    # variant de carte pour une forme déjà instruite romprait GA-26.
    "compare_scenarios": CardCoverage("comparison"),
    "get_account_briefing": CardCoverage("account_card"),
    "search_talents": CardCoverage("consultant_shortlist"),
    "run_account_search": CardCoverage("account_ranking"),
    "get_account_timeline": CardCoverage("timeline"),
    "explain_talent_duplicate": CardCoverage("verdict"),
    # #3816.1 — les comptes où placer UN consultant, bâtis par la porte de forme (`known_shape_gate`).
    "find_accounts_for_talent": CardCoverage("account_ranking"),
    "get_account_contacts": CardCoverage("contact_list"),
    "search_workspace_contacts": CardCoverage("contact_list"),
    "get_mission_start_readiness": CardCoverage("missing_data"),
    "prepare_day_brief": CardCoverage("meeting_brief"),
    "list_accounts_to_act": CardCoverage("file_export"),
    "search_workspace_accounts": CardCoverage("file_export"),
    "search_dormant_network": CardCoverage("account_ranking"),
    # #2778 (lot b, 27/09) — quatre outils `_deferred_fit` du lot précédent,
    # câblés maintenant : la forme était déjà compatible, seule l'instruction
    # manquait (FINIR-V2-27-09 : un « reste »/« hors lot » se lève ce tour,
    # pas un troisième report).
    "search_mailbox": CardCoverage("file_export"),
    # #4016 L3 — le corps d'un fil de SA boîte : nourrit la phrase de Laura (résumé, relance, objections), jamais une carte recopiant le contenu.
    "read_mail_thread": _model_reasoning("le contenu d'un fil sert à répondre dans ce tour ; une carte le recopierait hors de la boîte"),
    # #4406.5 — une conversation Beeper (c96) : nourrit la réponse que Laura prépare, jamais une carte qui la recopie.
    "read_beeper_conversation": _model_reasoning("le contenu d'une conversation sert à préparer la réponse dans ce tour ; une carte le recopierait hors de la messagerie"),
    "search_missions": CardCoverage("file_export"),
    "search_proofs": CardCoverage("file_export"),
    "search_partners": CardCoverage("account_ranking"),
    # #3094 (26/09) — nouvel outil apparu APRÈS ce lot, non classé : même forme
    # que `search_workspace_accounts` (liste de comptes plate), juste filtrée
    # par membre plutôt que par nom/secteur — même carte, sans en forcer une
    # nouvelle (lot e1, 27/09).
    "get_accounts_by_owner": CardCoverage("file_export"),
    # #3181.1 (LAU-FINAL-187, LOT écrivain 28/09) — le générateur d'alternatives
    # proactif : même forme que `run_account_search` (une liste de comptes
    # classée, chacun avec ses raisons), le même vocabulaire de carte, jamais
    # un second variant pour un besoin déjà couvert.
    "suggest_account_alternatives": CardCoverage("account_ranking"),
    # #3182.3 (épopée #3248, LOT écrivain 28/09) — l'agrégateur des prérequis
    # de positionnement : même forme que `explain_talent_duplicate` (un état
    # catégorique + des raisons nommées, jamais un chiffre), même carte.
    "check_consultant_positioning": CardCoverage("verdict"),
    # #2778 (lot a, 27/09) — quatre lots avaient déjà noté ces outils comme
    # « compatibles mais pas câblés ce lot » (`_deferred_fit`) ; FINIR-V2 range
    # ce report dans le « reste » à écrire, pas à re-justifier : câblés ici.
    "list_agenda": CardCoverage("file_export"),
    # #4065 — le listing générique rend sa carte `file_export` construite CÔTÉ OUTIL (export CSV).
    "list_records": CardCoverage("file_export"),
    "find_free_slots": CardCoverage("file_export"),
    # #3193.2 (épopée #3217, lot E3 28/09 suite) — même forme plate que
    # `search_missions`/`search_workspace_accounts` : une ligne par repère.
    "search_sector_referential": CardCoverage("file_export"),
    # #4281.1 (19/10) — une ligne datée par besoin historique, même forme plate.
    "search_historical_needs": CardCoverage("file_export"),
    # #4282.9 (19/10) — sept blocs hétérogènes (missions, comptes, rang 2, historique, relais, empreinte, poches).
    "technology_radar": _new_variant(
        "sept blocs hétérogènes (missions liées, comptes classés en trois poches, rang 2, besoins historiques, "
        "relais datés, empreinte) qu'aucune des cartes existantes ne porte ensemble"
    ),
    # ── Texte libre assumé, classé honnêtement ──────────────────────────────
    "get_daily_briefing": _new_variant(
        "composite de blocs hétérogènes (rendez-vous, conflits, fils, comptes) dont chacun porte son propre état"
    ),
    "get_timesheets": CardCoverage("file_export"),
    "get_invoice_blockers": CardCoverage("missing_data"),
    "get_interventions": CardCoverage("file_export"),
    # #3903 — la description de chacun ordonne la carte `file_export` (une ligne par signal / par compte), même forme que `get_interventions`.
    "get_account_signals": CardCoverage("file_export"),
    # #3895 — une ligne par note, l'origine et la portée en sous-ligne : même carte.
    "get_account_notes": CardCoverage("file_export"),
    # #4759 — une ligne par besoin, l'âge en sous-ligne : même carte.
    "get_account_needs_history": CardCoverage("file_export"),
    # LOT (15/10) DATA-B — trois lectures du dossier déjà collecté.
    "get_company_public_facts": _nuanced_prose(
        "quatre natures (offres, appels d'offres, annonces légales, presse) à état NOMMÉ chacune — `cached`, `searched_nothing`, `not_collected` — dont l'absence est une inconnue et jamais un zéro"
    ),
    "get_account_firmographics": _nuanced_prose(
        "rubriques présent-seulement (effectif, financement daté, détecté, dépôts publics, filiales) dont chacune qui manque se tait au lieu de se lire « 0 »"
    ),
    # #4055.4/.6 — deux lectures agrégées : ce qui manque (états nommés, jamais un score) et les comptes par secteur.
    "complete_account": _nuanced_prose(
        "manques LUS et vides, sources NON LUES (inconnu, jamais « manque »), collectes proposées jamais lancées, "
        "personnes détectées hors base à rapprocher — aucune carte existante ne porte ces trois états"
    ),
    # #4055.10 — l'écart d'une personne proposée : une préférence PERSONNELLE retenue (rien dans le CRM ni les contacts).
    "dismiss_completion_person": _nuanced_prose(
        "une phrase qui dit que la personne est mise de côté pour toi seul, sur ce compte — aucune carte n'existe pour un écart"
    ),
    "get_portfolio_sectors": _nuanced_prose(
        "comptes par secteur avec exemples, secteur non renseigné à part et portefeuille partiel dit tel quel — jamais un total deviné"
    ),
    "get_account_org_chart": _new_variant(
        "graphe de personnes à liens vérifiés/supposés, comité d'achat et chemin d'entrée — aucune carte existante ne porte un graphe à deux natures de lien"
    ),
    "get_reengagement_report": CardCoverage("file_export"),
    # #3904.1 — un groupe par geste, une ligne par action : même carte que le bilan qu'il compose.
    "get_action_plan": CardCoverage("file_export"),
    "find_needs": CardCoverage("file_export"),
    "run_matching": _new_variant(
        "douze axes déterministes, deux scores séparés (correspondance/aptitude) et les profils écartés avec motif"
    ),
    # #3865.2 (lot X05, 08/10) — même forme que `run_matching` juste au-dessus, direction inverse
    # (un consultant, plusieurs besoins) : quatre compartiments, chacun avec ses axes et scores.
    "find_needs_for_talent": _new_variant(
        "même forme que run_matching, direction inverse : quatre compartiments de besoins pour UN "
        "consultant, chacun avec ses axes et ses deux scores séparés"
    ),
    "get_mission_risks": CardCoverage("file_export"),
    # #3889 (épopée #3977) — les projets décrits dans les documents d'un compte : l'état de chaque
    # projet est CONDITIONNEL (statut dit, date dite, « non daté », « ambigu »), jamais une colonne figée.
    "search_document_projects": _nuanced_prose(
        "cinq compartiments (ouverts/anciens/missions/projets/non établis), chaque projet avec son extrait "
        "tel quel, sa source et l'état que le document DIT — un « non daté » n'est jamais rendu ouvert"
    ),
    # #3219 (#190.2 côté contact) — le contrôle avant action : chaque ligne porte DEUX valeurs, leur source,
    # leur date et (portée) leur périmètre déclaré, sans valeur choisie — jamais une colonne figée.
    "get_contact_preflight": _nuanced_prose(
        "six sortes de lignes (contradiction ouverte, portée, entreprise, poste, hors périmètre, homonyme), "
        "chacune avec ses deux valeurs et qui garde la main — rien n'est tranché, les vérifications manquantes se nomment"
    ),
    "list_reactivation_pool": _new_variant(
        "double forme selon l'argument `segment` — effectif par segment SANS filtre, profils AVEC filtre"
    ),
    "search_rfps": _new_variant(
        "double forme selon l'identifiant — liste SANS lui, grille de conformité exigence par exigence AVEC"
    ),
    "get_user_context": _model_reasoning("ce que Laura sait déjà de la personne, matière de sa PROCHAINE phrase"),
    "get_workspace_health": _nuanced_prose("cause nommée avec `measurable` conditionnel, jamais un score"),
    "get_weakest_link_diagnosis": _nuanced_prose(
        "maillon principal nommé avec preuve/contre-preuve/expérience recommandée, familles non "
        "évaluables nommées à part (doctrine « non mesuré » ≠ 0), jamais un score opaque"
    ),
    "get_feature_adoption": _model_reasoning("existence d'usage par famille, pas un contenu à lister tel quel"),
    "get_blocking_issues": CardCoverage("missing_data"),
    "propose_guided_action": _own_mechanism("proposition `open_screen` (route + surlignage), pas un bloc de lecture"),
    "ask_clarification": _own_mechanism(
        "carte de précision propre, gérée par `chat-precision-hop`/quota, hors `REPLY_BLOCK_TYPES`"
    ),
    "get_pipeline": _nuanced_prose("montant `null` = aucun projet chiffré, jamais 0€, total-PLANCHER"),
    "get_probable_quarter": _nuanced_prose(
        "probabilité calibrée citée AVEC intervalle, méthode et axes, `value` nul = non mesuré, jamais 0 %"
    ),
    "get_revenue": _nuanced_prose(
        "quatre lignes distinctes (signé/produit/facturé/encaissé), raison nommée par ligne absente"
    ),
    "get_capacity": _nuanced_prose("`null` = rien de mesurable, jamais zéro jour disponible"),
    "get_overdue_payments": CardCoverage("file_export"),
    "prepare_consultant_record": _own_mechanism(
        "ouvre le formulaire vivier PRÉREMPLI, propose une fiche, n'affiche pas un contenu"
    ),
    "get_account_access": _new_variant(
        "barrière d'achat à axes + filiales classées par facilité d'entrée — deux structures distinctes"
    ),
    "get_esn_on_account": _new_variant(
        "trois natures de preuve (déclarée/observée/inférée) avec vocabulaire fermé propre"
    ),
    "get_territory_overview": _new_variant(
        "composite multi-source (offres, entreprises, ESN, commande publique), chaque bloc porte son état"
    ),
    "get_job_changes": CardCoverage("file_export"),
    "plan_account_analysis": _flow_control(
        "prépare le `plan_token` que `start_account_analysis` consomme au même tour"
    ),
    "start_account_analysis": _flow_control("lance l'analyse payante à partir du `plan_token` déjà préparé"),
    # #4462.1 — les résultats arrivent plus tard, sur la fiche de chaque compte : rien à poser ce tour.
    "analyze_named_companies": _flow_control("lance une liste d'analyses ; chaque dossier arrive sur sa fiche"),
    "get_chain_blockers": CardCoverage("missing_data"),
    "search_market_memory": _new_variant(
        "observations structurelles agrégées, vocabulaire fermé « observé »/« affinité », jamais un fait courant"
    ),
    "get_routines": CardCoverage("file_export"),
    "get_import_overview": _new_variant(
        "deux listes distinctes (objets lisibles vs réellement écrits) plus un historique d'imports"
    ),
    "get_settings_overview": _model_reasoning(
        "réglages proposables par `propose_settings_update`, matière de la PROPOSITION suivante"
    ),
    "get_memory": _model_reasoning(
        "ce que Laura retient de la personne, matière de sa PROCHAINE phrase, déjà un écran dédié (`/settings/memory`)"
    ),
    "get_workspace_vocabulary": _model_reasoning("mots de l'ESN à EMPLOYER dans la réponse, pas un fait à afficher"),
    "note_unrouted_request": _silent("signale sans jamais rien afficher, catégorie seule journalisée anonymement"),
    "propose_mission_proof": _own_mechanism(
        "validation sur l'onglet Historique & preuves du compte, jamais un clic dans le fil"
    ),
    "note_thread_context": _silent("note la continuité du fil sans jamais rien afficher"),
    "offer_reply_options": _silent("options cliquables ajoutées à la phrase déjà posée, jamais une carte à part"),
    "get_account_preflight": _new_variant(
        "matière déjà connue + CTA recommandé parmi des propositions — deux concerns dans une réponse"
    ),
    "get_account_work_contract": _new_variant(
        "objectif canonique + `contract_id` consommé par d'autres outils du même tour — donnée d'orchestration, pas un affichage"
    ),
    "resolve_account_territory": _new_variant(
        "périmètre principal + alternative + périmètres écartés avec motif — structure à trois voies"
    ),
    "get_account_coverage_map": _new_variant(
        "trois axes nommés en entier (périmètre/rôle d'achat/étape) + trous priorisés — déjà identifié comme candidat à un variant propre"
    ),
    "compile_opportunity": _own_mechanism(
        "ouvre le formulaire de création d'opportunité PRÉREMPLI, propose, n'affiche pas un contenu"
    ),
    # #4611.3 — l'avancement du travail lancé : une ligne par famille, quatre colonnes, une case non mesurée vide.
    "get_work_progress": CardCoverage("comparison"),
    "get_pipeline_health": _new_variant(
        "neuf axes par affaire + cinq listes de collision nommées distinctes — le plus riche du catalogue, un tableau de bord à lui seul"
    ),
    "web_search": _model_reasoning("résultats cités DANS la phrase de Laura, jamais une liste à exporter"),
    "search_job_offers": _model_reasoning("une carte `file_export` à une ligne par offre, instruite par la description de l'outil"),
    # #4792 — trois familles, chacune avec son total MESURÉ et des lignes datées.
    "search_our_base": _model_reasoning(
        "le modèle DIT le total de chaque famille (comptes, besoins, consultants) puis cite quelques lignes datées"
    ),
    "plan_talent_territory": _own_card_system(
        "`talents_card`/`card`/`reserve_card`/`download_card`, système de carte propre au terrain de jeu de territoire"
    ),
    "describe_plan": _silent("résume un plan sans jamais afficher d'étape, silencieux par construction"),
    "plan_laura_job": _own_mechanism(
        "fiche de job persistée par `LauraJobService.proposeFromTurn`, contrat `laura-job.ts` dédié, jamais un `ReplyBlock`"
    ),
    "get_forecast_horizons": _nuanced_prose(
        "jusqu'à quatre causes chiffrées par devise, cause absente = nulle ce mois, jamais non mesurée"
    ),
    "declare_known_contact": _new_variant(
        "séquence terrain fixe en six étapes + capacité relationnelle + permission d'introduction — un playbook, pas une carte"
    ),
    "compile_account_expansion": _new_variant(
        "neuf champs obligatoires par piste, garde-fous stricts de refus — déjà identifié comme candidat à un variant propre"
    ),
    "get_consultant_push_feedback": CardCoverage("verdict"),
    # #3265.12 — une ligne par réorientation à suivre : nom déclaré, date, geste proposé.
    "get_orientations_to_follow": _nuanced_prose(
        "le texte DÉCLARÉ par le commercial est rendu tel quel puis reformulé en une phrase naturelle — une carte figerait un nom que Laura doit lire, pas copier"
    ),
    "get_crm_presence": _new_variant(
        "trois sous-listes distinctes (contacts/affaires/activité) selon ce que le CRM connecté sait"
    ),
    "get_confirmed_revenue": _nuanced_prose(
        "CA confirmé moins litiges, raison d'absence nommée, jamais un cinquième chiffre nu"
    ),
    "explain_approval_card": CardCoverage("verdict"),
    # ── Défaut réel trouvé en intégration (27/09, après-midi) — quatre outils
    # de lecture déjà câblés dans CHAT_TOOLS n'avaient jamais rejoint ce
    # registre : la garde `test_chaque_outil_de_lecture_est_classe_rien_que_
    # les_outils_de_lecture` était rouge avant ce commit.
    "evaluate_account_qualification_filters": _nuanced_prose(
        "cinq filtres nommés, chacun `valide`/`à vérifier` (jamais `rejeté`), raison propre à chaque filtre"
    ),
    "get_need_transition_history": CardCoverage("timeline"),
    # #3345.2 (LAU-FINAL-255, recette prod 30/09) — même forme que
    # `get_need_transition_history` juste au-dessus : une liste de décisions
    # datées, chacune avec sa raison. `label`/`detail`/`at` collent déjà.
    "get_qualification_lead_decisions": CardCoverage("timeline"),
    "push_profile": _own_mechanism(
        "ouvre le Vivier avec l'affaire déjà sélectionnée dans le panneau de matching, n'envoie et n'enregistre rien"
    ),
    "get_account_manager_review": _new_variant(
        "composite de lectures existantes (verdict à raisons comptées, changeDigest, faits importants, manques de la carte de couverture, actions réalisées/non avancées, risques, décisions en attente)"
    ),
    # #3277.1 (épopée #3277, BEL-SC-225 suite) — cinq dimensions (Périmètre,
    # Problème, Personnes, Preuve, Passage), chacune avec un statut NOMMÉ par
    # champ (verified/observed/inferred/user_supplied/stale/missing/
    # not_applicable) plus une readiness composite — aucune des 12 cartes
    # existantes ne porte une hiérarchie à deux niveaux (dimension → champ →
    # statut) sans l'écraser.
    "get_account_strategy_5p": _new_variant(
        "cinq dimensions à statut par champ (5P) + readiness/next_action_dimension composites — aucune carte existante ne porte une hiérarchie dimension → champ → statut"
    ),
    # #3258.14 (épopée #3362, lot E25 30/09) — deux axes (intérêt,
    # pénétrabilité) chacun avec ses facteurs, une bande et un quadrant
    # composite — même défaut de forme que `get_account_strategy_5p` juste
    # au-dessus : aucune des 12 cartes existantes ne porte une hiérarchie
    # axe → facteur → statut sans l'écraser.
    "get_account_interest_penetrability": _new_variant(
        "deux axes (intérêt, pénétrabilité) à facteurs + bande, quadrant composite — aucune carte existante ne porte une hiérarchie axe → facteur → statut"
    ),
    # #2339.1/.2/.3/.5/.6/.8/.10/.11/.13 (épopée #2795, LOT écrivain 27/09) — les
    # sept lectures de l'état canonique commercial & staffing d'un besoin.
    "get_need_journal": CardCoverage("timeline"),
    "get_need_mission_handoff_check": CardCoverage("verdict"),
    "get_need_field_overview": CardCoverage("missing_data"),
    "find_need_duplicates": _new_variant(
        "une liste de besoins CANDIDATS au doublon (intitulé, statut, raison du rapprochement) — "
        "ni un compte, ni un contact, ni un consultant : aucune des 12 cartes ne porte ce champ "
        "'raison du rapprochement' sans le forcer dans une forme qui ne le porte pas"
    ),
    "get_mission_start_checklist": CardCoverage("missing_data"),
    "get_need_summary": CardCoverage("verdict"),
    "get_need_conversion_result": CardCoverage("verdict"),
    "get_need_no_go_state": CardCoverage("verdict"),
    # #2987.56 (épopée #2987, LOT écrivain 28/09) — la file des notes de frais
    # en attente d'une décision.
    "list_expense_reports_awaiting_decision": _new_variant(
        "une file de notes de frais (référence, porteur, compte, mois) SANS montant — aucune des "
        "12 cartes ne porte ce triplet porteur/compte/mois sans en forcer un dans un champ qui ne "
        "le décrit pas ; liste courte par construction (des SOUMISES seulement), lue en prose par "
        "le modèle pour choisir l'identifiant à passer à propose_expense_report_decision"
    ),
    # BEL-SC-239 (lot SC-239 du 28/09 soir) — le plan de proposition.
    "prepare_proposal_pack": _new_variant(
        "dix sections (clé, état, contenu, manques NOMMÉS, sources) — le MÊME plan que l'écran "
        "« Préparer la proposition » ; aucune des 12 cartes ne porte une liste de sections dont "
        "l'état et les manques varient section par section sans écraser cette nuance"
    ),
    # #3179 (LAU-FINAL-185, retour bêta 28/09/2026) — le verdict d'aptitude
    # commerciale : même forme que ses voisines `get_need_no_go_state`/
    # `get_need_conversion_result` (conclusion + raisons + limites nommées).
    "get_account_suitability_verdict": CardCoverage("verdict"),
    # #3209/#3210 (LAU-FINAL-215/216, beta 28/09/2026).
    "get_portfolio_priorities": CardCoverage("file_export"),
    # #3211.9 (épopée #3234) — une liste plate (action, compte, échéance).
    "list_actions_awaiting_outcome": CardCoverage("file_export"),
    # #3427 — un texte VERBATIM à reprendre : une carte `file_export` le figerait en tableau.
    "check_message_before_send": _nuanced_prose(
        "des contrôles nommés un par un, dont ceux qu'on n'a pas su vérifier, et un verdict « prêt » "
        "conditionnel — une carte figée aplatirait la correction proposée pour chaque échec"
    ),
    "select_message_template": _nuanced_prose(
        "un texte approuvé reproduit mot pour mot, ses variables à compléter et les motifs d'exclusion "
        "des autres exemples — une carte figée écraserait la mention d'un modèle indisponible"
    ),
    "find_similar_cases": _nuanced_prose(
        "des similitudes et des différences NOMMÉES, cas par cas, plus une raison d'échec pour un "
        "cas perdu — une carte figée écraserait la formulation d'analogie que la spec exige "
        "explicitement (« ressemble à », jamais un verdict tranché)"
    ),
    # #3278.3 (#3259.7) — des comptages par canal qui nourrissent UNE phrase
    # (« l'appel répond mieux chez vous »), jamais un tableau à afficher tel quel :
    # un canal non mesuré doit rester dit « non mesuré » dans la prose.
    "get_channel_performance": _nuanced_prose(
        "des comptages par canal dont certains sont « non mesurés » (échantillon sous le seuil) — "
        "une carte figée afficherait un taux là où il n'y en a pas, ou un zéro là où rien n'est mesuré"
    ),
    # #3262.23 (épopée #3284) — un objet plat (`applicable`/`stale`/
    # `recommendation`) qui alimente UNE phrase que Laura dit sur ce compte
    # précis, jamais un tableau ou une liste à afficher tel quel.
    "get_focus_review": _model_reasoning(
        "un compte Focus stagnant ou non, matière de la PHRASE que Laura dit sur CE compte, "
        "jamais un tableau"
    ),
    # #3441/#3442/#3444/#3445 (lot C20, 30/09/2026) — la bibliothèque de
    # contenu approuvé : chaque entrée porte un corps verbatim multi-lignes
    # (placeholders compris) et sa propre liste de conditions d'usage — aucune
    # des 12 cartes existantes ne montre un texte long ET une liste de
    # conditions par ligne sans l'un des deux écrasés.
    "search_content_library": _new_variant(
        "le corps verbatim (souvent plusieurs paragraphes, `{{placeholders}}` compris) et les "
        "conditions d'usage propres à CHAQUE entrée — `file_export` résume en une ligne, ce qui "
        "écraserait justement le texte que Louis veut voir cité mot pour mot"
    ),
    # #3289 (lot P09, 30/09/2026) — le créneau appris, canal par canal : chaque
    # canal porte soit un créneau avec ses COMPTES (« 4 réponses sur 4 »), soit
    # la raison NOMMÉE de son absence (pas assez de gestes / aucun écart) — une
    # carte figée écraserait cette nuance par ligne (doctrine « non mesuré » ≠ 0).
    "get_send_timing": _nuanced_prose(
        "un créneau avec ses comptes OU la raison nommée de son absence, canal par canal — jamais un "
        "pourcentage, jamais un horaire générique"
    ),
}
