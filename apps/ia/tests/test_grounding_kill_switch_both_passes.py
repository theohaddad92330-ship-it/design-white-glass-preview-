"""GA-315 — GROUNDING_DISABLED coupe LES DEUX passes de citations, pas une seule.

LE REVIREMENT (LOT 13, D169, 12/09/2026) : le lot précédent avait constaté que
seule ``ground_facts_v2`` écoutait ``GROUNDING_DISABLED`` (``cite_key_facts``,
la passe B3+ qui alimente ``sources.citations``, n'avait AUCUNE garde) et avait
choisi de le DOCUMENTER plutôt que de le corriger — étendre un interrupteur
change ce que le produit fait en incident, une décision produit. Louis a
tranché : étendre la garde. Sa raison : un interrupteur d'incident doit couper
ce que son NOM annonce ; on le pose au pire moment, sous pression, sans le
temps de se souvenir qu'il ne coupe qu'une moitié. Le dossier qui sort sans
citations pendant la coupure est le BUT recherché, pas un effet de bord.

Ce fichier prouve, dans l'ordre que la garde exige (même méthode que
``test_rag_knowledge_llm_rerank_kill_switch.py``, GA-304) :
  1. ``TestSansVariableCheminInchange`` — SANS ``GROUNDING_DISABLED``, le
     chemin est BYTE-IDENTIQUE à avant ce lot : les DEUX passes appellent
     Claude, une fois chacune, avec les mêmes arguments qu'aujourd'hui.
  2. ``TestAvecVariablePoseeLesDeuxPassesSeTaisent`` — AVEC la variable posée
     à une valeur truthy, ZÉRO appel modèle, sur LES DEUX passes.
  3. ``TestNeCoupeQueCePerimetre`` — la garde n'attrape rien d'autre : la
     construction des documents citables (``build_cite_docs`` /
     ``registry_evidence_doc``, testés ailleurs) ne lit pas l'interrupteur, et
     une valeur non-truthy laisse les deux passes actives.

La preuve que la garde SAIT DIRE NON est jouée à la main (pas encodée en test
permanent, qui ne serait qu'un second court-circuit à maintenir) : retirer le
``disabled(GROUNDING_KILL_SWITCH)`` de ``cite_key_facts`` fait tomber
``test_les_deux_passes_ne_font_aucun_appel_modele`` — voir le rapport du lot
pour la sortie brute.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services import grounding_citations as gc
from app.services.claude_service import TokenUsage
from app.services.kill_switch import GROUNDING_KILL_SWITCH

_DOCS = [{"title": "Registre", "text": "SIREN 794 598 813 — Doctolib"}]
_FACTS = {"siren": "794598813"}


def _seam(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """Un seul point d'entrée réseau pour les deux passes — un compte de zéro
    appel ici vaut pour les deux à la fois."""
    seam = AsyncMock(
        return_value=("{}", [], TokenUsage(input_tokens=1, output_tokens=1, model="m", cost_usd=0.0))
    )
    monkeypatch.setattr(gc, "call_claude_with_citations", seam)
    return seam


class TestSansVariableCheminInchange:
    """1 — sans ``GROUNDING_DISABLED``, rien ne change : deux appels, un par passe."""

    async def test_les_deux_passes_appellent_claude_une_fois_chacune(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv(GROUNDING_KILL_SWITCH, raising=False)
        seam = _seam(monkeypatch)

        citations, cite_usage = await gc.cite_key_facts("Doctolib", _FACTS, _DOCS)
        grounding, g_usage = await gc.ground_facts_v2("Doctolib", _FACTS, _DOCS)

        assert seam.await_count == 2
        prompt_names = [call.kwargs.get("prompt_name") for call in seam.await_args_list]
        assert prompt_names == ["grounding_citations", "grounding_v2"]
        assert cite_usage is not None
        assert grounding is not None and grounding["flag"] == "GROUNDING_V2"


class TestAvecVariablePoseeLesDeuxPassesSeTaisent:
    """2 — ``GROUNDING_DISABLED`` posé ⇒ zéro appel modèle, sur les DEUX passes."""

    async def test_les_deux_passes_ne_font_aucun_appel_modele(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv(GROUNDING_KILL_SWITCH, "true")
        seam = _seam(monkeypatch)

        citations, cite_usage = await gc.cite_key_facts("Doctolib", _FACTS, _DOCS)
        grounding, g_usage = await gc.ground_facts_v2("Doctolib", _FACTS, _DOCS)

        seam.assert_not_awaited()  # ZÉRO appel modèle, les deux passes confondues
        assert (citations, cite_usage) == ([], None)
        assert (grounding, g_usage) == (None, None)

    @pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on"])
    async def test_valeurs_truthy_variees_coupent_les_deux(
        self, monkeypatch: pytest.MonkeyPatch, value: str
    ) -> None:
        monkeypatch.setenv(GROUNDING_KILL_SWITCH, value)
        seam = _seam(monkeypatch)

        await gc.cite_key_facts("Doctolib", _FACTS, _DOCS)
        await gc.ground_facts_v2("Doctolib", _FACTS, _DOCS)

        seam.assert_not_awaited()


class TestNeCoupeQueCePerimetre:
    """3 — la garde n'attrape rien qu'elle ne vise pas."""

    async def test_valeur_non_truthy_laisse_les_deux_passes_actives(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv(GROUNDING_KILL_SWITCH, "off")
        seam = _seam(monkeypatch)

        await gc.cite_key_facts("Doctolib", _FACTS, _DOCS)
        await gc.ground_facts_v2("Doctolib", _FACTS, _DOCS)

        assert seam.await_count == 2

    def test_la_construction_des_documents_citables_ne_lit_pas_linterrupteur(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """``build_cite_docs`` (partagé par les deux passes) est un pur
        assemblage de données déjà collectées — il n'a pas à consulter le
        kill-switch, seul l'appel réseau doit s'arrêter."""
        monkeypatch.setenv(GROUNDING_KILL_SWITCH, "true")
        avec = gc.build_cite_docs(_FACTS, [{"title": "p", "text": "contenu"}])
        monkeypatch.delenv(GROUNDING_KILL_SWITCH, raising=False)
        sans = gc.build_cite_docs(_FACTS, [{"title": "p", "text": "contenu"}])
        assert avec == sans
