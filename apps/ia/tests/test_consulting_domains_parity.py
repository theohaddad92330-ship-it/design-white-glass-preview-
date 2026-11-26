"""Parité de la taxonomie des 66 domaines — TS (source de vérité) ↔ Python.

``packages/contracts/src/schemas/consulting-domains.ts`` est la source ;
``app/services/offer_domains/portfolio.py`` en est la copie embarquée (le
service IA n'a pas le paquet contracts à l'exécution). Ce test lit le fichier
TS et compare ENTRÉE PAR ENTRÉE — même discipline que la copie embarquée des
schémas partagés (`test_shared_schemas.py`). Il tourne en CI (monorepo présent)
et se saute proprement dans une image Railway (fichier absent).

Leçon « garde borgne » appliquée : le test PROUVE qu'il lit quelque chose
(66 entrées extraites, pas zéro) avant de comparer.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.offer_domains.portfolio import (
    CONSULTING_DOMAIN_TABLE,
    PACK_PRIORITY,
    dominant_pack,
    portfolio_names_fr,
)

_TS_REL = Path("packages/contracts/src/schemas/consulting-domains.ts")
_ONBOARDING_REL = Path("packages/contracts/src/schemas/onboarding.ts")


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _strip_line_comments(source: str) -> str:
    """Retire les commentaires AVANT extraction.

    Leçon GA-08, appliquée ici parce que le bloc ``OFFER_DOMAINS`` porte
    désormais un commentaire par valeur ajoutée : une apostrophe française ou un
    mot cité dans un commentaire se lit exactement comme une valeur d'enum, et
    la garde compare alors du bruit à du bruit.
    """
    return re.sub(r"//.*$", "", source, flags=re.MULTILINE)


def offer_domains_from_contract(path: Path | None = None) -> tuple[str, ...] | None:
    """``OFFER_DOMAINS`` lu dans le contrat TS — ``None`` si le monorepo est absent."""
    source_path = path or _monorepo_file(_ONBOARDING_REL)
    if source_path is None:
        return None
    source = _strip_line_comments(source_path.read_text(encoding="utf-8"))
    match = re.search(r"export const OFFER_DOMAINS = \[([^\]]*)\] as const", source)
    if match is None:
        return None
    return tuple(re.findall(r"'([a-z_]+)'", match.group(1)))


def _ts_entries() -> dict[str, tuple[str, str]]:
    """code → (pack, labelFr) extraits du fichier TS, guillemets simples ou doubles."""
    source_path = _monorepo_file(_TS_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    source = source_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"\{\s*code:\s*'([A-Z0-9_]+)',\s*group:\s*'[a-z_]+',\s*pack:\s*'([a-z_]+)',"
        r"\s*labelFr:\s*(?:'((?:[^'\\]|\\')*)'|\"([^\"]*)\")",
    )
    entries: dict[str, tuple[str, str]] = {}
    for match in pattern.finditer(source):
        label = match.group(3) if match.group(3) is not None else match.group(4)
        entries[match.group(1)] = (match.group(2), label.replace("\\'", "'"))
    return entries


def test_python_table_mirrors_ts_source_entry_by_entry() -> None:
    entries = _ts_entries()
    # La garde LIT quelque chose : 66 entrées, pas un fichier mal parsé.
    assert len(entries) == 66, f"extraction TS: {len(entries)} entrées au lieu de 66"
    assert set(entries) == set(CONSULTING_DOMAIN_TABLE)
    for code, (pack, label_fr) in entries.items():
        assert CONSULTING_DOMAIN_TABLE[code][0] == pack, f"{code}: pack divergent"
        assert CONSULTING_DOMAIN_TABLE[code][1] == label_fr, f"{code}: libellé FR divergent"


def test_pack_priority_mirrors_offer_domains() -> None:
    onboarding = _monorepo_file(_ONBOARDING_REL)
    if onboarding is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    ts_order = offer_domains_from_contract(onboarding)
    assert ts_order is not None
    assert ts_order == PACK_PRIORITY


def test_dominant_pack_majority_and_tie_break() -> None:
    assert dominant_pack(["FINANCE_FPNA", "TREASURY_WC", "SW_ENGINEERING"]) == "finance"
    # Égalité 1-1 : esn_it vient d'abord dans PACK_PRIORITY.
    assert dominant_pack(["FINANCE_FPNA", "SW_ENGINEERING"]) == "esn_it"
    # Code inconnu ignoré, jamais deviné ; rien de connu → None.
    assert dominant_pack(["DOMAINE_INVENTE"]) is None
    assert dominant_pack([]) is None
    assert dominant_pack(None) is None
    assert dominant_pack(["DOMAINE_INVENTE", "HRIS_PAYROLL"]) == "rh"


def test_portfolio_names_keep_order_and_drop_unknown() -> None:
    assert portfolio_names_fr(["RISK_COMPLIANCE_AML", "INCONNU", "PMO_PORTFOLIO"]) == [
        "Risques, conformité, AML/KYC, réglementaire & modèles",
        "PMO, portefeuille, programme & gestion de projet",
    ]
