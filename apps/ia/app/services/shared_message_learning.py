"""#2877 (#2385.5, niveau GLOBAL) — ce que les messages ont appris à Laura dans TOUS les espaces.

Décision Louis 11/10/2026, verbatim : « sers-toi d'un max de data possible et juste
anonymise au besoin » (élargissement daté de c92, ``c94_base_commune_capitalise_tout``).

L'API mutualise chaque nuit les signaux d'apprentissage des messages de tous les
espaces réels dans ``shared_message_learning_aggregates`` : un COMPTE par signal
(validé tel quel / retouché / rejeté, envoyé / réponse / rebond, faux fait / CTA /
persona déclarés par un relecteur), porté par au moins trois espaces, sans aucun
identifiant d'espace, jamais le CORPS d'un message (doctrine intacte).

Ce module les lit à la génération de CHAQUE message et en tire des VIGILANCES de
rédaction, citées comme venant de la base commune :

* base vide, illisible, ou aucun signal au-dessus du seuil → ``""`` — le prompt
  est celui d'avant, à l'octet près ;
* le bloc part au RÉDACTEUR (prompt système), jamais dans le texte contre lequel
  ``assert_claims_are_grounded`` vérifie les affirmations : une vigilance n'est
  pas une preuve ;
* des comptes, jamais un taux ni une probabilité ; un signal hors du vocabulaire
  fermé ne sort jamais.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.workspace_scope import resolve_workspace_id

logger = logging.getLogger(__name__)

# Le seuil d'échantillon d'une règle — MIROIR de
# `MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE` (apps/api, message-learning-signals.ts) :
# en dessous, une « règle » serait le cas isolé que #2385.1 interdit d'apprendre.
SHARED_LEARNING_MIN_COUNT = 5

# Trois espaces au moins — MIROIR de `SHARED_BASE_MIN_WORKSPACES` (packages/contracts).
# La base le tient déjà par un CHECK ; la lecture le redit, comme `readSharedCells`.
_MIN_WORKSPACES = 3

_TABLE = "shared_message_learning_aggregates"

# Signal déclaré par un relecteur → la vigilance qu'il commande. Vocabulaire fermé.
_FLAG_VIGILANCES: dict[str, str] = {
    "wrong_fact": (
        "{count} brouillons signalés « faux fait » par des relecteurs : n'affirme rien qui ne "
        "figure pas dans le dossier fourni."
    ),
    "wrong_cta": (
        "{count} appels à l'action jugés incorrects : un seul appel à l'action, simple, "
        "explicite et cohérent avec l'objectif retenu."
    ),
    "wrong_persona": (
        "{count} brouillons jugés hors persona : adresse-toi au rôle réel du destinataire, "
        "jamais à un profil générique."
    ),
}


async def _scope_for(sb: Any, user_id: str | None) -> str:
    """``demo`` pour un espace de démonstration (ses cellules semées), ``live`` sinon.

    La salle ne se mélange jamais au réel : un espace de démo lit les cellules que
    `DemoSeedService` a semées depuis des espaces FICTIFS, un espace réel les vraies.
    """
    workspace_id = await resolve_workspace_id(user_id or "", sb)
    if not workspace_id:
        return "live"
    res = await sb.table("workspaces").select("is_demo").eq("id", workspace_id).limit(1).aexecute()
    rows = getattr(res, "data", None) or []
    is_demo = isinstance(rows, list) and bool(rows) and isinstance(rows[0], dict) and rows[0].get("is_demo") is True
    return "demo" if is_demo else "live"


async def fetch_shared_message_learning(sb: Any, user_id: str | None = None) -> list[dict]:
    """Les cellules communes au seuil des trois espaces (périmètre de l'espace). Ne lève jamais : ``[]``."""
    try:
        scope = await _scope_for(sb, user_id)
        res = (
            await sb.table(_TABLE)
            .select("signal, count, contributing_workspaces")
            .eq("scope", scope)
            .gte("contributing_workspaces", _MIN_WORKSPACES)
            .aexecute()
        )
        data = getattr(res, "data", None)
        return [row for row in data if isinstance(row, dict)] if isinstance(data, list) else []
    except Exception:  # noqa: BLE001 — un contexte additif absent ne casse jamais un message
        logger.warning("Base commune — apprentissage des messages illisible, génération sans lui")
        return []


def _counts(rows: list[dict] | None) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows or []:
        signal = row.get("signal")
        try:
            count = int(row.get("count") or 0)
            workspaces = int(row.get("contributing_workspaces") or 0)
        except (TypeError, ValueError):
            continue
        if isinstance(signal, str) and workspaces >= _MIN_WORKSPACES and count > 0:
            counts[signal] = count
    return counts


def shared_message_learning_block(rows: list[dict] | None) -> str:
    """Bloc « appris dans la base commune » pour le prompt système, ou ``""``."""
    counts = _counts(rows)
    lines: list[str] = []
    for signal, template in _FLAG_VIGILANCES.items():
        count = counts.get(signal, 0)
        if count >= SHARED_LEARNING_MIN_COUNT:
            lines.append("- " + template.format(count=count))
    edited = counts.get("approved_after_edit", 0)
    as_is = counts.get("approved_without_edit", 0)
    if edited >= SHARED_LEARNING_MIN_COUNT and edited > as_is:
        lines.append(
            f"- Les commerciaux retouchent plus de brouillons qu'ils n'en valident tels quels "
            f"({edited} retouchés contre {as_is} validés sans modification) : vise un premier jet "
            "court, sobre et directement envoyable."
        )
    if not lines:
        return ""
    return (
        "\n\n===== APPRIS DANS LA BASE COMMUNE (tous les espaces, anonymisé) =====\n"
        "Ces vigilances viennent des retours mutualisés de tous les espaces Bellum — des comptes, "
        "jamais le contenu d'un message :\n"
        + "\n".join(lines)
        + "\nRègles : applique-les comme une vigilance de rédaction ; ne les cite jamais dans le "
        "message, et elles ne sont jamais une preuve pour une affirmation."
    )
