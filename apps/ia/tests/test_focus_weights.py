"""Le focus du plan — la copie Python ne DÉRIVE pas du contrat.

CE QUE CETTE GARDE PROTÈGE
--------------------------
Un seuil vit à UN seul endroit (GA-26). Le nôtre vit dans
``packages/contracts/src/schemas/org-focus-weights.ts`` ; le service IA en tient
une copie (``app/services/focus_weights.py``) parce que ``packages/contracts``
n'est pas dans son image déployée — même raison, exactement, que la copie
embarquée des JSON Schemas.

**Une copie dérive.** Celle des schémas a sa garde
(``test_shared_schemas.py::TestVendoredCopy``, comparaison octet par octet) ;
celle-ci a la sienne. Elle LIT le fichier TypeScript, en extrait les valeurs, et
compare AXE PAR AXE — un message qui dit « `itChallenges` : contrat 4, copie 6 »
se corrige en dix secondes, un « les tables diffèrent » se corrige en dix
minutes.

CE QU'ELLE NE PEUT PAS FAIRE
----------------------------
Elle lit une SOURCE, pas un runtime : elle prouve que les deux tables disent la
même chose, pas que le prompt les applique. C'est ``test_plan_focus_weights``
ci-dessous qui exécute le vrai ``_trim_account_data``.

⚠️ En production, le fichier TypeScript n'est PAS sur le disque (contexte de
build ``apps/ia``). La garde le dit et se SAUTE alors, plutôt que d'échouer sur
une absence qui n'est pas un défaut — elle tourne en CI, où le dépôt est complet,
et le test d'exhaustivité ci-dessous garantit qu'elle ne se saute pas en silence
là où elle devrait mordre.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.routers.phase4_plan import _trim_account_data
from app.services.focus_weights import (
    FOCUS_AXES,
    FOCUS_DEFAULT_WEIGHTS,
    FOCUS_WEIGHT_MAX,
    resolve_focus_weights,
)


def _contract_path() -> Path | None:
    """``packages/contracts/src/schemas/org-focus-weights.ts``, ou ``None`` hors monorepo."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "packages" / "contracts" / "src" / "schemas" / "org-focus-weights.ts"
        if candidate.is_file():
            return candidate
    return None


def _contract_weights(source: str) -> dict[str, int]:
    """Les valeurs de ``ORG_FOCUS_DEFAULT_WEIGHTS``, extraites du bloc NOMMÉ.

    On découpe sur la déclaration elle-même, pas sur le fichier entier : sans
    cela, un exemple chiffré dans un commentaire, ou une seconde table ajoutée
    plus bas, entrerait dans la mesure — et la garde comparerait autre chose que
    ce qu'elle croit.
    """
    start = source.index("export const ORG_FOCUS_DEFAULT_WEIGHTS")
    body = source[source.index("{", start) : source.index("}", start)]
    return {axis: int(value) for axis, value in re.findall(r"^\s*(\w+):\s*(\d+),", body, re.M)}


# ── La copie ne dérive pas ─────────────────────────────────────────────────


def test_la_copie_python_dit_exactement_ce_que_dit_le_contrat() -> None:
    path = _contract_path()
    if path is None:  # pragma: no cover - déploiement, pas CI
        pytest.skip("packages/contracts absent (image du service IA) — la garde tourne en CI")

    contract = _contract_weights(path.read_text(encoding="utf8"))

    # Anti-vacuité : un extracteur cassé rendrait {} et tout passerait au vert.
    assert len(contract) == len(FOCUS_AXES), f"le contrat déclare {len(contract)} axes, la copie {len(FOCUS_AXES)}"

    divergences = [
        f"{axis} : contrat {contract.get(axis)!r}, copie {FOCUS_DEFAULT_WEIGHTS.get(axis)!r}"
        for axis in sorted(set(contract) | set(FOCUS_DEFAULT_WEIGHTS))
        if contract.get(axis) != FOCUS_DEFAULT_WEIGHTS.get(axis)
    ]
    assert not divergences, (
        "La copie Python a dérivé du contrat. Un seuil vit à UN seul endroit : "
        "corrige packages/contracts/src/schemas/org-focus-weights.ts, puis reporte "
        "la valeur ici.\n  · " + "\n  · ".join(divergences)
    )


def test_l_extracteur_sait_dire_non() -> None:
    """Sans ceci, une expression régulière cassée passerait au vert pour toujours."""
    faux = """
export const ORG_FOCUS_DEFAULT_WEIGHTS: Readonly<Record<OrgFocusAxis, number>> = {
  itChallenges: 99,
  pains: 6,
}
"""
    assert _contract_weights(faux) == {"itChallenges": 99, "pains": 6}
    assert _contract_weights(faux) != FOCUS_DEFAULT_WEIGHTS


# ── La résolution : le défaut, et ce qu'un espace peut en faire ────────────


def test_un_espace_qui_n_a_rien_regle_obtient_le_defaut() -> None:
    """La propriété qui rend ce lot sans risque : mettre en configuration ne
    change AUCUN plan tant que personne n'a réglé quoi que ce soit."""
    assert resolve_focus_weights(None) == FOCUS_DEFAULT_WEIGHTS
    assert resolve_focus_weights({}) == FOCUS_DEFAULT_WEIGHTS
    assert resolve_focus_weights("pas un dict") == FOCUS_DEFAULT_WEIGHTS


def test_une_esn_sans_IT_peut_retirer_completement_l_axe_IT() -> None:
    """Zéro est une valeur LÉGITIME — c'est tout l'objet du réglage. « Jamais un
    prisme IT par défaut » ne veut pas dire « un peu moins d'IT »."""
    resolved = resolve_focus_weights({"itChallenges": 0, "pains": 10})
    assert resolved["itChallenges"] == 0
    assert resolved["pains"] == 10
    # Les axes non réglés gardent leur défaut.
    assert resolved["angles"] == FOCUS_DEFAULT_WEIGHTS["angles"]


def test_un_reglage_aberrant_est_borne_plutot_que_fatal() -> None:
    resolved = resolve_focus_weights({"itChallenges": 9999, "pains": -3, "angles": "beaucoup"})
    assert resolved["itChallenges"] == FOCUS_WEIGHT_MAX
    assert resolved["pains"] == 0
    # Illisible = on retombe sur le défaut, jamais sur une valeur inventée.
    assert resolved["angles"] == FOCUS_DEFAULT_WEIGHTS["angles"]


def test_un_axe_inconnu_est_ignore_sans_faire_echouer_le_run() -> None:
    """Un réglage périmé (l'axe a disparu du prompt) ne doit pas empêcher de
    produire un plan."""
    assert resolve_focus_weights({"axeDisparu": 3}) == FOCUS_DEFAULT_WEIGHTS


# ── Et le prompt les APPLIQUE réellement ───────────────────────────────────


def test_le_plan_applique_vraiment_les_poids_de_l_espace() -> None:
    """La preuve qui compte : le vrai ``_trim_account_data``, pas la table.

    Un poids juste que personne n'applique est le défaut n°1 de ce dépôt.
    """
    account = {"itChallenges": [{"label": f"defi-{i}"} for i in range(12)]}

    par_defaut = _trim_account_data(dict(account))
    assert len(par_defaut["itChallenges"]) == FOCUS_DEFAULT_WEIGHTS["itChallenges"] == 6

    sans_it = _trim_account_data(dict(account), {"itChallenges": 0})
    assert sans_it["itChallenges"] == []

    plus_it = _trim_account_data(dict(account), {"itChallenges": 11})
    assert len(plus_it["itChallenges"]) == 11
