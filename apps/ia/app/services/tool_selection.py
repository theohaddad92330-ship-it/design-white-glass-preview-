"""#4112 — sélection d'outils pour Laura : un noyau fixe + `chercher_un_outil`.

~96 specs d'outils partaient à CHAQUE tour. Derrière `LAURA_TOOL_SELECTION_ENABLED`
(défaut éteint → chemin byte-identique), le modèle ne voit plus que :

1. le NOYAU (`CORE_TOOL_NAMES`) — toujours le même, dans le même ORDRE, pour que
   le préfixe `tools` reste cache-friendly (prompt caching) ;
2. les outils STRUCTURELS (`STRUCTURAL_TOOL_NAMES`) — ceux que l'orchestrateur
   force ou traite à part (clarification, verdict, analyse…) : les retirer
   changerait ces chemins, pas seulement le coût ;
3. `chercher_un_outil` — recherche LEXICALE (nom + description, accents repliés,
   aucune sémantique) qui renvoie 1 à 5 specs ; ils deviennent appelables au tour
   SUIVANT de la même boucle, ajoutés EN FIN de liste (jamais au milieu).

La recherche ne porte que sur le catalogue DÉJÀ filtré du tour (capacités
connectées, sources exclues, mode, SourcePlan) : elle ne ré-expose jamais ce
qu'un filtre a retiré. Aucun outil d'envoi n'existe au catalogue ; les écritures
restent des `pending_confirmation` (c'est l'exécuteur qui le garantit).
"""

from __future__ import annotations

import os
import re
import unicodedata
from typing import Any

SEARCH_TOOL_NAME = "chercher_un_outil"
SEARCH_RESULT_MAX = 5

#: Noyau métier, DANS L'ORDRE : fréquence probable d'un tour de commercial ESN
#: (briefing d'un compte, ses contacts, ses signaux, rédiger, relancer, plan
#: d'actions, trouver des comptes) + les lectures essentielles qui répondent à
#: « par quoi je commence ? » (briefing du jour, pipeline, comptes à activer).
#
# #4058.1 / #3889.1 (recette prod 14/10, FAIL le lendemain du merge de #4112) —
# `propose_people_search` et `search_document_projects` AJOUTÉS ici : absents
# du noyau, ils devenaient invisibles du modèle dès l'allumage
# (`LAURA_TOOL_SELECTION_ENABLED`), sans qu'aucun de leurs propres textes
# d'outil ne dise au modèle de les chercher par nom via `chercher_un_outil` —
# « interlocuteurs cyber GRC de X » et « quels projets a X dans nos
# documents » retombaient alors en texte libre. Le noyau est la seule
# protection qui ne dépend pas du jugement du modèle au tour où ça compte.
CORE_TOOL_NAMES: tuple[str, ...] = (
    "get_account_briefing",
    "get_account_contacts",
    "get_account_signals",
    "prepare_message_for_contact",
    "schedule_reminder_for_contact",
    "get_action_plan",
    "find_accounts",
    "search_workspace_accounts",
    "search_workspace_contacts",
    "propose_people_search",
    "search_document_projects",
    "get_daily_briefing",
    "list_accounts_to_act",
    "get_pipeline",
    "get_account_timeline",
    "get_user_context",
    "compare_accounts",
)

#: Outils que l'orchestrateur FORCE ou traite à part : toujours présents s'ils
#: sont au catalogue du tour. Choix conservateur — sans eux, `force_tool` et les
#: cartes (clarification, options de réponse, plan) cesseraient de fonctionner.
STRUCTURAL_TOOL_NAMES: tuple[str, ...] = (
    "ask_clarification",
    "note_thread_context",
    "note_unrouted_request",
    "offer_reply_options",
    "describe_plan",
    "get_account_suitability_verdict",
    "get_portfolio_priorities",
    "plan_account_analysis",
    "start_account_analysis",
)

SEARCH_TOOL: dict[str, Any] = {
    "name": SEARCH_TOOL_NAME,
    "description": (
        "Cherche, par mots-clés (nom et description), un outil de Bellum qui n'est pas dans ta liste "
        "courante. Renvoie 1 à 5 outils ; ils sont appelables au tour SUIVANT. À utiliser quand aucun "
        "de tes outils ne couvre la demande (finances, missions, talents, CRM, agenda, paramètres…), "
        "avant de répondre que tu ne sais pas faire."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Quelques mots-clés en français, ex. « factures en retard »."},
        },
        "required": ["query"],
    },
}

_TRUTHY = frozenset({"1", "true", "yes", "on"})
_STOPWORDS = frozenset(
    "les des une aux sur par pour dans avec sans que qui quoi est son ses mes mon ton tes the and cet cette ces "
    "ils elle nous vous leur leurs mais donc quel quelle quels quelles outil outils".split()
)


def tool_selection_enabled() -> bool:
    return os.environ.get("LAURA_TOOL_SELECTION_ENABLED", "").strip().lower() in _TRUTHY


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _tokens(text: str) -> list[str]:
    out: list[str] = []
    for raw in re.split(r"[^a-z0-9]+", _fold(text)):
        if len(raw) < 3 or raw in _STOPWORDS:
            continue
        out.append(raw.rstrip("sx") if len(raw) > 4 else raw)
    return out


def search_tools(query: str, catalog: list[dict[str, Any]], *, exclude: frozenset[str] = frozenset()) -> list[dict[str, Any]]:
    """Les specs les mieux classées (≤ 5) ; nom pesé 3×, description 1×. Ex æquo : ordre du catalogue.

    Un NOM d'outil cité tel quel dans la requête passe en tête : c'est ce que fait le modèle
    après `reject_unavailable`, et des descriptions bavardes ne doivent pas l'en écarter.
    """
    wanted = list(dict.fromkeys(_tokens(query)))
    if not wanted:
        return []
    named = set(re.findall(r"[a-z0-9_]+", query.lower()))
    scored: list[tuple[int, int, dict[str, Any]]] = []
    for position, tool in enumerate(catalog):
        name = str(tool.get("name") or "")
        if name in exclude or name == SEARCH_TOOL_NAME:
            continue
        name_tokens = _tokens(name)
        desc_tokens = _tokens(str(tool.get("description") or ""))
        score = 0
        for word in wanted:
            score += 3 * sum(1 for t in name_tokens if t.startswith(word) or word.startswith(t))
            score += sum(1 for t in desc_tokens if t == word or (len(word) > 4 and t.startswith(word)))
        if name in named:
            score += 10_000
        if score:
            scored.append((-score, position, tool))
    scored.sort(key=lambda item: (item[0], item[1]))
    return [tool for _s, _p, tool in scored[:SEARCH_RESULT_MAX]]


class ToolSelection:
    """L'état d'UN tour : le catalogue filtré, ce qui est exposé, ce qui a été découvert."""

    def __init__(self, catalog: list[dict[str, Any]]) -> None:
        self._catalog = list(catalog)
        by_name = {str(t["name"]): t for t in self._catalog}
        self._base: list[dict[str, Any]] = [
            by_name[n] for n in (*CORE_TOOL_NAMES, *STRUCTURAL_TOOL_NAMES) if n in by_name
        ]
        self._base.append(SEARCH_TOOL)
        self._discovered: list[dict[str, Any]] = []

    def current(self) -> list[dict[str, Any]]:
        """Noyau stable, puis `chercher_un_outil`, puis les découverts (en fin de liste)."""
        return [*self._base, *self._discovered]

    def exposed_names(self) -> frozenset[str]:
        return frozenset(str(t["name"]) for t in self.current())

    def knows(self, name: str) -> bool:
        return any(t.get("name") == name for t in self._catalog)

    def run_search(self, tool_input: Any) -> dict[str, Any]:
        query = str(tool_input.get("query") or "").strip() if isinstance(tool_input, dict) else ""
        if not query:
            return {"error": f"`{SEARCH_TOOL_NAME}` demande une requête (`query`) : quelques mots-clés."}
        exposed = self.exposed_names()
        found = search_tools(query, self._catalog, exclude=exposed)
        self._discovered.extend(found)
        if not found:
            return {
                "tools": [],
                "message": "Aucun autre outil ne correspond à ces mots-clés. Reformule ou réponds avec ce que tu as.",
            }
        return {
            "tools": found,
            "message": "Ces outils sont appelables au tour suivant.",
        }

    def reject_unavailable(self, name: str) -> dict[str, Any] | None:
        """Une erreur CLAIRE pour le modèle si `name` n'est pas appelable ce tour, sinon ``None``."""
        if name in self.exposed_names():
            return None
        if self.knows(name):
            return {"error": f"L'outil `{name}` n'est pas chargé : cherche-le d'abord avec `{SEARCH_TOOL_NAME}`."}
        return {"error": f"Outil inconnu : `{name}`. Utilise `{SEARCH_TOOL_NAME}` pour trouver le bon outil."}
