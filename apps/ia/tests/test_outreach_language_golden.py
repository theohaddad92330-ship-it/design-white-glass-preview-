"""#2861 (#2437.11) — le golden de LANGUE de ``bellum_outreach``.

Pourquoi un corpus à part, plutôt qu'une quatrième colonne dans
``test_outreach_persona_context_golden.py`` : cette LANGUE est un axe
INDÉPENDANT des deux déjà épinglés là-bas (persona, contexte) — le coupler dans
le même corpus multiplierait les cellules (4 × 20 × 3) sans rien prouver de
plus que ce que ``test_les_deux_axes_du_cadrage_sont_independants`` prouve déjà
pour les deux premiers. Ce fichier fait le même travail pour le troisième axe :
un corpus committé, une garde qui sait dire NON, l'indépendance PROUVÉE plutôt
qu'énumérée avec les deux autres axes.

Ce que #2437.11 demandait : un message multilingue choisit sa LANGUE avant
génération. Le seul niveau déjà transporté jusqu'ici est le DESTINATAIRE
(``contacts.locale``, #2437.2, livré séparément) — ``message_language_block``
en dérive le bloc, ``None``/``"fr"`` (le comportement d'avant) restant un bloc
vide, à l'octet.

Régénérer après une modification VOULUE :

    UPDATE_PROMPT_GOLDEN=1 pytest tests/test_outreach_language_golden.py -q

puis relire le diff et committer le .txt avec le changement.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.prompts.bellum_outreach import build_user_prompt, message_language_block

_GOLDEN = Path(__file__).parent / "golden" / "outreach" / "language.txt"
_UPDATE = os.getenv("UPDATE_PROMPT_GOLDEN") == "1"

_PROFILE = {"companyName": "Acme", "offers": ["SRE"]}
_ANALYSIS = {"recent_signals": [{"title": "Cession Uptevia"}]}
_CONTACT = {"full_name": "Olivier Martin", "title": "Directeur technique", "hierarchy_level": "c_level"}

#: Les valeurs du corpus : les deux qui restent muettes (comportement d'avant),
#: les deux du catalogue qui parlent, et une valeur HORS catalogue — jamais
#: devinée, jamais promue en langue (même discipline que #2437.2 : `NULL` ou
#: une valeur refusée à l'écriture, jamais un pays ou un code inventé ici).
_LOCALES: tuple[str | None, ...] = (None, "fr", "en", "de", "es")


def _prompt(locale: str | None) -> str:
    return build_user_prompt(
        contact=_CONTACT,
        raw_analysis=_ANALYSIS,
        profile=_PROFILE,
        recent_signals=None,
        channel="email",
        context="",
        company_name="BNP Paribas",
        locale=locale,
    )


def _records() -> list[tuple[str, str]]:
    return [(f"locale={locale!r}", message_language_block(locale)) for locale in _LOCALES]


def _rendered() -> str:
    return "".join(f"### {key}\n{value!r}\n\n" for key, value in _records())


def test_le_bloc_de_langue_suit_son_golden() -> None:
    rendered = _rendered()
    if _UPDATE:
        _GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        _GOLDEN.write_text(rendered, encoding="utf-8")
        return
    assert _GOLDEN.exists(), (
        f"Golden manquant : {_GOLDEN}. "
        "Le générer avec `UPDATE_PROMPT_GOLDEN=1 pytest tests/test_outreach_language_golden.py`."
    )
    assert rendered == _GOLDEN.read_text(encoding="utf-8"), (
        "Le bloc de langue a changé pour au moins une valeur. Si c'est voulu, régénérer avec "
        "`UPDATE_PROMPT_GOLDEN=1 pytest tests/test_outreach_language_golden.py` et committer le .txt."
    )


def test_le_corpus_couvre_le_catalogue_et_ses_bords() -> None:
    """Une garde doit LIRE quelque chose : ici, les cinq valeurs du corpus."""
    keys = [key for key, _value in _records()]
    assert len(keys) == len(_LOCALES) == 5
    assert len(set(keys)) == len(keys), f"clés dupliquées : {keys}"


@pytest.mark.parametrize("locale", [None, "fr", "es"])
def test_une_langue_muette_laisse_le_prompt_inchange(locale: str | None) -> None:
    """`None`, `"fr"` (déjà le français) et une valeur HORS catalogue restent
    byte-identiques au prompt d'avant ce lot — jamais une langue devinée."""
    assert message_language_block(locale) == ""
    assert _prompt(locale) == _prompt(None)


@pytest.mark.parametrize("locale,name", [("en", "anglais"), ("de", "allemand")])
def test_une_langue_du_catalogue_ecrit_sa_consigne(locale: str, name: str) -> None:
    block = message_language_block(locale)
    assert f"en {name}" in block
    assert "LANGUE DU MESSAGE" in block
    assert block in _prompt(locale)


def test_le_corpus_voit_un_changement_de_langue() -> None:
    assert _prompt("en") != _prompt("de") != _prompt(None)


def test_le_bloc_de_langue_est_indépendant_du_canal() -> None:
    """Le troisième axe (langue) ne dépend ni du persona ni du canal — la même
    discipline que ``test_les_deux_axes_du_cadrage_sont_independants`` pour
    les deux premiers : recomposer un canal différent ne change QUE ce que le
    canal change, jamais la présence du bloc de langue."""
    for channel in ("email", "linkedin", "phone", "task"):
        prompt = build_user_prompt(
            contact=_CONTACT,
            raw_analysis=_ANALYSIS,
            profile=_PROFILE,
            recent_signals=None,
            channel=channel,
            context="",
            company_name="BNP Paribas",
            locale="en",
        )
        assert message_language_block("en") in prompt
