"""#1903 / #1904 — `propose_guided_action` ne DEVINE plus aucun écran de l'application.

Avant ce lot, seules les routes de RÉGLAGES étaient vérifiées
(`test_chat_guided_action_settings_routes.py`). Le reste passait tel quel :
`/decouvrir` était proposé, la carte s'affichait, et le clic mourait sur la
liste blanche du web (`appRouteTarget`, GA-277) — « Ouvrir » qui ne s'ouvre pas,
sans que rien ne dise pourquoi. Et `/actions/sequences` n'était NOMMÉ nulle part
côté IA : Laura ne pouvait qu'en deviner l'adresse.

`chat_tools.APP_SCREENS` est la liste des écrans de la navigation que l'outil
connaît. Elle DÉRIVE de `apps/web/src/components/navigation/sections.ts` — la
barre latérale et ses onglets, déjà la source des routes que le web autorise
(`allNavRoutes`) — et les fiches (`/accounts/<id>`…) de
`apps/web/src/components/navigation/known-routes.ts`. Les deux fichiers sont
relus sur le disque : une liste recopiée dérive au premier onglet déplacé.

Trois preuves (CLAUDE.md § Doctrine) : la garde LIT (le vrai fichier), elle sait
dire NON (un catalogue abîmé échoue), elle n'attrape pas ce qu'elle ne vise pas
(un `to:` écrit dans un COMMENTAIRE n'est pas une route).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services import chat_tools
from tests.web_navigation import nav_routes, nav_routes_in, off_nav_routes, off_nav_routes_in, strip_comments

WEB_NAVIGATION = Path(__file__).resolve().parents[2] / "web" / "src" / "components" / "navigation"
KNOWN_ROUTES_TS = WEB_NAVIGATION / "known-routes.ts"

USER = "22222222-2222-4222-8222-222222222222"


def _nav_routes_on_disk() -> set[str]:
    return nav_routes()


def _off_nav_screens_on_disk() -> set[str]:
    """Les écrans SERVIS qui ont quitté la navigation (#2151.1).

    `/accounts/partners` n'est plus un onglet de Comptes depuis la vague 5, et son écran
    est toujours servi : on y entre depuis le bloc « Mes recherches et alertes »
    de /discover, depuis un lien déjà parti, depuis un favori. Le catalogue de
    Laura doit donc continuer de le connaître — le retirer reviendrait à cesser
    d'emmener quelqu'un là où il peut se trouver. Le web déclare la liste à un
    seul endroit (`off-nav-screens.ts`) et ce module la relit : une seconde liste
    ici divergerait au premier écran ajouté.
    """
    return off_nav_routes()


def _ts_const_array(name: str) -> tuple[str, ...]:
    assert KNOWN_ROUTES_TS.exists(), f"introuvable : {KNOWN_ROUTES_TS}"
    source = strip_comments(KNOWN_ROUTES_TS.read_text(encoding="utf-8"))
    match = re.search(rf"export const {name} = \[(.*?)\] as const", source, flags=re.DOTALL)
    assert match, f"{name} introuvable dans known-routes.ts"
    return tuple(re.findall(r"'(/[^']*)'", match.group(1)))


def _app_catalogue_routes() -> set[str]:
    return {str(entry["route"]) for entry in chat_tools.APP_SCREENS}


def _settings_catalogue_routes() -> set[str]:
    return {str(entry["route"]) for entry in chat_tools.SETTINGS_SCREENS}


def _diff(catalogue: set[str], expected: set[str]) -> tuple[set[str], set[str]]:
    return catalogue - expected, expected - catalogue


async def _propose(route: str, label: str = "Séquences", highlight: str | None = None) -> dict:
    payload: dict = {"route": route, "label": label}
    if highlight is not None:
        payload["highlight"] = highlight
    return await chat_tools.execute_chat_tool("propose_guided_action", payload, user_id=USER, profile_data=None)


# ── 1. La garde LIT quelque chose ────────────────────────────────────────────


def test_the_navigation_file_is_actually_read() -> None:
    routes = _nav_routes_on_disk()
    # 35 → 30 le 14/10/2026 (ménage Pilotage L0a : trois onglets retirés de la navigation, 36 → 33).
    # 30 → 22 le 15/10/2026 (L6, #4197 : Missions passe de treize onglets à trois, ses huit écrans de
    # gestion deviennent des écrans hors navigation — `off-nav-screens.ts`).
    # Le plancher prouve que la lecture LIT quelque chose ; il suit la navigation, il ne la fige pas.
    # 22 → 18 le 19/10/2026 (vague 4 : Affaires et Talents sans onglet #4340/#4344/#4349, « En cours »
    # quitte Missions #4351.1, Automatisations fondu dans Séquences #4357).
    assert len(routes) >= 18, f"corpus anormalement court ({len(routes)}) : la lecture a raté"
    assert "/actions/sequences" in routes
    assert "/contacts" in routes


def test_the_detail_prefixes_are_actually_read() -> None:
    assert "/accounts" in _ts_const_array("LINKABLE_DETAIL_PREFIXES")
    assert _ts_const_array("LINKABLE_DETAIL_SUBSCREENS")


def test_the_off_nav_declaration_is_actually_read() -> None:
    # Le SECOND corpus de la comparaison. S'il revenait vide, la garde
    # réclamerait de nouveau qu'on DÉCLASSE des écrans toujours servis — et elle
    # le ferait en étant verte, ce qui est le pire des deux.
    screens = _off_nav_screens_on_disk()
    assert screens, "corpus vide : la lecture d'off-nav-screens.ts a raté"
    assert "/accounts/partners" in screens
    # ⚠️ Ces écrans ne sont PAS des destinations de la barre : si la déclaration
    # se mettait à les écrire `to:`, `_nav_routes_on_disk()` les recompterait
    # comme des onglets et la distinction disparaîtrait en silence.
    assert not (screens & _nav_routes_on_disk())


# ── 2. Le catalogue Python ne diverge pas du web ─────────────────────────────


def test_the_app_catalogue_matches_the_navigation_exactly() -> None:
    # `/settings` est aussi une entrée de la barre : il vit déjà dans le
    # catalogue des réglages, et le compter deux fois l'annoncerait deux fois.
    # #2151.1 — « dans la navigation » et « servi, donc liable » sont deux
    # ensembles différents : un écran sorti des onglets reste un écran où Laura
    # peut emmener quelqu'un, tant que le web le DÉCLARE avec sa raison.
    expected = (_nav_routes_on_disk() | _off_nav_screens_on_disk()) - _settings_catalogue_routes()
    extra, missing = _diff(_app_catalogue_routes(), expected)
    assert not extra, f"le catalogue connaît un écran que la navigation n'a plus : {extra}"
    assert not missing, f"un écran de la navigation existe sans que Laura le connaisse : {missing}"


def test_the_detail_shapes_mirror_what_the_web_accepts() -> None:
    assert tuple(chat_tools.APP_DETAIL_PREFIXES) == _ts_const_array("LINKABLE_DETAIL_PREFIXES")
    assert tuple(chat_tools.APP_DETAIL_SUBSCREENS) == _ts_const_array("LINKABLE_DETAIL_SUBSCREENS")


def test_every_app_screen_has_a_description_and_no_vendor_name() -> None:
    forbidden = (
        "hubspot",
        "boondmanager",
        "salesforce",
        "pipedrive",
        "attio",
        "google",
        "microsoft",
        "gmail",
        "outlook",
    )
    for entry in chat_tools.APP_SCREENS:
        description = str(entry["description"])
        assert description.strip(), entry["route"]
        assert not any(word in description.lower() for word in forbidden), entry["route"]


# ── 3. La garde SAIT DIRE NON ────────────────────────────────────────────────


def test_the_comparison_catches_a_deliberately_broken_catalogue() -> None:
    real = _nav_routes_on_disk()
    extra, missing = _diff(real | {"/decouvrir"}, real)
    assert extra == {"/decouvrir"} and not missing
    one = next(iter(real))
    extra, missing = _diff(real - {one}, real)
    assert not extra and missing == {one}


# ── 4. La garde N'ATTRAPE PAS ce qu'elle ne vise pas ─────────────────────────


def test_a_route_written_in_a_comment_is_not_a_route() -> None:
    source = """
    // { to: '/fantome-ligne', labelKey: 'x' },
    /* { to: '/fantome-bloc', labelKey: 'y' } */
    { to: '/reel', labelKey: 'z' }, // { to: '/fantome-fin' }
    """
    assert nav_routes_in(source) == {"/reel"}


def test_an_off_nav_screen_is_not_a_navigation_destination() -> None:
    # Le témoin de la distinction, sur du texte FABRIQUÉ : un seul lecteur, deux
    # questions, deux réponses. Les mélanger rendrait la garde incapable de voir
    # qu'un écran a quitté la barre — et c'est ce mélange qui l'a mise en défaut.
    declaration = """
    { route: '/servi-hors-nav', sectionKey: 'accounts' },
    // { route: '/fantome', sectionKey: 'accounts' },
    """
    assert off_nav_routes_in(declaration) == {"/servi-hors-nav"}
    assert nav_routes_in(declaration) == set()
    assert off_nav_routes_in("{ to: '/un-onglet', labelKey: 'x' }") == set()


# ── Ce que l'outil fait de ce catalogue ──────────────────────────────────────


@pytest.mark.asyncio
async def test_a_navigation_screen_that_was_never_named_is_proposed() -> None:
    # #1903.10 — Séquences n'était nommé nulle part côté IA.
    result = await _propose("/actions/sequences")
    assert "error" not in result, result
    assert result["proposal"]["route"] == "/actions/sequences"


@pytest.mark.asyncio
async def test_every_app_screen_is_individually_accepted_without_a_reason() -> None:
    for entry in chat_tools.APP_SCREENS:
        result = await _propose(str(entry["route"]))
        assert "error" not in result, entry["route"]


@pytest.mark.asyncio
async def test_a_prefilled_screen_keeps_its_query() -> None:
    # #1903.5 — l'écran Contacts lit `?company=` : le filtre voyage dans la route.
    result = await _propose("/contacts?company=SOCOTEC", label="Contacts")
    assert "error" not in result, result
    assert result["proposal"]["route"] == "/contacts?company=SOCOTEC"


@pytest.mark.asyncio
async def test_a_record_with_its_identifier_is_proposed() -> None:
    # #1903.15 — la redirection porte l'identifiant du compte.
    result = await _propose("/accounts/acb96868-d191-40b2-9c70-e2adc42c69ab", label="Dossier SOCOTEC")
    assert "error" not in result, result


@pytest.mark.asyncio
async def test_the_matching_tab_of_a_need_is_proposed() -> None:
    # #3267 (recette du 30/09) — `run_matching` rend un classement pour un
    # besoin, mais Laura ne pouvait jamais renvoyer vers l'écran qui le montre
    # (`/projects/needs/<id>?tab=matching`) : `/projects/needs` manquait à
    # `APP_DETAIL_PREFIXES`. Même défaut, même preuve que le marché inverse
    # d'un consultant (#1903 / #1933.5) juste au-dessus.
    assert "/projects/needs" in chat_tools.APP_DETAIL_PREFIXES
    result = await _propose(
        "/projects/needs/acb96868-d191-40b2-9c70-e2adc42c69ab?tab=matching", label="Voir le classement"
    )
    assert "error" not in result, result


@pytest.mark.asyncio
async def test_the_reverse_market_of_a_consultant_is_proposed() -> None:
    result = await _propose("/consultants/a800466a-4194-4394-bd74-8d15a52df24f/reverse-market", label="Reverse market")
    assert "error" not in result, result


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "route",
    [
        "/decouvrir",  # l'écran est `/discover`
        "/messagerie",  # l'incident déjà servi en production
        "/accounts/un-id/sous/trop/loin",
        "/consultants/un-id/autre-chose",
        "//ailleurs.example",
        "/accounts/../bak/home",
        "/bak/home",  # existe au routeur, n'est PAS un écran client
    ],
)
async def test_an_unknown_screen_is_refused_before_the_card_exists(route: str) -> None:
    result = await _propose(route)
    assert "error" in result, route
    assert "proposal" not in result
    assert "devine" in result["error"]


def test_the_tool_description_names_every_app_screen() -> None:
    description = str(next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "propose_guided_action")["description"])
    for entry in chat_tools.APP_SCREENS:
        assert f"`{entry['route']}`" in description, entry["route"]
