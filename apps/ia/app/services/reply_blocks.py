"""#1914 — lire, normaliser et replier les cartes que Laura écrit dans sa réponse.

Une carte voyage DANS le texte de la réponse, entre deux clôtures
``bellum-block`` : c'est le canal que l'écran lit déjà (`StructuredReply`), que
l'app web persiste (`chat_messages.content`) et que ce service garde dans sa
mémoire de fil (`conversation_service.save_turn`). Aucun champ de plus.

Quatre gestes, chacun à un seul endroit :

  * ``normalize_reply_blocks`` — sur ce qui SORT du tour, avant toute
    persistance. Un bloc valide est réécrit dans sa forme validée (une clé non
    déclarée — un score, une probabilité — n'atteint ni l'écran ni la base) ;
    un bloc refusé redevient les textes qu'il portait ; un JSON illisible
    disparaît sans emporter le texte autour. Une réponse sans bloc ressort
    octet pour octet.
  * ``reply_blocks_as_text`` — le TEXTE d'une réponse à cartes, pour ce qui ne
    lit pas de carte : l'historique relu par le modèle (``compact_history_blocks``).
    ⚠️ Miroir de ``replyPlainText`` (packages/contracts, TypeScript) : UNE
    implémentation par langage, tenues l'une à l'autre par le jeu partagé
    ``reply-blocks.fixtures.json`` (``plain_text``). Une case de comparaison se
    relit AVEC sa colonne — « Deux ESN identifiées » seul ne dirait plus pour
    quel compte, et un modèle qui relit sa réponse précédente en tirerait un fait
    faux.
  * ``reply_card`` — une carte écrite par le SERVICE (les replis d'erreur de
    ``routers/chat.py``), validée par le contrat au moment où elle est construite.
  * ``split_reply_blocks`` — le découpage, même algorithme que
    ``splitReplyBlocks`` côté web (jeu partagé ``replies``).
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping
from dataclasses import dataclass

from app.models.reply_blocks import reply_block_leaves, validate_reply_block

logger = logging.getLogger(__name__)

REPLY_BLOCK_FENCE = "bellum-block"
_OPENING_FENCE = f"```{REPLY_BLOCK_FENCE}"
# #3758.9 (reste du lot J14, recette prod 08/10 — plan d'action BNP affiché en
# JSON brut) — TOLÉRANT au JSON collé à la clôture d'ouverture sur la MÊME
# ligne : la clôture est reconnue dès qu'elle COMMENCE la ligne, le reste de
# la ligne devient la première ligne du corps. Miroir exact de `reply-blocks.ts`.
_OPENING_LINE = re.compile(rf"[ \t]*```{REPLY_BLOCK_FENCE}[ \t]*(.*)")
_CLOSING_LINE = re.compile(r"[ \t]*```[ \t]*")
_SAME_LINE_CLOSING = re.compile(r"(.*)```[ \t]*")

# Les libellés du texte d'une carte. Français : ce texte est relu par le modèle,
# dans un prompt français. Tenus mot pour mot au jeu partagé (et donc aux
# traductions françaises du web) par `test_reply_blocks.py`.
REPLY_TEXT_LABELS_FR: dict[str, str] = {
    "why": "Pourquoi",
    "limits": "Ce qui manque",
    "whyNow": "Pourquoi maintenant :",
    "action": "Action :",
    "nextAction": "Prochaine action :",
    "rankedBy": "Classé selon :",
    "notEvaluated": "Non évalué :",
    "source": "Source :",
    "missing": "Ce qui manque encore",
    "need": "Besoin :",
    "fit": "Ce qui correspond",
    "gaps": "Écarts",
    "availability": "Disponibilité :",
    "objective": "Objectif :",
    "when": "Quand :",
    "owner": "Qui :",
    "attendees": "Participants",
    "talkingPoints": "Points à aborder",
    # #4424.4 — le pitch de réunion.
    "pitch": "Pitch :",
    "questions": "Questions à poser",
    "risks": "Risques",
    "unknowns": "Ce qu’on ne sait pas",
    # #3340 — le brief consultant provisoire.
    "role": "Rôle :",
    "previousRoles": "Rôles précédents",
    "seniority": "Niveau d’expérience :",
    "techFocus": "Dominante technique :",
    "functionalFocus": "Dominante fonctionnelle :",
    "technologies": "Technologies connues",
    "sectors": "Secteurs connus",
    "contractType": "Type de contrat :",
    "mobility": "Mobilité :",
    "workMode": "Remote ou présentiel :",
    "rateTarget": "TJM ou coût cible :",
    "failed": "Ce qui a échoué",
    "howToGet": "Comment l’obtenir :",
    "stillPossible": "Ce qui reste faisable",
    "notMeasured": "non mesuré",
    "timelineEmpty": "Aucun historique enregistré pour ce compte.",
    # #2429.13 — la carte d'approche, et son manque NOMMÉ.
    "angle": "Angle d’accroche :",
    "useCase": "Cas d’usage :",
    "noUseCase": "aucune preuve concrète dans le dossier",
    # #3392 / #3428 — le sprint 10 dont 3.
    "fullListCount": "Liste complète (observations du marché) :",
    "sprint": "Sprint exécutable :",
    "focus": "À travailler à fond :",
    "entryPoint": "Porte d’entrée :",
    "firstMove": "Premier mouvement :",
    # #213.2 (#3228) — le contrat de comptage.
    "deduplicated": "Après déduplication :",
    "resolvedIdentity": "Après résolution d’identité :",
    "coverage": "Couverture :",
    # #3758 (reste du lot J14) — le compte rendu enregistré.
    "decisions": "Décisions",
    "actions": "Actions",
    "recordedAt": "Enregistré le :",
    "reminder": "Relance :",
    # #2985 (lot E07 08/10) — la revue de compte manager.
    "managerReviewVerdict": "Verdict :",
    "managerReviewChangeDigest": "Ce qui a changé :",
    "managerReviewActionsCompleted": "Actions réalisées",
    "managerReviewActionsStalled": "Actions non avancées",
    "managerReviewDecisionsRequested": "Décisions en attente",
    "managerReviewArbitrations": "Arbitrages demandés",
    "managerReviewImportantFacts": "Faits importants",
    "managerReviewStatusAttention": "Attention",
    "managerReviewStatusStable": "Stable",
    "managerReviewStatusNotEvaluable": "Non évaluable",
    "managerReviewReasonStalledActions": "action(s) non avancée(s)",
    "managerReviewReasonRisks": "risque(s) signalé(s)",
    "managerReviewReasonCoverageGaps": "lacune(s) de couverture",
    "managerReviewReasonDecisionsPending": "décision(s) en attente",
    "managerReviewReasonArbitrationsPending": "arbitrage(s) en attente",
}

#: #2985 (lot E07 08/10) — le libellé de raison du verdict, par nature (miroir de
#: `MANAGER_REVIEW_REASON_LABEL_KEYS`, `reply-plain-text.ts`).
_MANAGER_REVIEW_REASON_LABEL_KEYS: dict[str, str] = {
    "stalled_actions": "managerReviewReasonStalledActions",
    "risks": "managerReviewReasonRisks",
    "coverage_gaps": "managerReviewReasonCoverageGaps",
    "decisions_pending": "managerReviewReasonDecisionsPending",
    "arbitrations_pending": "managerReviewReasonArbitrationsPending",
}

#: Le statut FERMÉ du verdict, en texte (miroir de `managerReviewStatusLabel`).
_MANAGER_REVIEW_STATUS_LABEL_KEYS: dict[str, str] = {
    "attention": "managerReviewStatusAttention",
    "stable": "managerReviewStatusStable",
    "not_evaluable": "managerReviewStatusNotEvaluable",
}

# #213.2 (#3228) — pluriel français des noms d'unité de `count_contract.OBJECT_TYPES`.
# Seul « signal » est irrégulier (« signaux ») ; les autres prennent un « s ».
_IRREGULAR_PLURALS: dict[str, str] = {"signal": "signaux"}


def _plural(object_type: str, count: int) -> str:
    if count == 1:
        return object_type
    return _IRREGULAR_PLURALS.get(object_type, f"{object_type}s")


@dataclass(frozen=True)
class ReplySegment:
    """``text`` | ``block`` (validé) | ``invalid`` (``value`` = le JSON lu ou
    ``None``) | ``unterminated`` (clôture jamais fermée — ``text`` = la suite)."""

    kind: str
    text: str = ""
    block: dict | None = None
    value: object = None


def _read_json(body: str) -> object | None:
    # Règle du dépôt pour un JSON écrit par un modèle : du premier `{` au dernier `}`.
    start, end = body.find("{"), body.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(body[start : end + 1])
    except ValueError:
        return None


def _read_block(body: str) -> ReplySegment:
    value = _read_json(body)
    block = validate_reply_block(value) if value is not None else None
    if block is not None:
        return ReplySegment(kind="block", block=block)
    return ReplySegment(kind="invalid", value=value)


def split_reply_blocks(text: str) -> list[ReplySegment]:
    lines = (text or "").split("\n")
    segments: list[ReplySegment] = []
    buffer: list[str] = []

    def flush() -> None:
        chunk = "\n".join(buffer).strip()
        if chunk:
            segments.append(ReplySegment(kind="text", text=chunk))
        buffer.clear()

    index = 0
    while index < len(lines):
        opening = _OPENING_LINE.fullmatch(lines[index])
        if not opening:
            buffer.append(lines[index])
            index += 1
            continue
        trailing = opening.group(1) or ""
        same_line_closing = _SAME_LINE_CLOSING.fullmatch(trailing)
        if same_line_closing:
            flush()
            segments.append(_read_block(same_line_closing.group(1) or ""))
            index += 1
            continue
        closing = index + 1
        while closing < len(lines) and not _CLOSING_LINE.fullmatch(lines[closing]):
            closing += 1
        flush()
        if closing >= len(lines):
            segments.append(ReplySegment(kind="unterminated", text="\n".join(lines[index + 1 :])))
            return segments
        segments.append(_read_block("\n".join([trailing, *lines[index + 1 : closing]])))
        index = closing + 1

    # Une clôture en cours d'écriture (« ```bell ») : la réponse a été coupée.
    last = buffer[-1].strip() if buffer else ""
    if len(last) >= 4 and last.startswith("```") and _OPENING_FENCE.startswith(last):
        buffer.pop()
        flush()
        segments.append(ReplySegment(kind="unterminated"))
        return segments
    flush()
    return segments


def _fence(block: dict) -> str:
    return f"```{REPLY_BLOCK_FENCE}\n{json.dumps(block, ensure_ascii=False)}\n```"


def _bullets(lines: object) -> str:
    return "\n".join(f"- {line}" for line in (lines or []))


def _leaf_bullets(value: object) -> str:
    return _bullets(reply_block_leaves(value))


def normalize_reply_blocks(reply: str) -> str:
    segments = split_reply_blocks(reply)
    if all(segment.kind == "text" for segment in segments):
        return reply
    refused = sum(1 for segment in segments if segment.kind == "invalid")
    if refused:
        # Un signal d'observabilité, jamais le contenu : la réponse peut porter
        # des noms de personnes.
        logger.warning("Carte de réponse refusée (%d) — repliée en texte", refused)
    parts: list[str] = []
    for segment in segments:
        if segment.kind == "text":
            parts.append(segment.text)
        elif segment.kind == "block":
            parts.append(_fence(segment.block))
        elif segment.kind == "invalid":
            parts.append(_leaf_bullets(segment.value))
        else:
            # Clôture jamais fermée : un JSON COMPLET dont seule la clôture manque
            # reste une carte ; une réponse coupée au milieu ne laisse rien.
            value = _read_json(segment.text)
            block = validate_reply_block(value) if value is not None else None
            parts.append(_fence(block) if block is not None else _leaf_bullets(value))
    return "\n\n".join(part for part in parts if part)


def _block_as_text(block: dict, labels: Mapping[str, str]) -> str:
    def section(key: str, lines: list[str] | None) -> str | None:
        return f"{labels[key]}\n{_bullets(lines)}" if lines else None

    def inline(key: str, value: str | None) -> str | None:
        return f"{labels[key]} {value}" if value else None

    def joined(values: list[str | None]) -> str:
        return " · ".join(value for value in values if value)

    def source(value: dict | None) -> str | None:
        return inline("source", joined([value.get("label"), value.get("as_of"), value.get("url")])) if value else None

    def label_of(value: dict | None) -> str | None:
        return (value or {}).get("label")

    parts: list[str | None] = []
    kind = block["type"]
    if kind == "verdict":
        parts += [block["conclusion"], section("why", block["reasons"]), section("limits", block.get("limits"))]
        parts.append(inline("nextAction", label_of(block.get("next_action"))))
    elif kind == "account_ranking":
        parts += [block.get("title"), inline("rankedBy", " · ".join(block["axes"]))]
        for rank, item in enumerate(block["items"], start=1):
            parts += [f"{rank}. {item['name']}", item.get("verdict"), section("why", item["why"])]
            parts += [inline("whyNow", item.get("why_now")), section("limits", item.get("limits"))]
            parts += [inline("notEvaluated", " · ".join(item.get("not_evaluated") or []))]
            parts += [inline("action", label_of(item.get("action"))), source(item.get("source"))]
        parts.append(inline("notEvaluated", " · ".join(block.get("not_evaluated") or [])))
    elif kind == "contact_list":
        parts.append(block.get("title"))
        for item in block["items"]:
            name_line = joined([item["name"], item.get("role"), item.get("company")])
            parts += [f"- {name_line}", item.get("reason"), source(item.get("source"))]
        parts.append(section("missing", block.get("missing")))
    elif kind == "comparison":
        parts.append(block.get("title"))
        for row in block["rows"]:
            # Une case se lit AVEC sa colonne ; inconnue, elle dit « non mesuré », jamais 0.
            cells = [
                f"{column} — {cell if cell is not None else labels['notMeasured']}"
                for column, cell in zip(block["columns"], row["cells"], strict=False)
            ]
            parts += [row["label"], _bullets(cells)]
        parts.append(block.get("note"))
    elif kind == "action_plan":
        parts += [block.get("title"), inline("objective", block.get("objective"))]
        for rank, step in enumerate(block["steps"], start=1):
            parts += [f"{rank}. {step['label']}", step.get("detail")]
            parts += [inline("when", step.get("when")), inline("owner", step.get("owner"))]
    elif kind == "consultant_shortlist":
        parts += [block.get("title"), inline("need", block.get("need"))]
        for item in block["items"]:
            parts += [
                f"- {joined([item['name'], item.get('headline')])}",
                inline("availability", item.get("availability")),
            ]
            parts += [section("fit", item["fit"]), section("gaps", item.get("gaps")), source(item.get("source"))]
        parts.append(inline("notEvaluated", " · ".join(block.get("not_evaluated") or [])))
    elif kind == "meeting_brief":
        parts += [block.get("title"), (block.get("account") or {}).get("name"), block.get("when")]
        parts.append(inline("objective", block["objective"]))
        parts.append(inline("pitch", block.get("pitch")))  # #4424.4
        attendees = [joined([attendee["name"], attendee.get("role")]) for attendee in block.get("attendees") or []]
        parts += [section("attendees", attendees), section("talkingPoints", block["talking_points"])]
        parts += [section("questions", block.get("questions")), section("risks", block.get("risks"))]
        parts.append(section("unknowns", block.get("unknowns")))
    elif kind == "consultant_brief":
        parts += [block.get("title"), inline("role", block.get("role"))]
        parts.append(section("previousRoles", block.get("previous_roles")))
        parts += [inline("seniority", block.get("seniority")), inline("techFocus", block.get("tech_focus"))]
        parts.append(inline("functionalFocus", block.get("functional_focus")))
        parts += [section("technologies", block.get("technologies")), section("sectors", block.get("sectors"))]
        parts += [inline("contractType", block.get("contract_type")), inline("availability", block.get("availability"))]
        parts += [inline("mobility", block.get("mobility")), inline("workMode", block.get("work_mode"))]
        parts.append(inline("rateTarget", block.get("rate_target")))
        parts.append(section("unknowns", block.get("unknowns")))
    elif kind == "missing_data":
        parts += [block.get("title"), section("failed", block.get("failed")), labels["missing"]]
        for item in block["missing"]:
            parts += [f"- {item['what']}", item.get("why"), inline("howToGet", item["how"])]
        parts.append(section("stillPossible", block.get("still_possible")))
    elif kind == "account_card":
        parts += [block["name"], block.get("verdict"), section("why", block.get("highlights"))]
        parts += [section("limits", block.get("limits"))]
        parts.append(inline("notEvaluated", " · ".join(block.get("not_evaluated") or [])))
        parts += [inline("action", label_of(block.get("action"))), source(block.get("source"))]
    elif kind == "timeline":
        parts += [block.get("title"), (block.get("account") or {}).get("name")]
        events = block.get("events") or []
        if not events:
            parts.append(labels["timelineEmpty"])
        else:
            for event in events:
                parts += [f"- {event['label']} ({event['at']})", event.get("detail")]
    elif kind == "file_export":
        parts += [block.get("title"), " · ".join(block["columns"])]
        for row in block["rows"]:
            parts.append(" · ".join(cell if cell is not None else labels["notMeasured"] for cell in row["cells"]))
        parts.append(block.get("note"))
    elif kind == "approach":
        parts += [block.get("title"), inline("objective", block["objective"]), inline("angle", block["angle"])]
        parts.append(inline("useCase", block.get("use_case") or labels["noUseCase"]))
        parts.append(inline("nextAction", label_of(block.get("next_action"))))
    elif kind == "account_volume_sprint":
        parts += [block.get("title"), inline("fullListCount", str(block["full_list_count"]))]
        parts.append(section("sprint", [item["name"] for item in block["sprint"]]))
        parts.append(labels["focus"])
        for item in block["focus"]:
            parts += [f"- {item['name']}", inline("whyNow", item["why_now"])]
            parts += [inline("entryPoint", item["entry_point"]), inline("firstMove", item["first_move"])]
    elif kind == "count_contract":
        count = block["raw_count"]
        parts.append(f"{count} {_plural(block['object_type'], count)}")
        # Un compte MESURÉ à zéro reste affiché : seul `None` (non mesuré) est tu.
        if block.get("deduplicated_count") is not None:
            parts.append(f"{labels['deduplicated']} {block['deduplicated_count']}")
        if block.get("resolved_count") is not None:
            parts.append(f"{labels['resolvedIdentity']} {block['resolved_count']}")
        parts.append(inline("coverage", block.get("coverage")))
        parts.append(section("limits", block.get("caveats")))
    elif kind == "account_map":
        # #3762 / #3758.2 — miroir de `reply-plain-text.ts` : le squelette dans son
        # ordre, puis les groupes ; une lecture absente n'écrit aucune ligne.
        parts.append(block.get("title"))
        if block.get("completeness") and block.get("context"):
            parts.append(joined([block["completeness"]["label"], *(c["label"] for c in block["context"])]))
        framing = block.get("framing")
        if framing:
            parts += [framing["origin"], framing["proves"], framing["not_proven"]]
        summary = block.get("summary")
        if summary:
            retained = summary["retained_count"]
            count_line = f"{retained} {_plural('compte', retained)}"
            parts += [joined([count_line, summary["qualification"]]), summary.get("main_reserve")]
        parts.append(inline("coverage", block.get("coverage")))
        for group in block.get("groups") or []:
            parts.append(group["label"])
            parts.append(_bullets([joined([i["name"], i.get("detail")]) for i in group["items"]]))
        parts += [section("notEvaluated", block.get("not_covered")), source(block.get("source"))]
        for index, account in enumerate(block.get("accounts") or [], start=1):
            parts += [f"{index}. {joined([account['name'], account['status']['label']])}", account["proof"]]
            parts += [" · ".join(account.get("tags") or []), account["caution"]]
            parts.append(inline("nextAction", label_of(account["next_action"])))
        parts += [_bullets(block.get("memory") or []), section("missing", block.get("to_document"))]
        parts.append(block.get("method_limit"))
        closing = block.get("actions") or {}
        parts += [label_of(closing.get(key)) for key in ("validate", "discover", "enrich", "save")]
    elif kind == "post_meeting_summary":
        # #3758 (reste du lot J14) — le compte rendu ENREGISTRÉ, jamais le
        # texte du modèle : `as_of` est la date d'enregistrement de la note.
        parts += [block.get("title"), inline("recordedAt", block["as_of"][:10])]
        parts.append(section("decisions", block.get("decisions")))
        actions = block.get("actions") or []
        if actions:
            parts.append(labels["actions"])
            for item in actions:
                parts += [f"- {item['what']}", inline("owner", item.get("owner")), inline("when", item.get("due"))]
        reminder = block.get("reminder")
        if reminder:
            parts += [inline("reminder", reminder["content"]), inline("when", reminder.get("due_label"))]
    elif kind == "manager_review":
        # #2985 (lot E07 08/10) — reformage du résultat de `get_account_manager_review`,
        # jamais un second calcul : miroir de `reply-plain-text.ts`.
        parts.append(block["account_name"])
        verdict = block["verdict"]
        reasons = [
            f"{reason['count']} {labels[_MANAGER_REVIEW_REASON_LABEL_KEYS[reason['kind']]]}"
            for reason in verdict["reasons"]
        ]
        status_label = labels[_MANAGER_REVIEW_STATUS_LABEL_KEYS[verdict["status"]]]
        parts.append(inline("managerReviewVerdict", joined([status_label, *reasons])))
        digest = block.get("change_digest")
        if digest:
            parts.append(
                f"{labels['managerReviewChangeDigest']} "
                f"{digest['changed_count']} · {digest['appeared_count']} · {digest['disappeared_count']}"
            )
        parts.append(
            section(
                "managerReviewActionsCompleted",
                [joined([a["label"], a.get("target"), a.get("owner")]) for a in block.get("actions_completed") or []],
            )
        )
        parts.append(
            section(
                "managerReviewActionsStalled",
                [
                    joined([a["label"], a.get("target"), a.get("owner"), a["due_date"]])
                    for a in block.get("actions_stalled") or []
                ],
            )
        )
        parts.append(section("risks", [f"{r['project']} — {r['risks']}" for r in block.get("risks") or []]))
        coverage = block.get("coverage")
        if coverage:
            parts.append(section("coverage", [f"{g['label']} — {g['reason']}" for g in coverage.get("gaps") or []]))
        parts.append(
            section("managerReviewImportantFacts", [joined([f["label"], f.get("date")]) for f in block.get("important_facts") or []])
        )
        parts.append(
            section(
                "managerReviewDecisionsRequested",
                [joined([a["label"], a.get("target"), a.get("owner")]) for a in block.get("decisions_requested") or []],
            )
        )
        parts.append(
            section(
                "managerReviewArbitrations",
                [
                    f"{a['consultant']} — {a['account_owner']} / {a['resource_owner']}"
                    for a in block.get("arbitrations_requested") or []
                ],
            )
        )
        parts.append(inline("notEvaluated", " · ".join(verdict.get("not_evaluated") or [])))
    return "\n".join(part for part in parts if part)


def reply_blocks_as_text(text: str, labels: Mapping[str, str] | None = None) -> str:
    segments = split_reply_blocks(text)
    if all(segment.kind == "text" for segment in segments):
        return text
    resolved = labels or REPLY_TEXT_LABELS_FR
    parts: list[str] = []
    for segment in segments:
        if segment.kind == "text":
            parts.append(segment.text)
        elif segment.kind == "block":
            parts.append(_block_as_text(segment.block, resolved))
        elif segment.kind == "invalid":
            parts.append(_leaf_bullets(segment.value))
        # `unterminated` : une carte coupée ne laisse ni clôture ni fragment.
    return "\n\n".join(part for part in parts if part)


def reply_card(block: dict) -> str:
    """Une carte écrite par le service lui-même, refusée à la construction si le
    contrat la refuse — jamais une carte cassée découverte à l'écran."""
    validated = validate_reply_block(block)
    if validated is None:
        raise ValueError(f"carte de réponse refusée par le contrat : {block.get('type')!r}")
    return _fence(validated)


# #4287.4 — les quatre intitulés du gabarit texte CONSEIL (`bellum_advisor._BLOCK_FORMAT`), FR et EN, vers le
# champ de la carte `verdict` qui porte la même section.
_CONSEIL_FIELDS: dict[str, str] = {
    "verdict": "conclusion",
    "pourquoi": "reasons",
    "why": "reasons",
    "ce qui manque": "limits",
    "what's missing": "limits",
    "what is missing": "limits",
    "prochaine action": "next_action",
    "next action": "next_action",
}
_CONSEIL_HEADING = re.compile(r"\s*\*\*\s*([^*]+?)\s*:?\s*\*\*\s*:?\s*(.*)")
_LIST_MARK = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")


def _cut(value: str, limit: int) -> str:
    text = " ".join(value.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _conseil_sections(text: str) -> tuple[dict[str, list[str]], str]:
    """Les sections CONSEIL d'un texte (champ → lignes) et ce qui reste autour, à l'octet près hors sections."""
    sections: dict[str, list[str]] = {}
    kept: list[str] = []
    current: str | None = None
    for line in text.split("\n"):
        heading = _CONSEIL_HEADING.fullmatch(line)
        field = _CONSEIL_FIELDS.get(heading.group(1).lower().replace("’", "'")) if heading else None
        if heading and field:
            current = field
            sections.setdefault(field, [])
            line = heading.group(2)
        if current is None:
            kept.append(line)
            continue
        item = _LIST_MARK.sub("", line).strip()
        if item:
            sections[current].append(item)
    return sections, "\n".join(kept).strip()


def _verdict_of_conseil(sections: Mapping[str, list[str]]) -> dict | None:
    conclusion = " ".join(sections.get("conclusion") or [])
    if not conclusion or not sections.get("reasons"):
        return None
    block: dict = {
        "type": "verdict",
        "conclusion": _cut(conclusion, 300),
        "reasons": [_cut(line, 400) for line in sections["reasons"]][:6],
    }
    limits = [_cut(line, 400) for line in sections.get("limits") or []][:6]
    if limits:
        block["limits"] = limits
    action = " ".join(sections.get("next_action") or [])
    if action:
        block["next_action"] = {"label": _cut(action, 120)}
    return block


def _account_card_limits(card: Mapping) -> list[str]:
    return [*(card.get("limits") or []), *(card.get("not_evaluated") or [])][:6]


def as_one_verdict_card(reply: str, nothing_missing: str) -> str:
    """#4287.4 — la forme UNIQUE de « prochaine action et ce qui manque » : une carte `verdict`, quelle que soit
    la forme que le modèle a choisie (carte `verdict`, fiche `account_card`, gabarit texte CONSEIL). Seule la
    FORME change : chaque champ vient de ce que Laura (ou l'outil) a écrit, rien n'est recalculé ni inventé.
    « Ce qui manque » (`limits`) est TOUJOURS rendu ; vide, il le DIT (``nothing_missing``) — jamais « 0 »,
    jamais une section qui disparaît. Rien de reconnaissable (une phrase seule) ⇒ réponse inchangée."""
    segments = split_reply_blocks(reply)
    if any(segment.kind not in ("text", "block") for segment in segments):
        return reply
    blocks = [segment.block or {} for segment in segments if segment.kind == "block"]
    verdict = next((dict(b) for b in blocks if b.get("type") == "verdict"), None)
    card = next((b for b in blocks if b.get("type") == "account_card"), None)
    texts: dict[int, str] = {}
    if verdict is None and card is not None:
        name, said = card["name"], card.get("verdict")
        verdict = {"type": "verdict", "conclusion": _cut(f"{name} — {said}" if said else name, 300)}
        verdict["reasons"] = list(card["highlights"])
    if verdict is None:
        for index, segment in enumerate(segments):
            if segment.kind != "text":
                continue
            sections, rest = _conseil_sections(segment.text)
            verdict = _verdict_of_conseil(sections)
            if verdict is not None:
                texts[index] = rest
                break
    if verdict is None:
        return reply
    if card is not None:
        verdict["limits"] = verdict.get("limits") or _account_card_limits(card) or None
        if not verdict.get("next_action") and card.get("action"):
            verdict["next_action"] = card["action"]
    verdict["limits"] = verdict.get("limits") or [nothing_missing]
    validated = validate_reply_block({k: v for k, v in verdict.items() if v is not None})
    if validated is None:
        return reply
    parts: list[str] = []
    placed = False
    for index, segment in enumerate(segments):
        if segment.kind == "block" and (segment.block or {}).get("type") not in ("verdict", "account_card"):
            parts.append(_fence(segment.block or {}))
            continue
        if segment.kind == "text":
            parts.append(texts.get(index, segment.text))
            if index not in texts:
                continue
        if not placed:
            parts.append(_fence(validated))
            placed = True
    return "\n\n".join(part for part in parts if part)


def compact_history_blocks(history: list[dict]) -> list[dict]:
    return [
        {**entry, "content": reply_blocks_as_text(str(entry.get("content", "")))}
        if REPLY_BLOCK_FENCE in str(entry.get("content", ""))
        else entry
        for entry in history
    ]
