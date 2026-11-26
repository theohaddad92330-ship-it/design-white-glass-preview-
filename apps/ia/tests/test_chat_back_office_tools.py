"""Les cinq outils du back-office (PDF 2 §5.1).

Le §5.1 nomme douze outils qui lisent le back-office ; sept existaient. Les cinq
ajoutés ici sont exactement ceux qui touchent à l'argent et aux personnes — et
c'est ce qui rend leurs garanties intéressantes à tenir en test :

1. **Un montant absent ne se dit JAMAIS « 0 ».** Un pipe dont aucun projet n'est
   chiffré ne vaut pas zéro euro : il n'est pas mesuré. Les deux se réparent à
   deux endroits opposés — l'un fait appeler ses clients, l'autre fait remplir
   des fiches.
2. **Le coût chargé ne sort jamais vers le modèle** (§5.3). Ni ici, ni par le
   pont : le chiffre d'affaires n'en a pas besoin.
3. **Laura hérite du rôle de l'appelant** (§5.3). Sans droit financier, le pont
   refuse — et l'outil DIT le refus au lieu d'annoncer un montant nul.
4. **« Enregistrer un consultant » n'enregistre pas.** Le §5.3 est explicite :
   « ouvre le formulaire prérempli, elle ne l'enregistre pas seule ». La
   garantie n'est pas une consigne : il n'existe aucun chemin d'écriture.
5. **Rien n'est deviné.** Un mot hors du vocabulaire des contraintes SQL, une
   date illisible : le champ reste absent plutôt que d'entrer dans le vivier
   comme un fait que personne n'a énoncé.
"""

from __future__ import annotations

import inspect

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"

#: Les quatre LECTURES. « Enregistrer un consultant » n'en est pas : il ne lit
#: rien et n'écrit rien.
READ_TOOLS = ("get_pipeline", "get_revenue", "get_capacity", "get_overdue_payments")


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


# ── Ce que le catalogue promet ───────────────────────────────────────────────


def test_the_five_tools_are_declared() -> None:
    # Une garde doit LIRE quelque chose : si le catalogue se vide ou si un nom
    # est renommé, ce test le dit au lieu de rester vert sur un corpus absent.
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert {*READ_TOOLS, "prepare_consultant_record"} <= names


def test_the_new_tools_are_appended_never_inserted() -> None:
    # Insérer un outil au milieu invaliderait le préfixe d'outils mis en cache
    # pour tous les tours suivants, et le copilote est le premier poste de la
    # facture.
    #
    # ⚠️ Ce test lisait `CHAT_TOOLS[-5:]` — « les cinq du back-office ferment la
    # liste ». Il gardait donc DEUX choses à la fois : que ces cinq-là sont
    # groupés en fin de liste, et que plus jamais aucun outil ne serait ajouté.
    # La seconde n'est pas la règle : la règle est qu'on AJOUTE en fin, ce qui
    # arrive forcément un jour (les cinq du second marché, tome 6 §16). Ce qui
    # se vérifie est donc que ces cinq restent CONSÉCUTIFS, dans l'ordre, et
    # qu'aucun outil n'a été glissé au milieu d'eux.
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    expected = [*READ_TOOLS, "prepare_consultant_record"]
    first = names.index(expected[0])
    assert names[first : first + len(expected)] == expected


def test_no_editor_name_leaks_into_a_tool_description() -> None:
    # « On nomme la CAPACITÉ, jamais l'éditeur. » Les descriptions partent au
    # modèle : un nom d'outil comptable ici ressortirait dans une phrase lue
    # devant un client.
    forbidden = ("qonto", "tiime", "pennylane", "sage", "boondmanager", "hubspot", "salesforce")
    for name in (*READ_TOOLS, "prepare_consultant_record"):
        tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)
        description = str(tool["description"]).lower()
        assert not any(word in description for word in forbidden), name


def test_overdue_payments_description_documents_finance_forbidden() -> None:
    """LOT 15, arbitrage B — `invoicing/overdue` peut désormais refuser.

    La description est le SEUL endroit où ce nouveau comportement peut se dire
    au modèle : `chat_tools.py` relaie `result` tel quel pour cet outil (voir
    le bloc `if name == "get_overdue_payments":`), qui n'est PAS dans le
    périmètre de ce lot. Sans cette phrase, Laura recevrait littéralement
    `{"error": "finance_forbidden"}` sans savoir que c'est un refus de DROIT et
    non une panne de la facturation.
    """
    description = str(chat_tools.OVERDUE_PAYMENTS_TOOL["description"])
    assert "finance_forbidden" in description
    # Le même vocabulaire que `get_revenue` / `get_capacity` : « dis-le »,
    # jamais « annonce zéro impayé ».
    assert "n'a pas le droit" in description or "n’a pas le droit" in description


def test_timesheets_description_documents_finance_forbidden() -> None:
    """LOT 15, arbitrage B — `timesheets/month` peut désormais refuser.

    ⚠️ Plus grave que `get_overdue_payments` : le handler `get_timesheets`
    RECONSTRUIT sa réponse (`result.get("items") or []`) au lieu de la
    relayer — un refus `finance_forbidden` s'y perd et ressort `{"lines": []}`,
    qui se lit « aucun relevé ne manque ». Corriger le handler est HORS
    périmètre de ce lot (chat_tools.py ne s'édite ici que sur la DESCRIPTION) ;
    ce test tient au moins la moitié qui l'est, et le rapport de session porte
    l'autre moitié.
    """
    description = str(chat_tools.GET_TIMESHEETS_TOOL["description"])
    assert "finance_forbidden" in description


# ── Sans pont : on le DIT, on ne rend pas du vide ────────────────────────────


@pytest.mark.asyncio
async def test_read_tools_refuse_rather_than_returning_an_empty_answer() -> None:
    """Un pipe vide et un pipe qu'on n'a pas pu lire ne se disent pas pareil."""
    for name in READ_TOOLS:
        result = await _run(name)
        assert "error" in result, name
        # Aucune liste peuplée, aucun montant : un zéro ici serait une réponse,
        # et une fausse.
        assert not any(isinstance(value, (list, int, float)) and value for value in result.values()), name


@pytest.mark.asyncio
async def test_bridge_makes_zero_network_calls_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert await bellum_api.pipeline_summary(USER) is None
    assert await bellum_api.revenue_breakdown(USER) is None
    assert await bellum_api.capacity(USER) is None
    assert await bellum_api.overdue_payments(USER) is None


# ── Le rôle de l'appelant, et ce qu'il retire ────────────────────────────────


@pytest.mark.asyncio
async def test_revenue_says_forbidden_instead_of_announcing_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    """« Pas le droit » et « zéro euro » demandent deux gestes opposés.

    Le premier fait demander un accès ; le second fait douter de son propre
    travail. Les écrire pareil est le défaut que ce test empêche.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def forbidden(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"error": "finance_forbidden"}

    monkeypatch.setattr(bellum_api, "revenue_breakdown", forbidden)
    result = await _run("get_revenue")
    assert "droit" in result["error"]
    assert "0" not in result["error"]


def _revenue_result(amounts: dict[str, int | None]) -> dict[str, object]:
    return {
        "periodMonth": "2026-08-01",
        "lines": [
            {"kind": kind, "amountCents": amounts.get(kind), "withoutAmount": 0, "unavailableReason": None}
            for kind in ("signed", "produced", "invoiced", "collected")
        ],
    }


@pytest.mark.asyncio
async def test_revenue_gap_names_billing_delay_when_produced_outruns_invoiced(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#2425.8 — l'écart produit/facturé se NOMME, jamais un chiffre nu de plus.

    Laura ne doit pas deviner pourquoi le CA et le cash divergent : ce test
    fixe la cause quand le travail produit dépasse ce qui a été facturé — un
    retard de FACTURATION, distinct d'un retard d'encaissement (#2415.8 /
    `get_overdue_payments`).
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def breakdown(*_args: object, **_kwargs: object) -> dict[str, object]:
        return _revenue_result({"signed": 900_000, "produced": 500_000, "invoiced": 300_000, "collected": 280_000})

    monkeypatch.setattr(bellum_api, "revenue_breakdown", breakdown)
    result = await _run("get_revenue")
    gap = result["gapExplanation"]
    assert gap["notYetInvoicedCents"] == 200_000
    assert gap["notYetCollectedCents"] == 20_000
    assert gap["primaryCause"] == "billing_delay"


@pytest.mark.asyncio
async def test_revenue_gap_names_collection_delay_when_invoiced_outruns_collected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def breakdown(*_args: object, **_kwargs: object) -> dict[str, object]:
        return _revenue_result({"signed": 900_000, "produced": 500_000, "invoiced": 480_000, "collected": 100_000})

    monkeypatch.setattr(bellum_api, "revenue_breakdown", breakdown)
    result = await _run("get_revenue")
    gap = result["gapExplanation"]
    assert gap["notYetInvoicedCents"] == 20_000
    assert gap["notYetCollectedCents"] == 380_000
    assert gap["primaryCause"] == "collection_delay"


@pytest.mark.asyncio
async def test_revenue_gap_is_null_not_zero_when_a_line_is_unmeasurable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un montant absent ne s'additionne jamais à un montant connu (doctrine `null` ≠ 0)."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def breakdown(*_args: object, **_kwargs: object) -> dict[str, object]:
        return _revenue_result({"signed": 900_000, "produced": None, "invoiced": 300_000, "collected": 280_000})

    monkeypatch.setattr(bellum_api, "revenue_breakdown", breakdown)
    result = await _run("get_revenue")
    gap = result["gapExplanation"]
    # Le produit est non mesurable : le champ qui en dépend reste `None`,
    # jamais additionné à 0 — mais l'autre gap, lui, reste calculable.
    assert gap["notYetInvoicedCents"] is None
    assert gap["notYetCollectedCents"] == 20_000
    assert gap["primaryCause"] == "collection_delay"


def test_revenue_tool_description_tells_laura_how_to_cite_the_gap() -> None:
    description = str(chat_tools.REVENUE_TOOL["description"])
    assert "gapExplanation" in description
    assert "délai de facturation" in description.lower()
    assert "recouvrement" in description.lower()


@pytest.mark.asyncio
async def test_capacity_says_forbidden_instead_of_estimating_days(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def forbidden(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"error": "finance_forbidden"}

    monkeypatch.setattr(bellum_api, "capacity", forbidden)
    result = await _run("get_capacity")
    assert "droit" in result["error"]


@pytest.mark.asyncio
async def test_timesheets_says_forbidden_instead_of_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    """LOT 15, trou 1 — un refus `finance_forbidden` ne se RECONSTRUIT pas en liste vide.

    Le handler bâtissait sa réponse à partir de `result.get("items") or []` :
    un refus de droit s'y perdait silencieusement et ressortait
    `{"month": None, "lines": [], "summary": None}` — que Laura lirait
    « aucun CRA ne manque » à quelqu'un qui n'a simplement pas le droit de le
    savoir. Même garantie que `get_revenue` / `get_capacity` juste au-dessus :
    « pas le droit » et « rien à signaler » sont deux réponses opposées.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def forbidden(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"error": "finance_forbidden"}

    monkeypatch.setattr(bellum_api, "timesheets_month", forbidden)
    result = await _run("get_timesheets")
    assert "droit" in result["error"]
    # Le refus ne doit pas cohabiter avec la forme RECONSTRUITE : une clé
    # `lines` (même vide) dirait qu'on a quand même bâti une réponse de liste.
    assert "lines" not in result
    assert "month" not in result


@pytest.mark.asyncio
async def test_pipeline_relays_an_unmeasured_amount_as_null(monkeypatch: pytest.MonkeyPatch) -> None:
    """La règle vit à UN endroit : le pont. L'outil relaie, il ne re-décide pas.

    Recopier ici « toutes les lignes sans montant ⇒ null » ferait deux
    dérivations du même verdict, qui finiraient par diverger sur le cas limite
    (une colonne vide, où zéro est VRAI).
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def summary(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "columns": [{"stage": "qualified", "count": 12, "amount_cents": None, "without_amount": 12}],
            "total_amount_cents": None,
            "total_without_amount": 12,
            "total_count": 12,
        }

    monkeypatch.setattr(bellum_api, "pipeline_summary", summary)
    result = await _run("get_pipeline")
    assert result["total_amount_cents"] is None
    assert result["columns"][0]["amount_cents"] is None


# #R5-FIX (recette prod 14/10) — `/chat` a répondu « 2 112 100 000 centimes » sur une
# question d'opportunités : relayé TEL QUEL (doctrine ci-dessus), un montant en
# centimes dépend ENTIÈREMENT du modèle pour sa conversion — et il ne la fait pas
# toujours. Même famille que `opportunity_compiler.build_opportunity_summary`, qui
# formate déjà « Montant pressenti : N € » plutôt que de rendre `amount_cents` nu.
@pytest.mark.asyncio
async def test_pipeline_amounts_carry_a_ready_to_say_euro_label(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def summary(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "columns": [{"stage": "qualified", "count": 3, "amount_cents": 2_112_100_000, "without_amount": 0}],
            "total_amount_cents": 2_112_100_000,
            "total_without_amount": 0,
            "total_count": 3,
            "signed_amount_cents": 900_000,
        }

    monkeypatch.setattr(bellum_api, "pipeline_summary", summary)
    result = await _run("get_pipeline")
    assert result["total_amount_eur"] == "21 121 000 €"
    assert result["columns"][0]["amount_eur"] == "21 121 000 €"
    assert result["signed_amount_eur"] == "9 000 €"


@pytest.mark.asyncio
async def test_pipeline_unmeasured_amounts_never_get_a_euro_label(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un montant `None` reste `None` — aucune étiquette « 0 € » inventée dessus."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def summary(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "columns": [{"stage": "qualified", "count": 12, "amount_cents": None, "without_amount": 12}],
            "total_amount_cents": None,
            "total_without_amount": 12,
            "total_count": 12,
        }

    monkeypatch.setattr(bellum_api, "pipeline_summary", summary)
    result = await _run("get_pipeline")
    assert "total_amount_eur" not in result
    assert "amount_eur" not in result["columns"][0]


def test_pipeline_tool_description_tells_laura_to_cite_the_euro_label() -> None:
    description = str(chat_tools.PIPELINE_TOOL["description"])
    assert "amount_eur" in description or "_eur" in description


@pytest.mark.asyncio
async def test_overdue_payments_keeps_a_disputed_invoice_without_inventing_a_delay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def overdue(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "month": "2026-07",
            "items": [
                {"accountName": "ACME", "dueOn": None, "disputedAt": "2026-09-01T00:00:00Z", "reminderDue": None}
            ],
        }

    monkeypatch.setattr(bellum_api, "overdue_payments", overdue)
    result = await _run("get_overdue_payments")
    assert result["items"][0]["reminderDue"] is None
    assert result["items"][0]["dueOn"] is None


# ── « Enregistrer un consultant » n'enregistre pas ───────────────────────────


@pytest.mark.asyncio
async def test_preparing_a_consultant_never_touches_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le pont CONFIGURÉ, et pourtant aucun appel : la proposition est locale.

    C'est la formulation la plus forte de la garantie. Un outil qui n'appelle
    rien ne peut rien écrire, quel que soit l'état de la configuration.
    """
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("préparer une fiche ne doit toucher AUCUNE route")

    monkeypatch.setattr(bellum_api, "_post", _explode)

    result = await _run("prepare_consultant_record", {"full_name": "Marc Dupont", "engagement_kind": "freelance"})
    assert result["status"] == "pending_confirmation"
    assert result["proposal"]["full_name"] == "Marc Dupont"
    assert result["proposal"]["engagement_kind"] == "freelance"
    assert result["proposal"]["cost_credits"] == 0


def test_the_bridge_has_no_way_to_write_a_consultant() -> None:
    """Retirer le MOYEN, pas seulement la permission.

    Le test ne lit pas une intention : il énumère les fonctions publiques du
    client de pont et vérifie qu'aucune ne porte un verbe d'écriture. En ajouter
    une (`create_consultant`, `save_talent`…) fait tomber ce test, et c'est le
    but — la doctrine « le copilote propose, le clic écrit » n'est tenue que par
    l'absence de code.
    """
    functions = [
        name
        for name, value in vars(bellum_api).items()
        if not name.startswith("_") and inspect.iscoroutinefunction(value)
    ]
    # Le corpus n'est pas vide : une garde qui ne lit rien passe au vert.
    assert len(functions) >= 15
    write_verbs = ("create", "save", "update", "insert", "add", "write", "delete", "send", "post")
    assert [name for name in functions if name.startswith(write_verbs)] == []


@pytest.mark.asyncio
async def test_a_dictated_record_needs_a_name() -> None:
    result = await _run("prepare_consultant_record", {"title": "data engineer"})
    assert "error" in result


@pytest.mark.asyncio
async def test_a_dictated_record_drops_words_the_form_cannot_apply() -> None:
    """« Intérimaire » n'existe pas dans la contrainte SQL.

    Le transmettre produirait une fiche annoncée comme préremplie et un champ
    vide au moment du clic — la même règle que les filtres de Découvrir, dont
    un critère hors vocabulaire n'est pas transmis.
    """
    result = await _run(
        "prepare_consultant_record",
        {"full_name": "Marc", "kind": "intérimaire", "engagement_kind": "vacataire"},
    )
    assert "kind" not in result["proposal"]
    assert "engagement_kind" not in result["proposal"]


@pytest.mark.asyncio
async def test_a_dictated_record_refuses_an_unreadable_date() -> None:
    """Une disponibilité devinée entrerait dans le vivier comme un fait."""
    readable = await _run("prepare_consultant_record", {"full_name": "Marc", "available_from": "2026-09-01"})
    assert readable["proposal"]["available_from"] == "2026-09-01"

    guessed = await _run("prepare_consultant_record", {"full_name": "Marc", "available_from": "début septembre"})
    assert "available_from" not in guessed["proposal"]


@pytest.mark.asyncio
async def test_a_dictated_record_omits_what_was_not_said() -> None:
    # Un champ absent est une information : « on ne sait pas ». Le remplir d'un
    # défaut ferait passer une absence de réponse pour un arbitrage.
    result = await _run("prepare_consultant_record", {"full_name": "Marc"})
    assert set(result["proposal"]) == {"action", "route", "full_name", "cost_credits"}


@pytest.mark.asyncio
async def test_the_route_opens_the_form_prefilled_with_the_dictated_name() -> None:
    """#1903.16 / #1903.7 — `route` valait `/consultants` SANS `?new=1` : le
    clic atterrissait sur le vivier, formulaire fermé, nom perdu.

    `route` est le SEUL véhicule vers l'écran (cette branche n'a aucun autre
    canal) : `?new=` ouvre le formulaire — la troisième porte que l'écran sait
    déjà lire (BEL-BO-003) — et `?name=` le préremplit avec ce qui a été dicté.
    Vérifié en `parse_qs` plutôt qu'en chaîne exacte : l'ORDRE des paramètres
    n'est pas la garantie, leur PRÉSENCE et leur VALEUR le sont.
    """
    from urllib.parse import parse_qs, urlsplit

    result = await _run("prepare_consultant_record", {"full_name": "Aïcha O'Brien"})
    route = result["proposal"]["route"]
    split = urlsplit(route)
    assert split.path == "/consultants"
    query = parse_qs(split.query)
    assert query["new"] == ["true"]
    assert query["name"] == ["Aïcha O'Brien"]
