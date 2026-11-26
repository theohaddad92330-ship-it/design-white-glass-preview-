"""#2321 — CE QUE LE SERVEUR A COMPRIS DE LA DEMANDE, dit au modèle.

Le routeur d'intention (``app/services/compilers/intent_router.py``) décide de
quoi parle la demande. Sans ce bloc, il décidait dans le vide : la route était
calculée, journalisée, et le modèle continuait de choisir ses outils tout seul.
C'est ici que la route devient un COMPORTEMENT.

⚠️ Vide = chaîne vide = **prompt byte-identique** à celui d'avant. Une demande
non routée n'ajoute RIEN : on ne raconte pas au modèle une intention qu'on n'a
pas su lire. Le bloc s'ajoute en QUEUE du prompt système, dans la zone volatile
— jamais au milieu des règles invariantes du cache (GA-293).

Ce que le bloc dit, et ce qu'il ne dit jamais
----------------------------------------------
* Il nomme des OUTILS, jamais un nom de page (#2321.17). « Va dans Vivier » est
  exactement la réponse que le ticket refuse ; un outil rend une carte, un nom
  de page laisse la personne se débrouiller.
* Il n'ordonne pas d'ENVOYER quoi que ce soit. Le copilote prépare, le
  commercial envoie — la dernière étape s'appelle « préparer ».
* Une route ``hypothese`` est présentée COMME une hypothèse, avec le motif qui
  l'a déclenchée (arbitrage Louis 18/09/2026). Le modèle garde le droit de
  suivre la demande si elle dit clairement autre chose : un routeur
  déterministe se trompe, et une consigne rigide transformerait son erreur en
  mur. Les deux NO-GO du ticket, eux, ne se négocient pas.
* Une capacité ABSENTE se DIT. Laura ne promet pas ce que le produit n'a pas :
  elle le signale par l'outil silencieux existant (``note_unrouted_request``,
  catégorie ``capacite_absente``), qui alimente le back-office produit.

FR et EN : le bloc suit la langue de l'interface, comme le reste du prompt
(#1958.8). Une consigne française dans un prompt anglais se lit telle quelle et
fait répondre le modèle en français.
"""

from __future__ import annotations

from app.services.compilers.intent_router import (
    UNDECLARED_CHAT_INTENT,
    ChatIntentRoute,
    asks_about_company_archetype,
    asks_for_a_long_read,
    asks_for_internal_only_scope,
    asks_for_public_news,
    asks_to_discover_needs,
    asks_to_prepare_a_message,
    asks_to_qualify_a_named_account,
)

_HEADERS = {
    "fr": "CE QUE LE SERVEUR A COMPRIS DE LA DEMANDE (lecture déterministe, pas un jugement du modèle) :",
    "en": "WHAT THE SERVER UNDERSTOOD OF THE REQUEST (deterministic reading, not a model judgement):",
}

_LABELS = {
    "fr": {
        "intent": "Intention",
        "hypothesis": "hypothèse, déclenchée par le marqueur",
        "result": "Résultat attendu",
        "object": "Objet concerné",
        "tools": "Outils à préférer",
        "steps": "Étapes, DANS CET ORDRE",
        "optional": "Facultatif (jamais lancé sans que la personne le demande)",
        "missing": "Données qui manquent pour aboutir",
        "gap": "Capacité absente du produit",
    },
    "en": {
        "intent": "Intent",
        "hypothesis": "hypothesis, triggered by the marker",
        "result": "Expected result",
        "object": "Object concerned",
        "tools": "Tools to prefer",
        "steps": "Steps, IN THIS ORDER",
        "optional": "Optional (never started unless the person asks)",
        "missing": "Data still missing to complete",
        "gap": "Capability the product does not have",
    },
}

#: La règle qui accompagne toute route. Elle dit au modèle d'où vient cette
#: lecture et ce qu'il a le droit d'en faire.
_RULES = {
    "fr": (
        "Cette lecture vient d'un routeur déterministe, pas du modèle : suis-la quand elle "
        "colle à la demande, et écarte-la si la personne dit clairement autre chose — dans ce "
        "cas, dis-le en une ligne. Nomme toujours l'ACTION que tu lances, jamais le nom d'un "
        "écran où la personne devrait se rendre toute seule. Tu PRÉPARES ce qui part vers "
        "quelqu'un ; tu ne l'envoies jamais."
    ),
    "en": (
        "This reading comes from a deterministic router, not from the model: follow it when it "
        "fits the request, and set it aside if the person clearly says otherwise — in which "
        "case say so in one line. Always name the ACTION you are running, never the name of a "
        "screen the person would have to find on their own. You PREPARE anything that goes to "
        "someone; you never send it."
    ),
}

#: #2321.19 — la phrase qui interdit le saut d'étape. Elle n'apparaît que
#: lorsqu'il y a PLUSIEURS étapes : sur une étape unique, elle n'aurait rien à
#: interdire et alourdirait le prompt pour rien.
_NO_SKIP = {
    "fr": (
        "Ne saute aucune de ces étapes et ne commence pas par la dernière : chacune produit ce "
        "dont la suivante a besoin. Si la personne demande directement le message, fais quand "
        "même les étapes qui le précèdent, puis prépare-le."
    ),
    "en": (
        "Do not skip any of these steps and do not start with the last one: each produces what "
        "the next one needs. If the person asks straight for the message, still run the steps "
        "before it, then prepare it."
    ),
}

#: #2321 — ce qu'on fait d'une capacité absente : on la SIGNALE, on ne la promet
#: pas. L'outil et la catégorie existent déjà (#1949.23).
_CAPABILITY_GAP = {
    "fr": (
        "Cette capacité n'existe pas encore dans le produit. Ne promets pas de le faire et "
        "n'invente aucun outil : dis en une phrase ce qui n'est pas possible aujourd'hui, fais "
        "ce que tu PEUX faire d'utile autour, et signale la demande avec "
        "`note_unrouted_request` (catégorie `capacite_absente`)."
    ),
    "en": (
        "This capability does not exist in the product yet. Do not promise it and do not invent "
        "a tool: say in one sentence what is not possible today, do whatever useful thing you "
        "CAN do around it, and flag the request with `note_unrouted_request` (category "
        "`capacite_absente`)."
    ),
}

#: #2321.22 — LE NO-GO EXPLICITE DU TICKET, et le seul endroit du bloc qui ne se
#: négocie pas. « À qui vendre ce consultant ? » n'est pas un matching.
_REVERSE_MARKET = {
    "fr": (
        "⚠️ La demande porte sur les comptes où POSITIONNER ce profil : c'est un marché "
        "inverse, pas un matching sur un besoin existant. Appelle find_accounts_for_talent "
        "avec le consultant nommé (#3816) : il rend les comptes et leur raison, dans le fil. "
        "Appelle-le sans poser de question : sa fiche suffit (#4421). "
        "Introuvable ou homonymes : dis-le et propose les homonymes, ne choisis pas à sa place. "
        "Ne réponds pas par une simple liste de correspondances, et n'envoie rien : tu prépares."
    ),
    "en": (
        "⚠️ The request is about the accounts where this profile could be PLACED: that is a "
        "reverse market, not a match against an existing need. Call find_accounts_for_talent "
        "with the named consultant (#3816): it returns the accounts and their reason, in the thread. "
        "Call it without asking anything: the profile is enough (#4421). "
        "Not found or namesakes: say so and offer the namesakes, never pick for the user. "
        "Do not answer with a plain list of matches, and send nothing: you prepare."
    ),
}


#: #2679 — recette prod du 23/09 : routée ou non, une demande de comptes
#: recevait « Tu veux dire : » suivi d'options en markdown INERTE. Sur une route
#: outillée, la précision qui cadre l'outil se rend cliquable, dans ce tour.
_CLICKABLE_PRECISION = {
    "fr": (
        "Si une précision change le résultat de ces outils, pose-la dans ton texte ET appelle "
        "`offer_reply_options` dans ce même tour avec ses réponses possibles. Jamais une liste "
        "de choix numérotée ou à puces écrite en texte : elle ne se clique pas."
    ),
    "en": (
        "If a precision changes what these tools return, ask it in your text AND call "
        "`offer_reply_options` in this same turn with its possible answers. Never a numbered or "
        "bulleted list of choices written as text: it cannot be clicked."
    ),
}

#: #2721 / #2678 — la consigne d'une question d'ACTUALITÉ PUBLIQUE. Recette prod
#: du 23/09 : « les dernières levées de fonds de la French Tech » recevait une
#: réponse de mémoire, panneau sources vide — l'outil était exposé, rien ne
#: l'y envoyait.
_PUBLIC_NEWS = {
    "fr": (
        "\n\nACTUALITÉ PUBLIQUE (lecture déterministe de la demande) : elle porte sur des faits "
        "récents et publics. Appelle `web_search` AVANT de répondre — en plus des outils du "
        "portefeuille s'ils couvrent une partie de la question —, et cite l'adresse de chaque "
        "fait que tu en tires en lien markdown cliquable : [Nom du site](adresse) — l'adresse "
        "RÉELLE que `web_search` t'a rendue, jamais un domaine deviné. Une question sur une levée "
        "de fonds (stade — pre-seed, seed, série A… —, montant, date) : donne le stade, le "
        "montant et la date de CHAQUE levée quand la source les publie, jamais un chiffre que la "
        "source ne donne pas. Tu ne réponds jamais de mémoire à une question d'actualité. Aucun "
        "résultat, ou recherche en échec : dis-le, n'invente rien."
    ),
    "en": (
        "\n\nPUBLIC NEWS (deterministic reading of the request): it is about recent, public "
        "facts. Call `web_search` BEFORE answering — on top of the portfolio tools if they cover "
        "part of the question — and cite the address of every fact you take from it as a "
        "clickable markdown link: [Site name](address) — the REAL address `web_search` gave you, "
        "never a guessed domain. A question about a funding round (stage — pre-seed, seed, "
        "series A… —, amount, date): give the stage, amount and date of EACH round when the "
        "source publishes them, never a figure the source doesn't give. Never answer a news "
        "question from memory. No result, or a failed search: say so, invent nothing."
    ),
}


def public_news_block(message: str, language: str | None = "fr") -> str:
    """#2721 — la consigne `web_search`, ou ``""`` quand la demande ne porte
    sur aucune actualité publique (prompt byte-identique à celui d'avant)."""
    if not asks_for_public_news(message):
        return ""
    return _PUBLIC_NEWS[_lang(language)]


#: #2679 (famille) — recette prod du 23/09/2026 (sha servi 4a4e9e07d) : sans
#: compte actif, « Prépare-moi un message pour relancer » recevait une
#: précision de CANAL en markdown INERTE. La relance n'est l'intention de
#: personne dans `CHAT_INTENT_ROUTING_TABLE` (aucune des dix), donc
#: `intent_route_block` restait vide et rien ne pointait le modèle vers
#: `offer_reply_options` au moment où il choisit entre mail, LinkedIn et
#: téléphone.
_MESSAGE_PRECISION = {
    "fr": (
        "\n\nPRÉPARATION DE MESSAGE (lecture déterministe de la demande) : la demande porte sur "
        "un message à préparer pour un contact — une relance, une approche. Le contact et le "
        "canal (mail, réseau professionnel ou appel) changent le message du tout au tout : si "
        "l'un des deux n'est pas déjà certain, pose la précision dans ton texte ET appelle "
        "`offer_reply_options` dans ce même tour avec ses réponses possibles. Jamais une liste de "
        "choix numérotée ou à puces écrite en texte : elle ne se clique pas."
    ),
    "en": (
        "\n\nPREPARING A MESSAGE (deterministic reading of the request): the request is about "
        "preparing a message for a contact — a follow-up, an approach. The contact and the "
        "channel (email, professional network or phone call) change the message entirely: if "
        "either one is not already certain, ask it in your text AND call `offer_reply_options` in "
        "this same turn with its possible answers. Never a numbered or bulleted list of choices "
        "written as text: it cannot be clicked."
    ),
}


def message_prep_block(message: str, language: str | None = "fr") -> str:
    """#2679 (famille) — la consigne `offer_reply_options` pour une relance ou
    une approche, ou ``""`` quand la demande ne porte sur aucun message à
    préparer (prompt byte-identique à celui d'avant)."""
    if not asks_to_prepare_a_message(message):
        return ""
    return _MESSAGE_PRECISION[_lang(language)]


#: #2434.51 — recette prod du 25/09/2026 : « Lis-moi tout mon pipeline »
#: recevait tout le texte agrégé (18 projets / 5 étapes), jamais un résumé ni
#: une proposition d'afficher le détail à l'écran — surtout gênant en mode
#: vocal (`ListenReply` lit ensuite ce texte intégralement à voix haute).
_LONG_READ = {
    "fr": (
        "\n\nLECTURE INTÉGRALE DEMANDÉE (lecture déterministe de la demande) : la personne demande "
        "de tout lire ou de tout raconter en une fois, sur un ensemble qui peut être long (le pipe, "
        "une journée, un portefeuille…). Ne récite jamais l'intégralité en texte, surtout à l'oral : "
        "résume en deux ou trois phrases ce qu'il y a d'essentiel à en retenir, puis propose "
        "d'afficher le détail à l'écran plutôt que de continuer à tout lire. Une demande explicite "
        "de détail dans le message du moment (« donne-moi le détail », « liste-les toutes ») l'emporte "
        "sur cette consigne."
    ),
    "en": (
        "\n\nFULL READOUT REQUESTED (deterministic reading of the request): the person is asking to "
        "have everything read or told at once, over a set that can be long (the pipe, a day, a "
        "portfolio…). Never recite the whole thing as text, especially when spoken aloud: summarise "
        "the essentials in two or three sentences, then offer to show the detail on screen instead of "
        'continuing to read everything. An explicit request for detail in the current message ("give '
        'me the detail", "list them all") overrides this instruction.'
    ),
}


def long_read_block(message: str, language: str | None = "fr") -> str:
    """#2434.51 — la consigne de résumé court + détail à l'écran, ou ``""``
    quand la demande ne porte sur aucune lecture intégrale (prompt
    byte-identique à celui d'avant ce lot)."""
    if not asks_for_a_long_read(message):
        return ""
    return _LONG_READ[_lang(language)]


#: #3176 (LAU-FINAL-182) — la consigne du mode INTERNAL_ONLY : interdire une
#: NOUVELLE recherche web ce tour, pointer vers les outils internes réels
#: (`search_market_memory`, `find_accounts`) et le contexte workspace déjà
#: injecté dans ce prompt, et fermer le NO-GO du ticket — ne jamais conclure
#: à une absence de connaissance sans avoir essayé ces outils.
_INTERNAL_ONLY = {
    "fr": (
        "\n\nPÉRIMÈTRE INTERNE UNIQUEMENT (lecture déterministe de la demande) : la personne "
        "demande explicitement de NE PAS aller chercher sur le web ce tour. N'appelle pas "
        "`web_search`. Utilise le contexte workspace déjà fourni plus haut dans ce prompt "
        "(profil, portefeuille, CRM, mémoire du fil), et appelle `search_market_memory` et "
        "`find_accounts` avant de conclure quoi que ce soit — une absence dans le message "
        "courant ne signifie pas que Bellum ne connaît pas la donnée. Si une couche interne "
        "est indisponible, dis-le nommément ; ne conclus jamais que tu ne sais rien sans "
        "avoir essayé ces outils."
    ),
    "en": (
        "\n\nINTERNAL SCOPE ONLY (deterministic reading of the request): the person explicitly "
        "asked NOT to go search the web this turn. Do not call `web_search`. Use the workspace "
        "context already provided earlier in this prompt (profile, portfolio, CRM, thread "
        "memory), and call `search_market_memory` and `find_accounts` before concluding "
        "anything — an absence from the current message does not mean Bellum does not know the "
        "data. If an internal layer is unavailable, name it explicitly; never conclude you know "
        "nothing without having tried these tools."
    ),
}


def internal_only_block(message: str, language: str | None = "fr") -> str:
    """#3176 — la consigne du mode INTERNAL_ONLY, ou ``""`` quand la demande ne
    porte sur aucun périmètre interne seul (prompt byte-identique à celui
    d'avant ce lot)."""
    if not asks_for_internal_only_scope(message):
        return ""
    return _INTERNAL_ONLY[_lang(language)]


#: #3175 (LAU-FINAL-181) — la RECETTE du ticket : une question littérale sur
#: UN compte nommé n'aide pas à décider quoi faire si Laura s'arrête à sa
#: réponse ponctuelle. Ce bloc liste les dimensions que le ticket nomme
#: explicitement, jamais une probabilité ni un score chiffré (doctrine :
#: aucune chance de closing affichée) — des questions à vérifier avec les
#: outils déjà disponibles, pas un jugement inventé.
_ACCOUNT_QUALIFICATION_WIDENING = {
    "fr": (
        "\n\nQUALIFICATION D'UN COMPTE (lecture déterministe de la demande) : la question porte "
        "littéralement sur un fait ponctuel, mais la décision commerciale sous-jacente est plus "
        "large. Avant de répondre seulement à la question posée, et AVANT toute proposition de "
        "prospecter ce compte, appelle `get_account_suitability_verdict` sur ce compte et vérifie "
        "aussi avec les outils disponibles ce que tu peux sur : l'adéquation avec l'activité de "
        "l'ESN ; les références bancaires existantes ; les relations déjà présentes dans le "
        "workspace ; les anciens consultants passés par ce groupe ; les partenaires ou ESN "
        "référencées pouvant servir de voie d'accès ; les barrières achats ; les entités plus "
        "accessibles dans le même groupe ; le coût d'opportunité par rapport à d'autres comptes. Si "
        "le verdict est `NOT_EVALUABLE` (aucune analyse disponible pour ce compte), dis-le "
        "nommément — ne transforme jamais silencieusement ce compte en cible à prospecter faute de "
        "donnée. Si le verdict est `NO_GO_NOW`, `GO_AFTER_PROOF`, `GO_VIA_PARTNER` ou `WATCH`, "
        "dis-le avant toute proposition de prospection, avec ses raisons dominantes. Réponds à la "
        "question posée, puis ajoute ce que ces dimensions changent pour la décision — jamais un "
        "chiffre de chance de closing : nomme ce que tu as trouvé, et nomme ce que tu n'as pas pu "
        "vérifier."
    ),
    "en": (
        "\n\nACCOUNT QUALIFICATION (deterministic reading of the request): the question is "
        "literally about one point in time, but the underlying commercial decision is broader. "
        "Before answering only the question asked, and before any proposal to prospect this "
        "account, call `get_account_suitability_verdict` on this account and also check with the "
        "tools available what you can on: fit with the ESN's activity; existing bank references; "
        "relations already present in the workspace; past consultants who went through this group; "
        "partners or referenced ESNs that could serve as an access path; procurement barriers; more "
        "accessible entities within the same group; opportunity cost against other accounts. If the "
        "verdict is `NOT_EVALUABLE` (no analysis available for this account yet), say so explicitly "
        "— never silently turn this account into a prospecting target for lack of data. If the "
        "verdict is `NO_GO_NOW`, `GO_AFTER_PROOF`, `GO_VIA_PARTNER` or `WATCH`, say so before any "
        "prospecting proposal, with its dominant reasons. Answer the question asked, then add what "
        "these dimensions change for the decision — never a probability or a percentage chance: "
        "name what you found, and name what you could not check."
    ),
}


def account_qualification_widening_block(message: str, language: str | None = "fr") -> str:
    """#3175 — la consigne d'élargissement d'une qualification de compte, ou
    ``""`` quand la demande ne porte sur aucun compte nommé (prompt
    byte-identique à celui d'avant ce lot)."""
    if not asks_to_qualify_a_named_account(message):
        return ""
    return _ACCOUNT_QUALIFICATION_WIDENING[_lang(language)]


#: #3864.1 (BEL-LAU-1008-013, recette bêta 08/10) — « trouve-moi des besoins »
#: doit lancer une recherche RÉELLE, jamais une explication des limites du
#: produit ni une lecture exclusive des besoins déjà enregistrés. Les CINQ
#: distinctions nommées sont celles du ticket : le routeur ne les calcule pas
#: (il n'y a qu'un seul outil, `find_needs`), donc ce bloc les nomme comme
#: consigne de LECTURE des résultats — jamais un second moteur de
#: classification.
_NEED_DISCOVERY = {
    "fr": (
        "\n\nRECHERCHE DE BESOINS (lecture déterministe de la demande) : la personne veut une "
        "recherche, pas une leçon sur les limites du produit. Appelle `find_needs` en réutilisant "
        "les expertises, zones et contraintes déjà connues du workspace ou du fil — ne redemande "
        "que ce qui manque RÉELLEMENT pour orienter la recherche. En lisant les résultats, "
        "distingue : une demande de prestation documentée ; un besoin à qualifier ; un recrutement "
        "salarié (ne le présente jamais comme une mission de régie) ; un signal de projet encore "
        "sans besoin ouvert ; une compatibilité historique (profils déjà positionnés sur un compte "
        "proche) — `contract_kind` et `next_action` de chaque ligne te le disent, ne les devine "
        "jamais. Si le premier appel rend une liste vide, NE CONCLUS PAS tout de suite : retire ou "
        "élargis un critère (zone, compétence précise) et relance avant de répondre qu'il n'y a "
        "rien. N'invente aucun besoin pour atteindre un nombre demandé : si l'absence se confirme "
        "dans ce que tu peux chercher, dis-le EN TEXTE et propose la stratégie de qualification "
        "(quoi vérifier, par quelle voie) — jamais une carte vide. Au moins un besoin trouvé : rends "
        "CHAQUE résultat dans la carte `file_export` que `find_needs` te demande déjà (une ligne par "
        "besoin) — jamais une liste à puces, jamais un paragraphe qui les cite en texte. "
        "Un ÉCHEC d'appel (le pont ne répond pas, erreur réseau) n'est PAS une absence confirmée : "
        "retente une fois, en élargissant un critère, avant de conclure. Si la lecture reste "
        "impossible ce tour, ne dis JAMAIS seulement « la recherche n'a pas abouti » ni « reprendre "
        "la recherche » sans plus — nomme ce que tu as RÉELLEMENT cherché (expertises, zones, "
        "contraintes) et propose la MÊME stratégie de qualification que pour une absence confirmée : "
        "l'échec de lecture n'excuse jamais un simple renvoi à plus tard."
    ),
    "en": (
        "\n\nNEED DISCOVERY (deterministic reading of the request): the person wants a search, not "
        "a lecture on the product's limits. Call `find_needs`, reusing the expertise, zones and "
        "constraints already known from the workspace or the thread — only ask again for what is "
        "genuinely missing to steer the search. When reading results, distinguish: a documented "
        "service request; a need still to be qualified; a permanent hire (never present it as a "
        "staffing mission); a project signal with no open need yet; historical compatibility "
        "(profiles already placed on a close account) — each row's `contract_kind` and "
        "`next_action` tell you this, never guess them. If the first call returns an empty list, "
        "do NOT conclude right away: drop or widen one criterion (zone, exact skill) and search "
        "again before saying there is nothing. Never invent a need to reach a requested count: if "
        "the absence holds across what you can search, say so IN TEXT and offer the qualification "
        "strategy (what to check, through which path) — never an empty card. At least one need "
        "found: render EVERY result in the `file_export` card `find_needs` already asks for (one "
        "row per need) — never a bullet list, never a paragraph that cites them as prose. "
        "A FAILED call (the bridge does not answer, a network error) is NOT a confirmed absence: "
        "retry once, widening a criterion, before concluding. If reading stays impossible this "
        "turn, NEVER say only \"the search did not succeed\" or \"resume the search\" with nothing "
        "more — name what you ACTUALLY searched (expertise, zones, constraints) and offer the SAME "
        "qualification strategy as for a confirmed absence: a failed read never excuses a bare "
        "deferral."
    ),
}


def need_discovery_block(message: str, language: str | None = "fr") -> str:
    """#3864.1 — la consigne de recherche de besoins, ou ``""`` quand la
    demande ne porte sur aucune recherche de besoins (prompt byte-identique à
    celui d'avant ce lot)."""
    if not asks_to_discover_needs(message):
        return ""
    return _NEED_DISCOVERY[_lang(language)]


def _lang(language: str | None) -> str:
    """Le français est le défaut du produit ; toute autre langue lit l'anglais."""
    return "fr" if (language or "fr").lower().startswith("fr") else "en"


def intent_route_block(route: ChatIntentRoute | None, language: str | None = "fr") -> str:
    """Le bloc à ajouter au prompt système, ou ``""``.

    ``""`` quand il n'y a pas de route, ou quand la demande n'a pas été routée :
    le prompt reste byte-identique à celui d'avant ce lot. On ne dit jamais au
    modèle une intention qu'on n'a pas su lire — ce serait exactement la donnée
    fictive que la doctrine interdit.
    """
    if route is None or route.intent == UNDECLARED_CHAT_INTENT:
        return ""

    lang = _lang(language)
    label = _LABELS[lang]
    lines: list[str] = [_HEADERS[lang]]

    intent_line = f"- {label['intent']} : {route.intent}"
    if route.confidence == "hypothese" and route.reasoning:
        # L'hypothèse est présentée COMME une hypothèse, avec son motif — jamais
        # comme une lecture établie.
        intent_line += f" ({label['hypothesis']} « {route.reasoning} »)"
    lines.append(intent_line)

    if route.expected_result:
        lines.append(f"- {label['result']} : {route.expected_result}")
    if route.canonical_object:
        lines.append(f"- {label['object']} : {route.canonical_object}")
    if route.tools:
        lines.append(f"- {label['tools']} : {', '.join(route.tools)}")
    if route.steps:
        lines.append(f"- {label['steps']} : {' → '.join(route.steps)}")
    # #2257.35 — le travail utile mais non nécessaire se NOMME, il ne se lance pas.
    if route.optional_steps:
        lines.append(f"- {label['optional']} : {', '.join(route.optional_steps)}")
    # « On n'affiche pas ce qu'on n'a pas » : une donnée manquante se NOMME,
    # elle ne devient pas une valeur vide ni un zéro.
    if route.missing_inputs:
        lines.append(f"- {label['missing']} : {', '.join(route.missing_inputs)}")
    if route.capability_gap and not route.tools:
        lines.append(f"- {label['gap']} : {route.capability_gap}")

    lines.append("")
    lines.append(_RULES[lang])
    if len(route.steps) > 1:
        lines.append(_NO_SKIP[lang])
    if route.capability_gap and not route.tools:
        lines.append(_CAPABILITY_GAP[lang])
    if route.expected_result == "marche_inverse":
        lines.append(_REVERSE_MARKET[lang])
    if route.tools:
        lines.append(_CLICKABLE_PRECISION[lang])

    return "\n\n" + "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# #3201 (LAU-FINAL-207) — CONSTRAINT CONSISTENCY RESOLVER.
#
# La détection des CONTRAINTES elles-mêmes (compatibles / réduisent fortement
# / contradictoires) reste le travail de Laura, dans son propre tour — un
# classifieur Python qui devinerait « ces deux critères se contredisent » sur
# du texte libre serait exactement la donnée fictive que la doctrine interdit.
# Ce que ce bloc fixe, c'est le COMPORTEMENT une fois la contradiction vue :
# ne jamais choisir en silence, toujours nommer ce qui change. La part
# vérifiable en code (le critère le PLUS restrictif, sur zéro résultat) est
# calculée par `app.services.constraint_consistency`, pas ici.
#
# Posé seulement quand la route déterministe dit que la demande cherche des
# comptes (`chercher_du_business`) : hors de ce cas, il n'y a pas de graphe de
# contraintes à lire. Vide ⇒ "" ⇒ prompt byte-identique à celui d'avant.
# ─────────────────────────────────────────────────────────────────────────────
_CONSTRAINT_CONSISTENCY = {
    "fr": (
        "\n\nCONTRAINTES COMBINÉES DE CETTE RECHERCHE : si les critères demandés restent compatibles, "
        "exécute normalement. S'ils réduisent FORTEMENT le marché sans être contradictoires, dis-le "
        "brièvement et continue avec ce que tu trouves — n'attends pas de validation pour un simple "
        "marché étroit. S'ils sont CONTRADICTOIRES (ex. « grands groupes » ET « sans barrière achats », "
        "« full remote » ET « présentiel imposé »), ne choisis JAMAIS l'un des deux en silence : calcule "
        "les deux variantes et rends les deux variantes déjà chiffrées, une ligne chacune, avec UNE ligne qui "
        "nomme l'arbitrage (#4438.4) ; UNE question d'arbitrage (outil ask_clarification : options cliquables, et "
        "dans `assumptions` ce que tu conserves, ex. « Je conserve tes secteurs. ») seulement si aucune des deux "
        "variantes ne peut se chercher. Sur zéro "
        "résultat, ne supprime jamais toutes les contraintes à la fois : identifie la plus restrictive, "
        "relance TOI-MÊME, dans le MÊME tour, UN second passage avec UN relâchement précis, dis ce que "
        "tu as élargi, sans demander de permission (#3343). N'enlève jamais une région, une exclusion ou une définition (« startup », « ESN ») "
        "sans le dire, et n'invente jamais un résultat pour remplir une liste."
    ),
    "en": (
        "\n\nCOMBINED CONSTRAINTS OF THIS SEARCH: if the requested criteria stay compatible, execute "
        "normally. If they narrow the market A LOT without being contradictory, say so briefly and "
        "continue with what you find — don't wait for validation over a simply narrow market. If they "
        'are CONTRADICTORY (e.g. "large groups" AND "no purchasing barrier", "full remote" AND '
        '"mandatory on-site"), never pick one silently: compute both variants and return both already-priced '
        "variants, one line each, with ONE line naming the trade-off (#4438.4); ask ONE arbitration question "
        '(ask_clarification tool: clickable options, and in `assumptions` what you keep, e.g. "I keep your sectors.") '
        "only if neither variant can be searched. On zero results, never drop every constraint at once: "
        "identify the most restrictive one, relaunch YOURSELF in the SAME turn ONE second pass with ONE "
        "precise relaxation, say what you widened, and never ask permission (#3343). Never drop a region, an exclusion or a "
        'definition ("startup", "ESN") without saying so, and never invent a result to fill a list.'
    ),
}


def constraint_consistency_block(route: ChatIntentRoute | None, language: str | None = "fr") -> str:
    """#3201 — le bloc à ajouter au prompt système, ou ``""``.

    Posé seulement quand la route déterministe (`app.services.compilers.
    intent_router.route_chat_intent`) dit que CE tour cherche des comptes —
    même garde que les autres blocs de ce fichier : on ne raconte jamais au
    modèle une situation qu'on n'a pas su lire.
    """
    if route is None or route.intent != "chercher_du_business":
        return ""
    return _CONSTRAINT_CONSISTENCY[_lang(language)]


# ─────────────────────────────────────────────────────────────────────────────
# #3202 (LAU-FINAL-208) — COMPANY ARCHETYPE & MARKET SEMANTICS ONTOLOGY.
#
# Même partage des rôles que #3201 : le vocabulaire et la règle de confiance
# vivent en code (`app.services.company_archetype`), le comportement de
# CONVERSATION — ne jamais réduire un archétype à un filtre — vit ici.
# Posé quand le message porte un marqueur d'archétype ambigu (#2321.17,
# famille #2679/#2721/#2434.51) : vide ⇒ "" ⇒ prompt byte-identique.
# ─────────────────────────────────────────────────────────────────────────────
_COMPANY_ARCHETYPE = {
    "fr": (
        "\n\nARCHÉTYPE D'ENTREPRISE DEMANDÉ : une notion métier (startup, scale-up, ESN, agence, "
        "éditeur, spin-off…) n'est JAMAIS un simple filtre d'effectif, de secteur ou de date de "
        "création — « startups French Tech » ne devient jamais « entreprises IT de moins de dix "
        "salariés ». Combine les signaux disponibles (financement, accélérateur, croissance, "
        "recrutements, innovation revendiquée, structure capitalistique) avant d'affirmer l'archétype, "
        "et NOMME le niveau de confiance (confirmé / plusieurs signaux convergents / signaux faibles / "
        "non établi) — jamais un archétype affirmé comme un fait sur un seul signal faible. Si la "
        "source qui confirmerait l'archétype (French Tech, base de levées) n'est pas disponible ici, "
        "dis-le et montre la couverture réelle plutôt que de compléter silencieusement avec des "
        "sociétés qui ne correspondent qu'au filtre le plus proche."
    ),
    "en": (
        "\n\nCOMPANY ARCHETYPE REQUESTED: a business notion (startup, scale-up, ESN, agency, software "
        'vendor, spin-off…) is NEVER a plain headcount, sector or creation-date filter — "French Tech '
        'startups" never becomes "IT companies under ten employees". Combine the available signals '
        "(funding, accelerator, growth, hiring, claimed innovation, capital structure) before asserting "
        "the archetype, and NAME the confidence level (confirmed / several converging signals / weak "
        "signals / not established) — never assert an archetype as fact on one weak signal alone. If the "
        "source that would confirm the archetype (French Tech, a funding database) is not available "
        "here, say so and show the real coverage instead of silently filling in with companies that "
        "only match the closest filter."
    ),
}


def company_archetype_block(message: str, language: str | None = "fr") -> str:
    """#3202 — le bloc à ajouter au prompt système, ou ``""`` quand la demande
    ne porte aucun marqueur d'archétype d'entreprise ambigu."""
    if not asks_about_company_archetype(message):
        return ""
    return _COMPANY_ARCHETYPE[_lang(language)]
