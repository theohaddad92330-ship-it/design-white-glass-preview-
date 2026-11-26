"""Un axe, un dénominateur, et l'absence NOMMÉE.

Trois lois du dépôt, rendues exécutables ici — pas commentées ailleurs.

1. **Un score n'est jamais nu.** Un barème rend ses AXES ; le total n'est qu'une
   agrégation de ce qu'ils ont mesuré. :class:`RubricResult` porte les deux.

2. **« Non mesuré » n'est jamais « 0 », et il SORT du dénominateur.** Un axe
   qu'on n'a pas pu évaluer porte ``ratio=None`` et une ``reason`` écrite ; la
   moyenne pondérée ne le compte ni au numérateur ni au dénominateur. Sans cette
   règle, le barème mesurerait la complétude de nos données au lieu de mesurer le
   modèle — c'est le défaut que la doctrine appelle « non mesuré n'est pas mesuré
   à zéro ».

3. **Sous trois axes, il n'y a pas de score.** Deux axes ne font pas une note :
   ils font deux mesures, et on les rend telles quelles. Le total vaut alors
   ``None`` avec sa raison — jamais une moyenne de deux choses.

Le total est ramené sur **/100** pour se lire comme la grille
``app/eval/strategy/rubric.py``, la seule qui existait avant ce module.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

#: Sous ce nombre d'axes MESURÉS, on ne publie pas d'agrégat (doctrine : « un
#: score n'est jamais nu ; sous 3 axes, il n'y a pas de score »). La même valeur
#: qu'exige ``ScoreWithAxes`` côté produit.
MIN_MEASURED_AXES = 3

#: L'échelle de l'agrégat, alignée sur ``app/eval/strategy/rubric.py``.
MAX_SCORE = 100.0


@dataclass(frozen=True)
class Axis:
    """Un axe : ce qu'il vaut (0..1), ce qu'il pèse, et d'où il descend.

    ``ratio is None`` ⇒ **non mesuré**. Alors ``reason`` DIT pourquoi, et le poids
    ne compte dans aucun dénominateur.
    """

    name: str
    weight: float
    ratio: float | None
    #: D'où vient l'axe — ``fichier:ligne`` de la primitive du dépôt qu'il
    #: réutilise. Un axe sans ascendance est un axe inventé : le test
    #: ``test_bench_rubrics`` refuse un ``origin`` vide.
    origin: str
    #: Ce que l'axe ne sait PAS voir. La colonne la plus utile dans six mois.
    blind_to: str = ""
    #: Pourquoi il n'a pas pu être mesuré (obligatoire quand ``ratio is None``).
    reason: str = ""
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.ratio is None and not self.reason:
            raise ValueError(f"axe {self.name!r} non mesuré sans raison écrite — « non mesuré » se NOMME")
        if self.ratio is not None and not 0.0 <= self.ratio <= 1.0:
            raise ValueError(f"axe {self.name!r} : ratio hors [0,1] ({self.ratio})")
        if not self.origin:
            raise ValueError(f"axe {self.name!r} sans ascendance — un axe sans primitive d'origine est inventé")

    @property
    def measured(self) -> bool:
        return self.ratio is not None

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


def measured(
    name: str,
    weight: float,
    *,
    ok: float,
    total: float,
    origin: str,
    blind_to: str = "",
    detail: str = "",
    data: dict[str, Any] | None = None,
) -> Axis:
    """Un axe mesuré comme une PART — ``ok`` sur ``total``.

    ``total == 0`` n'est pas une part de zéro : c'est une absence de matière.
    L'appelant qui veut la noter quand même passe ``ratio`` par
    :func:`axis_value` ; ici on refuse, bruyamment, plutôt que d'écrire 0.
    """
    if total <= 0:
        raise ValueError(
            f"axe {name!r} : dénominateur nul — utiliser unmeasurable() et NOMMER l'absence, jamais écrire 0"
        )
    return Axis(
        name=name, weight=weight, ratio=round(min(ok, total) / total, 4), origin=origin,
        blind_to=blind_to, detail=detail or f"{ok:g}/{total:g}", data=data or {},
    )


def axis_value(
    name: str,
    weight: float,
    *,
    ratio: float,
    origin: str,
    blind_to: str = "",
    detail: str = "",
    data: dict[str, Any] | None = None,
) -> Axis:
    """Un axe mesuré par une valeur 0..1 déjà calculée par une primitive
    (``metrics.contacts_quality().score``, un poids de fraîcheur…)."""
    return Axis(
        name=name, weight=weight, ratio=round(float(ratio), 4), origin=origin,
        blind_to=blind_to, detail=detail, data=data or {},
    )


def eliminatory(
    name: str,
    weight: float,
    *,
    violations: Sequence[Any],
    origin: str,
    blind_to: str = "",
    detail: str = "",
    data: dict[str, Any] | None = None,
) -> Axis:
    """Un axe **ÉLIMINATOIRE** : zéro violation, ou zéro point. Jamais une part.

    Réservé aux violations de DOCTRINE — une personne fabriquée, un SIREN qui
    échoue à Luhn, un e-mail RFC-2606, un marqueur de remplissage. La raison
    tient en une phrase : *une part dilue la faute dans le nombre*. Un fantôme
    parmi sept noms notés en part vaut 0,857, soit trois points sur cent — et le
    banc dirait alors qu'un modèle qui FABRIQUE UN CONTACT est « presque aussi
    bon » qu'un modèle honnête. C'est exactement l'inverse de ce que le produit
    tranche.

    Ce n'est pas une invention non plus : c'est la porte DURE des métriques
    expédiées. ``metrics.no_invented_data`` gradue son ``score`` mais son
    ``passed`` vaut ``not violations`` (``app/eval/metrics.py:548``), et
    ``judge._check_coherence`` classe un contact absent du dossier ``critical``,
    c'est-à-dire binaire (``app/graph/judge.py:195-202``). On note la PORTE, pas
    la pente.

    ⚠️ À ne PAS étendre à ce qui est de l'incomplétude : un signal non daté, une
    relation que l'assembleur jette, un contact non traité ne fabriquent rien —
    ils manquent. Ceux-là restent des parts, et le KPI expédié le dit lui-même
    (``KPI_MAX_NON_SOURCED_RATIO`` tolère 5 % de faits non sourcés : un seuil sur
    un RATIO, donc pas une porte).
    """
    bad = list(violations)
    return Axis(
        name=name, weight=weight, ratio=0.0 if bad else 1.0, origin=origin, blind_to=blind_to,
        detail=detail or ("aucune violation" if not bad else f"{len(bad)} violation(s) : "
                          + "; ".join(str(v) for v in bad[:6])),
        data={**(data or {}), "violations": [str(v) for v in bad[:10]], "eliminatory": True},
    )


def unmeasurable(
    name: str,
    weight: float,
    *,
    reason: str,
    origin: str,
    blind_to: str = "",
    data: dict[str, Any] | None = None,
) -> Axis:
    """Un axe qu'on ne peut PAS noter ici — et qui le dit."""
    return Axis(
        name=name, weight=weight, ratio=None, origin=origin, blind_to=blind_to,
        reason=reason, data=data or {},
    )


@dataclass(frozen=True)
class RubricResult:
    """Le verdict d'un barème : ses axes, et l'agrégat SI les axes le permettent."""

    prompt: str
    axes: list[Axis]
    #: Ce que le barème ne prétend pas mesurer — écrit une fois, pas par axe.
    caveat: str = ""

    @property
    def measured_axes(self) -> list[Axis]:
        return [a for a in self.axes if a.measured]

    @property
    def unmeasured_axes(self) -> list[Axis]:
        return [a for a in self.axes if not a.measured]

    @property
    def total(self) -> float | None:
        """/100 sur les seuls axes MESURÉS — ``None`` sous trois axes."""
        kept = self.measured_axes
        if len(kept) < MIN_MEASURED_AXES:
            return None
        denominator = sum(a.weight for a in kept)
        if denominator <= 0:  # pragma: no cover - un poids nul est refusé en amont
            return None
        return round(MAX_SCORE * sum(a.weight * (a.ratio or 0.0) for a in kept) / denominator, 2)

    @property
    def reason(self) -> str:
        """Pourquoi il n'y a pas de total — vide quand il y en a un."""
        kept = self.measured_axes
        if len(kept) >= MIN_MEASURED_AXES:
            return ""
        named = ", ".join(f"{a.name} ({a.reason})" for a in self.unmeasured_axes) or "aucun axe"
        return (
            f"{len(kept)} axe(s) mesurable(s) sur {len(self.axes)} — sous {MIN_MEASURED_AXES} axes, "
            f"il n'y a pas de score. Non mesurés : {named}"
        )

    def ratios(self) -> dict[str, float]:
        return {a.name: a.ratio for a in self.measured_axes if a.ratio is not None}

    def unmeasured_reasons(self) -> dict[str, str]:
        return {a.name: a.reason for a in self.unmeasured_axes}

    def as_dict(self) -> dict[str, Any]:
        return {
            "prompt": self.prompt,
            "total": self.total,
            "max": MAX_SCORE,
            "reason": self.reason,
            "caveat": self.caveat,
            "axes": [a.as_dict() for a in self.axes],
        }


def share(items: Sequence[Any], predicate: Any) -> tuple[int, int]:
    """``(combien satisfont, combien il y en a)`` — le couple que
    :func:`measured` attend, pour ne pas répéter la boucle six fois."""
    total = len(items)
    return sum(1 for i in items if predicate(i)), total
