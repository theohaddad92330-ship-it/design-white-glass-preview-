"""GA-348 — LES DEUX GESTES NOMMÉS, ET LAURA EXÉCUTE CELUI QU'ON CHOISIT.

La règle (arbitrage Louis du 16/09/2026, sur #2470 et #2471, deux retours du
MÊME client bêta à une minute d'écart) :

    Quand Laura a de quoi chercher des comptes, sa réponse propose DEUX gestes
    NOMMÉS — le TOUR D'HORIZON (la recherche, dont les résultats arrivent dans
    la conversation) et l'ANALYSE DE FOND (`plan_account_analysis` sur
    l'entreprise ou le groupe nommé) — et elle exécute celui qu'on choisit. Le
    renvoi vers l'écran Découvrir n'est plus le seul chemin.

Ce que cette garde PROTÈGE et n'invente pas : les deux gestes voyagent dans le
RÉSULTAT des outils de recherche (`next_gestures`), c'est-à-dire dans ce que le
modèle lit avant de rédiger. Les écrire dans le seul prompt les rendrait
invérifiables — un prompt ne se mesure pas, il se relit.

Les TROIS preuves qu'une garde doit donner (CLAUDE.md, « ce qui tient les
règles »), chacune dans ce fichier :

  1. ELLE SAIT DIRE NON — `test_sait_dire_non_*` casse volontairement une charge
     utile en retirant un geste, et `gestes_manquants` le NOMME. Vérifié en
     cassant le VRAI code (`next_gestures()` tronqué à son premier geste, dans
     `chat_tools.py`) : la garde passe au rouge et NOMME ce qui manque —

         AssertionError: find_accounts {'sectors': ['telecom'], 'department': '75'}
         ne propose pas les deux gestes
         assert ["l'analyse de fond"] == []

  2. ELLE LIT — `test_lit_*` exécute le VRAI dispatcher sur un corpus de
     scénarios de recherche et compte ce qu'elle a lu (6 résultats d'outil), en
     plus de la source réelle de `chat_tools.py`.

  3. ELLE N'ATTRAPE PAS CE QU'ELLE NE VISE PAS — LE TÉMOIN : une demande qui
     n'appelle AUCUNE recherche (« reformule ce message ») ne propose rien du
     tout, et la garde la laisse passer.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import REQUIRED_GESTURES, execute_chat_tool, next_gestures

#: Les outils dont une réponse DOIT porter les deux gestes. Les autres sont hors
#: du viseur de cette garde, et c'est ce que le témoin vérifie.
SEARCH_TOOLS = ("find_accounts", "run_account_search")

#: Le corpus : des demandes de recherche de comptes réellement exprimables, avec
#: les arguments que le modèle produit. Chaque ligne passe par le VRAI
#: dispatcher — rien n'est simulé sauf le registre lui-même.
CORPUS: tuple[tuple[str, dict[str, Any]], ...] = (
    ("find_accounts", {"sectors": ["telecom"], "department": "75"}),
    ("find_accounts", {"signals": ["hiring"], "keywords": "Free"}),
    ("find_accounts", {"department": "69", "headcount": "1000+"}),
    ("run_account_search", {"sectors": ["telecom"], "department": "75"}),
    ("run_account_search", {"keywords": "Free"}),
    ("run_account_search", {"department": "69", "headcount": "1000+"}),
)


def gestes_manquants(payload: Any) -> list[str]:
    """Les gestes que CETTE charge utile devrait proposer et ne propose pas.

    Liste vide = rien à redire. Une charge utile qui n'est PAS un résultat de
    recherche de comptes n'a aucun geste à porter : la garde la laisse passer,
    elle ne l'attrape pas.
    """
    if not isinstance(payload, dict) or payload.get("error"):
        return []
    gestures = payload.get("next_gestures")
    if not isinstance(gestures, list):
        return []
    proposes = {str(entry.get("gesture") or "") for entry in gestures if isinstance(entry, dict)}
    return [label for key, label in REQUIRED_GESTURES if key not in proposes]


def _est_un_resultat_de_recherche(payload: Any) -> bool:
    """Ce que la garde VISE : un résultat d'outil de recherche de comptes."""
    if not isinstance(payload, dict) or payload.get("error"):
        return False
    proposal = payload.get("proposal")
    if isinstance(proposal, dict) and proposal.get("action") == "find_accounts":
        return True
    return "items" in payload and "axes" in payload


class _Response:
    def __init__(self) -> None:
        self.candidates: list[dict[str, Any]] = [
            {
                "siren": "552032534",
                "name": "FREE SAS",
                "score": 71,
                "scoreMax": 100,
                "scoreUnmeasured": ["Signaux d'intention"],
                "scoreFactors": [{"label": "Effectif dans la cible", "detail": "1 200 salariés"}],
                "qualification": {"verdict": "recommended", "reasons": ["Établissement actif"]},
                "sources": [{"name": "registre", "fetchedAt": "2026-09-16T15:26:00+00:00"}],
            }
        ]
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


@pytest.fixture
def registre(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(_req: Any) -> Any:
        return _Response()

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)


# ── 1. ELLE SAIT DIRE NON ────────────────────────────────────────────────────


def test_sait_dire_non_quand_l_analyse_de_fond_manque() -> None:
    ampute = {"items": [], "axes": ["Département : 75"], "next_gestures": next_gestures()[:1]}
    assert gestes_manquants(ampute) == ["l'analyse de fond"]


def test_sait_dire_non_quand_le_tour_d_horizon_manque() -> None:
    ampute = {"items": [], "axes": ["Département : 75"], "next_gestures": next_gestures()[1:]}
    assert gestes_manquants(ampute) == ["le tour d'horizon"]


def test_sait_dire_non_quand_la_reponse_ne_propose_rien() -> None:
    nu = {"items": [], "axes": ["Département : 75"], "next_gestures": []}
    assert gestes_manquants(nu) == ["le tour d'horizon", "l'analyse de fond"]


# ── 2. ELLE LIT ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_lit_le_vrai_dispatcher_sur_tout_le_corpus(registre: None) -> None:
    resultats = [await execute_chat_tool(nom, args, user_id="u-1", profile_data={}) for nom, args in CORPUS]
    # Le nombre d'éléments LUS — un corpus vide rendrait cette garde borgne.
    assert len(resultats) == 6
    assert len(CORPUS) == 6
    for (nom, args), sortie in zip(CORPUS, resultats, strict=True):
        assert _est_un_resultat_de_recherche(sortie), f"{nom} {args} n'a pas produit de recherche : {sortie}"
        assert gestes_manquants(sortie) == [], f"{nom} {args} ne propose pas les deux gestes"


def test_lit_la_source_reelle_et_y_trouve_les_deux_outils() -> None:
    source = Path(chat_tools.__file__).read_text(encoding="utf-8")
    assert len(source) > 10_000
    for outil in SEARCH_TOOLS:
        assert f'"name": "{outil}"' in source
    # Les deux gestes sont nommés une fois, à un seul endroit (GA-26).
    assert source.count("REQUIRED_GESTURES: tuple") == 1


def test_le_second_geste_n_annonce_aucun_chiffre_que_le_pont_n_a_pas_dit() -> None:
    """Le coût de l'analyse vient de `plan_account_analysis` (le pont lit la
    grille et le solde). Un `cost_credits` écrit ici serait un prix inventé par
    le service qui propose, et « non mesuré » deviendrait « mesuré à zéro »."""
    gestes = next_gestures(company="Free")
    assert [g["gesture"] for g in gestes] == [key for key, _ in REQUIRED_GESTURES]
    tour, analyse = gestes
    assert tour["cost_credits"] == 0
    assert tour["bounded_by"], "un « 0 crédit » sans sa borne est une promesse molle"
    assert "cost_credits" not in analyse
    assert analyse["tool"] == "plan_account_analysis"
    assert analyse["company"] == "Free"


# ── 3. LE TÉMOIN — elle n'attrape pas ce qu'elle ne vise pas ─────────────────


@pytest.mark.asyncio
async def test_temoin_une_demande_sans_recherche_ne_propose_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    """« reformule ce message » n'appelle aucune recherche de comptes : la
    réponse ne doit proposer NI tour d'horizon NI analyse de fond, et la garde
    doit la laisser passer. Sans ce témoin, on tiendrait une garde qui exige
    deux gestes sur toutes les réponses de Laura.

    Le témoin est une proposition RÉUSSIE, pas une erreur : une garde qu'un
    simple `{"error": ...}` suffirait à satisfaire ne prouverait rien."""

    async def _contact(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        return {"id": "c-1", "full_name": "Claire Dubois", "title": "DSI", "account_id": "a-1"}

    async def _no_stop(*_args: Any, **_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(chat_tools, "_resolve_owned_contact", _contact)
    # BEL-SC-235 (#3264.13) — prepare_message_for_contact vérifie désormais
    # contact_stops AVANT de proposer un message ; ce témoin ne teste PAS ce
    # chemin-là, il court-circuite juste « aucun refus enregistré ». `get_supabase`
    # est appelé pour construire l'argument même si `fetch_contact_stop` est
    # court-circuité juste après — sans Supabase configuré ici, il lèverait.
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: None)
    monkeypatch.setattr("app.services.ownership.fetch_contact_stop", _no_stop)
    sortie = await execute_chat_tool(
        "prepare_message_for_contact",
        {"contact_id": "c-1", "channel": "email", "angle": "reformuler"},
        user_id="u-1",
        profile_data={},
    )
    assert sortie.get("error") is None
    assert "next_gestures" not in sortie
    assert not _est_un_resultat_de_recherche(sortie)
    assert gestes_manquants(sortie) == []


@pytest.mark.asyncio
async def test_temoin_une_recherche_en_erreur_ne_propose_rien_non_plus(registre: None) -> None:
    """Une recherche SANS critère exploitable est une erreur, pas une réponse :
    lui exiger deux gestes ferait proposer un tour d'horizon qui n'a rien à
    chercher."""
    sortie = await execute_chat_tool("run_account_search", {}, user_id="u-1", profile_data={})
    assert "error" in sortie
    assert gestes_manquants(sortie) == []
