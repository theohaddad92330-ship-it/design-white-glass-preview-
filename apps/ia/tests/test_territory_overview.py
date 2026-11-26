"""L'écran Territoire — cinq blocs, chacun avec son état (tome 4, partie F)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import territory_overview as svc
from app.services.data_sources.signal_errors import SignalSourceUnavailable


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _offer(employer: str, title: str) -> dict:
    return {"name": employer, "department": "31", "city": "Toulouse", "signal": {"type": "hiring", "label": title, "date": "2026-08-01"}}


@pytest.fixture
def sources(monkeypatch):
    state: dict[str, object] = {"hiring": [], "tenders": [], "awards": [], "count": 87}

    async def hiring(*_a, **_k):
        value = state["hiring"]
        if isinstance(value, BaseException):
            raise value
        return value

    async def tenders(*_a, **_k):
        value = state["tenders"]
        if isinstance(value, BaseException):
            raise value
        return value

    async def awards(*_a, **_k):
        value = state["awards"]
        if isinstance(value, BaseException):
            raise value
        return value

    async def count(**_k):
        return state["count"]

    monkeypatch.setattr(svc, "list_hiring_companies", hiring)
    monkeypatch.setattr(svc, "list_tender_buyers", tenders)
    monkeypatch.setattr(svc, "list_award_buyers", awards)
    monkeypatch.setattr(svc, "count_companies", count)
    return state


def _post(client, **body):
    payload = {"department": "31", "sinceDays": 90}
    payload.update(body)
    return client.post("/territory/overview", json=payload).json()


def test_the_naf_turn_splits_one_harvest_into_two_markets(client, sources) -> None:
    """La même moisson : les ESN connues d'un côté, les comptes finaux de l'autre."""
    sources["hiring"] = [_offer("KARYTIS", "Développeur Java"), _offer("AIRBUS", "Ingénieur Data")] * 6
    data = _post(client, knownEsnNames=["karytis"])
    # L'ESN sort sous sa CLÉ de référentiel, plus sous le nom que la source a
    # publié : c'est la clé qui permet à l'API de retrouver ses faits
    # (`factsByName` lit `normalized_name`) et de fusionner deux graphies de la
    # même ESN. L'API resubstitue le libellé propre pour l'écran.
    assert data["overflow"]["esn"] == [{"name": "karytis", "offers": 6}]
    # Le compte final, lui, garde le nom tel que la source l'écrit : c'est ce
    # qu'un commercial va chercher, et aucun référentiel ne le canonise.
    assert [a["name"] for a in data["market"]["hiringAccounts"]] == ["AIRBUS"]


def test_a_source_that_falls_names_its_block_and_the_others_still_answer(client, sources) -> None:
    sources["hiring"] = SignalSourceUnavailable("France Travail", "identifiants absents")
    data = _post(client)
    assert data["market"]["state"] == "unavailable"
    assert "France Travail" in data["market"]["reason"]
    # Les autres blocs répondent quand même.
    assert data["competition"]["state"] == "ready"
    assert data["accessible"]["state"] == "ready"


def test_a_registry_that_stays_silent_never_reads_as_zero_esn(client, sources) -> None:
    sources["count"] = None
    data = _post(client)
    assert data["competition"]["state"] == "unavailable"


def test_the_density_says_why_it_cannot_be_computed(client, sources) -> None:
    """« L'emploi IT du département » n'est publié nulle part : on le DIT plutôt
    que d'afficher un ratio approché."""
    data = _post(client)
    assert data["competition"]["density"] is None
    assert "non calculable" in data["competition"]["densityReason"]


def test_a_thin_harvest_does_not_rank_technologies(client, sources) -> None:
    sources["hiring"] = [_offer("AIRBUS", "Développeur Java")] * 5
    data = _post(client)
    assert data["market"]["technologies"] == []
    assert "sous 30" in data["market"]["technologiesReason"]


def test_a_real_harvest_ranks_them(client, sources) -> None:
    sources["hiring"] = [_offer("AIRBUS", "Développeur Java")] * 20 + [_offer("THALES", "Ingénieur Cloud")] * 15
    data = _post(client)
    terms = {t["term"]: t["count"] for t in data["market"]["technologies"]}
    assert terms["java"] == 20
    assert terms["cloud"] == 15


def test_an_empty_territory_says_so_frankly(client, sources) -> None:
    """« Il n'y a pas de marché ici pour ton activité » — un produit qui habille
    le vide fait perdre des semaines."""
    data = _post(client)
    assert data["market"]["state"] == "empty"
    assert "Aucune offre" in data["market"]["reason"]


def test_what_i_do_not_know_is_never_empty(client, sources) -> None:
    data = _post(client)
    assert len(data["unknowns"]) >= 2
    assert any("panels" in u for u in data["unknowns"])


def test_an_unreadable_department_is_refused_without_calling_anything(client, sources) -> None:
    data = _post(client, department="  ")
    assert data["market"]["state"] == "unavailable"
    assert data["unknowns"] == ["Tout — sans département, il n'y a pas de territoire à lire."]


def test_the_registry_is_asked_with_full_naf_codes_in_one_call(client, monkeypatch) -> None:
    """Trouvé en recette live : le bloc « la concurrence » affichait « source
    indisponible » sur un registre parfaitement disponible.

    `activite_principale` refuse un PRÉFIXE (« 62.0 » → 400) et n'accepte que
    des codes complets, plusieurs à la fois. Six appels d'un code chacun
    marcheraient aussi — et coûteraient six fois plus à une source publique
    partagée par tout le monde.
    """
    seen: dict[str, object] = {}

    async def count(**kwargs):
        seen.update(kwargs)
        return 87

    monkeypatch.setattr(svc, "count_companies", count)
    monkeypatch.setattr(svc, "list_hiring_companies", lambda *a, **k: _empty())
    monkeypatch.setattr(svc, "list_tender_buyers", lambda *a, **k: _empty())
    monkeypatch.setattr(svc, "list_award_buyers", lambda *a, **k: _empty())

    data = _post(client)
    assert data["competition"]["esnPresent"] == 87
    codes = seen["naf_codes"]
    assert all("." in code and code[-1].isalpha() for code in codes), codes
    assert "62.02A" in codes and "70.22Z" in codes


async def _empty():
    return []


def test_a_count_at_the_registry_ceiling_is_announced_as_a_floor(client, sources) -> None:
    """10 000 est le plafond de `total_results` : l'afficher tel quel ferait
    passer une borne technique pour un fait de marché."""
    sources["count"] = 10_000
    data = _post(client)
    assert "plancher" in (data["competition"]["reason"] or "")


# ── Reconnaître une ESN dont la raison sociale porte un suffixe ──────────────
#
# Retour du 31/08 : « parfois ça sort juste pas d'ESN ». Le référentiel porte
# des noms COMMERCIAUX (« Capgemini »), France Travail publie des RAISONS
# SOCIALES (« CAPGEMINI TECHNOLOGY SERVICES »). L'égalité exacte ne les faisait
# jamais se rencontrer, et un territoire sans concurrence RECONNUE se lit comme
# un territoire sans concurrence.


def test_an_esn_is_recognised_through_its_legal_suffix(client, sources) -> None:
    sources["hiring"] = [_offer("CAPGEMINI TECHNOLOGY SERVICES", "Développeur Java")] * 12
    data = _post(client, knownEsnNames=["capgemini"])

    # Rendue sous sa CLÉ de référentiel : c'est elle qui permet à l'API de
    # retrouver les faits de l'ESN (`factsByName` lit `normalized_name`).
    assert data["overflow"]["esn"] == [{"name": "capgemini", "offers": 12}]
    # Et elle a quitté la liste des comptes finaux à prospecter.
    assert data["market"]["hiringAccounts"] == []


def test_two_spellings_of_the_same_esn_are_MERGED(client, sources) -> None:
    """« SII » et « SII SUD OUEST » sont une seule ESN. Deux lignes se
    partageraient ses offres et la feraient passer sous le seuil de classement."""
    sources["hiring"] = [_offer("SII", "Dev")] * 7 + [_offer("SII SUD OUEST", "Dev")] * 5
    data = _post(client, knownEsnNames=["sii"])

    assert data["overflow"]["esn"] == [{"name": "sii", "offers": 12}]


def test_a_lookalike_is_NOT_taken_for_an_esn(client, sources) -> None:
    """La moitié qui compte : un faux positif range un CLIENT parmi les
    concurrents, et oriente la prospection vers le mauvais interlocuteur."""
    sources["hiring"] = [_offer("OPEN CLASSROOMS", "Formateur")] * 12
    data = _post(client, knownEsnNames=["open"])

    assert data["overflow"]["esn"] == []
    # Elle reste ce qu'elle est : un compte final qui recrute.
    assert [a["name"] for a in data["market"]["hiringAccounts"]] == ["OPEN CLASSROOMS"]


def test_two_spellings_of_the_same_CLIENT_are_merged_too(client, sources) -> None:
    """Trouvé en recette live le 31/08 sur le département 31 :

        Link Consulting — 6 offres
        LINK CONSULTING — 4 offres

    Deux lignes pour une seule entreprise. Les comptes finaux étaient comptés
    par GRAPHIE. C'est le même défaut que côté ESN, du côté où il n'y a pas de
    référentiel pour canoniser — donc on regroupe sur le nom normalisé, et on
    affiche la graphie la plus fréquente plutôt que d'en inventer une.
    """
    sources["hiring"] = [_offer("Link Consulting", "Dev")] * 6 + [_offer("LINK CONSULTING", "Dev")] * 4
    data = _post(client)

    # `city` a rejoint la ligne : elle voyageait déjà sur chaque offre
    # (`lieuTravail`) et n'était lue nulle part, sur un écran dont la question
    # est « qu'est-ce qu'il y a LÀ-BAS ». La graphie retenue est la plus
    # fréquente pour cet employeur.
    assert data["market"]["hiringAccounts"] == [{"name": "Link Consulting", "offers": 10, "city": "Toulouse"}]


# ═══════════════════════════════════════════════════════════════════════════
# CE QUE L'ÉCRAN JETAIT — les acheteurs publics, nommés (04/09/2026)
# ═══════════════════════════════════════════════════════════════════════════


def _tender(buyer: str, objet: str) -> dict:
    """Un AO tel que BOAMP le rend — avec son objet, sa date limite et son lien."""
    return {
        "name": buyer,
        "siren": "213105554",
        "department": "31",
        "city": None,
        "signal": {
            "type": "tender",
            "label": f"AO IT publié — {objet}",
            "date": "2026-08-20",
            "url": "https://boamp.example/avis/1",
            "detail": "CPV 72000000 · réponse avant le 2026-09-30",
        },
    }


def _award(buyer: str, vendor: str | None, ends_on: str | None) -> dict:
    """Un marché attribué tel que DECP le rend — avec SON TITULAIRE et sa fin."""
    return {
        "name": buyer,
        "siren": "213105554",
        "department": "31",
        "city": None,
        "vendor": vendor,
        "vendorSiren": "552081317" if vendor else None,
        "objet": "TMA du SI financier",
        "amount": 480000,
        "durationMonths": 36,
        "endsOn": ends_on,
        "url": "https://decp.example/marche/9",
    }


def test_les_appels_doffres_sont_NOMMES_pas_seulement_comptes(client, sources) -> None:
    """L'écran affichait « 2 appels d'offres » et jetait tout le reste.

    L'objet du marché, la date limite de réponse et le lien vers l'avis étaient
    collectés depuis le premier jour, puis réduits à un `len()`. Savoir qu'un
    marché existe ne permet pas d'y répondre.
    """
    sources["tenders"] = [_tender("Mairie de Toulouse", "Refonte du portail"), _tender("CHU", "Hébergement")]
    data = _post(client)

    assert data["accessible"]["openTenders"] == 2  # le compteur RESTE
    tenders = data["accessible"]["tenders"]
    assert [t["name"] for t in tenders] == ["Mairie de Toulouse", "CHU"]
    # Ce qui rend le bloc actionnable : l'objet, l'échéance, le lien.
    assert tenders[0]["subject"] == "AO IT publié — Refonte du portail"
    assert "réponse avant le 2026-09-30" in tenders[0]["detail"]
    assert tenders[0]["url"] == "https://boamp.example/avis/1"


def test_un_marche_attribue_dit_QUI_le_tient_et_JUSQU_A_QUAND(client, sources) -> None:
    """Le titulaire en place et la date de fin sont l'information la plus chère
    de cet écran, et elles n'étaient nulle part.

    Savoir qu'un acheteur a attribué un marché ne dit rien ; savoir qui le tient
    et quand il se termine dit quand commencer à travailler le compte.
    """
    sources["awards"] = [_award("Région Occitanie", "Capgemini", "2028-03-01")]
    data = _post(client)

    award = data["accessible"]["awards"][0]
    assert award["vendor"] == "Capgemini"
    assert award["endsOn"] == "2028-03-01"
    assert award["amount"] == 480000
    assert award["durationMonths"] == 36


def test_un_titulaire_non_resolu_reste_None_jamais_un_SIRET_affiche(client, sources) -> None:
    """Le millésime 2022 ne publie que des SIRET. Un titulaire non résolu reste
    `None` : afficher « 55208131766522 » sous « titulaire en place » serait un
    nom inventé, et il se lirait comme un nom d'entreprise."""
    sources["awards"] = [_award("Région Occitanie", None, None)]
    data = _post(client)

    award = data["accessible"]["awards"][0]
    assert award["vendor"] is None
    # Et la fin de contrat non publiée reste absente : une date estimée servirait
    # à planifier une prise de contact sur une échéance inventée.
    assert award["endsOn"] is None


# ═══════════════════════════════════════════════════════════════════════════
# LA MAILLE — département, ville, cercle (04/09/2026)
# ═══════════════════════════════════════════════════════════════════════════


def test_par_defaut_la_maille_reste_le_departement(client, sources) -> None:
    """Les appelants antérieurs gardent un comportement identique."""
    data = _post(client)
    assert data["scope"]["kind"] == "department"
    assert data["scope"]["label"] == "sur le département 31"
    # Aucune source n'est « plus large que demandé » : c'est la question posée.
    assert data["coarseSources"] == []


def test_une_ville_NOMME_les_sources_qui_repondent_plus_large(client, sources) -> None:
    """BOAMP et DECP publient AU DÉPARTEMENT — ce n'est pas un repli, c'est leur
    maille. Demander « Toulouse » et recevoir le 31 n'est pas faux, c'est une
    autre question : le taire serait une réponse exacte à une question qu'on n'a
    pas posée, impossible à repérer à l'écran."""
    data = _post(client, communeCode="31555", communeName="Toulouse")

    assert data["scope"]["kind"] == "commune"
    assert data["scope"]["label"] == "sur Toulouse"
    assert set(data["coarseSources"]) == {"tenders", "awards"}
    assert any("BOAMP et DECP publient au département" in u for u in data["unknowns"])


def test_un_rayon_se_NOMME(client, sources) -> None:
    data = _post(client, communeCode="31555", communeName="Toulouse", latitude=43.6007, longitude=1.4328, radiusKm=12)

    assert data["scope"]["kind"] == "around"
    assert data["scope"]["radiusKm"] == 12
    assert data["scope"]["label"] == "à moins de 12 km autour de Toulouse"


def test_un_rayon_au_dela_de_50_km_est_REFUSE_pas_rogne_en_silence(client) -> None:
    """La borne vient de l'API du registre, qui la dit elle-même (mesuré le
    04/09/2026 : `radius=51` rend un 400 « entre 0.001 et 50 »).

    La frontière REFUSE plutôt que de rogner : rendre 50 km à qui en demande 200
    répondrait à une autre question. L'écran, lui, borne son curseur — cette
    422 ne se déclenche donc que pour un client qui ignore la borne."""
    resp = client.post(
        "/territory/overview",
        json={"department": "31", "latitude": 43.6, "longitude": 1.43, "radiusKm": 200},
    )
    assert resp.status_code == 422


def test_le_scope_borne_QUAND_MEME_avant_l_appel_reseau() -> None:
    """Ceinture ET bretelles, et elles ne protègent pas la même chose : la 422
    protège l'utilisateur d'une réponse à une autre question, ce plafond-ci
    protège l'APPEL — un `radius` hors bornes rendrait un 400 que l'écran lirait
    « le registre est en panne »."""
    scope = svc.TerritoryScope(department="31", latitude=43.6, longitude=1.43, radius_km=200)
    assert scope.radius_km == 50
    assert scope.near == (43.6, 1.43, 50)


def test_un_repli_de_la_source_demploi_est_DIT(client, sources) -> None:
    """Les paramètres fins de France Travail n'ont pas pu être vérifiés (il faut
    des identifiants). La source tente le fin, rejoue au département si l'API
    refuse, et POSE le drapeau. Sans lui, l'écran étiquetterait un département
    entier « à 12 km de Toulouse »."""
    offer = _offer("Airbus", "Dev")
    offer["coarseFallback"] = True
    sources["hiring"] = [offer]
    data = _post(client, communeCode="31555", communeName="Toulouse", latitude=43.6007, longitude=1.4328, radiusKm=12)

    assert data["market"]["coarseFallback"] is True
    assert "market" in data["coarseSources"]


def test_une_source_demploi_en_panne_ne_declare_aucun_repli(client, sources) -> None:
    """Une panne n'a rien replié. Lire un drapeau non défini ferait tomber
    l'écran sur le chemin où il sait déjà le moins de choses."""
    sources["hiring"] = SignalSourceUnavailable("France Travail", "OAuth refusé")
    data = _post(client, communeCode="31555", communeName="Toulouse")

    assert data["market"]["state"] == "unavailable"
    assert "market" not in data["coarseSources"]


# ═══════════════════════════════════════════════════════════════════════════
# TROUVÉ EN RECETTE LIVE le 04/09 — sur du code déployé le jour même
# ═══════════════════════════════════════════════════════════════════════════


def test_le_nom_de_l_acheteur_est_RESOLU_par_son_siren(client, sources, monkeypatch) -> None:
    """Le bloc rendait « Titulaire : CGI FRANCE · Se termine le 2026-09-22 » SANS
    dire avec QUI.

    Le millésime 2022 de la source ne publie que des SIRET côté acheteur. Le
    SIREN voyageait (« 193112562 »), le résolveur existait — il nomme déjà les
    TITULAIRES — et personne ne les reliait sur ce chemin. On apprenait donc
    qu'un concurrent tient un marché qui rouvre dans dix-huit jours, sans savoir
    chez quel acheteur.
    """

    async def resolve(sirens):
        return {"193112562": "Conseil départemental de la Haute-Garonne"}

    monkeypatch.setattr(svc, "names_by_siren", resolve)
    row = _award("", "CGI FRANCE", "2026-09-22")
    row["siren"] = "193112562"
    sources["awards"] = [row]

    award = _post(client)["accessible"]["awards"][0]
    assert award["name"] == "Conseil départemental de la Haute-Garonne"
    assert award["vendor"] == "CGI FRANCE"


def test_un_acheteur_que_le_registre_ne_resout_pas_reste_SANS_NOM(client, sources, monkeypatch) -> None:
    """Jamais un SIRET brut présenté comme une raison sociale. L'écran le NOMME
    (« Acheteur non publié par la source ») plutôt que de rendre une ligne
    anonyme — c'était le défaut d'origine."""

    async def resolve(sirens):
        return {}

    monkeypatch.setattr(svc, "names_by_siren", resolve)
    row = _award("", "CGI FRANCE", "2026-09-22")
    row["siren"] = "193112562"
    sources["awards"] = [row]

    award = _post(client)["accessible"]["awards"][0]
    assert award["name"] == ""
    assert "193112562" not in str(award["name"])


def test_un_registre_muet_ne_casse_pas_la_liste(client, sources, monkeypatch) -> None:
    """Le résolveur est un CONFORT : son échec retire des noms, il ne retire pas
    les marchés. Une exception non rattrapée ferait disparaître le bloc entier."""

    async def boom(sirens):
        raise RuntimeError("registre injoignable")

    monkeypatch.setattr(svc, "names_by_siren", boom)
    row = _award("", "SOPRA STERIA GROUP", "2027-08-22")
    row["siren"] = "130005010"
    sources["awards"] = [row]

    data = _post(client)
    assert data["accessible"]["state"] == "ready"
    assert data["accessible"]["awards"][0]["vendor"] == "SOPRA STERIA GROUP"


def test_un_acheteur_DEJA_nomme_ne_declenche_aucune_resolution(client, sources, monkeypatch) -> None:
    """Un appel registre par marché déjà nommé serait payé pour rien."""
    called = {"n": 0}

    async def resolve(sirens):
        called["n"] += 1
        return {}

    monkeypatch.setattr(svc, "names_by_siren", resolve)
    row = _award("Région Occitanie", "CGI FRANCE", "2027-01-01")
    row["siren"] = "193112562"
    sources["awards"] = [row]

    assert _post(client)["accessible"]["awards"][0]["name"] == "Région Occitanie"
    assert called["n"] == 0


# ── Budget par source (Laura, incident prod 07/10/2026) ──────────────────────
# Une source muette ne doit pas emporter la moisson : son bloc devient
# `unavailable` avec une raison lisible, les autres s'affichent.


def _sleepy(monkeypatch, attr: str) -> None:
    import asyncio

    async def sleepy(*_a, **_k):
        await asyncio.sleep(5)
        return []

    monkeypatch.setattr(svc, attr, sleepy)
    # Flaky mesuré le 02/11/2026 (#5137, IA 3) : à 0,05 s, les sources RAPIDES
    # (mockées, instantanées) manquaient elles aussi leur budget sur un runner
    # chargé — « market » sortait « unavailable ». 1 s reste 5 fois sous la
    # source endormie (5 s) : ce que le test prouve est inchangé.
    monkeypatch.setattr(svc, "TERRITORY_SOURCE_BUDGET_S", 1.0)


def test_a_sleeping_source_becomes_an_unavailable_block_not_a_dead_harvest(client, sources, monkeypatch) -> None:
    _sleepy(monkeypatch, "list_award_buyers")
    sources["hiring"] = [_offer("AIRBUS", "Ingénieur Data")] * 3
    data = _post(client)
    assert data["accessible"]["state"] == "partial"
    assert "marchés attribués" in data["accessible"]["reason"]
    # Les autres blocs sont rendus normalement.
    assert data["market"]["state"] == "ready"
    assert data["competition"]["state"] == "ready"
    assert data["competition"]["esnPresent"] == 87
    assert any("marchés attribués" in u and "à temps" in u for u in data["unknowns"])


def test_a_sleeping_hiring_source_gives_a_readable_reason(client, sources, monkeypatch) -> None:
    _sleepy(monkeypatch, "list_hiring_companies")
    data = _post(client)
    assert data["market"]["state"] == "unavailable"
    assert "à temps" in data["market"]["reason"]
    assert "()" not in data["market"]["reason"]
    assert data["competition"]["state"] == "ready"
    assert any("offres" in u and "à temps" in u for u in data["unknowns"])
