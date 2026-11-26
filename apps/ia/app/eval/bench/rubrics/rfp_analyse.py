"""Barème de ``bellum_rfp_analyse`` — lire un appel d'offres et trancher.

Le prompt le dit de lui-même : « C'est, avec la réécriture de CV, le prompt le
plus dangereux du produit » (``app/prompts/bellum_rfp.py:8``). Ce qu'il produit
n'est pas un texte d'agrément : c'est une grille d'exigences dont chaque ligne
devient un engagement, et un verdict bid/no-bid qui décide de trois jours
d'avant-vente.

Ce qui le rend **mécaniquement notable** tient en trois choses, toutes écrites
ailleurs que dans ce fichier :

1. **le document est fermé.** Les exigences sortent « telles qu'écrites »
   (``bellum_rfp.py:127``) d'un cahier des charges qui est dans le prompt
   utilisateur. Confronter les deux est de l'arithmétique de chaînes ;
2. **les trois vocabulaires sont fermés**, et ils ne le sont pas ici : ce sont
   les ``z.enum`` du contrat partagé (``packages/contracts/src/schemas/rfp.ts``)
   que l'API relit à l'import ;
3. **une règle écrite tranche le verdict** — « Un "oui si" n'est pas un "oui" »
   (``bellum_rfp.py:78-79``, redite dans ``rfp.ts:113-118``).

⚠️ **La raison qui rend ce barème utile en production**, et pas seulement au
banc : la route part avec ``response_model=dict``
(``app/routers/rfp.py:104``). **Rien ne valide la forme de cette sortie**, ni
Pydantic, ni Zod — le service NestJS normalise ce qu'il reconnaît et ignore le
reste. Les axes de vocabulaire ci-dessous sont donc le seul endroit du dépôt qui
regarde si ``weight``, ``kind`` et ``ownerRole`` sont ceux du contrat.

⚠️ **On note l'EXTRACTION et la FORME, jamais la justesse du verdict.** Aucun axe
ne dit si le bid/no-bid est le bon — ce serait une opinion avec un nombre dessus,
et le dépôt l'interdit. Un appel d'offres parfaitement extrait, assorti d'un
verdict absurde mais bien formé, marque 100 ici.

===================================  =========================================
Axe                                  Primitive d'origine
===================================  =========================================
``exigences_citees``                 le gabarit « telle qu'écrite »
                                     (``bellum_rfp.py:127``)
``poids_du_vocabulaire``             ``rfpRequirementWeightSchema`` (rfp.ts:55)
``natures_et_roles_du_vocabulaire``  ``rfpRequirementKindSchema`` (rfp.ts:59) +
                                     ``rfpOwnerRoleSchema`` (rfp.ts:76)
``decision_complete``                ``bidDecisionSchema`` (rfp.ts:120)
``bornes_de_la_decision``            ``fit`` / ``capacity`` 0-100 (rfp.ts:122)
``un_oui_si_n_est_pas_un_oui``       ``bellum_rfp.py:78-79`` + rfp.ts:113-118
``exigence_coupee_reste_ambigue``    ``bellum_rfp.py:88-89`` (règle CONDITIONNELLE)
``sans_donnee_inventee``             ``metrics.fabrication_violations``
===================================  =========================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations

from .axes import Axis, RubricResult, eliminatory, measured, share, unmeasurable
from .reading import (
    comparable,
    get,
    input_rfp_document,
    mappings,
    present,
    quote_is_grounded,
    rfp_document_is_truncated,
)

PROMPT = "bellum_rfp_analyse"

_CONTRACT = "packages/contracts/src/schemas/rfp.ts"
_PROMPT_FILE = "app/prompts/bellum_rfp.py"

#: Les trois vocabulaires FERMÉS, recopiés du contrat partagé — et un test
#: refuse qu'ils en divergent (``test_bench_prompts_restants.py``). Les recopier
#: sans garde ferait exactement le défaut « un réglage qui vit à deux endroits ».
WEIGHTS: tuple[str, ...] = ("mandatory", "desirable", "informative", "ambiguous")
KINDS: tuple[str, ...] = (
    "technical", "security", "delivery", "financial", "contractual", "csr", "team", "other",
)
OWNER_ROLES: tuple[str, ...] = ("sales", "expert", "hr", "legal", "security", "finance")
VERDICTS: tuple[str, ...] = ("bid", "no_bid", "conditional")

#: Les champs que ``bidDecisionSchema`` rend obligatoires (rfp.ts:120-133).
#: ``fit`` et ``capacity`` n'y sont PAS : ils sont ``nullable`` par contrat, et
#: le prompt EXIGE ``null`` quand le modèle ne peut pas les établir
#: (``bellum_rfp.py:90-91``). Les compter absents punirait l'honnêteté — c'est
#: ``bornes_de_la_decision`` qui les regarde, et seulement pour leurs bornes.
DECISION_TEXT_FIELDS: tuple[str, ...] = ("verdict", "rationale")
DECISION_LIST_FIELDS: tuple[str, ...] = ("conditions", "questions", "redFlags")


def _requirements(output: Mapping[str, Any]) -> list[dict[str, Any]]:
    return mappings(get(output, "requirements"))


def _decision(output: Mapping[str, Any]) -> dict[str, Any]:
    value = get(output, "decision")
    return dict(value) if isinstance(value, Mapping) else {}


def _in_range(value: Any) -> bool:
    """``null`` OU un nombre entre 0 et 100 — jamais une chaîne, jamais 120.

    ``None`` est une réponse VALIDE et voulue : « Si tu ne peux pas établir
    ``fit`` ou ``capacity``, rends ``null`` — pas une valeur médiane rassurante »
    (``bellum_rfp.py:90-91``).
    """
    if value is None:
        return True
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return 0 <= value <= 100


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    requirements = _requirements(output)
    decision = _decision(output)
    document = input_rfp_document(user_prompt)
    haystack = comparable(document) if document is not None else ""
    truncated = rfp_document_is_truncated(user_prompt)

    # ── 1. les exigences sortent-elles DU document ? ───────────────────────────
    if document is None:
        axes.append(unmeasurable(
            "exigences_citees", 4.0,
            reason="le cahier des charges est illisible dans le prompt d'entrée — sans lui, "
                   "« extraite » et « inventée » ne se distinguent pas ; on ne conclut pas que "
                   "tout est inventé",
            origin=f"{_PROMPT_FILE}:127 (« l'exigence, telle qu'écrite »)",
        ))
    elif not requirements:
        axes.append(unmeasurable(
            "exigences_citees", 4.0,
            reason="aucune exigence extraite — il n'y a rien à confronter au document ; c'est "
                   "decision_complete qui note ce que la sortie porte, pas cet axe",
            origin=f"{_PROMPT_FILE}:127 (« l'exigence, telle qu'écrite »)",
        ))
    else:
        ok, total = share(
            requirements, lambda r: quote_is_grounded(get(r, "text"), haystack)
        )
        # ⚠️ Une PART, pas une porte — divergence ASSUMÉE avec ``rubrics/cv.py``,
        # qui met à zéro un CV dont une citation est introuvable. La raison est
        # dans les prompts eux-mêmes : ``bellum_cv`` exige une « CITATION EXACTE
        # et CONTINUE » d'au moins douze caractères, ``bellum_rfp_analyse``
        # demande une exigence « telle qu'écrite » — une consigne de fidélité,
        # pas un contrat de longueur. Zéroer une reformulation d'une virgule
        # ferait dire au banc qu'un modèle qui reformule FABRIQUE, ce qui est
        # faux, et ce jugement-là tomberait sur le modèle le moins littéral.
        axes.append(measured(
            "exigences_citees", 4.0, ok=ok, total=total,
            origin=f"{_PROMPT_FILE}:127 (« l'exigence, telle qu'écrite ») + "
                   f"{_PROMPT_FILE}:85-86 (« N'INVENTE aucune référence »)",
            blind_to="une exigence OMISE : le barème ne connaît pas le nombre vrai d'exigences du "
                     "document, donc un modèle qui n'en rend qu'une, parfaitement citée, marque "
                     "plein. Et une reformulation légère compte comme une invention — la note "
                     "descend, elle ne s'annule pas.",
            detail=f"{ok}/{total} exigence(s) retrouvée(s) mot pour mot dans le document",
            data={"requirements": total, "grounded": ok},
        ))

    # ── 2. les trois vocabulaires FERMÉS du contrat ────────────────────────────
    if requirements:
        ok, total = share(requirements, lambda r: str(get(r, "weight") or "") in WEIGHTS)
        axes.append(measured(
            "poids_du_vocabulaire", 2.0, ok=ok, total=total,
            origin=f"{_CONTRACT}:55 (rfpRequirementWeightSchema)",
            blind_to="que le poids soit le BON. « ambiguous » est une catégorie de plein droit "
                     "(rfp.ts:48-53) : un modèle qui range tout en « ambiguous » passe cet axe "
                     "sans avoir rien classé.",
            detail=f"{ok}/{total} exigence(s) au vocabulaire de rfpRequirementWeightSchema",
        ))

        checks = [
            *(str(get(r, "kind") or "") in KINDS for r in requirements),
            *(str(get(r, "ownerRole", "owner_role") or "") in OWNER_ROLES for r in requirements),
        ]
        axes.append(measured(
            "natures_et_roles_du_vocabulaire", 2.0,
            ok=sum(1 for c in checks if c), total=len(checks),
            origin=f"{_CONTRACT}:59 (rfpRequirementKindSchema) + {_CONTRACT}:76 (rfpOwnerRoleSchema)",
            blind_to="le lien entre les deux. « Le rôle découle de la nature » "
                     f"({_PROMPT_FILE}:70-72) : une clause de pénalité est `contractual` → `legal`. "
                     "Le dépôt ne porte AUCUNE table nature→rôle — la dériver ici l'inventerait, "
                     "et ce barème ne note que ce qui est déjà écrit ailleurs.",
            detail=f"{sum(1 for c in checks if c)}/{len(checks)} champ(s) dans leur énumération",
        ))
    else:
        for name, weight in (("poids_du_vocabulaire", 2.0), ("natures_et_roles_du_vocabulaire", 2.0)):
            axes.append(unmeasurable(
                name, weight,
                reason="aucune exigence extraite — il n'y a aucun champ à confronter aux "
                       "énumérations du contrat",
                origin=f"{_CONTRACT}:55,59,76",
            ))

    # ── 3. la décision, et ses bornes ─────────────────────────────────────────
    filled = [
        str(get(decision, "verdict") or "") in VERDICTS,
        present(get(decision, "rationale")),
        *(isinstance(get(decision, f), list) for f in DECISION_LIST_FIELDS),
    ]
    axes.append(measured(
        "decision_complete", 2.0, ok=sum(1 for c in filled if c), total=len(filled),
        origin=f"{_CONTRACT}:120 (bidDecisionSchema) + {_PROMPT_FILE}:74-82",
        blind_to="le CONTENU de la décision. Qu'un `redFlag` soit un vrai signal d'alerte, qu'une "
                 "question mérite d'être posée, qu'un `rationale` de six phrases dise quelque "
                 "chose : rien de tout cela n'est mesuré, et le prétendre serait une opinion.",
        detail=f"{sum(1 for c in filled if c)}/{len(filled)} champs de bidDecisionSchema "
               f"({', '.join((*DECISION_TEXT_FIELDS, *DECISION_LIST_FIELDS))})",
    ))

    if not decision:
        # ⚠️ PAS « 2/2 ». Sans décision, ``fit`` et ``capacity`` sont absents —
        # et l'absence est une réponse VALIDE de ce prompt. Les compter bons
        # donnerait un axe plein à une sortie vide : mesuré une fois, une sortie
        # ``{}`` marquait 60/100. C'est ``decision_complete`` qui sanctionne
        # l'absence de décision ; cet axe n'a simplement rien à borner.
        axes.append(unmeasurable(
            "bornes_de_la_decision", 1.0,
            reason="aucune décision rendue — il n'y a aucune valeur à borner. L'absence est "
                   "notée par decision_complete, pas ici",
            origin=f"{_CONTRACT}:122-125 (fit / capacity : entier 0-100, nullable)",
        ))
    else:
        bounded = [_in_range(get(decision, "fit")), _in_range(get(decision, "capacity"))]
        axes.append(measured(
            "bornes_de_la_decision", 1.0, ok=sum(1 for c in bounded if c), total=len(bounded),
            origin=f"{_CONTRACT}:122-125 (fit / capacity : entier 0-100, nullable)",
            blind_to="une « valeur médiane rassurante » — 50 et 50 passent cet axe. Le prompt "
                     f"l'interdit ({_PROMPT_FILE}:90-91) ; rien dans la sortie ne permet de "
                     "distinguer un 50 mesuré d'un 50 de confort.",
            detail=f"{sum(1 for c in bounded if c)}/2 (fit, capacity) null ou dans [0,100]",
        ))

    # ── 4. « un oui si n'est pas un oui » ─────────────────────────────────────
    conditions = [c for c in (get(decision, "conditions") or []) if isinstance(c, str) and c.strip()]
    if not conditions:
        axes.append(unmeasurable(
            "un_oui_si_n_est_pas_un_oui", 1.5,
            reason="aucune condition posée — la règle ne s'applique pas. Ne pas en poser n'est "
                   "pas une faute : c'est un « oui » ou un « non » franc",
            origin=f"{_PROMPT_FILE}:78-79",
        ))
    else:
        verdict = str(get(decision, "verdict") or "")
        axes.append(measured(
            "un_oui_si_n_est_pas_un_oui", 1.5, ok=1 if verdict != "bid" else 0, total=1,
            origin=f"{_PROMPT_FILE}:78-79 (« Un “oui si” n'est pas un “oui” — verdict "
                   f"`conditional` ») + {_CONTRACT}:113-118",
            blind_to="la PERTINENCE des conditions. Un modèle qui pose une condition vide de sens "
                     "pour basculer en `conditional` passe cet axe.",
            detail=f"{len(conditions)} condition(s) posée(s), verdict « {verdict or '?'} »",
            data={"verdict": verdict, "conditions": len(conditions)},
        ))

    # ── 5. la règle CONDITIONNELLE du document coupé ──────────────────────────
    if not truncated:
        axes.append(unmeasurable(
            "exigence_coupee_reste_ambigue", 1.5,
            reason="le document fourni n'est PAS tronqué — la règle « marque `ambiguous` tout ce "
                   "dont tu n'as pas lu la fin » ne s'applique pas ici. Elle n'est pas ratée : "
                   "elle n'a pas été posée",
            origin=f"{_PROMPT_FILE}:88-89",
        ))
    elif not requirements:
        axes.append(unmeasurable(
            "exigence_coupee_reste_ambigue", 1.5,
            reason="document tronqué mais aucune exigence extraite — il n'y a rien dont on puisse "
                   "dire qu'il aurait dû sortir `ambiguous`",
            origin=f"{_PROMPT_FILE}:88-89",
        ))
    else:
        ambiguous = sum(1 for r in requirements if str(get(r, "weight") or "") == "ambiguous")
        axes.append(measured(
            "exigence_coupee_reste_ambigue", 1.5, ok=1 if ambiguous else 0, total=1,
            origin=f"{_PROMPT_FILE}:88-89 + {_PROMPT_FILE}:105-110 (la note de troncature "
                   "EXPÉDIÉE dans le prompt)",
            blind_to="QUELLES exigences auraient dû sortir `ambiguous`. Le barème ne sait pas "
                     "où le document a été coupé ; il vérifie seulement qu'un modèle prévenu "
                     "d'une troncature en a marqué AU MOINS UNE, au lieu de tout trancher.",
            detail=f"{ambiguous} exigence(s) marquée(s) `ambiguous` sur un document tronqué",
            data={"ambiguous": ambiguous, "requirements": len(requirements)},
        ))

    # ── 6. aucune donnée fabriquée ────────────────────────────────────────────
    axes.append(eliminatory(
        "sans_donnee_inventee", 2.0,
        violations=fabrication_violations([
            get(output, "title"), get(output, "issuer"), get(output, "lots"), requirements, decision,
        ]),
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations — "
               "porte `passed = not violations`)",
        blind_to="une invention PLAUSIBLE : une pondération de critères que le document ne donne "
                 f"pas ({_PROMPT_FILE}:87) ne contient aucun marqueur de remplissage. C'est "
                 "exigences_citees qui l'attrape, et seulement sur le texte des exigences.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure l'EXTRACTION et la FORME, jamais la justesse du verdict : ni que "
               "le bid/no-bid soit le bon, ni que les exigences éliminatoires aient été reconnues "
               "comme telles, ni que les lots n'aient pas été fondus (le barème ne connaît pas "
               "leur nombre vrai). Il répond à « cette grille est-elle tirée du document et "
               "exploitable ? », pas à « fallait-il y aller ? ».",
    )
