"""Primitives de requête TERRITOIRE partagées par les sources de liste.

Découvrir v2 interroge BOAMP, DECP et France Travail sur le même axe — un
département et une fenêtre de dates. Ces deux normalisations vivent ici plutôt
que dans l'une des trois sources, pour qu'aucune source n'ait à dépendre d'une
autre (chaque source reste retirable isolément).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta


def normalize_department(department: str | None) -> str | None:
    """Code département utilisable ('69', '2A', '971'), ou None.

    Alphanumérique strict : cette valeur est injectée dans un littéral ODSQL,
    donc rien qui puisse s'en échapper (guillemet, antislash, opérateur).
    """
    cleaned = "".join(ch for ch in str(department or "") if ch.isalnum()).upper()[:3]
    return cleaned or None


def since_date(since_days: int) -> str:
    """Borne basse de la fenêtre au format date ODSQL (YYYY-MM-DD)."""
    days = max(1, int(since_days or 1))
    return (datetime.now(UTC) - timedelta(days=days)).date().isoformat()
