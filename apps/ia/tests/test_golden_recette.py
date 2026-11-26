"""Recette golden (#2130) — prouver qu'une recommandation n'est pas du vent.

Quinze comptes golden (#2130.1-15), treize vérifications par compte (#2130.16-28),
une grille à neuf labels (#2130.29-37), et une recommandation GÉNÉRIQUE qui fait
échouer le run (#2130.38).

Règle du cadrage, non négociable (#2130.1-7 reformulés) : un compte golden est SOIT
un nom FICTIF assumé et marqué, SOIT une entreprise réelle dont chaque fait affirmé
est SOURCÉ (URL + date) et relu dans le dépôt. Jamais un fait inventé sous un nom réel.

Discipline de garde (CLAUDE.md, « ce qui tient les règles ») : chaque garde ci-dessous
prouve qu'elle LIT un corpus non vide, qu'elle sait dire NON (mutation volontaire), et
qu'elle n'attrape pas le cas voisin légitime (témoin).
"""

from __future__ import annotations

import copy
import re
from pathlib import Path

import pytest

from app.eval.recette import (
    ARCHETYPES,
    BLOCKING_LABELS,
    CAS_DIR,
    LABELS,
    MACHINE_LABELS,
    MIN_MEASURED,
    VERIFICATIONS,
    corpus_violations,
    list_accounts,
    load_account,
    load_dossier,
    machine_label,
    run_account,
)
from app.eval.recette.__main__ import main

_GENERIC_CASE = CAS_DIR / "recommandation-generique.dossier.json"
_GENERIC_CASE_ACCOUNT = "pme-atelier-numerique-brevenne"


def _accounts_by_nature(nature: str):
    return [a for a in list_accounts() if a.nature == nature]


def _first_reco(dossier: dict) -> dict:
    return dossier["recommandations"][0]


# ── #2130.29-37 — la grille à neuf labels ────────────────────────────────────


def test_la_grille_a_neuf_labels_dans_l_ordre_du_retour():
    assert LABELS == (
        "useful_and_correct",
        "plausible",
        "generic",
        "misleading",
        "wrong_entity",
        "wrong_person",
        "outdated",
        "unsupported",
        "unknown",
    )
    assert set(BLOCKING_LABELS) == {"generic", "misleading", "wrong_entity", "wrong_person", "outdated", "unsupported"}
    # Ce que la machine sait décider seule ; le reste est un jugement HUMAIN.
    assert set(MACHINE_LABELS) == {"wrong_entity", "wrong_person", "unsupported", "outdated", "generic"}


def test_les_labels_partages_s_ecrivent_comme_la_memoire_marche():
    """#2130.29 cite `correct_and_useful`, un libellé qui n'existe pas : le
    vocabulaire en vigueur est `useful_and_correct`, et le contrat de la mémoire
    marché REJETTE l'autre ordre. Deux orthographes du même jugement dans un
    même dépôt finissent en deux colonnes qu'aucune requête ne réconcilie."""
    ts = (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "contracts"
        / "src"
        / "schemas"
        / "market-memory-ground-truth.ts"
    ).read_text(encoding="utf-8")
    block = ts.split("MARKET_MEMORY_GROUND_TRUTH_LABELS = [", 1)[1].split("] as const", 1)[0]
    contract_labels = set(re.findall(r"^\s*'([a-z_]+)',", block, flags=re.MULTILINE))
    assert len(contract_labels) == 6, contract_labels  # la garde LIT le contrat
    assert {"useful_and_correct", "plausible", "misleading", "wrong_entity", "unknown"} <= contract_labels
    assert {"useful_and_correct", "plausible", "misleading", "wrong_entity", "unknown"} <= set(LABELS)
    assert "correct_and_useful" not in LABELS


# ── #2130.16-28 — treize vérifications par compte ────────────────────────────


def test_treize_verifications():
    assert VERIFICATIONS == (
        "identite",
        "perimetre",
        "decideurs",
        "contacts_a_ne_pas_recommander",
        "equipes_cles",
        "signaux",
        "projets",
        "partenaires",
        "acces",
        "recommandations",
        "gaps",
        "sources",
        "action_suivante",
    )


# ── #2130.1-15 — quinze comptes, un par archétype ────────────────────────────


def test_le_corpus_compte_quinze_comptes_un_par_archetype():
    accounts = list_accounts()
    assert len(accounts) == 15
    assert sorted(a.archetype for a in accounts) == sorted(ARCHETYPES)
    assert {a.issue for a in accounts} == {f"#2130.{i}" for i in range(1, 16)}
    for a in accounts:
        assert ARCHETYPES[a.archetype] == a.issue, a.slug


def test_aucun_compte_du_corpus_ne_viole_la_regle_du_cadrage():
    accounts = list_accounts()
    assert accounts  # la garde lit quelque chose
    assert _accounts_by_nature("fictif") and _accounts_by_nature("reel_source")
    for a in accounts:
        assert corpus_violations(a) == [], a.slug


def test_chaque_compte_declare_les_treize_verifications_et_au_moins_trois_mesurees():
    for a in list_accounts():
        assert tuple(a.expected) == VERIFICATIONS, a.slug
        measured = [k for k, v in a.expected.items() if v["status"] != "non_mesure"]
        assert len(measured) >= MIN_MEASURED, a.slug


def test_la_garde_dit_non_a_un_fait_non_source_sous_un_nom_reel():
    real = _accounts_by_nature("reel_source")[0]
    # Un décideur nommé sous un nom réel, sans source : la faute exacte du cadrage.
    raw = copy.deepcopy(real.raw)
    raw["expected"]["decideurs"] = {"status": "attendu", "contient": ["Directrice des systèmes d'information"]}
    raw["dossier"]["decideurs"] = [{"name": "Claire Martin", "title": "Directrice des systèmes d'information"}]
    violations = corpus_violations(load_account(real.slug, raw=raw))
    assert any("decideurs" in v for v in violations), violations


def test_la_garde_dit_non_a_un_nombre_non_source_sous_un_nom_reel():
    real = _accounts_by_nature("reel_source")[0]
    raw = copy.deepcopy(real.raw)
    raw["dossier"]["perimetre"]["entities"].append("Filiale de 12 400 salariés")
    violations = corpus_violations(load_account(real.slug, raw=raw))
    assert any("12" in v or "400" in v for v in violations), violations


def test_la_garde_dit_non_a_un_fait_dont_la_valeur_ne_suit_pas_sa_trace():
    real = _accounts_by_nature("reel_source")[0]
    raw = copy.deepcopy(real.raw)
    raw["facts"][0]["value"] = raw["facts"][0]["value"] + "9"
    violations = corpus_violations(load_account(real.slug, raw=raw))
    assert any("trace" in v for v in violations), violations


def test_la_garde_dit_non_a_un_compte_fictif_mal_marque():
    fictif = _accounts_by_nature("fictif")[0]
    unmarked = copy.deepcopy(fictif.raw)
    unmarked["company"] = unmarked["company"].replace(" (fictif)", "")
    assert corpus_violations(load_account(fictif.slug, raw=unmarked))

    with_siren = copy.deepcopy(fictif.raw)
    with_siren["dossier"]["identite"]["siren"] = "552059024"
    assert any("siren" in v for v in corpus_violations(load_account(fictif.slug, raw=with_siren)))

    real_url = copy.deepcopy(fictif.raw)
    real_url["dossier"]["sources"][0]["url"] = "https://www.entreprise-reelle.fr/communique"
    assert any(".invalid" in v for v in corpus_violations(load_account(fictif.slug, raw=real_url)))


# ── la recette sur les dossiers de référence ─────────────────────────────────


def test_chaque_dossier_de_reference_passe_la_recette():
    for a in list_accounts():
        report = run_account(a, a.dossier)
        assert report.passed, (a.slug, [c for c in report.checks if c.verdict == "echoue"])
        assert all(r.label is None for r in report.recommendations), a.slug


def test_non_mesure_n_est_pas_compte_reussi():
    real = _accounts_by_nature("reel_source")[0]
    report = run_account(real, real.dossier)
    non_mesure = [c for c in report.checks if c.verdict == "non_mesure"]
    assert non_mesure  # un compte réel ne mesure que ce qui est sourcé
    assert report.measured == 13 - len(non_mesure)
    assert report.reussies == report.measured
    assert "13/13" not in report.summary
    assert f"{report.measured}/{report.measured}" in report.summary
    assert all(c.detail for c in non_mesure)  # ce qui n'est pas mesuré est NOMMÉ


def test_une_verification_vide_attendue_remplie_echoue():
    vide = load_account("compte-vide-exemple")
    dossier = copy.deepcopy(vide.dossier)
    dossier["decideurs"] = [{"name": "Paul Durand", "title": "DSI"}]
    report = run_account(vide, dossier)
    assert not report.passed
    assert [c.key for c in report.checks if c.verdict == "echoue"] == ["decideurs"]


def test_une_verification_attendue_absente_du_dossier_echoue():
    a = load_account(_GENERIC_CASE_ACCOUNT)
    dossier = copy.deepcopy(a.dossier)
    dossier["signaux"] = []
    report = run_account(a, dossier)
    assert "signaux" in [c.key for c in report.checks if c.verdict == "echoue"]


# ── #2130.38 — la recommandation générique FAIT ÉCHOUER le run ───────────────


def test_une_recommandation_generique_fait_echouer_le_run():
    account = load_account(_GENERIC_CASE_ACCOUNT)
    dossier = load_dossier(_GENERIC_CASE)
    report = run_account(account, dossier)
    assert not report.passed
    assert [c.key for c in report.checks if c.verdict == "echoue"] == ["recommandations"]
    assert [r.label for r in report.recommendations] == ["generic"]


def test_temoin_la_recommandation_specifique_du_meme_compte_passe():
    account = load_account(_GENERIC_CASE_ACCOUNT)
    report = run_account(account, account.dossier)
    assert report.passed
    assert [r.label for r in report.recommendations] == [None]


def test_le_nom_du_compte_ne_suffit_pas_a_rendre_une_phrase_specifique():
    a = load_account(_GENERIC_CASE_ACCOUNT)
    dossier = copy.deepcopy(a.dossier)
    reco = _first_reco(dossier)
    reco["text"] = f"Proposer à {a.company_core} un accompagnement sur sa transformation digitale."
    reco["why"] = f"{a.company_core} doit accélérer sa modernisation pour gagner en performance."
    assert machine_label(reco, a, dossier) == "generic"


def test_la_phrase_d_un_autre_compte_recopiee_est_generique():
    """« Pourrait s'appliquer telle quelle à un autre compte » : la raison d'un
    compte, nom substitué, posée sur un autre — sans aucun fait de celui-ci."""
    a = load_account(_GENERIC_CASE_ACCOUNT)
    other = next(o for o in list_accounts() if o.slug != a.slug and o.nature == "fictif" and o.dossier["recommandations"])
    borrowed = copy.deepcopy(_first_reco(other.dossier))
    borrowed["text"] = borrowed["text"].replace(other.company_core, a.company_core)
    borrowed["why"] = borrowed["why"].replace(other.company_core, a.company_core)
    borrowed["evidence"] = [a.dossier["sources"][0]["id"]]
    borrowed["target"] = a.dossier["decideurs"][0]["name"]
    dossier = copy.deepcopy(a.dossier)
    dossier["recommandations"] = [borrowed]
    assert machine_label(borrowed, a, dossier) == "generic"


def test_la_meme_raison_sur_deux_comptes_est_generique_meme_avec_un_fait_propre():
    a = load_account(_GENERIC_CASE_ACCOUNT)
    other = next(o for o in list_accounts() if o.slug != a.slug and o.dossier["recommandations"])
    dossier = copy.deepcopy(a.dossier)
    reco = _first_reco(dossier)
    reco["why"] = _first_reco(other.dossier)["why"].replace(other.company_core, a.company_core)
    assert machine_label(reco, a, dossier) == "generic"


# ── les autres labels que la machine sait poser, et leurs témoins ────────────


def test_wrong_person_sur_un_contact_a_ne_pas_recommander():
    a = load_account(_GENERIC_CASE_ACCOUNT)
    dossier = copy.deepcopy(a.dossier)
    reco = _first_reco(dossier)
    assert dossier["contacts_a_ne_pas_recommander"]
    reco["target"] = dossier["contacts_a_ne_pas_recommander"][0]["name"]
    assert machine_label(reco, a, dossier) == "wrong_person"
    reco["target"] = dossier["decideurs"][0]["name"]  # témoin
    assert machine_label(reco, a, dossier) is None


def test_unsupported_sans_preuve_ou_sur_une_preuve_introuvable():
    a = load_account(_GENERIC_CASE_ACCOUNT)
    dossier = copy.deepcopy(a.dossier)
    reco = _first_reco(dossier)
    reco["evidence"] = []
    assert machine_label(reco, a, dossier) == "unsupported"
    reco["evidence"] = ["id-qui-n-existe-pas"]
    assert machine_label(reco, a, dossier) == "unsupported"


def test_outdated_quand_la_preuve_la_plus_fraiche_a_plus_de_dix_huit_mois():
    a = load_account(_GENERIC_CASE_ACCOUNT)
    dossier = copy.deepcopy(a.dossier)
    reco = _first_reco(dossier)
    signal = next(s for s in dossier["signaux"] if s["id"] in reco["evidence"])
    signal["date"] = "2023-01"
    reco["evidence"] = [signal["id"]]
    assert machine_label(reco, a, dossier) == "outdated"
    signal["date"] = a.as_of.isoformat()[:7]  # témoin : daté du mois de référence
    assert machine_label(reco, a, dossier) is None


def test_wrong_entity_sur_un_autre_compte_mais_pas_sur_un_partenaire_nomme():
    a = load_account(_GENERIC_CASE_ACCOUNT)
    other = next(o for o in list_accounts() if o.slug != a.slug and o.nature == "fictif")
    dossier = copy.deepcopy(a.dossier)
    reco = _first_reco(dossier)
    reco["text"] = f"{reco['text']} Reprendre la démarche menée chez {other.company_core}."
    assert machine_label(reco, a, dossier) == "wrong_entity"
    dossier["partenaires"] = [*dossier["partenaires"], other.company_core]  # témoin
    assert machine_label(reco, a, dossier) is None


# ── calibration : la machine rejoint le jugement humain du corpus ────────────


def test_chaque_label_de_la_grille_est_exerce_par_le_corpus():
    seen = {case["label"] for a in list_accounts() for case in a.cas}
    assert seen == set(LABELS)


def test_le_detecteur_rejoint_le_jugement_humain_sur_les_cas_etiquetes():
    """Un juge automatique se calibre contre un jugement humain. Là où la
    machine sait trancher, elle rend le label humain ; là où le jugement est
    humain (utile, plausible, trompeur, indécidable), elle ne prétend RIEN."""
    total = 0
    for a in list_accounts():
        for case in a.cas:
            total += 1
            got = machine_label(case, a, a.dossier)
            expected = case["label"] if case["label"] in MACHINE_LABELS else None
            assert got == expected, (a.slug, case["id"], case["label"], got)
    assert total >= len(LABELS)


# ── la commande qui échoue ───────────────────────────────────────────────────


def test_la_commande_rend_1_sur_le_generique_et_0_sur_le_corpus(capsys: pytest.CaptureFixture[str]):
    assert main(["--account", _GENERIC_CASE_ACCOUNT, "--dossier", str(_GENERIC_CASE)]) == 1
    assert "generic" in capsys.readouterr().out
    assert main([]) == 0
