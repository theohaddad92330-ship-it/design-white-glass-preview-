"""#2939 (#2174.49-53) — LE GOLDEN SET DE LA RECETTE : cinq briefs d'exemple,
chacun avec le brouillon ATTENDU.

─────────────────────────────────────────────────────────────────────────────
POURQUOI CE FICHIER, À CÔTÉ DE `test_need_compiler.py`
─────────────────────────────────────────────────────────────────────────────
`test_need_compiler.py` tient les RÈGLES du compilateur, une par une (une
citation introuvable, une offre d'emploi, un tableur refusé…). Ce fichier tient
la RECETTE (#2174.49-53) : cinq briefs REPRÉSENTATIFS d'un usage réel — un
e-mail, un compte rendu de réunion, une transcription, une fiche CRM, une
offre d'emploi — chacun avec le brouillon qu'un commercial doit voir en sortie.

⚠️ **Déterministe, sans réseau.** Un « brief d'exemple » ici est déjà ce qu'un
modèle aurait dû en extraire (des `statements` cités) — pas le texte brut.
Faire lire le texte brut par Claude dans un test de CI produirait un résultat
non reproductible, exactement l'inverse d'un golden set. La lecture RÉELLE par
un modèle est testée ailleurs (`test_need_compile_text.py`, avec `call_claude`
MOQUÉ) ; ici, c'est `compile_need` lui-même qui est tenu à un résultat FIXE.

Les cinq briefs couvrent, chacun, une intention de la recette :
1. un besoin bien compris (#2174.50 — « brief libre transformé avec preview ») ;
2. must-have et nice-to-have séparés (#2174.51, cf. #2174.20) ;
3. un besoin refusé par manque de citation (aucune donnée inventée, #2174.52) ;
4. une offre d'emploi qui NE devient PAS une mission de régie toute seule ;
5. un besoin RAPPORTÉ (compte rendu) avec une inconnue bloquante nommée.
"""

from __future__ import annotations

from app.services.compilers.need_compiler import compile_need

GOLDEN_BRIEFS: list[dict] = [
    {
        "name": "email_bien_compris",
        "input": {
            "source": {"kind": "email", "locator": "fil « Besoin DevOps »", "stated_at": "2026-09-20"},
            "company": "Decathlon",
            "confirmation_level": "confirme_par_le_client",
            "statements": [
                {
                    "field": "work_to_do",
                    "value": "reprendre la supervision de la plateforme de paiement et fiabiliser les alertes",
                    "excerpt": "il faut reprendre la supervision de la plateforme de paiement et fiabiliser les alertes",
                    "confidence": "explicite",
                },
                {
                    "field": "expected_outcome",
                    "value": "zéro incident de paiement non détecté sous 5 minutes",
                    "excerpt": "on veut zéro incident de paiement non détecté sous 5 minutes",
                    "confidence": "explicite",
                },
                {
                    "field": "skills",
                    "value": [{"term": "Kubernetes", "required": True}, {"term": "Prometheus", "required": True}],
                    "excerpt": "il faut du Kubernetes et du Prometheus",
                    "confidence": "explicite",
                },
                {
                    "field": "target_tjm_cents",
                    "value": 60000,
                    "excerpt": "budget autour de 600 euros par jour",
                    "confidence": "deduit",
                },
            ],
        },
        "expected_fields": {
            "work_to_do": "reprendre la supervision de la plateforme de paiement et fiabiliser les alertes",
            "expected_outcome": "zéro incident de paiement non détecté sous 5 minutes",
            "target_tjm_cents": 60000,
        },
        "expected_not_understood": [],
        "expected_clarification": None,
    },
    {
        "name": "compte_rendu_must_have_nice_to_have",
        "input": {
            "source": {"kind": "meeting_report", "locator": "notes du 22/09", "stated_at": "2026-09-22"},
            "company": "Decathlon",
            "confirmation_level": "rapporte",
            "statements": [
                {
                    "field": "work_to_do",
                    "value": "migrer l'entrepôt de données vers Snowflake",
                    "excerpt": "il faut migrer l'entrepôt de données vers Snowflake",
                    "confidence": "explicite",
                },
                {
                    "field": "expected_outcome",
                    "value": "les rapports mensuels tournent en moins de dix minutes",
                    "excerpt": "objectif : les rapports mensuels tournent en moins de dix minutes",
                    "confidence": "explicite",
                },
                {
                    "field": "skills",
                    "value": [
                        {"term": "Snowflake", "required": True},
                        {"term": "dbt", "required": False},
                    ],
                    "excerpt": "Snowflake est indispensable, dbt serait un plus",
                    "confidence": "explicite",
                },
            ],
        },
        "expected_fields": {
            "work_to_do": "migrer l'entrepôt de données vers Snowflake",
            "expected_outcome": "les rapports mensuels tournent en moins de dix minutes",
        },
        "expected_not_understood": [],
        "expected_clarification": None,
        # #2174.51 — la SÉPARATION doit survivre à la compilation : `required`
        # tient le must-have/nice-to-have, pas un second champ.
        "expected_skill_buckets": {"Snowflake": True, "dbt": False},
    },
    {
        "name": "transcription_sans_donnee_inventee",
        "input": {
            "source": {"kind": "transcript", "locator": "appel du 23/09", "stated_at": "2026-09-23"},
            "company": "Decathlon",
            "confirmation_level": "hypothese",
            "statements": [
                {
                    # #2174.52 — AUCUNE citation retrouvable pour ce montant :
                    # `compile_need` doit l'ÉCARTER, jamais l'inventer.
                    "field": "target_tjm_cents",
                    "value": 700 * 100,
                    "excerpt": "",
                    "confidence": "incertain",
                },
                {
                    "field": "location",
                    "value": "Lille",
                    "excerpt": "ça se passerait plutôt à Lille",
                    "confidence": "deduit",
                },
            ],
        },
        "expected_fields": {"location": "Lille"},
        # `target_tjm_cents` n'apparaît nulle part : sans excerpt, l'énoncé est
        # écarté avant même d'atteindre les champs remplis.
        "expected_absent_fields": ["target_tjm_cents"],
        "expected_dropped_reasons": {"target_tjm_cents": "sans_extrait"},
        # #2174.77 — sans le travail, le résultat ni les critères, ce besoin
        # n'est PAS compris.
        "expected_not_understood": ["work_to_do", "expected_outcome", "skills"],
    },
    {
        "name": "offre_emploi_ne_se_convertit_pas_seule",
        "input": {
            "source": {"kind": "job_posting", "locator": "offre publiée le 24/09", "stated_at": "2026-09-24"},
            "company": "Decathlon",
            "confirmation_level": "hypothese",
            "statements": [
                {
                    "field": "title",
                    "value": "Ingénieur data confirmé",
                    "excerpt": "Ingénieur data confirmé — CDI",
                    "confidence": "explicite",
                },
                {
                    # #2322.71 — une offre d'emploi ne devient pas une mission
                    # de régie toute seule : ce statement doit être ÉCARTÉ.
                    "field": "contract_kind",
                    "value": "regie",
                    "excerpt": "poste en CDI, régie possible",
                    "confidence": "incertain",
                },
            ],
        },
        "expected_fields": {"title": "Ingénieur data confirmé"},
        "expected_absent_fields": ["contract_kind"],
        "expected_dropped_reasons": {"contract_kind": "conversion_interdite"},
        "expected_not_understood": ["work_to_do", "expected_outcome", "skills"],
    },
    {
        "name": "rapporte_avec_inconnue_bloquante",
        "input": {
            "source": {"kind": "field_notes", "locator": "notes terrain du 25/09", "stated_at": "2026-09-25"},
            "company": "Decathlon",
            "confirmation_level": "rapporte",
            "statements": [
                {
                    "field": "expected_outcome",
                    "value": "le support client répond en moins de deux heures",
                    "excerpt": "il faut que le support réponde en moins de deux heures",
                    "confidence": "explicite",
                },
            ],
            # #2174.36 — L'INCONNUE BLOQUANTE, nommée, jamais inventée : le
            # travail réel n'a jamais été dit, et la question le porte.
            "unknowns": [
                {
                    "field": "work_to_do",
                    "question": "Concrètement, quel travail cette personne aurait-elle à faire ?",
                }
            ],
        },
        "expected_fields": {"expected_outcome": "le support client répond en moins de deux heures"},
        "expected_not_understood": ["work_to_do", "skills"],
        "expected_clarification_field": "work_to_do",
        "expected_clarification_reason": "blocking_unknown",
    },
]


class TestGoldenSet:
    def test_le_jeu_a_cinq_briefs(self) -> None:
        assert len(GOLDEN_BRIEFS) == 5

    def test_chaque_brief_rend_le_brouillon_attendu(self) -> None:
        for brief in GOLDEN_BRIEFS:
            result = compile_need(brief["input"])
            assert "error" not in result, f"{brief['name']} : {result.get('error')}"
            compiled = result["compiled"]
            fields = {entry["field"]: entry["value"] for entry in compiled["fields"]}

            for field, expected_value in brief["expected_fields"].items():
                assert fields.get(field) == expected_value, f"{brief['name']} · {field}"

            for field in brief.get("expected_absent_fields", []):
                assert field not in fields, f"{brief['name']} · {field} ne devrait pas être rempli"

            assert compiled["not_understood"] == brief["expected_not_understood"], brief["name"]

            if "expected_skill_buckets" in brief:
                skills = {skill["term"]: skill["required"] for skill in fields["skills"]}
                assert skills == brief["expected_skill_buckets"], brief["name"]

            if "expected_clarification" in brief:
                assert compiled["clarification"] == brief["expected_clarification"], brief["name"]
            if "expected_clarification_field" in brief:
                assert compiled["clarification"] is not None, brief["name"]
                assert compiled["clarification"]["field"] == brief["expected_clarification_field"], brief["name"]
                assert compiled["clarification"]["reason"] == brief["expected_clarification_reason"], brief["name"]

    def test_ce_qui_est_ecarte_porte_sa_raison(self) -> None:
        """#2174.52 — aucune donnée inventée : ce qui est écarté PORTE SA RAISON,
        jamais silencieusement amputé."""
        for brief in GOLDEN_BRIEFS:
            expected_reasons = brief.get("expected_dropped_reasons")
            if not expected_reasons:
                continue
            result = compile_need(brief["input"])
            dropped_by_field = {entry["field"]: entry["reason"] for entry in result["dropped"]}
            for field, reason in expected_reasons.items():
                assert dropped_by_field.get(field) == reason, f"{brief['name']} · {field}"
