"""#3816 — « Trouve-moi des missions pour ce profil : <consultant> » dans Laura.

Le maillon profil → comptes manquait dans le chat : Laura ne savait qu'OUVRIR l'écran
du marché inversé. Ce fichier tient la couture de bout en bout côté service IA :

* #3816.1 — la phrase est ROUTÉE vers l'outil, l'outil lit LE marché inversé d'UN talent
  (pont `talents/reverse-market`), et la porte de forme le rend en carte de comptes, chacun
  avec sa raison (compétences de la fiche ↔ offres relevées sur sa zone) ;
* introuvable / ambigu se DIT, avec les homonymes — jamais un marché vide ;
* une source muette se NOMME — jamais « 0 compte ».
"""

from __future__ import annotations

from typing import Any

import pytest

from app.access.rights_matrix import READ_ONLY_TOOLS
from app.services import chat_tools
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool
from app.services.compilers.intent_router import route_chat_intent
from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool
from app.services.reply_blocks import split_reply_blocks

TOOL = "find_accounts_for_talent"
MARIE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
MARIE_BIS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _market(**over: Any) -> dict[str, Any]:
    market = {
        "consultantId": MARIE,
        "zones": ["69"],
        "departments": ["69"],
        "unresolvedZones": [],
        "skillTerms": ["java", "kafka"],
        "unavailableReason": None,
        "demand": [
            {
                "department": "69",
                "observedOn": "2026-10-05",
                "offers": 412,
                "matchedTechnologies": [{"term": "Java", "count": 61}, {"term": "Kafka", "count": 12}],
                "technologiesRanked": 20,
            }
        ],
        "recruiters": [
            {
                "name": "Sopra Steria",
                "department": "69",
                "observedOn": "2026-10-05",
                "offers": 34,
                "baseline": 20,
                "openToSubcontracting": True,
            },
            {
                "name": "Alten",
                "department": "69",
                "observedOn": "2026-10-05",
                "offers": 18,
                "baseline": None,
                "openToSubcontracting": None,
            },
        ],
        "consentState": "valid",
    }
    market.update(over)
    return market


def _patch(monkeypatch: pytest.MonkeyPatch, *, talents: list[dict[str, Any]], market: Any) -> dict[str, list]:
    calls: dict[str, list] = {"search": [], "market": []}

    async def _search(user_id: str, **kwargs: Any) -> dict[str, Any]:
        calls["search"].append(kwargs)
        return {"items": talents, "total": len(talents)}

    async def _reverse(user_id: str, *, consultant_id: str) -> Any:
        calls["market"].append(consultant_id)
        return market

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.search_talents", _search)
    monkeypatch.setattr("app.services.bellum_api.talent_reverse_market", _reverse)

    # #4421.3 — les contacts des comptes rendus : un espace NEUF n'a aucune fiche, donc aucun contact.
    async def _no_account(user_id: str, **kwargs: Any) -> dict[str, Any]:
        return {"accounts": [], "total": 0}

    monkeypatch.setattr("app.services.bellum_api.workspace_accounts", _no_account)

    async def _no_offers(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        from app.services.discover_skill_offers import SkillAccounts

        return SkillAccounts(accounts=[], intermediaries=[], info={"emptyCause": "no_offers"})

    # KEVIN-FIX K.6 — aucun test de ce fichier n'appelle le réseau : le moteur de Découvrir est une doublure.
    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _no_offers)
    return calls


def _talent(tid: str, name: str, title: str = "Développeuse Java") -> dict[str, Any]:
    return {"id": tid, "fullName": name, "title": title, "zones": ["69"], "topSkills": [{"label": "Java"}]}


# ── #3816.1 — le routeur ENVOIE la phrase vers l'outil ───────────────────────────────────


@pytest.mark.parametrize(
    "message",
    [
        "Trouve-moi des missions pour ce profil : Marie Dupont",
        "trouve moi des missions pour Marie Dupont",
        "Des comptes pour ce consultant ?",
        "Où placer Marie Dupont ?",
        "À qui vendre ce consultant ?",
        "Find missions for this profile: Marie Dupont",
    ],
)
def test_3816_1_la_phrase_est_routee_vers_l_outil(message: str) -> None:
    route = route_chat_intent(message=message)
    assert route.expected_result == "marche_inverse"
    assert route.tools == (TOOL,)


def test_3816_1_une_recherche_de_comptes_ordinaire_n_est_pas_capturee() -> None:
    # La garde doit savoir dire NON : « des comptes pour la banque » est un tour d'horizon.
    route = route_chat_intent(message="Trouve-moi des comptes dans la banque à Lyon")
    assert route.expected_result != "marche_inverse"


# ── L'outil est déclaré, en lecture ───────────────────────────────────────────────────────


def test_l_outil_est_au_catalogue_en_lecture() -> None:
    assert TOOL in [t["name"] for t in CHAT_TOOLS]
    assert TOOL not in chat_tools.WRITE_TOOL_NAMES
    assert TOOL in READ_ONLY_TOOLS


async def test_sans_consultant_aucun_appel(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(monkeypatch, talents=[], market=None)
    out = await execute_chat_tool(TOOL, {}, user_id="u-1", profile_data=None)
    assert "consultant" in out["error"]
    assert calls == {"search": [], "market": []}


async def test_pont_eteint_dit_non(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: False)
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out == {"error": "Je n'ai pas accès au vivier depuis ici."}


# ── Introuvable / ambigu : Laura le DIT, avec les homonymes ───────────────────────────────


async def test_consultant_introuvable_se_dit_sans_lire_de_marche(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(monkeypatch, talents=[], market=_market())
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "not_found"
    assert "Marie Dupont" in out["message"]
    assert calls["market"] == []
    assert "accounts" not in out


async def test_homonymes_proposes_sans_choisir_a_la_place(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(
        monkeypatch,
        talents=[_talent(MARIE, "Marie Dupont"), _talent(MARIE_BIS, "Marie Dupont", "Cheffe de projet")],
        market=_market(),
    )
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "ambiguous"
    assert [h["id"] for h in out["homonyms"]] == [MARIE, MARIE_BIS]
    assert out["homonyms"][1]["title"] == "Cheffe de projet"
    assert calls["market"] == []


async def test_un_nom_exact_parmi_plusieurs_resultats_est_retenu(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(
        monkeypatch,
        talents=[_talent(MARIE_BIS, "Marie Dupont-Leroy"), _talent(MARIE, "Marie Dupont")],
        market={"found": True, "market": _market()},
    )
    out = await execute_chat_tool(TOOL, {"consultant": "marie dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "ok"
    assert calls["market"] == [MARIE]


async def test_un_identifiant_hors_espace_se_dit(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch(monkeypatch, talents=[], market={"found": False})
    out = await execute_chat_tool(TOOL, {"consultant": MARIE}, user_id="u-1", profile_data=None)
    assert out["status"] == "not_found"
    assert calls["search"] == []


async def test_marche_en_panne_est_une_erreur_pas_un_marche_vide(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], market=None)
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert "n'a pas répondu" in out["error"]


# ── Les comptes, chacun avec SA raison ────────────────────────────────────────────────────


async def test_3816_1_les_comptes_portent_la_raison_profil_vers_compte(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], market={"found": True, "market": _market()})
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "ok"
    assert out["consultant"] == {"id": MARIE, "name": "Marie Dupont"}
    names = [a["name"] for a in out["accounts"]]
    assert names == ["Sopra Steria", "Alten"]
    sopra = out["accounts"][0]
    joined = " ".join(sopra["why"])
    assert "Java" in joined and "Kafka" in joined  # les compétences de LA fiche
    assert "69" in joined and "34 offres" in joined  # le signal du compte
    assert sopra["observed_on"] == "2026-10-05"
    # Jamais « recrute ce profil » : la veille ne croise pas ESN et technologies.
    assert "recrute ce profil" not in joined
    # Une ouverture à la sous-traitance jamais déclarée n'est pas « non » : elle est nommée.
    assert "Ouverture à la sous-traitance" in out["accounts"][1]["not_evaluated"]


async def test_un_recruteur_sans_competence_de_la_fiche_n_est_pas_invente(monkeypatch: pytest.MonkeyPatch) -> None:
    market = _market(
        departments=["69", "38"],
        demand=[
            *_market()["demand"],
            {
                "department": "38",
                "observedOn": "2026-10-05",
                "offers": 80,
                "matchedTechnologies": [],
                "technologiesRanked": 20,
            },
        ],
        recruiters=[
            *_market()["recruiters"],
            {
                "name": "Capgemini",
                "department": "38",
                "observedOn": "2026-10-05",
                "offers": 50,
                "baseline": None,
                "openToSubcontracting": None,
            },
        ],
    )
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], market={"found": True, "market": market})
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert "Capgemini" not in [a["name"] for a in out["accounts"]]
    assert any("1 entreprise" in limit for limit in out["limits"])


async def test_une_source_muette_se_nomme_jamais_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    market = _market(unavailableReason="zones_missing", zones=[], departments=[], demand=[], recruiters=[])
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], market={"found": True, "market": market})
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    assert out["status"] == "unavailable"
    assert "zone" in out["message"]
    assert "accounts" not in out
    assert "0" not in out["message"]


# ── La porte de forme : la carte de comptes part dans le fil ──────────────────────────────


async def test_3816_1_la_porte_de_forme_rend_la_carte(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], market={"found": True, "market": _market()})
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    read = shape_read_from_tool(TOOL, out, language="fr")
    assert read is not None
    card = read["blocks"]["account_ranking"]
    assert card["title"] == "Comptes où placer Marie Dupont"
    assert [i["name"] for i in card["items"]] == ["Sopra Steria", "Alten"]
    assert card["items"][0]["source"]["as_of"] == "2026-10-05"
    reply = route_known_shapes(
        "Voici les comptes.",
        [{"shape_read": read}],
        user_message="Trouve-moi des missions pour ce profil : Marie Dupont",
        language="fr",
    )
    blocks = [s.block for s in split_reply_blocks(reply) if s.kind == "block"]
    assert blocks and blocks[0]["type"] == "account_ranking"


def test_une_lecture_sans_compte_ne_fabrique_pas_de_carte() -> None:
    out = {"status": "unavailable", "message": "La fiche ne porte aucune zone."}
    read = shape_read_from_tool(TOOL, out, language="fr")
    assert read is not None and read["count"] == 0 and read["blocks"] == {}


# ── #3816.2 — chaque carte enchaîne les maillons existants, sans ressaisir le profil ──────


async def test_3816_2_chaque_compte_enchaine_analyse_contacts_message(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], market={"found": True, "market": _market()})
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-1", profile_data=None)
    card = shape_read_from_tool(TOOL, out, language="fr")["blocks"]["account_ranking"]
    follow_ups = card["items"][0]["follow_ups"]
    assert [f["label"] for f in follow_ups] == ["Lancer l'analyse", "Voir les contacts", "Préparer le message"]
    for follow_up in follow_ups:
        # Le profil voyage AVEC la suite : son nom dans la phrase, son identifiant en métadonnée (#4397),
        # jamais dans le texte envoyé au clic.
        assert "Marie Dupont" in follow_up["ask"] and MARIE not in follow_up["ask"]
        assert follow_up["talent_id"] == MARIE.lower()
        assert "Sopra Steria" in follow_up["ask"]
    # Les trois maillons nommés sont ceux qui existent déjà.
    asks = " ".join(f["ask"] for f in follow_ups)
    assert "start_account_analysis" not in asks  # une phrase d'utilisateur, pas un nom d'outil
    # Jamais un envoi : Laura prépare, le commercial envoie.
    assert "je l'enverrai moi-même" in follow_ups[2]["ask"]


def test_3816_2_les_suites_suivent_la_langue_de_l_interface() -> None:
    out = {
        "status": "ok",
        "consultant": {"id": MARIE, "name": "Marie Dupont"},
        "accounts": [{"name": "Alten", "why": ["Java demandé sur le 69."], "observed_on": "2026-10-05"}],
        "limits": [],
    }
    card = shape_read_from_tool(TOOL, out, language="en")["blocks"]["account_ranking"]
    assert [f["label"] for f in card["items"][0]["follow_ups"]] == [
        "Run the analysis",
        "See the contacts",
        "Prepare the message",
    ]


def test_3816_2_sans_consultant_identifie_aucune_suite_inventee() -> None:
    out = {"status": "ok", "consultant": {}, "accounts": [{"name": "Alten", "why": ["Java."]}], "limits": []}
    card = shape_read_from_tool(TOOL, out, language="fr")["blocks"]["account_ranking"]
    assert "follow_ups" not in card["items"][0]


# ── #3816.3 — marche en espace NEUF : aucun compte suivi, aucun CRM ───────────────────────


async def test_3816_3_espace_neuf_aucune_lecture_du_portefeuille(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le marché inversé cherche HORS portefeuille (veille territoriale). Toute autre lecture du
    pont — priorités, CRM… — fait tomber ce test : un espace sans compte suivi doit recevoir la même
    liste qu'un espace plein.

    #4421.3 — seule exception, APRÈS la liste : la fiche d'un compte rendu (par son nom) et ses contacts
    à joindre. Elle ne change pas la liste ; en espace neuf, chaque compte DIT qu'aucun contact n'est connu."""
    import inspect

    from app.services import bellum_api

    allowed = {"is_configured", "search_talents", "talent_reverse_market", "workspace_accounts"}

    def _forbidden(name: str):
        async def _boom(*args: Any, **kwargs: Any) -> Any:
            raise AssertionError(f"lecture interdite en espace neuf : {name}")

        return _boom

    for name, fn in inspect.getmembers(bellum_api, inspect.iscoroutinefunction):
        if not name.startswith("_") and name not in allowed:
            monkeypatch.setattr(f"app.services.bellum_api.{name}", _forbidden(name))
    _patch(monkeypatch, talents=[_talent(MARIE, "Marie Dupont")], market={"found": True, "market": _market()})

    # #4421.10 — l'espace neuf EXISTE (sa recherche de personnes part) ; la source de personnes n'est pas branchée.
    async def _space(user_id: str, *_: Any, **__: Any) -> str:
        return "33333333-3333-4333-8333-333333333333"

    async def _unconfigured(*_: Any, **__: Any) -> Any:
        from app.services.apollo import ApolloSearchStatus

        return [], ApolloSearchStatus.UNCONFIGURED, None

    monkeypatch.setattr("app.services.workspace_scope.resolve_workspace_id", _space)
    monkeypatch.setattr("app.services.apollo.search_people_with_status", _unconfigured)
    out = await execute_chat_tool(TOOL, {"consultant": "Marie Dupont"}, user_id="u-neuf", profile_data=None)
    assert out["status"] == "ok"
    assert [a["name"] for a in out["accounts"]] == ["Sopra Steria", "Alten"]
    assert {a["contacts_note"] for a in out["accounts"]} == {
        "Pas encore dans ton espace — aucun contact collecté, lancer l'analyse."  # #4421.3 : espace neuf ≠ « aucun contact »
    }


def test_3816_1_une_reserve_commune_se_dit_une_fois_au_niveau_de_la_carte() -> None:
    # Garde de parité #3707.7 (`reply-parity.ts`) : une réserve répétée sur deux comptes se dit UNE fois.
    out = {
        "status": "ok",
        "consultant": {"id": MARIE, "name": "Marie Dupont"},
        "accounts": [
            {"name": "SII", "why": ["Kubernetes."], "not_evaluated": ["Ouverture à la sous-traitance"]},
            {"name": "Alten", "why": ["Kubernetes."], "not_evaluated": ["Ouverture à la sous-traitance"]},
            {"name": "Sopra Steria", "why": ["Kubernetes."], "not_evaluated": []},
        ],
        "limits": [],
    }
    card = shape_read_from_tool(TOOL, out, language="fr")["blocks"]["account_ranking"]
    assert all("not_evaluated" not in item for item in card["items"])
    assert "Ouverture à la sous-traitance (non évaluée pour : SII, Alten)" in card["not_evaluated"]


def test_3816_1_une_reserve_propre_a_un_seul_compte_reste_sur_lui() -> None:
    out = {
        "status": "ok",
        "consultant": {"id": MARIE, "name": "Marie Dupont"},
        "accounts": [
            {"name": "SII", "why": ["Kubernetes."], "not_evaluated": ["Ouverture à la sous-traitance"]},
            {"name": "Alten", "why": ["Kubernetes."]},
        ],
        "limits": [],
    }
    card = shape_read_from_tool(TOOL, out, language="fr")["blocks"]["account_ranking"]
    assert card["items"][0]["not_evaluated"] == ["Ouverture à la sous-traitance"]


# ── #3816.4 (recette prod 08/10, Alexandre Avakian 09f431ec) ──────────────────────────────
# Laura a refusé de chercher (« zone de veille non rattachée au département 92 ») avant même
# d'appeler l'outil : aucune carte produite. Pourtant RIEN dans le code n'exige qu'un département
# soit déjà SUIVI (abonnement Marché, `territory_subscriptions`) pour lire son marché inversé —
# `test_une_source_muette_se_nomme_jamais_zero` ci-dessus le prouve, la non-disponibilité se NOMME,
# elle ne bloque jamais l'appel. Le refus vient donc d'une confusion du modèle avec un AUTRE concept
# (le département suivi par l'écran Marché). La description de l'outil — lue au moment même où Laura
# décide d'appeler ou non — doit l'écarter explicitement : AUCUNE pré-condition de ce genre, jamais.
def test_3816_4_la_description_ecarte_le_refus_sur_departement_non_suivi() -> None:
    description = chat_tools.FIND_ACCOUNTS_FOR_TALENT_TOOL["description"]
    assert "N'exige JAMAIS que son département soit déjà suivi" in description
    assert "appelle-le TOUJOURS" in description


# ── KEVIN-FIX K.6 — Laura lit le MÊME moteur que Découvrir (compétence → offres → employeurs) ──────


def _skill_accounts(*names: str) -> Any:
    from app.services.discover_skill_offers import SkillAccounts

    rows = [
        {
            "siren": f"55200000{i}",
            "name": name,
            "department": "59",
            "city": "Lille",
            "skillEvidence": {
                "skill": "Java",
                "offerCount": 5 - i,
                "latestOffer": {
                    "title": "Développeur Java",
                    "city": "Lille",
                    "date": "2026-10-14",
                    "url": None,
                    "source": "ft",
                },
            },
        }
        for i, name in enumerate(names)
    ]
    return SkillAccounts(accounts=rows, intermediaries=[], info={"emptyCause": None if rows else "no_offers"})


def _lille_market(**over: Any) -> dict[str, Any]:
    return _market(
        zones=["Lille"],
        departments=[],
        unresolvedZones=["Lille"],
        skillTerms=["Java", "Spring", "Vue"],
        unavailableReason="zones_unresolved",
        demand=[],
        recruiters=[],
        **over,
    )


async def test_kevin_k6_laura_ne_rend_pas_zero_quand_decouvrir_rend_des_comptes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch(monkeypatch, talents=[_talent(MARIE, "Hugo Houyez")], market={"found": True, "market": _lille_market()})
    seen: dict[str, Any] = {}

    async def _engine(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        # #4421.3 — le volume (10) se tient par paliers : c'est le PREMIER appel qui porte la zone de la fiche.
        seen.setdefault("zone", list(zone))
        seen.setdefault("skills", list(skills))
        return _skill_accounts("Auchan", "Decathlon")

    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _engine)
    out = await execute_chat_tool(TOOL, {"consultant": "Hugo Houyez"}, user_id="u-1", profile_data=None)
    assert seen["zone"] == ["59"], "Lille se rattache à son département sans rien demander"
    assert seen["skills"][0] == "Java"
    assert out["status"] == "ok"
    assert [a["name"] for a in out["accounts"]] == ["Auchan", "Decathlon"]
    assert "Java" in " ".join(out["accounts"][0]["why"]), "la raison relie le profil au compte"


async def test_kevin_k6_departement_choisi_comme_59_nord_est_lu(monkeypatch: pytest.MonkeyPatch) -> None:
    market = _lille_market()
    market.update(zones=["59 — Nord"])
    _patch(monkeypatch, talents=[_talent(MARIE, "Hugo Houyez")], market={"found": True, "market": market})
    seen: dict[str, Any] = {}

    async def _engine(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        seen.setdefault("zone", list(zone))  # #4421.3 — le premier palier, avant tout élargissement
        return _skill_accounts("Auchan")

    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _engine)
    out = await execute_chat_tool(TOOL, {"consultant": "Hugo Houyez"}, user_id="u-1", profile_data=None)
    assert seen["zone"] == ["59"]
    assert out["status"] == "ok" and out["accounts"]


async def test_kevin_k6_la_garde_sait_dire_non_aucune_offre_aucun_compte(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, talents=[_talent(MARIE, "Hugo Houyez")], market={"found": True, "market": _lille_market()})

    async def _engine(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        return _skill_accounts()

    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _engine)
    out = await execute_chat_tool(TOOL, {"consultant": "Hugo Houyez"}, user_id="u-1", profile_data=None)
    assert not out.get("accounts")
    assert "message" in out and "0" not in out["message"].split()


async def test_kevin_k14_pas_de_remplissage_une_anciennete_n_est_pas_une_raison(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services.discover_skill_offers import SkillAccounts

    _patch(monkeypatch, talents=[_talent(MARIE, "Hugo Houyez")], market={"found": True, "market": _lille_market()})

    async def _engine(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        sans_preuve = {"siren": "552000009", "name": "Vieille Maison", "department": "59", "creationYear": 1900}
        return SkillAccounts(accounts=[sans_preuve, *_skill_accounts("Auchan").accounts], intermediaries=[], info={})

    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _engine)
    out = await execute_chat_tool(TOOL, {"consultant": "Hugo Houyez"}, user_id="u-1", profile_data=None)
    assert [a["name"] for a in out["accounts"]] == ["Auchan"]


# ── KEVIN-FIX K.6 — un profil décrit EN TEXTE LIBRE suffit ; la demande gagne sur la fiche ──


def _patch_free(monkeypatch: pytest.MonkeyPatch, *, market: Any, cities: dict[str, str | None]) -> dict[str, list]:
    calls: dict[str, list] = {"search": [], "market": []}

    async def _search(user_id: str, **kwargs: Any) -> dict[str, Any]:
        calls["search"].append(kwargs)
        return {"items": [_talent(MARIE, "Hugo Houyez")], "total": 1}

    async def _reverse(user_id: str, *, consultant_id: str | None = None, skills=None, zones=None) -> Any:
        calls["market"].append({"consultant_id": consultant_id, "skills": skills, "zones": zones})
        return market

    async def _city(city: str) -> str | None:
        return cities.get(city)

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.search_talents", _search)
    monkeypatch.setattr("app.services.bellum_api.talent_reverse_market", _reverse)
    monkeypatch.setattr(chat_tools, "_resolve_city_department", _city)

    async def _no_offers(skills: Any, zone: Any, profile: Any, *, deadline: Any) -> Any:
        from app.services.discover_skill_offers import SkillAccounts

        return SkillAccounts(accounts=[], intermediaries=[], info={"emptyCause": "no_offers"})

    monkeypatch.setattr("app.services.discover_skill_offers.find_skill_accounts", _no_offers)
    return calls


async def test_k6_profil_en_texte_libre_sans_consultant_cherche_avec_sa_zone_et_ses_competences(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _patch_free(
        monkeypatch, market={"found": True, "market": _market(zones=["59"], departments=["59"])}, cities={"Lille": "59"}
    )
    out = await execute_chat_tool(
        TOOL, {"skills": ["Java", "Spring", "Vue"], "zones": ["Lille", "remote"]}, user_id="u-1", profile_data=None
    )
    assert out["status"] == "ok"
    # Aucune fiche du vivier n'est cherchée ni choisie à la place du profil dit.
    assert calls["search"] == []
    assert calls["market"] == [{"consultant_id": None, "skills": ["Java", "Spring", "Vue"], "zones": ["59"]}]
    # « remote » n'est pas une zone : NOMMÉ, jamais deviné en département.
    assert any("remote" in limit for limit in out["limits"])
    assert out["accounts"]


async def test_k6_la_demande_gagne_sur_la_fiche_sans_zone(monkeypatch: pytest.MonkeyPatch) -> None:
    # Hugo Houyez n'a AUCUNE zone : la zone dite (Lille) ne doit pas être annulée par la fiche.
    calls = _patch_free(monkeypatch, market={"found": True, "market": _market(zones=["59"])}, cities={"Lille": "59"})
    out = await execute_chat_tool(
        TOOL, {"consultant": "Hugo Houyez", "skills": ["Java"], "zones": ["Lille"]}, user_id="u-1", profile_data=None
    )
    assert out["status"] == "ok"
    assert calls["market"] == [{"consultant_id": MARIE, "skills": ["Java"], "zones": ["59"]}]


async def test_k6_une_ville_non_resolue_se_nomme_sans_departement_devine(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch_free(monkeypatch, market={"found": True, "market": _market()}, cities={})
    out = await execute_chat_tool(TOOL, {"skills": ["Java"], "zones": ["Zorbaville"]}, user_id="u-1", profile_data=None)
    assert calls["market"][0]["zones"] is None
    assert any("Zorbaville" in limit for limit in out["limits"])


async def test_k6_sans_zone_ni_competence_ni_consultant_dit_non(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _patch_free(monkeypatch, market=None, cities={})
    out = await execute_chat_tool(TOOL, {"zones": ["Lille"]}, user_id="u-1", profile_data=None)
    assert "error" in out
    assert calls["market"] == []
