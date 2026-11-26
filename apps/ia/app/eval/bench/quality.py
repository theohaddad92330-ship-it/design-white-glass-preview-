"""La colonne « qualité » du banc — déterministe, décomposée, et qui SAIT dire
« non mesuré ».

Jusqu'au 28/08/2026, le dépôt ne possédait qu'une seule grille déterministe
publiée : ``app/eval/strategy/rubric.py``, un barème /100 pour la sortie
``bellum_strategy``. Pour tous les autres prompts il n'y avait **pas** de note —
ce qui était honnête (un banc qui écrirait « 0 » à cet endroit mentirait comme un
écran qui affiche ``{value ?? 0}``) mais inutilisable pour décider : sur
``bellum_organigramme``, ``bellum_contacts``, ``bellum_signals`` et
``bellum_facts``, « le modèle X gagne » ne pouvait vouloir dire que « il rend un
JSON valide, moins cher, plus vite ».

``app/eval/bench/rubrics/`` comble ce trou **sans inventer un critère** : chaque
axe rebranche une primitive déjà expédiée (``metrics.contacts_quality``,
``assemble_buying_committee``, ``org_resolver``, le contrôle de Luhn, les
marqueurs de fabrication, les règles écrites des prompts) sur la sortie d'UN
prompt au lieu d'un dossier assemblé.

Trois lois tenues ici
---------------------
1. **Un score n'est jamais nu** — :class:`QualityScore` porte ses ``axes``, et
   les axes non mesurés sont NOMMÉS dans ``unmeasured_axes`` avec leur raison.
2. **« Non mesuré » sort du dénominateur** — l'agrégation vit dans
   ``rubrics/axes.py`` et ne compte que les axes mesurés.
3. **Sous trois axes, il n'y a pas de score** — ``total`` vaut alors ``None``,
   avec sa raison. Les axes mesurés restent lisibles ; c'est l'agrégat qui manque.

La note du juge (``bench/judge.py``) n'entre dans **aucun** de ces chiffres : elle
vit dans une colonne à côté, et ``Comparison.deterministic_dict()`` ne la contient
pas.

Ce que la conformité de schéma mesure, elle, vaut pour TOUS les prompts : c'est la
colonne qui reste quand la qualité n'est pas notable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.agents.profiler import ProfileContext
from app.eval.bench.corpus import CallRecord
from app.eval.bench.rubrics import MAX_SCORE, rubric_for
from app.models.outputs.contacts import ContactsOutput, OrganigrammeOutput
from app.models.outputs.research import ResearchFacts, ResearchSignals, ResearchStrategy

#: Les ``response_model`` STRICTS du chemin payant. Un changement de fournisseur
#: se casse ici avant de se casser ailleurs : c'est le corpus que la 4ᵉ colonne
#: surveille, et ``tests/test_model_bench.py`` vérifie que chacun est bien
#: consommé par un site d'appel réel (une garde qui ne LIT rien ne garde rien).
#:
#: ⚠️ Cinq des six passent par la passerelle et sont donc ENREGISTRABLES.
#: ``ProfileContext`` ne l'est pas : le Profiler utilise ``call_claude_sync``,
#: qui appelle Anthropic en direct. Il figure ici parce qu'il EST un site strict
#: du chemin payant — pas parce que le banc sait le mesurer. La frontière est
#: tenue par un test, dans les deux sens.
STRICT_RESPONSE_MODELS: tuple[type, ...] = (
    ResearchFacts,
    ResearchSignals,
    ResearchStrategy,
    ContactsOutput,
    OrganigrammeOutput,
    ProfileContext,
)

#: ⚠️ La liste des prompts qui ONT une grille n'est plus recopiée ici : elle EST
#: ``app/eval/bench/rubrics.RUBRICS``. Un réglage vit à un seul endroit (GA-26 en
#: esprit) — et une deuxième liste aurait divergé au premier barème ajouté.


@dataclass(frozen=True)
class QualityScore:
    """Une note /100 DÉCOMPOSÉE, ou l'absence NOMMÉE de note."""

    measured: bool
    total: float | None
    reason: str
    max_score: float = MAX_SCORE
    #: Les bandes de ``bellum_strategy``, en POINTS — conservé tel quel pour les
    #: lecteurs qui existaient avant les axes.
    bands: dict[str, float] = field(default_factory=dict)
    #: nom d'axe → ratio 0..1. Un score n'est jamais nu.
    axes: dict[str, float] = field(default_factory=dict)
    #: nom d'axe → POURQUOI il n'a pas pu être mesuré. Jamais un 0 silencieux.
    unmeasured_axes: dict[str, str] = field(default_factory=dict)
    #: Ce que le barème, dans son ensemble, ne prétend pas mesurer.
    caveat: str = ""
    prompt: str = ""

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


def score_call(record: CallRecord) -> QualityScore:
    """Note la sortie d'un appel — ou dit pourquoi elle n'est pas notable."""
    if not record.ok:
        return QualityScore(False, None, f"appel en échec ({record.status}) — rien à noter")
    fn = rubric_for(record.prompt_name)
    if fn is None:
        return QualityScore(
            False, None,
            f"aucune grille déterministe pour {record.prompt_name!r} — "
            "la conformité de schéma reste mesurée",
        )
    if not isinstance(record.output, dict) or not record.output:
        return QualityScore(False, None, "sortie non conservée — relancer avec la conservation activée")

    result = fn(record.output, user_prompt=record.user)
    total = result.total
    return QualityScore(
        measured=total is not None,
        total=total,
        reason=result.reason or f"barème {result.prompt} de app/eval/bench/rubrics/",
        bands={a.name: round(a.weight * (a.ratio or 0.0), 2) for a in result.measured_axes},
        axes=result.ratios(),
        unmeasured_axes=result.unmeasured_reasons(),
        caveat=result.caveat,
        prompt=result.prompt,
    )
