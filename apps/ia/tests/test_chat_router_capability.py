"""Le routeur d'intentions : capacité IMPOSÉE, clarification BORNÉE.

Le §9.4 du PDF 6 décrit cinq étapes de routage. Deux seulement sont sorties du
prompt, et la décision de Louis dit pourquoi : **on rend déterministe ce dont
l'erreur est invisible.**

- La vérification de capacité était une CONSIGNE (« tiens compte des outils
  connectés »). Un modèle prié n'est pas une garantie : il proposait des
  relances par messagerie à des utilisateurs qui n'en ont aucune, et rien ne le
  signalait — la réponse était plausible.
- La clarification n'avait aucun compteur. Deux questions d'affilée
  transforment une demande en interrogatoire, et l'utilisateur abandonne avant
  d'avoir obtenu quoi que ce soit.

La classification et l'extraction d'entités restent au modèle : il les fait
bien, et une erreur s'y voit tout de suite.
"""

from __future__ import annotations

import asyncio

from app.services.chat_tools import (
    CHAT_TOOLS,
    TOOL_REQUIRED_FAMILIES,
    execute_chat_tool,
    missing_capabilities,
    tools_for,
)

USER = "11111111-1111-4111-8111-111111111111"


def _names(tools: list[dict]) -> set[str]:
    return {str(tool["name"]) for tool in tools}


class TestCapabilityFilter:
    def test_unknown_state_keeps_every_tool(self) -> None:
        """`None` veut dire « on ne sait pas », et rend TOUT.

        C'est le seul repli sûr : l'inverse ferait disparaître des outils sur
        une simple omission d'appelant, sans que rien ne le dise.
        """
        assert _names(tools_for(None)) == _names(CHAT_TOOLS)

    def test_a_tool_whose_connector_is_missing_is_not_shown(self) -> None:
        # On ne peut pas proposer ce qu'on ne voit pas — c'est toute la
        # différence entre une garantie et un conseil.
        without = _names(tools_for([]))
        assert "search_mailbox" not in without
        assert "prepare_mail_draft" not in without
        assert "list_agenda" not in without
        assert "export_contact_to_crm" not in without

    def test_bellum_data_tools_survive_an_empty_workspace(self) -> None:
        """L'essentiel de ce qu'un commercial demande ne dépend d'aucun connecteur."""
        without = _names(tools_for([]))
        for name in (
            "find_needs",
            "run_matching",
            "search_talents",
            "search_missions",
            "get_invoice_blockers",
            "list_accounts_to_act",
            "get_interventions",
        ):
            assert name in without, name

    def test_connecting_a_family_brings_its_tools_back(self) -> None:
        with_mail = _names(tools_for(["email"]))
        assert "search_mailbox" in with_mail
        assert "list_agenda" not in with_mail

    def test_missing_capabilities_are_named_so_they_can_be_said(self) -> None:
        # Retirer un outil sans expliquer produirait un copilote qui « ne sait
        # plus faire » sans que personne comprenne pourquoi.
        assert missing_capabilities([]) == ["calendar", "crm", "email"]
        assert missing_capabilities(["email", "calendar", "crm"]) == []
        assert missing_capabilities(None) == []

    def test_every_required_family_is_a_real_tool_family(self) -> None:
        # Une famille mal orthographiée retirerait l'outil pour TOUT LE MONDE,
        # définitivement, sans qu'aucun test ne tombe ailleurs.
        known = {
            "crm",
            "email",
            "calendar",
            "linkedin",
            "prospection",
            "documents",
            "communication",
            "jobs",
            "data",
            "finance",
            "mcp",
            "ats",
            "telephony",
            "admin_docs",
        }
        for tool, families in TOOL_REQUIRED_FAMILIES.items():
            for family in families:
                assert family in known, f"{tool} exige une famille inconnue : {family}"

    def test_required_families_only_reference_declared_tools(self) -> None:
        declared = _names(CHAT_TOOLS)
        for tool in TOOL_REQUIRED_FAMILIES:
            assert tool in declared, f"{tool} n'existe plus dans le catalogue"


class TestClarification:
    def _ask(self, payload: dict) -> dict:
        return asyncio.run(execute_chat_tool("ask_clarification", payload, user_id=USER, profile_data=None))

    def test_a_clarification_needs_clickable_options(self) -> None:
        # « Tu veux dire quoi ? » fait recommencer l'utilisateur : c'est le tour
        # ouvert que le §9.4 interdit.
        assert "error" in self._ask({"question": "Quel compte ?", "options": []})
        assert "error" in self._ask({"question": "Quel compte ?", "options": ["ACME"]})

    def test_a_clarification_needs_a_question(self) -> None:
        assert "error" in self._ask({"question": "  ", "options": ["a", "b"]})

    def test_options_are_capped_at_four(self) -> None:
        # #2269.13 — trois choix simples plus un « autre » : au-delà de 4,
        # l'utilisateur relit une liste au lieu de choisir, on a remplacé une
        # question par un formulaire.
        out = self._ask({"question": "Quel compte ?", "options": ["A", "B", "C", "D", "E"]})
        assert out["status"] == "clarification"
        assert out["options"] == ["A", "B", "C", "D"]

    def test_the_tool_is_removed_after_the_first_clarification(self) -> None:
        """La borne est posée en RETIRANT l'outil, pas en priant le modèle.

        Demander au modèle de ne pas reposer la question laisse la porte
        ouverte ; retirer l'outil la ferme. La vérification porte sur le code
        qui le fait, parce que la boucle elle-même exige un client Anthropic.
        """
        import inspect

        from app.services import chat_orchestrator

        # La boucle réelle vit dans _run_chat_with_tools (la fonction publique
        # est le délégué qui ouvre la trace d'observabilité) : la garde suit le
        # code qui retire l'outil, et vérifie que le délégué threade le flag.
        public = inspect.getsource(chat_orchestrator.run_chat_with_tools)
        assert "clarification_already_asked" in public
        source = inspect.getsource(chat_orchestrator._run_chat_with_tools)
        assert "clarification_already_asked" in source
        assert '!= "ask_clarification"' in source
        # Et la capacité est filtrée AVANT l'appel, pas conseillée dedans.
        assert "tools_for(connected_families)" in source
        # #3905 (18/10) : l'appel passe par `tools_for_round(…, available_tools)` — la liste filtrée
        # reste la seule source, la cascade des comptes ne fait que la réordonner par tour.
        assert "tools=accounts_cascade.tools_for_round(" in source
        assert "available_tools" in source
