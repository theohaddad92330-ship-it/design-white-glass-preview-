"""Barème de ``bellum_organigramme`` — le plus gros JSON de la phase 3.

Le principe : **ne noter que ce que l'assembleur expédié garderait**. Une
relation que ``org_graph_assembler`` jette n'a pas « un peu moins de valeur »,
elle n'existe pas dans le produit — c'est donc elle, et pas une opinion sur la
forme, qui fait la différence entre deux modèles sur ce poste.

Les trois conditions de conservation d'une relation sont écrites une seule fois,
à ``app/services/org_graph_assembler.py:596-618`` :

    relation = str(_get(rel, "type", "relation") or "").strip().lower()
    if relation not in _RELATION_TOPIC:      continue      # 1. type connu
    evidence = str(_get(rel, "evidence") or "").strip()
    if not evidence:                          continue      # 2. preuve citée
    …
    if not from_id or not to_id or from_id == to_id: continue  # 3. deux nœuds distincts

Cet axe les rejoue avec l'ensemble PUBLIC ``org_resolver.HIERARCHY_RELATIONS``
(``app/services/org_resolver.py:57``), qui est le même que les clés de
``_RELATION_TOPIC`` — et un test le vérifie, pour que la dérive se voie.

===========================  =====================================================
Axe                          Primitive d'origine
===========================  =====================================================
``personnes_reelles``        ``org_graph_assembler:582-587`` (_resolve_node) +
                             ``judge._check_coherence`` (``app/graph/judge.py:178``)
``relations_retenues``       ``org_resolver.HIERARCHY_RELATIONS`` (:57) +
                             ``org_graph_assembler:596-618``
``influences_retenues``      ``org_resolver.resolve_influence_edge`` (:184)
``zones_relancables``        ``UncoveredZone`` (``app/models/outputs/contacts.py:141-152``)
                             + ``_CONTRACT_LEVELS`` (``org_graph_assembler.py:69``)
``chemin_actionnable``       ``ApproachStep`` (``app/models/outputs/contacts.py:209-221``)
``chaine_de_decision``       ``DecisionChain`` (``app/models/outputs/contacts.py:125-137``)
===========================  =====================================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.services.org_graph_assembler import _CONTRACT_LEVELS
from app.services.org_resolver import HIERARCHY_RELATIONS, EdgeSource, resolve_influence_edge

from .axes import Axis, RubricResult, eliminatory, measured, unmeasurable
from .reading import as_list, contact_names, get, mappings, norm_name, present
from .reading import input_contacts as read_input_contacts

PROMPT = "bellum_organigramme"

#: Les champs qu'une étape du chemin commercial DOIT porter — annexe p26, recopiée
#: dans ``app/models/outputs/contacts.py:213-220`` : « contact exact, objectif,
#: CANAL, preuve, risque, résultat attendu, contact suivant et FALLBACK ».
APPROACH_FIELDS: tuple[tuple[str, ...], ...] = (
    ("contact",),
    ("role",),
    ("why_first", "whyFirst"),
    ("channel",),
    ("expected_outcome", "expectedOutcome"),
    ("unlocks",),
    ("fallback",),
)

#: Les trois axes sans lesquels une zone blanche « est une phrase, pas une
#: lacune » (``app/models/outputs/contacts.py:141-147``).
ZONE_FIELDS: tuple[str, ...] = ("entity", "family", "level")


def _people_named(output: Mapping[str, Any]) -> list[str]:
    """Toutes les PERSONNES que la sortie nomme, dans l'ordre des surfaces où le
    produit ira les chercher."""
    names: list[str] = []
    for entity in mappings(get(output, "organigramme", "org_chart")):
        names += [str(c) for c in as_list(get(entity, "contacts")) if present(c)]
    chain = get(output, "decisionChain", "decision_chain")
    for step in mappings(get(chain, "steps") if isinstance(chain, Mapping) else None):
        names += [str(a) for a in as_list(get(step, "actors")) if present(a)]
    for entry in mappings(get(output, "stakeholderMap", "stakeholder_map")):
        if present(get(entry, "fullName", "full_name")):
            names.append(str(get(entry, "fullName", "full_name")))
    for step in mappings(get(output, "approach_order", "approachOrder")):
        if present(get(step, "contact")):
            names.append(str(get(step, "contact")))
    return names


def _claim_names(claims: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for c in claims:
        for key in (("from", "from_name", "fromName"), ("to", "to_name", "toName")):
            value = get(c, *key)
            if present(value):
                out.append(str(value))
    return out


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    relations = mappings(get(output, "hierarchyRelations", "hierarchy_relations"))
    influences = mappings(get(output, "influenceMap", "influence_map"))

    # ── 1. aucune personne inventée ───────────────────────────────────────────
    given = read_input_contacts(user_prompt)
    named = [n for n in (norm_name(x) for x in _people_named(output) + _claim_names(relations)) if n]
    if given is None:
        axes.append(unmeasurable(
            "personnes_reelles", 3.0,
            reason="la liste de contacts FOURNIE est illisible dans le prompt d'entrée — sans elle, "
                   "un nom inventé et un nom fourni sont indiscernables",
            origin="app/services/org_graph_assembler.py:582-587 (_resolve_node) + app/graph/judge.py:178-202",
        ))
    elif not named:
        axes.append(unmeasurable(
            "personnes_reelles", 3.0,
            reason="la sortie ne nomme aucune personne — ne nommer personne n'est pas inventer",
            origin="app/services/org_graph_assembler.py:582-587",
        ))
    else:
        known = contact_names(given)
        # L'assembleur résout un nom vers une PERSONNE **ou** une ENTITÉ : le
        # schéma du prompt autorise explicitement `to` = « nom exact de l'entite
        # de rattachement » (app/prompts/bellum_organigramme.py:166).
        known |= {
            norm_name(get(e, "entity")) for e in mappings(get(output, "organigramme", "org_chart"))
            if present(get(e, "entity"))
        }
        invented = sorted({n for n in named if n not in known})
        real = sum(1 for n in named if n in known)
        # ⚠️ ÉLIMINATOIRE, pas une part. Une personne fabriquée n'est pas
        # « 6 sur 7 » : notée en part, un fantôme parmi sept noms vaut 0,857 —
        # trois points sur cent — et le banc dirait alors qu'un modèle qui
        # INVENTE UN CONTACT est presque aussi bon qu'un modèle honnête. C'est la
        # porte dure du juge, qui classe ce cas ``critical``, donc binaire.
        axes.append(eliminatory(
            "personnes_reelles", 3.0, violations=invented,
            origin="app/services/org_graph_assembler.py:582-587 (_resolve_node : un nom qui ne "
                   "résout ni vers une personne ni vers une entité ne fait pas d'arête) + "
                   "app/graph/judge.py:195-202 (_check_coherence, sévérité CRITICAL = binaire)",
            blind_to="un nom fourni placé au MAUVAIS endroit : rattacher un vrai DSI à la mauvaise "
                     "filiale passe l'axe. Seule l'invention pure est vue.",
            detail=(f"{real}/{len(named)} mention(s) rattachée(s) à la liste fournie"
                    + (f" — INVENTÉ(S) : {', '.join(invented[:3])}" if invented else "")),
            data={"invented": invented[:5], "mentions": len(named), "resolved": real},
        ))

    # ── 2. les relations que l'assembleur garderait ───────────────────────────
    if relations:
        kept = 0
        for rel in relations:
            relation = str(get(rel, "type", "relation") or "").strip().lower()
            src = norm_name(get(rel, "from", "from_name", "fromName"))
            dst = norm_name(get(rel, "to", "to_name", "toName"))
            if relation in HIERARCHY_RELATIONS and present(get(rel, "evidence")) and src and dst and src != dst:
                kept += 1
        axes.append(measured(
            "relations_retenues", 3.0, ok=kept, total=len(relations),
            origin="app/services/org_resolver.py:57 (HIERARCHY_RELATIONS) + "
                   "app/services/org_graph_assembler.py:596-618 (les 3 conditions de conservation)",
            blind_to="que la relation soit VRAIE. Une preuve citée suffit à la conserver ; le "
                     "resolver la range ensuite en influence plafonnée à 49 précisément parce "
                     "qu'une affirmation de modèle n'est jamais un fait.",
            detail=f"{kept}/{len(relations)} relation(s) que l'assembleur conserverait",
        ))
    else:
        axes.append(unmeasurable(
            "relations_retenues", 3.0,
            reason="le modèle n'a produit aucune relation hiérarchique — la refonte du graphe est "
                   "ADDITIVE (app/models/outputs/contacts.py:245-247), donc n'en produire aucune "
                   "n'est pas en produire de fausses",
            origin="app/services/org_resolver.py:57",
        ))

    # ── 3. les influences que le resolver garderait ───────────────────────────
    if influences:
        kept = 0
        for inf in influences:
            edge = resolve_influence_edge(
                from_id=norm_name(get(inf, "from", "from_name", "fromName")) or "?",
                to_id=norm_name(get(inf, "to", "to_name", "toName")) or "?",
                topic=str(get(inf, "topic") or ""),
                reasoning=str(get(inf, "reasoning") or ""),
                sources=[EdgeSource(id="s-llm", kind="llm")],
            )
            if edge is not None and present(get(inf, "topic")) and edge["fromId"] != edge["toId"]:
                kept += 1
        axes.append(measured(
            "influences_retenues", 2.0, ok=kept, total=len(influences),
            origin="app/services/org_resolver.py:184-211 (resolve_influence_edge : un raisonnement "
                   "vide rend None) + app/services/org_graph_assembler.py:632-642 (topic exigé)",
            blind_to="la PERTINENCE du sujet d'influence. « influence sur les sujets IT » passe.",
            detail=f"{kept}/{len(influences)} lien(s) d'influence que le resolver garderait",
        ))
    else:
        axes.append(unmeasurable(
            "influences_retenues", 2.0,
            reason="le modèle n'a produit aucun lien d'influence",
            origin="app/services/org_resolver.py:184-211",
        ))

    # ── 4. les zones blanches sont-elles RELANÇABLES ? ────────────────────────
    zones = mappings(get(output, "uncoveredZones", "uncovered_zones"))
    if zones:
        actionable = sum(
            1 for z in zones
            if all(present(get(z, f)) for f in ZONE_FIELDS)
            and str(get(z, "level") or "").strip().upper() in _CONTRACT_LEVELS
        )
        axes.append(measured(
            "zones_relancables", 2.0, ok=actionable, total=len(zones),
            origin="app/models/outputs/contacts.py:141-152 (« sans ces trois axes, la case n'est "
                   "pas relançable — c'est une phrase, pas une lacune ») + "
                   "app/services/org_graph_assembler.py:69 (_CONTRACT_LEVELS)",
            blind_to="qu'une zone déclarée couverte le soit vraiment : on note les zones ÉMISES, "
                     "jamais celles que le modèle a oubliées.",
            detail=f"{actionable}/{len(zones)} zone(s) situées (entité + famille + niveau L0-L5)",
        ))
    else:
        axes.append(unmeasurable(
            "zones_relancables", 2.0,
            reason="aucune zone blanche émise — l'absence d'une lacune n'est pas une lacune mal "
                   "décrite, et rien dans la sortie ne dit s'il en manquait",
            origin="app/models/outputs/contacts.py:141-152",
        ))

    # ── 5. le chemin commercial est-il actionnable ? ──────────────────────────
    steps = mappings(get(output, "approach_order", "approachOrder"))
    if steps:
        complete = sum(1 for s in steps if all(present(get(s, *names)) for names in APPROACH_FIELDS))
        axes.append(measured(
            "chemin_actionnable", 2.0, ok=complete, total=len(steps),
            origin="app/models/outputs/contacts.py:209-221 (ApproachStep — annexe p26 : contact, "
                   "canal, résultat attendu, ce que ça débloque, FALLBACK)",
            blind_to="l'ORDRE des étapes, qui est pourtant tout le sujet d'un « chemin ».",
            detail=f"{complete}/{len(steps)} étape(s) avec ses 7 champs",
        ))
    else:
        axes.append(unmeasurable(
            "chemin_actionnable", 2.0,
            reason="aucune étape de chemin commercial produite",
            origin="app/models/outputs/contacts.py:209-221",
        ))

    # ── 6. la chaîne de décision ──────────────────────────────────────────────
    chain = get(output, "decisionChain", "decision_chain")
    chain = chain if isinstance(chain, Mapping) else {}
    chain_steps = mappings(get(chain, "steps"))
    checks = [
        present(get(chain, "description")),
        bool(chain_steps),
        bool(chain_steps) and all(as_list(get(s, "actors")) for s in chain_steps),
        present(get(chain, "estimatedCycleLength", "estimated_cycle_length")),
        present(get(chain, "budgetAuthority", "budget_authority")),
    ]
    axes.append(measured(
        "chaine_de_decision", 2.0, ok=sum(1 for c in checks if c), total=len(checks),
        origin="app/models/outputs/contacts.py:125-137 (DecisionChain / DecisionStep)",
        blind_to="la VRAISEMBLANCE du cycle annoncé : « 3 semaines » chez un grand compte public "
                 "remplit la case aussi bien que « 9 mois ».",
        detail=f"{sum(1 for c in checks if c)}/{len(checks)} éléments de chaîne de décision",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Le comité d'achat n'est PAS noté ici : la sortie de bellum_organigramme ne porte "
               "que des NOMS, sans titre, et ``assemble_buying_committee`` classe par TITRE. C'est "
               "le barème de bellum_contacts qui le mesure, sur la sortie qui porte les titres.",
    )
