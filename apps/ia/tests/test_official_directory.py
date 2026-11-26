"""La page « équipe / dirigeants » du site officiel comme SECONDE source.

Constat de l'audit (`agent_docs/audit-org-mapping-2026-07-22.md`) : avec une seule
preuve par personne, la formule p14 plafonne à 70 et la vue « organigramme
vérifié » (seuil 90) reste vide pour toujours. Il manque une source de NATURE
différente, officielle et datable. Le produit scrape déjà le site du compte : ce
module lit ces pages déjà payées et en extrait les rattachements NOMMÉS.

Règle n°1 : zéro donnée inventée. Une personne n'est retenue que si son nom ET sa
fonction sont écrits textuellement sur la page. Aucune hiérarchie n'est déduite de
l'ordre d'affichage, de la taille des photos ou de la position dans le DOM.
"""

from __future__ import annotations

from app.services.official_directory import (
    collect_official_directory,
    extract_officials,
    is_team_page,
)

_COLLECTED = "2026-07-22"


# ── Détection de la page ──────────────────────────────────────────────────────


def test_a_team_or_governance_page_is_recognised_by_its_url():
    assert is_team_page("https://www.acme.fr/groupe/gouvernance")
    assert is_team_page("https://www.acme.fr/notre-equipe")
    assert is_team_page("https://www.acme.fr/en/leadership-team")
    assert is_team_page("https://www.acme.fr/organigramme")
    assert is_team_page("https://www.acme.fr/comite-de-direction")


def test_a_page_that_is_not_about_people_is_not_a_team_page():
    assert not is_team_page("https://www.acme.fr/produits/offre-cloud")
    assert not is_team_page("https://www.acme.fr/mentions-legales")
    assert not is_team_page("")


def test_a_third_party_page_is_never_official_even_when_it_looks_like_a_team_page():
    """La force de la source vient de l'éditeur : le site DU compte. Un annuaire
    tiers qui publie « la direction d'Acme » n'est pas une source officielle."""
    pages = [
        {
            "url": "https://www.societe-annuaire.com/acme/dirigeants",
            "markdown": "## Jean Dupont\nDirecteur Général\n",
        }
    ]
    assert collect_official_directory(pages, website="https://www.acme.fr", collected_at=_COLLECTED) == []


# ── Extraction : la personne doit être NOMMÉE sur la page ─────────────────────


def test_a_name_followed_by_its_title_on_the_next_line_is_extracted():
    markdown = """
## Notre direction

### Jean Dupont
Directeur Général

### Marie Martin
Directrice des Systèmes d'Information
"""
    people = extract_officials(markdown, url="https://www.acme.fr/gouvernance", collected_at=_COLLECTED)
    assert [(p["fullName"], p["title"]) for p in people] == [
        ("Jean Dupont", "Directeur Général"),
        ("Marie Martin", "Directrice des Systèmes d'Information"),
    ]


def test_a_name_and_its_title_on_the_same_line_are_extracted():
    markdown = (
        "- **Paul Durand** — Directeur Financier\n"
        "- Sophie Bernard, Responsable des Achats\n"
        "- [Luc Petit](/equipe/luc-petit) | Chief Technology Officer\n"
    )
    people = extract_officials(markdown, url="https://www.acme.fr/equipe", collected_at=_COLLECTED)
    assert [(p["fullName"], p["title"]) for p in people] == [
        ("Paul Durand", "Directeur Financier"),
        ("Sophie Bernard", "Responsable des Achats"),
        ("Luc Petit", "Chief Technology Officer"),
    ]


def test_the_title_may_come_first():
    markdown = "Directrice Générale : Claire Moreau\n"
    people = extract_officials(markdown, url="https://www.acme.fr/equipe", collected_at=_COLLECTED)
    assert [(p["fullName"], p["title"]) for p in people] == [("Claire Moreau", "Directrice Générale")]


def test_every_extraction_carries_its_url_and_its_collection_date():
    """Sans URL ni date, la source ne vaut pas ses +30 : elle n'est ni citable ni
    datable. C'est tout l'intérêt de la collecte."""
    people = extract_officials(
        "## Jean Dupont\nDirecteur Général\n",
        url="https://www.acme.fr/gouvernance",
        collected_at=_COLLECTED,
    )
    assert people[0]["url"] == "https://www.acme.fr/gouvernance"
    assert people[0]["collectedAt"] == _COLLECTED


# ── Ce qui n'est PAS extrait ─────────────────────────────────────────────────


def test_a_name_without_a_named_function_is_not_extracted():
    """Aucune fonction écrite = aucun rattachement prouvé. On ne déduit pas un
    poste de la mise en page."""
    markdown = "## Jean Dupont\n\nPassionné de voile et de management.\n"
    assert extract_officials(markdown, url="https://www.acme.fr/equipe", collected_at=_COLLECTED) == []


def test_a_function_without_a_name_is_not_extracted():
    markdown = "Directeur Général\n\nDirectrice Financière\n"
    assert extract_officials(markdown, url="https://www.acme.fr/equipe", collected_at=_COLLECTED) == []


def test_a_company_name_is_never_mistaken_for_a_person():
    markdown = "- Acme Industries — Direction Générale\n- Groupe Martin, Direction Financière\n"
    assert extract_officials(markdown, url="https://www.acme.fr/equipe", collected_at=_COLLECTED) == []


def test_boilerplate_and_navigation_never_produce_a_person():
    markdown = """
[Mentions légales](/legal) | [Politique de confidentialité](/privacy)

Copyright 2026 Acme. Tous droits réservés.

Contactez notre Direction Générale au 01 23 45 67 89.
"""
    assert extract_officials(markdown, url="https://www.acme.fr/equipe", collected_at=_COLLECTED) == []


def test_the_same_person_listed_twice_on_a_page_is_returned_once():
    markdown = "## Jean Dupont\nDirecteur Général\n\n**Jean Dupont** — Directeur Général\n"
    people = extract_officials(markdown, url="https://www.acme.fr/equipe", collected_at=_COLLECTED)
    assert len(people) == 1


def test_a_bio_sentence_names_its_person_without_swallowing_the_sentence():
    markdown = "Jean Dupont, Directeur Général, a rejoint le groupe en 2010.\n"
    people = extract_officials(markdown, url="https://www.acme.fr/gouvernance", collected_at=_COLLECTED)
    assert [(p["fullName"], p["title"]) for p in people] == [("Jean Dupont", "Directeur Général")]


def test_a_former_executive_is_not_presented_as_current():
    """« ancien / ex » n'ouvre aucun libellé de fonction : la page ne dit pas que
    cette personne dirige aujourd'hui."""
    markdown = "Marc Ancien, ancien Directeur Général, a quitté le groupe.\n"
    assert extract_officials(markdown, url="https://www.acme.fr/gouvernance", collected_at=_COLLECTED) == []


def test_a_realistic_governance_page_yields_its_executives_and_nothing_else():
    """Forme réelle d'une page gouvernance passée par Firecrawl : navigation,
    tableau markdown, cartes, biographie, bandeau cookies, mentions légales."""
    markdown = """
[Accueil](/) | [Le groupe](/groupe) | [Gouvernance](/groupe/gouvernance)

# Gouvernance

Notre Direction Générale conduit la stratégie du groupe depuis 2018.

## Comité exécutif

| Nom | Fonction |
| --- | --- |
| Élodie Rousseau | Directrice Générale |
| Marc Lefebvre | Directeur Financier |

### Nadia Ben Salah

Directrice des Systèmes d'Information

Nadia Ben Salah, Directrice des Systèmes d'Information, pilote la transformation
numérique du groupe. Elle a été nommée en 2021.

- **Thomas Girard** — Responsable de la Sécurité des Systèmes d'Information

En savoir plus : [Nos engagements](/engagements) · [Contact presse](/presse)

Copyright 2026 Acme Industries. [Mentions légales](/mentions-legales)
"""
    people = extract_officials(markdown, url="https://www.acme.fr/groupe/gouvernance", collected_at=_COLLECTED)
    assert [(p["fullName"], p["title"]) for p in people] == [
        ("Élodie Rousseau", "Directrice Générale"),
        ("Marc Lefebvre", "Directeur Financier"),
        ("Nadia Ben Salah", "Directrice des Systèmes d'Information"),
        ("Thomas Girard", "Responsable de la Sécurité des Systèmes d'Information"),
    ]


# ── Collecte sur les pages déjà scrapées ─────────────────────────────────────


def test_only_pages_of_the_account_own_domain_are_collected():
    pages = [
        {
            "url": "https://www.acme.fr/gouvernance",
            "markdown": "## Jean Dupont\nDirecteur Général\n",
        },
        {
            "url": "https://presse-eco.fr/acme/gouvernance",
            "markdown": "## Faux Profil\nDirecteur Général\n",
        },
    ]
    found = collect_official_directory(pages, website="https://www.acme.fr", collected_at=_COLLECTED)
    assert [p["fullName"] for p in found] == ["Jean Dupont"]


def test_a_subdomain_of_the_account_counts_as_the_official_site():
    pages = [
        {
            "url": "https://corporate.acme.fr/fr/gouvernance",
            "markdown": "## Jean Dupont\nDirecteur Général\n",
        }
    ]
    found = collect_official_directory(pages, website="acme.fr", collected_at=_COLLECTED)
    assert [p["fullName"] for p in found] == ["Jean Dupont"]


def test_a_page_of_the_official_site_that_is_not_about_people_is_skipped():
    pages = [
        {
            "url": "https://www.acme.fr/offres/cloud",
            "markdown": "## Jean Dupont\nDirecteur Général\n",
        }
    ]
    assert collect_official_directory(pages, website="https://www.acme.fr", collected_at=_COLLECTED) == []


# ── Échec gracieux : jamais d'exception, jamais de source fabriquée ──────────


def test_no_website_no_pages_no_markdown_all_yield_nothing():
    assert collect_official_directory([], website="https://www.acme.fr", collected_at=_COLLECTED) == []
    assert collect_official_directory(
        [{"url": "https://www.acme.fr/equipe", "markdown": None}],
        website="https://www.acme.fr",
        collected_at=_COLLECTED,
    ) == []
    # Site inconnu : impossible de savoir quelle page est « officielle » → rien.
    assert collect_official_directory(
        [{"url": "https://www.acme.fr/equipe", "markdown": "## Jean Dupont\nDirecteur Général\n"}],
        website="",
        collected_at=_COLLECTED,
    ) == []


def test_malformed_input_never_raises():
    assert collect_official_directory(None, website="acme.fr", collected_at=_COLLECTED) == []  # type: ignore[arg-type]
    assert collect_official_directory(["nope", 42, {}], website="acme.fr", collected_at=_COLLECTED) == []  # type: ignore[list-item]
    assert extract_officials(None, url="", collected_at=_COLLECTED) == []  # type: ignore[arg-type]


def test_the_collection_is_bounded():
    """Une page annuaire de 500 personnes ne doit pas gonfler le dossier."""
    markdown = "".join(
        f"## Prenom{chr(97 + i // 26)}{chr(97 + i % 26)} Nom{chr(97 + i // 26)}{chr(97 + i % 26)}\n"
        "Directeur Général\n\n"
        for i in range(200)
    )
    people = extract_officials(markdown, url="https://www.acme.fr/equipe", collected_at=_COLLECTED)
    assert 0 < len(people) <= 60
