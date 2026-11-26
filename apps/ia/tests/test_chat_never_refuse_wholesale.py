"""#1950.1 / #1950.21 / #1950.28 — un refus n'efface jamais ce qui a marché.

Un refus global (« une erreur est survenue ») efface la différence entre trois
choses que rien ne permet plus de distinguer ensuite : ce qui est INTERDIT, ce
qui est ABSENT, et ce qui n'a pas été MESURÉ. La doctrine du dépôt tranche déjà
le cas voisin — « non mesuré » n'est jamais « 0 » — et #1957.11/.12 l'avait
appliquée à UNE branche : le dépassement de temps montre ce que les outils
avaient déjà lu, daté, nommé partiel.

Ce que ces gardes tiennent, et pourquoi chacune peut dire NON :

1. LE JUMEAU. La branche d'à côté — une panne IMPRÉVUE (`except Exception` de
   `_run_chat_turn`) — jetait l'accumulateur avec la coroutine et rendait « Une
   erreur est survenue côté assistant. » SEULE, alors que des outils avaient pu
   terminer. C'est le défaut « une règle écrite pour un cas et pas pour son
   jumeau ». La garde exerce le VRAI routeur, avec un orchestrateur qui lit puis
   lève.
2. LE TÉMOIN. Rien de lu ⇒ la carte générique reste byte-identique. On ne
   fabrique pas un « résultat partiel » à partir de rien : ce serait une donnée
   fictive, et un « still_possible » inventé dirait à la personne que quelque
   chose reste faisable sans que rien ne le prouve.
3. UNE PROPOSITION N'EST PAS UN RÉSULTAT. Une carte préparée (`pending_
   confirmation`) ou un outil en erreur n'ont RIEN lu — ils ne se présentent
   jamais comme récupérés. Même règle que son jumeau (`_retrieved_sources`).
4. LE PROMPT. Aucune règle n'interdisait à Laura un refus global, et surtout
   aucune ne distinguait une capacité ÉTEINTE d'une capacité en PANNE. Le
   dépôt a déjà payé ce défaut à l'écran (« un écran qui lit ce qui MANQUE sans
   lire l'INTERRUPTEUR annonce une panne au repos ») ; le libellé
   `_COPILOT_TOOLS_CUT` dit « momentanément coupées » précisément pour ça, mais
   il ATTERRIT dans une liste titrée « SOURCES NON DISPONIBLES » qui traite de
   la même façon un interrupteur posé, un connecteur jamais branché et un
   échec. Les trois appellent des gestes OPPOSÉS chez qui les lit.
   La garde lit le texte RÉELLEMENT envoyé au modèle (`build_system_prompt`),
   pas une constante — et elle vérifie que son corpus n'est pas vide.
5. ELLE N'ATTRAPE PAS CE QU'ELLE NE VISE PAS. Deux témoins de cas légitimes
   voisins : la ligne « aucun document pertinent trouvé » est une absence
   MESURÉE (sans clé d'embedding la récupération reste plein texte — elle
   tourne), elle a le droit de dire « aucun » ; et le libellé de l'interrupteur
   garde le droit de dire « coupées ».
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.context_transparency import _COPILOT_TOOLS_CUT, _not_consulted_entries
from app.routers import chat as chat_router

_BARE_PROMPT = build_system_prompt({}, {}, "", "")


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


_DOSSIER_READ = {
    "tool": "get_account_briefing",
    "input": {"account_id": "acc-1"},
    "status": "done",
    "sources": [{"kind": "account_dossier", "label": "Société Générale", "as_of": "2026-09-10"}],
}


def _orchestrator_that_reads_then_raises(*actions: dict):
    """Un orchestrateur qui a TERMINÉ des outils, puis tombe pour une raison
    imprévue — exactement ce que le filet générique de `_run_chat_turn` attrape."""

    async def _run(*_a, **kwargs):
        collected = kwargs.get("collected")
        assert collected is not None, "le routeur doit passer son accumulateur à l'orchestrateur"
        collected.extend(actions)
        await asyncio.sleep(0)
        raise RuntimeError("panne imprévue côté assistant")

    return _run


class TestUnePanneImprevueNeJettePasLeTravailFait:
    """#1950.1 / #1950.21 — un échec n'efface pas les résultats précédents."""

    def test_ce_qui_a_ete_lu_survit_a_une_panne_imprevue(self, client: TestClient) -> None:
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_raises(_DOSSIER_READ),
        ):
            res = client.post("/chat/message", json={"message": "compare mes comptes", "user_id": "u1"})

        body = _terminal_event(res.text)
        assert body["success"] is False
        reply = body["data"]["reply"]
        assert "Société Générale" in reply, "ce qu'un outil TERMINÉ a lu ne disparaît pas avec la panne"
        assert "10/09/2026" in reply, "chaque élément récupéré porte sa date"
        # Le refus en bloc, c'est exactement ça : la phrase d'échec SEULE.
        assert reply != chat_router._GENERIC_FAILURE_REPLY
        context = body["data"]["context"]
        assert context["partial"]["reason"] == "turn_error", "le partiel porte un repère MACHINE distinct du temps"
        assert context["partial"]["as_of"], "le partiel est daté"
        assert {"kind": "account_dossier", "label": "Société Générale", "as_of": "2026-09-10"} in context["sources"]

    def test_rien_de_lu_rend_la_carte_generique_inchangee(self, client: TestClient) -> None:
        """TÉMOIN — on n'invente pas un résultat partiel à partir de rien."""
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_raises(),
        ):
            res = client.post("/chat/message", json={"message": "enrichis ce contact", "user_id": "u1"})

        assert _terminal_event(res.text)["data"] == {"reply": chat_router._GENERIC_FAILURE_REPLY}

    def test_une_proposition_ou_un_echec_ne_se_presentent_pas_comme_recuperes(self, client: TestClient) -> None:
        prepared = {"tool": "enrich_contact", "input": {}, "status": "pending_confirmation", "proposal": {}}
        failed = {
            "tool": "get_account_briefing",
            "input": {},
            "status": "error",
            "sources": [{"kind": "account_dossier", "label": "Fantôme"}],
        }
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_raises(prepared, failed),
        ):
            res = client.post("/chat/message", json={"message": "enrichis ce contact", "user_id": "u1"})

        assert _terminal_event(res.text)["data"] == {"reply": chat_router._GENERIC_FAILURE_REPLY}

    def test_la_phrase_suit_la_langue_de_linterface(self, client: TestClient) -> None:
        """#1958.8 — une interface anglaise ne lit pas une phrase française."""
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_raises(_DOSSIER_READ),
        ):
            res = client.post(
                "/chat/message",
                json={"message": "compare", "user_id": "u1", "interface_language": "en"},
            )

        reply = _terminal_event(res.text)["data"]["reply"]
        assert "Société Générale" in reply
        assert "2026-09-10" in reply, "la date suit aussi la langue de l'interface"
        assert "déjà été récupéré" not in reply

    def test_la_carte_generique_suit_aussi_la_langue(self, client: TestClient) -> None:
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_raises(),
        ):
            res = client.post(
                "/chat/message",
                json={"message": "enrichis", "user_id": "u1", "interface_language": "en"},
            )

        assert _terminal_event(res.text)["data"] == {"reply": chat_router._GENERIC_FAILURE_REPLY_EN}


class TestLePromptInterditLeRefusEnBloc:
    """#1950.1 — la règle vit dans le texte RÉELLEMENT envoyé au modèle."""

    def test_le_corpus_lu_nest_pas_vide(self) -> None:
        """La garde LIT quelque chose : un prompt vide rendrait tout le reste vert."""
        assert len(_BARE_PROMPT) > 10_000
        assert "OUTILS, EXÉCUTION ET APPROBATION" in _BARE_PROMPT

    def test_un_refus_global_est_interdit_quand_une_partie_est_possible(self) -> None:
        assert "JAMAIS DE REFUS EN BLOC" in _BARE_PROMPT
        assert "une seule phrase de refus" in _BARE_PROMPT

    def test_les_trois_listes_sont_separees(self) -> None:
        """Ce qui a marché, ce qui n'a pas pu être fait, et POURQUOI — séparément."""
        for fragment in ("ce que tu as FAIT", "ce que tu n'as PAS pu faire", "POURQUOI"):
            assert fragment in _BARE_PROMPT, fragment

    def test_une_capacite_eteinte_nest_jamais_annoncee_comme_une_panne(self) -> None:
        assert "COUPÉE N'EST PAS UNE PANNE" in _BARE_PROMPT
        assert "momentanément coupée" in _BARE_PROMPT
        assert "gestes opposés" in _BARE_PROMPT

    def test_un_resultat_vide_dune_capacite_qui_na_pas_tourne_nest_pas_zero(self) -> None:
        """La doctrine « non mesuré n'est jamais 0 », écrite pour un refus."""
        assert "n'a pas pu tourner" in _BARE_PROMPT
        assert "« aucun »" in _BARE_PROMPT


class TestLaGardeNattrapePasCeQuelleNeVisePas:
    """Deux témoins de cas légitimes VOISINS, qui doivent rester permis."""

    def test_le_libelle_de_linterrupteur_dit_coupee_et_jamais_une_erreur(self) -> None:
        assert "coupées" in _COPILOT_TOOLS_CUT
        for panne in ("erreur", "panne", "indisponible", "échec"):
            assert panne not in _COPILOT_TOOLS_CUT.lower(), panne

    def test_une_absence_mesuree_garde_le_droit_de_dire_aucun(self) -> None:
        """Sans clé d'embedding la récupération reste PLEIN TEXTE : elle tourne.
        « aucun document pertinent trouvé » est donc une absence MESURÉE, et la
        règle du prompt ne doit pas la transformer en trou non mesuré."""
        labels = [
            label
            for label, _, _ in _not_consulted_entries(
                crm_connected=False,
                crm_provider="",
                has_account=False,
                has_portfolio=False,
                has_sources=False,
                crm_crossed=False,
            )
        ]
        assert any("aucun document pertinent trouvé" in label for label in labels)
        assert _COPILOT_TOOLS_CUT not in labels, "aucun interrupteur posé : la ligne ne s'invite pas"


@pytest.mark.parametrize("switch_on", [True, False])
def test_la_ligne_de_linterrupteur_napparait_que_sil_est_pose(switch_on: bool) -> None:
    labels = [
        label
        for label, _, _ in _not_consulted_entries(
            crm_connected=True,
            crm_provider="hubspot",
            has_account=True,
            has_portfolio=True,
            has_sources=True,
            crm_crossed=True,
            copilot_tools_enabled=not switch_on,
        )
    ]
    assert (_COPILOT_TOOLS_CUT in labels) is switch_on
