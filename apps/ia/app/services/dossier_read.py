"""#2118 — la lecture du dossier : les sept axes, et ce qu'on accepte d'écrire.

Miroir Python du contrat `packages/contracts/src/schemas/analysis/dossier-read.ts`
(le service IA n'a pas le paquet `contracts` à l'exécution ; la parité est
gardée par `tests/test_dossier_read_contract.py`).

⚠️ Ce module existe pour une raison précise : le contrat TypeScript REFUSE un
bloc incohérent — une note posée sur un axe « inconnu », un axe hors liste, un
no-go déclaré définitif. Et côté lecture, un `dossier_read` refusé retombe à
`null` (`.catch(null)` dans `plan.ts`) : le bloc entier disparaîtrait de
l'écran parce que le modèle a écrit un zéro de trop. On normalise donc ICI, à
la sortie du modèle, plutôt que de faire payer à l'utilisateur la rigueur du
contrat.

La normalisation ne complète JAMAIS ce qui manque : elle retire ce qui ment.
Une note sur un axe non évalué est enlevée, elle n'est pas remplacée par une
estimation ; un axe qu'on ne sait pas nommer est écarté, pas renommé au plus
proche.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

# Les SEPT axes, dans l'ordre du contrat. Toute divergence avec le TypeScript
# fait rougir `test_dossier_read_contract.py`.
DOSSIER_SCORE_AXES: tuple[str, ...] = (
    "adequation_offre",
    "potentiel_commercial",
    "fraicheur",
    "accessibilite",
    "capacite_achat_externe",
    "concurrence",
    "qualite_preuves",
)

DOSSIER_AXIS_STATES: tuple[str, ...] = ("measured", "partial", "unknown")

# Chaque axe est noté sur 5. Le dénominateur, lui, se CALCULE : il ne vaut 35
# que si les sept axes ont été notés (doctrine « non mesuré n'est jamais 0 »).
DOSSIER_AXIS_MAX = 5

# Sous le plancher, il n'y a pas de score (doctrine c26).
# #4016.L9.a — ⚠️ RENVERSEMENT DATÉ du 13/10/2026 (Louis) : le plancher passe de
# trois à DEUX axes notés. Miroir de `ACCOUNT_SCORE_MIN_EVALUATED_AXES`
# (`account-score.ts`), parité vérifiée par `test_dossier_read_contract.py`.
DOSSIER_SCORE_MIN_MEASURED_AXES = 2

_UNKNOWN = "unknown"


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_dossier_axis(raw: Mapping[str, Any]) -> dict[str, Any] | None:
    """Un axe rendu par le modèle, ramené à ce que le contrat accepte.

    Rend ``None`` quand la clé n'est pas l'un des sept axes : un axe inventé ne
    se rattrape pas, et l'écran nomme de toute façon les sept — un axe absent
    y apparaît « inconnu », donc rien n'est perdu à l'écarter ici."""
    key = str(raw.get("key") or raw.get("axis") or "").strip()
    if key not in DOSSIER_SCORE_AXES:
        return None
    state = str(raw.get("state") or "").strip()
    value = raw.get("value")
    if not _is_number(value):
        value = raw.get("points")
    if state not in DOSSIER_AXIS_STATES:
        state = _UNKNOWN
    # Les deux règles du contrat, dans les deux sens : pas de note sur un axe
    # inconnu, pas d'axe noté sans note.
    if state == _UNKNOWN:
        value = None
    elif not _is_number(value):
        state, value = _UNKNOWN, None
    else:
        value = max(0, min(DOSSIER_AXIS_MAX, int(round(float(value)))))
    return {
        "key": key,
        "state": state,
        "value": value,
        "impact": _text(raw.get("impact")),
        "lever": _text(raw.get("lever")),
    }


def _normalize_axes(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, Mapping):
            continue
        axis = normalize_dossier_axis(item)
        if axis is None or axis["key"] in seen:
            continue
        seen.add(axis["key"])
        out.append(axis)
    return out


def _normalize_dimension(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping):
        return None
    state = str(raw.get("state") or "").strip()
    value = raw.get("value")
    if state not in DOSSIER_AXIS_STATES:
        state = _UNKNOWN
    value = None if state == _UNKNOWN or not _is_number(value) else max(0, min(100, int(round(float(value)))))
    # Une dimension « non mesurée » se GARDE : c'est l'information (« fraîcheur
    # non mesurée »), pas son absence. La retirer ferait disparaître la ligne,
    # et une ligne disparue se lit comme une ligne à zéro.
    if not any(key in raw for key in ("state", "value", "note")):
        return None
    return {"state": state, "value": value, "note": _text(raw.get("note"))}


def _normalize_reliability(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping):
        return None
    out = {name: _normalize_dimension(raw.get(name)) for name in ("quality", "coverage", "freshness")}
    return out if any(out.values()) else None


def _normalize_pair(raw: Any, first: str, second: str) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping):
        return None
    pair = {first: _text(raw.get(first)), second: _text(raw.get(second))}
    return pair if any(pair.values()) else None


def _normalize_list_of_pairs(raw: Any, first: str, second: str) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if isinstance(item, str):
            label = _text(item)
            if label:
                out.append({first: label, second: None})
            continue
        pair = _normalize_pair(item, first, second)
        if pair:
            out.append(pair)
    return out


def _normalize_no_go(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping):
        return None
    context = _text(raw.get("context"))
    trigger = _text(raw.get("trigger"))
    if not context and not trigger:
        return None
    # `temporary` n'est PAS une sortie du modèle : c'est une règle produit —
    # on n'enterre pas un compte, un fait périmé redevient inconnu. Le contrat
    # TS l'écrit en `literal(true)` ; ici on le POSE, quoi qu'ait répondu le
    # modèle, exactement comme le verdict GO/PRUDENT/STOP est une règle et non
    # son humeur.
    return {"temporary": True, "context": context, "trigger": trigger}


_NO_COMPETITOR_CLAIM = re.compile(
    r"\b(?:aucun|pas de|sans)\s+(?:autre\s+)?(?:concurrent|prestataire|incumbent|titulaire|esn)|terrain (?:ouvert|vierge)",
    re.IGNORECASE,
)


def reconcile_competition_axis(block: dict[str, Any], competitor_names: Sequence[object]) -> None:
    """#4323.2 — UNE source pour les concurrents d'un compte : ceux que l'analyse a IDENTIFIÉS.

    Quand il y en a, l'axe « concurrence » qui affirme l'absence de concurrent (« Aucun concurrent titulaire »,
    « terrain ouvert ») est réécrit d'après eux, comme le bloc Positionnement : jamais deux phrases contraires sur
    le même compte. La note, elle, reste le jugement du modèle. Sans concurrent identifié, rien n'est touché."""
    names: list[str] = []
    for raw in competitor_names:
        name = " ".join(str(raw or "").split())
        if name and name.casefold() not in {n.casefold() for n in names}:
            names.append(name)
    if not names:
        return
    for axis in block.get("axes") or []:
        if not isinstance(axis, dict) or axis.get("key") != "concurrence":
            continue
        claimed = f"{axis.get('impact') or ''} {axis.get('lever') or ''}"
        if not _NO_COMPETITOR_CLAIM.search(claimed):
            continue
        noun = "concurrent identifié" if len(names) == 1 else "concurrents identifiés"
        axis["impact"] = f"{len(names)} {noun} : {', '.join(names)}"
        axis["lever"] = None


def normalize_dossier_read(raw: Any) -> dict[str, Any] | None:
    """Le bloc entier, ramené à ce que le contrat accepte.

    Rend ``None`` quand il ne reste rien d'utile : un bloc vide affiché comme
    une lecture serait pire que pas de bloc du tout — l'écran retombe alors sur
    la lecture d'avant (`bellum_read` / `justification`), qui est honnête."""
    if not isinstance(raw, Mapping):
        return None
    axes = _normalize_axes(raw.get("axes"))
    entry = raw.get("best_entry_point")
    best_entry_point = None
    if isinstance(entry, Mapping):
        fields = {name: _text(entry.get(name)) for name in ("label", "target_profile", "why")}
        best_entry_point = fields if any(fields.values()) else None
    next_action = raw.get("next_action")
    action = None
    if isinstance(next_action, Mapping):
        fields = {name: _text(next_action.get(name)) for name in ("label", "route", "tab")}
        action = fields if fields["label"] else None
    profile_incomplete = raw.get("profile_incomplete")
    out: dict[str, Any] = {
        "axes": axes,
        "why_for_your_esn": _text(raw.get("why_for_your_esn")),
        "recommended_scope": _text(raw.get("recommended_scope")),
        "best_entry_point": best_entry_point,
        # #2304.7 (épopée #2932) — Q6, distincte de best_entry_point (QUI) :
        # PAR OÙ entrer commercialement.
        "access_path": _text(raw.get("access_path")),
        "obstacles": _normalize_list_of_pairs(raw.get("obstacles"), "label", "why"),
        "anti_advice": _normalize_pair(raw.get("anti_advice"), "what", "why"),
        "next_action": action,
        "reliability": _normalize_reliability(raw.get("reliability")),
        "no_go": _normalize_no_go(raw.get("no_go")),
        "profile_incomplete": bool(profile_incomplete) if isinstance(profile_incomplete, bool) else None,
        "profile_incomplete_fields": [
            text for text in (_text(item) for item in raw.get("profile_incomplete_fields") or []) if text
        ],
        "missing": _normalize_list_of_pairs(raw.get("missing"), "label", "why"),
    }
    if not any(value for value in out.values() if value not in (None, [], False)):
        return None
    return out


# #2306.22 — poids ÉGAL, assumé en doctrine (`account_score.py`, "Equal
# weight"). Rendu EXPLICITE sur le bloc plutôt qu'assumé silencieusement : si
# des poids variables sont un jour introduits, le champ existe déjà et les
# scores déjà écrits restent lisibles avec le poids qui les a vraiment
# produits (add-only — `computeDossierScore` n'est pas touché).
DOSSIER_AXIS_WEIGHT = 1

# #2306.23 — la version de la RÈGLE de score (somme égale sur les axes notés,
# `computeDossierScore`/`dossier_score` ci-dessous) qui a produit ce bloc.
DOSSIER_SCORE_ALGORITHM_VERSION = "1.0"


def scoring_objectives(profile: Mapping[str, Any] | None) -> list[str]:
    """#2306.16 — les objectifs commerciaux NOMMÉS (`esn_objectives`, #2052)
    actifs au moment où CE compte a été scoré, conservés sur le bloc.

    PAS l'objectif de phase du plan (`recommended_scope`) : l'ambition
    déclarée de l'ESN elle-même (rendez-vous, nouveaux comptes,
    structuration…), qui a pu peser sur la lecture de ce compte. Une liste
    vide veut dire « aucun objectif déclaré à ce moment-là », jamais une
    invention — même règle de silence que `esnAnswersToProfileData` côté API."""
    profile = profile or {}
    raw = profile.get("objectives")
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        if not isinstance(item, Mapping):
            continue
        kind = item.get("kind")
        if isinstance(kind, str) and kind.strip() and kind.strip() not in out:
            out.append(kind.strip())
    return out


# #2118.20 — les champs du profil ESN dont dépend le FIT avec l'offre. Le
# dossier reste fiable sans eux (on sait lire un compte) ; c'est l'adéquation
# qui devient limitée, et c'est CETTE nuance que l'écran doit dire.
PROFILE_FIT_FIELDS: tuple[str, ...] = ("offers", "sectors", "positioning", "references")


def profile_incompleteness(profile: Mapping[str, Any] | None) -> list[str]:
    """Les champs de fit qui manquent au profil ESN, nommés.

    C'est un FAIT qu'on connaît — pas un avis du modèle : le demander au prompt
    reviendrait à laisser une mesure vérifiable à l'humeur d'un générateur."""
    profile = profile or {}
    missing: list[str] = []
    for field in PROFILE_FIT_FIELDS:
        value = profile.get(field)
        if isinstance(value, str):
            if not value.strip():
                missing.append(field)
            continue
        if isinstance(value, (list, tuple, set)):
            if not [item for item in value if str(item).strip()]:
                missing.append(field)
            continue
        if value is None:
            missing.append(field)
    return missing


def dossier_score(axes: list[Mapping[str, Any]] | None) -> dict[str, Any]:
    """Le score décomposé — la MÊME règle que `computeDossierScore` côté TS.

    Un axe non noté sort du dénominateur : il n'ajoute ni au numérateur ni au
    total possible, donc il ne peut pas faire baisser le score. Sous deux axes
    notés il n'y a pas de score du tout (#4016.L9.a, Louis 13/10/2026)."""
    rows = [axis for axis in (axes or []) if isinstance(axis, Mapping)]
    scored = [axis for axis in rows if axis.get("state") != _UNKNOWN and _is_number(axis.get("value"))]
    unknown = [key for key in DOSSIER_SCORE_AXES if not any(axis.get("key") == key for axis in scored)]
    if len(scored) < DOSSIER_SCORE_MIN_MEASURED_AXES:
        return {"kind": "insufficient", "scored_axes": len(scored), "unknown_axes": unknown}
    value = sum(int(axis.get("value") or 0) for axis in scored)
    out_of = len(scored) * DOSSIER_AXIS_MAX
    return {
        "kind": "score",
        "value": value,
        "out_of": out_of,
        "scored_axes": len(scored),
        "unknown_axes": unknown,
    }


def access_path_block(access_path: str | None) -> str:
    """#2947/#2204.10 — LA VOIE D'ACCÈS PROBABLE, NOMMÉE AU RÉDACTEUR.

    ``evaluation.dossier_read.access_path`` (Q6 du dossier, #2304.7 — « la voie
    d'achat/accès plausible ») est calculée à l'analyse mais pas toujours
    transmise en entrée NOMMÉE au générateur. Déplacée ici (depuis
    ``app.prompts.bellum_outreach``, qui la réexporte pour ses appelants
    existants) pour que ``app.prompts.bellum_messages`` (#2947/#2204.10 côté
    LOT) puisse la lire sans import circulaire (``bellum_outreach`` importe
    déjà de ``bellum_messages``) — GA-26, une seule fonction, deux lecteurs.

    Absent ou vide ⇒ "" ⇒ prompt inchangé, comme les autres blocs optionnels
    de ces deux fichiers."""
    text = (access_path or "").strip()
    if not text:
        return ""
    return f"\nVOIE D'ACCÈS PROBABLE (Q6 du dossier) :\n{text}\n"
