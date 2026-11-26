"""#4646 (Louis 27/10) — les offres qui ont fait SORTIR un compte de Découvrir arrivent dans son dossier.

Recopier ET rejouer : les offres que la carte de Découvrir affichait sont recopiées dans les signaux du dossier
(intitulé, date de l'offre, « vue le JJ/MM dans Découvrir »), en tête ; la collecte du compte est rejouée avec les
COMPÉTENCES cherchées (``run_cadrage.explicit_terms``). Si le rejeu ne retrouve pas une offre, elle RESTE : rien ne
disparaît. Si le rejeu la retrouve, elle n'est pas doublée (la trouvée gagne).

Sans origine Découvrir (portefeuille, saisie directe), chaque fonction rend son entrée telle quelle : un run hors
Découvrir reste byte-identique. Aucune date inventée : sans date d'observation transmise, on dit la date de l'offre.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from datetime import date
from typing import Any

#: Offres recopiées au plus (même borne que ``EVIDENCE_OFFERS_MAX`` côté Découvrir et le contrat des critères).
CARRIED_OFFERS_MAX = 10
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LINK = re.compile(r"^https?://\S+$", re.IGNORECASE)


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return " ".join(re.findall(r"[a-z0-9+#./]+", text))


def _iso(value: object) -> str | None:
    text = str(value or "").strip()
    if not _ISO.match(text):
        return None
    try:
        date.fromisoformat(text)
    except ValueError:
        return None
    return text


def _dm(iso: str) -> str:
    return f"{iso[8:10]}/{iso[5:7]}"


def carried_skills(seller_hypotheses: Mapping[str, Any] | None) -> tuple[str, ...]:
    """Les compétences que la recherche Découvrir a posées, ou ``()``."""
    raw = (seller_hypotheses or {}).get("discover_origin_skills")
    if not isinstance(raw, list):
        return ()
    return tuple(dict.fromkeys(s.strip() for s in raw if isinstance(s, str) and s.strip()))


def carried_offer_signals(seller_hypotheses: Mapping[str, Any] | None) -> list[dict]:
    """Les offres de Découvrir, au format d'un signal de recrutement du dossier (``fromDiscover``)."""
    raw = (seller_hypotheses or {}).get("discover_origin_offers")
    if not isinstance(raw, list):
        return []
    rows: list[dict] = []
    for item in raw[:CARRIED_OFFERS_MAX]:
        if not isinstance(item, Mapping):
            continue
        title = " ".join(str(item.get("title") or "").split())
        if not title:
            continue
        # #4646.2 — le lien de l'annonce, tel que la carte de Découvrir le portait : http(s) seulement, jamais inventé.
        url = str(item.get("url") or "").strip()
        link = url if _LINK.match(url) else None
        published = _iso(item.get("date"))
        seen = _iso(item.get("seen"))
        if seen:
            detail = f"vue le {_dm(seen)} dans Découvrir"
        elif published:
            detail = f"offre du {_dm(published)} relevée dans Découvrir"
        else:
            detail = "relevée dans Découvrir"
        rows.append(
            {
                "name": None,
                "siren": None,
                "title": title,
                "source": "discover",
                "fromDiscover": True,
                "seenOn": seen,
                "signal": {
                    "type": "hiring",
                    "label": f"Recrutement — {title}",
                    "date": published,
                    "url": link,
                    "detail": detail,
                },
            }
        )
    return rows


def _title_of(row: object) -> str:
    if not isinstance(row, Mapping):
        return ""
    signal = row.get("signal") if isinstance(row.get("signal"), Mapping) else {}
    label = str(signal.get("label") or "")
    return _fold(row.get("title") or label.split("—", 1)[-1])


def with_carried_offers(jobs: list, seller_hypotheses: Mapping[str, Any] | None) -> list:
    """Les signaux de recrutement du dossier, offres de Découvrir EN TÊTE ; celles que la collecte a retrouvées
    (même intitulé) ne sont pas doublées. Sans offre transmise : la MÊME liste (``is``)."""
    carried = carried_offer_signals(seller_hypotheses)
    if not carried:
        return jobs
    known = {_title_of(row) for row in jobs}
    fresh = [row for row in carried if _fold(row["title"]) not in known]
    return [*fresh, *jobs] if fresh else jobs


def carried_unfound_count(jobs: list, seller_hypotheses: Mapping[str, Any] | None) -> int:
    """Combien d'offres de Découvrir la collecte du compte n'a PAS retrouvées (#4646.7) : celles que le dossier
    garde recopiées. 0 hors Découvrir — le compteur de la cascade ne dit alors rien de plus."""
    carried = carried_offer_signals(seller_hypotheses)
    if not carried:
        return 0
    known = {_title_of(row) for row in jobs}
    return sum(1 for row in carried if _fold(row["title"]) not in known)
