"""Analysis perimeter selector (Théo restitution p.10/21) — scope directives."""

from __future__ import annotations

from app.routers.phase1_research import _scope_directive, _scope_forces_france_only


def test_scope_directive_focuses_the_dossier_per_perimeter():
    assert "FRANCE" in (_scope_directive("france") or "")
    assert "FILIALES" in (_scope_directive("filiales") or "")
    assert "IT" in (_scope_directive("it_digital") or "")
    assert "STARTUPS" in (_scope_directive("startups") or "")


def test_scope_directive_is_neutral_for_group_custom_and_unknown():
    # Groupe / custom / absent / bruit → aucune consigne (analyse par défaut).
    assert _scope_directive("groupe") is None
    assert _scope_directive("custom") is None
    assert _scope_directive(None) is None
    assert _scope_directive("moon") is None


def test_scope_directive_is_case_insensitive():
    assert _scope_directive("FRANCE") == _scope_directive("france")
    assert _scope_directive(" It_Digital ") == _scope_directive("it_digital")


class TestScopeModeSite:
    """#3820 — le périmètre « site » n'existait dans AUCUNE consigne : un
    « site Lille » recevait la même recherche qu'un run sans cadrage."""

    def test_site_nomme_la_ville_dans_la_consigne(self):
        directive = _scope_directive("site", scope_city="Lille") or ""
        assert "SITE" in directive
        assert "Lille" in directive

    def test_site_dit_qu_un_siege_hors_zone_n_exclut_pas_une_equipe_locale(self):
        directive = _scope_directive("site", scope_city="Lille") or ""
        assert "hors site" in directive
        assert "n'exclut PAS" in directive

    def test_site_sans_ville_reste_une_consigne_neutre_jamais_une_ville_devinee(self):
        directive = _scope_directive("site") or ""
        assert "SITE" in directive
        assert "non renseigné" in directive

    def test_site_force_le_filtre_geo_dur_comme_france(self):
        assert _scope_forces_france_only("site") is True
        assert _scope_forces_france_only("france") is True
        assert _scope_forces_france_only("SITE") is True
        assert _scope_forces_france_only("filiales") is False
        assert _scope_forces_france_only(None) is False
