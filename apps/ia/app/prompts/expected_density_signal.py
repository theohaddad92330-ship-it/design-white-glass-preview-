"""#3192.10 (recette prod du 30/09, RÉFUTÉ sur #3192) — le signal de densité
IMPLICITE, pour la question qui n'a AUCUN marqueur explicite.

#3192.8 ne poussait `NIVEAU DE RÉPONSE` que sur un marqueur déclaré (« bref »
/ « détaille »). Le symptôme exact de la recette (« SG prend des
consultants ? », dans un fil chargé → 420 mots, Verdict/Pourquoi/alternatives)
n'a AUCUN marqueur explicite : c'est une question fermée et courte, que
`response_density.classify_expected_density` (#3192.9) classe déjà MICRO —
mais ce classement ne servait jusqu'ici QUE la vérification APRÈS coup
(``commercial_verifier``, un verdict journalisé, jamais une réécriture,
puisque le texte est déjà diffusé au fil de l'eau). Ce module consomme le
MÊME classement AVANT génération (GA-26, jamais un second classifieur) : la
seule moitié qui manquait pour que MICRO pèse réellement sur la réponse,
plutôt que sur son seul constat a posteriori.

Un marqueur EXPLICITE (#3192.8) reste prioritaire : ce signal ne s'ajoute que
lorsqu'aucun marqueur déclaré n'existe déjà, jamais en double."""

from __future__ import annotations

from app.services.response_density import ResponseDensityLevel

_MICRO_IMPLICITE = (
    "SIGNAL DE CE TOUR (calculé sur le message lui-même, jamais deviné) : cette "
    "question est fermée et courte, sans marqueur de détail explicite — le niveau "
    "MICRO s'applique : DEUX phrases au plus — compte-les avant de répondre, une troisième est une faute. Ne rends ni Verdict/Pourquoi/Limites, ni "
    "alternatives, ni plan, à moins que la question elle-même les réclame ; un fil "
    "de conversation chargé ne change pas ce niveau."
)


def expected_density_signal_block(expected_level: ResponseDensityLevel | str | None, niveau_detail: str | None) -> str:
    """``""`` si un marqueur explicite s'est déjà déclaré (#3192.8 prime), si
    aucun classement n'a été calculé (``None``, comportement inchangé), ou si
    le classement n'est pas MICRO — jamais une poussée vers SHORT/DECISION/DEEP,
    qui resterait une supposition sur le FOND plutôt qu'une mesure de forme."""
    if niveau_detail or expected_level != "micro":
        return ""
    return f"\n\n{_MICRO_IMPLICITE}"
