"""Assemblage du bloc ``org_graph`` d'une classification (phase 3).

Ce bloc — organigramme hérité + comité d'achat + `orgGraph` typé — était construit
DANS le nœud LangGraph du run complet, et nulle part ailleurs. La route HTTP
``POST /phase/3/classify``, celle qu'appelle le bouton « Enrichir l'organigramme »
d'un dossier déjà livré, renvoyait donc les contacts SANS graphe : côté API il n'y
avait rien à persister, et la carte d'influence du compte restait figée sur le
graphe du run initial. Une recherche ciblée pouvait ajouter dix décideurs, la case
« Contact(s) à vérifier » restait ouverte et les nouveaux venus n'apparaissaient
nulle part sur la carte.

Le calcul vit ici pour que les DEUX chemins produisent le même bloc.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.knowledge.buying_committee import assemble_buying_committee
from app.services.classification import CONTACTS_ENRICH_MAX
from app.services.org_graph_assembler import assemble_org_graph

logger = logging.getLogger(__name__)

# Les clés héritées du classifieur qui composent ``raw_analysis.org``.
_LEGACY_KEYS = ("organigramme", "decisionChain", "uncoveredZones", "stakeholderMap", "approach_order")


def build_org_graph_payload(
    *,
    data: dict[str, Any],
    contacts: list[dict[str, Any]],
    research: dict[str, Any] | None = None,
    graph_version: int = 1,
    rejected_items: list[dict[str, Any]] | None = None,
    discovered_contacts: list[dict[str, Any]] | None = None,
    # #2543.5 — l'état de la recherche Apollo et la population qu'elle a
    # ANNONCÉE (avant tout plafond/anchor cascade côté phase 2), quand
    # l'appelant les mesure. Absents (défaut) = non mesuré, byte-identique.
    apollo_source_status: str | None = None,
    apollo_total_entries: int | None = None,
    # #2543.5b — le repli web mesuré par phase2_contacts.py, même convention.
    apollo_fallback: dict[str, Any] | None = None,
    # #2543.5g — la passe d'élargissement mesurée par phase2_contacts.py,
    # même convention (absente = non tentée cette requête-ci).
    apollo_widened: dict[str, Any] | None = None,
    # #3742 — le cadrage du run (`geo_perimeter`, `geo_areas`…), que l'assembleur
    # applique au chemin recommandé. Absent (défaut) = graphe byte-identique.
    scope_selection: dict[str, Any] | None = None,
    # D405 — la date du RUN qui dérive ce graphe, posée sur chaque
    # influenceEdge (jamais une date d'OBSERVATION : une influence est une
    # inférence). Injectable pour les tests ; en production l'appelant ne le
    # fournit pas et CETTE fonction — la porte d'entrée réelle d'un run, pas
    # `assemble_org_graph` qui reste pure pour que ses tests comparatifs
    # restent byte-identiques — pose l'instant réel de l'appel.
    derived_at: str | None = None,
) -> dict[str, Any]:
    """Le bloc ``org_graph`` d'une sortie de classification.

    ``data`` est la sortie du classifieur (clés en alias : ``organigramme``,
    ``decisionChain``, ``hierarchyRelations``…), ``contacts`` les contacts
    classés (après ré-attachement des clés Apollo côté pipeline), ``research``
    la recherche phase 1 — sur le chemin HTTP elle est déjà fondue dans le
    ``profile_data`` de l'appelant.

    ``discovered_contacts`` est TOUT ce que le compte contient, avant le plafond
    de la vague (``CONTACTS_ENRICH_MAX``). ``contacts`` est la vague : ce qui a
    coûté des crédits. Les deux entrent parce que ce sont deux nombres
    différents, et que les confondre est exactement le défaut que le FINAL §3
    corrige — un compte à 2 241 contacts affichait un organigramme de 50 sans
    que rien ne dise que les autres existaient. ``None`` (défaut) = corpus non
    mesuré : aucun bloc ``coverage``, graphe byte-identique à avant.

    Best-effort : un raté d'assemblage du graphe TYPÉ ne fait pas perdre les
    clés héritées, et ne fait jamais échouer une classification qui a abouti.
    """
    research = research or {}
    org_graph: dict[str, Any] = {k: data[k] for k in _LEGACY_KEYS if data.get(k)}

    # Comité d'achat (Knowledge Pack v2) : qui est décideur / prescripteur /
    # utilisateur / champion / acheteur, et quels sièges restent vides.
    # Attaché seulement s'il a des membres.
    committee = assemble_buying_committee(contacts)
    if committee.get("members"):
        org_graph["buyingCommittee"] = committee

    try:
        # #2755 — sur le chemin bouton (« Enrichir l'organigramme »), ``research``
        # EST ``account.raw_analysis`` : persisté snake_case de bout en bout
        # (`accounts.service.ts:3404` fait passer tout le blob par
        # `toSnakeCaseKeys` avant d'écrire en base). Sans repli snake_case, ces
        # trois clés étaient TOUJOURS `None` sur ce chemin précis — jamais sur
        # le run complet, où `research` est encore le camelCase frais du
        # classifieur — même double-alias que le reste de l'API
        # (`coverage.service.ts:463`).
        entities_for_graph = (
            research.get("entities_exhaustive")
            or research.get("entitiesExhaustive")
            or data.get("organigramme")
            or []
        )
        # État de la relation (SalesContext de la phase 1) : sur un compte froid,
        # le garde-fou DoD écarte le board de la 1re approche. Absent = froid.
        sales_context = research.get("sales_context") or research.get("salesContext") or {}
        relationship_state = (sales_context.get("relationship") or {}).get("state")
        org_graph["orgGraph"] = assemble_org_graph(
            contacts=contacts,
            entities=entities_for_graph,
            uncovered_zones=data.get("uncoveredZones"),
            approach_order=data.get("approach_order"),
            committee=committee,
            prompt_hash=data.get("promptHash"),
            relationship_state=relationship_state,
            # Matière du prompt refondu (annexe p23-p28) : relations typées et
            # carte d'influence métier. Ni l'une ni l'autre n'est prise pour
            # argent comptant — l'assembleur les fait passer par le resolver,
            # qui plafonne toute inférence LLM et la range en influence.
            llm_relations=data.get("hierarchyRelations"),
            llm_influences=data.get("influenceMap"),
            # #2310.13/.15/.19/.20/.21 (épopée #2919) — le producteur manquant :
            # jusqu'ici rien ne remplissait cette clé sur `data`, même si
            # l'assembleur savait déjà la lire (lot de nuit 18). Absente/vide
            # (défaut) = graphe byte-identique, comme `llm_relations` ci-dessus.
            llm_relational_edges=data.get("relationalEdges"),
            # Seconde source de rattachement (audit §1.1) : les dirigeants nommés
            # sur la page équipe/gouvernance du site du compte, collectée en
            # phase 1 depuis les pages déjà scrapées. Absente = graphe inchangé.
            official_directory=research.get("official_directory") or research.get("officialDirectory") or [],
            # Mémoire du graphe (annexe §5) : la version que les corrections
            # utilisateur ont fait avancer, et l'ardoise des éléments écartés —
            # un contact signalé parti ne revient pas dans ce run.
            graph_version=graph_version,
            rejected_items=rejected_items or [],
            # Décorrélation couverture / enrichissement (FINAL §3). `None` reste
            # `None` : un appelant qui ne mesure pas le corpus n'obtient pas un
            # « 0 découvert », il n'obtient pas de bloc du tout.
            discovered_contacts=discovered_contacts,
            # La taille de vague vient de son UNIQUE réglage. La recopier ici en
            # dur en ferait un second, et deux réglages divergent.
            enrichment_batch_size=None if discovered_contacts is None else CONTACTS_ENRICH_MAX,
            # #2543.5 — voir le commentaire sur les paramètres ci-dessus.
            apollo_source_status=apollo_source_status,
            apollo_total_entries=apollo_total_entries,
            apollo_fallback=apollo_fallback,
            apollo_widened=apollo_widened,
            # D405 — une seule date pour tout le run.
            derived_at=derived_at or datetime.now(UTC).isoformat(),
            scope_selection=scope_selection,
        )
    except Exception:
        # #2755 — ce raté restait invisible : `pragma: no cover` + un WARNING sans
        # trace masquaient la seule preuve capable de distinguer « le graphe est
        # vide parce que le compte n'a rien » de « le graphe est vide parce que
        # l'assembleur a levé ». Toujours best-effort (docstring ci-dessus) : la
        # classification qui a abouti n'échoue jamais pour autant. `logger.exception`
        # journalise la pile Python, jamais un contenu de contact ou d'entité.
        logger.exception("orgGraph assembly failed (non-blocking)")

    return org_graph
