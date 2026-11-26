"""#4631.3 — GARDE D'ARCHITECTURE : aucun gabarit de ``known_shape_gate`` n'interpole un nombre de comptes HORS de la
collection rendue ou écartée.

Le défaut d'origine (#4631) : un gabarit annonçait « N comptes » avec un nombre tiré d'ailleurs que des lignes réellement
rendues. La garde d'avant (``test_4631_annonce_liste.py``) ne tenait que ``talent_dropped_*``. Celle-ci lit TOUS les
appels ``labels[...].format(n=…)`` du module et exige que l'expression du nombre soit l'une des mesures posées sur la
collection (lignes rendues, écartées, plafonnées…). Une expression neuve se déclare ici, sciemment : elle ne passe pas en
silence.
"""

from __future__ import annotations

import ast
import inspect

import app.services.known_shape_gate as gate

# Les mesures AUTORISÉES : chacune est dérivée de la collection rendue (`items`, `not_now`) ou de ce qu'on a écarté.
ALLOWED_COUNT_EXPRESSIONS = frozenset(
    {
        "headcount",  # effectif lu sur la ligne
        "out_of_scope",  # écartés hors périmètre, comptés
        "gap[0]",  # écart de ville : compté sur les lignes
        "len(items)",  # lignes rendues
        "len(not_now)",  # lignes écartées « pas maintenant »
        "capped",  # lignes plafonnées
        "unlisted",  # lignes lues mais non listées
        "dropped",  # lignes écartées du talent
    }
)


def count_expressions(source: str) -> list[tuple[str, str]]:
    """Chaque ``<gabarit>.format(n=<expr>)`` du source, sous la forme ``(texte du gabarit, expression de n)``."""
    found: list[tuple[str, str]] = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "format":
            for keyword in node.keywords:
                if keyword.arg == "n":
                    found.append((ast.unparse(node.func.value), ast.unparse(keyword.value)))
    return found


def test_la_garde_lit_un_corpus_non_vide() -> None:
    assert len(count_expressions(inspect.getsource(gate))) >= 5


def test_chaque_nombre_interpole_vient_de_la_collection_rendue_ou_ecartee() -> None:
    unknown = [
        (template, expr)
        for template, expr in count_expressions(inspect.getsource(gate))
        if expr not in ALLOWED_COUNT_EXPRESSIONS
    ]
    assert unknown == [], f"nombre interpolé hors collection rendue/écartée : {unknown}"


def test_sait_dire_non_un_nombre_tire_d_ailleurs_est_vu() -> None:
    snippet = 'labels["accounts_total"].format(n=len(all_candidates))'
    assert [expr for _, expr in count_expressions(snippet)] == ["len(all_candidates)"]
    assert "len(all_candidates)" not in ALLOWED_COUNT_EXPRESSIONS


def test_n_attrape_pas_ce_qu_elle_ne_vise_pas() -> None:
    assert count_expressions('labels["offer_targeted"].format(offer=offer)') == []
