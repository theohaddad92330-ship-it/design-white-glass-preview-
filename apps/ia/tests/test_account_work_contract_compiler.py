"""#2300 LAU-FINAL-041 — LE CONTRAT DE TRAVAIL DE COMPTE.

Registre : `.claude/notes/registre-2026-09-18-chat-account-work-contract.md`.
Mesuré le 22/09/2026 : `git grep -ln -E 'def compile[A-Za-z_]*\\('` ne rendait
RIEN — aucun compilateur n'existait, malgré 34 fonctions dans `chat_tools.py`.
Ce module compile en UN objet nommé l'objectif canonique (dix-sept valeurs,
absentes avant ce lot) et les champs internes du contrat marqués `retenu`.

Prior art : `apps/ia/app/models/request_intent_contract.py` (#2257) nomme des
champs `NON PRODUIT` sans les inventer — même discipline ici : un champ non
fourni est OMIS du contrat, jamais mis à `null` ou à une valeur inventée
(doctrine « jamais de donnée fictive », GA-18/GA-19).
"""

from __future__ import annotations

from app.services.compilers.account_work_contract import (
    CANONICAL_ACCOUNT_GOALS,
    canonical_goals_catalog,
    compile_account_work_contract,
    identify_canonical_goal,
)


class TestCanonicalCatalog:
    def test_dix_sept_objectifs_canoniques_ids_uniques(self) -> None:
        # 2300.1-2300.17 — le catalogue nomme les DIX-SEPT objectifs de la
        # demande, y compris les quatre déjà couverts ailleurs (référencés,
        # jamais réimplémentés).
        assert len(CANONICAL_ACCOUNT_GOALS) == 17
        ids = [goal.id for goal in CANONICAL_ACCOUNT_GOALS]
        assert len(ids) == len(set(ids))

    def test_chaque_objectif_porte_un_libelle_fr_et_en(self) -> None:
        # Compagnon FR/EN (règle i18n permanente) : chaque objectif est
        # nommable dans les deux langues, jamais un doublon copié-collé.
        for goal in CANONICAL_ACCOUNT_GOALS:
            assert goal.label_fr.strip()
            assert goal.label_en.strip()
            assert goal.label_fr != goal.label_en

    def test_les_quatre_deja_la_referencent_leur_mecanisme_existant(self) -> None:
        # 2300.7 / 2300.11 / 2300.16 / 2300.17 — « déjà là » au registre :
        # nommés ici pour un catalogue complet, jamais réimplémentés (GA-26).
        already_covered = {goal.id: goal.already_covered_by for goal in CANONICAL_ACCOUNT_GOALS}
        covered_ids = [gid for gid, tool in already_covered.items() if tool]
        assert len(covered_ids) == 4

    def test_catalogue_publie_omet_le_mecanisme_interne(self) -> None:
        catalog = canonical_goals_catalog()
        assert len(catalog) == 17
        for entry in catalog:
            assert set(entry) == {"id", "label_fr", "label_en"}


class TestIdentifyCanonicalGoal:
    def test_aucun_texte_ne_rend_rien_jamais_devine(self) -> None:
        assert identify_canonical_goal(None) is None
        assert identify_canonical_goal("") is None
        assert identify_canonical_goal("   ") is None

    def test_reconnait_ouvrir_un_compte_froid(self) -> None:
        goal = identify_canonical_goal("Je veux ouvrir un compte froid chez ce prospect")
        assert goal is not None
        assert goal.id == "ouvrir_compte_froid"

    def test_reconnait_reactiver_une_relation(self) -> None:
        goal = identify_canonical_goal("On doit réactiver une relation qui s'est refroidie")
        assert goal is not None
        assert goal.id == "reactiver_relation"

    def test_insensible_aux_accents_et_a_la_casse(self) -> None:
        goal = identify_canonical_goal("PREPARER UNE REVUE DE COMPTE avant vendredi")
        assert goal is not None
        assert goal.id == "preparer_revue_compte"

    def test_texte_sans_correspondance_ne_rend_rien(self) -> None:
        assert identify_canonical_goal("il fait beau aujourd'hui") is None


class TestCompileAccountWorkContract:
    def test_porte_toujours_l_identifiant_de_compte_qui_attache_au_dossier(self) -> None:
        # 2300.52 — la même clé que le dossier d'analyse (`accounts.id`) :
        # aucune nouvelle table, l'attache existe déjà par ce champ.
        contract = compile_account_work_contract(account_id="acc-1")
        assert contract["account_id"] == "acc-1"

    def test_sans_objectif_le_contrat_dit_non_identifie_et_guide(self) -> None:
        # 2300.56 — le NO-GO explicite : jamais de plan générique sans objectif.
        contract = compile_account_work_contract(account_id="acc-1")
        assert contract["identified"] is False
        assert "guidance" in contract
        assert "objective" not in contract

    def test_objectif_canonique_reconnu_est_porte_et_identifie(self) -> None:
        contract = compile_account_work_contract(account_id="acc-1", raw_goal="préparer un rendez-vous jeudi")
        assert contract["identified"] is True
        assert contract["objective"]["id"] == "preparer_rendez_vous"
        assert "guidance" not in contract

    def test_objectif_libre_non_catalogue_reste_identifie_sans_etre_invente(self) -> None:
        # Un but propre à la conversation, hors catalogue : jamais promu à un
        # id inventé, mais Laura a bien nommé quelque chose — pas de plan
        # générique à empêcher ici.
        contract = compile_account_work_contract(account_id="acc-1", raw_goal="comprendre l'organigramme RH")
        assert contract["identified"] is True
        assert "objective" not in contract
        assert contract["objective_raw"] == "comprendre l'organigramme RH"
        assert "guidance" not in contract

    def test_contract_id_stable_pour_le_meme_compte_et_objectif(self) -> None:
        first = compile_account_work_contract(account_id="acc-1", raw_goal="préparer un renouvellement")
        second = compile_account_work_contract(account_id="acc-1", raw_goal="on doit préparer un renouvellement")
        assert first["contract_id"] == second["contract_id"]

    def test_contract_id_change_avec_l_objectif(self) -> None:
        sans_objectif = compile_account_work_contract(account_id="acc-1")
        avec_objectif = compile_account_work_contract(account_id="acc-1", raw_goal="préparer un renouvellement")
        assert sans_objectif["contract_id"] != avec_objectif["contract_id"]

    def test_champs_internes_absents_sont_omis_jamais_nuls(self) -> None:
        # GA-18/GA-19 — « non mesuré » n'est jamais 0/null : la clé est absente.
        contract = compile_account_work_contract(account_id="acc-1")
        for key in (
            "offer_or_expertise",
            "territory",
            "horizon",
            "expected_result",
            "desired_format",
            "implicit_exclusions",
            "assumptions_provenance",
            "primary_result_kind",
            "secondary_steps",
        ):
            assert key not in contract

    def test_champs_internes_fournis_sont_portes_tels_quels(self) -> None:
        # 2300.22 / 2300.25 / 2300.30 / 2300.32 / 2300.33 / 2300.40-2300.43.
        contract = compile_account_work_contract(
            account_id="acc-1",
            raw_goal="développer ce compte client",
            offer_or_expertise="conseil data",
            territory="Île-de-France",
            horizon="ce trimestre",
            expected_result="un rendez-vous signé",
            desired_format="un e-mail court",
            implicit_exclusions=["hors fonction mondiale"],
        )
        assert contract["offer_or_expertise"] == "conseil data"
        assert contract["territory"] == "Île-de-France"
        assert contract["horizon"] == "ce trimestre"
        assert contract["expected_result"] == "un rendez-vous signé"
        assert contract["desired_format"] == "un e-mail court"
        assert contract["implicit_exclusions"] == ["hors fonction mondiale"]

    def test_exclusions_implicites_filtre_les_entrees_vides(self) -> None:
        contract = compile_account_work_contract(account_id="acc-1", implicit_exclusions=["  ", "", "réel"])
        assert contract["implicit_exclusions"] == ["réel"]

    def test_provenance_des_hypotheses_garde_les_paires_completes(self) -> None:
        # 2300.36 — chaque hypothèse porte sa PROVENANCE, jamais nue.
        contract = compile_account_work_contract(
            account_id="acc-1",
            assumptions=[
                {"assumption": "le compte est en croissance", "source": "message du 20/09"},
                {"assumption": "sans source"},
                {"source": "sans hypothèse"},
                "pas un dict",
            ],
        )
        assert contract["assumptions_provenance"] == [
            {"assumption": "le compte est en croissance", "source": "message du 20/09"}
        ]

    def test_resultat_principal_et_sous_taches_restent_distincts(self) -> None:
        # 2300.44 / 2300.45 — une sous-tâche ne remplace jamais le résultat
        # principal, elle reste nommée à côté.
        contract = compile_account_work_contract(
            account_id="acc-1",
            raw_goal="préparer un rendez-vous",
            primary_result_kind="brief de rendez-vous",
            secondary_steps=["trouver le bon contact"],
        )
        assert contract["primary_result_kind"] == "brief de rendez-vous"
        assert contract["secondary_steps"] == ["trouver le bon contact"]

    def test_sous_taches_vides_sont_omises(self) -> None:
        contract = compile_account_work_contract(account_id="acc-1", secondary_steps=["", "   "])
        assert "secondary_steps" not in contract

    def test_le_catalogue_complet_voyage_toujours_avec_le_contrat(self) -> None:
        contract = compile_account_work_contract(account_id="acc-1")
        assert len(contract["canonical_goals"]) == 17
