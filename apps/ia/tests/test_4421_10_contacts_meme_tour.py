"""#4421.10 (décision Louis, QCM 24/10 : « Chercher dans le même tour ») — un compte proposé pour placer un
consultant, qui n'est PAS encore dans l'espace, reçoit ses personnes à contacter DANS LE MÊME TOUR, et le mail
est PRÉPARÉ pour le meilleur d'entre elles. Avant : « Pas encore dans ton espace — aucun contact collecté,
lancer l'analyse », et les contacts n'arrivaient qu'avec l'analyse, minutes plus tard.

Bornes tenues ici :

* 3 comptes hors espace au plus (les mieux classés), recherche lancée EN PARALLÈLE de la lecture des contacts
  des comptes de l'espace, sous un budget : le tour reste sous 90 s ;
* lente, en erreur, refusée (pas d'espace actif) ou au plafond du jour : rien n'est inventé, la ligne dit que
  les contacts arrivent avec l'analyse (ou nomme le refus) — jamais un échec du tour ;
* le mail est PRÉPARÉ (``sends_email: False``), jamais envoyé ; aucun crédit affiché, aucun fournisseur nommé ;
* le rang d'une personne ne lit que sa FONCTION (aucun critère protégé : ni photo, ni ville, ni âge).
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.models.contacts import ApolloSearchHit
from app.services import bellum_api, chat_tools, fresh_jobs
from app.services.apollo import ApolloSearchStatus
from app.services.known_shape_gate import shape_read_from_tool

SPACE = "33333333-3333-4333-8333-333333333333"
TALENT = {"skills": ["Kubernetes", "Terraform"], "zones": ["69"], "available_from": "2026-11-02"}


def _accounts() -> list[dict[str, Any]]:
    need = {"title": "Ingénieur DevOps Kubernetes", "date": "2026-10-20"}
    return [
        {"name": "Alten", "needs": [need]},
        {"name": "SII", "needs": [need]},
        {"name": "Hors Un"},
        {"name": "Hors Deux"},
        {"name": "Hors Trois"},
    ]


def _hit(first: str, last: str, title: str, org: str, **extra: Any) -> ApolloSearchHit:
    return ApolloSearchHit(first_name=first, last_name=last, title=title, organization_name=org, **extra)


@pytest.fixture(autouse=True)
def _fresh_counters() -> None:
    fresh_jobs._local_counts.clear()


@pytest.fixture
def bridge(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[Any]]:
    """Alten est dans l'espace (un contact connu) ; SII et les « Hors » n'y sont pas."""
    seen: dict[str, list[Any]] = {"searched": [], "contacts_read": []}

    async def workspace(user_id: str, *, query: str, sector: Any, limit: int) -> dict[str, Any]:
        if query == "Alten":
            return {"accounts": [{"account_id": "a-alten", "company_name": "ALTEN SA"}]}
        return {"accounts": []}

    async def contacts(user_id: str, account_id: str, **_k: Any) -> dict[str, Any]:
        seen["contacts_read"].append(account_id)
        return {"contacts": [{"contact_id": "ct-1", "full_name": "Claire Petit", "title": "Recrutement"}]}

    async def search(company_name: str, person_titles: Any = None, **kwargs: Any) -> Any:
        seen["searched"].append(company_name)
        hits = [
            _hit("Paul", "Martin", "Directeur technique", company_name, photo_url="https://x/p.jpg", city="Lyon"),
            _hit("Inès", "Durand", "Responsable recrutement", company_name),
            _hit("Hugo", "Leroy", "Chargé de recrutement", "Autre Entreprise"),
        ]
        return hits, ApolloSearchStatus.OK, 3

    async def space(user_id: str, *_: Any, **__: Any) -> str | None:
        return SPACE

    monkeypatch.setattr(bellum_api, "workspace_accounts", workspace)
    monkeypatch.setattr(bellum_api, "account_contacts", contacts)
    monkeypatch.setattr("app.services.apollo.search_people_with_status", search)
    monkeypatch.setattr("app.services.workspace_scope.resolve_workspace_id", space)
    return seen


async def _run(accounts: list[dict[str, Any]]) -> None:
    await chat_tools._talent_account_contacts("u-1", accounts, space_key=SPACE, talent=TALENT)


@pytest.mark.asyncio
async def test_4421_10a_compte_hors_espace_ses_personnes_et_un_mail_prepare_dans_le_meme_tour(
    bridge: dict[str, list[Any]],
) -> None:
    accounts = _accounts()
    await _run(accounts)
    alten, sii, *_ = accounts
    # Le compte de l'espace garde ses contacts connus ; on ne cherche JAMAIS de personnes pour lui.
    assert [c["name"] for c in alten["contacts"]] == ["Claire Petit"]
    assert "Alten" not in bridge["searched"]
    # Hors espace : les personnes trouvées, recruteur d'abord, l'homonyme d'une autre entreprise écarté.
    assert sii["contacts_state"] == "found_outside"
    assert [c["name"] for c in sii["contacts"]] == ["Inès Durand", "Paul Martin"]
    assert all(c.get("to_verify") is True and "contact_id" not in c for c in sii["contacts"])
    # Aucun critère protégé ne voyage avec la personne (ni photo, ni ville).
    assert all("photo_url" not in c and "city" not in c for c in sii["contacts"])
    assert "à vérifier" in sii["contacts_note"]
    # Le mail est PRÉPARÉ pour le premier, jamais envoyé ; il ne cite que des faits lus.
    mail = sii["prepared_message"]
    assert mail["status"] == "prepared" and mail["sends_email"] is False
    assert mail["to"] == {"name": "Inès Durand", "title": "Responsable recrutement"}
    assert mail["body"].startswith("Bonjour Inès,")
    assert "« Ingénieur DevOps Kubernetes »" in mail["body"] and "2026-10-20" in mail["body"]
    assert "Kubernetes" in mail["body"] and "2026-11-02" in mail["body"] and ", zone 69." in mail["body"]
    assert "crédit" not in str(sii).casefold() and "apollo" not in str(sii).casefold()


@pytest.mark.asyncio
async def test_4421_10a_trois_comptes_hors_espace_au_plus_les_mieux_classes(bridge: dict[str, list[Any]]) -> None:
    accounts = _accounts()
    await _run(accounts)
    assert sorted(bridge["searched"]) == sorted(["SII", "Hors Un", "Hors Deux"])
    last = accounts[-1]
    # Le quatrième compte hors espace garde la ligne d'aujourd'hui : ses contacts arrivent avec l'analyse.
    assert last["contacts_state"] == "not_in_workspace"
    assert last["contacts_note"] == chat_tools._TALENT_NOT_IN_WORKSPACE
    assert "prepared_message" not in last


@pytest.mark.asyncio
async def test_4421_10b_recherche_lente_coupee_au_budget_rien_d_invente(
    monkeypatch: pytest.MonkeyPatch, bridge: dict[str, list[Any]]
) -> None:
    async def slow(company_name: str, person_titles: Any = None, **kwargs: Any) -> Any:
        await asyncio.sleep(5)
        return [_hit("Inès", "Durand", "DRH", company_name)], ApolloSearchStatus.OK, 1

    monkeypatch.setattr("app.services.apollo.search_people_with_status", slow)
    monkeypatch.setattr(chat_tools, "_TALENT_PEOPLE_BUDGET_S", 0.05)
    accounts = _accounts()
    await _run(accounts)
    sii = accounts[1]
    assert sii["contacts"] == [] and sii["contacts_state"] == "not_in_workspace"
    assert sii["contacts_note"] == chat_tools._TALENT_NOT_IN_WORKSPACE
    assert "prepared_message" not in sii
    # Le compte de l'espace n'a pas attendu la recherche lente pour rendre ses contacts.
    assert [c["name"] for c in accounts[0]["contacts"]] == ["Claire Petit"]


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["raise", ApolloSearchStatus.DOWN, ApolloSearchStatus.UNCONFIGURED])
async def test_4421_10c_erreur_de_recherche_jamais_un_echec_du_tour(
    monkeypatch: pytest.MonkeyPatch, bridge: dict[str, list[Any]], failure: Any
) -> None:
    async def broken(company_name: str, person_titles: Any = None, **kwargs: Any) -> Any:
        if failure == "raise":
            raise RuntimeError("boom")
        return [], failure, None

    monkeypatch.setattr("app.services.apollo.search_people_with_status", broken)
    accounts = _accounts()
    await _run(accounts)
    sii = accounts[1]
    assert sii["contacts"] == [] and sii["contacts_note"] == chat_tools._TALENT_NOT_IN_WORKSPACE
    assert "prepared_message" not in sii


@pytest.mark.asyncio
async def test_4421_10c_sans_espace_actif_le_refus_se_nomme_rien_n_est_cherche(bridge: dict[str, list[Any]]) -> None:
    """Droits : la recherche passe par la même porte que la collecte fraîche de Découvrir — l'espace ACTIF, dont
    l'appartenance est re-prouvée. Sans lui, rien ne part et la ligne NOMME le refus."""
    accounts = _accounts()
    await chat_tools._talent_account_contacts("u-1", accounts, space_key=None, talent=TALENT)
    assert bridge["searched"] == []
    sii = accounts[1]
    assert sii["contacts"] == [] and sii["contacts_note"] == chat_tools._TALENT_PEOPLE_NO_SPACE
    assert "espace" in sii["contacts_note"] and "analyse" in sii["contacts_note"]


@pytest.mark.asyncio
async def test_4421_10c_plafond_du_jour_par_espace_tenu_sans_parler_de_credits(
    monkeypatch: pytest.MonkeyPatch, bridge: dict[str, list[Any]]
) -> None:
    monkeypatch.setattr(chat_tools, "_TALENT_PEOPLE_MAX_PER_SPACE_DAY", 2)
    accounts = _accounts()
    await _run(accounts)
    assert len(bridge["searched"]) == 2
    capped = [a for a in accounts[1:4] if a.get("contacts_state") != "found_outside"]
    assert len(capped) == 1
    assert capped[0]["contacts_note"] == chat_tools._TALENT_PEOPLE_CAPPED
    assert "crédit" not in capped[0]["contacts_note"].casefold()
    # Le tour suivant du même espace, le même jour : plus rien ne part.
    again = _accounts()
    await _run(again)
    assert len(bridge["searched"]) == 2


def test_4421_10a_le_tour_tient_sous_90_s() -> None:
    from app.services.chat_orchestrator import _DEFAULT_TURN_BUDGET_S

    # La recherche de personnes vit DANS le budget des contacts : le pire cas du tour ne bouge pas.
    assert chat_tools._TALENT_PEOPLE_BUDGET_S < chat_tools._TALENT_CONTACTS_BUDGET_S
    worst = chat_tools._TALENT_OFFERS_BUDGET_S + chat_tools._TALENT_CONTACTS_BUDGET_S
    assert worst <= _DEFAULT_TURN_BUDGET_S - 20


def test_4421_10_la_carte_dit_a_verifier_et_le_mail_prepare() -> None:
    out = {
        "status": "ok",
        "consultant": {"id": "22222222-2222-4222-8222-222222222222", "name": "Camille Roussel"},
        "accounts": [
            {
                "name": "SII",
                "why": ["Publie 2 offres citant Kubernetes."],
                "contacts": [{"name": "Inès Durand", "title": "Responsable recrutement", "to_verify": True}],
                "contacts_state": "found_outside",
                "contacts_note": chat_tools._TALENT_FOUND_OUTSIDE,
                "prepared_message": {
                    "status": "prepared",
                    "sends_email": False,
                    "channel": "email",
                    "to": {"name": "Inès Durand", "title": "Responsable recrutement"},
                    "subject": "Kubernetes",
                    "body": "Bonjour Inès,",
                },
            }
        ],
        "limits": [],
    }
    card = shape_read_from_tool("find_accounts_for_talent", out, language="fr")["blocks"]["account_ranking"]
    why = " ".join(card["items"][0]["why"])
    assert "Inès Durand (Responsable recrutement)" in why and "à vérifier" in why
    assert "Mail préparé pour Inès Durand" in why
    assert "Aucun contact connu" not in why and "Pas encore dans ton espace" not in why
    en = shape_read_from_tool("find_accounts_for_talent", out, language="en")["blocks"]["account_ranking"]
    assert "Email drafted for Inès Durand" in " ".join(en["items"][0]["why"])


@pytest.mark.asyncio
async def test_4421_10_l_outil_passe_l_espace_et_le_profil_retenu(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le branchement : `find_accounts_for_talent` donne l'espace et ce qu'il a retenu du profil à la lecture
    des contacts — sinon la recherche ne partirait jamais en production."""
    seen: dict[str, Any] = {}

    async def contacts(user_id: str, accounts: list[dict[str, Any]], **kwargs: Any) -> None:
        seen.update(kwargs)

    async def skills(*_a: Any, **_k: Any) -> Any:
        return [{"name": "SII", "siren": "1", "department": "69"}], []

    async def reverse(user_id: str, **kwargs: Any) -> Any:
        market = {"zones": ["69"], "departments": ["69"], "skillTerms": ["Kubernetes"], "demand": [], "recruiters": []}
        return {"found": True, "market": market}

    async def space(user_id: str, *_: Any, **__: Any) -> str | None:
        return SPACE

    def compile_ok(market: Any, **kwargs: Any) -> dict[str, Any]:
        return {"status": "ok", "accounts": [{"name": "SII", "why": ["x"]}], "limits": []}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "talent_reverse_market", reverse)
    monkeypatch.setattr(chat_tools, "_talent_skill_accounts", skills)
    monkeypatch.setattr(chat_tools, "_talent_account_contacts", contacts)
    monkeypatch.setattr("app.services.compilers.talent_accounts.compile_talent_accounts", compile_ok)
    monkeypatch.setattr("app.services.workspace_scope.resolve_workspace_id", space)
    await chat_tools.execute_chat_tool(
        "find_accounts_for_talent", {"skills": ["Kubernetes"], "zones": ["69"]}, user_id="u", profile_data={}
    )
    assert seen["space_key"] == SPACE
    assert seen["talent"]["skills"] == ["Kubernetes"]


@pytest.mark.parametrize(("refused", "said"), [("no_space", "espace de travail actif"), ("capped", "du jour")])
def test_4421_10c_la_carte_nomme_le_refus(refused: str, said: str) -> None:
    out = {
        "status": "ok",
        "consultant": {"id": "22222222-2222-4222-8222-222222222222", "name": "Camille Roussel"},
        "accounts": [
            {"name": "SII", "why": ["Publie 2 offres citant Kubernetes."], "contacts": [],
             "contacts_state": "not_in_workspace", "people_search": refused, "contacts_note": "x"},
        ],
        "limits": [],
    }
    card = shape_read_from_tool("find_accounts_for_talent", out, language="fr")["blocks"]["account_ranking"]
    why = " ".join(card["items"][0]["why"])
    assert said in why and "arrivent avec l'analyse" in why and "crédit" not in why.casefold()


def test_4421_10b_la_consigne_dit_brouillon_a_verifier_jamais_envoye() -> None:
    steps = chat_tools._TALENT_NEXT_STEPS
    assert "found_outside" in steps and "prepared_message" in steps
    assert "à vérifier" in steps and "jamais envoyé" in steps and "contacts_note" in steps
