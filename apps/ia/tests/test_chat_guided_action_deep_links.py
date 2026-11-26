"""#1933 — un lien profond proposé par Laura porte les filtres que l'écran LIT.

Avant ce lot, ``propose_guided_action`` ne vérifiait qu'une route de RÉGLAGES.
Hors réglages, n'importe quelle requête passait : ``/actions/sequences?audience=DSI``
ouvrait l'écran des séquences… qui ne lit aucun paramètre. Le filtre annoncé par
Laura disparaissait à l'arrivée, sans erreur — c'est la famille « un filtre
déclaré mais jamais lu » que ce dépôt a déjà payée deux fois.

Le catalogue ``DEEP_LINK_SCREENS`` dit, pour chaque écran qu'il couvre, les
paramètres que l'écran lit VRAIMENT. La garde TypeScript
``apps/web/src/architecture/laura-deep-links.test.ts`` relit ce fichier et
vérifie, de l'autre côté, que chaque route existe et que chaque paramètre est
déclaré par la route ET lu par l'écran.

Ce que ces tests tiennent côté service IA :
 1. un paramètre LU passe ;
 2. un paramètre inventé est REFUSÉ, avec la liste de ce que l'écran lit ;
 3. une route hors catalogue continue de passer telle quelle (non-régression).
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "33333333-3333-4333-8333-333333333333"
TALENT = "a800466a-4194-4394-bd74-8d15a52df24f"


async def _propose(route: str, label: str = "Écran") -> dict:
    return await chat_tools.execute_chat_tool(
        "propose_guided_action", {"route": route, "label": label}, user_id=USER, profile_data=None
    )


def test_the_catalogue_reads_something():
    assert len(chat_tools.DEEP_LINK_SCREENS) >= 4
    for entry in chat_tools.DEEP_LINK_SCREENS:
        assert str(entry["route"]).startswith("/")
        assert isinstance(entry["params"], tuple)
        assert str(entry["description"]).strip()


@pytest.mark.asyncio
async def test_a_filter_the_screen_reads_is_kept():
    result = await _propose("/contacts?company=SNCF&role=decision")
    assert "error" not in result
    assert result["proposal"]["route"] == "/contacts?company=SNCF&role=decision"


@pytest.mark.asyncio
async def test_1903_15_the_account_id_of_contacts_is_kept():
    # #1903.15 — le COMPTE discuté en conversation, transmis à `/contacts` par
    # son identifiant plutôt que par `company` (texte libre, qui se duplique
    # entre deux comptes homonymes).
    account_id = "acb96868-d191-40b2-9c70-e2adc42c69ab"
    route = f"/contacts?account_id={account_id}"
    result = await _propose(route, label="Contacts du compte")
    assert "error" not in result, result
    assert result["proposal"]["route"] == route


@pytest.mark.asyncio
async def test_2303_29_accountid_reopens_a_compared_perimeter_on_search():
    # #2303.29 (épopée #2790) — le lien qu'un périmètre déjà comparé par
    # `compare_accounts` propose pour « Ouvrir Analyser » : `accountId` rouvre
    # le dossier existant, préremplit, ne relance rien tout seul (#2303.30).
    account_id = "acb96868-d191-40b2-9c70-e2adc42c69ab"
    route = f"/search?accountId={account_id}"
    result = await _propose(route, label="Ouvrir Analyser")
    assert "error" not in result, result
    assert result["proposal"]["route"] == route


@pytest.mark.asyncio
async def test_2303_29_accountid_does_not_reopen_the_preset_refusal():
    # `accountId` seul (sans `preset`) n'est pas confondu avec un champ de
    # preset structuré orphelin — même exemption que `company`/`scope`/`context`.
    account_id = "acb96868-d191-40b2-9c70-e2adc42c69ab"
    result = await _propose(f"/search?accountId={account_id}&scope=groupe", label="Ouvrir Analyser")
    assert "error" not in result, result


@pytest.mark.asyncio
async def test_the_dictated_name_the_vivier_reads_is_kept():
    # #1903.16 (lot 6a) — le vivier LIT `?name=` : `ConsultantsPage` préremplit
    # le formulaire que `?new=` ouvre, et `prepare_consultant_record` émet cette
    # forme exacte. Le catalogue (#1933, lot 6c) ne le connaissait pas : le même
    # lien, proposé par `propose_guided_action`, était refusé comme un filtre
    # « qui disparaîtrait à l'arrivée » — alors que l'écran le lit.
    route = "/consultants?new=true&name=Marie+Curie"
    result = await _propose(route, label="Vivier")
    assert "error" not in result, result
    assert result["proposal"]["route"] == route


@pytest.mark.asyncio
async def test_1952_4_the_cv_batch_import_deposit_is_kept():
    # #1952.4 (épopée #2844, lot SRC5 28/09 soir) — la conversation ne
    # transporte aucun fichier (absence structurelle) : ce que Laura propose
    # est le lien vers le DÉPÔT pré-ciblé (`CvZipImportDialog`, #2326.12), pas
    # un fichier. Le job en lot part de CE dépôt, au clic humain qui y dépose
    # un fichier — jamais depuis ce paramètre.
    route = "/consultants?importCv=true"
    result = await _propose(route, label="Importer des CV en lot")
    assert "error" not in result, result
    assert result["proposal"]["route"] == route


@pytest.mark.asyncio
async def test_a_filter_the_screen_does_not_read_is_refused_and_the_read_ones_are_named():
    result = await _propose("/consultants?skill=java")
    assert "proposal" not in result
    assert "skill" in result["error"]
    assert "q" in result["error"] and "new" in result["error"]


@pytest.mark.asyncio
async def test_sequences_is_nameable_but_reads_no_filter():
    ok = await _propose("/actions/sequences")
    assert ok["proposal"]["route"] == "/actions/sequences"
    refused = await _propose("/actions/sequences?audience=DSI&tone=direct")
    assert "proposal" not in refused
    assert "audience" in refused["error"]


@pytest.mark.asyncio
async def test_the_reverse_market_of_a_consultant_is_reachable():
    result = await _propose(f"/consultants/{TALENT}/reverse-market")
    assert "error" not in result
    assert result["proposal"]["route"] == f"/consultants/{TALENT}/reverse-market"


@pytest.mark.asyncio
async def test_the_reverse_market_scope_is_kept_and_a_dead_filter_is_refused():
    # #1933.5 — `scope` (mine/all) présélectionne « Besoins internes » SANS
    # lancer le classement (lecture pure au clic, jamais au montage — sinon
    # chaque ouverture de lien journaliserait un run). Les quatre autres champs
    # promis par #1933 (disponibilité, mobilité, compétences, type de contrat)
    # ne sont PAS des filtres de CET écran : la fiche est déjà identifiée par
    # `:id`, et ces quatre-là sont des attributs de la personne affichée, pas un
    # filtre de liste ici — refusés comme n'importe quel filtre non lu.
    kept = await _propose(f"/consultants/{TALENT}/reverse-market?scope=mine")
    assert "error" not in kept, kept
    assert kept["proposal"]["route"] == f"/consultants/{TALENT}/reverse-market?scope=mine"

    refused = await _propose(f"/consultants/{TALENT}/reverse-market?disponibilite=immediate")
    assert "proposal" not in refused
    assert "disponibilite" in refused["error"]
    assert "scope" in refused["error"]


@pytest.mark.asyncio
async def test_a_route_outside_the_catalogue_passes_exactly_as_before():
    route = "/accounts/acb96868-d191-40b2-9c70-e2adc42c69ab?tab=plan"
    result = await _propose(route, label="Compte")
    assert "error" not in result
    assert result["proposal"]["route"] == route


def test_the_tool_description_names_every_catalogued_screen_and_its_filters():
    description = str(chat_tools.GUIDED_ACTION_TOOL["description"])
    for entry in chat_tools.DEEP_LINK_SCREENS:
        assert str(entry["route"]) in description
        for param in entry["params"]:
            assert f"`{param}`" in description
