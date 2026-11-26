"""« Le registre n'a pas pu appliquer ce filtre » ≠ « le registre est tombé ».

Le bug verrouillé ici est un bug de VÉRITÉ, pas de rendu. Une recherche
« secteur = Informatique & numérique » revenait avec 24 entreprises ET un
bandeau ambre :

    ⚠ Résultats partiels — Une ou plusieurs sources n'ont pas répondu.
      La liste est incomplète.
      pappers — unsupported_filters

Trois affirmations, trois faux :

* Pappers **a** répondu — c'est même lui qui a fourni les 24 lignes ;
* la liste n'est pas plus COURTE, elle est plus LARGE : Pappers n'expose pas la
  *section* NAF (facette gouv.fr), donc il a rendu un sur-ensemble de ce qui
  était demandé ;
* rien n'est « incomplet » : ce qui manque, c'est le resserrement, pas les
  lignes.

`unsupported_filters` décrit une **limite de capacité** d'une source qui
fonctionne — `company_filters.py` le dit noir sur blanc : *results broader than
requested*. Le confondre avec `quota_exceeded` ou `network_error` apprend au
commercial à ignorer le bandeau, et le jour où une source tombe vraiment il ne
le lit plus. C'est exactement la faute que #631 / #649 ont corrigée un cran plus
bas (un fait d'infra rendu comme un fait de marché) ; on ne la réintroduit pas à
l'envers.

La distinction est portée par un champ MACHINE (`kind`), comme
`kind: 'not-examined'` de #649 — jamais par la lecture d'une phrase française.
Et son défaut est fail-loud : **pas de `kind` = panne**, donc toute raison
inconnue ou future reste bruyante.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.services.company_filters import (
    CAPABILITY_REASONS,
    KIND_AMBIGUOUS,
    KIND_CAPABILITY,
    KIND_NO_MATCH,
    KIND_NOT_EXAMINED,
    KIND_UNREACHABLE,
    NO_MATCH_REASON,
    SIREN_AMBIGUOUS_REASON,
    SIREN_NOT_EXAMINED_REASON,
    SIREN_UNREACHABLE_REASON,
    UNKNOWN_SECTOR_REASON,
    DegradeReason,
    degrade_kind,
    degraded_entry,
)

# ── Le vocabulaire : qui est une panne, qui est une limite ──────────────────

#: Toutes les raisons du vocabulaire, pour qu'aucune n'échappe au classement.
_ALL_REASONS = [
    value for name, value in vars(DegradeReason).items() if not name.startswith("_") and isinstance(value, str)
]


def test_every_reason_of_the_vocabulary_is_classified() -> None:
    # #2521 — dix : `time_budget` classé panne (voir la liste paramétrée plus bas).
    # #4518 — onze : `request_rejected` (un 4xx que la source répond à NOTRE requête).
    assert len(_ALL_REASONS) == 11, "une raison a été ajoutée sans être classée panne/capacité"
    for reason in _ALL_REASONS:
        assert degrade_kind(reason) in {None, KIND_CAPABILITY, KIND_NO_MATCH}


def test_only_unsupported_filters_is_a_capability_limit() -> None:
    """La source a répondu ; elle ne savait juste pas exprimer un critère."""
    assert frozenset({DegradeReason.UNSUPPORTED_FILTERS}) == CAPABILITY_REASONS
    assert degrade_kind(DegradeReason.UNSUPPORTED_FILTERS) == KIND_CAPABILITY


@pytest.mark.parametrize(
    "reason",
    [
        DegradeReason.MISSING_API_KEY,
        DegradeReason.UNAUTHORIZED,
        DegradeReason.QUOTA_EXCEEDED,
        DegradeReason.RATE_LIMITED,
        DegradeReason.UPSTREAM_ERROR,
        DegradeReason.NETWORK_ERROR,
        DegradeReason.INVALID_RESPONSE,
        # `empty_query` n'est PAS une limite de capacité : la source va très
        # bien, mais rien n'a été cherché. Sous-alerter coûte plus cher que
        # sur-alerter — il reste dans le chemin bruyant, avec sa propre phrase.
        DegradeReason.EMPTY_QUERY,
        # #2521 — `time_budget` : on a cessé d'attendre à la limite de temps.
        # Des lignes (ou des angles) manquent réellement : chemin bruyant.
        DegradeReason.TIME_BUDGET,
        # #4518 — `request_rejected` : un 4xx que la source répond à NOTRE
        # requête (400, paramètre invalide…). La source va BIEN — la phrase ne
        # doit donc accuser personne —, mais le tort est le nôtre et des lignes
        # manquent vraiment : chemin bruyant, et surtout JAMAIS une limite de
        # capacité, qui ferait croire que la source a répondu moins large.
        DegradeReason.REQUEST_REJECTED,
    ],
)
def test_a_real_failure_is_never_downgraded_to_a_capability(reason: str) -> None:
    assert degrade_kind(reason) is None
    # Forme historique préservée au bit près : les pannes ne gagnent PAS de
    # champ. L'absence de `kind` EST le signal « panne » côté écran.
    assert degraded_entry("pappers", reason) == {"source": "pappers", "reason": reason}


def test_the_three_resolution_reasons_carry_their_own_nature() -> None:
    """#2469 — la paire raison ↔ nature vit à UN seul endroit.

    Les trois raisons de la résolution SIREN étaient des phrases françaises
    construites sur place, chacune avec son ``kind`` écrit à la main juste à
    côté. Deux tables pour un même fait : elles divergent au premier ajout. La
    nature se DÉDUIT désormais de la raison, et les trois natures restent
    strictement distinctes — les confondre afficherait un verdict jamais rendu.
    """
    assert degrade_kind(SIREN_AMBIGUOUS_REASON) == KIND_AMBIGUOUS
    assert degrade_kind(SIREN_UNREACHABLE_REASON) == KIND_UNREACHABLE
    assert degrade_kind(SIREN_NOT_EXAMINED_REASON) == KIND_NOT_EXAMINED
    assert len({KIND_AMBIGUOUS, KIND_UNREACHABLE, KIND_NOT_EXAMINED}) == 3
    # Un secteur d'écran non reconnu est une PANNE au sens de l'affichage : le
    # resserrement demandé n'a pas eu lieu, et le taire laisserait croire que le
    # territoire est plus pauvre qu'il ne l'est.
    assert degrade_kind(UNKNOWN_SECTOR_REASON) is None


def test_an_unknown_reason_defaults_to_a_failure() -> None:
    """Fail-loud : une raison qu'on ne connaît pas est traitée comme une panne."""
    assert degrade_kind("some_future_reason") is None
    assert degraded_entry("x", "some_future_reason") == {"source": "x", "reason": "some_future_reason"}


def test_no_match_is_an_answer_not_a_failure() -> None:
    """« Aucune entreprise ne correspond » est un FAIT, rendu par une source qui
    marche. Le peindre en ambre a exactement le même effet que le reste : le
    bandeau devient du bruit permanent (Pappers ne matche rien → la source
    gouv.fr prend le relais et rend 24 lignes → bandeau ambre quand même)."""
    assert degrade_kind(NO_MATCH_REASON) == KIND_NO_MATCH


# ── L'entrée produite : elle NOMME le critère non honoré ────────────────────


def test_a_capability_entry_names_the_criteria_it_could_not_apply() -> None:
    entry = degraded_entry("pappers", DegradeReason.UNSUPPORTED_FILTERS, fields=["sector"])
    assert entry == {
        "source": "pappers",
        "reason": DegradeReason.UNSUPPORTED_FILTERS,
        "kind": KIND_CAPABILITY,
        "fields": ["sector"],
    }


def test_fields_are_omitted_rather_than_guessed() -> None:
    """Ne pas savoir QUEL critère a sauté est acceptable ; en inventer un ne
    l'est pas. Sans liste, l'écran retombe sur une phrase générique vraie."""
    entry = degraded_entry("pappers", DegradeReason.UNSUPPORTED_FILTERS)
    assert entry == {
        "source": "pappers",
        "reason": DegradeReason.UNSUPPORTED_FILTERS,
        "kind": KIND_CAPABILITY,
    }


def test_a_failure_never_carries_fields_even_if_offered() -> None:
    """`fields` décrit « ce que je n'ai pas su exprimer » — une source tombée
    n'a rien exprimé du tout, et le sous-entendre serait faux."""
    assert degraded_entry("pappers", DegradeReason.QUOTA_EXCEEDED, fields=["sector"]) == {
        "source": "pappers",
        "reason": DegradeReason.QUOTA_EXCEEDED,
    }


# ── Bout en bout : la recherche de l'utilisateur ────────────────────────────


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


@pytest.fixture
def sources(monkeypatch):
    """Les deux sources répondent, sans réseau : le cas de la capture d'écran."""

    class _Spy:
        def __init__(self, rows: list[dict] | None = None) -> None:
            self.rows = rows or []
            self.calls: list[tuple[Any, int]] = []

        async def __call__(self, filters, limit, degraded=None):
            self.calls.append((filters, limit))
            return self.rows

    registry = _Spy([{"name": "ACME", "siren": "123456789"}])
    fallback = _Spy()
    monkeypatch.setattr("app.routers.discover._registry_search", registry)
    monkeypatch.setattr("app.routers.discover._fallback_search", fallback)
    return registry, fallback


def _entries(response, source: str) -> list[dict]:
    return [entry for entry in response.json()["degraded"] if entry["source"] == source]


def test_the_screenshot_case_is_tagged_a_capability_not_a_failure(client: TestClient, sources) -> None:
    """Secteur « Informatique & numérique » → section NAF J, que Pappers
    n'expose pas. La liste rendue est un SUR-ensemble."""
    response = client.post("/discover/registry", json={"filters": {"sector": "it", "department": "69"}})

    assert response.status_code == 200
    assert _entries(response, "pappers") == [
        {
            "source": "pappers",
            "reason": DegradeReason.UNSUPPORTED_FILTERS,
            "kind": KIND_CAPABILITY,
            "fields": ["sector"],
        }
    ]


def test_a_city_in_plain_words_names_the_city_criterion(client: TestClient, sources) -> None:
    """Chez Pappers, `q` cherche une raison sociale : « Lyon » y ramènerait les
    sociétés NOMMÉES Lyon. Le critère sauté est la ville, et on le dit."""
    response = client.post("/discover/registry", json={"filters": {"department": "69", "city": "Lyon"}})

    assert _entries(response, "pappers")[0]["fields"] == ["city"]


def test_two_unhonoured_criteria_are_both_named(client: TestClient, sources) -> None:
    response = client.post("/discover/registry", json={"filters": {"sector": "it", "city": "Lyon"}})

    assert _entries(response, "pappers")[0]["fields"] == ["sector", "city"]


def test_a_postal_code_city_is_honoured_so_nothing_is_flagged(client: TestClient, sources) -> None:
    """Pappers filtre bien par code postal — aucune limite à signaler."""
    response = client.post("/discover/registry", json={"filters": {"city": "69003"}})

    assert _entries(response, "pappers") == []


def test_a_source_that_matched_nothing_is_tagged_no_match(client: TestClient, sources) -> None:
    """Pappers rend 0 ligne, la source gouv.fr aussi : deux réponses, zéro
    panne. Le contenu reste dans `degraded` (un client déployé avant l'IA doit
    pouvoir le lire), mais il est CADRÉ."""
    registry, _ = sources
    registry.rows = []

    response = client.post("/discover/registry", json={"filters": {"nafCode": "62.02A"}})

    for source in ("pappers", "recherche-entreprises"):
        assert {"source": source, "reason": NO_MATCH_REASON, "kind": KIND_NO_MATCH} in response.json()["degraded"]


def test_an_exploded_source_stays_a_loud_failure(client: TestClient, monkeypatch) -> None:
    """Le garde-fou du lot : une vraie panne ne doit RIEN gagner qui la
    déguiserait en limite de capacité."""

    async def _boom(filters, limit, degraded=None):
        raise RuntimeError("connection reset")

    async def _empty(filters, limit, degraded=None):
        return []

    monkeypatch.setattr("app.routers.discover._registry_search", _boom)
    monkeypatch.setattr("app.routers.discover._fallback_search", _empty)

    response = client.post("/discover/registry", json={"filters": {"nafCode": "62.02A"}})

    pappers = _entries(response, "pappers")
    assert pappers == [{"source": "pappers", "reason": "connection reset"}]
    assert "kind" not in pappers[0]
