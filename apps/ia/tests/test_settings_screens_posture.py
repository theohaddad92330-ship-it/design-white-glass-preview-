"""#1822 — l'inventaire des postures nomme des outils qui EXISTENT vraiment.

`laura-settings-catalog.ts` (NestJS) porte, pour chacun des vingt écrans de
réglages, ce que Laura en fait : elle y ÉCRIT, elle y RENVOIE, ou c'est
INTERDIT. Quand elle écrit, `via` nomme la porte d'écriture ; quand un outil
sait lire l'écran, `readVia` le nomme.

Le geste que ce fichier empêche : qu'un de ces noms désigne un outil qui
n'existe pas — ou plus. L'inventaire se lirait alors comme une promesse tenue
(« la mémoire est lisible ») pendant que rien ne l'implémente, et il n'existe
AUCUNE suite capable de le voir : les tests TypeScript ne lisent pas
`chat_tools.py`, et les tests Python ne lisent pas le catalogue TypeScript.
C'est le motif que ce dépôt nomme « porte unique dans un seul langage », et sa
seule réponse est une garde qui traverse la frontière.

Trois preuves, comme toute garde du dépôt :

1. elle LIT quelque chose — le fichier TypeScript RÉEL, sur le disque, et le
   catalogue d'outils réel ;
2. elle sait dire NON — un inventaire empoisonné par un outil inventé échoue ;
3. elle n'attrape pas ce qu'elle ne vise pas — `null` (l'écran qu'aucun outil
   ne lit) est légitime, et ne doit jamais être exigé d'être un nom d'outil.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.services import chat_tools

CATALOG_TS = (
    Path(__file__).resolve().parents[2] / "api" / "src" / "modules" / "copilot-bridge" / "laura-settings-catalog.ts"
)

#: Les portes d'écriture de l'inventaire ne sont pas toutes des NOMS d'outils :
#: `settings_overview` désigne le couple lecture/écriture par champ. La table
#: est écrite ici parce que c'est ici qu'on la vérifie, et elle est courte pour
#: la même raison que le type TypeScript : ouvrir une quatrième porte demande de
#: l'y ajouter, donc d'en écrire la raison.
WRITE_GATE_TOOLS: dict[str, str] = {
    "settings_overview": "propose_settings_update",
    "toggle_routine": "toggle_routine",
    "pin_memory_fact": "pin_memory_fact",
    # #3950.1 (décision Louis 09/10/2026, lot G01) — /settings/vivier-export.
    "launch_vivier_export": "launch_vivier_export",
    # #2433.7 (lot M10, 09/10) — /settings/mes-signalements : le signalement préparé.
    "prepare_bug_report": "prepare_bug_report",
}


def _inventory() -> list[dict[str, str | None]]:
    """Les entrées de `LAURA_SETTINGS_SCREENS`, lues SUR LE DISQUE.

    Le découpage se fait sur `route:` plutôt que sur les accolades : ce fichier
    porte un long docbloc qui contient lui aussi des accolades, et une garde qui
    lirait le COMMENTAIRE au lieu du code resterait verte pendant que le code
    diverge — une espèce déjà payée dans ce dépôt.
    """
    assert CATALOG_TS.exists(), f"introuvable : {CATALOG_TS}"
    source = CATALOG_TS.read_text(encoding="utf-8")
    start = source.index("export const LAURA_SETTINGS_SCREENS = [")
    end = source.index("] as const satisfies", start)
    body = source[start:end]

    entries: list[dict[str, str | None]] = []
    # `finditer`, jamais un `re.match` réutilisé sur un motif compilé avec des
    # drapeaux d'état : chaque entrée est lue pour elle-même.
    for match in re.finditer(
        r"route:\s*'(?P<route>[^']+)',\s*posture:\s*'(?P<posture>[^']+)',\s*"
        r"via:\s*(?P<via>null|'[^']+'),\s*readVia:\s*(?P<read>null|'[^']+')",
        body,
    ):
        entries.append(
            {
                "route": match.group("route"),
                "posture": match.group("posture"),
                "via": None if match.group("via") == "null" else match.group("via").strip("'"),
                "readVia": None if match.group("read") == "null" else match.group("read").strip("'"),
            }
        )
    return entries


def _tool_names() -> set[str]:
    return {str(tool["name"]) for tool in chat_tools.CHAT_TOOLS}


# ── 1. La garde LIT quelque chose ────────────────────────────────────────────


def test_the_inventory_is_actually_read_from_disk() -> None:
    entries = _inventory()
    assert len(entries) >= 18, "corpus vide ou anormalement court : la lecture a raté"
    routes = {entry["route"] for entry in entries}
    assert "/settings/memory" in routes
    assert "/billing" in routes
    assert len(_tool_names()) > 40


def test_the_inventory_covers_exactly_the_catalogue_laura_knows() -> None:
    """Les deux listes décrivent les MÊMES écrans — l'une dit où aller, l'autre
    ce qu'on y fait. Une route présente dans l'une et pas dans l'autre est un
    écran dont personne n'a tranché la posture."""
    inventoried = {entry["route"] for entry in _inventory()}
    known = {str(entry["route"]) for entry in chat_tools.SETTINGS_SCREENS}
    assert inventoried == known


# ── 2. Chaque outil NOMMÉ existe vraiment ────────────────────────────────────


def test_every_write_gate_names_a_real_tool() -> None:
    names = _tool_names()
    for entry in _inventory():
        gate = entry["via"]
        if gate is None:
            continue
        assert gate in WRITE_GATE_TOOLS, f"{entry['route']} : porte d'écriture inconnue « {gate} »"
        assert WRITE_GATE_TOOLS[gate] in names, f"{entry['route']} : « {gate} » ne désigne aucun outil réel"


def test_every_read_tool_named_by_the_inventory_exists() -> None:
    names = _tool_names()
    for entry in _inventory():
        read = entry["readVia"]
        if read is None:
            continue
        assert read in names, f"{entry['route']} : l'inventaire promet « {read} », qui n'existe pas"


def test_the_two_reads_of_this_lot_are_actually_promised() -> None:
    """Témoin que la garde porte sur ce lot précis : sans ces deux lignes, elle
    resterait verte sur un inventaire qui ne promettrait plus rien."""
    promised = {entry["readVia"] for entry in _inventory()}
    assert "get_memory" in promised
    assert "get_workspace_vocabulary" in promised


def test_a_write_posture_always_names_its_gate_and_nothing_else_does() -> None:
    for entry in _inventory():
        if entry["posture"] == "write":
            assert entry["via"] is not None, entry["route"]
        else:
            assert entry["via"] is None, entry["route"]


# ── 3. La garde SAIT DIRE NON ────────────────────────────────────────────────


def test_the_check_catches_an_invented_tool_name() -> None:
    """Preuve que la comparaison échoue vraiment — sans ça, un inventaire qui
    promettrait n'importe quoi passerait aussi bien qu'un inventaire juste."""
    names = _tool_names()
    assert "get_un_outil_invente" not in names
    poisoned = [*_inventory(), {"route": "/settings/x", "posture": "redirect", "via": None, "readVia": "get_un_outil_invente"}]
    orphans = [e["route"] for e in poisoned if e["readVia"] is not None and e["readVia"] not in names]
    assert orphans == ["/settings/x"]


def test_the_check_catches_an_unknown_write_gate() -> None:
    poisoned = {"route": "/settings/y", "posture": "write", "via": "porte_inventee", "readVia": None}
    assert poisoned["via"] not in WRITE_GATE_TOOLS


# ── 4. La garde N'ATTRAPE PAS ce qu'elle ne vise pas ─────────────────────────


def test_a_screen_no_tool_reads_is_legitimate() -> None:
    """Témoin du cas voisin : `readVia: null` dit une ABSENCE mesurée — c'est
    la liste de ce qui reste à ouvrir, pas un défaut. Une garde qui exigerait un
    outil partout pousserait à en inventer un par écran."""
    unread = [entry["route"] for entry in _inventory() if entry["readVia"] is None]
    assert unread, "un inventaire où tout est lisible ne teste plus rien"
    assert "/settings/security" in unread
