"""Playbook d'ouverture compte froid — assemblage nommé + contenu bottom-up
sourcé (#2314, LAU-FINAL-055).

Couvre #2314.1 (playbook nommé, pièces éparses assemblées), #2314.5 (familles de
rôles terrain listées), #2314.10 (déclencheur sponsor/achats, pas seulement
l'ordre), #2314.33/.35/.36 (volume du PREMIER contact : une équipe, une
question, une relance), #2314.37 (jamais 50 contacts avant qualification), et,
pour les 25 points cités par l'épopée #3009 (#2314.2, .3, .4, .6, .12-.17,
.19-.32, .38), le contenu recopié VERBATIM depuis le corps de l'issue #2314
(recherche exhaustive et négative dans les annexes, voir
`.claude/notes/recherche-source-2314-25-09.md`).
"""

from __future__ import annotations

from app.services.cold_account_playbook import (
    COLD_ACCOUNT_SECTORS,
    COLD_ACCOUNT_STEPS,
    FIRST_EXCHANGE_TARGETS,
    FIRST_TOUCH_FOLLOWUP_CAP,
    FIRST_TOUCH_QUESTION_CAP,
    FIRST_TOUCH_TEAM_CAP,
    GENERIC_ANSWER_BANNED,
    PERSONA_QUESTIONS,
    RECIPE_SCENARIOS,
    SECTOR_ANTI_PATTERNS,
    cold_account_opening_block,
    cold_account_playbook_block,
    match_cold_account_sector,
    persona_question,
    qualification_cap,
    sector_route,
)


def test_caps_are_one_at_first_touch() -> None:
    # #2314.33 / #2314.35 / #2314.36 — pas un plafond de CONTACTS (déjà tenu par
    # STAGE_PLAYBOOK, p3) : un plafond de MOUVEMENTS au premier tour.
    assert FIRST_TOUCH_TEAM_CAP == 1
    assert FIRST_TOUCH_QUESTION_CAP == 1
    assert FIRST_TOUCH_FOLLOWUP_CAP == 1


def test_qualification_cap_never_near_fifty_whatever_the_stage() -> None:
    # #2314.37 — "jamais cinquante contacts avant qualification".
    for stage in ("freelance", "petite", "structuration", "etablie", "grande"):
        assert qualification_cap(stage) < 50
    assert qualification_cap("grande") == 15  # borne haute p3, la plus permissive
    assert qualification_cap(None) == qualification_cap("petite")  # défaut sûr


def test_block_is_empty_on_a_warm_account() -> None:
    # Une relation ou un sponsor existant → ce n'est plus un compte froid, le
    # bloc ne doit rien ajouter (même garde que `governance_guard`).
    assert cold_account_opening_block("petite", "client_actif") == ""
    assert cold_account_opening_block("petite", "refere") == ""


def test_block_assembles_the_named_playbook_on_a_cold_account() -> None:
    # #2314.1 — pièces réunies : volume premier tour, plafond de qualification,
    # déclencheur sponsor/achats, familles de rôles terrain.
    block = cold_account_opening_block("petite", "froid")
    assert "PLAYBOOK D'OUVERTURE COMPTE FROID" in block
    assert "1 équipe" in block
    assert "1 question" in block
    assert "1 relance" in block
    assert "5 contacts" in block  # plafond de qualification du stade "petite"
    assert "sponsor" in block.lower() and "achats" in block.lower()
    assert "cyber" in block  # une famille de rôles terrain nommée


def test_block_defaults_to_a_safe_stage_when_unknown() -> None:
    # Stade non déclaré → défaut sûr "petite" (même doctrine que
    # `esn_stage.classify_esn_stage`), jamais une supposition optimiste.
    block = cold_account_opening_block(None, "froid")
    assert "5 contacts" in block


class TestObjectifEtEtapes:
    def test_generic_answer_is_named_and_banned(self):
        # #2314.2 — source : issue #2314, section OBJECTIF.
        assert GENERIC_ANSWER_BANNED == "Trouve des décideurs."

    def test_steps_2_3_4_are_verbatim(self):
        # #2314.3, #2314.4, #2314.6 — source : issue #2314, section ÉTAPES.
        assert "Choisir un périmètre réaliste." in COLD_ACCOUNT_STEPS
        assert "Identifier l’équipe qui vit probablement le problème." in COLD_ACCOUNT_STEPS
        assert "Identifier la première information à obtenir." in COLD_ACCOUNT_STEPS


class TestPremierObjectif:
    def test_six_targets_verbatim_and_ordered(self):
        # #2314.12-#2314.17 — source : issue #2314, section PREMIER OBJECTIF.
        assert FIRST_EXCHANGE_TARGETS == (
            "bon périmètre",
            "bon owner",
            "réalité du besoin",
            "recours externe",
            "timing",
            "voie d’achat",
        )


class TestPersonas:
    def test_three_personas_verbatim(self):
        # #2314.19-#2314.21 — source : issue #2314, section PERSONAS.
        assert persona_question("operationnel") == "Questionner le travail réel."
        assert persona_question("manager") == "Questionner la priorité et la capacité."
        assert persona_question("achats") == "Questionner le circuit et les conditions."

    def test_unknown_persona_returns_none(self):
        assert persona_question("board") is None
        assert persona_question(None) is None


class TestSecteurs:
    def test_nine_sectors_named(self):
        # #2314.22-#2314.30 — source : issue #2314, section SECTEURS.
        assert COLD_ACCOUNT_SECTORS == (
            "cyber",
            "data",
            "ingenierie",
            "industrie",
            "environnement",
            "automobile",
            "pharma",
            "infrastructure",
            "conseil_metier",
        )

    def test_cyber_and_data_and_conseil_metier_match(self):
        assert match_cold_account_sector("Éditeur cybersécurité") == "cyber"
        assert match_cold_account_sector("Cabinet data science") == "data"
        assert match_cold_account_sector("Conseil métier finance") == "conseil_metier"

    def test_unlisted_sector_says_no(self):
        # Test qui sait dire NON : un secteur non listé par l'issue #2314 ne
        # fabrique PAS une route.
        assert match_cold_account_sector("agroalimentaire") is None
        assert sector_route("agroalimentaire") is None

    def test_environnement_and_industrie_anti_patterns_verbatim(self):
        # #2314.31, #2314.32 — source : issue #2314, section SECTEURS (exemples).
        assert SECTOR_ANTI_PATTERNS["environnement"] == (
            "ne pas commencer par le directeur RSE groupe si le sujet concerne une autorisation de site."
        )
        assert SECTOR_ANTI_PATTERNS["industrie"] == (
            "ne pas commencer par le CIO si le sujet concerne les méthodes usine."
        )
        route = sector_route("site industriel")
        assert route == {"sector": "industrie", "anti_pattern": SECTOR_ANTI_PATTERNS["industrie"]}

    def test_seven_other_sectors_have_no_anti_pattern(self):
        # On ne fabrique pas les 7 anti-patterns manquants du corps de l'issue.
        sample_text = {
            "cyber": "cybersécurité",
            "data": "data science",
            "ingenierie": "ingénierie",
            "automobile": "équipementier auto",
            "pharma": "pharmaceutique",
            "infrastructure": "infrastructure réseau",
            "conseil_metier": "conseil métier",
        }
        for key in COLD_ACCOUNT_SECTORS:
            if key in ("environnement", "industrie"):
                continue
            assert sector_route(sample_text[key]) == {"sector": key, "anti_pattern": None}


class TestRecette:
    def test_nine_scenarios_verbatim(self):
        # #2314.38 — source : issue #2314, section RECETTE.
        assert RECIPE_SCENARIOS == (
            "aucun contact",
            "grand groupe",
            "PME",
            "site industriel",
            "filiale",
            "secteur environnement",
            "secteur automobile",
            "achats centralisés",
            "donnée faible",
        )


class TestPlaybookBlock:
    def test_empty_without_sales_context(self):
        assert cold_account_playbook_block(None) == ""

    def test_empty_when_relationship_is_not_froid(self):
        sc = {"relationship": {"state": "client_actif"}}
        assert cold_account_playbook_block(sc) == ""

    def test_populated_on_froid_and_bans_the_generic_answer(self):
        sc = {"relationship": {"state": "froid"}}
        block = cold_account_playbook_block(sc)
        assert GENERIC_ANSWER_BANNED in block
        for target in FIRST_EXCHANGE_TARGETS:
            assert target in block
        for question in PERSONA_QUESTIONS.values():
            assert question in block

    def test_includes_sector_route_when_sector_matches(self):
        sc = {"relationship": {"state": "froid"}}
        block = cold_account_playbook_block(sc, raw_sector="site industriel")
        assert "industrie" in block
        assert "méthodes usine" in block

    def test_silent_on_sector_when_no_match(self):
        sc = {"relationship": {"state": "froid"}}
        block = cold_account_playbook_block(sc, raw_sector="agroalimentaire")
        assert "Route sectorielle" not in block
