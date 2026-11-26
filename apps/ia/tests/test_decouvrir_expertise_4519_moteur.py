"""#4519 (lot moteur 25/10) — une EXPERTISE ne se relâche jamais par son libellé.

VI traduit l'expertise en métiers pour la MOISSON (``harvest_terms``). Mais deux chemins relisaient encore le libellé :
le palier d'élargissement (domaine « web » pour un libellé inconnu, ou OU mot à mot « Data » / « Intelligence » /
« Artificielle ») et le remplissage par offres fraîches. C'est ainsi qu'un compte de « Travaux de construction
spécialisés » entrait sous « Data & IA ». Sources simulées : aucun réseau.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.routers import discover as router

EXPERTISE = "Data & Intelligence Artificielle"


def test_une_expertise_n_a_aucun_palier_d_elargissement_par_libelle() -> None:
    assert router._skill_widening_steps([EXPERTISE], [], {}, 0.0, None, []) == []
    assert router._skill_widening_tried([EXPERTISE]) == []


@pytest.mark.parametrize("skill", ["Vue", "React"])
def test_une_competence_garde_ses_paliers(skill: str) -> None:
    assert router._skill_widening_steps([skill], [], {}, 0.0, None, [])


def test_la_saisie_libre_multi_mots_garde_son_palier_ou() -> None:
    # La garde dit NON seulement pour une expertise du catalogue, pas pour toute saisie à plusieurs mots.
    assert router._skill_widening_steps(["archi cyber"], [], {}, 0.0, None, [])


def test_le_remplissage_cherche_les_metiers_pas_le_libelle() -> None:
    from types import SimpleNamespace

    asked: list[list[str]] = []

    async def fake_fill(skills, pool, **_k):
        asked.append(list(skills))
        return [], {}

    req = SimpleNamespace(spaceKey="sp", profile_data={})
    filters = SimpleNamespace(
        model_copy=lambda update: filters,
        headcountRanges=None,
        headcountMin=None,
        headcountMax=None,
    )
    with (
        patch.object(router, "_collect_for_request", AsyncMock(return_value=[])),
        patch.object(router.fresh_jobs, "fill_skill_accounts", fake_fill),
    ):
        asyncio.run(router._fill_skill_search(req, filters, [EXPERTISE], [], {}, 20, [], {}, 1e12, 1e12))
    assert asked, "le remplissage n'a pas été lancé"
    assert EXPERTISE not in asked[0]
    assert "data engineer" in [t.lower() for t in asked[0]]
