"""GA-314 — un refroidissement ne casse JAMAIS l'appel qu'il mesure.

Le défaut que cette garde attrape, trouvé le 12/09/2026 par la suite COMPLÈTE
sur l'arbre fusionné (jamais par les suites ciblées des lots) :

    back_off_provider("apollo", res.headers.get("retry-after"))
    AttributeError: '_Res' object has no attribute 'headers'

Trente sites d'appel lisaient l'en-tête directement sur l'objet de réponse. Ils
s'exécutent au moment PRÉCIS où un fournisseur répond 429 — c'est-à-dire au pire
moment. Un objet sans ``headers`` (double de test, client maison, réponse
tronquée) transformait alors une limitation de débit, cas NORMAL et rattrapable,
en exception qui remonte jusqu'à l'appelant et fait échouer l'enrichissement.

La règle est déjà écrite ailleurs dans ce dépôt, pour le registre de coûts :
**une mesure n'a jamais le droit de casser ce qu'elle mesure.** Elle vaut
identiquement ici.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

from app.services.rate_limiter import retry_after_header

_APP = pathlib.Path(__file__).resolve().parents[1] / "app"


class _SansHeaders:
    """Un objet de réponse qui n'expose pas ``headers`` — le cas du défaut."""


class _HeadersQuiLevent:
    @property
    def headers(self):  # noqa: ANN201
        raise RuntimeError("client maison dont les en-têtes ne sont pas lisibles")


class _HeadersNonTextuels:
    headers = {"retry-after": 42}  # un entier, pas une chaîne


class _Normal:
    headers = {"retry-after": "17"}


@pytest.mark.parametrize(
    ("response", "attendu"),
    [
        (_SansHeaders(), None),
        (_HeadersQuiLevent(), None),
        (_HeadersNonTextuels(), None),
        (_Normal(), "17"),
        (None, None),
    ],
)
def test_lextracteur_ne_leve_jamais_et_rend_none_quand_il_ne_sait_pas(response, attendu) -> None:
    """Ne JAMAIS lever, et distinguer « pas d'en-tête » d'une valeur lisible.

    ``None`` fait retomber ``back_off_provider`` sur son délai par défaut, ce qui
    est le comportement voulu — jamais un zéro, jamais une exception.
    """
    assert retry_after_header(response) == attendu


def test_aucun_site_ne_lit_lentete_directement_sur_la_reponse() -> None:
    """Le cliquet : plus aucun appel ne doit lire ``.headers`` en direct.

    Sans ce test, les trente sites peuvent redevenir fragiles un par un, et le
    défaut ne se verrait qu'au prochain 429 en production — c'est-à-dire jamais
    en CI.
    """
    fautifs: list[str] = []
    vus = 0
    for chemin in sorted(_APP.rglob("*.py")):
        if "__pycache__" in chemin.parts:
            continue
        texte = chemin.read_text(encoding="utf-8")
        if "back_off_provider(" not in texte:
            continue
        arbre = ast.parse(texte)
        for noeud in ast.walk(arbre):
            if not isinstance(noeud, ast.Call):
                continue
            nom = getattr(noeud.func, "id", None) or getattr(noeud.func, "attr", None)
            if nom != "back_off_provider":
                continue
            vus += 1
            for arg in noeud.args:
                # `X.headers.get(...)` = un Call dont la func est un Attribute
                # dont la value est elle-même un Attribute nommé `headers`.
                f = arg.func if isinstance(arg, ast.Call) else None
                if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Attribute) and f.value.attr == "headers":
                    fautifs.append(f"{chemin.relative_to(_APP)}:{noeud.lineno}")

    # La garde LIT vraiment quelque chose : un corpus vide serait vert pour
    # toujours — c'est le défaut n°1 des gardes de ce dépôt.
    assert vus >= 25, f"corpus suspect : seulement {vus} appels à back_off_provider trouvés"
    assert not fautifs, (
        "ces appels lisent l'en-tête directement sur la réponse et lèveront sur "
        f"un objet sans `headers`, au moment d'un 429 : {fautifs}. "
        "Passer par `retry_after_header(response)`."
    )
