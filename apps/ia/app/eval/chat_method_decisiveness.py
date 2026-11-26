"""Évaluation comparative de la méthode commerciale (#3221, #206.9 — #3200).

Le ticket #3200 (section ÉVALUATION) demande de comparer trois variantes d'une
même question — réponse AVEC méthode, SANS méthode, réponse GÉNÉRIQUE du
modèle — et pose une exigence précise : « La version avec méthode doit
produire une décision plus précise, pas seulement davantage de texte. » Le
NO-GO associé nomme exactement le défaut à détecter : « Laura connaît les
données du compte mais raisonne encore comme un assistant généraliste sans
doctrine commerciale. »

Aucun rubric existant de `app/eval/bench/rubrics/` ne mesure ça : ceux-là
notent la conformité d'un SCHÉMA JSON (comptes cités, champs remplis...), pas
le fait qu'une réponse EN LANGAGE NATUREL tranche plutôt qu'elle hésite. Ce
module ne duplique donc pas `app/eval/bench/compare.py` (qui apparie des
enregistrements de banc, `CallRecord`, structurés) : il fournit la mesure
DÉTERMINISTE, spécifique au texte libre du chat, que ce ticket réclame —
appelable directement sur trois chaînes, sans dépendre du banc de prompts
structurés.

Discipline : jamais une probabilité, jamais un total qui masque ses axes
(même loi que `app/eval/bench/rubrics/axes.py`) — `MethodComparisonVerdict`
rend TOUJOURS les trois scores et la raison, jamais un seul verdict opaque.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# ── Marqueurs — mots du répertoire déjà écrit dans le prompt/le corpus, ───────
#    jamais un vocabulaire inventé pour ce module seul.

#: Une décision NOMME une route et la referme. Les verdicts de méthode déjà
#: écrits ailleurs (business_rules : GO/PRUDENT/STOP/EXPLORER, cold_account_
#: playbook, governance_guard) partagent ce registre.
_DECISION_MARKERS: tuple[str, ...] = (
    "je te deconseille", "je te recommande", "je recommande", "je conseille",
    "priorise", "priorite a", "commence par", "va sur", "vise",
    " go ", "go rapide", "no-go", "no go", "prudent", "stop",
    "pour une raison simple", "la raison est", "concretement",
)

#: Le hedge générique — un modèle « qui raisonne encore comme un assistant
#: généraliste » (NO-GO du ticket) plutôt que de trancher.
_HEDGE_MARKERS: tuple[str, ...] = (
    "cela depend", "ca depend", "il faudrait evaluer", "il est difficile de dire",
    "plusieurs facteurs", "en fonction de la situation", "tout depend",
    "il peut y avoir plusieurs raisons", "difficile a dire sans plus",
    "je ne peux pas vraiment dire", "cela varie",
)

#: Le format de citation exact du ticket (section CITATION) — déjà câblé
#: comme titre de chunk par `method_knowledge._corpus()` (#206.3).
_METHOD_CITATION_RE = re.compile(r"methode bellum\s*:", re.IGNORECASE)

_WORD_RE = re.compile(r"[a-z0-9]{2,}")


def _fold(text: str) -> str:
    import unicodedata

    raw = text.lower()
    return "".join(c for c in unicodedata.normalize("NFKD", raw) if not unicodedata.combining(c))


@dataclass(frozen=True)
class DecisivenessResult:
    """Ce qu'une réponse (n')a (pas) fait — jamais un score nu."""

    decision_markers_found: tuple[str, ...]
    hedge_markers_found: tuple[str, ...]
    cites_method: bool
    word_count: int

    @property
    def has_decision(self) -> bool:
        return len(self.decision_markers_found) > 0

    @property
    def hedges(self) -> bool:
        return len(self.hedge_markers_found) > 0


def decisiveness_score(text: str) -> DecisivenessResult:
    """Mesure DÉTERMINISTE, sans modèle ni clé — un texte, ses marqueurs."""
    folded = _fold(text or "")
    decisions = tuple(m for m in _DECISION_MARKERS if m.strip() in folded)
    hedges = tuple(m for m in _HEDGE_MARKERS if m in folded)
    return DecisivenessResult(
        decision_markers_found=decisions,
        hedge_markers_found=hedges,
        cites_method=bool(_METHOD_CITATION_RE.search(folded)),
        word_count=len(_WORD_RE.findall(folded)),
    )


@dataclass(frozen=True)
class MethodComparisonVerdict:
    """Les trois scores, la comparaison, et POURQUOI — jamais un gagnant nu."""

    with_method: DecisivenessResult
    without_method: DecisivenessResult
    generic: DecisivenessResult
    with_method_wins: bool
    reason: str


def evaluate_method_comparison(
    *, with_method: str, without_method: str, generic: str
) -> MethodComparisonVerdict:
    """Le NO-GO du ticket #3200, rendu exécutable.

    « Avec méthode » gagne seulement si elle DÉCIDE (au moins un marqueur de
    décision) ET ne hedge pas plus que les deux autres — jamais parce qu'elle
    est plus longue : ``word_count`` n'entre dans AUCUNE condition de victoire,
    exactement l'exigence du ticket (« pas seulement davantage de texte »).
    """
    wm = decisiveness_score(with_method)
    wom = decisiveness_score(without_method)
    gen = decisiveness_score(generic)

    if not wm.has_decision:
        return MethodComparisonVerdict(
            wm, wom, gen, with_method_wins=False,
            reason="la réponse avec méthode ne tranche sur aucun marqueur de décision — "
                   "elle raisonne encore comme un assistant généraliste (NO-GO du ticket)",
        )
    if len(wm.hedge_markers_found) > min(len(wom.hedge_markers_found), len(gen.hedge_markers_found)):
        return MethodComparisonVerdict(
            wm, wom, gen, with_method_wins=False,
            reason="la réponse avec méthode hedge AUTANT ou PLUS qu'au moins une des deux autres — "
                   "une décision qui se rétracte n'est pas une décision",
        )
    if len(wm.decision_markers_found) <= max(len(wom.decision_markers_found), len(gen.decision_markers_found)):
        return MethodComparisonVerdict(
            wm, wom, gen, with_method_wins=False,
            reason="la réponse avec méthode ne tranche pas PLUS que les deux autres — "
                   "sans méthode et la réponse générique décident déjà aussi bien",
        )
    return MethodComparisonVerdict(
        wm, wom, gen, with_method_wins=True,
        reason="la réponse avec méthode tranche (marqueur de décision présent) et hedge moins "
               "que les deux autres — jamais parce qu'elle est plus longue",
    )
