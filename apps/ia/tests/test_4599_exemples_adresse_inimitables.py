"""#4599 — un exemple d'adresse dans un prompt est recopie par le modele.

« cold_email:prenom.nom@domaine.com » fuyait en sortie : le modele ne changeait que le domaine, et huit fiches d'un
compte portaient la meme fausse adresse. Aucun prompt ne doit contenir une adresse-exemple imitable ; seule l'adresse
REELLE de support (une constante, pas un exemple) est permise.
"""

from __future__ import annotations

import re
from pathlib import Path

PROMPTS = Path(__file__).resolve().parent.parent / "app" / "prompts"
ADDRESS = re.compile(r"[A-Za-z0-9._-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
REAL_ADDRESSES = {"support@bellum-it.com"}


def test_aucun_prompt_ne_porte_une_adresse_exemple() -> None:
    found = {
        f"{path.name}: {hit}"
        for path in sorted(PROMPTS.glob("*.py"))
        for hit in ADDRESS.findall(path.read_text(encoding="utf-8"))
        if hit not in REAL_ADDRESSES
    }
    assert not found, f"adresse-exemple imitable dans un prompt : {sorted(found)}"


def test_le_chemin_cold_email_reste_decrit_sans_forme_d_adresse() -> None:
    from app.prompts import bellum_contacts

    source = Path(bellum_contacts.__file__).read_text(encoding="utf-8")
    assert "cold_email:<adresse trouvee>" in source
