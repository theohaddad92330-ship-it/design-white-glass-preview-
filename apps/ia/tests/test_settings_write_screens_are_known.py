"""#1822 (Lot 16) — chaque écran ÉCRIVABLE est un écran de réglages CONNU.

`propose_settings_update` résout `screen`/`field` contre
`bellum_api.laura_settings_overview` (une lecture chez NestJS), qui lui-même
n'expose que `WRITABLE_SETTINGS_SCREENS`
(`apps/api/src/modules/copilot-bridge/laura-settings-catalog.ts`). Rien
n'empêcherait ce fichier TypeScript de nommer un jour un écran que
`propose_guided_action` (donc `SETTINGS_SCREENS` côté Python) ne connaît pas
encore — Laura proposerait alors d'ÉCRIRE un réglage qu'elle refuse par
ailleurs de simplement NOMMER, ce qui serait absurde et incohérent d'un outil à
l'autre.

Trois preuves, comme `test_settings_screens_catalog.py` :

1. elle LIT le fichier réel, sur le disque ;
2. elle sait dire NON (une liste empoisonnée par un écran inconnu échoue) ;
3. elle n'attrape pas ce qu'elle ne vise pas (les deux écrans RÉELS passent).
"""

from __future__ import annotations

import re
from pathlib import Path

from app.services import chat_tools

CATALOG_TS = (
    Path(__file__).resolve().parents[2]
    / "api"
    / "src"
    / "modules"
    / "copilot-bridge"
    / "laura-settings-catalog.ts"
)


def _writable_screens_declared_on_disk() -> set[str]:
    """Les écrans que Laura peut ÉCRIRE, lus dans l'INVENTAIRE.

    ⚠️ #1822 — la lecture a changé de cible, et c'est voulu.
    `WRITABLE_SETTINGS_SCREENS` n'est plus une liste écrite à la main : elle
    DÉRIVE de `LAURA_SETTINGS_SCREENS`, l'inventaire des vingt écrans qui porte
    la posture de Laura sur chacun et sa raison. Un réglage vit à un seul
    endroit (GA-26), donc cette garde lit cet endroit-là — un `re.search` sur
    l'ancienne constante aurait rendu un ensemble VIDE, c'est-à-dire une garde
    verte qui ne garde plus rien.

    Le corpus retenu est celui des écrans écrivables PAR CHAMP
    (`via: 'settings_overview'`), qui sont exactement ceux que
    `propose_settings_update` résout. `/settings/routines` et `/settings/memory`
    sont écrivables eux aussi, mais par leur propre porte — elles ont leurs
    propres tests (`test_chat_routine_toggle_tool.py`,
    `test_chat_pin_memory_fact_tool.py`).
    """
    assert CATALOG_TS.exists(), f"introuvable : {CATALOG_TS}"
    source = CATALOG_TS.read_text(encoding="utf-8")
    start = source.index("export const LAURA_SETTINGS_SCREENS = [")
    body = source[start : source.index("] as const satisfies", start)]
    return {
        match.group("route")
        for match in re.finditer(
            r"route:\s*'(?P<route>[^']+)',\s*posture:\s*'write',\s*via:\s*'settings_overview'", body
        )
    }


def test_the_disk_file_is_actually_read() -> None:
    screens = _writable_screens_declared_on_disk()
    assert len(screens) >= 2, "corpus vide ou anormalement court : la lecture a raté"


def test_every_writable_screen_is_a_known_settings_screen() -> None:
    known = {str(entry["route"]) for entry in chat_tools.SETTINGS_SCREENS}
    unknown = _writable_screens_declared_on_disk() - known
    assert not unknown, f"écran écrivable absent du catalogue que Laura connaît : {unknown}"


def test_the_comparison_catches_a_deliberately_unknown_screen() -> None:
    """Preuve que la garde sait dire NON — sans ça, une liste vide passerait
    aussi bien qu'une liste juste."""
    known = {str(entry["route"]) for entry in chat_tools.SETTINGS_SCREENS}
    poisoned = _writable_screens_declared_on_disk() | {"/settings/un-ecran-invente"}
    unknown = poisoned - known
    assert unknown == {"/settings/un-ecran-invente"}
