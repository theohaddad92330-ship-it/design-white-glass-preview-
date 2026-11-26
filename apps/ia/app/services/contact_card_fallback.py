"""#3229 (recette prod 02/10) — les contacts lus par un outil sortent en carte, pas en puces.

Même geste que ``verdict_card_fallback`` : quand ``get_account_contacts`` ou
``search_workspace_contacts`` a rendu des personnes ce tour et que la réponse ne porte
aucune carte ``contact_list``, la carte est bâtie ICI à partir du résultat de l'outil —
mêmes lignes, jamais un second calcul (GA-26), jamais une donnée inventée : un champ que
l'outil n'a pas rendu reste absent. Le nombre annoncé = les lignes de la carte ; le total
plus large se NOMME à part (``missing``), jamais « 0 » ni un chiffre déduit.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from typing import Any

from app.models.reply_blocks import validate_reply_block
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks

CONTACT_TOOL_NAMES = frozenset({"get_account_contacts", "search_workspace_contacts"})
_MAX_ITEMS = 30
_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


def _contact_href(value: object) -> str | None:
    """#4610 — le chemin RÉEL de la fiche, d'après le `contact_id` que l'outil a rendu (même mécanique que
    `_account_href` pour les comptes). Un identifiant absent ou illisible ⇒ aucun lien : jamais un lien mort."""
    text = str(value or "").strip()
    return f"/contacts/{text.lower()}" if _UUID.match(text) else None


def _account_href(value: object) -> str | None:
    """#4610.7 — le chemin RÉEL de la fiche du compte, d'après l'`account_id` que l'outil a rendu (ou celui de
    l'appel). Illisible ou absent ⇒ aucun lien : le nom du compte reste du texte."""
    text = str(value or "").strip()
    return f"/accounts/{text.lower()}" if _UUID.match(text) else None


def _clean(value: object, limit: int) -> str | None:
    text = " ".join(str(value or "").split())
    return (text if len(text) <= limit else text[: limit - 1].rstrip() + "…") or None


def _follow_up(raw: object) -> dict[str, str] | None:
    if not isinstance(raw, Mapping) or raw.get("kind") not in ("sent", "prepared"):
        return None
    as_of = _clean(raw.get("as_of"), 10)
    if not as_of or len(as_of) != 10:
        return None
    follow_up = {"kind": str(raw["kind"]), "as_of": as_of}
    channel = _clean(raw.get("channel"), 40)
    if channel:
        follow_up["channel"] = channel
    return follow_up


def contact_block_from_tool_output(output: object, tool_input: object = None) -> dict | None:
    if not isinstance(output, Mapping) or output.get("error"):
        return None
    rows = output.get("contacts")
    items: list[dict[str, Any]] = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, Mapping):
            continue
        name = _clean(row.get("full_name") or row.get("name"), 120)
        if not name:
            continue
        item: dict[str, Any] = {"name": name}
        # #4610 — le nom mène à la fiche ; sans fiche connue, il reste du texte.
        href = _contact_href(row.get("contact_id"))
        if href:
            item["href"] = href
        # #4610.7 — idem pour le compte cité : l'`account_id` de la ligne, sinon celui de l'appel (un seul compte lu).
        company_href = _account_href(row.get("account_id")) or _account_href(
            tool_input.get("account_id") if isinstance(tool_input, Mapping) else None
        )
        if company_href:
            item["company_href"] = company_href
        role = _clean(row.get("title") or row.get("role"), 160)
        company = _clean(row.get("company_name") or row.get("account_name") or row.get("company"), 120)
        if role:
            item["role"] = role
        if company:
            item["company"] = company
        # r3a (recette prod 07/10) : coordonnées en clair, telles que l'outil les a rendues.
        email = _clean(row.get("email"), 160)
        phone = _clean(row.get("phone"), 80)
        if email:
            item["email"] = email
        if phone:
            item["phone"] = phone
        # #3894 — relance dans contact_list (Louis 16/10) : telle que l'outil l'a lue, jamais calculée ici ;
        # une relance mal formée est écartée (la ligne reste), pas devinée.
        follow_up = _follow_up(row.get("follow_up"))
        if follow_up:
            item["follow_up"] = follow_up
        items.append(item)
    if not items:
        return None
    items = items[:_MAX_ITEMS]
    block: dict[str, Any] = {"type": "contact_list", "items": items}
    total = output.get("total")
    if isinstance(total, int) and not isinstance(total, bool) and total > len(items):
        block["missing"] = [f"{len(items)} contacts montrés sur {total} : les autres ne sont pas listés ici."]
    org_view = _org_view(output, tool_input, rows)
    if org_view:
        block["org_view"] = org_view
    return validate_reply_block(block)


_PERIMETER_KEYS = ("function", "expertise", "title_query", "query")


def _org_view(output: Mapping[str, Any], tool_input: object, rows: object) -> dict[str, str] | None:
    """#AM.32 — « Voir dans l'organigramme » : le COMPTE (celui de l'appel, ou celui que toutes les lignes
    partagent) et le PÉRIMÈTRE demandé. Sans l'un des deux, aucun lien — jamais l'organigramme d'un autre compte."""
    given = tool_input if isinstance(tool_input, Mapping) else {}
    account_id = _clean(given.get("account_id"), 64)
    if not account_id:
        ids = (
            {_clean(row.get("account_id"), 64) for row in rows if isinstance(row, Mapping)}
            if isinstance(rows, list)
            else set()
        )
        account_id = next(iter(ids)) if len(ids) == 1 else None
    perimeter = _clean(output.get("requested_function"), 120)
    for key in _PERIMETER_KEYS:
        perimeter = perimeter or _clean(given.get(key), 120)
    if not account_id or not perimeter:
        return None
    return {"account_id": account_id, "perimeter": perimeter}


def reply_has_contact_card(reply: str) -> bool:
    return any(s.kind == "block" and (s.block or {}).get("type") == "contact_list" for s in split_reply_blocks(reply))


def with_contact_card(reply: str, block: dict | None) -> str:
    """``reply`` + la carte si le modèle n'en a pas écrit une ; les puces à plat qui répètent un
    contact de la carte sont retirées (rien n'apparaît deux fois sous la même forme)."""
    if block is None:
        return reply
    if reply_has_contact_card(reply):
        return _completed_card_reply(reply, block)
    names = [str(item["name"]).casefold() for item in block["items"]]
    kept = [
        line
        for line in reply.split("\n")
        if not (_BULLET.match(line) and any(name in line.casefold() for name in names))
    ]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()
    fence = f"```{REPLY_BLOCK_FENCE}\n{json.dumps(block, ensure_ascii=False)}\n```"
    return f"{text}\n\n{fence}" if text else fence


#: La phrase qui REMPLACE le bouton « Voir les N autres » (#3229, Y14 02/10) : une offre de dérouler,
#: sous forme de question, sur une carte que l'écran sait déplier.
_UNROLL_OFFER = re.compile(
    r"(?:veux|souhaites|voudrais|dois)[- ]?(?:-?tu|-?je)\b.*(?:d[ée]roul|affich|montr|list|voir)", re.IGNORECASE
)


def _completed_card_reply(reply: str, block: dict) -> str:
    """#3229 (Y14 02/10) — le modèle a écrit une carte plus COURTE que la lecture de l'outil (3 lignes sur 5) : on
    y ajoute les contacts que l'outil a lus et que la carte ne nomme pas (jamais un contact que l'outil n'a pas rendu),
    pour que l'écran rende « Voir les N autres » ; l'offre « veux-tu que je déroule… » qui le remplaçait est retirée.
    Carte déjà complète ⇒ réponse inchangée, à l'octet."""
    segments = split_reply_blocks(reply)
    read_items = block["items"]
    changed = False
    parts: list[str] = []
    for segment in segments:
        if segment.kind == "block" and (segment.block or {}).get("type") == "contact_list":
            card = dict(segment.block or {})
            card_items = card.get("items", [])
            # #3596 — même tolérance qu'`_with_coordinates` (prénom abrégé) : une personne DÉJÀ
            # sur la carte, même sous « C. Jaouen », n'est jamais redoublée en « Caroline Jaouen ».
            extra = [
                item for item in read_items if _find_read_match(str(item["name"]), card_items, item.get("role")) is None
            ]
            enriched = _with_coordinates(card_items, read_items)
            # #AM.32 — le lien vers l'organigramme vient de l'outil : la carte écrite par le modèle le reçoit aussi.
            org_view = block.get("org_view")
            missing_org_view = bool(org_view) and not card.get("org_view")
            if extra or enriched != card_items or missing_org_view:
                card["items"] = [*enriched, *extra][:_MAX_ITEMS]
                if missing_org_view:
                    card["org_view"] = org_view
                completed = validate_reply_block(card)
                if completed is not None:
                    segment = type(segment)(kind="block", block=completed)
                    changed = True
        parts.append(segment.text if segment.kind == "text" else _fence_of(segment))
    if not changed:
        return reply
    kept = [
        part
        for part in parts
        if not (not part.startswith("```") and _UNROLL_OFFER.search(part) and part.rstrip().endswith("?"))
    ]
    return "\n\n".join(part for part in kept if part)


#: #4610 (prod 27/10, EXOTEC) — le modèle accole au prénom seul son avertissement (« Arnaud — nom à confirmer »,
#: « Arnaud (prénom seul, nom à confirmer) ») : ce n'est pas le nom de la personne, et il empêchait tout rapprochement.
_NAME_MARKER = re.compile(r"\s*(?:[—–-]|\()\s*(?:prénom seul|nom à confirmer)[^)]*\)?\s*$", re.IGNORECASE)


def _base_name(name: str) -> str:
    return _NAME_MARKER.sub("", name).strip()


def _initial_and_surname(name: str) -> tuple[str, str] | None:
    """Le prénom réduit à son INITIALE et le nom de famille (dernier mot) — pour reconnaître
    « C. Jaouen » comme la même personne que « Caroline Jaouen ». `None` sans au moins deux mots."""
    words = _base_name(name).split()
    return (words[0][:1].casefold(), words[-1].casefold()) if len(words) >= 2 else None


def _same_role(read: Mapping[str, Any], role: object) -> bool:
    return bool(role) and str(read.get("role") or "").casefold() == str(role).casefold()


def _find_read_match(name: str, read_items: list, role: object = None) -> Mapping[str, Any] | None:
    """#3596 (recette prod nuit 08→09/10) — le modèle écrit parfois un prénom ABRÉGÉ (« C. Jaouen »)
    quand l'outil l'a lu en entier (« Caroline Jaouen ») : une correspondance EXACTE seule laissait
    la coordonnée introuvable et donc absente, malgré la doctrine « coordonnées toujours en clair ».
    Repli : même initiale de prénom ET même nom de famille — seulement si ce couple désigne UNE
    SEULE personne parmi les lectures (sinon : rien, plutôt qu'un mauvais rapprochement).
    #4610 — des homonymes (dix « Arnaud ») se départagent par la FONCTION, seulement si elle n'en désigne qu'un."""
    casefolded = _base_name(name).casefold()
    exact = [r for r in read_items if _base_name(str(r["name"])).casefold() == casefolded]
    if len(exact) > 1 and role:
        by_role = [r for r in exact if _same_role(r, role)]
        if len(by_role) == 1:
            return by_role[0]
    if exact:
        return exact[0]
    key = _initial_and_surname(name)
    if key is None:
        return None
    candidates = [r for r in read_items if _initial_and_surname(str(r["name"])) == key]
    return candidates[0] if len(candidates) == 1 else None


def _unique_read(name: str, read_items: list, role: object = None) -> Mapping[str, Any] | None:
    """#4610 — la lecture de l'outil qui désigne CETTE ligne, SEULEMENT si le nom (et la fonction, pour des
    homonymes) ne désigne qu'une fiche et qu'un compte (deux homonymes ⇒ aucun lien plutôt que le mauvais)."""
    read = _find_read_match(name, read_items, role)
    if read is None:
        return None
    casefolded = _base_name(name).casefold()
    same = [r for r in read_items if _base_name(str(r["name"])).casefold() == casefolded]
    role_designates_one = bool(role) and sum(1 for r in same if _same_role(r, role)) == 1
    if len(same) > 1 and not role_designates_one:
        if len({r.get("href") for r in same}) > 1 or len({r.get("company_href") for r in same}) > 1:
            return None
    return read


def _with_coordinates(card_items: list, read_items: list) -> list:
    """r3a — une ligne écrite par le modèle sans e-mail/téléphone reprend ceux que l'outil a lus pour la même
    personne (jamais une coordonnée inventée ; une coordonnée déjà écrite n'est pas écrasée)."""
    out = []
    for item in card_items:
        read = _find_read_match(str(item.get("name", "")), read_items, item.get("role"))
        # #4610 — `href` est posé par le SERVEUR, jamais laissé au modèle : celui qu'il a écrit est remplacé par
        # celui de l'outil, ou retiré (un UUID de contact ne s'invente pas ; la ligne reste du texte).
        unique = _unique_read(str(item.get("name", "")), read_items, item.get("role"))
        item = {k: v for k, v in item.items() if k not in ("href", "company_href")}
        # #4610.7 — le lien du compte suit la même règle : celui de l'outil, ou retiré.
        for key in ("href", "company_href"):
            if unique is not None and unique.get(key):
                item[key] = unique[key]
        if read is None:
            out.append(item)
            continue
        merged = dict(item)
        for key in ("email", "phone", "follow_up"):  # #3894 — relance dans contact_list (Louis 16/10)
            if not merged.get(key) and read.get(key):
                merged[key] = read[key]
        out.append(merged)
    return out


def _fence_of(segment: Any) -> str:
    if segment.kind == "block":
        return f"```{REPLY_BLOCK_FENCE}\n{json.dumps(segment.block, ensure_ascii=False)}\n```"
    return segment.text
