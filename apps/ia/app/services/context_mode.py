"""#2453 — les modes de contexte canoniques de Laura (« Contexte de travail »).

Miroir de ``packages/contracts/src/schemas/laura-context-mode.ts`` (source de
vérité, parité prouvée par ``tests/test_context_mode.py`` qui lit le fichier TS).

La règle s'applique ICI, en code, avant que la moindre ligne du prompt ne
s'écrive et avant que les outils ne reçoivent le profil : une couche exclue est
VIDÉE dans une COPIE de la requête. Le NO-GO du retour — « le système affiche
mode neutre mais continue d'utiliser silencieusement les secteurs, références
ou territoires habituels » — ne se ferme pas par une consigne au modèle : un
modèle prié d'ignorer un profil qu'il lit n'est pas une garantie.

Rien ici n'écrit : le profil permanent, la mémoire et les BU restent intacts en
base (#2453.1). Seul CE tour ne les lit pas.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.chat import ChatRequest

CONTEXT_MODES: tuple[str, ...] = ("my_activity", "one_off_mission", "neutral")
DEFAULT_CONTEXT_MODE = "my_activity"

CONTEXT_LAYERS: tuple[str, ...] = (
    "profile",
    "role",
    "business_units",
    "durable_memory",
    "portfolio",
    "crm",
    "commercial_history",
    "knowledge_base",
    "private_mailboxes",
)

_EXCLUDED_BY_MODE: dict[str, tuple[str, ...]] = {
    "my_activity": (),
    "one_off_mission": ("profile", "business_units", "durable_memory", "portfolio", "knowledge_base"),
    "neutral": CONTEXT_LAYERS,
}

# #2453.6 — la hiérarchie, identique pour les trois modes.
CONTEXT_PRECEDENCE: tuple[str, ...] = (
    "explicit_request",
    "explicit_exclusions",
    "temporary_brief",
    "selected_objects",
    "thread_history",
    "mode_context",
    "defaults",
)

# Les champs de `ChatRequest` que porte chaque couche, et leur valeur « vide »
# (celle d'un appelant qui ne les connaît pas — donc un prompt sans bloc).
_LAYER_FIELDS: dict[str, dict[str, Any]] = {
    "profile": {"profile_data": {}},
    "role": {"workspace_role": ""},
    "business_units": {"business_units": []},
    "durable_memory": {
        "pinned_facts": [],
        "pinned_memory": [],
        "user_preferences": {},
        "conversation_summary": "",
    },
    "portfolio": {"accounts_summary": ""},
    # #3703 — la couche CRM ne vide pas que le TEXTE : `crm_connected` /
    # `crm_provider` décident aussi si l'outil d'export et les lectures CRM sont
    # proposés au modèle. Les laisser posés ouvrait le CRM « en silence » dans un
    # mode dont la promesse est de ne pas le lire (voir `_CRM_FAMILY`).
    "crm": {"crm_presence": "", "crm_unavailable": False, "crm_connected": False, "crm_provider": ""},
    # #3703 — l'historique commercial n'est pas que `account_feedback` : le REX de
    # perte du compte et les règles APPRISES de l'espace sont de l'historique de
    # CET espace (pas de la méthode commerciale, qui reste en Neutre).
    "commercial_history": {
        "account_feedback": "",
        "lost_deal_rex_context": "",
        # #4071.1 — les faits du compte (socle #4069) sont l'historique de CET espace.
        "account_facts_context": "",
        # #4071.3 — recherches enregistrées, listes de cibles, conversations passées : l'espace.
        "workspace_recall_context": "",
        "workspace_learned_rules_context": "",
    },
    # `knowledge_base` ne vide aucun champ : c'est une RECHERCHE que le routeur
    # ne lance pas (`knowledge_base_allowed`).
    "knowledge_base": {},
    # #3703 — idem : ce sont les OUTILS (familles `email`, `calendar`) qui sont
    # retirés, pas un champ de la requête (voir `_PRIVATE_MAILBOX_FAMILIES`).
    "private_mailboxes": {},
}


_CRM_FAMILY = "crm"
# #3703 — Neutre « n'ouvre pas implicitement CRM / e-mails / documents privés ».
_PRIVATE_MAILBOX_FAMILIES = ("email", "calendar")


def excluded_layers_for(mode: str) -> tuple[str, ...]:
    return _EXCLUDED_BY_MODE.get(mode, ())


def knowledge_base_allowed(mode: str) -> bool:
    return "knowledge_base" not in excluded_layers_for(mode)


# #3772.5 — ce que l'exclusion STRICTE des données de l'espace retire, en plus
# de ce que le mode retire déjà : l'agrégat de portefeuille, le CRM branché et
# l'historique commercial. Le profil, la mémoire et les BU restent à la charge du
# MODE (« Neutre »), jamais de cette exclusion : « sans portefeuille » n'est pas
# « neutre », et l'un ne se déguise pas en l'autre.
WORKSPACE_DATA_LAYERS: tuple[str, ...] = ("portfolio", "crm", "commercial_history")

# Les outils qui LISENT l'espace (comptes, contacts, dossiers, priorités). Retirés
# du catalogue : un modèle prié de ne pas les appeler n'est pas une garantie.
WORKSPACE_DATA_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "search_workspace_accounts",
        "search_workspace_contacts",
        "get_accounts_by_owner",
        "compare_accounts",
        "get_account_briefing",
        "get_account_timeline",
        "get_account_contacts",
        "get_account_coverage_map",
        "get_company_public_facts",
        "get_account_firmographics",
        "get_account_org_chart",
        "complete_account",
        "get_portfolio_sectors",
        "get_account_manager_review",
        "get_account_strategy_5p",
        "get_account_interest_penetrability",
        "list_accounts_to_act",
        "get_portfolio_priorities",
        "get_crm_presence",
        # #3889 — les projets d'un compte dans les documents de l'espace.
        "search_document_projects",
        # #3219 (#190.2 côté contact) — le contrôle avant action d'un contact de l'espace.
        "get_contact_preflight",
    }
)


_STRICT_LINES = {
    "fr": (
        "EXCLUSION STRICTE — la personne a demandé de travailler SANS les données de son espace : tu n'as ni son "
        "portefeuille, ni ses dossiers de comptes, ni son CRM, et les outils qui les lisent te sont retirés. "
        "Ne les cite pas, ne les devine pas ; si la question en a besoin, dis-le en une phrase et propose d'ouvrir "
        "un autre contexte. Ce que cette conversation contient déjà reste dans le fil : ne prétends pas l'avoir oublié."
    ),
    "en": (
        "STRICT EXCLUSION — the user asked to work WITHOUT their workspace data: you have neither their portfolio, "
        "their account files nor their CRM, and the tools that read them are removed. Do not quote or guess them; "
        "if the question needs them, say so in one sentence and offer to open another context. What this "
        "conversation already contains stays in the thread: do not claim to have forgotten it."
    ),
}


def workspace_data_exclusion_block(req: ChatRequest, language: str) -> str:
    """Le bloc du prompt système de l'exclusion stricte. Hors exclusion ⇒ "" ⇒ prompt byte-identique."""
    if not req.exclude_workspace_data:
        return ""
    return "\n\n" + _STRICT_LINES["en" if language == "en" else "fr"]


def workspace_data_excluded_tool_names(req: ChatRequest) -> frozenset[str]:
    """Les outils à retirer du catalogue de CE tour — vide hors exclusion stricte."""
    return WORKSPACE_DATA_TOOL_NAMES if req.exclude_workspace_data else frozenset()


def apply_context_mode(req: ChatRequest) -> tuple[ChatRequest, dict[str, Any] | None]:
    """Rend (requête bornée, trace du tour). Sans mode : la requête telle quelle, aucune trace.

    La requête d'entrée n'est jamais modifiée (``model_copy``) : un appelant qui
    la relit après coup ne voit pas un profil disparu.
    """
    mode = req.context_mode
    strict = req.exclude_workspace_data
    if not mode and not strict:
        return req, None
    excluded = excluded_layers_for(mode or DEFAULT_CONTEXT_MODE)
    if strict:
        excluded = tuple(dict.fromkeys((*excluded, *WORKSPACE_DATA_LAYERS)))
    update: dict[str, Any] = {}
    for layer in excluded:
        # Copie de chaque valeur vide : jamais un objet mutable partagé.
        update.update({field: type(empty)() for field, empty in _LAYER_FIELDS[layer].items()})
    # Le routeur d'outils masque `export_contact_to_crm`, `get_crm_presence`… quand
    # la famille « crm » n'est pas connectée : une couche CRM exclue la retire de
    # la liste. `None` (« on ne sait pas ») reste `None` — c'est le contrat de
    # `tools_for`, et l'API envoie toujours la liste en production.
    closed_families = tuple(
        family
        for layer, family_group in (("crm", (_CRM_FAMILY,)), ("private_mailboxes", _PRIVATE_MAILBOX_FAMILIES))
        if layer in excluded
        for family in family_group
    )
    if closed_families and req.connected_families is not None:
        update["connected_families"] = [family for family in req.connected_families if family not in closed_families]
    narrowed = req.model_copy(update=update)
    trace = {
        "mode": mode or DEFAULT_CONTEXT_MODE,
        "included_context_layers": [layer for layer in CONTEXT_LAYERS if layer not in excluded],
        "excluded_context_layers": list(excluded),
        # Aucune réactivation de couche n'existe encore côté écran : on trace
        # une liste VIDE plutôt que d'inventer un champ qu'aucun geste ne remplit.
        "explicit_overrides": [],
        # #3772.5 — la clé n'existe QUE pour une exclusion stricte : la trace d'un
        # tour ordinaire reste byte-identique.
        **({"workspace_data_excluded": True} if strict else {}),
    }
    return narrowed, trace


_MODE_LINES = {
    "fr": {
        "my_activity": (
            "Mon activité — tu peux t'appuyer sur son profil, son ESN, ses BU, sa mémoire, "
            "son portefeuille et son CRM pour personnaliser."
        ),
        "one_off_mission": (
            "Mission ponctuelle — raisonne UNIQUEMENT sur le brief de cette demande et les objets "
            "sélectionnés. Ses secteurs, territoires et objectifs habituels ne te sont pas fournis : "
            "ne les suppose pas."
        ),
        "neutral": (
            "Neutre — tu n'as ni son profil, ni son ESN, ni son CRM, ni son portefeuille, ni sa mémoire. "
            "Réponds selon les seuls critères demandés et les sources publiques ; n'annonce aucune "
            "adéquation « à ton activité »."
        ),
    },
    "en": {
        "my_activity": (
            "My activity — you may rely on their profile, company, business units, memory, portfolio "
            "and CRM to personalise."
        ),
        "one_off_mission": (
            "One-off mission — reason ONLY on this request's brief and the selected objects. Their usual "
            "sectors, territories and goals are not provided to you: do not assume them."
        ),
        "neutral": (
            "Neutral — you have neither their profile, company, CRM, portfolio nor memory. Answer on the "
            "requested criteria and public sources only; never claim a fit « with your activity »."
        ),
    },
}

_HIERARCHY = {
    "fr": (
        "Ordre de priorité, identique pour tous les modes : 1. la demande explicite ; 2. les exclusions "
        "explicites ; 3. le brief temporaire ; 4. les objets sélectionnés ; 5. l'historique du fil ; "
        "6. le contexte du mode ; 7. les valeurs par défaut. Une exclusion demandée dans ce fil ne se "
        "réintroduit JAMAIS par le profil (ex. « exclus l'assurance » : l'assurance ne réapparaît jamais)."
    ),
    "en": (
        "Priority order, identical for every mode: 1. the explicit request; 2. explicit exclusions; "
        "3. the temporary brief; 4. selected objects; 5. the thread history; 6. the mode context; "
        "7. defaults. An exclusion asked in this thread is NEVER brought back by the profile "
        "(e.g. « exclude insurance »: insurance never reappears)."
    ),
}


def context_mode_block(mode: str, language: str) -> str:
    """Le bloc du prompt système. Mode absent ⇒ "" ⇒ prompt byte-identique."""
    if mode not in CONTEXT_MODES:
        return ""
    lang = "en" if language == "en" else "fr"
    title = "CONTEXT MODE" if lang == "en" else "MODE DE CONTEXTE"
    return f"\n\n{title} : {_MODE_LINES[lang][mode]}\n{_HIERARCHY[lang]}"


# #3703 — LES ANCIENS ÉCHANGES D'UN FIL, relus sous un mode plus étroit.
#
# Un badge « Neutre » ne neutralise pas un message que Laura a écrit la veille
# AVEC le profil : cet historique est repris tel quel dans le tour (c'est
# l'« historique du fil », niveau 5 de la hiérarchie — jamais retiré). On ne
# promet donc PAS un oubli qui n'a pas lieu ; on dit au modèle ce qu'il peut en
# reprendre (les faits autorisés : noms, dates, chiffres, sources) et ce qu'il
# doit RECALCULER (tout classement, toute adéquation, toute recommandation qui
# dépendait du profil), en gardant la date et le contexte de l'ancien résultat.
_OLDER_ANSWERS = {
    "fr": (
        "ANCIENS ÉCHANGES DE CE FIL : ils ont pu être écrits avec un contexte plus large que le mode "
        "actuel. Reprends-en les FAITS (noms, dates, chiffres, sources) ; ne reprends pas une sélection, "
        "un classement, une adéquation ou une recommandation qui dépendait du profil — recalcule-les "
        "sur la demande de ce tour et les critères confirmés. Quand tu cites un ancien résultat, dis "
        "qu'il date d'avant et sous quel contexte il a été produit. Ne dis jamais que tu as « oublié » "
        "ces échanges : ils restent lisibles dans le fil."
    ),
    "en": (
        "EARLIER ANSWERS IN THIS THREAD: they may have been written with a wider context than the current "
        "mode. Reuse their FACTS (names, dates, figures, sources); do not reuse a selection, ranking, "
        "fit or recommendation that depended on the profile — recompute them from this turn's request "
        "and the confirmed criteria. When you cite an older result, say it predates this turn and under "
        "which context it was produced. Never claim you have « forgotten » them: they stay readable "
        "in the thread."
    ),
}


def older_answers_block(mode: str, language: str) -> str:
    """Bloc posé seulement quand le mode exclut le profil (Mission ponctuelle, Neutre)."""
    if "profile" not in excluded_layers_for(mode):
        return ""
    lang = "en" if language == "en" else "fr"
    return f"\n\n{_OLDER_ANSWERS[lang]}"


# #2451.1 / #2453.7 — LE MODE D'UNE ANALYSE (Analyser), lu par le prompt du plan.
#
# Ce n'est PAS le filtre : l'API a déjà fait partir le run SANS le profil (et
# sans le CRM en « Neutre ») — une couche exclue n'est pas là. Ce bloc DIT
# pourquoi elle manque, pour qu'un plan sans profil ne se présente jamais
# comme « adapté à ton activité » (le dossier générique déguisé du §13). Il
# libelle le dossier selon le mode : le brief de la mission, ou des critères
# neutres. Absent, inconnu ou « Mon activité » ⇒ "" ⇒ prompt byte-identique.
_ANALYSIS_MODE_LINES = {
    "one_off_mission": (
        "Mission ponctuelle — le profil habituel de l'ESN (secteurs, territoires, objectifs) a été "
        "écarté par le commercial pour ce dossier : raisonne sur le compte, ses faits publics et le "
        "brief fourni. N'écris jamais « adapté à ton activité » ni une adéquation au profil."
    ),
    "neutral": (
        "Neutre — ni le profil de l'ESN, ni son CRM, ni son historique commercial ne sont fournis : "
        "le dossier se lit sur des critères neutres et les sources publiques. N'écris jamais "
        "« adapté à ton activité » ni une adéquation au profil."
    ),
}


def analysis_context_mode_block(mode: str | None) -> str:
    line = _ANALYSIS_MODE_LINES.get(mode or "")
    return f"\n\nMODE DE CONTEXTE DU DOSSIER : {line}" if line else ""


# #3673.5 — un profil VIDÉ par le mode n'est pas un profil IT.
#
# L'API fait partir « Neutre » / « Mission ponctuelle » sans profil. Or un profil
# sans offre se lit « IT » (``looks_like_it_esn`` : défaut sûr pour un run sans
# profil) — donc un dossier neutre sur le luxe ressortait avec « Enjeux IT »,
# DSI et budget IT : l'activité habituelle réintroduite par la porte de derrière.
# On pose la lentille générique (domaine neutre, offres du vendeur = prisme) tant
# qu'AUCUNE offre n'est fournie ; un profil qui porte ses offres reste inchangé.
_NEUTRAL_LENS_MODES = ("neutral", "one_off_mission")
_NEUTRAL_LENS_DOMAIN = "generic"


def profile_for_context_mode(profile_data: dict[str, Any] | None, mode: str | None) -> dict[str, Any]:
    profile = dict(profile_data or {})
    if mode not in _NEUTRAL_LENS_MODES:
        return profile
    if profile.get("offers") or profile.get("core_offers") or profile.get("offerDomain"):
        return profile
    return {**profile, "offerDomain": _NEUTRAL_LENS_DOMAIN}
