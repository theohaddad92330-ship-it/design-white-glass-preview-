"""#3901.p — décision Louis 16/10/2026 : une offre HORS des métiers de l'ESN ne compte plus dans Découvrir.

Jumeau de ``hiringScopeVerdict`` (même jeu de cas) + le cas LA POSTE : quatre offres facteur / relation
client, profil ESN IT déduit → aucune offre, donc aucun « recrutement » dans le score."""

import json
from pathlib import Path

import pytest

from app.services.discover_hiring_scope import drop_off_scope_hiring, hiring_scope_verdict
from app.services.discover_scoring import score_candidate

_FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/contracts/src/fixtures/discover-hiring-scope.json").read_text(
        encoding="utf-8"
    )
)


def _profile(key: str) -> dict:
    raw = _FIXTURE["profiles"][key]
    profile: dict = {"placedRoles": raw["placedRoles"], "inferredPlacedRoles": raw["inferred"]}
    if raw.get("recruitsForClients"):
        profile["recruitsForClients"] = True
    return profile


@pytest.mark.parametrize("case", _FIXTURE["cases"], ids=lambda c: f"{c['profile']}-{c['label']}")
def test_meme_verdict_que_le_contrat_ts(case):
    verdict = hiring_scope_verdict(case["label"], _profile(case["profile"]))
    assert verdict["keep"] is case["keep"]
    if not case["keep"]:
        assert verdict["reason"] == case["reason"]


def test_la_poste_aucune_offre_ne_reste():
    signals = [
        {"type": "hiring", "label": "CDD Facteur Villaines-La-Juhel H/F", "date": "2026-10-10"},
        {"type": "hiring", "label": "CDD Factrice ou Facteur H/F", "date": "2026-10-09"},
        {"type": "hiring", "label": "CDD Facteur H/F", "date": "2026-10-08"},
        {"type": "hiring", "label": "Conseiller en Service Relation Client H/F", "date": "2026-10-07"},
        {"type": "tender", "label": "Appel d'offres infogérance", "date": "2026-10-01"},
    ]
    kept = drop_off_scope_hiring(signals, _profile("esn_it_deduit"))
    assert [s["type"] for s in kept] == ["tender"]
    # Ce qui a pesé : plus aucun « recrutement » dans le rang du compte.
    scored = score_candidate({"name": "LA POSTE", "siren": "356000000", "headcountRange": "10000+"}, signals=kept)
    assert not [f for f in scored["factors"] if "recrutement" in f["evidence"].lower()]
    unscoped = score_candidate(
        {"name": "LA POSTE", "siren": "356000000", "headcountRange": "10000+"}, signals=signals
    )
    assert [f for f in unscoped["factors"] if "recrutement" in f["evidence"].lower()]  # le test prouve la régression


def test_une_esn_industrie_garde_ses_offres_industrie():
    signals = [
        {"type": "hiring", "label": "Ingénieur HSE chantier", "date": "2026-10-10"},
        {"type": "hiring", "label": "Développeur Java H/F", "date": "2026-10-09"},
    ]
    kept = drop_off_scope_hiring(signals, _profile("esn_industrie_declaree"))
    assert [s["label"] for s in kept] == ["Ingénieur HSE chantier"]


def test_sans_profil_seul_le_poste_non_place_sort():
    signals = [
        {"type": "hiring", "label": "Facteur H/F", "date": "2026-10-10"},
        {"type": "hiring", "label": "Développeur Java H/F", "date": "2026-10-09"},
    ]
    assert [s["label"] for s in drop_off_scope_hiring(signals, None)] == ["Développeur Java H/F"]


def test_un_signal_qui_n_est_pas_un_recrutement_n_est_jamais_touche():
    signals = [{"type": "tender", "label": "Livreur de repas — marché", "date": "2026-10-10"}]
    assert drop_off_scope_hiring(signals, _profile("muet")) == signals


def test_mode_signaux_un_compte_hors_metier_n_est_jamais_ecarte_il_passe_en_dernier_marque():
    from app.routers import discover_signals as mod

    def group(name: str, labels: list[str]):
        g = mod._Group(name)
        for label in labels:
            row = {
                "name": name,
                "siren": None,
                "department": "75",
                "city": None,
                "signal": {"type": "hiring", "label": label, "date": "2026-10-10", "url": None, "detail": None},
            }
            g.absorb(row, "hiring", "2026-10-13T00:00:00Z")
        return g

    resolved = [
        (group("LA POSTE", ["CDD Facteur H/F", "Conseiller en Service Relation Client H/F"]), "356000000", None),
        (group("ACME ESN", ["Développeur Java H/F"]), "222222222", None),
    ]
    built = mod._build_candidates(resolved, filters={}, profile=_profile("esn_it_deduit"), degraded=[])
    # #4284.26 (décision 22, Louis 19/10) — RENVERSE « un compte sans autre signal sort » : un compte HORS du
    # métier de l'espace n'est JAMAIS écarté ; il reste, plus bas que les autres, marqué `outOfTrade`.
    assert [c.name for c in built] == ["ACME ESN", "LA POSTE"]
    assert [c.outOfTrade for c in built] == [False, True]
    assert built[1].signals == []  # l'offre hors métier ne redevient pas un signal : seul le compte reste


# ── L3 (#4284.26, recette 21/10) : outOfTrade d'un COMPTE depuis son secteur ──────────────────────────────
from app.services.discover_hiring_scope import account_out_of_trade  # noqa: E402


def test_commerce_de_detail_sans_offre_est_hors_metier_pour_une_esn_it():
    # Carrefour Proximité — 47.11B, aucune offre.
    assert account_out_of_trade("47.11B", _profile("esn_it_deduit")) is True


def test_association_est_hors_metier_pour_une_esn_it():
    # Le Souvenir Français — 94.99Z.
    assert account_out_of_trade("94.99Z", _profile("esn_it_declaree")) is True


def test_non_un_compte_it_ou_industrie_n_est_pas_hors_metier():
    assert account_out_of_trade("62.02A", _profile("esn_it_deduit")) is False
    assert account_out_of_trade("27.12Z", _profile("esn_industrie_declaree")) is False


def test_non_sans_profil_ou_sans_metier_on_ne_marque_rien():
    assert account_out_of_trade("47.11B", None) is False
    assert account_out_of_trade("47.11B", _profile("muet")) is False


def test_non_une_esn_qui_place_pour_ses_clients_garde_tout_sans_marque():
    assert account_out_of_trade("47.11B", _profile("placeur_data")) is False


def test_non_un_code_naf_illisible_n_est_jamais_devine():
    assert account_out_of_trade(None, _profile("esn_it_deduit")) is False
    assert account_out_of_trade("ZZ.99Z", _profile("esn_it_deduit")) is False


def test_non_un_secteur_cible_declare_gagne():
    profile = {**_profile("esn_it_deduit"), "sectors": ["Commerce de détail"]}
    assert account_out_of_trade("47.11B", profile) is False


def test_mode_signaux_le_secteur_du_compte_le_dit_hors_metier_sans_offre_dans_le_metier():
    from app.routers import discover_signals as mod

    def group(name: str, kind: str, label: str):
        g = mod._Group(name)
        row = {
            "name": name,
            "siren": None,
            "department": "75",
            "city": None,
            "signal": {"type": kind, "label": label, "date": "2026-10-10", "url": None, "detail": None},
        }
        g.absorb(row, kind, "2026-10-13T00:00:00Z")
        return g

    resolved = [
        (group("CARREFOUR PROXIMITE", "tender", "Marché de maintenance"), "111111111", {"nafCode": "47.11B"}),
        (group("ACME SI", "tender", "Marché d'infogérance"), "222222222", {"nafCode": "62.02A"}),
    ]
    built = {
        c.name: c
        for c in mod._build_candidates(resolved, filters={}, profile=_profile("esn_it_deduit"), degraded=[])
    }
    assert built["CARREFOUR PROXIMITE"].outOfTrade is True
    assert built["ACME SI"].outOfTrade is False
