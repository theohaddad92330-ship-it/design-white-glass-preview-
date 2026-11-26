"""#3384.1 — la couche BU (équipe + vivier) est RENDUE dans le prompt de Laura.

L'API la lit depuis longtemps (`business_units.team_size / consultant_count /
capacity_available_consultants`) mais le contexte de chat envoyait `capacity` et
`consultant_count` toujours à `null` : le prompt disait « non renseigné » d'un
effectif que l'espace avait déclaré. Contrat : valeurs DÉCLARÉES seulement,
absent ⇒ pas de ligne neuve, jamais « 0 ».
"""

from __future__ import annotations

from app.prompts.identity_context import identity_context_block


def _unit(**over: object) -> dict:
    base: dict = {
        "name": "Agence Lyon",
        "territory": "AURA",
        "specialties": ["Java"],
        "capacity": None,
        "quarter_objective": None,
        "account_count": 3,
        "consultant_count": None,
        "reference_count": None,
        "team_size": None,
    }
    base.update(over)
    return base


def test_declared_team_and_pool_figures_are_rendered() -> None:
    block = identity_context_block(
        business_units=[
            _unit(team_size=6, consultant_count=40, capacity="8 consultants disponibles"),
        ]
    )
    assert "effectif de l'équipe commerciale : 6" in block
    assert "consultants rattachés : 40" in block
    assert "capacité : 8 consultants disponibles" in block


def test_absent_team_size_adds_no_line_and_never_zero() -> None:
    block = identity_context_block(business_units=[_unit()])
    assert "effectif de l'équipe" not in block
    # Le reste du bloc est celui d'avant : l'absence se dit « non renseigné ».
    assert "consultants rattachés : non renseigné" in block


def test_a_declared_zero_is_a_fact_junk_is_not_rendered() -> None:
    # `team_size` est nullable côté base : 0 est une déclaration (« aucun commercial »),
    # `None` est une absence. Le reste (négatif, chaîne, booléen) n'est pas un effectif.
    assert "effectif de l'équipe commerciale : 0" in identity_context_block(business_units=[_unit(team_size=0)])
    for junk in (-3, "6", True, None):
        assert "effectif de l'équipe" not in identity_context_block(business_units=[_unit(team_size=junk)])
