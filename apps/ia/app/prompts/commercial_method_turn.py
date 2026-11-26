"""#3390.10 (recette prod 04/10) — la consigne du TOUR « Quelle approche pour ce compte ? ».

Le bloc « MÉTHODE COMMERCIALE RETENUE » (`commercial_method_context`, rendu côté API depuis le
moteur de choix de méthode) était dans le prompt mais n'obtenait pas de bloc Méthode dans la
réponse. Ici la consigne est propre à la question : la réponse COMMENCE par un bloc « Méthode »
qui NOMME la méthode retenue (niveau d'effort, route, action suivante) — celle du serveur, jamais
une autre. Vide sans méthode lue ou pour une autre question : rien n'est inventé."""

from __future__ import annotations

import re
import unicodedata

_APPROACH_MARKERS: tuple[str, ...] = (
    "quelle approche",
    "quelle methode",
    "quelle strategie pour ce compte",
    "comment aborder ce compte",
    "comment approcher ce compte",
    "which approach",
    "what approach",
)


# #3894.7 — LA règle de l'échange prouvé, à UN seul endroit (GA-26) : elle couvre toute la famille de formules
# qui présupposent un échange passé, pas seulement la plus fréquente.
PROVEN_EXCHANGE_RULE = (
    "« Suite à notre échange », « merci pour notre échange », « suite à notre appel / rendez-vous / entretien / "
    "conversation », « comme convenu », « comme promis », « notre dernier échange » (et toute formule qui "
    "présuppose un échange passé) supposent un échange PROUVÉ : tu ne les écris que sur une interaction tracée "
    "avec CETTE personne (historique du compte, messagerie, agenda lus dans ce tour) ; sans interaction tracée, "
    "tu ouvres par une prise de contact neutre."
)


def _method_line(context: str, label: str) -> str:
    """La valeur d'une ligne « - <label> : <valeur> » du bloc rendu par l'API, "" si absente."""
    for line in (context or "").splitlines():
        match = re.match(rf"^\s*-\s*{re.escape(label)}\s*:\s*(.+?)\s*$", line)
        if match:
            return match.group(1)
    return ""


def method_turn_block(commercial_method_context: str, message: str, english: bool = False) -> str:
    """#3390.10 — un BLOC « Méthode » distinct en tête de la réponse (titre + puces), pas une phrase
    « Méthode : … » en ligne (recette Z3 04/10). Le niveau d'effort est lu dans le bloc serveur ;
    absent, la puce dit « effort non défini » — jamais un niveau inventé."""
    if not (commercial_method_context or "").strip():
        return ""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    if not any(marker in text for marker in _APPROACH_MARKERS):
        return ""
    effort = _method_line(commercial_method_context, "Niveau d'effort")
    route = _method_line(commercial_method_context, "Route d'ouverture")
    action = _method_line(commercial_method_context, "Action suivante")
    if english:
        title, effort_label = "Method", "Effort level"
        route_label, action_label = "Opening route", "Next action"
        effort = effort or "effort not defined"
    else:
        title, effort_label = "Méthode", "Niveau d'effort"
        route_label, action_label = "Route d'ouverture", "Action suivante"
        effort = effort or "effort non défini"
    bullets = [f"- {effort_label} : {effort}"]
    if route:
        bullets.append(f"- {route_label} : {route}")
    if action:
        bullets.append(f"- {action_label} : {action}")
    template = f"**{title}**\n" + "\n".join(bullets)
    return (
        "\n\nBLOC MÉTHODE (consigne de ce tour) : ta réponse COMMENCE par un BLOC distinct — un titre en gras "
        "puis des puces, sur des lignes à part, jamais une phrase « Méthode : … » en ligne — qui NOMME la méthode "
        "commerciale retenue ci-dessus avec ses libellés exacts, au format suivant :\n"
        f"{template}\n"
        "Une ligne vide sépare ce bloc du développement. Tu ne proposes pas une autre méthode ; le niveau d'effort "
        "est celui du bloc, ou « effort non défini » quand il n'y en a pas — jamais un niveau inventé ; ce que le "
        "bloc dit ne pas avoir mesuré, tu le dis."
    )


_ENTRY_ROUTE_PREFIX = "VOIE D'ENTRÉE DU PLAN : "
_OPENING_MARKERS: tuple[str, ...] = (
    "par ou j'ouvre",
    "par ou je commence",
    "par ou j'entre",
    "par ou attaquer",
    "par ou ouvrir",
    "comment j'ouvre ce compte",
    "ou entrer chez",
    "where do i open",
    "where do i start with this account",
)


def entry_route_turn_block(plan_summary: str, message: str) -> str:
    """#3423.8 (recette prod 04/10) — « Par où j'ouvre ce compte ? » rend la MÊME voie
    d'entrée que l'onglet Plan du compte. La voie est lue côté API depuis le plan
    (`readPlanEntryRoute`, contrats) et voyage dans `plan_summary` ; la consigne la fait
    reprendre TELLE QUELLE. Sans voie au plan, la consigne dit de le dire — jamais une
    autre voie inventée."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    text = text.replace("’", "'")
    if not any(marker in text for marker in _OPENING_MARKERS):
        return ""
    route = ""
    for line in (plan_summary or "").splitlines():
        if line.startswith(_ENTRY_ROUTE_PREFIX):
            route = line[len(_ENTRY_ROUTE_PREFIX) :].strip()
    if route:
        return (
            "\n\nPAR OÙ OUVRIR CE COMPTE (consigne de ce tour) : la voie d'entrée du plan de ce compte est "
            f"« {route} » — c'est celle que montre l'onglet Plan. Ta réponse la NOMME telle quelle, en premier ; "
            "tu n'en proposes pas une autre et tu ne la reformules pas en une autre porte."
        )
    return (
        "\n\nPAR OÙ OUVRIR CE COMPTE (consigne de ce tour) : le plan de ce compte ne porte pas encore de voie "
        "d'entrée. Tu le dis, et tu proposes de la poser dans l'onglet Plan ; tu n'inventes aucune voie."
    )


_COLD_CALL_MARKERS: tuple[str, ...] = (
    "appel a froid",
    "appel froid",
    "cold call",
    "cold-call",
)


def cold_call_turn_block(message: str) -> str:
    """#3443 (recette prod 04/10) — « Prépare-moi un appel à froid pour Martin, DSI » rendait un
    script texte suivi d'une liste de 8 contacts. Le dialogue d'appel à froid LIVRÉ est la carte de
    `prepare_cold_call` : quand une personne est nommée, c'est elle qui s'ouvre. Plusieurs homonymes :
    UNE question, « lequel ? ». Sans personne nommée, le cadre textuel (`_COLD_CALL_FLOW`) reste.

    # #3443 (recette Z3 04/10) — « Martin, DSI » alors que la fiche dit « Director » : Laura
    # concluait « je n'ai pas pu générer le dialogue » sans appeler l'outil. Une fonction qui ne
    # correspond pas exactement n'est pas un échec : contact le plus proche, nommé, carte ouverte."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    if not any(marker in text for marker in _COLD_CALL_MARKERS):
        return ""
    return (
        "\n\nAPPEL À FROID (consigne de ce tour) : si la demande NOMME une personne, tu OUVRES le dialogue d'appel "
        "avec l'outil `prepare_cold_call` — la carte est le dialogue ; tu n'écris NI script en texte NI liste de "
        "contacts à sa place. Retrouve la personne (la liste des contacts du dossier, sinon "
        "`search_workspace_contacts`) : un seul contact correspond → `prepare_cold_call` tout de suite ; plusieurs "
        "homonymes → tu appelles `ask_clarification` pour demander LEQUEL (nom, fonction, entreprise de chacun en "
        "options) avant toute carte. Une fonction citée qui ne correspond pas EXACTEMENT "
        "à la fiche (« DSI » demandé, « Director » sur la fiche) n'est PAS un motif d'échec : tu prends le contact "
        "le plus proche (même nom, sinon fonction voisine), tu le NOMMES avec la fonction de sa fiche dans ta "
        "réponse, et tu appelles `prepare_cold_call` quand même. Tu ne réponds jamais « je n'ai pas pu générer le "
        "dialogue » sans avoir appelé l'outil. L'outil exige TOUS ses champs dans le même appel — reason, objective, "
        "opening_question, next_questions, objection, fallback, expected_outcome : écris-les d'emblée, sinon il "
        "refuse. S'il renvoie une erreur, tu la REDIS telle quelle (c'est la vraie cause) et tu corriges l'appel "
        "si elle porte sur un champ manquant. Aucun contact proche → tu le dis. Tu ne demandes jamais le micro : "
        "il ne se demande qu'au clic de la personne. Sans personne nommée, tu gardes le cadre de l'APPEL À FROID, "
        "LE DÉROULÉ."
    )


# #3869.3 (BEL-LAU-1008-018, bêta 08/10) — « quand l'approche est demandée, produire le message ou
# le discours correspondant… ne pas terminer par « je peux maintenant préparer un message »». Aucun
# bloc existant ne portait cette interdiction : `UI_BLOCK_FORBIDDEN` (reply_ui_blocks.py) interdit
# une PROMESSE non prouvée pour un geste non exécuté (« je vais », « c'est garanti ») — une offre
# différée n'en est pas une, elle ne prétend rien de faux, elle retarde juste le geste. Ce bloc-ci
# force le geste MAINTENANT, à la différence de `cold_call_turn_block` (téléphone, carte dédiée) :
# ici le canal est le message/mail/discours écrit, via `prepare_message_for_contact` ou
# `prepare_mail_draft` — jamais un script texte improvisé à leur place.
_APPROACH_PREPARATION_MARKERS: tuple[str, ...] = (
    "prepare le message",
    "prepare un message",
    "prepare moi un message",
    "prepare-moi un message",
    "ecris un message",
    "ecris le message",
    "redige un message",
    "redige le message",
    "prepare l'approche",
    "prepare une approche",
    "prepare le mail",
    "prepare un mail",
    "prepare le discours",
    "quel message envoyer",
    "quel message je peux envoyer",
    "prepare the message",
    "write the message",
    "draft the message",
    "prepare an outreach",
)


# #3869.3 — recette prod 11/10 : la liste de libellés exacts ratait « puis prépare-leur une approche »,
# « rédige-moi une accroche »… Un verbe de préparation suivi (≤ 40 caractères) d'un objet d'approche
# déclenche aussi : on lit le COMPORTEMENT demandé, pas son libellé.
_PREPARATION_VERB = r"(?:prepar\w*|redig\w*|ecri[rst]\w*|genere\w*|compos\w*|draft\w*|write|prepare)"
_APPROACH_OBJECT = (
    r"(?:message|mail|e-mail|email|approche|accroche|brouillon|discours|relance|outreach|pitch|inmail)"
)
_APPROACH_PAIR = re.compile(rf"\b{_PREPARATION_VERB}\b[^.?!]{{0,40}}?\b{_APPROACH_OBJECT}s?\b")


# #3869 (R20) — « décideurs achats Renault + approche » : l'approche est nommée SANS verbe, jointe à la
# recherche par « + », « et » ou « puis ».
_APPROACH_JOINED = re.compile(rf"(?:\+|\bet\b|\bpuis\b)\s*(?:l'|la |une? )?{_APPROACH_OBJECT}s?\b")


def approach_preparation_turn_block(message: str) -> str:
    """#3869.3 — une approche demandée (message, mail, discours écrit) est EFFECTIVEMENT préparée
    dans ce tour, jamais reportée par une phrase du type « je peux maintenant préparer un message »."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    if not any(marker in text for marker in _APPROACH_PREPARATION_MARKERS) and not _APPROACH_PAIR.search(text) and not _APPROACH_JOINED.search(text):
        return ""
    if "appel a froid" in text or "cold call" in text:
        return ""
    return (
        "\n\nAPPROCHE DEMANDÉE (consigne de ce tour) : la demande porte sur un message, un mail ou un discours "
        "écrit — tu le PRÉPARES MAINTENANT, dans cette même réponse, avec l'outil qui correspond au canal "
        "(`prepare_message_for_contact` pour un message à un contact du dossier, `prepare_mail_draft` sinon) ; "
        "tu n'écris jamais un script en texte libre à leur place. Tu ne termines JAMAIS ta réponse par une "
        "offre du type « je peux maintenant préparer un message » ou « veux-tu que je prépare un message » : si "
        "l'approche a été demandée, elle est déjà préparée dans cette réponse, pas promise pour la suivante. "
        "Retrouve d'abord le contact visé (la liste du dossier, sinon `search_workspace_contacts`) ; sans "
        "contact identifiable, tu le dis et tu proposes la voie pour en trouver un — tu n'improvises jamais un "
        "nom. Si l'outil de préparation échoue ou ne peut pas tourner (contact introuvable, coordonnée absente), "
        "tu NOMMES le blocage précis ET tu livres quand même le texte de l'approche dans cette réponse, "
        "présenté comme brouillon non enregistré, adressé au rôle visé : tu ne clos jamais sur « rien n'est "
        "préparé » ni sur « je pourrai poursuivre au prochain tour ». L'enrichissement et l'envoi gardent leurs propres validations : préparer le message n'envoie rien, "
        "et tu ne dis jamais qu'un message est parti par la seule préparation. "
        # #3894.1 (recette prod 14/10, Renault) — « prépare un message pour Glauco Gomes et Adrien
        # Weber » rendait deux brouillons COLLÉS DANS LE TEXTE et une seule carte Contacts : l'outil
        # n'était appelé qu'une fois, ou pas du tout, pour deux destinataires nommés.
        "PLUSIEURS DESTINATAIRES NOMMÉS : si la demande nomme plusieurs destinataires (« pour X et Y »), "
        "CHAQUE destinataire reçoit sa PROPRE carte de message — appelle `prepare_message_for_contact` une "
        "fois PAR destinataire nommé (ou avec `contact_ids` et `explicit_multi_contact` si l'outil le permet "
        "pour ce canal), jamais une seule fois pour n'en couvrir qu'un. Tu ne rends jamais les deux brouillons "
        "comme du texte de réponse à la place des cartes, et tu ne rends jamais une carte `contact_list` "
        "(« Contacts ») à la place d'une carte de message quand une préparation a été demandée. "
        # #3869 (recette prod 13/10, Sanofi) — demande COMPOSÉE (« trouve les décideurs A et B puis prépare-leur
        # une approche ») : la recherche payante d'un des profils ne retarde jamais le brouillon des autres.
        "DEMANDE COMPOSÉE : si la demande enchaîne une recherche de contacts et l'approche, tu prépares dans CE "
        "tour un brouillon pour les décideurs DÉJÀ connus du dossier (retrouvés sans frais), et tu n'attends pas "
        "le résultat d'une recherche payante pour le faire. Une recherche payante pour un profil encore inconnu "
        "reste une proposition (préparée, non exécutée) : tu ne débites jamais sans geste de la "
        "personne, et le brouillon des profils à venir se fera une fois ces contacts trouvés. Un contact connu "
        "par son prénom seul est dit « prénom seul, nom à confirmer » dans le brouillon : tu ne complètes jamais "
        "un nom de mémoire. Tu ne clos jamais sur la seule liste des contacts et la proposition de recherche. "
        # #4060 / #3894 (recette R26, 15/10) — le brouillon n'affirme que ce qui est sourcé.
        "RIEN SANS SOURCE DANS LE BROUILLON : tu n'affirmes ni ne sous-entends jamais un sujet, un besoin ou une "
        "hypothèse (« il y a probablement un deuxième sujet », « sans doute un autre projet ») sans un fait "
        "sourcé lu dans ce tour ; sans fait, la phrase n'est pas écrite. Tu ne cites un consultant ou une "
        "mission que s'ils ressortent d'une lecture de CE tour et restent cohérents avec les autres lectures : "
        "si les missions n'ont pas pu être lues (ou sont dites « non vérifiées » dans la même réponse), tu ne "
        "cites AUCUN consultant ni mission — même lecture, même verdict, jamais deux versions dans une réponse. "
        + PROVEN_EXCHANGE_RULE
    )


# #3869.1 — recette prod 14/10 (Renault, R4a) : « décideurs achats puis approche » nommait
# Glauco Gomes (Head of IT) comme « pas un décideur achats », sans nom inventé — correct — mais
# ne proposait AUCUNE carte de recherche de personnes. `function_not_found` ne se pose que quand
# `get_account_contacts` a reçu un `function` et que le résultat est VIDE (#2533) : un rôle
# identifié soi-même par lecture du titre (Head of IT ≠ achats), sur une liste non vide, ne porte
# aucun signal structurel — seule une consigne de ce tour peut le couvrir.
_BUYING_ROLE_SEARCH_RE = re.compile(
    r"\bacheteurs?\b|\bprocurement\b|\bpurchasing\b"
    r"|\b(?:decideurs?|responsables?|directeurs?|contacts?)\b[^.?!]{0,30}\bachats?\b"
    r"|\bachats?\b[^.?!]{0,30}\b(?:decideurs?|responsables?|directeurs?)\b",
    re.IGNORECASE,
)


# #3869 (recette R20 15/10) — une réponse COURTE à une question de périmètre (« RENAULT SAS ») ne porte plus
# la demande d'origine. On relit le dernier message utilisateur du fil, uniquement pour une réponse brève
# qui suit une question de Laura : une vraie nouvelle question ne reprend jamais l'ancienne demande.
_SCOPE_ANSWER_MAX_CHARS = 60


def thread_aware_request(message: str, history: list[dict] | None) -> str:
    if len((message or "").strip()) > _SCOPE_ANSWER_MAX_CHARS or not history:
        return message
    last_assistant = next((turn for turn in reversed(history) if turn.get("role") == "assistant"), None)
    if not last_assistant or "?" not in str(last_assistant.get("content") or ""):
        return message
    last_user = next((turn for turn in reversed(history) if turn.get("role") == "user"), None)
    original = str((last_user or {}).get("content") or "").strip()
    return f"{original} {message}" if original else message


def decision_maker_search_turn_block(message: str) -> str:
    """#3869.1 — une demande de décideur ACHATS (comité d'achat) qui ne trouve personne du bon
    rôle ne se clôt jamais sur une offre en texte seul : la carte `propose_people_search`
    remplace la phrase."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    if not _BUYING_ROLE_SEARCH_RE.search(text):
        return ""
    return (
        "\n\nRECHERCHE D'UN DÉCIDEUR ACHATS (consigne de ce tour) : la demande porte sur un rôle du comité "
        "d'achat (achats, procurement). Tu LIS D'ABORD la base : les contacts du compte qui ont ce rôle (lecture "
        "base, aucun appel payant) sont cités en carte de personnes AVANT toute autre phrase, puis la recherche "
        "élargie est proposée en ACTION (carte), jamais en phrase seule. Si aucun contact déjà connu ne correspond à CE rôle — absent "
        "(`function_not_found`) OU présent mais sur une AUTRE fonction (IT, technique, direction générale…) "
        "que tu identifies toi-même en lisant les titres rendus — tu le DIS explicitement (jamais un contact "
        "d'une autre fonction présenté comme le décideur achats, jamais un nom inventé), ET tu appelles "
        "`propose_people_search` pour ce rôle dans CETTE réponse : tu ne clos JAMAIS sur une offre en texte "
        "seul (« je peux chercher ailleurs », « veux-tu que je lance une recherche ? ») — la carte remplace "
        "la phrase, elle ne débite rien sans un geste de la personne."
    )


# #4055 (recette R20 15/10) — « Complète SERVIER SAS » : 10 contacts sourcés sur 1 212 détectés, puis
# « le CRM n'a pas répondu » SANS la séparation base / hors base / à rapprocher. La description de
# `get_account_contacts` la demandait déjà, mais seule une consigne de TOUR la tient quand le CRM se tait.
_COMPLETE_ACCOUNT_RE = re.compile(
    r"\b(?:complete|completer|completez)\b(?!\s+(?:ce\s+)?(?:message|mail|texte|phrase))", re.IGNORECASE
)


def account_completion_turn_block(message: str) -> str:
    """#4055 — « complète ce compte » sépare TOUJOURS trois niveaux, CRM répondant ou non."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    if not _COMPLETE_ACCOUNT_RE.search(text):
        return ""
    return (
        "\n\nCOMPLÉTER UN COMPTE (consigne de ce tour) : la réponse sépare TOUJOURS trois niveaux, chacun "
        "avec sa provenance : (1) « déjà dans la base » — les contacts du compte lus en base ; (2) « hors "
        "base » — les personnes détectées ailleurs (base commune, sièges d'achat attendus) et les branches "
        "d'organigramme, jamais présentées comme des contacts connus ; (3) « à rapprocher » — une personne "
        "qui ressemble à un contact ou à une fiche existante (même e-mail, nom inversé, initiale + nom), "
        "proposée à confirmer, jamais fusionnée. Un niveau sans ligne ne s'écrit pas (jamais « 0 »). Quand "
        "le CRM connecté ne répond pas, tu le DIS en une phrase (« le CRM connecté n'a pas répondu : ce qu'il "
        "connaît n'est pas croisé ») ET tu livres quand même les niveaux base / hors base — l'absence de "
        "réponse du CRM ne bloque jamais la séparation et ne vaut jamais « aucun autre contact ». Une "
        "recherche partielle ne conclut jamais à l'exhaustivité. "
        # #4055 (recette R26) — « ce qui me manque » ne se limite pas aux contacts.
        "« Ce qui manque » couvre AUSSI les SIGNAUX et les BESOINS du compte, pas seulement les contacts : "
        "lis `get_account_signals` (signaux datés non périmés) et `find_needs` (besoins ouverts, puis "
        "`include_closed` pour l'historique) dans ce même tour, et nomme ce qui manque dans chaque famille "
        "(contacts, signaux, besoins) — une famille lue et vide se dit « rien de daté / aucun besoin "
        "enregistré », une famille non lue (outil en erreur) se dit « non lue », jamais « 0 »."
    )


# #3889 (recette R26, 15/10) — « Chez Servier, distingue besoins ouverts, anciens besoins et missions en
# cours » répondait « missions non vérifiées » et « aucun document » SANS avoir lu les besoins ni les missions.
_ACCOUNT_PROJECTS_RE = re.compile(
    r"(?=.*\bbesoins?\s+ouverts?\b)(?=.*(?:\banciens?\s+besoins?\b|\bmissions?\s+en\s+cours\b))", re.DOTALL
)


def account_projects_turn_block(message: str) -> str:
    """#3889 — besoins ouverts / anciens besoins / missions en cours d'un compte : TOUTES les lectures
    existantes avant la réponse, jamais « non vérifié » sans lecture tentée."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    if not _ACCOUNT_PROJECTS_RE.search(text):
        return ""
    return (
        "\n\nPROJETS D'UN COMPTE (consigne de ce tour) : la demande distingue besoins ouverts, anciens besoins "
        "et missions en cours. Tu LIS d'abord, dans ce tour, AVANT toute phrase : (1) UN SEUL appel `find_needs` avec "
        "`account_id` (résolu par `search_workspace_accounts`) ET `include_closed` : il rend en un passage "
        "`account_overview` — besoins ouverts, anciens besoins, missions en cours (et terminées), chacune avec son "
        "`read` ; une rubrique `read: true` et `count: 0` est LUE et vide, tu le dis comme un fait ; (2) `search_document_projects` (ce que les documents de l'espace disent, séparé "
        "des besoins enregistrés) ; (3) les missions du compte sont DÉJÀ dans `account_overview` (consultants positionnés, "
        "mission, début, fin — « en cours » = démarrée, fin absente ou à venir ; démarrage futur = « à venir », rubrique `missions_upcoming`, jamais « en cours ») : n'appelle pas un autre outil pour elles. Trois rubriques, chacune "
        "avec sa provenance. « Non vérifié » ne s'écrit QUE pour une lecture réellement tentée qui a échoué "
        "(outil en erreur, pont muet), nommée comme telle ; une lecture réussie et vide se dit « aucun "
        "enregistré », jamais « non vérifié ». Les documents ne remplacent pas les enregistrements : « aucun "
        "document ne parle de X » ne dit rien des besoins et missions enregistrés."
    )


# #3894 (recette R26) — « relance pour les 2 derniers contacts que j'ai vus chez EDF » : relances en texte,
# sur les 2 premiers de la liste, avec un « Suite à notre échange » non prouvé.
_RECENT_FOLLOW_UP_RE = re.compile(
    r"\brelanc\w*\b.*\b(?:\d+|deux|trois|quatre|cinq|les)\s+derniers?\s+contacts?\b", re.DOTALL
)


def asks_recent_contacts_follow_up(message: str) -> bool:
    """#4287.14 — vrai quand le message demande LUI-MÊME la relance de N contacts triés (« relance les 2
    derniers contacts ») : l'audience est nommée par le tri et la relance EST la raison. Lu par l'outil
    de préparation, jamais déduit du modèle."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    return bool(_RECENT_FOLLOW_UP_RE.search(text))


def recent_contacts_follow_up_turn_block(message: str) -> str:
    """#3894 — « les N derniers contacts vus » : le tri par date de dernière interaction, une carte par
    destinataire, aucune formule d'échange sans interaction tracée."""
    text = unicodedata.normalize("NFKD", message or "").encode("ascii", "ignore").decode().lower()
    if not _RECENT_FOLLOW_UP_RE.search(text):
        return ""
    return (
        "\n\nRELANCE DES DERNIERS CONTACTS VUS (consigne de ce tour) : « les N derniers contacts vus » = les N "
        "PLUS RÉCENTS par date de dernière interaction ou consultation, jamais les N PREMIERS de la liste "
        "rendue par l'outil. #4287.11 : SANS compte nommé, appelle `search_workspace_contacts` avec "
        "`recent_first` à true et `limit` = N (le tri par date est fait côté serveur, chaque contact porte "
        "`last_action_at`) ; ne réponds JAMAIS « je ne peux pas identifier les plus récents » avant cet appel. "
        "Si l'outil ne rend aucune interaction datée, dis-le précisément et propose de nommer les contacts. Lis la date de dernière interaction de chaque contact (historique du compte, "
        "messagerie, agenda), TRIE du plus récent au plus ancien, prends les N premiers APRÈS ce tri et dis "
        "la date retenue pour chacun ; à défaut de toute interaction datée, la dernière ouverture de fiche "
        "départage (dernière ouverture de fiche, nommée comme telle). Sans date lisible pour un contact, il ne passe pas devant un contact daté "
        "et tu le dis. Rends UNE carte `contact_list` avec les N contacts retenus (jamais un seul), chacun avec sa "
        "date et son `follow_up` quand une trace existe. CHAQUE destinataire reçoit sa propre relance : les N "
        "sont NOMMÉS par le tri, donc l'audience est explicite — un appel `prepare_message_for_contact` avec "
        "`contact_ids` (une carte PAR destinataire), jamais un seul contact, jamais deux brouillons collés dans "
        "le texte. Canal : l'e-mail quand l'adresse du contact est connue, et tu ne redemande JAMAIS le canal "
        "(omets `channel`) ; la question ne se pose que pour une adresse manquante. "
        + PROVEN_EXCHANGE_RULE
        + " Préparer n'envoie rien."
    )
