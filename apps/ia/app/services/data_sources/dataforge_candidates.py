"""DataForge/ORION comme source de CANDIDATS pour Découvrir — #2805 (#2291.3).

`OrionAccountsService.searchCandidates()` (apps/api, `fa5f0de2`) répondait déjà
à « quels comptes du référentiel ORION ressemblent à ce qu'on cherche ? » et
`DataforgeCandidatesController` (`internal/dataforge/candidates`) l'exposait —
mais Découvrir (`/discover/registry`) ne l'appelait pas encore : c'était le
RESTE nommé par les deux lots de nuit précédents sur cette épopée. Ce module
est ce branchement.

APPOINT, jamais structurant (`graceful_empty`, voir `source_registry.py`) : le
pack ORION qualifie un nombre restreint de comptes déjà choisis (statuts
`CIBLE_PRIORITAIRE`/`CIBLE_SECONDAIRE` par défaut, côté `searchCandidates`),
pas un registre à égaler en volume. Sans `API_INTERNAL_URL`/
`INTERNAL_API_SECRET`, ou sur toute panne du pont, `[]` — la liste registre
reste intacte, jamais un compte inventé pour compenser.

Champs que ce pack NE connaît PAS (NAF précis, département, tranche
d'effectif normalisée, date de création) restent `None` — jamais déduits de
`sector`/`headquarters`, qui décrivent autre chose.
"""

from __future__ import annotations

import re
from typing import Any

from app.services import bellum_api

_SIREN_RE = re.compile(r"^\d{9}$")


def _clean_siren(value: Any) -> str:
    """Un SIREN réel (9 chiffres), ou une chaîne vide — jamais un SIRET (14
    chiffres) tronqué : deviner les 9 premiers chiffres d'un SIRET n'est pas
    la même chose que lire un SIREN, et ce module ne devine pas."""
    digits = re.sub(r"[\s.\-]", "", value) if isinstance(value, str) else ""
    return digits if _SIREN_RE.match(digits) else ""


async def dataforge_candidates(*, sector: str | None, limit: int) -> list[dict[str, Any]]:
    """Candidats DataForge, projetés sur les champs FACTUELS du contrat
    registre (même forme que `_registry_row`, `routers/discover.py`) — pour
    que l'appelant puisse les fusionner à la liste registre sans les
    distinguer. Une ligne sans SIREN valide ou sans nom est écartée, jamais
    rendue à moitié vraie."""
    if limit <= 0:
        return []
    rows = await bellum_api.dataforge_candidates(sector=sector, limit=limit)
    if not rows:
        return []

    candidates: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        siren = _clean_siren(row.get("sirenSiret"))
        entreprise = row.get("entreprise")
        name = entreprise.strip() if isinstance(entreprise, str) else ""
        if not siren or not name:
            continue
        candidates.append(
            {
                "name": name,
                "siren": siren,
                "nafCode": None,
                "sector": row.get("sector") or None,
                "city": row.get("headquarters") or None,
                "department": None,
                "headcountRange": None,
                "creationDate": None,
                "sizeClass": None,
                "headcountTranche": None,
                "establishmentCount": None,
                "legalCategory": None,
                "ceased": False,
            }
        )
    return candidates
