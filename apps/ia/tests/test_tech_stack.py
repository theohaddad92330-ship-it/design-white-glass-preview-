"""#3204.2 (épopée #3238) — technologies EXPLICITEMENT nommées par une offre."""

from __future__ import annotations

from app.services.tech_stack import derive_technologies


def test_langage_simple_est_reconnu() -> None:
    assert derive_technologies("Développeur Java confirmé") == ["Java"]


def test_plusieurs_technologies_dans_l_ordre_du_catalogue() -> None:
    # "Python" apparaît après "React" dans le texte mais AVANT dans le
    # catalogue — l'ordre rendu est celui du catalogue, déterministe.
    assert derive_technologies("Développeur React / Python") == ["Python", "React"]


def test_marqueur_symbolique_c_sharp() -> None:
    assert derive_technologies("Ingénieur C# .NET") == ["C#", ".NET"]


def test_label_et_detail_combines() -> None:
    assert derive_technologies("Ingénieur cloud", "Stack AWS, Kubernetes, Terraform") == [
        "AWS",
        "Kubernetes",
        "Terraform",
    ]


def test_aucune_technologie_nommee_rend_liste_vide() -> None:
    # "Go" au sens courant ("Go plus loin") ne doit jamais matcher — seule la
    # forme non ambiguë "golang" est reconnue pour ce langage.
    assert derive_technologies("Va plus loin dans ta carrière") == []
    assert derive_technologies(None) == []
    assert derive_technologies("") == []


def test_javascript_ne_matche_pas_java_ni_inversement() -> None:
    assert derive_technologies("Développeur JavaScript") == ["JavaScript"]
    assert derive_technologies("Développeur Java") == ["Java"]
