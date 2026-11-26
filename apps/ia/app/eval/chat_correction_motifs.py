"""#2899 (#2278.40) — LES CORRECTIONS HUMAINES COMME CAS GOLDEN : MOTIF ANONYMISÉ AGRÉGÉ SEULEMENT.

Décision Louis (16-17/10) : les corrections que les utilisateurs apportent aux réponses de Laura
(`chat_reply_feedback`, `reply-feedback.service.ts`) alimentent le corpus golden — mais JAMAIS le corps du message,
JAMAIS la personne (doctrine c64, GA-240). Le seul pont autorisé est l'agrégat PAR FONCTION que l'API publie déjà
(`GET /internal/analytics/reply-contestations`, GA-412, plancher de réponses distinctes appliqué côté API ET
re-vérifié ici) : « la fonction X est corrigée N fois sur M retours » devient un cas golden d'attention.

Un motif ne porte que : la fonction (un identifiant d'outil), des COMPTES, sa source et sa provenance. Toute autre
clé de la réponse est ignorée (jamais copiée), un nom de fonction qui n'a pas la forme d'un identifiant d'outil est
refusé (un texte libre n'est pas une fonction).

No-op strict sans pont (`API_INTERNAL_URL` / `INTERNAL_API_SECRET`) : « non mesuré », jamais « aucune correction ».
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.services import bellum_api

#: Les SEULES clés d'un motif — ni auteur, ni espace, ni compte, ni note, ni valeur corrigée.
ALLOWED_MOTIF_KEYS: tuple[str, ...] = (
    "identifiant",
    "tool",
    "replies",
    "feedbacks",
    "contested",
    "corrected",
    "source",
    "provenance",
)

#: Un identifiant d'outil : minuscules, chiffres, underscore. Un texte libre (espaces, majuscules, ponctuation) n'en est pas un.
_TOOL_ID = re.compile(r"^[a-z][a-z0-9_]{1,63}$")

#: `ChatCorpusSource.EXPORT_CORRECTIONS` — « leurs corrections » (#2443.2).
_SOURCE = "export_corrections"
_PROVENANCE = "anonymise_agrege"
_DEFAULT_FLOOR = 3


@dataclass(frozen=True)
class CorrectionMotifReport:
    measured: bool
    motifs: list[dict[str, Any]] = field(default_factory=list)


def _count(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def golden_motifs_from_report(report: Any) -> list[dict[str, Any]]:
    """Les motifs golden d'un agrégat de contestations. Pur, sans I/O."""
    if not isinstance(report, dict) or not isinstance(report.get("byTool"), list):
        return []
    floor = _count(report.get("minDistinctReplies"))
    floor = floor if floor else _DEFAULT_FLOOR
    out: list[dict[str, Any]] = []
    for row in report["byTool"]:
        if not isinstance(row, dict):
            continue
        tool = row.get("tool")
        counts = {key: _count(row.get(key)) for key in ("replies", "feedbacks", "contested", "corrected")}
        if not isinstance(tool, str) or not _TOOL_ID.match(tool) or any(v is None for v in counts.values()):
            continue
        # Sous le plancher : jamais publié ; zéro correction : pas un motif (« non corrigé » n'est pas un cas).
        if counts["replies"] < floor or counts["corrected"] < 1:  # type: ignore[operator]
            continue
        out.append(
            {
                "identifiant": f"correction-motif/{tool}",
                "tool": tool,
                **counts,
                "source": _SOURCE,
                "provenance": _PROVENANCE,
            }
        )
    return sorted(out, key=lambda case: (-case["corrected"], case["tool"]))


async def load_correction_motifs(days: int = 90) -> CorrectionMotifReport:
    """Relit l'agrégat par le pont. Pont éteint ou en échec ⇒ `measured=False` (jamais « aucune correction »)."""
    report = await bellum_api.reply_contestations(days)
    if report is None:
        return CorrectionMotifReport(measured=False)
    return CorrectionMotifReport(measured=True, motifs=golden_motifs_from_report(report))
