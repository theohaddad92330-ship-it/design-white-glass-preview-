"""LA NAVIGATION DU WEB, LUE SUR LE DISQUE — l'unique lecteur Python.

#2151.1 (16/09/2026). Deux gardes de ce dossier comparaient déjà leur corpus à
`apps/web/src/components/navigation/sections.ts` : le catalogue d'écrans de
`propose_guided_action` (`test_chat_guided_action_app_routes.py`) et les chemins
cités dans le prompt du copilote (`test_copilote_prompt_blocks.py`). Une liste
recopiée en Python aurait dérivé au premier onglet déplacé — le choix de relire
le TypeScript est le bon, et il ne change pas.

Ce qui manquait est ailleurs. Le lot « navigation & presets » de la vague 5 a
sorti « Veille » et « Partenaires » des onglets de Comptes SANS les retirer du
produit : les routes sont servies, les écrans s'ouvrent, on y entre depuis
/discover, depuis Market Watch, depuis un lien déjà parti. Les deux gardes ont
donc réclamé qu'on retire `/watchlist` du catalogue de Laura et de son prompt —
c'est-à-dire qu'on cesse d'envoyer l'utilisateur vers un écran qui existe.

**« Je ne suis plus une DESTINATION de la nav » et « je ne suis plus un ÉCRAN »
sont deux choses différentes.** Le web a nommé la seconde dans
`off-nav-screens.ts`, et c'est de LÀ que ce module la lit : la déclaration vit à
un seul endroit (GA-26), des deux côtés de la frontière TypeScript / Python. Une
seconde liste ici aurait divergé au premier écran ajouté — exactement le défaut
que les gardes existent pour empêcher.

⚠️ Ce module ne contient AUCUNE route en dur. S'il en contenait une, il
mentirait le jour où le web bouge, et une garde qui ment est pire qu'absente.
"""

from __future__ import annotations

import re
from pathlib import Path

WEB_SRC = Path(__file__).resolve().parents[2] / "web" / "src"
SECTIONS_TS = WEB_SRC / "components" / "navigation" / "sections.ts"
SETTINGS_TS = WEB_SRC / "components" / "sidebar" / "items.settings.ts"
OFF_NAV_TS = WEB_SRC / "components" / "navigation" / "off-nav-screens.ts"


def strip_comments(source: str) -> str:
    """Retire `/* … */` et `// …` — une route citée dans un commentaire n'en est pas une."""
    without_blocks = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
    return re.sub(r"(?m)^\s*//.*$|\s//.*$", "", without_blocks)


def nav_routes_in(source: str) -> set[str]:
    """Les DESTINATIONS déclarées par une barre du web : les `to: '/…'`."""
    return set(re.findall(r"\bto:\s*'(/[^']*)'", strip_comments(source)))


def off_nav_routes_in(source: str) -> set[str]:
    """Les écrans SERVIS hors navigation : les `route: '/…'` d'`off-nav-screens.ts`.

    ⚠️ Le champ du web s'appelle `route` et non `to`, à dessein : `to` ferait
    recompter ces écrans comme des destinations de barre par `nav_routes_in`,
    c'est-à-dire annulerait en silence la distinction que tout ceci pose.
    """
    return set(re.findall(r"\broute:\s*'(/[^']*)'", strip_comments(source)))


def _read(path: Path) -> str:
    assert path.exists(), f"source de navigation introuvable : {path}"
    return path.read_text(encoding="utf-8")


def nav_routes() -> set[str]:
    """Les destinations de la barre principale et de ses onglets."""
    return nav_routes_in(_read(SECTIONS_TS))


def settings_routes() -> set[str]:
    """Les destinations de la barre des Réglages — une seconde navigation."""
    return nav_routes_in(_read(SETTINGS_TS))


def off_nav_routes() -> set[str]:
    """Les écrans servis qui ont quitté la navigation, déclarés par le web."""
    return off_nav_routes_in(_read(OFF_NAV_TS))


def reachable_screens() -> set[str]:
    """Tout écran où l'utilisateur peut se trouver, donc où un lien peut mener."""
    return nav_routes() | settings_routes() | off_nav_routes()
