"""Barème de ``bellum_need_play`` — comment attaquer UN besoin.

Même famille que ``bellum_cv``, et le prompt le dit dans les mêmes termes :
« Prompt à risque, comme ``bellum_cv``. On demande de vendre, et la pente
naturelle de la vente est d'affirmer une référence qu'on n'a pas »
(``app/prompts/bellum_need_play.py:9``).

Deux règles vérifiables, écrites dans le prompt, et rejouées par
``need-play-guard.ts`` côté API :

    « Chaque preuve porte une CITATION EXACTE et CONTINUE […] tirée du profil de
      l'ESN ou du dossier du compte fournis ci-dessous. »   (:51)
    « Si le dossier ne nomme personne de pertinent, tu écris le RÔLE à
      identifier […] — jamais un nom inventé. »              (:45)

Les deux matières — la source citable et la liste des personnes connues — ne
vivent que dans le prompt utilisateur ; ``reading.input_need_play_material`` et
``reading.input_need_play_people`` les relisent, et rendent ``None`` (jamais une
liste vide) quand elles n'y arrivent pas.

⚠️ **On note le SOURÇAGE et la STRUCTURE.** Aucun axe ne dit si l'angle est le
bon, si le message est bien tourné, ni si la prochaine action est la bonne — ce
serait une opinion avec un nombre dessus.

===========================  =====================================================
Axe                          Primitive d'origine
===========================  =====================================================
``personnes_reelles``        ``sanitizeNeedPlay`` règle 2 (``need-play-guard.ts``),
                             même doctrine que ``rubrics/organigramme.personnes_reelles``
``preuves_ancrees``          ``sanitizeNeedPlay`` règle 1 + ``buildSourceMaterial``
``preuves_discriminantes``   ``MIN_PROOF_CHARS`` (12) de la même garde
``cibles_situees``           les champs d'une cible (``bellum_need_play.py:61-67``)
``champs_du_contrat``        le bloc FORMAT (``bellum_need_play.py:58-77``)
``sans_donnee_inventee``     ``metrics.fabrication_violations``
===========================  =====================================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations

from .axes import Axis, RubricResult, eliminatory, measured, share, unmeasurable
from .reading import (
    MIN_PROOF_CHARS,
    comparable,
    contact_names,
    get,
    input_need_play_material,
    input_need_play_people,
    mappings,
    norm_name,
    present,
    quote_is_grounded,
)

PROMPT = "bellum_need_play"

#: Les champs que le bloc FORMAT énonce. ``missing`` n'en fait PAS partie : un
#: plan dont tout est prouvable n'a légitimement rien à déclarer manquant.
CONTRACT_FIELDS: tuple[str, ...] = ("angle", "targets", "message", "proofs", "next_action")

_NP_GUARD = "apps/api/src/modules/accounts/need-play-guard.ts"


def _named_targets(targets: list[dict[str, Any]]) -> list[str]:
    return [str(get(t, "name")) for t in targets if present(get(t, "name"))]


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    targets = mappings(get(output, "targets"))
    proofs = mappings(get(output, "proofs"))
    known = input_need_play_people(user_prompt)
    material = input_need_play_material(user_prompt)

    # ── 1. aucune personne inventée ───────────────────────────────────────────
    named = _named_targets(targets)
    if known is None:
        axes.append(unmeasurable(
            "personnes_reelles", 3.0,
            reason="la liste des personnes du dossier est illisible dans le prompt d'entrée — "
                   "« fourni » et « inventé » ne se distinguent pas ; on le DIT plutôt que "
                   "de conclure que tout est inventé",
            origin=f"{_NP_GUARD} (sanitizeNeedPlay, règle 2)",
        ))
    elif not named:
        axes.append(unmeasurable(
            "personnes_reelles", 3.0,
            reason="aucune cible ne NOMME quelqu'un (le prompt autorise explicitement le seul "
                   "rôle) — rien à vérifier, ce qui n'est pas « vérifié à zéro »",
            origin=f"{_NP_GUARD} (sanitizeNeedPlay, règle 2)",
        ))
    else:
        allowed = contact_names(known) | {norm_name(get(p, "nom")) for p in known}
        allowed.discard("")
        invented = sorted({norm_name(n) for n in named} - allowed)
        # ÉLIMINATOIRE — même porte que ``rubrics/organigramme.personnes_reelles`` :
        # un contact fantôme envoie un commercial le chercher sur LinkedIn. En
        # part, un fantôme parmi cinq vraies cibles coûterait 0,6 point sur cent.
        axes.append(eliminatory(
            "personnes_reelles", 3.0, violations=invented,
            origin=f"{_NP_GUARD} (sanitizeNeedPlay : « un nom absent du dossier est un nom "
                   "inventé ») + app/prompts/bellum_need_play.py:45",
            blind_to="qu'une personne FOURNIE soit encore en poste, ou qu'elle soit la bonne sur "
                     "ce besoin — le dossier fait foi ici, pas le registre.",
            detail=(f"{len(named)} cible(s) nommée(s), toutes présentes au dossier"
                    if not invented else
                    f"{len(invented)} personne(s) absente(s) du dossier : " + "; ".join(invented[:3])),
            data={"named": len(named), "known": len(allowed), "invented": invented[:10]},
        ))

    # ── 2 & 3. les preuves — ancrées, puis discriminantes ─────────────────────
    if material is None:
        axes.append(unmeasurable(
            "preuves_ancrees", 3.0,
            reason="la matière source est illisible dans le prompt d'entrée — une citation ne peut "
                   "être confrontée à rien",
            origin=f"{_NP_GUARD} (buildSourceMaterial)",
        ))
    elif not proofs:
        axes.append(unmeasurable(
            "preuves_ancrees", 3.0,
            reason="aucune preuve avancée — ne rien affirmer n'est pas affirmer à faux ; c'est "
                   "champs_du_contrat qui note l'absence",
            origin=f"{_NP_GUARD} (sanitizeNeedPlay, règle 1)",
        ))
    else:
        invented = [
            str(get(p, "claim") or "?")
            for p in proofs
            if present(get(p, "proof")) and not quote_is_grounded(get(p, "proof"), material)
        ]
        axes.append(eliminatory(
            "preuves_ancrees", 3.0, violations=invented,
            origin=f"{_NP_GUARD} (sanitizeNeedPlay : « citation introuvable = preuve inventée ») "
                   "+ app/prompts/bellum_need_play.py:51-54",
            blind_to="une citation EXACTE mais mal EMPLOYÉE : citer une offre déclarée pour "
                     "affirmer une réalisation cite bien le profil. Le prompt l'interdit "
                     "(bellum_need_play.py:53) ; la sortie ne permet pas de le contredire.",
            detail=(f"{len(proofs)} preuve(s), toutes citées de la matière fournie"
                    if not invented else
                    f"{len(invented)}/{len(proofs)} preuve(s) introuvable(s) : "
                    + "; ".join(invented[:3])),
            data={"proofs": len(proofs), "invented": invented[:10]},
        ))
    if proofs:
        ok, total = share(proofs, lambda p: len(comparable(get(p, "proof"))) >= MIN_PROOF_CHARS)
        axes.append(measured(
            "preuves_discriminantes", 1.0, ok=ok, total=total,
            origin=f"{_NP_GUARD} (MIN_PROOF_CHARS = 12 : « Data se retrouve partout »)",
            blind_to="qu'une citation longue soit celle qui FONDE l'affirmation.",
            detail=f"{ok}/{total} citation(s) d'au moins {MIN_PROOF_CHARS} caractères",
        ))
    else:
        axes.append(unmeasurable(
            "preuves_discriminantes", 1.0,
            reason="aucune preuve avancée — il n'y a pas de citation à mesurer",
            origin=f"{_NP_GUARD} (MIN_PROOF_CHARS)",
        ))

    # ── 4. une cible est SITUÉE : un rôle et une raison ───────────────────────
    if targets:
        ok, total = share(targets, lambda t: present(get(t, "role")) and present(get(t, "why")))
        axes.append(measured(
            "cibles_situees", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_need_play.py:61-67 (champs d'une cible) + "
                   f"{_NP_GUARD} (une cible sans rôle NI nom est jetée)",
            blind_to="que le rôle visé soit le BON sur ce besoin — c'est le pari commercial, et il "
                     "ne se vérifie pas sur la sortie.",
            detail=f"{ok}/{total} cible(s) avec un rôle ET une raison",
        ))
    else:
        axes.append(unmeasurable(
            "cibles_situees", 2.0,
            reason="aucune cible produite — c'est champs_du_contrat qui sanctionne l'absence",
            origin="app/prompts/bellum_need_play.py:61-67",
        ))

    # ── 5. les champs que le bloc FORMAT énonce ───────────────────────────────
    ok, total = share(
        CONTRACT_FIELDS,
        lambda f: bool(mappings(get(output, f))) or present(get(output, f)),
    )
    axes.append(measured(
        "champs_du_contrat", 2.0, ok=ok, total=total,
        origin="app/prompts/bellum_need_play.py:58-77 (bloc FORMAT — JSON STRICT)",
        blind_to="``missing`` est volontairement HORS de cet axe : un plan dont tout est prouvable "
                 "n'a rien à déclarer manquant, et le compter absent punirait l'honnêteté que le "
                 "prompt réclame (bellum_need_play.py:56).",
        detail=f"{ok}/{total} champs du contrat ({', '.join(CONTRACT_FIELDS)})",
    ))

    # ── 6. aucune donnée fabriquée ────────────────────────────────────────────
    axes.append(eliminatory(
        "sans_donnee_inventee", 2.0,
        violations=fabrication_violations([
            get(output, "angle"), get(output, "message"), get(output, "next_action"),
            targets, proofs, get(output, "missing"),
        ]),
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations)",
        blind_to="une invention PLAUSIBLE : une référence sectorielle crédible mais absente du "
                 "profil ne porte aucun marqueur. C'est preuves_ancrees qui l'attrape.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure le SOURÇAGE et la FORME, jamais la valeur commerciale du plan : "
               "ni la justesse de l'angle, ni la tenue du premier message, ni le fait que la "
               "prochaine action soit la bonne. Il répond à « ce plan ne promet-il que ce qu'il "
               "peut montrer ? », pas à « ce plan va-t-il gagner le compte ? ».",
    )
