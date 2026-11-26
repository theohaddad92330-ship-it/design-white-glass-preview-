"""#2322 — LE COMPILATEUR DE BESOIN, côté service IA.

Le contrat vit en TypeScript (`packages/contracts/src/schemas/need-compilation.ts`) :
c'est lui que l'API et l'écran valident. Ce module-ci est le RUNTIME qui produit
l'objet, et ces tests tiennent ce que le schéma ne peut pas tenir tout seul —
ce que le compilateur fait de ce que le MODÈLE lui a donné.

La règle qui commande tout le fichier : **le modèle propose, le compilateur
vérifie**. Une valeur sans citation ne passe pas. Un champ inconnu ne passe pas.
Une offre d'emploi ne devient pas une mission de régie. Un besoin qu'on n'a pas
compris ne se déclare pas confirmé. Et rien, jamais, n'est écrit en base ici.
"""

from __future__ import annotations

from app.services.compilers.need_compiler import compile_need, identify_source, resolve_account


def _statement(**overrides) -> dict:
    statement = {
        "field": "work_to_do",
        "value": "reprendre les flux EDI fournisseurs",
        "excerpt": "il faut reprendre les flux EDI fournisseurs",
        "locator": "message du 12/09",
        "stated_at": "2026-09-12",
        "confidence": "explicite",
    }
    statement.update(overrides)
    return statement


def _input(**overrides) -> dict:
    payload = {
        "source": {"kind": "email", "locator": "fil « besoin EDI »", "stated_at": "2026-09-12"},
        "company": "Decathlon",
        "statements": [_statement()],
        "confirmation_level": "rapporte",
    }
    payload.update(overrides)
    return payload


class TestLaSource:
    def test_identifie_le_canal_et_le_fichier(self) -> None:
        assert identify_source({"channel": "chat"}) == ("chat_message", None)
        assert identify_source({"filename": "capture.png"}) == ("screenshot", None)
        assert identify_source({"declared_kind": "transcript"}) == ("transcript", None)

    def test_refuse_un_tableur_au_lieu_den_deviner_les_colonnes(self) -> None:
        assert identify_source({"filename": "besoins.xlsx"}) == (None, "tableur")
        result = compile_need(_input(source={"kind": "spreadsheet", "filename": "besoins.csv"}))
        assert "error" in result
        assert "tableur" in result["error"].lower()

    def test_une_source_illisible_ne_sinvente_pas(self) -> None:
        result = compile_need(_input(source={}))
        assert "error" in result


class TestCeQuiNePassePas:
    def test_une_valeur_sans_citation_est_jetee_et_nommee(self) -> None:
        result = compile_need(
            _input(statements=[_statement(), _statement(field="seniority", value="senior", excerpt="")])
        )
        compiled = result["compiled"]
        assert [entry["field"] for entry in compiled["fields"]] == ["work_to_do"]
        assert {"field": "seniority", "reason": "sans_extrait"} in result["dropped"]

    def test_un_champ_inconnu_du_besoin_est_jete(self) -> None:
        result = compile_need(_input(statements=[_statement(), _statement(field="couleur_des_murs")]))
        assert [entry["field"] for entry in result["compiled"]["fields"]] == ["work_to_do"]
        assert {"field": "couleur_des_murs", "reason": "champ_inconnu"} in result["dropped"]

    def test_une_compilation_sans_aucun_champ_est_une_erreur_pas_une_proposition_vide(self) -> None:
        result = compile_need(_input(statements=[_statement(excerpt="")]))
        assert "error" in result

    def test_un_nombre_ecrit_en_lettres_ne_devient_pas_un_nombre(self) -> None:
        result = compile_need(
            _input(statements=[_statement(), _statement(field="headcount", value="deux")])
        )
        assert {"field": "headcount", "reason": "valeur_inattendue"} in result["dropped"]

    def test_un_nombre_ecrit_en_chiffres_se_lit(self) -> None:
        result = compile_need(
            _input(statements=[_statement(), _statement(field="headcount", value="2")])
        )
        valeurs = {entry["field"]: entry["value"] for entry in result["compiled"]["fields"]}
        assert valeurs["headcount"] == 2

    def test_une_valeur_hors_liste_fermee_est_jetee(self) -> None:
        result = compile_need(
            _input(statements=[_statement(), _statement(field="mobility", value="beaucoup")])
        )
        assert {"field": "mobility", "reason": "valeur_inattendue"} in result["dropped"]
        ponctuel = compile_need(
            _input(statements=[_statement(), _statement(field="mobility", value="ponctuel")])
        )
        assert any(entry["field"] == "mobility" for entry in ponctuel["compiled"]["fields"])


class TestCeQuiSeContredit:
    def test_deux_valeurs_differentes_ne_secrasent_pas(self) -> None:
        result = compile_need(
            _input(
                statements=[
                    _statement(),
                    _statement(field="remote", value="full_remote"),
                    _statement(field="remote", value="sur_site", excerpt="présence obligatoire le lundi"),
                ]
            )
        )
        compiled = result["compiled"]
        assert [entry["field"] for entry in compiled["fields"]] == ["work_to_do"]
        assert len(compiled["contradictions"]) == 1
        assert compiled["contradictions"][0]["field"] == "remote"
        assert len(compiled["contradictions"][0]["statements"]) == 2

    def test_une_source_qui_se_repete_ne_se_contredit_pas(self) -> None:
        result = compile_need(
            _input(
                statements=[
                    _statement(),
                    _statement(field="seniority", value="senior"),
                    _statement(field="seniority", value="senior", excerpt="un profil senior"),
                ]
            )
        )
        assert result["compiled"]["contradictions"] == []


class TestLesPersonnes:
    def test_propose_un_decideur_avec_sa_citation(self) -> None:
        result = compile_need(
            _input(
                people=[
                    {
                        "full_name": "Claire Dumas",
                        "title": "DSI",
                        "role": "decideur",
                        "excerpt": "Claire Dumas (DSI) tranchera",
                        "locator": None,
                        "stated_at": None,
                        "confidence": "explicite",
                    }
                ]
            )
        )
        propose = result["compiled"]["proposed_contacts"]
        assert propose[0]["role"] == "decideur"
        assert propose[0]["provenance"]["excerpt"] == "Claire Dumas (DSI) tranchera"

    def test_un_decideur_sans_citation_nest_jamais_propose(self) -> None:
        result = compile_need(
            _input(people=[{"full_name": "Claire Dumas", "role": "decideur", "excerpt": ""}])
        )
        assert result["compiled"]["proposed_contacts"] == []

    def test_un_role_inconnu_nest_pas_propose(self) -> None:
        result = compile_need(
            _input(
                people=[
                    {"full_name": "Claire Dumas", "role": "grand_chef", "excerpt": "Claire tranchera"}
                ]
            )
        )
        assert result["compiled"]["proposed_contacts"] == []


class TestLesNoGo:
    def test_une_offre_demploi_ne_devient_pas_une_regie_toute_seule(self) -> None:
        result = compile_need(
            _input(
                source={"kind": "job_posting", "locator": "annonce du 10/09", "stated_at": "2026-09-10"},
                statements=[_statement(), _statement(field="contract_kind", value="regie")],
            )
        )
        champs = [entry["field"] for entry in result["compiled"]["fields"]]
        assert "contract_kind" not in champs
        assert {"field": "contract_kind", "reason": "conversion_interdite"} in result["dropped"]

    def test_la_meme_regie_venue_dun_email_passe(self) -> None:
        result = compile_need(
            _input(statements=[_statement(), _statement(field="contract_kind", value="regie")])
        )
        champs = [entry["field"] for entry in result["compiled"]["fields"]]
        assert "contract_kind" in champs

    def test_un_besoin_resume_par_un_intitule_nest_jamais_confirme(self) -> None:
        result = compile_need(
            _input(
                statements=[_statement(field="title", value="Data engineer")],
                confirmation_level="confirme_par_le_client",
            )
        )
        compiled = result["compiled"]
        assert compiled["confirmation_level"] == "rapporte"
        assert "work_to_do" in compiled["not_understood"]

    def test_le_statut_est_une_proposition_et_rien_dautre(self) -> None:
        result = compile_need(_input())
        assert result["compiled"]["status"] == "proposition"


class TestLaClarification:
    def test_une_seule_question_et_seulement_si_elle_change_la_suite(self) -> None:
        # Le travail est là, le résultat et les compétences manquent : la
        # question porte sur le premier champ bloquant, pas sur le TJM.
        result = compile_need(
            _input(unknowns=[{"field": "target_tjm_cents", "question": "Quel TJM ?"}])
        )
        clarification = result["compiled"]["clarification"]
        assert clarification is not None
        assert clarification["field"] == "expected_outcome"

    def test_aucune_question_quand_rien_ne_bloque(self) -> None:
        result = compile_need(
            _input(
                statements=[
                    _statement(),
                    _statement(field="expected_outcome", value="des flux fiables"),
                    _statement(field="skills", value=["EDI", "Talend"]),
                ],
                unknowns=[{"field": "target_tjm_cents", "question": "Quel TJM ?"}],
            )
        )
        assert result["compiled"]["clarification"] is None

    def test_une_contradiction_passe_avant_une_inconnue(self) -> None:
        result = compile_need(
            _input(
                statements=[
                    _statement(),
                    _statement(field="remote", value="full_remote"),
                    _statement(field="remote", value="sur_site", excerpt="présence obligatoire"),
                ]
            )
        )
        assert result["compiled"]["clarification"]["field"] == "remote"


class TestLeCompte:
    def test_le_nom_reste_un_nom_tant_quaucun_compte_ne_correspond(self) -> None:
        result = compile_need(_input())
        assert result["compiled"]["account_id"] is None
        assert result["compiled"]["company_hint"] == "Decathlon"

    def test_un_compte_deja_resolu_par_lappelant_est_repris_tel_quel(self) -> None:
        account = "11111111-1111-4111-8111-111111111111"
        result = compile_need(_input(account_id=account))
        assert result["compiled"]["account_id"] == account


class TestResoudreLeCompte:
    """Étape 2 (#2322.16) — miroir exact de la règle TypeScript."""

    CANDIDATS = [
        {"id": "11111111-1111-4111-8111-111111111111", "company_name": "Decathlon"},
        {"id": "22222222-2222-4222-8222-222222222222", "company_name": "Decathlon Digital"},
        {"id": "33333333-3333-4333-8333-333333333333", "company_name": "Leroy Merlin SAS"},
    ]

    def test_reconnait_le_compte_malgre_la_ponctuation_et_la_forme_juridique(self) -> None:
        assert resolve_account("decathlon", self.CANDIDATS)["account_id"] == self.CANDIDATS[0]["id"]
        assert resolve_account("Leroy-Merlin", self.CANDIDATS)["account_id"] == self.CANDIDATS[2]["id"]

    def test_ne_choisit_jamais_le_plus_proche(self) -> None:
        assert resolve_account("Decath", self.CANDIDATS)["account_id"] is None
        deux = [
            self.CANDIDATS[0],
            {"id": "44444444-4444-4444-8444-444444444444", "company_name": "DECATHLON"},
        ]
        resolu = resolve_account("Decathlon", deux)
        assert resolu["account_id"] is None
        assert resolu["ambiguous"] is True
        assert len(resolu["candidate_ids"]) == 2

    def test_sans_nom_rien_nest_resolu(self) -> None:
        assert resolve_account(None, self.CANDIDATS) == {
            "account_id": None,
            "ambiguous": False,
            "candidate_ids": [],
        }
