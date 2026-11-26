"""#2322 — LE COMPILATEUR DE BESOIN : d'une source à une proposition de besoin.

─────────────────────────────────────────────────────────────────────────────
CE QUE FAIT CE MODULE, ET CE QU'IL NE FAIT PAS
─────────────────────────────────────────────────────────────────────────────
Il ne parle PAS au modèle et n'appelle AUCUNE API. C'est le modèle de `/chat`
qui lit la source (un email, un compte rendu, une fiche CRM) et remplit les
arguments de l'outil `compile_need` : une phrase par champ, avec l'extrait qui
la porte. Ce module VÉRIFIE ce qu'il a reçu, et jette ce qui ne tient pas.

Il n'écrit RIEN en base. Sa sortie est une PROPOSITION : le commercial la lit,
la corrige, et c'est son geste qui crée le besoin. « On propose, on n'écrit
jamais tout seul. »

Le CONTRAT est en TypeScript — `packages/contracts/src/schemas/need-compilation.ts`
— parce que c'est l'API et l'écran qui le valident. Ce fichier en est le
MIROIR d'exécution : mêmes noms de champs, mêmes listes fermées, mêmes refus.
Quand l'un change, l'autre change ; les deux tests le disent.

⚠️ Une seule clé n'existe que d'un côté : `not_understood`. En TypeScript elle
se CALCULE (`needUnderstandingGaps`), ici elle se transporte — l'écran de chat
lit du JSON, il n'a pas le calcul sous la main.
"""

from __future__ import annotations

from typing import Any

# ── Les sources (#2322.1 à #2322.13) ────────────────────────────────────────
SOURCE_KINDS: tuple[str, ...] = (
    "chat_message",
    "free_brief",
    "email",
    "meeting_report",
    "transcript",
    "document",
    "screenshot",
    "crm_record",
    "field_notes",
    "job_posting",
    "rfp",
)

# #2322.9 — « jamais un tableur, jamais un mapping de colonnes » (18/09/2026).
_SPREADSHEET_EXTENSIONS = (".csv", ".tsv", ".xls", ".xlsx", ".xlsm", ".ods", ".numbers")
_SPREADSHEET_MIME_MARKERS = ("text/csv", "text/tab-separated-values", "spreadsheet", "excel")
_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".heic", ".gif", ".bmp")
_DOCUMENT_EXTENSIONS = (".pdf", ".doc", ".docx", ".odt", ".rtf")
_DOCUMENT_MIME_MARKERS = ("pdf", "msword", "wordprocessingml", "opendocument.text")
_CHANNEL_SOURCE_KINDS: dict[str, str] = {
    "chat": "chat_message",
    "email": "email",
    "mailbox": "email",
    "crm": "crm_record",
}

# ── Les champs (#2322.24 à #2322.51) ────────────────────────────────────────
_TEXT = "text"
_TEXT_LIST = "text_list"
_INTEGER = "integer"
_SKILLS = "skills"

REMOTE_PREFERENCES = ("sur_site", "hybride", "full_remote", "indifferent")
TRAVEL_ACCEPTANCES = ("aucun", "ponctuel", "frequent")
CONTRACT_KINDS = ("regie", "forfait", "recrutement", "inconnu")
NEED_URGENCIES = ("basse", "normale", "haute", "critique")
PROCUREMENT_INVOLVEMENTS = ("implique", "non_implique")

#: Chaque champ, sa forme, et sa liste FERMÉE quand il en a une.
#: ⚠️ `mobility` emprunte l'échelle des consultants (`TRAVEL_ACCEPTANCES`) et
#: `remote` celle des préférences de travail : deux échelles jumelles pour un
#: même axe rendraient le rapprochement mission/personne impossible (GA-26).
FIELD_SHAPES: dict[str, tuple[str, tuple[str, ...] | None]] = {
    "title": (_TEXT, None),
    "skills": (_SKILLS, None),
    "seniority": (_TEXT, None),
    "headcount": (_INTEGER, None),
    "target_tjm_cents": (_INTEGER, None),
    "min_tjm_cents": (_INTEGER, None),
    "budget_cents": (_INTEGER, None),
    "start_on": (_TEXT, None),
    "duration_months": (_INTEGER, None),
    "deadline_at": (_TEXT, None),
    "location": (_TEXT, None),
    "remote": (_TEXT, REMOTE_PREFERENCES),
    "contract_kind": (_TEXT, CONTRACT_KINDS),
    "urgency": (_TEXT, NEED_URGENCIES),
    "expertise": (_TEXT, None),
    "context": (_TEXT, None),
    "clearances": (_TEXT_LIST, None),
    "constraints": (_TEXT, None),
    "entity": (_TEXT, None),
    "scope": (_TEXT, None),
    "work_to_do": (_TEXT, None),
    "expected_outcome": (_TEXT, None),
    "expected_proofs": (_TEXT_LIST, None),
    "mobility": (_TEXT, TRAVEL_ACCEPTANCES),
    "process": (_TEXT_LIST, None),
    "security": (_TEXT_LIST, None),
    "procurement": (_TEXT, PROCUREMENT_INVOLVEMENTS),
}

#: #2322.77 — les trois choses sans lesquelles un besoin n'est pas COMPRIS.
BLOCKING_FIELDS: tuple[str, ...] = ("work_to_do", "expected_outcome", "skills")

#: La question par défaut d'un champ bloquant. Le modèle la reformule dans la
#: langue de la personne — elle est ici pour qu'aucune question ne parte vide.
_BLOCKING_QUESTIONS: dict[str, tuple[str, str]] = {
    "work_to_do": (
        "Concrètement, quel travail cette personne aurait-elle à faire ?",
        "sans le travail réel, on ne propose qu'un intitulé de poste",
    ),
    "expected_outcome": (
        "Qu'est-ce qui doit avoir changé quand la mission se termine ?",
        "sans le résultat attendu, on ne sait pas quel profil défendre",
    ),
    "skills": (
        "Quelles compétences sont éliminatoires ?",
        "sans critère bloquant, toute proposition est un pari",
    ),
}

CONFIDENCES = ("explicite", "deduit", "incertain")
CONFIRMATION_LEVELS = ("confirme_par_le_client", "rapporte", "hypothese")
#: Les rôles de `PROJECT_CONTACT_ROLES` — le décideur (#2322.48) et l'acheteur
#: (#2322.49) sont des PERSONNES, pas des chaînes de caractères.
PROJECT_CONTACT_ROLES = ("sponsor", "decideur", "prescripteur", "acheteur", "utilisateur", "bloqueur")
#: #2322.71 — une offre d'emploi ne devient pas une mission toute seule.
NO_AUTO_CONVERSION_CONTRACT_KINDS = ("regie", "forfait")


def _text(raw: Any) -> str:
    return raw.strip() if isinstance(raw, str) else ""


def identify_source(hint: dict[str, Any]) -> tuple[str | None, str | None]:
    """Étape 1 (#2322.15) — le type de source, ou `None` plutôt qu'un type deviné.

    Rend `(kind, refusal)`. `refusal='tableur'` est un NON qui se dit à l'écran,
    pas une absence : un tableur ne se compile pas, on demande le document.
    """
    filename = _text(hint.get("filename")).lower()
    mime = _text(hint.get("mime")).lower()

    if filename.endswith(_SPREADSHEET_EXTENSIONS) or any(m in mime for m in _SPREADSHEET_MIME_MARKERS):
        return None, "tableur"

    declared = _text(hint.get("declared_kind")).lower() or _text(hint.get("kind")).lower()
    if declared:
        return (declared if declared in SOURCE_KINDS else None), None

    if mime.startswith("image/") or filename.endswith(_IMAGE_EXTENSIONS):
        return "screenshot", None
    if filename.endswith(_DOCUMENT_EXTENSIONS) or any(m in mime for m in _DOCUMENT_MIME_MARKERS):
        return "document", None

    channel = _text(hint.get("channel")).lower()
    if channel in _CHANNEL_SOURCE_KINDS:
        return _CHANNEL_SOURCE_KINDS[channel], None

    if _text(hint.get("text")):
        return "free_brief", None
    return None, None


def _coerce(field: str, raw: Any) -> Any | None:
    """La valeur telle que le champ l'attend, ou `None` si elle ne tient pas.

    Lire « 2 » comme 2 est une LECTURE, pas une invention : le modèle rend du
    texte. Lire « deux » comme 2 en serait une — on refuse.
    """
    shape, values = FIELD_SHAPES[field]

    if shape == _INTEGER:
        if isinstance(raw, bool):
            return None
        if isinstance(raw, int):
            return raw
        text = _text(raw).replace(" ", "")
        return int(text) if text.lstrip("-").isdigit() else None

    if shape == _TEXT_LIST:
        items = raw if isinstance(raw, list) else [raw]
        cleaned = [_text(item) for item in items]
        cleaned = [item for item in cleaned if item]
        return cleaned or None

    if shape == _SKILLS:
        items = raw if isinstance(raw, list) else [raw]
        skills: list[dict[str, Any]] = []
        for item in items:
            if isinstance(item, dict):
                term = _text(item.get("term"))
                if not term:
                    continue
                skill: dict[str, Any] = {"term": term, "required": bool(item.get("required", True))}
                level = _text(item.get("level"))
                if level:
                    skill["level"] = level
                skills.append(skill)
                continue
            term = _text(item)
            if term:
                skills.append({"term": term, "required": True})
        return skills or None

    text = _text(raw)
    if not text:
        return None
    if values is not None and text not in values:
        return None
    return text


def _describe(value: Any) -> str:
    """Une valeur rendue lisible dans une phrase de contradiction."""
    if isinstance(value, list):
        return ", ".join(
            _text(item.get("term")) if isinstance(item, dict) else _text(item) for item in value
        )
    return value.strip() if isinstance(value, str) else str(value)


def _provenance(statement: dict[str, Any], source_kind: str) -> dict[str, Any]:
    confidence = _text(statement.get("confidence"))
    return {
        "source_kind": source_kind,
        "excerpt": _text(statement.get("excerpt")),
        "locator": _text(statement.get("locator")) or None,
        "stated_at": _text(statement.get("stated_at")) or None,
        # Une confiance non dite est « incertain », jamais « explicite » : le
        # doute par défaut coûte une question, la certitude par défaut coûte
        # une mission.
        "confidence": confidence if confidence in CONFIDENCES else "incertain",
    }


def compile_need(tool_input: dict[str, Any]) -> dict[str, Any]:
    """Compile une source en PROPOSITION de besoin.

    Rend `{"compiled": {...}, "dropped": [...]}` — ou `{"error": "..."}` quand
    la source elle-même ne se compile pas. `dropped` nomme chaque phrase
    écartée et pourquoi : une extraction silencieusement amputée est pire
    qu'une extraction refusée.
    """
    source = tool_input.get("source") if isinstance(tool_input.get("source"), dict) else {}
    kind, refusal = identify_source(source or {})
    if refusal == "tableur":
        return {
            "error": (
                "Un tableur ne se compile pas en besoin : les colonnes d'un fichier ne disent "
                "pas ce que le client cherche. Demande le document d'origine (l'email, la fiche "
                "de poste, l'appel d'offres) ou le texte du besoin."
            )
        }
    if kind is None:
        return {
            "error": (
                "Je ne sais pas de quelle source vient ce besoin. Dis-moi ce que c'est "
                "(un email, un compte rendu, une transcription, des notes) — je ne le devine pas, "
                "parce que chaque champ porte ensuite l'origine dont il vient."
            )
        }

    dropped: list[dict[str, str]] = []
    statements = tool_input.get("statements")
    statements = statements if isinstance(statements, list) else []

    # 1. Vérifier chaque phrase — #2322.72-76 à l'exécution.
    kept: list[dict[str, Any]] = []
    for raw in statements:
        if not isinstance(raw, dict):
            continue
        field = _text(raw.get("field"))
        if field not in FIELD_SHAPES:
            dropped.append({"field": field or "?", "reason": "champ_inconnu"})
            continue
        if not _text(raw.get("excerpt")):
            # Une valeur sans citation n'est pas une valeur compilée : c'est une
            # valeur inventée, et on ne la garde pas « au cas où ».
            dropped.append({"field": field, "reason": "sans_extrait"})
            continue
        # #2322.71 — une offre d'emploi ne se convertit pas toute seule.
        if kind == "job_posting" and field == "contract_kind":
            if _text(raw.get("value")) in NO_AUTO_CONVERSION_CONTRACT_KINDS:
                dropped.append({"field": field, "reason": "conversion_interdite"})
                continue
        value = _coerce(field, raw.get("value"))
        if value is None:
            dropped.append({"field": field, "reason": "valeur_inattendue"})
            continue
        kept.append({"field": field, "value": value, "provenance": _provenance(raw, kind)})

    if not kept:
        return {
            "error": (
                "Rien de compilable dans cette source : aucune valeur n'était accompagnée de la "
                "phrase qui la porte. Je ne propose pas un besoin vide."
            )
        }

    # 2. Étape 5 (#2322.19) — ce qui se contredit ne s'écrase pas.
    order: list[str] = []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for entry in kept:
        if entry["field"] not in grouped:
            order.append(entry["field"])
            grouped[entry["field"]] = []
        grouped[entry["field"]].append(entry)

    fields: list[dict[str, Any]] = []
    contradictions: list[dict[str, Any]] = []
    for field in order:
        group = grouped[field]
        distinct = {_describe(entry["value"]) for entry in group}
        if len(distinct) > 1:
            contradictions.append(
                {
                    "field": field,
                    "statements": [
                        {"value": _describe(entry["value"]), "provenance": entry["provenance"]}
                        for entry in group
                    ],
                }
            )
            continue
        fields.append(group[0])

    filled = {entry["field"] for entry in fields}

    # 3. Les personnes — #2322.48 / #2322.49, jamais sans citation (#2322.66).
    proposed_contacts: list[dict[str, Any]] = []
    people = tool_input.get("people")
    for raw in people if isinstance(people, list) else []:
        if not isinstance(raw, dict):
            continue
        full_name = _text(raw.get("full_name"))
        role = _text(raw.get("role"))
        if not full_name or role not in PROJECT_CONTACT_ROLES or not _text(raw.get("excerpt")):
            continue
        proposed_contacts.append(
            {
                "contact_id": _text(raw.get("contact_id")) or None,
                "full_name": full_name,
                "title": _text(raw.get("title")) or None,
                "role": role,
                "provenance": _provenance(raw, kind),
            }
        )

    # 4. Ce qui manque — #2322.54. Un champ rempli n'est pas une inconnue.
    unknowns: list[dict[str, str]] = []
    for raw in tool_input.get("unknowns") if isinstance(tool_input.get("unknowns"), list) else []:
        if not isinstance(raw, dict):
            continue
        field = _text(raw.get("field"))
        question = _text(raw.get("question"))
        if field in FIELD_SHAPES and question and field not in filled:
            unknowns.append({"field": field, "question": question})

    not_understood = [field for field in BLOCKING_FIELDS if field not in filled]

    # 5. Le niveau de confirmation — #2322.56, et le NO-GO #2322.77.
    confirmation_level = _text(tool_input.get("confirmation_level"))
    if confirmation_level not in CONFIRMATION_LEVELS:
        confirmation_level = "hypothese"
    if confirmation_level == "confirme_par_le_client" and not_understood:
        # Un intitulé de poste confirmé n'est pas un besoin confirmé.
        confirmation_level = "rapporte"

    # 6. Étape 7 (#2322.21) — UNE question, et seulement si elle change la suite.
    clarification = None
    if contradictions:
        field = contradictions[0]["field"]
        clarification = {
            "field": field,
            "reason": "contradiction",
            "question": f"La source dit deux choses différentes sur « {field} » : laquelle tient ?",
            "why": "tant que les deux tiennent, on ne sait pas quoi écrire",
        }
    else:
        asked = {unknown["field"]: unknown["question"] for unknown in unknowns}
        blocking = next((field for field in BLOCKING_FIELDS if field in not_understood or field in asked), None)
        if blocking:
            default_question, why = _BLOCKING_QUESTIONS[blocking]
            clarification = {
                "field": blocking,
                "reason": "blocking_unknown",
                "question": asked.get(blocking) or default_question,
                "why": why,
            }

    compiled = {
        "status": "proposition",
        "source": {
            "kind": kind,
            "locator": _text(source.get("locator")) or None,
            "stated_at": _text(source.get("stated_at")) or None,
        },
        "account_id": _text(tool_input.get("account_id")) or None,
        "company_hint": _text(tool_input.get("company")) or None,
        "fields": fields,
        "proposed_contacts": proposed_contacts,
        "unknowns": unknowns,
        "contradictions": contradictions,
        "not_understood": not_understood,
        "confirmation_level": confirmation_level,
        "clarification": clarification,
    }
    return {"compiled": compiled, "dropped": dropped}


# ── Étape 2 (#2322.16) — résoudre l'entreprise ──────────────────────────────
#: Les formes juridiques qui ne distinguent pas deux entreprises. On retire
#: « SAS », jamais « France » : « Decathlon France » et « Decathlon » peuvent
#: être deux comptes, et les confondre ferait écrire un besoin chez le voisin.
_LEGAL_FORM_WORDS = frozenset(
    {"sas", "sasu", "sa", "sarl", "eurl", "snc", "sci", "scop", "gie", "ltd", "llc", "inc", "gmbh", "plc", "bv", "nv"}
)


def normalise_company_name(raw: str) -> str:
    """Le nom d'une entreprise, réduit à ce qui l'identifie."""
    import unicodedata

    folded = unicodedata.normalize("NFD", raw or "")
    folded = "".join(char for char in folded if unicodedata.category(char) != "Mn").lower()
    words = [word for word in "".join(c if c.isalnum() else " " for c in folded).split() if word]
    return "".join(word for word in words if word not in _LEGAL_FORM_WORDS)


def resolve_account(company: str | None, candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Étape 2 (#2322.16) — LE COMPTE, quand il est certain.

    Miroir exact de `resolveNeedAccount` (TypeScript) : un nom devient un compte
    si, et seulement si, UN seul compte porte ce nom une fois la ponctuation et
    la forme juridique mises de côté.

    ⚠️ On ne prend JAMAIS le plus proche. Deux candidats → aucun, et l'écran
    demande lequel. Un besoin écrit chez le mauvais compte ne se découvre qu'en
    réunion, devant le client.
    """
    wanted = normalise_company_name(company or "")
    if not wanted:
        return {"account_id": None, "ambiguous": False, "candidate_ids": []}

    matches = [
        candidate
        for candidate in candidates
        if normalise_company_name(str(candidate.get("company_name") or "")) == wanted
    ]
    if len(matches) == 1:
        return {
            "account_id": str(matches[0].get("id")),
            "ambiguous": False,
            "candidate_ids": [str(matches[0].get("id"))],
        }
    if len(matches) > 1:
        return {
            "account_id": None,
            "ambiguous": True,
            "candidate_ids": [str(match.get("id")) for match in matches],
        }
    return {"account_id": None, "ambiguous": False, "candidate_ids": []}
