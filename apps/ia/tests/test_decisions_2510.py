"""Décisions de Louis du 25/10 (QCM) — deux réglages figés par un test.

- #4421.14 : Laura cherche au plus 60 fois par espace et par jour les personnes d'un compte hors espace (le lot B
  avait posé 30).
- #4419.30 : le registre public des entreprises passe à 120 req/min (revient sur #631, 50/5) ; la concurrence reste
  à 5 et l'espacement par processus (2/s = 120/min) reste la vraie borne sous les 7 req/s publiés par la source.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from app.services import chat_tools, rate_limiter


@pytest.fixture(autouse=True)
def _clear_cache() -> Iterator[None]:
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


def test_4421_14_laura_cherche_60_fois_par_espace_et_par_jour() -> None:
    assert chat_tools._TALENT_PEOPLE_MAX_PER_SPACE_DAY == 60


async def test_4419_30_registre_public_120_par_minute(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("RECHERCHE_ENTREPRISES_RPM", "RECHERCHE_ENTREPRISES_CONCURRENCY"):
        monkeypatch.delenv(var, raising=False)
    t = rate_limiter.get_throttle("recherche_entreprises")
    assert t.rpm == 120
    assert t.concurrency == 5
    # L'espacement par processus dit la même chose que le seau : 2/s = 120/min.
    assert rate_limiter.PUBLIC_RATE_PER_SECOND["recherche_entreprises"] * 60 == t.rpm


# --- #4421.15 — l'outil rend l'identifiant opaque de la personne, pour le bouton « Obtenir l'e-mail » -------------

from typing import Any  # noqa: E402

from app.models.contacts import ApolloSearchHit  # noqa: E402
from app.services import bellum_api, fresh_jobs  # noqa: E402
from app.services.apollo import ApolloSearchStatus  # noqa: E402

_SPACE = "33333333-3333-4333-8333-333333333333"


async def test_4421_15_la_personne_hors_espace_porte_sa_reference_opaque(monkeypatch: pytest.MonkeyPatch) -> None:
    fresh_jobs._local_counts.clear()

    async def workspace(user_id: str, *, query: str, sector: Any, limit: int) -> dict[str, Any]:
        return {"accounts": []}

    async def search(company_name: str, person_titles: Any = None, **kwargs: Any) -> Any:
        hits = [
            ApolloSearchHit(
                id="p-ines",
                first_name="Inès",
                last_name_obfuscated="D.",
                title="Responsable recrutement",
                organization_name=company_name,
            ),
            ApolloSearchHit(first_name="Paul", last_name="Martin", title="CTO", organization_name=company_name),
        ]
        return hits, ApolloSearchStatus.OK, 2

    monkeypatch.setattr(bellum_api, "workspace_accounts", workspace)
    monkeypatch.setattr("app.services.apollo.search_people_with_status", search)
    accounts: list[dict[str, Any]] = [{"name": "SII", "siren": "308491101"}]
    await chat_tools._talent_account_contacts("u-1", accounts, space_key=_SPACE, talent={"skills": ["Java"]})
    sii = accounts[0]
    ines, paul = sii["contacts"]
    # La référence voyage (le clic en a besoin), jamais un nom de fournisseur ; sans id, aucune clé.
    assert ines["person_ref"] == "p-ines" and ines["name"] == "Inès D."
    assert "person_ref" not in paul
    # Le mail préparé sait à qui il s'adresse : le clic le remplira avec l'adresse révélée.
    assert sii["prepared_message"]["to"]["person_ref"] == "p-ines"
    assert "email" not in sii["prepared_message"]["to"]
    # Le compte garde de quoi être retrouvé ou créé dans l'espace.
    assert sii["name"] == "SII" and sii["siren"] == "308491101"
    assert "apollo" not in str(sii).casefold()


# --- #4421.15 — la carte porte les personnes révélables, posées par le serveur -----------------------------------


def _ranking(contacts: list[dict[str, Any]], **account: Any) -> dict[str, Any]:
    from app.services import known_shape_gate as gate

    output = {
        "status": "ok",
        "consultant": {"id": "34f4c624-1111-4222-8333-444455556666", "name": "Camille Roussel"},
        "accounts": [
            {
                "name": "SII",
                "why": ["Kubernetes demandé sur le 69."],
                "observed_on": "2026-10-20",
                "contacts": contacts,
                "contacts_state": "found_outside",
                "prepared_message": {"to": {"name": "Inès D.", "person_ref": "p-ines"}},
                **account,
            }
        ],
    }
    block = gate._talent_ranking(output, gate._labels("fr"))  # type: ignore[attr-defined]
    assert block is not None
    return block["items"][0]


def test_4421_15_la_carte_porte_les_personnes_revelables() -> None:
    row = _ranking(
        [
            {"name": "Inès D.", "title": "Responsable recrutement", "person_ref": "p-ines", "to_verify": True},
            {"name": "Paul M.", "person_ref": "p-paul", "to_verify": True},
            {"name": "Sans Ref", "to_verify": True},
        ],
        siren="308491101",
    )
    assert row["reveal"] == {
        "siren": "308491101",
        "people": [
            {"name": "Inès D.", "title": "Responsable recrutement", "person_ref": "p-ines", "mail_to": True},
            {"name": "Paul M.", "person_ref": "p-paul"},
        ],
    }
    # La référence ne s'écrit jamais dans une ligne lue.
    assert "p-ines" not in " ".join(row["why"])


def test_4421_15_dit_non_hors_des_personnes_trouvees_hors_espace() -> None:
    from app.services import known_shape_gate as gate

    # Un contact de l'espace (déjà un contact) ne se « révèle » pas : aucune clé.
    output = {
        "status": "ok",
        "accounts": [
            {
                "name": "Alten",
                "why": ["Kubernetes demandé sur le 69."],
                "contacts": [{"name": "Claire Petit", "contact_id": "ct-1", "person_ref": "p-x"}],
            }
        ],
    }
    block = gate._talent_ranking(output, gate._labels("fr"))  # type: ignore[attr-defined]
    assert block is not None and "reveal" not in block["items"][0]
    # Aucune référence : aucune clé (jamais un bouton sans objet). SIREN illisible : écarté, la personne reste.
    assert "reveal" not in _ranking([{"name": "Inès D.", "to_verify": True}])
    assert _ranking([{"name": "Inès D.", "person_ref": "p-ines"}], siren="SII")["reveal"] == {
        "people": [{"name": "Inès D.", "person_ref": "p-ines", "mail_to": True}]
    }
