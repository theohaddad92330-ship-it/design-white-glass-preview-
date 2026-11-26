"""#2544.2 — un candidat de Découvrir porte des PERSONNES, avec leur provenance.

## Ce qui a été mesuré, et qui décide de tout

`GET recherche-entreprises.api.gouv.fr/search?q=arquus&departement=58`, le
18/09/2026. La réponse porte bien un bloc `dirigeants` sur CHAQUE ligne de
liste — ce n'était pas une hypothèse, la fixture en garde la forme. Et chaque
entrée y porte : `nom`, `prenoms`, `annee_de_naissance`, `date_de_naissance`,
`qualite`, `nationalite`, `type_dirigeant`.

Trois faits en découlent, et ce sont eux que ces tests tiennent :

1. **AUCUN champ d'adresse, d'établissement ni de SIRET** sur un dirigeant. Le
   mandat est attaché à l'unité légale — au SIREN. Le registre ne permet donc
   PAS de dire « ce dirigeant travaille à Garchizy », et l'affirmer serait une
   donnée inventée. La ligne rendue par Découvrir porte pourtant le SIRET de
   l'établissement de Garchizy (#2544.1) : la tentation est à portée de main, et
   c'est pour cela qu'elle est gardée ici ET dans le contrat.

2. **Deux natures cohabitent** : une `personne physique` et une
   `personne morale` (le commissaire aux comptes). Une société n'est pas une
   personne — la ranger parmi les gens rendrait « CABINET D'AUDIT » comme un
   interlocuteur à appeler.

3. **Des attributs PROTÉGÉS voyagent dans la réponse** (année et date de
   naissance, nationalité). Ils ne franchissent pas cette frontière : une liste
   de personnes EST un classement (registre de doctrine, c58).
"""

from __future__ import annotations

import json
from pathlib import Path

from app.prompts.bellum_discover import build_angle_user_prompt
from app.services.company_filters import CompanyDiscoveryFilters
from app.services.data_sources.recherche_entreprises import _list_row

FIXTURE = Path(__file__).parent / "fixtures" / "discover_people" / "arquus_dirigeants.json"
ARQUUS_ROW = json.loads(FIXTURE.read_text(encoding="utf-8"))["results"][0]

BFC = CompanyDiscoveryFilters(departments=["58"], department="58")


def test_the_fixture_carries_what_the_registry_really_returns() -> None:
    """Une garde qui ne lit rien est verte pour rien."""
    dirigeants = ARQUUS_ROW["dirigeants"]
    assert [d["type_dirigeant"] for d in dirigeants] == ["personne physique", "personne morale"]
    # Le fait qui fonde l'arbitrage : rien, sur un dirigeant, ne dit OÙ.
    for dirigeant in dirigeants:
        assert not any(key in dirigeant for key in ("siret", "adresse", "etablissement", "code_postal", "commune"))
    # Et l'établissement qui a fait matcher la zone, lui, a bien un SIRET —
    # c'est la confusion possible, et elle est à portée de main.
    assert ARQUUS_ROW["matching_etablissements"][0]["siret"] == "66204340500106"


def test_a_candidate_carries_the_people_the_registry_names() -> None:
    row = _list_row(ARQUUS_ROW, BFC)
    assert row is not None
    people = row["people"]
    assert len(people) == 1, people
    person = people[0]
    assert person["name"]["value"] == "CLAUDE DOMINIQUE MARCHAND"
    assert person["name"]["origin"] == "registry"
    assert person["role"]["value"] == "Président de SAS"
    assert person["role"]["origin"] == "registry"


def test_a_comma_separated_list_of_first_names_is_not_glued_with_its_comma() -> None:
    """#3819 — le registre rend parfois `prenoms` en liste « Thierry, Philippe » :
    « Thierry, Philippe Renaudin » n'est pas un nom (la virgule coupait le prénom du nom)."""
    from app.services.data_sources.recherche_entreprises import _registry_person

    person = _registry_person(
        {"type_dirigeant": "personne physique", "prenoms": "Thierry, Philippe", "nom": "Renaudin"},
        "2026-10-08",
    )
    assert person is not None
    assert person["name"]["value"] == "Thierry Philippe Renaudin"


def test_a_legal_entity_is_never_ranged_among_people() -> None:
    """Le commissaire aux comptes est une SOCIÉTÉ, pas quelqu'un à appeler."""
    row = _list_row(ARQUUS_ROW, BFC)
    assert all("CABINET" not in person["name"]["value"].upper() for person in row["people"])


def test_a_person_never_gets_a_workplace_from_the_registry() -> None:
    """LE CŒUR DE L'ARBITRAGE.

    La ligne sait que Garchizy a fait matcher la zone, et elle en connaît même
    le SIRET. Rien, dans le registre, ne rattache le dirigeant à ce site.
    """
    row = _list_row(ARQUUS_ROW, BFC)
    assert row["city"] == "GARCHIZY"  # l'ÉTABLISSEMENT, lui, est bien localisé
    for person in row["people"]:
        assert "workplace" not in person, person
        assert "66204340500106" not in json.dumps(person), person
        assert "GARCHIZY" not in json.dumps(person).upper(), person


def test_no_protected_attribute_crosses_the_frontier() -> None:
    row = _list_row(ARQUUS_ROW, BFC)
    serialized = json.dumps(row["people"], ensure_ascii=False)
    for forbidden in ("naissance", "1963", "nationalite", "nationalité"):
        assert forbidden not in serialized, serialized


def test_the_constat_date_is_the_registers_own_never_invented() -> None:
    row = _list_row(ARQUUS_ROW, BFC)
    assert row["people"][0]["name"]["observedAt"] == "2026-08-25T16:33:12"


def test_an_undatable_mandate_is_not_rendered_rather_than_dated_by_guesswork() -> None:
    """Sans date du registre, le fait ne peut pas vieillir — donc il ne sort pas.

    Lui coller la date du jour ferait passer un mandat de 2011 pour un constat
    frais, et c'est précisément ce que la provenance est censée empêcher.
    """
    undated = {**ARQUUS_ROW}
    undated.pop("date_mise_a_jour_rne")
    assert _list_row(undated, BFC)["people"] == []


def test_a_row_without_dirigeants_names_nobody_rather_than_guessing() -> None:
    bare = {key: value for key, value in ARQUUS_ROW.items() if key != "dirigeants"}
    assert _list_row(bare, BFC)["people"] == []


def test_the_angle_prompt_never_carries_a_persons_name() -> None:
    """Le modèle écrit un ANGLE, il ne commente pas des gens.

    `build_angle_user_prompt` sérialise les candidats tels quels : sans cette
    coupe, les personnes nommées par le registre partiraient dans la charge
    utile du modèle — ce que la doctrine refuse (c58 : ni le code qui calcule,
    ni le PROMPT qui note).
    """
    row = _list_row(ARQUUS_ROW, BFC)
    prompt = build_angle_user_prompt([row], {"departments": ["58"]})
    assert "MARCHAND" not in prompt
    assert "people" not in prompt
    # Les faits d'ENTREPRISE, eux, y sont toujours.
    assert "662043405" in prompt
