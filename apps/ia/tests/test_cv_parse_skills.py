"""#3811.2 / #3811.3 — compétences d'un CV dont les compétences sont en tableau.

Un dossier de compétences exporté d'un autre outil : le tableau
« catégorie | colonne | colonne » sort, selon l'extracteur, soit en lignes
entrelacées (docx), soit détaché de son titre et semé au milieu des expériences,
un terme par ligne (PDF). Le modèle recompose alors un extrait
(« Spring, NestJS, … ») qui n'existe nulle part à l'identique.

Fixtures ANONYMISÉES : personne et entreprises fictives.
"""

from __future__ import annotations

from app.routers.cv import _validate_fields

CV_TABLE_DOCX = """Compétences
Développement
Spring NestJS C/C++
VueJS Typescript CSS
Qualité
Code review
Cucumber / Gherkin
Base de données
MySQL
PostgreSQL
Devops
docker
kubernetes
Expériences
Acme Corp
Développeur fullstack
"""

CV_TABLE_PDF = """Compétences
Formations
Expériences

Acme Corp
Depuis Mai 2022
Développeur FullStack
Missions
Spring
NestJS
C/C++
VueJS
Typescript
CSS
Code review
Playwright
MySQL
PostgreSQL
docker kubernetes
Au sein de l'équipe Retail (2024/2025):
"""

RECOMPOSED = "Spring, NestJS, VueJS, Typescript, PostgreSQL"


def _ask(cv: str, value: list[str], excerpt: str = RECOMPOSED) -> dict:
    fields = _validate_fields(
        [{"detection": "skills", "value": value, "confidence": 0.8, "source_excerpt": excerpt}],
        cv,
    )
    return next(field for field in fields if field["detection"] == "skills")


def test_3811_2_recomposed_excerpt_over_a_pdf_table_keeps_the_skills_read() -> None:
    skills = _ask(CV_TABLE_PDF, ["Spring", "VueJS", "NestJS", "PostgreSQL"])
    assert skills["value"] == ["Spring", "VueJS", "NestJS", "PostgreSQL"]
    assert skills["excerpt_offset"] is not None and skills["excerpt_offset"] >= 0


def test_3811_3_recomposed_excerpt_over_a_docx_table_keeps_the_skills_read() -> None:
    skills = _ask(CV_TABLE_DOCX, ["Spring", "VueJS", "NestJS", "PostgreSQL"])
    assert skills["value"] == ["Spring", "VueJS", "NestJS", "PostgreSQL"]


def test_3811_2_a_skill_absent_from_the_text_is_never_kept() -> None:
    # Pas de donnée inventée : « Java » ne figure pas, seule « Spring » est lue.
    assert _ask(CV_TABLE_PDF, ["Spring", "Java", "Rust"])["value"] == ["Spring"]


def test_3811_2_a_label_only_inside_a_longer_word_does_not_count() -> None:
    # « Java » ne se lit pas dans « JavaScript » ; « Go » pas dans « Google ».
    cv = "Compétences\nJavaScript\nGoogle Cloud\n"
    assert _ask(cv, ["Java", "Go"])["value"] is None


def test_3811_2_no_skill_read_in_the_text_gives_the_question_back() -> None:
    assert _ask(CV_TABLE_PDF, ["Haskell"])["value"] is None


def test_3811_5_composed_skill_is_one_label() -> None:
    cv = "Compétences\nGestion de projet\nJava\n"
    assert _ask(cv, ["gestion de projet"])["value"] == ["gestion de projet"]


# #3811.7 — mesuré en prod (IA 4aa0cf5858, CV réel, deux passages sur le même
# PDF) : le blocage d'origine est levé (plus de `null`), mais le modèle
# recompose un bloc `skills` qui mélange intitulés de catégorie du tableau et
# phrases de mission. Les deux fixtures ci-dessous REJOUENT les deux passages
# mesurés, avec une réponse de modèle SIMULÉE (aucun appel Claude).
CV_TABLE_DOCX_WITH_MISSIONS = CV_TABLE_DOCX + (
    "Création d'une gateway de paiement\n"
    "Développement des features du back-office\n"
    "Correction des anomalies de production\n"
)


def test_3811_7_pass_one_only_mission_sentences_keeps_no_skill() -> None:
    # Passage 1 mesuré : `skills` = uniquement des phrases de mission, sans
    # Spring ni VueJS. Le filet doit rendre la question (`value is None`), pas
    # une liste de phrases de mission.
    skills = _ask(
        CV_TABLE_DOCX_WITH_MISSIONS,
        [
            "Création d'une gateway de paiement",
            "Développement des features du back-office",
            "Correction des anomalies de production",
        ],
        excerpt="Création d'une gateway de paiement, Développement des features du back-office",
    )
    assert skills["value"] is None


def test_3811_7_pass_two_category_headings_and_missions_are_dropped() -> None:
    # Passage 2 mesuré : `skills` mélange intitulés de catégorie du tableau
    # (« Développement », « Qualité », « Base de données », « Devops ») et
    # phrases de mission avec les vrais termes. Le filet ne garde QUE les
    # termes.
    skills = _ask(
        CV_TABLE_DOCX_WITH_MISSIONS,
        [
            "Développement",
            "Qualité",
            "Base de données",
            "Devops",
            "Spring",
            "NestJS",
            "VueJS",
            "PostgreSQL",
            "Création d'une gateway de paiement",
            "Développement des features du back-office",
            "Correction des anomalies de production",
        ],
        excerpt="Développement, Qualité, Spring, NestJS, VueJS, PostgreSQL",
    )
    assert skills["value"] == ["Spring", "NestJS", "VueJS", "PostgreSQL"]


def test_3811_2_other_blocks_keep_the_strict_quote_rule() -> None:
    # L'assouplissement ne vaut QUE pour la liste de compétences.
    fields = _validate_fields(
        [
            {
                "detection": "certifications",
                "value": ["Spring"],
                "confidence": 0.8,
                "source_excerpt": "Certifié Spring Professional",
            }
        ],
        CV_TABLE_PDF,
    )
    assert next(f for f in fields if f["detection"] == "certifications")["value"] is None
