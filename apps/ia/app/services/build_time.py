"""#4711.1 — QUAND ce service a été construit, à ne pas confondre avec ``timestamp`` (l'heure de la réponse).

#4711.2 — la valeur est POSÉE AU BUILD (``buildCommand``, ``.railway/railway.ts`` et ``railway.json``) dans
``build-time.txt``, au dossier du service, puis relue ici ; la variable ``BUILD_TIME`` prime quand une plateforme la
pose. Ni l'une ni l'autre (dev local) : ``None`` — on ne prétend jamais savoir, jamais l'heure du démarrage prise
pour celle de la build.
"""

import os
from collections.abc import Mapping
from datetime import datetime
from pathlib import Path


def _read(path: Path) -> str:
    try:
        return path.read_text().strip()
    except OSError:
        return ""


def read_built_at(
    env: Mapping[str, str] | None = None, cwd: Path | None = None, module_dir: Path | None = None
) -> str | None:
    environ = os.environ if env is None else env
    raw = (environ.get("BUILD_TIME") or "").strip()
    if not raw:
        # #4711.2 — dossier courant PUIS dossiers parents de ce module : le dossier courant d'un démarrage
        # Railway n'est pas forcément celui où la commande de build a écrit.
        start = module_dir or Path(__file__).resolve().parent
        for folder in [cwd or Path.cwd(), *list(start.parents)[:4], start]:
            raw = _read(folder / "build-time.txt")
            if raw:
                break
        if not raw:
            return None
    try:
        datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return raw
