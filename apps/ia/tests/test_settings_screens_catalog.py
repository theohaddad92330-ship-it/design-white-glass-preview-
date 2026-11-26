"""#1822 — le catalogue des écrans de réglages que Laura connaît.

Le geste empêché : quelqu'un demande « où je change X ? » et Laura DEVINE une
route de réglages. Le piège est déjà payé une fois dans ce dépôt (`/messagerie`
au lieu de `/mailbox`) — une route inventée par un modèle de langage n'est pas
une supposition inoffensive, c'est un 404.

`chat_tools.SETTINGS_SCREENS` est la liste que `propose_guided_action` connaît.
Elle DÉRIVE de `apps/web/src/components/sidebar/items.settings.ts` — la barre
latérale des Réglages, déjà la source unique de ces routes côté web
(`sections.test.ts::settingsRoutes()`) — au lieu d'être recopiée à la main :
une liste recopiée dérive au premier écran de réglages ajouté sans que
personne n'y pense.

Trois preuves qu'une garde doit apporter (CLAUDE.md § Doctrine) :

1. elle LIT quelque chose (le fichier réel, sur le disque — pas une fixture) ;
2. elle sait dire NON (un catalogue qu'on abîme volontairement doit échouer) ;
3. elle n'attrape pas ce qu'elle ne vise pas (une route d'un AUTRE écran de la
   nav, comme `/accounts`, ne doit jamais être exigée ici).
"""

from __future__ import annotations

import re
from pathlib import Path

from app.services import chat_tools

ITEMS_SETTINGS_TS = (
    Path(__file__).resolve().parents[2] / "web" / "src" / "components" / "sidebar" / "items.settings.ts"
)


# ÉCRANS SANS ENTRÉE DE MENU — ce que cette garde a confondu jusqu'au 25/10/2026.
#
# Elle comparait le catalogue de Laura à la BARRE LATÉRALE, comme si « écran de
# réglages » et « entrée de menu » étaient la même chose. Ils ne le sont plus :
# #4535, #4532 et #4533 ont retiré trois ENTRÉES sans retirer les PAGES, qui
# restent atteignables et dont un commercial parle encore à Laura. Retirer ces
# écrans du catalogue pour faire taire la garde aurait rendu Laura amnésique sur
# trois pages vivantes — « une garde protège une règle, elle ne l'invente pas ».
#
# La règle est : Laura connaît CHAQUE écran de réglages. Un écran sans entrée de
# menu se nomme ICI, avec sa raison. La garde garde ses dents : une page neuve
# non cataloguée, ou une entrée de menu neuve non cataloguée, font toujours rougir.
#
# ⚠️ Le MÊME registre existe côté TypeScript, dans
# `apps/api/src/modules/copilot-bridge/laura-settings-catalog.spec.ts` : les deux
# gardes lisent le même fichier de barre latérale et doivent dire la même chose.
ECRANS_SANS_ENTREE_DE_MENU: dict[str, str] = {
    # #4535 (25/10/2026, défait la PR #1255) — l'entrée « Raccourcis clavier » a quitté la
    # barre latérale ; la page vit, et « Préférences » s'allume dessus (`searchKeys`).
    "/settings/shortcuts": (
        "l'entrée de menu a été retirée par #4535 ; la page reste, ouverte depuis Préférences › Raccourcis"
    ),
    # #4532 / #4533 (25/10/2026, revient sur #3950) — « Mes données » est devenue deux onglets
    # Exports · Imports ; les deux pages gardent leur route propre, sans entrée dédiée.
    "/settings/vivier-export": "onglet d'Exports depuis #4532 ; la route reste celle de l'export ATS en lot",
    "/settings/import": "onglet d'Imports depuis #4533 ; la route reste celle de la reprise d'une base",
}

ROUTES_DIR = Path(__file__).resolve().parents[2] / "web" / "src" / "routes"


def _routes_in_sidebar() -> set[str]:
    """Les routes que `items.settings.ts` déclare réellement, lues sur le
    disque — pas une copie locale de ce qu'on croit qu'il contient."""
    assert ITEMS_SETTINGS_TS.exists(), f"introuvable : {ITEMS_SETTINGS_TS}"
    source = ITEMS_SETTINGS_TS.read_text(encoding="utf-8")
    return set(re.findall(r"to:\s*'(/[^']*)'", source))


def _routes_declared_on_disk() -> set[str]:
    """Tous les écrans de réglages : ceux du menu, plus ceux qui n'y sont plus
    mais dont la page existe encore (nommés ci-dessus avec leur raison)."""
    return _routes_in_sidebar() | set(ECRANS_SANS_ENTREE_DE_MENU)


def test_a_screen_without_a_menu_entry_really_exists_and_says_why() -> None:
    """Une exception qui n'en est plus une se retire : la page doit exister sur
    le disque, et elle ne doit PAS être revenue au menu."""
    sidebar = _routes_in_sidebar()
    for route, raison in ECRANS_SANS_ENTREE_DE_MENU.items():
        page = ROUTES_DIR / f"{route.removeprefix('/')}.tsx"
        assert page.exists(), f"{route} : page absente du disque — ce n'est pas une exception, c'est un reste"
        assert route not in sidebar, f"{route} : revenu au menu, retire-le de ce registre"
        assert len(raison) > 30, f"{route} : une exception sans raison écrite n'est pas une exception"


def _routes_in_catalogue() -> set[str]:
    return {str(entry["route"]) for entry in chat_tools.SETTINGS_SCREENS}


def _diff(catalogue: set[str], disk: set[str]) -> tuple[set[str], set[str]]:
    """(routes en trop dans le catalogue, routes manquantes au catalogue)."""
    return catalogue - disk, disk - catalogue


# ── 1. La garde LIT quelque chose ────────────────────────────────────────────


def test_the_disk_file_is_actually_read() -> None:
    disk_routes = _routes_declared_on_disk()
    assert len(disk_routes) >= 18, "corpus vide ou anormalement court : la lecture a raté"
    assert "/settings/profile" in disk_routes
    assert "/settings/import" in disk_routes


# ── 2. Le catalogue Python ne diverge pas de la source ───────────────────────


def test_the_catalogue_matches_the_real_settings_routes_exactly() -> None:
    extra, missing = _diff(_routes_in_catalogue(), _routes_declared_on_disk())
    assert not extra, f"le catalogue connaît une route qui n'existe plus : {extra}"
    assert not missing, f"un écran de réglages existe sans que Laura le connaisse : {missing}"


def test_every_catalogue_entry_has_a_one_sentence_description_and_no_vendor_name() -> None:
    forbidden = ("hubspot", "boondmanager", "salesconnect", "salesforce", "pipedrive", "attio", "google", "microsoft")
    for entry in chat_tools.SETTINGS_SCREENS:
        description = str(entry["description"])
        assert description, entry["route"]
        assert not any(word in description.lower() for word in forbidden), entry["route"]
        assert isinstance(entry["manager_only"], bool), entry["route"]


# ── 3. La garde SAIT DIRE NON ────────────────────────────────────────────────


def test_the_comparison_catches_a_deliberately_broken_catalogue() -> None:
    """Preuve que `_diff` (donc la garde ci-dessus) échoue vraiment quand le
    catalogue se désynchronise — sans ça, un catalogue toujours vide passerait
    aussi bien qu'un catalogue juste."""
    real_disk = _routes_declared_on_disk()

    # Une route en trop, jamais déclarée par la nav.
    extra, missing = _diff(real_disk | {"/settings/invente"}, real_disk)
    assert extra == {"/settings/invente"}
    assert not missing

    # Une route manquante, retirée du catalogue.
    one_real_route = next(iter(real_disk))
    extra, missing = _diff(real_disk - {one_real_route}, real_disk)
    assert not extra
    assert missing == {one_real_route}


# ── 4. La garde N'ATTRAPE PAS ce qu'elle ne vise pas ─────────────────────────


def test_a_route_from_a_different_screen_of_the_nav_is_not_required_here() -> None:
    """Témoin : `/accounts` est une route bien réelle de l'application (déclarée
    dans `items.ts`, pas `items.settings.ts`) — elle ne doit JAMAIS être exigée
    du catalogue des réglages, sans quoi la garde confondrait deux fichiers."""
    disk_routes = _routes_declared_on_disk()
    assert "/accounts" not in disk_routes
    assert "/accounts" not in _routes_in_catalogue()


# ── Ce que le catalogue promet aux autres tests ──────────────────────────────


def test_manager_only_screens_match_the_known_set() -> None:
    # Relevé dans `apps/web/src/components/sidebar/items.settings.ts` — c'est LUI
    # la source, ce test n'en est que le miroir. Un écran ajouté sans mise à jour
    # de ce relevé se voit, et c'est exactement ce qui s'est passé le 21/09/2026 :
    # la garde a rougi sur les deux réglages d'espace de la vague 3, tous deux
    # `managerOnly: true` côté web (`items.settings.ts:174` et `:178-183`).
    # 10/09/2026 : six écrans. 21/09/2026 : huit.
    #
    # ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
    # concurrentes : `/settings/commercial-priority` a été RETIRÉ du catalogue
    # avec son écran (ses deux sujets sont couverts par les deux entrées
    # ci-dessous). Le relevé reste à HUIT parce que cet écran était
    # `manager_only: False` — il ne comptait pas ici. Vérifié, pas supposé : le
    # jeu attendu est inchangé, et aucun seuil n'a été relâché pour le faire
    # passer.
    expected = {
        "/settings/import",
        "/settings/activity",
        "/settings/catalogues",
        "/settings/lexicon",
        "/settings/pipeline",
        "/settings/branding",
        # #2035.10 / #2035.11 — le serveur exige déjà `team:manage` en écriture
        # sur les deux ; masquer l'entrée n'y ferme aucune porte, elle évite
        # juste de promettre un réglage inatteignable. Depuis la fusion du
        # 21/09, ces deux écrans portent TOUS les réglages de leur sujet.
        "/settings/reverse-market",
        "/settings/commercial-load",
    }
    manager_only = {e["route"] for e in chat_tools.SETTINGS_SCREENS if e["manager_only"]}
    assert manager_only == expected
