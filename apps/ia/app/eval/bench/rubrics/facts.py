"""Barème de ``bellum_facts`` — ce que l'entreprise EST.

⚠️ **Le SIREN ne vient PAS de ce prompt.** Le schéma de
``app/prompts/bellum_facts.py:69-138`` ne le demande pas, et ``ResearchFacts``
(``app/models/outputs/research.py:342``) n'a pas ce champ : le SIREN vient du
registre (Pappers / INSEE), pas du modèle. Le contrôle de Luhn reste ici — il
s'applique au SIREN que le modèle **s'autorise à ajouter** sur une filiale ou une
entité (``Subsidiary.siren``, ``EntityExhaustive`` en ``extra=allow``) — mais
l'axe est *non mesurable* le jour où il n'y en a aucun, ce qui est le cas normal.
C'est l'exemple type : « rien à vérifier » n'est pas « vérifié à zéro ».

Aucun critère n'est inventé ici. Chaque axe réutilise, dans l'ordre :

===========================  =====================================================
Axe                          Primitive d'origine
===========================  =====================================================
``faits_durs``               ``confidence._KEY_FACTS`` (``app/services/confidence.py:57``)
``sans_donnee_inventee``     ``metrics.fabrication_violations`` (``app/eval/metrics.py``)
``siren_plausible``          ``metrics.siren_violations`` (Luhn + 9 chiffres)
``entites_situees``          les champs contractuels d'une entité
                             (``app/prompts/bellum_facts.py:84-93``)
``minima_du_schema``         les minima que le prompt ÉNONCE (MIN 4 / 2 / 2 / 5)
===========================  =====================================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations, siren_violations
from app.services.confidence import _KEY_FACTS

from .axes import Axis, RubricResult, axis_value, eliminatory, measured, share, unmeasurable
from .reading import as_list, get, mappings, present

PROMPT = "bellum_facts"

#: Les champs contractuels d'une entité de ``entitiesExhaustive``. Même
#: construction que ``rubric.ANGLE_FIELDS`` : ce que le prompt demande, pas ce
#: qu'on trouverait joli. ``app/prompts/bellum_facts.py:85-90``.
ENTITY_FIELDS: tuple[tuple[str, ...], ...] = (
    ("name",),
    ("type",),
    ("parent",),
    ("itAutonomy", "it_autonomy"),
)

#: Les minima que le prompt ÉNONCE, ligne par ligne — c'est la même mécanique que
#: ``rubric.MIN_CHALLENGES`` & co. (« Schema minimums the prompt states
#: explicitly », ``app/eval/strategy/rubric.py:62``).
SCHEMA_MINIMUMS: tuple[tuple[str, tuple[str, ...], int], ...] = (
    ("entitiesExhaustive", ("entitiesExhaustive", "entities_exhaustive"), 4),  # prompt :81
    ("sitesFrance", ("sitesFrance", "sites_france"), 2),                       # prompt :97
    ("programNames", ("programNames", "program_names"), 2),                    # prompt :107
    ("technologyStack", ("technologyStack", "technology_stack"), 5),           # prompt :110
)

#: Les SIREN qu'un modèle peut s'autoriser à ajouter, alors qu'on ne lui en
#: demande aucun. Les chercher là où ils pourraient atterrir, nulle part ailleurs.
_SIREN_HOSTS: tuple[tuple[str, ...], ...] = (
    ("subsidiaries",),
    ("entitiesExhaustive", "entities_exhaustive"),
)


def _volunteered_sirens(output: Mapping[str, Any]) -> list[str]:
    out: list[str] = []
    for keys in _SIREN_HOSTS:
        for item in mappings(get(output, *keys)):
            value = get(item, "siren")
            if present(value):
                out.append(str(value))
    return out


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:  # noqa: ARG001
    axes: list[Axis] = []

    # ── 1. les faits durs, tels que le moteur de confiance les nomme ──────────
    ok, total = share(_KEY_FACTS, lambda f: present(get(output, f)))
    axes.append(measured(
        "faits_durs", 3.0, ok=ok, total=total,
        origin="app/services/confidence.py:57 (_KEY_FACTS) + app/eval/metrics.py:123 (_present)",
        blind_to="qu'un fait présent soit VRAI ou sourcé — le grounding se mesure sur le dossier "
                 "assemblé (metrics.faithfulness), pas sur la sortie d'un prompt qui n'a pas de bloc sources.",
        detail=f"{ok}/{total} faits durs présents ({', '.join(_KEY_FACTS)})",
    ))

    # ── 2. aucune donnée fabriquée ────────────────────────────────────────────
    violations = fabrication_violations([
        get(output, "businessDescription", "business_description"),
        get(output, "sector"),
        get(output, "headquarters"),
        get(output, "concrete_activity", "concreteActivity"),
        get(output, "it_implications_for_esn"),
        get(output, "entitiesExhaustive", "entities_exhaustive"),
        get(output, "sitesFrance", "sites_france"),
        get(output, "technologyStack", "technology_stack"),
    ])
    # ÉLIMINATOIRE : la porte de ``no_invented_data`` est ``passed = not violations``
    # (app/eval/metrics.py:548). Une donnée fabriquée ne se moyenne pas.
    axes.append(eliminatory(
        "sans_donnee_inventee", 3.0, violations=violations,
        origin="app/eval/metrics.py:_FABRICATED_MARKERS + fabrication_violations "
               "(extrait de no_invented_data, dont la porte est `passed = not violations`)",
        blind_to="une invention PLAUSIBLE : « Directeur du Digital » chez une société qui n'en a pas "
                 "ne contient aucun marqueur. Le détecteur ne voit que le vocabulaire de remplissage.",
    ))

    # ── 3. SIREN — seulement si le modèle en a volontairement produit un ───────
    sirens = _volunteered_sirens(output)
    if sirens:
        bad = [f"{s} → {', '.join(siren_violations(s))}" for s in sirens if siren_violations(s)]
        # ÉLIMINATOIRE : un identifiant légal fabriqué n'est pas « 2 SIREN sur 3 ».
        axes.append(eliminatory(
            "siren_plausible", 2.0, violations=bad,
            origin="app/eval/metrics.py:siren_violations (Luhn + 9 chiffres + chiffre répété) — "
                   "porte dure de no_invented_data (app/eval/metrics.py:548)",
            blind_to="qu'un SIREN VALIDE au sens de Luhn désigne la BONNE société — un homonyme "
                     "passe le contrôle.",
            detail=(f"{len(sirens)} SIREN volontairement produit(s), tous plausibles" if not bad
                    else f"{len(bad)}/{len(sirens)} SIREN fabriqué(s) : " + "; ".join(bad[:3])),
            data={"volunteered": len(sirens)},
        ))
    else:
        axes.append(unmeasurable(
            "siren_plausible", 2.0,
            reason="le prompt bellum_facts ne demande AUCUN SIREN (il vient du registre) et le modèle "
                   "n'en a volontairement ajouté aucun — rien à vérifier",
            origin="app/eval/metrics.py:siren_violations",
            blind_to="tout, ici : l'axe n'a pas de matière.",
        ))

    # ── 4. les entités sont SITUÉES (les champs que le prompt exige) ───────────
    entities = mappings(get(output, "entitiesExhaustive", "entities_exhaustive"))
    if entities:
        filled = sum(
            1 for e in entities if all(present(get(e, *names)) for names in ENTITY_FIELDS)
        )
        axes.append(measured(
            "entites_situees", 2.0, ok=filled, total=len(entities),
            origin="app/prompts/bellum_facts.py:85-90 (champs contractuels d'une entité) "
                   "+ app/models/outputs/research.py:22-40 (EntityExhaustive)",
            blind_to="que l'entité EXISTE. Une filiale inventée mais bien renseignée marque 1/1.",
            detail=f"{filled}/{len(entities)} entité(s) avec nom + type + parent + autonomie",
        ))
    else:
        axes.append(unmeasurable(
            "entites_situees", 2.0,
            reason="aucune entité produite — c'est minima_du_schema qui sanctionne l'absence, "
                   "pas cet axe (qui noterait sinon deux fois la même faute)",
            origin="app/prompts/bellum_facts.py:85-90",
        ))

    # ── 5. les minima que le prompt énonce ────────────────────────────────────
    reached, detail = 0.0, []
    for label, keys, minimum in SCHEMA_MINIMUMS:
        n = len([i for i in as_list(get(output, *keys)) if not isinstance(i, str) or present(i)])
        reached += min(1.0, n / minimum)
        detail.append(f"{label} {n}/{minimum}")
    axes.append(axis_value(
        "minima_du_schema", 2.0, ratio=reached / len(SCHEMA_MINIMUMS),
        origin="app/prompts/bellum_facts.py:81,97,107,110 (les MIN que le prompt ÉNONCE) — même "
               "construction que app/eval/strategy/rubric.py:62-67",
        blind_to="la QUALITÉ de ce qui remplit le quota : dix technos génériques valent dix technos justes.",
        detail=" · ".join(detail),
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Aucun axe ne mesure la VÉRACITÉ d'un fait : la sortie de bellum_facts ne porte pas "
               "ses sources (le bloc grounding est ajouté plus tard dans le dossier). Ce barème "
               "mesure la FORME exploitable, pas la véracité.",
    )
