"""#3935 (12/10) — la QUALITÉ du texte extrait d'un CV est évaluée, pas supposée.

Mesuré en prod : pypdf rend certains CV lettre à lettre (« L a m i s ») ; le
texte n'est pas vide, donc ni l'OCR ni le repli Claude ne partaient, et le
modèle de lecture n'en tirait rien. Données fictives uniquement.
"""

from __future__ import annotations

from app.services.text_quality import (
    assess_text_quality,
    is_acceptable,
    repair_letter_spacing,
)

SPACED = (
    "J e a n\nD U P O N T\n"
    "I n g é n i e u r e   C y b e r s é c u r i t é\n"
    "P a r i s   F r a n c e\n"
    "C o m p é t e n c e s   :   P y t h o n   D o c k e r   K u b e r n e t e s\n"
    "E x p é r i e n c e s   p r o f e s s i o n n e l l e s   d e p u i s   2 0 1 5"
)

CLEAN = (
    "Jean DUPONT\nIngénieur cybersécurité\nParis, France\n"
    "Compétences : Python, Docker, Kubernetes, Terraform, Ansible.\n"
    "Expériences professionnelles : huit ans de missions chez des clients "
    "du secteur bancaire, dont trois à la tête d'une équipe de six personnes.\n"
    "Formation : diplôme d'ingénieur en informatique, spécialité sécurité des systèmes "
    "d'information, suivi d'une certification professionnelle en tests d'intrusion."
)


def test_spaced_text_is_judged_bad() -> None:
    quality = assess_text_quality(SPACED)
    assert not is_acceptable(quality)
    assert "lettre_a_lettre" in quality.reasons


def test_clean_text_is_acceptable_and_names_no_reason() -> None:
    quality = assess_text_quality(CLEAN, pages=1)
    assert is_acceptable(quality)
    assert quality.reasons == []


def test_nearly_empty_multi_page_pdf_is_judged_bad() -> None:
    quality = assess_text_quality("Jean DUPONT\nIngénieur", pages=4)
    assert not is_acceptable(quality)
    assert "quasi_vide" in quality.reasons


def test_short_text_on_one_page_is_also_sparse() -> None:
    # 300 caractères par page est le plancher, même sur une page unique.
    assert "quasi_vide" in assess_text_quality(CLEAN[:150], pages=1).reasons


def test_unreadable_characters_are_judged_bad() -> None:
    text = ("Jean ���� DUPONT ��� ingénieur ���� ") * 8
    quality = assess_text_quality(text)
    assert not is_acceptable(quality)
    assert "illisible" in quality.reasons


def test_repair_glues_letters_single_space_and_splits_words_on_double_space() -> None:
    repaired = repair_letter_spacing(SPACED)
    assert "Jean\nDUPONT" in repaired
    assert "Ingénieure Cybersécurité" in repaired
    assert "Python Docker Kubernetes" in repaired
    assert is_acceptable(assess_text_quality(repaired))


def test_repair_leaves_clean_text_byte_identical() -> None:
    assert repair_letter_spacing(CLEAN) == CLEAN


def test_repair_does_not_touch_a_single_spaced_line_in_clean_text() -> None:
    mixed = CLEAN + "\nJ a v a\n" + CLEAN
    repaired = repair_letter_spacing(mixed)
    assert repaired.count("Jean DUPONT") == 2
