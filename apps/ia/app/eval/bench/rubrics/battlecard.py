"""Barème de ``bellum_battlecard`` — la fiche de préparation d'un rendez-vous.

Ce prompt produit un ARGUMENTAIRE. « Cette accroche est-elle bonne ? » est une
opinion, et une opinion avec un nombre dessus reste une opinion — le dépôt
l'interdit. Ce qui est notable ici tient en une règle, la seule que le prompt
écrive en majuscules, et elle est vérifiable :

    « RÈGLE STRICTE : si AUCUN concurrent n'est identifié ci-dessus, renvoie
      "vs_competitors": []. N'invente JAMAIS un concurrent, une force ou une
      faiblesse non sourcée. »          (``app/prompts/bellum_battlecard.py:117``)

La liste des concurrents autorisés est injectée dans le prompt utilisateur
(``bellum_battlecard.py:60-65``), en PRESENT-ONLY : soit un JSON de ce que
l'analyse a réellement trouvé, soit la phrase « Aucun concurrent identifié dans
l'analyse. ». ``reading.input_battlecard_competitors`` distingue les trois
états — illisible, aucun, une liste — parce que les confondre absoudrait, dans
un sens, un modèle qui invente.

Le reste des axes compte des CHAMPS et des CARDINALITÉS que le bloc « SORTIE
JSON » énonce. Rien n'y note la pertinence.

===========================  =====================================================
Axe                          Primitive d'origine
===========================  =====================================================
``concurrents_fournis``      la RÈGLE STRICTE + le bloc PRESENT-ONLY du prompt
``contre_angles_complets``   les champs d'une ligne ``vs_competitors`` (:100-106)
``champs_du_contrat``        les clés du bloc SORTIE JSON (:82-115)
``accroches_et_pieges``      les cardinalités énoncées (3 accroches, 3 pièges)
``objection_complete``       les 4 champs de ``probable_objection`` (:108-113)
``contact_situe``            les 3 champs de ``your_contact`` (:85-89)
``sans_donnee_inventee``     ``metrics.fabrication_violations``
===========================  =====================================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations

from .axes import Axis, RubricResult, axis_value, eliminatory, measured, share, unmeasurable
from .reading import as_list, get, input_battlecard_competitors, mappings, norm_name, present

PROMPT = "bellum_battlecard"

#: Les clés du bloc SORTIE JSON. ``vs_competitors`` n'y est PAS : la liste vide
#: est un CONTRAT quand aucun concurrent n'a été fourni, et la compter absente
#: punirait le modèle qui respecte la règle stricte. C'est l'axe
#: ``concurrents_fournis`` qui s'en occupe, et lui seul.
CONTRACT_FIELDS: tuple[str, ...] = (
    "company_activity", "budget_it_estimated", "your_contact",
    "what_to_say", "what_NOT_to_say", "probable_objection", "killer_question",
)

#: Les champs d'une ligne de contre-argumentaire.
VS_FIELDS: tuple[str, ...] = ("competitor", "their_strengths", "their_weaknesses", "our_counter_angle")
#: Les quatre champs de l'objection probable.
OBJECTION_FIELDS: tuple[str, ...] = ("objection", "real_meaning", "response", "mirror_question")
#: Les trois champs du contact principal.
CONTACT_FIELDS: tuple[str, ...] = ("name", "title", "background")
#: Le nombre d'accroches et de pièges que le schéma ÉNONCE (:90-99).
EXPECTED_HOOKS = 3


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    vs = mappings(get(output, "vs_competitors"))
    allowed = input_battlecard_competitors(user_prompt)

    # ── 1. aucun concurrent inventé ───────────────────────────────────────────
    if allowed is None:
        axes.append(unmeasurable(
            "concurrents_fournis", 3.0,
            reason="le bloc CONCURRENTS du prompt d'entrée est illisible — « fourni » et "
                   "« inventé » ne se distinguent pas ; on le DIT plutôt que d'accuser",
            origin="app/prompts/bellum_battlecard.py:60-65,78-80",
        ))
    elif not vs:
        axes.append(unmeasurable(
            "concurrents_fournis", 3.0,
            reason="la battle card ne cite aucun concurrent — rien à vérifier, ce qui n'est pas "
                   "« vérifié à zéro » (et c'est même le contrat quand l'analyse n'en a trouvé aucun)",
            origin="app/prompts/bellum_battlecard.py:117 (RÈGLE STRICTE)",
        ))
    else:
        names = {norm_name(c.get("name") or c.get("competitor")) for c in allowed}
        names.discard("")
        invented = sorted({norm_name(get(v, "competitor")) for v in vs if present(get(v, "competitor"))}
                          - names)
        # ÉLIMINATOIRE : un concurrent inventé se retrouve dans la bouche du
        # commercial en rendez-vous. En part, un faux parmi trois vrais coûterait
        # un point sur cent — et le banc dirait qu'un modèle qui invente un
        # concurrent est « presque aussi bon » qu'un modèle qui n'en invente pas.
        axes.append(eliminatory(
            "concurrents_fournis", 3.0, violations=invented,
            origin="app/prompts/bellum_battlecard.py:117 (RÈGLE STRICTE : « N'invente JAMAIS un "
                   "concurrent ») + :60-65 (bloc PRESENT-ONLY)",
            blind_to="que la FORCE et la FAIBLESSE prêtées à un concurrent fourni soient vraies. "
                     "Le prompt les veut sourcées ; la sortie ne porte pas ses sources.",
            detail=(f"{len(vs)} concurrent(s) cité(s), tous fournis dans l'analyse"
                    if not invented else
                    f"{len(invented)} concurrent(s) que personne n'a fourni(s) : "
                    + "; ".join(invented[:3])),
            data={"cited": len(vs), "provided": len(names), "invented": invented[:10]},
        ))

    # ── 2. un contre-angle est COMPLET ────────────────────────────────────────
    if vs:
        ok, total = share(vs, lambda v: all(present(get(v, f)) for f in VS_FIELDS))
        axes.append(measured(
            "contre_angles_complets", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_battlecard.py:100-106 (champs d'une ligne vs_competitors)",
            blind_to="que le contre-angle FONCTIONNE. On compte quatre champs remplis, pas la "
                     "force de l'argument.",
            detail=f"{ok}/{total} contre-angle(s) avec forces, faiblesses et angle de contre",
        ))
    else:
        axes.append(unmeasurable(
            "contre_angles_complets", 2.0,
            reason="aucun contre-angle à noter — quand l'analyse n'a identifié aucun concurrent, "
                   "la liste vide EST le contrat (bellum_battlecard.py:117), pas un manque",
            origin="app/prompts/bellum_battlecard.py:100-106",
        ))

    # ── 3. les clés du bloc SORTIE JSON ───────────────────────────────────────
    ok, total = share(
        CONTRACT_FIELDS,
        lambda f: present(get(output, f)) or bool(as_list(get(output, f))) or bool(get(output, f)),
    )
    axes.append(measured(
        "champs_du_contrat", 3.0, ok=ok, total=total,
        origin="app/prompts/bellum_battlecard.py:82-115 (bloc SORTIE JSON)",
        blind_to="``vs_competitors``, volontairement HORS de cet axe : la liste vide est un "
                 "contrat, pas un trou. Et rien ici ne mesure la LONGUEUR demandée « en 3 lignes ».",
        detail=f"{ok}/{total} clés du contrat présentes",
    ))

    # ── 4. les cardinalités que le schéma ÉNONCE ──────────────────────────────
    hooks = len([h for h in as_list(get(output, "what_to_say")) if present(h)])
    traps = len([t for t in as_list(get(output, "what_NOT_to_say")) if present(t)])
    axes.append(axis_value(
        "accroches_et_pieges", 2.0,
        ratio=(min(1.0, hooks / EXPECTED_HOOKS) + min(1.0, traps / EXPECTED_HOOKS)) / 2,
        origin="app/prompts/bellum_battlecard.py:90-99 (3 accroches, 3 pièges) — même construction "
               "que app/eval/strategy/rubric.py:62-67 (les minima que le prompt énonce)",
        blind_to="que l'accroche soit SPÉCIFIQUE à ce compte. Le prompt l'exige (:36) ; compter "
                 "trois chaînes ne le vérifie pas.",
        detail=f"accroches {hooks}/{EXPECTED_HOOKS} · pièges {traps}/{EXPECTED_HOOKS}",
    ))

    # ── 5. l'objection probable, et le contact ────────────────────────────────
    for name, weight, keys, host, origin in (
        ("objection_complete", 2.0, OBJECTION_FIELDS, "probable_objection",
         "app/prompts/bellum_battlecard.py:108-113"),
        ("contact_situe", 1.0, CONTACT_FIELDS, "your_contact",
         "app/prompts/bellum_battlecard.py:85-89"),
    ):
        block = get(output, host)
        if isinstance(block, Mapping) and block:
            ok, total = share(keys, lambda k, b=block: present(get(b, k)))
            axes.append(measured(
                name, weight, ok=ok, total=total, origin=origin,
                blind_to="que le contenu du champ soit juste : on compte des champs remplis, pas "
                         "la justesse de ce qu'ils disent.",
                detail=f"{ok}/{total} champs de « {host} »",
            ))
        else:
            axes.append(unmeasurable(
                name, weight,
                reason=f"« {host} » est absent — c'est champs_du_contrat qui sanctionne l'absence, "
                       "pas cet axe (qui noterait sinon deux fois la même faute)",
                origin=origin,
            ))

    # ── 6. aucune donnée fabriquée ────────────────────────────────────────────
    axes.append(eliminatory(
        "sans_donnee_inventee", 2.0,
        violations=fabrication_violations([
            get(output, "company_activity"), get(output, "budget_it_estimated"),
            get(output, "your_contact"), get(output, "what_to_say"),
            get(output, "what_NOT_to_say"), vs, get(output, "probable_objection"),
            get(output, "killer_question"),
        ]),
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations)",
        blind_to="un budget IT estimé au doigt mouillé : « ≈ 40 M€ » ne porte aucun marqueur de "
                 "remplissage, et le prompt ne demande pas de le sourcer.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure la STRUCTURE et le respect de la règle PRESENT-ONLY sur la "
               "concurrence. Il ne dit rien de la valeur de l'argumentaire — ni si l'accroche "
               "parle à ce compte, ni si la « killer question » débloque quoi que ce soit. Noter "
               "cela reviendrait à mettre un nombre sur un goût.",
    )
