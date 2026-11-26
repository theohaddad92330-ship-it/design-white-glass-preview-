"""Les routers contact-scopés lisent des colonnes qui EXISTENT.

Bug live (Louis, 22/07, fiche contact Leroy Merlin) : « Accroches personnalisées →
Génération indisponible ». Cause racine : `icebreaker`, `message` et `battlecard`
demandaient `first_name, last_name` à la table `contacts`… qui n'a jamais eu ces
colonnes — la migration Init crée `full_name TEXT NOT NULL`, et l'entité NestJS ne
connaît que `full_name`. PostgREST répond 400 « column does not exist », l'appel
lève, l'écran affiche l'erreur générique.

Rien ne l'attrapait : aucun test ne confrontait la liste de colonnes demandée au
schéma réel. C'est ce que fait ce test — il échoue à la SECONDE où un router
demande une colonne inventée.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROUTERS = Path(__file__).resolve().parents[1] / "app" / "routers"

# Colonnes réelles de `contacts` (migration Init + contact.entity.ts). Volontairement
# restreint à ce que les routers lisent aujourd'hui : une colonne ajoutée plus tard
# s'ajoute ici, en même temps que sa migration.
CONTACTS_COLUMNS = {
    "id",
    "user_id",
    "account_id",
    "full_name",
    "title",
    "email",
    "phone",
    "linkedin_url",
    "photo_url",
    "decision_role",
    "entity",
    "family",
    "source",
    "priority",
    "bucket",
    "hierarchy_level",
    "lifecycle_state",
    "user_status",
    "created_at",
    "updated_at",
    # #2861 (#2437.2, migration `1796321999830-ContactLocale`) — la langue
    # DÉCLARÉE du destinataire, `fr`/`en`/`de`/`NULL`.
    "locale",
}

# `fetch_owned_contact(sb, id, user, columns="a, b, c")` — on capture la liste.
_COLUMNS_CALL = re.compile(r'columns\s*=\s*"([^"]+)"')
# `.select("a, b, c")` juste après `.table("contacts")`.
_CONTACTS_SELECT = re.compile(r'\.table\(\s*"contacts"\s*\)\s*(?:\.\w+\([^)]*\)\s*)*?\.select\(\s*"([^"]+)"')


def _requested_columns(source: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for pattern in (_COLUMNS_CALL, _CONTACTS_SELECT):
        for match in pattern.finditer(source):
            for col in match.group(1).split(","):
                cleaned = col.strip()
                if cleaned and cleaned != "*":
                    out.append((cleaned, match.group(0)[:60]))
    return out


@pytest.mark.parametrize("router", ["icebreaker.py", "message.py", "battlecard.py"])
def test_contact_scoped_routers_only_read_existing_columns(router: str) -> None:
    source = (ROUTERS / router).read_text(encoding="utf-8")
    unknown = sorted({col for col, _ in _requested_columns(source) if col not in CONTACTS_COLUMNS})
    assert not unknown, (
        f"{router} demande à `contacts` des colonnes qui n'existent pas : {unknown}.\n"
        "La table porte `full_name` (migration Init) — pas de first_name/last_name. "
        "PostgREST répond 400 et la fonctionnalité meurt avec une erreur générique."
    )


@pytest.mark.parametrize("router", ["icebreaker.py", "message.py", "battlecard.py"])
def test_contact_scoped_routers_read_the_name(router: str) -> None:
    """Un message sans le nom du contact ne sert à rien — la colonne doit être lue."""
    source = (ROUTERS / router).read_text(encoding="utf-8")
    assert "full_name" in source, f"{router} ne lit pas le nom du contact"


def test_prompts_read_the_name_from_the_real_column() -> None:
    """Le nom rendu dans le prompt vient de `full_name`, la colonne qui existe."""
    from app.prompts import bellum_icebreaker, bellum_outreach

    contact = {"full_name": "Eloy Del Moral", "title": "Directeur général délégué"}

    icebreaker = bellum_icebreaker.build_user_prompt(
        contact=contact, raw_analysis={}, profile={}, recent_signals=[]
    )
    assert "Eloy Del Moral" in icebreaker

    outreach = bellum_outreach.build_user_prompt(
        contact=contact,
        raw_analysis={},
        profile={},
        recent_signals=[],
        channel="email",
        context="",
        company_name="Leroy Merlin",
    )
    assert "Eloy Del Moral" in outreach


def test_a_contact_split_in_two_fields_still_renders() -> None:
    """Repli conservé pour un appelant qui passe first/last (jamais la base)."""
    from app.prompts import bellum_icebreaker

    prompt = bellum_icebreaker.build_user_prompt(
        contact={"first_name": "Eloy", "last_name": "Del Moral"},
        raw_analysis={},
        profile={},
        recent_signals=[],
    )
    assert "Eloy Del Moral" in prompt
