"""Ce qui est ACCESSOIRE ne doit jamais emporter le livrable.

Deux travaux tournent dans le budget de la phase de plan APRÈS que le plan est
écrit — la mesure de self-consistency (jusqu'à trois appels modèle de plus) et
l'alimentation de la base de connaissance (un plongement + une écriture par
document). Les deux se déclarent « ne casse jamais le run », ce qui était vrai
de leurs ERREURS et faux de leur TEMPS : sur un run réel, la phase a expiré alors
que le plan était prêt depuis deux minutes.

Ces tests rejouent exactement ça : un travail annexe qui traîne, et un livrable
qui doit partir quand même.
"""

from __future__ import annotations

import asyncio

import pytest

from app.graph import nodes
from app.routers import phase4_plan


class TestSelfConsistencyBudget:
    """La mesure a son propre budget, et l'abandonner ne coûte que la mesure."""

    @pytest.mark.asyncio
    async def test_une_mesure_trop_lente_est_abandonnee_pas_le_plan(self, monkeypatch):
        started = asyncio.Event()

        async def _slow(**_kwargs):
            started.set()
            await asyncio.sleep(30)
            raise AssertionError("la mesure aurait dû être annulée")

        monkeypatch.setattr(phase4_plan, "measure_self_consistency", _slow)
        monkeypatch.setenv("SELF_CONSISTENCY_BUDGET_S", "0.05")

        block, usages = await phase4_plan._measure_self_consistency_bounded(
            system_prompt="s", company_name="ACME", profile={}, account_data={},
            evaluation=None, plays=[], contacts=[], correlation_id="cid",
        )

        # « Pas de mesure » est exactement ce que le module rend déjà quand une
        # section échoue : l'appelant n'a pas de cas de plus à traiter.
        assert block is None
        assert usages == []
        assert started.is_set()

    @pytest.mark.asyncio
    async def test_une_mesure_dans_les_temps_est_rendue_telle_quelle(self, monkeypatch):
        async def _fast(**_kwargs):
            return {"score": {"confidence": "haute"}}, ["usage"]

        monkeypatch.setattr(phase4_plan, "measure_self_consistency", _fast)
        monkeypatch.setenv("SELF_CONSISTENCY_BUDGET_S", "5")

        block, usages = await phase4_plan._measure_self_consistency_bounded(
            system_prompt="s", company_name="ACME", profile={}, account_data={},
            evaluation=None, plays=[], contacts=[], correlation_id="cid",
        )

        assert block == {"score": {"confidence": "haute"}}
        assert usages == ["usage"]

    @pytest.mark.parametrize("raw", ["", "zéro", "0", "-1"])
    def test_un_reglage_casse_retombe_sur_le_defaut(self, monkeypatch, raw):
        # Un budget vide, négatif ou illisible désarmerait la garde qu'on vient
        # de poser — c'est le mode de panne le plus discret d'un réglage.
        monkeypatch.setenv("SELF_CONSISTENCY_BUDGET_S", raw)
        assert phase4_plan._self_consistency_budget_s() == 60.0

    def test_un_reglage_valide_est_respecte(self, monkeypatch):
        monkeypatch.setenv("SELF_CONSISTENCY_BUDGET_S", "12.5")
        assert phase4_plan._self_consistency_budget_s() == 12.5


class TestBoundedBestEffort:
    """Le travail annexe est annulé au budget ; l'annulation VENUE DE DEHORS passe."""

    @pytest.mark.asyncio
    async def test_un_travail_annexe_trop_lent_est_annule_et_l_analyse_continue(self):
        async def _slow():
            await asyncio.sleep(30)

        await nodes._bounded_best_effort(_slow(), budget_s=0.05, label="écriture")
        # Aucune exception : c'est tout le contrat. L'appelant n'a rien à gérer.

    @pytest.mark.asyncio
    async def test_un_travail_annexe_rapide_va_au_bout(self):
        done: list[str] = []

        async def _fast():
            done.append("écrit")

        await nodes._bounded_best_effort(_fast(), budget_s=5, label="écriture")
        assert done == ["écrit"]

    @pytest.mark.asyncio
    async def test_une_annulation_venue_de_dehors_remonte(self):
        """Le budget de phase doit continuer d'arrêter la phase.

        Attraper `CancelledError` dans le garde-fou l'aurait avalée : la phase
        aurait survécu à son propre budget, ce qui est précisément la panne que
        les budgets existent pour produire.
        """

        async def _slow():
            await asyncio.sleep(30)

        task = asyncio.ensure_future(
            nodes._bounded_best_effort(_slow(), budget_s=30, label="écriture")
        )
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
