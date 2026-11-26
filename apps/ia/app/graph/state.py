"""Typed state for the analysis StateGraph.

LangGraph merges each node's returned partial dict into this state. Most keys
are last-writer-wins; ``envelopes`` uses an ``operator.add`` reducer so every
node appends its own per-phase meta instead of overwriting the list.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict


class AnalysisState(TypedDict, total=False):
    # --- inputs (set by the caller before invoke) ---
    company_name: str
    # Scope lock (Théo p.10) : SIREN de l'entité choisie par le commercial dans le
    # sélecteur de périmètre. Quand présent, ancre la recherche Pappers dessus.
    siren: str | None
    # Périmètre d'analyse (Théo p.10/21) : groupe/france/filiales/it_digital/…
    scope_mode: str | None
    scope_selection: dict | None
    # Marché cible (pays) choisi côté produit. Défaut "FR" = chemin français
    # inchangé ; un code non-FR (CH/BE/LU) active le country pack correspondant
    # dans research_node quand son flag d'env est activé.
    country: str | None
    # Site connu du compte (tome 2 §13) : sert à dériver le slug d'un board ATS.
    website: str | None
    profile_data: dict[str, Any]
    user_context: Any
    # Mémoire de corrections du compte (feedback loop A2) : directives condensées
    # côté API, consommées par classify_node et plan_node. "" = pas de feedback.
    account_feedback: str
    # Mémoire du graphe d'organigramme (annexe §5) : version à reprendre et
    # éléments écartés à ne pas réinjecter, consommés par classify_node.
    # Absents = version 1, aucune mémoire → assemblage inchangé.
    org_graph_version: int
    org_rejected_items: list[dict[str, Any]]
    # Couche zéro (annexe méthodo p8) : relevé réel du CRM connecté de l'ESN sur
    # ce compte, envoyé par NestJS. Consommé par research_node (relation du
    # SalesContext) et plan_node (bloc de prompt). "" = aucun CRM connecté / aucun
    # match → chemin byte-identique.
    crm_presence: str
    internal_history: str
    # #4070 — les faits du compte (socle #4069), datés et sans provenance :
    # ``[{kind, label, date, age_days}]``. Consommés par research_node (.1), plan_node
    # (.2, messages compris) et le juge (.5). [] / absent = prompts byte-identiques.
    account_facts: list[dict[str, Any]]
    # #4070.3 — interlocuteurs déjà connus de l'espace, consommés par classify_node.
    known_contacts: list[dict[str, Any]]
    # #4070.4 — l'analyse précédente en trace datée (corrections humaines marquées).
    previous_analysis: str
    # #4070.2 — motifs de perte déclarés, condensés côté API.
    lost_deal_rex: str
    # #3753.3 — le ciblage de l'ESN (hypothèses du vendeur, non vérifiées), consommé
    # par research_node. Absent/None = prompt byte-identique.
    seller_hypotheses: dict[str, Any] | None
    # LUD.6 bis — la zone d'ouverture du compte, passée à la recherche de contacts en PRÉFÉRENCE.
    preferred_zone: list[str]
    # Lot 14 (#1631.3/.4, #1606.2) — l'axe CHEMIN de l'adressabilité : le compte
    # de parcours AGRÉGÉ résolu côté API par `MarketMemoryService.pathAxisFor`,
    # envoyé par NestJS. Consommé par research_node. Absent/`None` = aucune
    # couverture (ou sous le seuil transverse) → axe non mesuré, byte-identique.
    market_paths_observed: int | None
    market_top_esn: str
    # #2298.4 (décision Louis 19/09/2026) — les QUATRE sources ajoutées à
    # l'axe RELATION, en plus du CRM (`crm_presence` ci-dessus), envoyées par
    # NestJS et consommées par research_node. Défauts `None`/"" (aucun
    # ingrédient transmis) → axe byte-identique à avant ce lot.
    relation_missions_count: int | None
    relation_last_meeting_at: str
    relation_last_email_at: str
    relation_human_correction: str
    # #2273.9-.21 — partenaires déclarés en place (account_partners) ; [] = aucun.
    declared_partners: list[str]
    # #3278.1 — « present » (mission en cours) / « former » (missions terminées) ; "" = aucune mission.
    consultant_history: str
    # #3278.1 — un signal d'achat DÉCLARÉ existe sur le compte ; False = aucun.
    declared_signal_present: bool
    partner_placements_active: int | None
    # #3278.1 — signaux de route lus côté API ; None = aucun.
    declared_route_signals: dict[str, bool] | None
    # #3278.a — preuves / historique des canaux ; None = non lu.
    accumulated_route_criteria: dict[str, str] | None
    # Boucle d'apprentissage (restitution V2 §6) : agrégat de ce que l'équipe a
    # fait de ses besoins passés, envoyé par NestJS. Consommé par plan_node
    # (bloc de prompt). "" = aucun besoin jamais déplacé → prompt byte-identique.
    workspace_learning: str
    # #3278.3 — canaux mesurés de l'espace ; [] = preset de méthode inchangé.
    channel_performance: list[dict[str, Any]]
    # #2451.1 — le mode de contexte du dossier (None = « Mon activité », byte-identique).
    context_mode: str | None
    #: Les plafonds de focus du plan, regles par espace. Vide = defauts du contrat.
    focus_weights: dict
    # Colonne du kanban commercial du compte (annexe méthodo p6), envoyée par
    # NestJS. Consommée par research_node (état de relation du SalesContext).
    # "" / "inbox" = compte non trié → relation inchangée (froid par défaut).
    commercial_status: str
    account_id: str
    user_id: str
    # Team scope threaded from NestJS — the RAG read/write scope of every phase.
    workspace_id: str

    # --- phase outputs (each node fills its own) ---
    research: dict[str, Any]
    seed_contacts: list[dict[str, Any]]
    # Apollo People-Search hits the research node prefetched CONCURRENTLY with
    # research (latency optimization). ``contacts_node`` consumes them so it
    # never re-runs the search on the critical path. Last-writer-wins; absent
    # (key never set) means the prefetch failed → contacts_node searches live.
    prefetched_contacts: list[dict[str, Any]]
    contacts: list[dict[str, Any]]
    # Prospection inversée (annexe p7/p9) : les contacts du pool ayant un passage
    # PASSÉ chez la cible (ex-collaborateurs = relais chauds). Calculés en phase 2,
    # ils étaient jetés faute de consommateur ; plan_node les reprend ici.
    reverse_prospects: list[dict[str, Any]]
    # « X écartés (hors périmètre) » (Théo P0-03) : combien de contacts la phase 2 a
    # retirés parce que leur employeur est une entité hors périmètre, et lesquels
    # ({"dropped": n, "entities": [{"name", "count"}]}). Clé ABSENTE quand rien n'a
    # été écarté — le dossier n'affiche alors rien plutôt qu'un zéro trompeur.
    contacts_out_of_scope: dict[str, Any]
    # #2543.5a — l'état de la source Apollo (typé : ok/empty/unconfigured/
    # auth_failed/plan_blocked/rate_limited/down) + la population qu'elle
    # ANNONCE pour cette recherche, posés par contacts_node et lus par
    # classify_node pour alimenter coverage.sourceStatus/sourceTotalEntries.
    # Absent = non mesuré, jamais un « ok » deviné.
    apollo_source_status: str | None
    apollo_total_entries: int | None
    # #2543.5b — {"attempted": bool, "foundCount": int|None, "failure": str|None}
    apollo_fallback: dict[str, Any] | None
    # #2543.5g — {"attempted": bool, "initialStock": int, "added": int|None,
    # "failure": str|None}, posé SEULEMENT quand la passe d'élargissement a
    # tourné (voir phase2_contacts.py). Absent = non tentée.
    apollo_widened: dict[str, Any] | None
    classified_contacts: list[dict[str, Any]]
    # Phase-3 org graph (decisionChain / uncoveredZones / stakeholderMap /
    # approach_order / organigramme) — kept alongside the classified contacts so
    # the API can persist it into ``raw_analysis.org`` instead of dropping it.
    org_graph: dict[str, Any]
    plan: dict[str, Any]

    # Go/no-go gate decision on the research output (judge v1). ``no_go`` routes
    # the graph straight to END before contacts/classify/plan.
    gate: dict[str, Any]

    # Anti-hallucination Judge verdict over the assembled dossier.
    # ``{issues, confidence, passed, ...}``. Advisory — it FLAGS suspect content
    # and never blocks completion. Absent only on the legacy ``judge=False``
    # topology (tests).
    judge: dict[str, Any]

    # --- control / telemetry ---
    # One lightweight meta per executed phase; reducer concatenates them.
    envelopes: Annotated[list[dict[str, Any]], operator.add]
    # Phases that finished successfully; reducer concatenates. A re-invoke on the
    # same thread (resume) skips any phase already listed here, so only the
    # failed phase + downstream re-run.
    completed: Annotated[list[str], operator.add]
    # Set by the first phase that fails terminally; presence triggers early-exit.
    error: dict[str, Any] | None
    failed_phase: str | None
