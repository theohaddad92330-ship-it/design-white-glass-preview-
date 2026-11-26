"""#4055.4 / #4055.6 / #4055.7 — LES TROIS LECTURES AGRÉGÉES DE « COMPLÈTE CE COMPTE » ET DES SECTEURS.

Du calcul pur, sans réseau : l'outil de chat lit les ponts, normalise leurs réponses en ``SourceRead`` et appelle ces
fonctions. Trois règles, tenues par ``tests/test_account_completion_4055.py`` :

* **non lu ≠ manquant** — une source qui n'a pas répondu sort ``not_read`` (jamais « manque ») ; seule une source LUE et
  vide est ``missing``. Un résultat partiel ne conclut jamais « aucun autre » (doctrine #4055).
* **rien ne part seul** — chaque collecte manquante est PROPOSÉE (``launched: False``, ``confirmation_required: True``) ;
  aucune n'est lancée par cette lecture.
* **on n'affiche pas ce qu'on n'a pas** — un secteur non renseigné n'est ni fondu dans un autre ni compté « 0 » : il
  sort à part (``without_sector``).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

#: Les quatre choses qu'un compte complet doit porter, dans l'ordre où l'écran les montre.
COMPLETION_KINDS = ("signals", "needs", "decision_makers", "org_chart")
#: Rôles d'achat qui comptent comme « décideur » (vocabulaire ``decisionRoleSchema``).
DECISION_MAKER_ROLES = frozenset({"economic", "technical", "sponsor"})
#: Groupe de classement d'un contact de compte (``contactGroupKeySchema``) : les lignes d'un compte portent ``group``.
DECISION_MAKER_GROUPS = frozenset({"decision_maker"})

#: kind → (outil de chat qui lance la collecte, ou ``None`` quand aucune collecte n'est lançable depuis le chat).
_COLLECTION_TOOL: dict[str, str | None] = {
    "signals": "start_analysis",
    "org_chart": "start_analysis",
    "decision_makers": "propose_people_search",
    "needs": None,
}
_NO_COLLECTION_NOTE = "Aucune collecte ne se lance d'ici : les besoins viennent des connecteurs et des saisies de l'espace."


@dataclass(frozen=True)
class SourceRead:
    """Ce qu'une source a répondu. ``count=None`` = la source n'a pas répondu (jamais 0)."""

    count: int | None

    @property
    def read(self) -> bool:
        return self.count is not None


def build_completion(reads: Mapping[str, SourceRead]) -> dict[str, Any]:
    present: list[dict[str, Any]] = []
    missing: list[str] = []
    not_read: list[str] = []
    for kind in COMPLETION_KINDS:
        source = reads.get(kind)
        if source is None or not source.read:
            not_read.append(kind)
        elif source.count == 0:
            missing.append(kind)
        else:
            present.append({"kind": kind, "count": source.count})

    by_tool: dict[str | None, list[str]] = {}
    for kind in missing:
        by_tool.setdefault(_COLLECTION_TOOL[kind], []).append(kind)
    proposed: list[dict[str, Any]] = []
    for tool, kinds in by_tool.items():
        entry: dict[str, Any] = {
            "tool": tool,
            "kinds": kinds,
            "launched": False,
            "confirmation_required": True,
        }
        if tool is None:
            entry["note"] = _NO_COLLECTION_NOTE
        proposed.append(entry)

    return {
        "present": present,
        "missing": missing,
        "not_read": not_read,
        "proposed_collections": proposed,
        "nothing_launched": True,
        # Un résultat dont une source n'a pas répondu est PARTIEL : jamais « le compte est complet ».
        "complete": not missing and not not_read,
    }


def count_decision_makers(contacts: Iterable[Mapping[str, Any]]) -> int:
    return sum(
        1
        for contact in contacts
        if str(contact.get("decision_role") or "").lower() in DECISION_MAKER_ROLES
        or str(contact.get("group") or "").lower() in DECISION_MAKER_GROUPS
    )


def _name_key(name: object) -> str:
    folded = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", folded).strip()


def name_key(name: object) -> str:
    """La clé de comparaison d'un nom de personne : casse, accents et blancs ne distinguent rien (#4055.10)."""
    return _name_key(name)


def detected_outside_base(
    detected: Iterable[Mapping[str, Any]],
    contacts: Iterable[Mapping[str, Any]],
    *,
    contacts_complete: bool,
    dismissed: Collection[str] = (),
) -> dict[str, Any]:
    """Les personnes NOMMÉES dans les sources (organigramme) et absentes des contacts, en UNE structure.

    ``contacts_complete=False`` : la liste des contacts lue est tronquée — une personne qui n'y figure pas n'est donc
    pas prouvée absente de la base, elle sort ``to_reconcile`` (à rapprocher) et non ``outside_base``. Un nom vide ou
    déjà dans la base n'est jamais proposé. Chaque entrée se PROPOSE à l'ajout, rien n'est ajouté.

    #4055.10 — ``dismissed`` : les clés (``name_key``) des personnes que CETTE personne a écartées sur ce compte. Une
    proposition retenue (contact ajouté) sort déjà par ``contacts`` ; une proposition écartée sort par ici, au rejeu.
    """
    known = {key for key in (_name_key(c.get("full_name") or c.get("name")) for c in contacts) if key}
    status = "outside_base" if contacts_complete else "to_reconcile"
    seen: set[str] = set()
    people: list[dict[str, Any]] = []
    for person in detected:
        name = str(person.get("full_name") or "").strip()
        key = _name_key(name)
        if not key or key in known or key in seen or key in dismissed:
            continue
        seen.add(key)
        entry: dict[str, Any] = {
            "full_name": name,
            "status": status,
            "source": "org_chart",
            "proposed_action": "add_contact",
            "added": False,
            "confirmation_required": True,
        }
        for field in ("title", "entity", "identity_status"):
            if person.get(field):
                entry[field] = person[field]
        people.append(entry)
    return {"people": people, "count": len(people), "contacts_complete": contacts_complete, "nothing_added": True}


def sector_levels(accounts: Iterable[Mapping[str, Any]], *, complete: bool, examples: int = 3) -> dict[str, Any]:
    """Le niveau « secteurs » : les comptes lus, comptés par secteur. ``complete=False`` : le portefeuille dépasse ce
    qui a été lu — les effectifs sont ceux des comptes LUS, jamais le total du portefeuille."""
    buckets: dict[str, dict[str, Any]] = {}
    without_sector = 0
    read = 0
    for account in accounts:
        read += 1
        sector = str(account.get("sector") or "").strip()
        if not sector:
            without_sector += 1
            continue
        bucket = buckets.setdefault(_name_key(sector), {"sector": sector, "account_count": 0, "examples": []})
        bucket["account_count"] += 1
        name = str(account.get("company_name") or account.get("name") or "").strip()
        if name and len(bucket["examples"]) < examples:
            bucket["examples"].append(name)
    levels = sorted(buckets.values(), key=lambda b: (-b["account_count"], _name_key(b["sector"])))
    return {
        "sectors": levels,
        "without_sector": without_sector,
        "accounts_read": read,
        "complete": complete,
    }
