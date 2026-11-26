"""Barème de ``bellum_rfp_draft`` — rédiger une réponse, ou avouer qu'il manque.

C'est le prompt dont une faute coûte un client plutôt qu'une relecture, et il le
dit lui-même : « Ce que tu écrirais à la place — “nous disposons de”, “nos
équipes sont certifiées” — deviendrait un engagement contractuel inventé,
découvert en audit ou en soutenance » (``app/prompts/bellum_rfp.py:156-159``).

Ce qui le rend **mécaniquement notable** : la matière est FERMÉE. Les sources
approuvées sont dans le prompt utilisateur, en JSON
(``app/prompts/bellum_rfp.py:199-200``), et la règle qui prime sur toutes les
autres est une règle d'appartenance — « Chaque affirmation de ta réponse doit
être adossée à une source fournie ». Confronter la source CITÉE au catalogue
FOURNI est de l'arithmétique de chaînes.

Le dépôt rejoue déjà ce contrôle, ailleurs et binairement :
``computeRfpCompliance`` compte les réponses ``drafted`` sans ``answer_source``
sous le nom ``unprovenCommitments`` et **bloque l'export**
(``packages/contracts/src/schemas/rfp.ts:203-207,215``). L'axe
``redige_seulement_avec_source`` rebranche ce compte sur la sortie d'un prompt.

⚠️ Comme ``bellum_rfp_analyse``, cette route part avec ``response_model=dict``
(``app/routers/rfp.py:137``) : **rien ne valide la forme de sa sortie**. L'axe
``formes_du_contrat`` est le seul endroit du dépôt qui la regarde.

⚠️ **On note le SOURÇAGE et la FORME, jamais la qualité de la réponse.** Ni
qu'elle réponde à l'exigence posée, ni qu'elle reprenne le vocabulaire du
client, ni qu'elle tienne dans le gabarit imposé. Une réponse parfaitement
sourcée et parfaitement hors sujet marque 100 ici.

==================================  ==========================================
Axe                                 Primitive d'origine
==================================  ==========================================
``source_reellement_fournie``       la règle qui prime (``bellum_rfp.py:151-154``)
``redige_seulement_avec_source``    ``unprovenCommitments`` (rfp.ts:203-207)
``aucun_texte_sous_a_produire``     ``bellum_rfp.py:205`` (`answer` null si to_produce)
``statut_ferme``                    ``bellum_rfp.py:204`` ⊂ ``rfpAnswerStatusSchema``
``manque_attribue``                 ``bellum_rfp.py:153-154`` + ``rfpOwnerRoleSchema``
``formes_du_contrat``               le bloc « JSON attendu » (``bellum_rfp.py:202-210``)
``sans_donnee_inventee``            ``metrics.fabrication_violations``
==================================  ==========================================
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations

from .axes import Axis, RubricResult, eliminatory, measured, unmeasurable
from .reading import comparable, get, input_rfp_sources, present

PROMPT = "bellum_rfp_draft"

_CONTRACT = "packages/contracts/src/schemas/rfp.ts"
_PROMPT_FILE = "app/prompts/bellum_rfp.py"

#: Les DEUX statuts que ce prompt demande (``bellum_rfp.py:204``). Le contrat
#: partagé en porte quatre (``rfpAnswerStatusSchema``, rfp.ts:86) : ``reused`` et
#: ``validated`` sont des états que l'ESPACE pose après coup, jamais le modèle.
#: Noter la sortie sur les quatre laisserait passer un `validated` auto-décerné,
#: qui est précisément ce que ``computeRfpCompliance`` traite comme le feu vert.
STATUSES: tuple[str, ...] = ("drafted", "to_produce")

STATUS_DRAFTED = "drafted"
STATUS_TO_PRODUCE = "to_produce"

#: Recopié de ``rfpOwnerRoleSchema`` (rfp.ts:76) — la divergence est gardée par
#: un test, comme celle de ``rfp_analyse``.
OWNER_ROLES: tuple[str, ...] = ("sales", "expert", "hr", "legal", "security", "finance")


def _sources_blob(sources: list[dict[str, Any]]) -> str:
    """Le catalogue fourni, aplati en une meule de foin comparable.

    On cherche la source CITÉE dedans, dans les deux sens : le modèle recopie
    tantôt le titre d'une source, tantôt la source entière. Chercher la citation
    dans le catalogue attrape le premier cas ; chercher un champ du catalogue
    dans la citation attrape le second.
    """
    return comparable(json.dumps(sources, ensure_ascii=False))


def _source_is_provided(cited: Any, blob: str, sources: list[dict[str, Any]]) -> bool:
    needle = comparable(cited)
    if not needle:
        return False
    if needle in blob:
        return True
    # Le sens inverse : la citation est plus LONGUE que le champ recopié.
    for source in sources:
        for value in source.values():
            token = comparable(value)
            if len(token) >= 12 and token in needle:
                return True
    return False


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    status = str(get(output, "status") or "").strip()
    cited = get(output, "source")
    answer = get(output, "answer")
    sources = input_rfp_sources(user_prompt)

    # ── 1. la source citée existe-t-elle VRAIMENT ? ───────────────────────────
    if sources is None:
        axes.append(unmeasurable(
            "source_reellement_fournie", 4.0,
            reason="le catalogue de sources approuvées est illisible dans le prompt d'entrée — "
                   "sans lui, « citée » et « inventée » ne se distinguent pas ; on ne conclut "
                   "pas que la source est fausse",
            origin=f"{_PROMPT_FILE}:151-154 (la règle qui prime sur toutes les autres)",
        ))
    elif not present(cited):
        axes.append(unmeasurable(
            "source_reellement_fournie", 4.0,
            reason="aucune source citée — il n'y a rien à confronter au catalogue. C'est "
                   "redige_seulement_avec_source qui sanctionne une réponse RÉDIGÉE sans source, "
                   "pas cet axe (qui noterait sinon deux fois la même faute)",
            origin=f"{_PROMPT_FILE}:151-154",
        ))
    else:
        blob = _sources_blob(sources)
        invented = [] if _source_is_provided(cited, blob, sources) else [str(cited)[:200]]
        # ÉLIMINATOIRE : citer une source qu'on ne nous a pas donnée n'est pas
        # « à moitié bien ». C'est la fabrication d'une preuve dans un document
        # qui deviendra contractuel — la faute que le prompt place au-dessus de
        # toutes les autres, et le sens même de la doctrine « JAMAIS de donnée
        # fictive ». Une part la diluerait dans le nombre.
        axes.append(eliminatory(
            "source_reellement_fournie", 4.0, violations=invented,
            origin=f"{_PROMPT_FILE}:151-154 + {_PROMPT_FILE}:171 (« Inventer une certification, "
                   f"une référence, un chiffre »)",
            blind_to="que la source COUVRE l'exigence. On vérifie qu'elle a été fournie, pas "
                     "qu'elle prouve ce qu'on lui fait dire — « une référence “projet mené en 6 "
                     f"mois” n'autorise pas “nous livrons en 6 mois” » ({_PROMPT_FILE}:174-176), "
                     "et rien dans la sortie ne permet de le contredire.",
            detail=("source retrouvée dans le catalogue fourni" if not invented
                    else f"source absente du catalogue ({len(sources)} source(s) fournie(s))"),
            data={"provided": len(sources), "invented": invented},
        ))

    # ── 2. rédiger EXIGE une source (le compte qui bloque l'export) ───────────
    if status != STATUS_DRAFTED:
        axes.append(unmeasurable(
            "redige_seulement_avec_source", 3.0,
            reason=f"la réponse n'est pas « {STATUS_DRAFTED} » — la règle ne porte que sur une "
                   "réponse RÉDIGÉE ; ne pas rédiger faute de source est le comportement VOULU",
            origin=f"{_CONTRACT}:203-207 (unprovenCommitments)",
        ))
    else:
        axes.append(measured(
            "redige_seulement_avec_source", 3.0, ok=1 if present(cited) else 0, total=1,
            origin=f"{_CONTRACT}:203-207,215 (unprovenCommitments — `drafted` sans "
                   f"`answer_source` BLOQUE l'export) + {_PROMPT_FILE}:151-154",
            blind_to="une réponse rédigée dont la source citée ne couvre qu'une PHRASE sur trois. "
                     "Le compte du dépôt est binaire (source, ou pas de source) ; ce barème l'est "
                     "aussi, exprès — inventer une granularité que la production n'a pas ferait "
                     "noter une règle qui n'existe nulle part.",
            detail=f"réponse « {STATUS_DRAFTED} » avec source : "
                   f"{'oui' if present(cited) else 'NON — engagement non prouvé'}",
        ))

    # ── 3. « à produire » veut dire qu'on n'a rien écrit ──────────────────────
    if status != STATUS_TO_PRODUCE:
        axes.append(unmeasurable(
            "aucun_texte_sous_a_produire", 2.0,
            reason=f"la réponse n'est pas « {STATUS_TO_PRODUCE} » — la règle ne s'applique pas",
            origin=f"{_PROMPT_FILE}:205 (« la réponse rédigée, ou null si to_produce »)",
        ))
    else:
        axes.append(measured(
            "aucun_texte_sous_a_produire", 2.0, ok=0 if present(answer) else 1, total=1,
            origin=f"{_PROMPT_FILE}:205 + {_PROMPT_FILE}:153-154 (« tu NE RÉDIGES PAS »)",
            blind_to="rien de plus que la présence d'un texte. Un modèle qui écrit « à compléter » "
                     "dans `answer` échoue cet axe (le vocabulaire d'absence est reconnu par "
                     "`present`), un modèle qui y écrit une phrase creuse aussi — et c'est voulu : "
                     "sous `to_produce`, la seule réponse juste est l'absence de réponse.",
            detail="aucun texte sous `to_produce`" if not present(answer)
                   else "un texte a été rédigé alors que le modèle déclare la source manquante",
        ))

    # ── 4. le statut est-il l'un des DEUX que le prompt demande ? ─────────────
    axes.append(measured(
        "statut_ferme", 1.5, ok=1 if status in STATUSES else 0, total=1,
        origin=f"{_PROMPT_FILE}:204 (« drafted | to_produce ») ⊂ {_CONTRACT}:86 "
               "(rfpAnswerStatusSchema)",
        blind_to="que le statut soit le BON. Un modèle qui rend `to_produce` sur une exigence "
                 "parfaitement couverte passe cet axe — il est prudent, pas fautif, et le barème "
                 "refuse de noter la prudence.",
        detail=f"statut « {status or '(absent)'} »",
        data={"status": status},
    ))

    # ── 5. ce qui manque a un propriétaire ────────────────────────────────────
    if status != STATUS_TO_PRODUCE:
        axes.append(unmeasurable(
            "manque_attribue", 2.0,
            reason=f"la réponse n'est pas « {STATUS_TO_PRODUCE} » — il n'y a pas de manque à "
                   "attribuer",
            origin=f"{_PROMPT_FILE}:153-154 + {_CONTRACT}:76 (rfpOwnerRoleSchema)",
        ))
    else:
        role = str(get(output, "ownerRole", "owner_role") or "").strip()
        attributed = [role in OWNER_ROLES, present(get(output, "missing"))]
        axes.append(measured(
            "manque_attribue", 2.0, ok=sum(1 for c in attributed if c), total=len(attributed),
            origin=f"{_PROMPT_FILE}:153-154 (« avec le rôle qui doit produire l'élément "
                   f"manquant ») + {_CONTRACT}:76 (rfpOwnerRoleSchema)",
            blind_to="que le rôle soit le bon. Un manque de certification attribué à `sales` "
                     "plutôt qu'à `security` passe cet axe : le dépôt ne porte aucune table "
                     "nature→rôle, et la dériver ici l'inventerait.",
            detail=f"rôle « {role or '(absent)'} » dans l'énumération : "
                   f"{'oui' if role in OWNER_ROLES else 'non'} ; manque nommé : "
                   f"{'oui' if present(get(output, 'missing')) else 'non'}",
        ))

    # ── 6. la forme, que RIEN ne valide en production ─────────────────────────
    role_raw = get(output, "ownerRole", "owner_role")
    shapes = [
        # `contradictions` est un TABLEAU — une chaîne y passerait pour une seule
        # incohérence géante côté écran.
        get(output, "contradictions") is None or isinstance(get(output, "contradictions"), list),
        # `answer` est un TEXTE ou `null` — jamais un objet.
        answer is None or isinstance(answer, str),
        # `ownerRole` est null ou l'un des six rôles — jamais un nom de personne.
        role_raw is None or str(role_raw).strip() in OWNER_ROLES or not str(role_raw).strip(),
    ]
    axes.append(measured(
        "formes_du_contrat", 1.5, ok=sum(1 for c in shapes if c), total=len(shapes),
        origin=f"{_PROMPT_FILE}:202-210 (bloc « JSON attendu ») + {_CONTRACT}:76,88-104 "
               f"(rfpRequirementSchema : answer_source / answer_text nullable)",
        blind_to="tout le reste de la forme. Cet axe existe parce que la route part en "
                 "`response_model=dict` (app/routers/rfp.py:137) et que RIEN ne valide sa "
                 "sortie ; il regarde trois champs, pas un schéma.",
        detail=f"{sum(1 for c in shapes if c)}/3 champs de la forme attendue",
    ))

    # ── 7. aucune donnée fabriquée ────────────────────────────────────────────
    axes.append(eliminatory(
        "sans_donnee_inventee", 2.0,
        violations=fabrication_violations([
            answer, cited, get(output, "missing"), get(output, "contradictions"),
        ]),
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations — "
               "porte `passed = not violations`)",
        blind_to="une invention PLAUSIBLE — « nous disposons de la certification ISO 27001 » ne "
                 "contient aucun marqueur de remplissage. C'est source_reellement_fournie qui "
                 "l'attrape, et lui seul.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure le SOURÇAGE et la FORME, jamais la qualité de la réponse : ni "
               "qu'elle réponde à l'exigence POSÉE, ni qu'elle reprenne le vocabulaire du client, "
               "ni qu'elle respecte le gabarit imposé, ni que les contradictions signalées en "
               "soient. Il répond à « cette réponse est-elle prouvable ? », pas à « cette réponse "
               "est-elle bonne ? ».",
    )
