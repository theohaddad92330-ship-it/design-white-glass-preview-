"""Prestataire détecté par crédit de site — #3095 (call bêta Apricot Labs, 24/09/2026).

Zéro nouveau fournisseur, zéro appel réseau : ce module relit les pages QUE LE
RUN SCRAPE DÉJÀ (`ResearchBundle`) et cherche une mention de crédit ("Site conçu
par X", "Powered by X"…) suivie d'un nom que le référentiel ESN CONNAÎT
(`known_esn_intel`). Sans les deux — la mention ET le nom référencé — aucune
entrée ne sort : un nom libre non référencé n'est jamais une preuve vérifiable.
"""

from __future__ import annotations

from app.services.site_credit_partners import collect_site_credit_partners

_DETECTED_AT = "2026-09-26"


def test_a_footer_credit_naming_a_known_esn_is_detected():
    pages = [
        {
            "url": "https://www.acme.fr",
            "markdown": "# Bienvenue chez Acme\n\n© 2026 Acme — Site conçu par Capgemini\n",
        }
    ]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert len(out) == 1
    assert out[0]["name"] == "Capgemini"
    assert out[0]["detectedAt"] == _DETECTED_AT
    assert "https://www.acme.fr" in out[0]["evidence"]


def test_english_powered_by_credit_is_also_detected():
    pages = [{"url": "https://www.acme.fr/en", "markdown": "Powered by Devoteam — all rights reserved"}]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert [e["name"] for e in out] == ["Devoteam"]


def test_a_name_with_no_credit_marker_nearby_is_not_a_mention():
    """Le nom seul, cité ailleurs sur la page (ex. dans une étude de cas), n'est
    pas une preuve de PRESTATAIRE — sans marqueur de crédit à proximité, ce n'est
    qu'une mention."""
    pages = [{"url": "https://www.acme.fr", "markdown": "Notre client Capgemini a signé un contrat avec nous."}]
    assert collect_site_credit_partners(pages, detected_at=_DETECTED_AT) == []


def test_a_credited_provider_outside_the_referential_is_kept_on_its_credit_proof():
    """#4740 — la borne des 15 ESN est levée, la PREUVE DE CRÉDIT reste : un
    prestataire hors référentiel est retenu parce que la page le crédite
    explicitement, avec une certitude « moyenne » (une seule preuve : il n'est
    pas connu du référentiel)."""
    pages = [{"url": "https://www.acme.fr", "markdown": "© 2026 Acme\nSite réalisé par Studio Web Local"}]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert [e["name"] for e in out] == ["Studio Web Local"]
    assert out[0]["certainty"] == "moyenne"
    assert "https://www.acme.fr" in out[0]["evidence"]


def test_a_known_esn_keeps_the_strong_certainty():
    pages = [{"url": "https://www.acme.fr", "markdown": "Site conçu par Capgemini"}]
    assert collect_site_credit_partners(pages, detected_at=_DETECTED_AT)[0]["certainty"] == "forte"


def test_a_name_guessed_without_a_credit_marker_is_never_retained():
    """Pas de nom deviné depuis une URL ni depuis une mention sans crédit."""
    pages = [
        {"url": "https://www.acme.fr", "markdown": "Notre client Studio Web Local a signé avec nous."},
        {"url": "https://www.acme.fr/a", "markdown": "Voir https://studio-web-local.fr pour plus d'infos."},
    ]
    assert collect_site_credit_partners(pages, detected_at=_DETECTED_AT) == []


def test_a_platform_or_pronoun_after_the_marker_is_not_a_provider():
    """« Powered by WordPress » crédite un outil, « réalisé par nos équipes »
    personne : ni l'un ni l'autre n'est un prestataire."""
    pages = [
        {"url": "https://www.acme.fr", "markdown": "Powered by WordPress"},
        {"url": "https://www.acme.fr/b", "markdown": "Site réalisé par Nos équipes internes"},
        {"url": "https://www.acme.fr/c", "markdown": "développé par le service informatique"},
    ]
    assert collect_site_credit_partners(pages, detected_at=_DETECTED_AT) == []


def test_the_credited_name_stops_at_the_end_of_the_credit_line():
    pages = [
        {"url": "https://www.acme.fr", "markdown": "Conçu par Agence Pixel Nord | Mentions légales | Plan du site"}
    ]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert [e["name"] for e in out] == ["Agence Pixel Nord"]


def test_a_free_name_credited_twice_appears_once():
    pages = [
        {"url": "https://www.acme.fr", "markdown": "Site by Pixel Nord"},
        {"url": "https://www.acme.fr/ml", "markdown": "Réalisé par PIXEL NORD."},
    ]
    assert len(collect_site_credit_partners(pages, detected_at=_DETECTED_AT)) == 1


# ── #4741 — ce que le prestataire fait, SUR PREUVE ─────────────────────────


def test_a_web_agency_credit_is_qualified_web_on_the_words_of_the_page():
    pages = [{"url": "https://www.acme.fr", "markdown": "Site réalisé par Pixel Nord, agence web à Lille"}]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert out[0]["qualification"] == "web"
    assert "agence web" in out[0]["qualificationEvidence"]
    assert "agence web" in out[0]["evidence"]


def test_a_provider_with_no_evidence_of_its_activity_stays_unqualified():
    """Jamais rangé par défaut : ni « web », ni « tout »."""
    pages = [{"url": "https://www.acme.fr", "markdown": "Site réalisé par Pixel Nord"}]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert out[0]["qualification"] == "non_qualifie"
    assert out[0]["qualificationEvidence"] is None


def test_an_unqualified_provider_says_so_in_its_evidence():
    """#4741 — « inconnue » est un état NOMMÉ dans la preuve affichée, jamais un silence ni une supposition."""
    pages = [{"url": "https://www.acme.fr", "markdown": "Site réalisé par Pixel Nord"}]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert "Activité non établie" in out[0]["evidence"]


def test_a_known_esn_is_not_qualified_by_its_name_alone():
    pages = [{"url": "https://www.acme.fr", "markdown": "Site conçu par Capgemini"}]
    assert collect_site_credit_partners(pages, detected_at=_DETECTED_AT)[0]["qualification"] == "non_qualifie"


def test_a_provider_claiming_web_and_infrastructure_is_qualified_full_service():
    pages = [
        {
            "url": "https://www.acme.fr",
            "markdown": "Réalisé par Pixel Nord — création de sites, hébergement et infogérance, développement sur mesure",
        }
    ]
    assert collect_site_credit_partners(pages, detected_at=_DETECTED_AT)[0]["qualification"] == "tout"


def test_a_single_infrastructure_claim_is_qualified_infra():
    pages = [
        {"url": "https://www.acme.fr", "markdown": "Hébergé et réalisé par Pixel Nord, spécialiste de l'hébergement"}
    ]
    assert collect_site_credit_partners(pages, detected_at=_DETECTED_AT)[0]["qualification"] == "infra"


def test_the_same_esn_credited_on_two_pages_appears_once():
    pages = [
        {"url": "https://www.acme.fr", "markdown": "Site conçu par Alten"},
        {"url": "https://www.acme.fr/mentions-legales", "markdown": "Crédits : conçu par Alten"},
    ]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert len(out) == 1


def test_no_pages_yields_no_entries_without_error():
    assert collect_site_credit_partners(None, detected_at=_DETECTED_AT) == []
    assert collect_site_credit_partners([], detected_at=_DETECTED_AT) == []


def test_a_page_with_unreadable_markdown_is_skipped_gracefully():
    pages = [{"url": "https://www.acme.fr", "markdown": None}, {"url": "", "markdown": "Site conçu par Alten"}]
    assert collect_site_credit_partners(pages, detected_at=_DETECTED_AT) == []


# --- #4740 — l'entrée porte la PAGE et la PHRASE qui la prouvent ; la société est nommée ---


def test_the_evidence_quotes_the_credit_sentence_of_the_page():
    pages = [
        {"url": "https://www.acme.fr", "markdown": "© 2026 Acme\nSite réalisé par Studio Web Local\nMentions légales"}
    ]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert "https://www.acme.fr" in out[0]["evidence"]
    assert "Site realise par Studio Web Local" in out[0]["evidence"]
    assert "Mentions légales" not in out[0]["evidence"]


def test_a_known_esn_evidence_quotes_the_credit_sentence_too():
    pages = [{"url": "https://www.acme.fr", "markdown": "© 2026 Acme — Site conçu par Capgemini | Plan du site"}]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert "Site concu par Capgemini" in out[0]["evidence"]
    assert "Plan du site" not in out[0]["evidence"]


def test_the_company_is_named_with_its_legal_form_when_the_credit_line_gives_it():
    pages = [{"url": "https://www.acme.fr", "markdown": "Site réalisé par Pixel Forge SAS - Paris"}]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert out[0]["name"] == "Pixel Forge SAS"


def test_the_credit_link_target_names_the_provider_site_in_the_evidence():
    pages = [
        {
            "url": "https://www.acme.fr",
            "markdown": "Site réalisé par [Pixel Forge](https://www.pixel-forge.fr/agence?utm=1)",
        }
    ]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert out[0]["name"] == "Pixel Forge"
    assert "pixel-forge.fr" in out[0]["evidence"]


def test_a_credit_link_to_the_account_own_site_is_not_the_provider_site():
    pages = [{"url": "https://www.acme.fr", "markdown": "Site réalisé par [Pixel Forge](https://www.acme.fr/credits)"}]
    out = collect_site_credit_partners(pages, detected_at=_DETECTED_AT)
    assert "acme.fr/credits" not in out[0]["evidence"]
    assert out[0]["name"] == "Pixel Forge"
