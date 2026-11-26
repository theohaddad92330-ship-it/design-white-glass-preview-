"""#4622 (« l'audit à fail », Louis 26/10/2026) — une panne de la source de contacts
ne doit plus faire tomber TOUTE l'analyse.

Mesuré sur la capture de Louis, écran /search, compte SANEF :

    Analyse échouée
    Analysis failed in phase contacts: HTTPException: 500: Apollo down (search 'SANEF')

Le dossier entier était perdu parce qu'UNE source n'avait pas répondu — et le nom de
notre fournisseur s'affichait au client. Cette garde lit le code du routeur : chaque
appel à ``search_people`` doit être entouré d'un ``except ApolloUnavailableError`` qui
DÉGRADE (pas de ``raise``), le ``except ValueError`` d'origine restant derrière pour les
vraies erreurs de programmation.
"""

from __future__ import annotations

import ast
import inspect
import pathlib
import textwrap

import pytest

from app.routers import phase2_contacts
from app.services.apollo import ApolloSearchStatus, ApolloUnavailableError, SearchOutcome

ROUTEUR = pathlib.Path(inspect.getfile(phase2_contacts))


def _try_blocks_appelant(source: str, appel: str) -> list[ast.Try]:
    """Les ``try`` dont le corps appelle ``appel``."""
    arbre = ast.parse(textwrap.dedent(source))
    trouves: list[ast.Try] = []
    for noeud in ast.walk(arbre):
        if not isinstance(noeud, ast.Try):
            continue
        for sous in ast.walk(ast.Module(body=noeud.body, type_ignores=[])):
            f = getattr(sous, "func", None)
            nom = getattr(f, "id", None) or getattr(f, "attr", None)
            if nom == appel:
                trouves.append(noeud)
                break
    return trouves


#: Les classes qui attrapent une panne de source. ``ApolloUnavailableError`` SOUS-CLASSE
#: ``ValueError`` (c'est écrit dans sa docstring) : un ``except ValueError`` qui dégrade
#: fait donc le travail, et deux sites le faisaient déjà avant #4622.
_ATTRAPE_LA_PANNE = {"ApolloUnavailableError", "ValueError", "Exception", "BaseException"}


def _degrade_sans_relever(bloc: ast.Try) -> bool:
    """Vrai si le PREMIER gestionnaire qui attraperait la panne ne relève rien.

    Python choisit le premier gestionnaire qui correspond : c'est donc lui, et lui seul,
    qui décide du sort de l'analyse. Un ``except ApolloUnavailableError`` placé APRÈS un
    ``except ValueError: raise`` ne servirait à rien, et la garde doit le voir.
    """
    for handler in bloc.handlers:
        if handler.type is None:
            noms = {"BaseException"}
        elif isinstance(handler.type, ast.Tuple):
            noms = {getattr(e, "id", "") for e in handler.type.elts}
        else:
            noms = {getattr(handler.type, "id", "")}
        if not (noms & _ATTRAPE_LA_PANNE):
            continue
        return not any(isinstance(n, ast.Raise) for n in ast.walk(ast.Module(body=handler.body, type_ignores=[])))
    return False


def test_la_garde_sait_dire_non() -> None:
    """Contrôle positif : le code d'AVANT (un 500 sec) doit échouer la garde."""
    avant = """
try:
    hits = await search_people(**kwargs)
except ValueError as exc:
    raise HTTPException(status_code=500, detail=str(exc)) from exc
"""
    blocs = _try_blocks_appelant(avant, "search_people")
    assert len(blocs) == 1
    assert not _degrade_sans_relever(blocs[0])

    apres = """
try:
    hits = await search_people(**kwargs)
except ApolloUnavailableError as exc:
    _degrade_ou_releve(exc, outcome)
    hits = []
except ValueError as exc:
    raise HTTPException(status_code=500, detail=str(exc)) from exc
"""
    assert _degrade_sans_relever(_try_blocks_appelant(apres, "search_people")[0])


def test_chaque_appel_a_la_source_degrade_au_lieu_de_tuer_l_analyse() -> None:
    blocs = _try_blocks_appelant(ROUTEUR.read_text(encoding="utf-8"), "search_people")
    assert blocs, "aucun appel à search_people trouvé — la garde est périmée, pas le code"
    manquants = [b.lineno for b in blocs if not _degrade_sans_relever(b)]
    assert not manquants, (
        f"{ROUTEUR.name} : l'appel à search_people ligne(s) {manquants} rend encore un 500 sur une "
        "panne de source — une seule source morte y fait tomber toute l'analyse (#4622)"
    )


@pytest.mark.parametrize("raison", ["down", "rate_limited", "unconfigured"])
def test_une_panne_recuperable_degrade_et_dit_son_statut(raison: str) -> None:
    outcome = SearchOutcome()
    phase2_contacts._degrade_ou_releve(ApolloUnavailableError(0, raison, context="search 'SANEF'"), outcome)
    assert outcome.status == ApolloSearchStatus(raison)  # jamais un « 0 contact » muet


@pytest.mark.parametrize("raison", ["auth_failed", "plan_blocked"])
def test_un_refus_de_configuration_reste_terminal(raison: str) -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as leve:
        phase2_contacts._degrade_ou_releve(ApolloUnavailableError(0, raison), SearchOutcome())
    assert leve.value.status_code == 500
