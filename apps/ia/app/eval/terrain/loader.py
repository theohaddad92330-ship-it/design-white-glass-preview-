"""Accesseurs typés du corpus terrain #2796.

Chaque loader lit un fichier JSON versionné (voir ``__init__.py`` pour la
provenance) et REFUSE une entrée malformée (champ manquant, vide ou du mauvais
type) en levant ``ValueError`` — jamais un défaut deviné. C'est le même choix
que ``app.eval.golden.load_golden`` (``FileNotFoundError`` si le slug
n'existe pas) : un jeu de référence qui se tait sur une entrée cassée mesure
autre chose que ce qu'il prétend mesurer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent


def _load_raw(name: str) -> dict[str, Any]:
    path = _HERE / name
    if not path.exists():
        raise FileNotFoundError(f"Corpus terrain absent: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _require_str(entry: dict[str, Any], field: str, where: str) -> str:
    value = entry.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{where}: champ {field!r} manquant ou vide dans {entry!r}")
    return value


def _require_int(entry: dict[str, Any], field: str, where: str) -> int:
    value = entry.get(field)
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{where}: champ {field!r} doit être un entier dans {entry!r}")
    return value


@dataclass(frozen=True)
class BesoinPrio:
    rang: int
    besoin: str
    score: int
    outil: str | None = None


def _besoin_from_entry(entry: dict[str, Any], where: str) -> BesoinPrio:
    return BesoinPrio(
        rang=_require_int(entry, "rang", where),
        besoin=_require_str(entry, "besoin", where),
        score=_require_int(entry, "score", where),
        outil=entry.get("outil"),
    )


def load_besoins_p1() -> list[BesoinPrio]:
    """#1948.2 — 100 besoins métiers PRIO 1 MVP, groupés par outil."""
    raw = _load_raw("besoins_p1_2026.json")
    return [_besoin_from_entry(e, "besoins_p1") for e in raw["besoins"]]


def load_besoins_p2() -> list[BesoinPrio]:
    """#1948.3 — 50 besoins métiers PRIO 2."""
    raw = _load_raw("besoins_p2_2026.json")
    return [_besoin_from_entry(e, "besoins_p2") for e in raw["besoins"]]


@dataclass(frozen=True)
class RequeteExecution:
    id: int
    requete: str
    outils: str
    resultat_attendu: str
    actions_agent: str


def load_requetes_prio1() -> list[RequeteExecution]:
    """#1948.4 / #1948.15 / #1948.56 — 60 requêtes exécutables PRIO 1."""
    raw = _load_raw("requetes_prio1_2026.json")
    where = "requetes_prio1"
    return [
        RequeteExecution(
            id=_require_int(e, "id", where),
            requete=_require_str(e, "requete", where),
            outils=_require_str(e, "outils", where),
            resultat_attendu=_require_str(e, "resultat_attendu", where),
            actions_agent=_require_str(e, "actions_agent", where),
        )
        for e in raw["requetes"]
    ]


@dataclass(frozen=True)
class RequeteConseil:
    id: int
    requete: str
    outils: str
    resultat_attendu: str


def load_requetes_conseil() -> list[RequeteConseil]:
    """#1948.56 — 30 requêtes conseil, stratégie et analyse."""
    raw = _load_raw("requetes_conseil_2026.json")
    where = "requetes_conseil"
    return [
        RequeteConseil(
            id=_require_int(e, "id", where),
            requete=_require_str(e, "requete", where),
            outils=_require_str(e, "outils", where),
            resultat_attendu=_require_str(e, "resultat_attendu", where),
        )
        for e in raw["requetes"]
    ]


@dataclass(frozen=True)
class Trigger:
    id: int
    trigger: str
    quand: str
    outils: str
    action_agent: str
    message_produit: str


def load_triggers() -> list[Trigger]:
    """#1948.5 — 25 triggers automatiques récurrents."""
    raw = _load_raw("triggers_2026.json")
    where = "triggers"
    return [
        Trigger(
            id=_require_int(e, "id", where),
            trigger=_require_str(e, "trigger", where),
            quand=_require_str(e, "quand", where),
            outils=_require_str(e, "outils", where),
            action_agent=_require_str(e, "action_agent", where),
            message_produit=_require_str(e, "message_produit", where),
        )
        for e in raw["triggers"]
    ]


@dataclass(frozen=True)
class RespondantTerrain:
    repondant: str
    outils_contexte: str
    besoins_exprimes: str
    classement: str


@dataclass(frozen=True)
class AuditTerrain:
    reponses_questionnaire: int
    repartition: list[dict[str, Any]]
    respondants: list[RespondantTerrain]


def load_audit_terrain() -> AuditTerrain:
    """#1948.1 — 604 réponses et besoins terrain (stats + audit par répondant)."""
    raw = _load_raw("audit_terrain_2026.json")
    where = "audit_terrain"
    q = raw["questionnaire_attente"]
    if not isinstance(q.get("reponses"), int) or q["reponses"] <= 0:
        raise ValueError(f"{where}: questionnaire_attente.reponses doit être un entier positif")
    respondants = [
        RespondantTerrain(
            repondant=_require_str(e, "repondant", where),
            outils_contexte=_require_str(e, "outils_contexte", where),
            besoins_exprimes=_require_str(e, "besoins_exprimes", where),
            classement=_require_str(e, "classement", where),
        )
        for e in raw["audit_terrain"]
    ]
    return AuditTerrain(
        reponses_questionnaire=q["reponses"],
        repartition=list(q["repartition"]),
        respondants=respondants,
    )


@dataclass(frozen=True)
class Parcours:
    id: str
    titre: str
    etapes: list[str]
    etapes_numero_source: list[int]


def load_parcours() -> list[Parcours]:
    """#1948.10 — nouveaux parcours définis pour Laura (workflows multi-outils)."""
    raw = _load_raw("parcours_laura_2026.json")
    where = "parcours_laura"
    out: list[Parcours] = []
    for e in raw["parcours"]:
        etapes = e.get("etapes")
        if not isinstance(etapes, list) or not etapes or not all(isinstance(s, str) and s.strip() for s in etapes):
            raise ValueError(f"{where}: champ 'etapes' doit être une liste non vide de chaînes dans {e!r}")
        out.append(
            Parcours(
                id=_require_str(e, "id", where),
                titre=_require_str(e, "titre", where),
                etapes=list(etapes),
                etapes_numero_source=list(e.get("etapes_numero_source") or []),
            )
        )
    return out


@dataclass(frozen=True)
class VerbatimRequete:
    categorie: str
    requete: str
    outils: str
    trigger: str
    resultat_attendu: str


def load_verbatim_utilisateur() -> list[VerbatimRequete]:
    """#1948.15 — formulation réelle : bibliothèque de requêtes utilisateur."""
    raw = _load_raw("verbatim_utilisateur_2026.json")
    where = "verbatim_utilisateur"
    return [
        VerbatimRequete(
            categorie=_require_str(e, "categorie", where),
            requete=_require_str(e, "requete", where),
            outils=_require_str(e, "outils", where),
            trigger=_require_str(e, "trigger", where),
            resultat_attendu=_require_str(e, "resultat_attendu", where),
        )
        for e in raw["requetes"]
    ]


@dataclass(frozen=True)
class ProtocoleRecette:
    champs: list[tuple[str, str]]
    verdicts: list[tuple[str, str]]


def load_protocole_recette_beta() -> ProtocoleRecette:
    """#1948.7 / #1948.8 — protocole PASS/FAIL de la recette bêta (Theo)."""
    raw = _load_raw("protocole_recette_beta_2026.json")
    where = "protocole_recette_beta"
    champs = [
        (_require_str(e, "champ", where), _require_str(e, "definition", where))
        for e in raw["champs"]
    ]
    verdicts = [
        (_require_str(e, "verdict", where), _require_str(e, "definition", where))
        for e in raw["verdicts"]
    ]
    return ProtocoleRecette(champs=champs, verdicts=verdicts)
