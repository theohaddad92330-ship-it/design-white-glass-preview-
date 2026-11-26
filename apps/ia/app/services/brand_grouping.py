"""#4892.1 — une marque = une ligne (regroupement d'AFFICHAGE, jamais une fusion de données).

Deux entités juridiques (SIREN distincts) qui portent la même marque (toutes villes, #4892.2 — lot D 31/10, revient
sur le seau « même ville » de #4892.1) sont PROPOSÉES au
regroupement : la tête porte ``brandGroup = {role: head, members}``, les autres ``{role: member, headSiren}``.
Rien n'est écrit en base, chaque entité garde ses champs (doctrine « on PROPOSE, on ne fusionne jamais »).

Preuve minimale : même nom une fois retirés la forme sociale et les suffixes géographiques (« FRANCE »), OU même
premier mot significatif d'au moins 6 lettres (« DECATHLON LOGISTIQUE » ⇒ DECATHLON ; « ORANGE BUSINESS » ⇒ ORANGE).
Un premier mot plus court (« ACME ») ne suffit pas : trop de noms voisins. Hors preuve : aucune ligne n'est touchée."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, MutableMapping, Sequence
from typing import Any

#: Lot T point 3 — les mots qui ne portent PAS une marque : formes juridiques et génériques. UN seul endroit.
#: Sans « societe » / « cabinet » / « compagnie » / « etablissements », « SOCIETE GESER BEST » et « SOCIETE
#: GENERALE » partageaient la clé « societe » (recette prod 01/11).
_NOISE = frozenset(
    {
        "sa",
        "sas",
        "sasu",
        "sarl",
        "se",
        "snc",
        "eurl",
        "sci",
        "france",
        "groupe",
        "group",
        "holding",
        "societe",
        "cabinet",
        "compagnie",
        "etablissements",
        "etablissement",
        "ets",
    }
)
_HEADCOUNT = re.compile(r"\d[\d\s]*")


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def brand_key(name: object) -> str:
    """Le nom sans forme sociale ni suffixe géographique ; vide si rien ne reste."""
    return " ".join(word for word in _fold(name).split() if word not in _NOISE)


#: #4892.2 — longueur minimale du premier mot pour valoir une marque à lui seul.
_MIN_BRAND_WORD = 6


def _bucket_key(name: object) -> str:
    """La clé du seau : le nom épuré, ou son premier mot significatif s'il porte au moins 6 lettres."""
    key = brand_key(name)
    first = key.split(" ", 1)[0] if key else ""
    return first if len(first) >= _MIN_BRAND_WORD else key


def _size(row: Mapping[str, Any]) -> int:
    match = _HEADCOUNT.search(str(row.get("headcountRange") or ""))
    return int(re.sub(r"\s", "", match.group())) if match else 0


def _contains_name(name: object, searched_words: Sequence[str]) -> bool:
    """#4842.2 — la raison sociale CONTIENT le nom cherché en MOTS ENTIERS (accents et casse ignorés)."""
    words = _fold(name).split()
    n = len(searched_words)
    return n > 0 and any(words[i : i + n] == list(searched_words) for i in range(len(words) - n + 1))


def keep_named(candidates: Sequence[MutableMapping[str, Any]], searched: object) -> list[MutableMapping[str, Any]]:
    """#4842.2 — une recherche par NOM ne garde que les raisons sociales qui contiennent le nom cherché (mot
    entier) : DECAILLON, EDUCATHLON, MECATHLON… sortent de « Decathlon ». Si AUCUNE ne le contient (faute de
    frappe : le registre a rapproché par proximité), la liste est rendue telle quelle — jamais vidée."""
    words = _fold(searched).split()
    if not words:
        return list(candidates)
    kept = [row for row in candidates if _contains_name(row.get("name"), words)]
    return kept or list(candidates)


def group_by_brand(candidates: Sequence[MutableMapping[str, Any]], searched: object = None) -> None:
    """Pose ``brandGroup`` en place sur les entités d'une même marque (toutes villes, SIREN distincts).

    #4892.3 — avec un NOM cherché (``searched``), toutes les lignes dont la raison sociale le contient en mot
    entier forment UN seul seau (« BEL DECATHLON », « SCI DECATHLON - SALVA »…), sous la plus grande entité ;
    les autres suivent la règle du premier mot (lot D)."""
    searched_words = _fold(searched).split()
    buckets: dict[str, list[MutableMapping[str, Any]]] = {}
    for row in candidates:
        if searched_words and _contains_name(row.get("name"), searched_words):
            key = "\x00searched"
        else:
            key = _bucket_key(row.get("name"))
        if key and row.get("siren"):
            buckets.setdefault(key, []).append(row)
    for rows in buckets.values():
        by_siren = {str(r["siren"]): r for r in rows}
        if len(by_siren) < 2:
            continue
        # La tête : l'entité la plus grande (effectif connu), à égalité la première rencontrée.
        head = max(by_siren.values(), key=_size)
        others = [r for r in by_siren.values() if r is not head]
        head["brandGroup"] = {
            "role": "head",
            "members": [{"siren": str(r["siren"]), "name": r.get("name")} for r in others],
        }
        for row in others:
            # Lot T point 2b — le membre NOMME sa tête (« fait partie du groupe X ») si la tête est filtrée côté web.
            row["brandGroup"] = {"role": "member", "headSiren": str(head["siren"]), "headName": head.get("name")}
