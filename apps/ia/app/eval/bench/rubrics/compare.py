"""Barème de ``bellum_compare`` — la priorisation d'un portefeuille de comptes.

⚠️ Ne pas confondre avec ``app/eval/bench/compare.py``, qui compare des BRAS du
banc. Ici, c'est le prompt qui compare des COMPTES.

Ce prompt porte la seule règle **arithmétique** de tout le catalogue :

    « RÈGLE : Recommande un % d'allocation de temps par compte. Le total doit
      faire 100%. »                       (``app/prompts/bellum_compare.py:35``)

Une règle qui se vérifie avec une addition est exactement ce qu'un barème
déterministe doit noter — et c'est aussi, en pratique, ce qu'un modèle rate le
plus souvent quand on le change. Le reste des axes compte des champs, une
énumération fermée de verdicts, et le fait que les comptes nommés soient bien
ceux qu'on a donnés.

⚠️ **Rien ici ne note l'ARBITRAGE.** Que Doctolib passe devant Alan est un pari
commercial ; ce barème vérifie que la priorisation est EXPLOITABLE, pas qu'elle
est juste. Et il ne touche pas à ``adjusted_score``, qui n'est ni recalculé ni
comparé à quoi que ce soit — le dépôt n'affiche aucune probabilité et n'en note
aucune.

===========================  =====================================================
Axe                          Primitive d'origine
===========================  =====================================================
``comptes_fournis``          la ligne « COMPTES À COMPARER » (:50) — matière fournie
``tous_les_comptes_traites`` idem : un compte donné et jamais comparé est perdu
``allocation_a_cent``        la RÈGLE du prompt (:35)
``verdicts_dans_lenumeration`` l'énumération du schéma (:66)
``fiches_completes``         les champs d'une ligne de comparaison (:59-66)
``champs_du_contrat``        les clés du bloc SORTIE JSON (:57-77)
``sans_donnee_inventee``     ``metrics.fabrication_violations``
===========================  =====================================================
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations

from .axes import Axis, RubricResult, axis_value, eliminatory, measured, share, unmeasurable
from .reading import as_list, get, input_compared_companies, mappings, norm_name, present

PROMPT = "bellum_compare"

#: Les verdicts que le schéma ÉNONCE, mot pour mot (``bellum_compare.py:66``).
RECOMMENDATIONS: frozenset[str] = frozenset({"GO", "NO-GO", "PRUDENT", "GO RAPIDE"})

#: Les champs d'une ligne de comparaison (``bellum_compare.py:59-66``).
ROW_FIELDS: tuple[str, ...] = (
    "adjusted_score", "strengths", "risks", "estimated_cycle", "key_contact", "recommendation",
)

#: Les clés du bloc SORTIE JSON (``bellum_compare.py:57-77``).
CONTRACT_FIELDS: tuple[str, ...] = (
    "comparison", "priority_order", "reasoning", "weekly_time_allocation", "quick_win",
)

#: La tolérance de l'addition. Un point d'écart est un arrondi ; au-delà, c'est
#: la règle qui n'est pas tenue.
ALLOCATION_TOLERANCE = 1.0

_PERCENT_RE = re.compile(r"-?\d+(?:[.,]\d+)?")


def _percent(value: Any) -> float | None:
    """« 40% », « 40 % », 40, « 0.4 » → un nombre, ou ``None`` si illisible.

    Aucune conversion devinée : « 0.4 » vaut 0,4 point, pas 40 %. Le schéma du
    prompt écrit des pourcentages ("40%"), et interpréter autrement une valeur
    ambiguë reviendrait à réparer la sortie avant de la noter.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = _PERCENT_RE.search(str(value or ""))
    return float(match.group(0).replace(",", ".")) if match else None


def _cited_companies(output: Mapping[str, Any], rows: list[dict[str, Any]]) -> list[str]:
    """Tous les noms de compte que la sortie prononce, où qu'ils soient."""
    names = [str(get(r, "company")) for r in rows if present(get(r, "company"))]
    names += [str(p) for p in as_list(get(output, "priority_order")) if present(p)]
    allocation = get(output, "weekly_time_allocation")
    if isinstance(allocation, Mapping):
        names += [str(k) for k in allocation if present(k)]
    return names


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    rows = mappings(get(output, "comparison"))
    given = input_compared_companies(user_prompt)

    # ── 1 & 2. les comptes nommés sont-ils ceux qu'on a donnés ? ──────────────
    cited = _cited_companies(output, rows)
    if given is None:
        for name, weight in (("comptes_fournis", 3.0), ("tous_les_comptes_traites", 2.0)):
            axes.append(unmeasurable(
                name, weight,
                reason="la ligne « COMPTES À COMPARER » est illisible dans le prompt d'entrée — "
                       "on ne sait pas quels comptes ont été fournis, donc on n'accuse personne",
                origin="app/prompts/bellum_compare.py:50",
            ))
    else:
        allowed = {norm_name(c) for c in given}
        if not cited:
            axes.append(unmeasurable(
                "comptes_fournis", 3.0,
                reason="la sortie ne nomme aucun compte — rien à vérifier, ce qui n'est pas "
                       "« vérifié à zéro » ; l'absence se lit sur champs_du_contrat",
                origin="app/prompts/bellum_compare.py:50",
            ))
        else:
            invented = sorted({norm_name(c) for c in cited} - allowed)
            # ÉLIMINATOIRE : un compte que personne n'a fourni envoie un
            # commercial travailler un dossier qui n'existe pas dans son
            # portefeuille. En part, un intrus parmi cinq vrais serait « 0,8 ».
            axes.append(eliminatory(
                "comptes_fournis", 3.0, violations=invented,
                origin="app/prompts/bellum_compare.py:43,50 (les comptes FOURNIS au modèle)",
                blind_to="un compte fourni et RENOMMÉ à la marge (« Doctolib SAS ») sortira comme "
                         "inventé ; et la ligne du prompt joint les noms par « , », donc une "
                         "raison sociale contenant une virgule serait coupée en deux.",
                detail=(f"{len(set(cited))} compte(s) nommé(s), tous fournis"
                        if not invented else
                        f"{len(invented)} compte(s) que personne n'a fourni(s) : "
                        + "; ".join(invented[:3])),
                data={"given": len(allowed), "cited": len(set(cited)), "invented": invented[:10]},
            ))
        compared = {norm_name(get(r, "company")) for r in rows}
        ok, total = share(sorted(allowed), lambda c: c in compared)
        axes.append(measured(
            "tous_les_comptes_traites", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_compare.py:43,48 (« Compare ces N comptes »)",
            blind_to="qu'un compte comparé le soit BIEN — on vérifie qu'il a une ligne, pas ce "
                     "qu'elle dit.",
            detail=f"{ok}/{total} compte(s) fourni(s) réellement comparé(s)",
        ))

    # ── 3. la seule règle ARITHMÉTIQUE du catalogue ───────────────────────────
    allocation = get(output, "weekly_time_allocation")
    shares = (
        [_percent(v) for v in allocation.values()] if isinstance(allocation, Mapping) else []
    )
    usable = [s for s in shares if s is not None]
    if not usable:
        axes.append(unmeasurable(
            "allocation_a_cent", 3.0,
            reason="aucune allocation lisible en pourcentage — l'addition n'a pas de termes ; "
                   "l'absence du bloc se lit sur champs_du_contrat",
            origin="app/prompts/bellum_compare.py:35 (RÈGLE : « Le total doit faire 100% »)",
        ))
    else:
        total_pct = sum(usable)
        gap = abs(total_pct - 100.0)
        # Une règle chiffrée se note sur son ÉCART, pas en tout ou rien : 99 % et
        # 5 % ne sont pas la même faute.
        #
        # ⚠️ Sur QUELLE échelle ? Rapporter l'écart à 100 serait un chiffre choisi
        # au hasard, et bien trop plat : une semaine amputée de quinze points
        # marquerait 0,85, c'est-à-dire « presque juste ». L'échelle vient de la
        # matière — la PART MOYENNE d'un compte, 100/N. Un écart d'une part
        # moyenne, c'est le temps d'un compte entier qui n'est alloué à personne :
        # à ce moment-là, la priorisation ne dit plus quoi faire de sa semaine, et
        # l'axe vaut zéro. Aucune constante inventée.
        #
        # ⚠️ N est le nombre de comptes FOURNIS, pas le nombre de lignes que le
        # modèle a écrites. Prendre les lignes écrites inverserait l'incitation :
        # un modèle qui OUBLIE un compte réduirait le dénominateur, agrandirait la
        # part moyenne, et serait donc puni MOINS fort pour une faute plus grave.
        # Sans entrée lisible, on retombe sur les lignes écrites, faute de mieux.
        mean_share = 100.0 / len(given or usable)
        ratio = 1.0 if gap <= ALLOCATION_TOLERANCE else max(0.0, 1.0 - gap / mean_share)
        axes.append(axis_value(
            "allocation_a_cent", 3.0, ratio=ratio,
            origin="app/prompts/bellum_compare.py:35 (RÈGLE : « Le total doit faire 100% ») + "
                   "app/prompts/bellum_compare.py:71-75 (le schéma : une part PAR compte)",
            blind_to="que la RÉPARTITION soit la bonne : 100 % sur un seul compte fait 100 aussi. "
                     "Et une valeur illisible est ignorée, pas comptée zéro — l'addition porte "
                     "alors sur moins de termes, sans que l'échelle bouge.",
            detail=f"somme = {total_pct:g} % sur {len(usable)}/{len(shares)} valeur(s) lisible(s) "
                   f"(écart {gap:g} pt pour une part moyenne de {mean_share:g} pt)",
            data={"sum_percent": round(total_pct, 2), "gap_percent": round(gap, 2),
                  "mean_share_percent": round(mean_share, 2),
                  "unreadable": len(shares) - len(usable)},
        ))

    # ── 4 & 5. verdicts et fiches ─────────────────────────────────────────────
    if rows:
        ok, total = share(
            rows, lambda r: str(get(r, "recommendation") or "").strip().upper() in RECOMMENDATIONS
        )
        axes.append(measured(
            "verdicts_dans_lenumeration", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_compare.py:66 (GO | NO-GO | PRUDENT | GO RAPIDE)",
            blind_to="que le verdict soit le BON. C'est l'arbitrage commercial, et le dépôt refuse "
                     "de le noter — un score de fit présenté comme une chance est interdit.",
            detail=f"{ok}/{total} verdict(s) dans l'énumération du schéma",
        ))
        filled, n = share(rows, lambda r: all(present(get(r, f)) or bool(as_list(get(r, f)))
                                              for f in ROW_FIELDS))
        axes.append(measured(
            "fiches_completes", 2.0, ok=filled, total=n,
            origin="app/prompts/bellum_compare.py:59-66 (champs d'une ligne de comparaison)",
            blind_to="la valeur de ``adjusted_score`` : il n'est ni recalculé ni comparé ici. Le "
                     "dépôt n'affiche aucune probabilité, et il n'en note aucune.",
            detail=f"{filled}/{n} fiche(s) complète(s) ({', '.join(ROW_FIELDS)})",
        ))
    else:
        for name, weight, origin in (
            ("verdicts_dans_lenumeration", 2.0, "app/prompts/bellum_compare.py:66"),
            ("fiches_completes", 2.0, "app/prompts/bellum_compare.py:59-66"),
        ):
            axes.append(unmeasurable(
                name, weight,
                reason="aucune ligne de comparaison — c'est champs_du_contrat qui sanctionne "
                       "l'absence, pas cet axe",
                origin=origin,
            ))

    # ── 6. les clés du bloc SORTIE JSON ───────────────────────────────────────
    ok, total = share(CONTRACT_FIELDS, lambda f: bool(get(output, f)))
    axes.append(measured(
        "champs_du_contrat", 2.0, ok=ok, total=total,
        origin="app/prompts/bellum_compare.py:57-77 (bloc SORTIE JSON)",
        blind_to="la LONGUEUR demandée du raisonnement (« 3-5 lignes ») — on compte une clé "
                 "présente, pas un texte tenu.",
        detail=f"{ok}/{total} clés du contrat présentes",
    ))

    # ── 7. aucune donnée fabriquée ────────────────────────────────────────────
    axes.append(eliminatory(
        "sans_donnee_inventee", 2.0,
        violations=fabrication_violations([
            rows, get(output, "reasoning"), get(output, "quick_win"),
            get(output, "priority_order"),
        ]),
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations)",
        blind_to="un contact clé plausible mais absent du dossier : c'est comptes_fournis qui "
                 "garde les NOMS DE COMPTE, personne ne garde ici les noms de personnes.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure une priorisation EXPLOITABLE — les comptes sont ceux qu'on a "
               "donnés, l'allocation fait 100 %, les verdicts sont dans l'énumération. Il ne dit "
               "rien de la JUSTESSE de l'ordre ni de ``adjusted_score`` : le dépôt refuse de noter "
               "un pari commercial comme s'il était une mesure.",
    )
