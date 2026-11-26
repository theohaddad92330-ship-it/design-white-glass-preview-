"""Break-glass kill-switches for the always-on IA v2 axes.

Politique zéro-flag (décision Louis, 2026-07-16) : les 4 axes v2 — Judge
anti-hallucination, LLM Gateway, Data Gateway, Grounding — sont ON PAR DÉFAUT,
sans feature flag. Le SEUL contrôle restant est un kill-switch d'urgence par
axe, **absent par défaut** : on ne le pose (``=true``) que pour éteindre un axe
en incident prod, puis on le retire.

    JUDGE_DISABLED=true         → retire le node judge du graphe (plus de
                                  ``judge_completed``). Lu au build du graphe :
                                  effectif au run suivant (session Postgres) ;
                                  le graphe module-level est compilé à l'import.
    LLM_GATEWAY_DISABLED=true   → ignore tout routage LLM (LLM_GATEWAY_ROUTING /
                                  LLM_ROUTE_*) et dispatch en direct Anthropic +
                                  modèle de l'appelant (chemin pré-gateway,
                                  byte-identique). Lu à chaque appel.
    DATA_GATEWAY_DISABLED=true  → ``DataGateway.search`` renvoie ``[]`` sans
                                  aucun appel réseau (plus de hits Serper/Tavily/
                                  Brave additionnels). Lu à chaque appel.
    GROUNDING_DISABLED=true     → ``ground_facts_v2`` renvoie ``(None, None)``
                                  sans appel Claude (plus de clé ``grounding``
                                  ni de KPI "<5% non sourcés"). Lu à chaque appel.
    CHAT_TOOLS_DISABLED=true    → ``/chat/message`` n'importe même pas
                                  l'orchestrateur : le copilote répond en texte,
                                  sans lire de dossier ni proposer d'action.
                                  Lu à chaque appel.
    CHAT_MODEL_ROUTING_DISABLED=true → le copilote ne choisit plus de palier
                                  de modèle (#2248) : route et coût du tour
                                  redeviennent ceux de ``bellum_chat``. Lu à
                                  chaque appel.

Absent / vide / toute autre valeur = axe actif (le défaut produit). Un axe
coupé DÉGRADE, ne casse jamais : chaque site d'appel tolère déjà la valeur
vide correspondante.
"""

from __future__ import annotations

import os

_TRUTHY = {"1", "true", "yes", "on"}

JUDGE_KILL_SWITCH = "JUDGE_DISABLED"
LLM_GATEWAY_KILL_SWITCH = "LLM_GATEWAY_DISABLED"
DATA_GATEWAY_KILL_SWITCH = "DATA_GATEWAY_DISABLED"
GROUNDING_KILL_SWITCH = "GROUNDING_DISABLED"
CHAT_TOOLS_KILL_SWITCH = "CHAT_TOOLS_DISABLED"
#: Trois interrupteurs qui vivaient hors de ce fichier avec leur propre lecture
#: (identique au byte près). Rassemblés ici le 30/08/2026 pour que le registre
#: soit COMPLET : un interrupteur qui n'est pas déclaré ici n'a pas de surface,
#: et c'est exactement le défaut que D169 nomme.
SELF_CONSISTENCY_KILL_SWITCH = "SELF_CONSISTENCY_DISABLED"
SOURCE_CACHE_KILL_SWITCH = "SOURCE_CACHE_DISABLED"
LANGFUSE_KILL_SWITCH = "LANGFUSE_DISABLED"

#: Coupe le passage LLM (Claude Haiku, ``prompt_name="rag_knowledge_rerank"``)
#: du reclassement RAG-knowledge (``rag_knowledge.rerank`` → ``_llm_rerank``) ;
#: lu par ``rag_knowledge._llm_rerank_enabled()``, nulle part ailleurs. Posé
#: (``=true``), la cascade rejoint le repli déterministe déjà présent et
#: GRATUIT (``_deterministic_rerank`` : fraîcheur + recouvrement lexical) — le
#: cross-encoder local, lui, garde toujours la priorité sur les deux.
#:
#: LOT 13 (D169, 12/09/2026) : posé HORS de ``CAPABILITY_KILL_SWITCHES`` au
#: lot précédent — un agent qui n'avait pas ``apps/api/`` dans son périmètre
#: aurait fait rougir GA-84 (parité au caractère près avec ``IA_KILL_SWITCHES``
#: côté TypeScript) en ajoutant une clé Python sans son miroir. Rejoint le
#: registre ci-dessous MAINTENANT que son miroir (``apps/api/src/common/
#: kill-switches.ts``) est posé dans le même lot : la capacité a désormais une
#: surface (``GET /internal/kill-switches``, panneau « Capacités coupées »).
RAG_LLM_RERANK_ENV_VAR = "RAG_LLM_RERANK_DISABLED"

#: Laura compte avant de proposer (décision Louis, 15/09/2026, contre la
#: recommandation) — coupe SEULEMENT le compte d'un lien filtré avant qu'il
#: soit proposé (`_deep_link_count`, `chat_tools.py`) ; le lien continue de se
#: proposer COMME AUJOURD'HUI, sans jamais nommer de nombre. Le compte a par
#: ailleurs son PROPRE budget de latence (`DEEP_LINK_COUNT_BUDGET_S`), qui
#: n'a pas besoin de ce registre : un budget dépassé se comporte déjà comme
#: une coupure.
DEEP_LINK_COUNT_KILL_SWITCH = "DEEP_LINK_COUNT_DISABLED"

#: #2248 — Laura choisit son palier de modèle (décision Louis, 17/09/2026).
#: Posé (``=true``), le classifieur de demande ne tourne plus : chaque tour de
#: chat résout de nouveau la tâche ``bellum_chat`` (donc ``LLM_ROUTE_CHAT``) et
#: compte son coût sous ce nom, comme avant le routage — les réglages
#: ``LLM_ROUTE_CHAT_FAST`` / ``LLM_ROUTE_CHAT_DEEP`` restent posés, ignorés.
#: Lu par ``chat_model_routing.routing_active()``, nulle part ailleurs.
CHAT_MODEL_ROUTING_KILL_SWITCH = "CHAT_MODEL_ROUTING_DISABLED"

#: #2543.5g — la passe d'élargissement automatique d'une collecte de contacts
#: mince (`phase2_contacts.py`). ACTIF PAR DÉFAUT, à l'inverse du reste de
#: cette famille : un défaut ÉTEINT ne corrigeait rien pour le cas signalé
#: (ARQUUS, stock inchangé). Posé (``=true``), aucune passe de plus, chemin
#: byte-identique à avant #2543.5g. Rejoint le registre le 21/09/2026
#: (intégration vague 2) : la lecture vivait en `os.getenv` direct, hors
#: surface opérateur — exactement le défaut que GA-84/D169 existent pour
#: attraper.
CONTACTS_AUTO_WIDEN_KILL_SWITCH = "CONTACTS_AUTO_WIDEN_DISABLED"

#: #3586 — coupe le préfixe « digest du Drive interne » des system prompts
#: (``internal_knowledge_digest._disabled``). Posé, tout prompt repart
#: byte-identique, sans lecture de la base.
INTERNAL_KNOWLEDGE_DIGEST_KILL_SWITCH = "INTERNAL_KNOWLEDGE_DIGEST_DISABLED"


def disabled(env_var: str) -> bool:
    """True only when ``env_var`` holds a truthy value (``1/true/yes/on``,
    case-insensitive). Absent/empty/anything-else ⇒ False ⇒ the axis stays ON."""
    return os.environ.get(env_var, "").strip().lower() in _TRUTHY


#: Le registre : identifiant de CAPACITÉ → variable qui la coupe.
#:
#: ⚠️ Les identifiants sont les MÊMES que ceux déclarés côté API
#: (``apps/api/src/common/kill-switches.ts``) — c'est sur eux que l'API joint
#: l'état rendu ici. La parité est gardée par
#: ``tests/test_kill_switch_registry_parity.py``, qui lit le fichier TypeScript.
#:
#: ⚠️ La variable est la CLEF DE LECTURE, jamais une donnée publiable : elle ne
#: sort d'ici que sous forme d'état booléen, jamais sous son nom. Un jour où
#: quelqu'un ajoutera un interrupteur au nom parlant, cette règle sera la seule
#: chose qui empêchera une configuration d'infrastructure d'atterrir dans une
#: interface.
CAPABILITY_KILL_SWITCHES: dict[str, str] = {
    "analysis.judge": JUDGE_KILL_SWITCH,
    "analysis.llm_gateway": LLM_GATEWAY_KILL_SWITCH,
    "analysis.data_gateway": DATA_GATEWAY_KILL_SWITCH,
    "analysis.grounding": GROUNDING_KILL_SWITCH,
    "copilot.tools": CHAT_TOOLS_KILL_SWITCH,
    "analysis.self_consistency": SELF_CONSISTENCY_KILL_SWITCH,
    "analysis.source_cache": SOURCE_CACHE_KILL_SWITCH,
    "observability.tracing": LANGFUSE_KILL_SWITCH,
    "rag.llm_rerank": RAG_LLM_RERANK_ENV_VAR,
    "copilot.deep_link_count": DEEP_LINK_COUNT_KILL_SWITCH,
    "copilot.model_routing": CHAT_MODEL_ROUTING_KILL_SWITCH,
    "contacts.auto_widen": CONTACTS_AUTO_WIDEN_KILL_SWITCH,
    "knowledge.internal_digest": INTERNAL_KNOWLEDGE_DIGEST_KILL_SWITCH,
}


def capability_states() -> dict[str, bool]:
    """Pour chaque capacité : est-elle COUPÉE ?

    ⚠️ ``True`` veut dire « coupée exprès », pas « en panne ». Un interrupteur
    posé est une décision d'exploitation, et le message qui en découle doit dire
    « cette capacité est coupée », jamais « une erreur s'est produite ».

    ⚠️ Ne dit RIEN du cas « sans clé = no-op strict » : une intégration sans clé
    n'est pas un interrupteur posé, c'est un chemin normal. Les mélanger ferait
    lire une absence de configuration comme un incident.
    """
    return {
        capability: disabled(env_var)
        for capability, env_var in CAPABILITY_KILL_SWITCHES.items()
    }


__all__ = [
    "CAPABILITY_KILL_SWITCHES",
    "CHAT_MODEL_ROUTING_KILL_SWITCH",
    "CHAT_TOOLS_KILL_SWITCH",
    "CONTACTS_AUTO_WIDEN_KILL_SWITCH",
    "DATA_GATEWAY_KILL_SWITCH",
    "DEEP_LINK_COUNT_KILL_SWITCH",
    "GROUNDING_KILL_SWITCH",
    "INTERNAL_KNOWLEDGE_DIGEST_KILL_SWITCH",
    "JUDGE_KILL_SWITCH",
    "LANGFUSE_KILL_SWITCH",
    "LLM_GATEWAY_KILL_SWITCH",
    "RAG_LLM_RERANK_ENV_VAR",
    "SELF_CONSISTENCY_KILL_SWITCH",
    "SOURCE_CACHE_KILL_SWITCH",
    "capability_states",
    "disabled",
]
