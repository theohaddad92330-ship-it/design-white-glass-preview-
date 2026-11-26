"""#2947 (#2204.78, lot R25) — le golden set sait dire OUI sur le moteur réel,
et NON sur chaque contre-exemple. Même patron que
``test_eval_message_objectives.py`` (#3695)."""

from app.eval.message_golden_set import (
    MESSAGE_GOLDEN_SET,
    build_case,
    check_all_anchors_kept,
    check_declared_relation_caution_present,
    check_every_persona_reaches_a_case,
    check_never_identical_for_fifty,
    run_golden_set,
)


def test_le_moteur_reel_passe_les_vingt_cas_et_dit_ce_quil_a_lu():
    report = run_golden_set()
    assert report.cases_read == len(MESSAGE_GOLDEN_SET) == 20
    assert [c.name for c in report.checks if not c.passed] == []
    assert report.passed


def test_un_jeu_vide_nest_jamais_vert():
    report = run_golden_set(cases=())
    assert report.cases_read == 0
    assert not report.passed


def test_all_anchors_kept_dit_non_quand_un_cas_perd_le_nom_du_compte():
    a = build_case(MESSAGE_GOLDEN_SET[0])
    lost = {**a, "prompt": a["prompt"].replace(a["company"], "")}
    assert check_all_anchors_kept([a]).passed
    assert not check_all_anchors_kept([lost]).passed


def test_never_identical_for_fifty_dit_non_quand_deux_cas_distincts_se_confondent():
    a, b = build_case(MESSAGE_GOLDEN_SET[0]), build_case(MESSAGE_GOLDEN_SET[1])
    assert check_never_identical_for_fifty([a, b]).passed
    assert not check_never_identical_for_fifty([a, {**b, "prompt": a["prompt"]}]).passed


def test_declared_relation_caution_present_dit_non_quand_la_ligne_manque():
    risky = next(c for c in MESSAGE_GOLDEN_SET if c.get("declared_person_company_relation"))
    built = build_case(risky)
    assert check_declared_relation_caution_present([built]).passed
    silenced = {**built, "prompt": built["prompt"].replace("RELATION PERSONNE", "")}
    assert not check_declared_relation_caution_present([silenced]).passed


def test_every_persona_reaches_a_case_dit_non_quand_un_persona_est_absent():
    built = [build_case(c) for c in MESSAGE_GOLDEN_SET]
    assert check_every_persona_reaches_a_case(built).passed
    stripped = [b for b in built if b["persona"] != "gouvernance"]
    assert not check_every_persona_reaches_a_case(stripped).passed


def test_chaque_cas_est_anonymise_sans_donnee_reelle():
    """Doctrine « jamais de donnée fictive présentée comme un fait réel » (lot
    R25) : chaque cas du golden set porte un nom de test, jamais une
    entreprise ou une personne réelle du dépôt."""
    for case in MESSAGE_GOLDEN_SET:
        assert case["company"].startswith("Golden Corp")
        assert case["contact"]["fullName"].startswith("Contact Golden")
