"""Deterministic pre-rank for Phase-3 contact enrichment.

Apollo People-Search dumps *everyone* (100+ people). Sending all of them
through the expensive BELLUM-CONTACTS LLM pass is the single biggest cost +
latency sink of a run (classify emitted 53-73k output tokens, ~250s). The
dossier only surfaces the top ~15-20 deciders — so we rank the raw list with
the same deterministic classifiers used everywhere else (decision_role /
hierarchy_level / out-of-scope) and only LLM-enrich the top N.

The tail is NOT dropped: Phase 2 already seeded every contact into the DB
(name / title / linkedin / Apollo details), and the API computes bucket /
hierarchyLevel deterministically from the title at telemetry time. Capping
here only means the tail skips the LLM-generated summary / message — which the
dossier never shows for non-deciders anyway.

Pure + side-effect free so it's trivially testable and identical across runs.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.services.contact_themes import is_target_head
from app.services.contact_priority_score import SellerContext, _theme_tokens
from app.services.decision_role import classify_decision_role, is_it_decider, is_out_of_scope
from app.services.hierarchy_level import classify_hierarchy_level

# Decision role → weight. Economic / champion / technical are the roles an ESN
# sells to; procurement is the achats gate (must be reachable, slightly below the
# primary deciders); user / influencer matter less; blocker least. Unknown = 0.
_ROLE_WEIGHT: dict[str, int] = {
    "economic": 5,
    "champion": 5,
    "technical": 5,
    "procurement": 4,
    "user": 2,
    "influencer": 2,
    "blocker": 1,
}

# Buying-committee roles that must survive the top-N cap (03_BUSINESS_RULES §4 +
# the multi-thread plays §5). A flat score sort lets a flood of technical
# deciders starve economic / procurement / champion (Vinci: 27 technical → the
# top-30 was ~all technical). We reserve a floor of slots per role.
_DIVERSITY_ROLES: tuple[str, ...] = ("economic", "champion", "technical", "procurement")
_ROLE_FLOOR = 2

# Hierarchy tier → weight. C-level/direction outrank operatives for a first
# conquest touch. Mirror of HIERARCHY_LEVELS ordering.
_HIER_WEIGHT: dict[str, int] = {
    "c_level": 5,
    "direction": 4,
    # Achats (L5, axe parallèle) : POIDS HIÉRARCHIQUE FAIBLE pour la 1re touche de
    # conquête — un acheteur n'est pas une porte d'entrée, sa valeur vient de son
    # RÔLE (procurement, pesé à part) et le plancher de diversité lui réserve sa
    # place. Ne PAS le monter au niveau management, sinon il devance un C-level.
    "achats": 1,
    "management": 3,
    "expert": 2,
    # ``unknown`` est ABSENT à dessein : ``.get(hier, 0)`` lui donne 0, ce qui est
    # le bon comportement pour un PRÉ-TRI. Un titre inconnu ne mérite pas une
    # place d'enrichissement prise à quelqu'un dont on sait le rang ; il n'est pas
    # non plus écarté (``is_out_of_scope`` seul écarte), il passe simplement
    # après. Nuance avec le score de priorité, où l'axe SORT du dénominateur : là
    # on répond « quelle est sa position », ici « qui enrichit-on d'abord ».
    "operationnel": 1,
}

# IT deciders are the core target for an ESN — bump them so a "DSI" outranks a
# same-tier non-IT director.
_IT_DECIDER_BONUS = 3

# Le contact parle du SUJET que le vendeur vend (intersection entre les tokens de
# son intitulé et les ``focus_themes`` du profil ESN).
#
# ⚠️ Ce bonus sert à FAIRE ENTRER dans le lot enrichi, pas à décider du rang
# final — ``reconcile_contact_priorities`` réordonne ensuite avec sa grille /100,
# qui pèse déjà le fit d'offre. D'où une valeur volontairement bornée : 6, la
# même que ``_ROLE_PRIORITY_BOOST`` de cette grille (un seul réglage, une seule
# magnitude). Elle suffit à sortir un « Responsable Data Science » de la zone
# 3-5 où il était coupé, sans le faire passer devant un DSI à 17.
#
# Pourquoi c'était nécessaire : mesuré le 03/09/2026 sur le run KNDS de Julien
# Laszlo (Aquila Data Enabler, ESN data/IA) — Apollo remonte 293 personnes, le
# plafond en garde 50, et le tri qui décidait de ces 50 ne savait rien de ce que
# l'ESN vend. Le score qui le savait tournait 166 lignes plus bas, sur les
# survivants. Voir ``classification.py``.
_FOCUS_MATCH_BONUS = 6


# LUDB.6 — un groupe étranger (STILL = dirigeants allemands/japonais) noie les
# contacts de la zone du vendeur. Le bonus dépasse l'écart entre un dirigeant et
# un responsable de terrain : la France passe d'abord, puis les rôles métier.
_HOME_COUNTRY_BONUS = 12


def _in_home_country(contact: dict[str, Any], home_country: str | None) -> bool:
    return bool(home_country) and str((contact or {}).get("country") or "").strip().lower() == home_country.lower()


def enrichment_score(
    contact: dict[str, Any],
    *,
    industrial: bool = False,
    seller: SellerContext | None = None,
    home_country: str | None = None,
) -> int:
    """Deterministic priority score for a raw (pre-LLM) Apollo contact, driven
    entirely by the job title. Higher = more worth an expensive LLM pass.

    ``seller`` — le contexte dérivé du profil ESN (``focus_themes``). ``None``
    ou vide ⇒ chemin BYTE-IDENTIQUE à l'historique : le pré-tri ne connaît alors
    que le titre, comme avant. C'est la même discipline que ``industrial``.

    ``industrial`` — le vendeur vend de l'ingénierie industrielle. Le prisme
    existait depuis le 24/08 (`classify_decision_role(..., industrial=True)`),
    mais il ne s'appliquait qu'APRÈS ce tri : le pré-tri qui décide QUI est
    enrichi restait à lunettes informatiques, et un « Responsable Méthodes »
    était coupé avant d'atteindre le prisme construit pour lui. Le défaut
    ``False`` garde le chemin IT byte-identique.
    """
    title = (contact or {}).get("title")
    role = classify_decision_role(title, industrial=industrial)  # None when no rule fires
    hier = classify_hierarchy_level(title)
    score = _ROLE_WEIGHT.get(role or "", 0) * 2 + _HIER_WEIGHT.get(hier, 0)
    # Le bonus « décideur IT » ne s'allume que sur un titre IT — pour un vendeur
    # industriel, il ne pénalise personne : il n'ajoute simplement rien, et le
    # rôle technique gagné plus haut fait déjà la différence.
    if is_it_decider(title):
        score += _IT_DECIDER_BONUS
    if seller is not None and seller.focus_themes and _matches_seller_focus(title, seller):
        score += _FOCUS_MATCH_BONUS
    if _in_home_country(contact, home_country):
        score += _HOME_COUNTRY_BONUS
    return score


def _matches_seller_focus(title: str | None, seller: SellerContext) -> bool:
    """Le titre porte-t-il l'un des thèmes déclarés par le vendeur ?

    Même tokenisation que la grille /100 (``_theme_tokens`` : désaccentuation,
    mots ≥4 caractères hors mots vides, ou acronymes courts en capitales), pour
    qu'un seul réglage décide de ce qu'est un « thème » dans tout le produit.
    Réutilisée et non recopiée : deux tokeniseurs divergent.
    """
    if not title:
        return False
    return bool(_theme_tokens(title) & seller.focus_themes)


def rank_contacts_for_enrichment(
    contacts: list[dict[str, Any]],
    limit: int,
    *,
    industrial: bool = False,
    seller: SellerContext | None = None,
    home_country: str | None = None,
    target_families: Sequence[str] | None = None,
) -> list[dict[str, Any]]:
    """Return the top ``limit`` contacts to LLM-enrich, ranked by
    :func:`enrichment_score`.

    - Out-of-scope titles (interns / apprentices / trainees) are excluded
      outright — never worth an enrichment slot.
    - Stable: contacts with equal scores keep their original relative order
      (Python sort is stable, including with ``reverse=True``), so a run is
      reproducible.
    - Role-aware: before filling the cap purely by score, reserve up to
      ``_ROLE_FLOOR`` slots for each buying-committee role so a flood of
      technical deciders can't starve economic / procurement / champion — the
      cap must not undo the diverse Phase-2 search (§4 role coverage).
    - ``target_families`` (#4923.13) — les familles cibles de la demande
      (``contact_themes.target_families``). Une TÊTE de l'une d'elles passe devant
      à séniorité égale (un demi-point : jamais devant un palier supérieur) et se
      voit réserver sa place du top-N avant les autres. Le rôle change l'ORDRE,
      jamais le CONTENU (c76) ; aucun critère protégé n'entre ici. ``None`` ⇒
      chemin byte-identique.
    - ``limit <= 0`` disables the cap (returns every in-scope contact) — the
      escape hatch to revert to "enrich everything".
    """
    in_scope = [c for c in contacts if not is_out_of_scope((c or {}).get("title"))]
    heads = [is_target_head((c or {}).get("title"), target_families) for c in in_scope]
    head_ids = {id(c) for c, is_head in zip(in_scope, heads, strict=True) if is_head}

    def _key(c: dict[str, Any]) -> int:
        # Score doublé + 1 pour une tête : départage l'égalité de séniorité sans jamais
        # franchir un palier (un palier = 1 point = 2 demi-points).
        base = enrichment_score(c, industrial=industrial, seller=seller, home_country=home_country)
        return base * 2 + (1 if id(c) in head_ids else 0)

    ranked = sorted(in_scope, key=_key, reverse=True)
    if not (limit and limit > 0) or len(ranked) <= limit:
        return ranked if not (limit and limit > 0) else ranked[:limit]

    # Diversity floor: reserve the best ``_ROLE_FLOOR`` contacts of each committee
    # role (they're the best of their role since the list is score-sorted), then
    # fill the rest of the cap by pure score. The GLOBAL top (index 0) is always
    # kept first so the floor can never crowd it out at small limits (a flood of
    # committee ties used to drop a tied-top non-committee contact). Indices are
    # kept so the result stays in score order.
    picked: set[int] = {0}
    # #4923.13 — la vague d'enrichissement est réservée D'ABORD aux têtes des
    # familles cibles (déjà en ordre de score), avant le plancher de diversité.
    for i, c in enumerate(ranked):
        if len(picked) >= limit:
            break
        if id(c) in head_ids:
            picked.add(i)
    role_counts: dict[str, int] = {}
    role0 = classify_decision_role((ranked[0] or {}).get("title"), industrial=industrial)
    if role0 in _DIVERSITY_ROLES:
        role_counts[role0] = 1
    for i, c in enumerate(ranked):
        if len(picked) >= limit:
            break
        role = classify_decision_role((c or {}).get("title"), industrial=industrial)
        if role in _DIVERSITY_ROLES and role_counts.get(role, 0) < _ROLE_FLOOR:
            picked.add(i)
            role_counts[role] = role_counts.get(role, 0) + 1
    for i in range(len(ranked)):
        if len(picked) >= limit:
            break
        picked.add(i)
    return [ranked[i] for i in sorted(picked)]
