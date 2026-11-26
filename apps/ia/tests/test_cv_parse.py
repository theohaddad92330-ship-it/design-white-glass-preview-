"""Le parsing d'un CV avec preuve par champ (PDF 3 §4).

Ce que ces tests protègent : le validateur SERVEUR, pas le prompt. Un champ
sans citation, ou dont la citation ne se retrouve pas dans le CV, ne doit pas
atteindre l'écran de revue — sinon un champ inventé est indistinguable d'un
champ lu, et le recruteur valide les deux du même clic.
"""

from __future__ import annotations

from app.prompts import bellum_cv_parse
from app.routers.cv import _validate_fields

CV = """YANIS BERTHIER — Ingénieur plateforme (8 ans)
EXPÉRIENCE
2023-2026 — Ingénieur fiabilité, plateforme à fort trafic.
COMPÉTENCES
Kubernetes, Prometheus, Go, CI/CD.
"""


def test_keeps_a_field_that_cites_the_cv() -> None:
    fields = _validate_fields(
        [
            {
                "detection": "skills",
                "value": ["Kubernetes", "Go"],
                "confidence": 0.9,
                "source_excerpt": "Kubernetes, Prometheus, Go, CI/CD.",
            }
        ],
        CV,
    )
    skills = next(field for field in fields if field["detection"] == "skills")
    assert skills["value"] == ["Kubernetes", "Go"]
    # L'offset permet de SURLIGNER l'extrait dans le CV au survol : sans lui, la
    # preuve existe mais reste invérifiable d'un coup d'œil.
    assert skills["excerpt_offset"] is not None and skills["excerpt_offset"] >= 0


def test_drops_a_value_asserted_without_a_quote() -> None:
    fields = _validate_fields(
        [{"detection": "job_title", "value": "Directeur technique", "confidence": 0.9, "source_excerpt": ""}],
        CV,
    )
    title = next(field for field in fields if field["detection"] == "job_title")
    assert title["value"] is None


def test_drops_a_quote_that_is_not_in_the_cv() -> None:
    # Citer de mémoire est exactement ce qu'un modèle fait quand il ne trouve
    # pas. On garde la QUESTION (le bloc, à null) plutôt que la réponse.
    fields = _validate_fields(
        [
            {
                "detection": "certifications",
                "value": ["AWS Solutions Architect"],
                "confidence": 0.8,
                "source_excerpt": "Certifié AWS Solutions Architect en 2024",
            }
        ],
        CV,
    )
    certs = next(field for field in fields if field["detection"] == "certifications")
    assert certs["value"] is None


def test_ignores_whitespace_and_case_when_matching_a_quote() -> None:
    fields = _validate_fields(
        [
            {
                "detection": "identity",
                "value": "Yanis Berthier",
                "confidence": 0.95,
                "source_excerpt": "yanis   berthier — ingénieur plateforme",
            }
        ],
        CV,
    )
    identity = next(field for field in fields if field["detection"] == "identity")
    assert identity["value"] == "Yanis Berthier"


def test_always_returns_all_the_blocks_even_when_the_model_skips_them() -> None:
    # « Ce CV ne dit pas où la personne habite » est une information ; la taire
    # ferait croire à un oubli d'affichage.
    fields = _validate_fields([], CV)
    assert len(fields) == len(bellum_cv_parse.DETECTIONS)
    assert all(field["value"] is None for field in fields)


def test_ignores_a_block_the_model_invented() -> None:
    fields = _validate_fields(
        [{"detection": "salary_expectation", "value": "700", "confidence": 1, "source_excerpt": CV[:20]}],
        CV,
    )
    assert all(field["detection"] != "salary_expectation" for field in fields)


def test_the_prompt_forbids_protected_criteria_and_invented_levels() -> None:
    # Les deux familles d'interdits du §4.1 doivent être ÉCRITES dans le prompt.
    # Le validateur ne peut pas rattraper un genre extrait : il ne saurait pas
    # le reconnaître.
    system = bellum_cv_parse.build_system_prompt().lower()
    for forbidden in ["genre", "âge", "date de naissance", "origine", "nationalité", "photo"]:
        assert forbidden in system
    assert "niveau de maîtrise" in system
    assert "tjm" in system


def test_the_prompt_now_asks_for_the_professional_profile_url() -> None:
    # #3935.2 (08/10/2026) — mesuré en prod : l'URL de profil (LinkedIn, Malt…)
    # est souvent écrite dans le CV mais le prompt ne la demandait jamais, donc
    # le modèle ne la citait quasiment jamais — pas parce qu'elle est absente.
    system = bellum_cv_parse.build_system_prompt().lower()
    assert "linkedin" in system
    assert "profil professionnel" in system


def test_the_prompt_forbids_guessing_a_cefr_level_from_a_vague_qualifier() -> None:
    # #3935.2 — « courant »/« bon niveau » ne doivent jamais devenir un niveau
    # CECRL : c'est une évaluation que personne n'a faite.
    system = bellum_cv_parse.build_system_prompt().lower()
    assert "cecrl" in system


def test_the_prompt_asks_experiences_in_the_closed_structured_format() -> None:
    # #3935.2b (lot M07, 09/10) — les expériences s'écrivent désormais dans
    # `consultant_experiences`, découpées par `readExperiencesFromDetection`
    # (@bellum/contracts) sur le format fermé « rôle | entreprise | début | fin |
    # réalisations ». Le prompt doit le demander, et dire qu'un élément non
    # écrit reste VIDE — jamais une année complétée en mois.
    system = bellum_cv_parse.build_system_prompt()
    assert "rôle | entreprise ou client | début | fin | réalisations" in system
    assert "AAAA-MM" in system
    lowered = system.lower()
    assert "une ligne par expérience" in lowered
    assert "reste vide" in lowered


def test_the_prompt_keeps_a_year_only_experience_date_at_the_year() -> None:
    # #3935 (lot P03, décision Louis 09/10) — « 2019 – 2021 » est GARDÉE à
    # l'année : le prompt accepte `AAAA` OU `AAAA-MM` et interdit d'ajouter un
    # mois que le CV n'écrit pas (l'API stocke l'année + une précision `year`).
    system = bellum_cv_parse.build_system_prompt()
    assert "début et fin au format AAAA ou AAAA-MM" in system
    assert "jamais un mois ajouté" in system.lower()


def test_identity_block_can_cite_a_linkedin_url_alongside_the_name() -> None:
    cv = "Alex MARTIN\nLinkedIn : linkedin.com/in/alex-martin\n"
    fields = _validate_fields(
        [
            {
                "detection": "identity",
                "value": "Alex MARTIN, linkedin.com/in/alex-martin",
                "confidence": 0.9,
                "source_excerpt": "Alex MARTIN\nLinkedIn : linkedin.com/in/alex-martin",
            }
        ],
        cv,
    )
    assert _identity(fields)["value"] == "Alex MARTIN, linkedin.com/in/alex-martin"


# #3734 (06/10/2026) — « Non trouvé dans le CV » alors que le nom est la
# PREMIÈRE ligne. Le bloc `identity` porte nom, e-mail, téléphone et ville, qui
# vivent sur des lignes différentes, entourés de libellés collés à la
# ponctuation (`Tél :06…|Email :…`). Le modèle rend un extrait recollé ou
# ré-espacé : introuvable tel quel, et le NOM partait avec le reste.
CV_HEADER = """Alex MARTIN
Consultante GRC & Risk Management (NIST CSF, ISO 27001, NIS 2)
Tél :06 11 22 33 44 |Email :alex.martin@example.com
LinkedIn :linkedin.com/in/alex-martin | Paris / Île-de-France
Profil
Ingénieure en cybersécurité.
"""


def _identity(fields: list[dict]) -> dict:
    return next(field for field in fields if field["detection"] == "identity")


def test_identity_quote_with_respaced_punctuation_is_found() -> None:
    fields = _validate_fields(
        [
            {
                "detection": "identity",
                "value": "Alex MARTIN, 06 11 22 33 44",
                "confidence": 0.95,
                "source_excerpt": "Tél : 06 11 22 33 44 | Email : alex.martin@example.com",
            }
        ],
        CV_HEADER,
    )
    assert _identity(fields)["value"] == "Alex MARTIN, 06 11 22 33 44"


def test_identity_quote_stitched_from_several_lines_is_found_piece_by_piece() -> None:
    fields = _validate_fields(
        [
            {
                "detection": "identity",
                "value": "Alex MARTIN, alex.martin@example.com, Paris",
                "confidence": 0.95,
                "source_excerpt": "Alex MARTIN … Email :alex.martin@example.com … Paris / Île-de-France",
            }
        ],
        CV_HEADER,
    )
    identity = _identity(fields)
    assert identity["value"] == "Alex MARTIN, alex.martin@example.com, Paris"
    assert identity["excerpt_offset"] == 0


def test_a_stitched_quote_with_one_invented_piece_is_still_dropped() -> None:
    # La garde ne s'assouplit pas : CHAQUE morceau doit être lu dans le CV.
    fields = _validate_fields(
        [
            {
                "detection": "identity",
                "value": "Alex MARTIN, Lyon",
                "confidence": 0.9,
                "source_excerpt": "Alex MARTIN … Lyon / Rhône",
            }
        ],
        CV_HEADER,
    )
    assert _identity(fields)["value"] is None


def test_the_offset_points_into_the_RAW_cv_for_highlighting() -> None:
    # L'écran surligne `cv_text[offset:offset + len(extrait)]` : un offset pris
    # dans le texte NORMALISÉ glisse d'un cran à chaque espace doublé.
    cv = "Alex  MARTIN\nConsultante GRC\n"
    fields = _validate_fields(
        [
            {
                "detection": "job_title",
                "value": "Consultante GRC",
                "confidence": 0.9,
                "source_excerpt": "Consultante GRC",
            }
        ],
        cv,
    )
    title = next(field for field in fields if field["detection"] == "job_title")
    assert cv[title["excerpt_offset"] :].startswith("Consultante GRC")


# #3811 — un CV exporté d'un autre SaaS : ligatures, espaces insécables, trait
# d'union conditionnel, césure en fin de ligne, puces. Une citation lue à
# l'identique par un humain doit être retrouvée.
EXPORTED_CV = (
    "COMPÉTENCES\n"
    "• Kubernetes ; Terra­form\n"
    "▪ Ingénierie de ﬁabilité, déve-\nloppement Python\n"
    "Eﬃcacité opérationnelle\n"
)


def _skills(excerpt: str) -> dict:
    fields = _validate_fields(
        [{"detection": "skills", "value": ["Kubernetes"], "confidence": 0.9, "source_excerpt": excerpt}],
        EXPORTED_CV,
    )
    return next(f for f in fields if f["detection"] == "skills")


def test_quote_survives_ligatures_nbsp_and_soft_hyphen() -> None:
    assert _skills("Kubernetes; Terraform")["value"] == ["Kubernetes"]


def test_quote_survives_a_hyphenated_line_break() -> None:
    assert _skills("Ingénierie de fiabilité, développement Python")["value"] == ["Kubernetes"]
    assert _skills("Efficacité opérationnelle")["value"] == ["Kubernetes"]


def test_quote_with_a_bullet_in_the_excerpt_is_found() -> None:
    assert _skills("• Kubernetes ; Terraform")["value"] == ["Kubernetes"]


def test_the_prompt_asks_only_for_sectors_cited_by_the_cv() -> None:
    # #5017.1 — un secteur n'est retenu que si le CV NOMME une expérience chez un
    # client de ce secteur. « DÉDUITS » invitait le modèle à deviner : le secteur
    # affiché sur la fiche (et croisé avec celui du compte) serait une opinion.
    detections = dict(bellum_cv_parse.DETECTIONS)
    instruction = detections["sectors"]
    assert "DÉDUITS" not in instruction
    assert "déduit" not in instruction.lower()
    assert "cité" in instruction.lower()
    assert "jamais deviné" in instruction.lower()
