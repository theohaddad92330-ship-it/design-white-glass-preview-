"""LAU-FINAL-250 (#3340) — brief consultant provisoire.

Louis n'avait pas encore le CV du consultant, seulement des informations
données par morceaux (CDI, AWS, puis Tech Lead Data). Laura s'est bloquée sur
l'absence du nom et du CV au lieu de structurer ce qui était déjà connu.

Un objet persistant « brief consultant » (table dédiée, schéma partagé) est un
système de plusieurs jours, hors de ce lot — tranché sans Louis : ce lot livre
la règle de CONVERSATION (extraire ce qui est dit, ne jamais bloquer dessus,
gérer la contradiction sans fusionner ni abandonner), portée par
`_BLOCK_CONSULTANT_BRIEF` dans `build_system_prompt`."""

from __future__ import annotations

import json

from app.models.reply_blocks import validate_reply_block
from app.prompts.bellum_advisor import _BLOCK_CONSULTANT_BRIEF, build_system_prompt
from app.services.reply_blocks import normalize_reply_blocks


def test_names_the_twelve_fields_of_the_provisional_brief():
    """#3340.1 — les douze champs du brief, nommés verbatim (pas reformulés)."""
    for field in (
        "rôle principal",
        "rôles précédents",
        "niveau d'expérience",
        "dominante technique",
        "dominante fonctionnelle",
        "technologies connues",
        "secteurs connus",
        "type de contrat",
        "disponibilité",
        "mobilité",
        "remote ou présentiel",
        "TJM ou coût cible",
        "inconnues importantes",
    ):
        assert field in _BLOCK_CONSULTANT_BRIEF, f"champ absent : {field!r}"


def test_never_blocks_on_missing_cv_or_name():
    """#3340.2 — commence le travail avec les informations disponibles."""
    assert "tu ne bloques JAMAIS la recherche en attendant le CV ou le nom" in _BLOCK_CONSULTANT_BRIEF


def test_carries_the_provisional_exploration_sentence():
    """#3340.3 — la formulation exacte de l'issue pour démarrer sans qualifier de match."""
    assert (
        "Je peux commencer l'exploration du marché avec ce brief provisoire" in _BLOCK_CONSULTANT_BRIEF
    )


def test_handles_contradiction_without_merging_or_dropping():
    """#3340.4 — gestion des contradictions : ni fusion silencieuse, ni abandon de la première description."""
    assert "tu ne fusionnes JAMAIS silencieusement deux profils" in _BLOCK_CONSULTANT_BRIEF
    assert "Je confirme : il s'agit bien du même consultant" in _BLOCK_CONSULTANT_BRIEF


def test_caps_blocking_questions_at_two_and_continues_in_parallel():
    """#3340.5 — deux questions bloquantes au plus, le reste avance en parallèle."""
    assert "DEUX QUESTIONS BLOQUANTES AU PLUS" in _BLOCK_CONSULTANT_BRIEF
    assert "tu continues EN PARALLÈLE" in _BLOCK_CONSULTANT_BRIEF


def test_never_calls_an_incomplete_brief_a_matching():
    """#3340.6 — un résultat construit sur un brief incomplet ne s'appelle jamais « matching »."""
    assert "jamais « matching »" in _BLOCK_CONSULTANT_BRIEF


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "BRIEF CONSULTANT PROVISOIRE" in prompt


def test_3340_7_the_brief_renders_as_a_card_not_a_partial_paragraph():
    """#3340.7 — recette prod du 30/09 : le bloc n'atteignait le modèle QUE pour
    l'extraction, jamais pour la FORME de sa réponse — seuls quatre champs sur
    douze ressortaient à l'écran (niveau, séniorité, rôles, zones). La carte
    `consultant_brief` force la présence de tous les champs connus, et de ce
    qui manque encore."""
    assert "consultant_brief" in _BLOCK_CONSULTANT_BRIEF
    assert "chaque champ encore inconnu reste ABSENT" in _BLOCK_CONSULTANT_BRIEF


def test_3340_7_the_card_type_reaches_the_reply_formats_directive():
    """La carte doit aussi être ENSEIGNÉE dans la consigne de forme — sinon le
    modèle ne sait ni l'écrire ni la nommer."""
    from app.prompts.reply_formats import REPLY_FORMATS_DIRECTIVE

    assert "consultant_brief" in REPLY_FORMATS_DIRECTIVE
    assert "unknowns[] (OBLIGATOIRE" in REPLY_FORMATS_DIRECTIVE


def test_3340_8_never_write_a_placeholder_in_an_unknown_field():
    """#3340.8 — recette prod du 30/09 : le modèle écrivait « Non renseignée »
    dans un champ inconnu au lieu de le laisser absent — la carte échouait sa
    validation et retombait en puces plates. Le prompt l'interdit explicitement."""
    assert "Non renseigné(e)" in _BLOCK_CONSULTANT_BRIEF
    assert "le champ reste ABSENT de la carte" in _BLOCK_CONSULTANT_BRIEF


def _raw_block(**overrides: object) -> dict:
    base = {
        "type": "consultant_brief",
        "role": "Tech Lead Data",
        "seniority": "12 ans d'expérience",
        "mobility": "Paris et Lille",
        "contract_type": "CDI",
        "unknowns": [],
    }
    base.update(overrides)
    return base


def test_3340_8_a_sentinel_placeholder_is_repaired_to_absent_and_named():
    """Un champ rempli du texte sentinelle du modèle (« Non renseignée ») ne
    fait plus échouer toute la carte : il devient ABSENT et se nomme dans
    `unknowns`, jamais une carte refusée en bloc."""
    raw = _raw_block(availability="Non renseignée", rate_target="Inconnu")
    validated = validate_reply_block(raw)
    assert validated is not None
    assert "availability" not in validated
    assert "rate_target" not in validated
    assert "La disponibilité" in validated["unknowns"]
    assert "Le TJM ou coût cible" in validated["unknowns"]


def test_3340_8_a_sentinel_in_a_list_field_is_dropped_not_kept():
    raw = _raw_block(technologies=["AWS", "Non renseigné"], unknowns=["Son TJM cible."])
    validated = validate_reply_block(raw)
    assert validated is not None
    assert validated["technologies"] == ["AWS"]
    assert "Les technologies connues" in validated["unknowns"]
    assert "Son TJM cible." in validated["unknowns"]


def test_3340_8_a_legitimate_value_starting_with_non_is_not_treated_as_unknown():
    """« Non cadre » est une vraie valeur de type de contrat — la sentinelle ne
    doit matcher QUE les formes de « non renseigné »/« inconnu », jamais un mot
    qui commence par « non »."""
    raw = _raw_block(contract_type="Non cadre", unknowns=["Sa disponibilité exacte."])
    validated = validate_reply_block(raw)
    assert validated is not None
    assert validated["contract_type"] == "Non cadre"


def test_3340_8_without_any_sentinel_and_without_unknowns_still_fails():
    """Le contrat n'invente rien : sans sentinelle à réparer et sans `unknowns`
    déclaré par le modèle, la carte reste refusée — la réparation ne fabrique
    jamais une inconnue qui n'a pas été signalée."""
    raw = _raw_block(unknowns=[])
    assert validate_reply_block(raw) is None


def test_3340_8_the_repaired_card_reaches_normalize_reply_blocks_as_a_real_card():
    """Bout en bout : ce que `normalize_reply_blocks` renvoie porte encore la
    carte structurée — jamais les puces plates sans libellé de la recette
    prod du 30/09."""
    raw = _raw_block(availability="Non renseignée")
    reply = "Voici le brief provisoire.\n\n```bellum-block\n" + json.dumps(raw) + "\n```"
    normalized = normalize_reply_blocks(reply)
    assert '"type": "consultant_brief"' in normalized or '"type":"consultant_brief"' in normalized
    assert "availability" not in normalized


# ── #3340 (recette 30/09, 2e brief du même fil) — la carte tient à CHAQUE brief ──


def test_3340_second_brief_too_many_technologies_keeps_the_card_and_names_the_cut():
    """Le 2e brief (AWS) listait plus de technologies que la carte n'en tient :
    la carte entière était refusée et retombait en 13 puces plates."""
    techs = [f"Techno {i}" for i in range(14)]
    validated = validate_reply_block(_raw_block(technologies=techs, unknowns=["Son TJM cible."]))
    assert validated is not None
    assert len(validated["technologies"]) == 10
    assert any("Les technologies connues" in item and "4 de plus" in item for item in validated["unknowns"])


def test_3340_second_brief_overlong_text_is_clamped_not_refused():
    validated = validate_reply_block(_raw_block(mobility="Paris " * 60, unknowns=["TJM"]))
    assert validated is not None
    assert len(validated["mobility"]) <= 160
    assert validated["mobility"].endswith("…")


def test_3340_second_brief_survives_normalize_reply_blocks_as_a_card():
    raw = _raw_block(technologies=[f"T{i}" for i in range(12)])
    reply = "Brief.\n\n```bellum-block\n" + json.dumps(raw) + "\n```"
    normalized = normalize_reply_blocks(reply)
    assert "consultant_brief" in normalized


def test_the_card_holds_on_every_turn_not_just_the_first():
    """#3340 (recette 01/10) — le 2e brief d'une même conversation retombait en
    ~21 puces plates : la consigne ne disait la carte que pour « la première
    description ». Elle doit nommer les tours suivants (seconde description,
    réponse à la contradiction, brief redemandé) ET interdire la liste de puces."""
    assert "À CHAQUE TOUR" in _BLOCK_CONSULTANT_BRIEF
    assert "seconde description" in _BLOCK_CONSULTANT_BRIEF
    assert "jamais une liste de puces" in _BLOCK_CONSULTANT_BRIEF
    assert "libellé" in _BLOCK_CONSULTANT_BRIEF
    # et le prompt assemblé le porte bien, une seule fois (GA-26)
    assert build_system_prompt({}, {}, "", "").count("À CHAQUE TOUR où le brief consultant") == 1
