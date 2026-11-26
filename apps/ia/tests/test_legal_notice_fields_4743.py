"""#4743.2/.5 — les mentions légales : on garde ce qui est publié, tel que publié, rien n'est déduit."""

from __future__ import annotations

from app.services.legal_notice_fields import extract_legal_notice_fields

LEGAL = """# Mentions légales

Raison sociale : Acme Industries
Forme juridique : Société par actions simplifiée
Capital social : 1 000 000 euros
RCS Paris B 123 456 789
Siège social : 12 rue de la Paix, 75002 Paris
Directeur de la publication : Jeanne Martin, Présidente
Hébergeur : OVH SAS, 2 rue Kellermann, 59100 Roubaix
"""

NO_LEGAL = "# Notre offre\n\nAcme accompagne ses clients. Capital humain et RCS de qualité."


def _page(url: str, md: str) -> dict[str, str]:
    return {"url": url, "markdown": md}


def test_a_legal_page_yields_the_published_fields_verbatim() -> None:
    out = extract_legal_notice_fields([_page("https://acme.fr/mentions-legales", LEGAL)], detected_at="2026-11-02")
    fields = {f["field"]: f for f in out}
    assert fields["raison_sociale"]["value"] == "Acme Industries"
    assert fields["forme_juridique"]["value"] == "Société par actions simplifiée"
    assert fields["capital"]["value"] == "1 000 000 euros"  # ni converti ni normalisé
    assert fields["immatriculation"]["value"] == "RCS Paris B 123 456 789"
    assert fields["siege"]["value"].startswith("12 rue de la Paix")
    assert fields["dirigeant"]["value"] == "Jeanne Martin, Présidente"
    assert fields["hebergeur"]["value"].startswith("OVH SAS")
    assert all(f["sourceUrl"] == "https://acme.fr/mentions-legales" for f in out)
    assert all(f["detectedAt"] == "2026-11-02" for f in out)


def test_a_page_without_legal_notice_yields_no_field_at_all() -> None:
    assert extract_legal_notice_fields([_page("https://acme.fr/offre", NO_LEGAL)], detected_at="2026-11-02") == []
    # même une page à l'URL légale, sans aucun champ publié : rien n'est inventé
    assert extract_legal_notice_fields([_page("https://acme.fr/mentions-legales", "Bientôt.")], detected_at="x") == []


def test_a_missing_field_is_absent_not_empty_and_the_legal_form_is_never_guessed_from_the_name() -> None:
    md = "Raison sociale : Acme SAS\nHébergeur : Scaleway"
    out = extract_legal_notice_fields([_page("https://acme.fr/mentions-legales", md)], detected_at="2026-11-02")
    assert {f["field"] for f in out} == {"raison_sociale", "hebergeur"}  # « SAS » dans le nom ≠ forme publiée
    assert all(f["value"] for f in out)


def test_a_cgu_page_is_not_a_legal_notice() -> None:
    md = "Raison sociale : Acme\nHébergeur : OVH"
    assert extract_legal_notice_fields([_page("https://acme.fr/cgu", md)], detected_at="2026-11-02") == []
