"""#3673.3 — le prompt SYSTÈME d'activité ne vend pas de DSI à un vendeur non-IT.

Avant : « OFFRES ESN », l'exemple « DSI groupe, ~800 projets IT actifs » et
« implications IT » étaient écrits en dur, y compris pour une société
d'ingénierie. Ici : un vendeur non-IT reçoit un vocabulaire neutre ; l'ESN IT
(et le profil absent) garde le prompt byte-identique (golden).
"""

from __future__ import annotations

from app.prompts import bellum_activity

_IT_ESN = {"companyName": "DataForge", "offers": ["Data & IA", "Cloud AWS"]}
_INDUSTRIAL = {"companyName": "MecaConseil", "offerDomain": "industrial_engineering", "core_offers": ["bureau d'études mécanique"]}


def test_systeme_garde_le_vocabulaire_it_sans_profil() -> None:
    assert "DSI groupe" in bellum_activity.build_system_prompt({})


def test_systeme_garde_le_vocabulaire_it_pour_une_esn_it() -> None:
    rendered = bellum_activity.build_system_prompt(_IT_ESN)
    assert "implications IT" in rendered


def test_systeme_neutre_pour_un_vendeur_industriel() -> None:
    rendered = bellum_activity.build_system_prompt(_INDUSTRIAL)
    assert "DSI groupe" not in rendered
    assert "implications IT" not in rendered
    assert "conseil IT" not in rendered
    assert "bureau d'études mécanique" in rendered
    assert "implications" in rendered  # remplacées par « besoins concrets »
