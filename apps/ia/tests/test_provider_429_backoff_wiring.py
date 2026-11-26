"""GA-299 — une branche « 429 / rate limited » qui ne câble pas ``back_off()``.

Le disjoncteur (``ProviderThrottle.back_off``, ``rate_limiter.py``) existe pour
TOUS les 24 fournisseurs déclarés dans ``_DEFAULTS`` depuis longtemps, mais un
seul appelant dans tout le dépôt le déclenchait avant ce lot :
``data_sources/recherche_entreprises.py::_search_page``. Vingt-trois autres
fournisseurs classifient pourtant un 429 EXPLICITEMENT — un statut
``RATE_LIMITED`` nommé, un ``if status_code == 429``, un ``raise_for_status()``
qui laisse passer 429 dans son ``except`` — sans jamais faire taire le
compartiment PARTAGÉ. Le seau à jetons ignore alors le seul retour
d'information que le fournisseur nous donne et continue d'émettre au même
débit vers la requête suivante : c'est très exactement #631
(``recherche-entreprises``, 79,5 % d'entreprises jetées) qui peut se reproduire
sur n'importe lequel des 23 autres.

Patron calqué sur ``tests/test_upstream_throttle_coverage.py`` : un corpus
énuméré et une garde structurelle qui échoue dès qu'une clé ne le respecte
plus — ici, une FONCTION dont l'audit dit qu'elle traite un 429, mais dont le
corps n'appelle plus ``back_off_provider(...)`` (ou ``<throttle>.back_off(...)``
directement, comme le fait ``recherche_entreprises._back_off_from``).

``REGISTRY`` est le tableau exhaustif de l'audit du lot « résilience des appels
sortants » (voir le rapport du lot pour le détail fichier:ligne AVANT/APRÈS).
Une fonction renommée ou supprimée fait échouer le test immédiatement (audit
périmé), plutôt que de disparaître en silence du corpus.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

SERVICES_DIR = pathlib.Path(__file__).resolve().parents[1] / "app" / "services"

# (chemin relatif à app/services/, nom de fonction, fournisseur(s) du compartiment
# partagé qu'elle doit faire taire sur un 429)
REGISTRY: list[tuple[str, str, str]] = [
    ("apollo.py", "_search_people_uncached", "apollo"),
    ("apollo.py", "_enrich_person_uncached", "apollo"),
    ("apollo_org.py", "_enrich_organization_uncached", "apollo"),
    ("salesql.py", "_enrich_uncached", "salesql"),
    ("insee_sirene.py", "search_unites_legales", "insee"),
    # naf_by_sirens ne classe plus lui-même le 429 depuis #2978/#2284.17 : il
    # délègue entièrement à unites_legales_by_sirens (la primitive PARTAGÉE
    # derrière naf_by_sirens, unite_legale_by_siren et legal_category_by_siren),
    # qui appelle back_off_provider sur son propre 429 — cette primitive est
    # l'endroit qui classe réellement le statut, donc l'endroit à auditer.
    ("insee_sirene.py", "unites_legales_by_sirens", "insee"),
    # etablissements_by_siren ne classe plus lui-même le 429 depuis #3921 (lot M03,
    # 09/10) : il délègue à etablissements_reading, qui distingue « lu, vide » de
    # « non lu » pour le relevé Sirene quotidien et appelle back_off_provider sur
    # son propre 429 — c'est là que le statut est réellement classé.
    ("insee_sirene.py", "etablissements_reading", "insee"),
    ("pappers/search.py", "_fetch_search", "pappers"),
    ("pappers/detail.py", "_fetch_cartographie", "pappers"),
    ("pappers/detail.py", "get_company", "pappers"),
    ("pappers/discovery.py", "search_companies_filtered", "pappers"),
    ("data_sources/github_org.py", "_get", "github"),
    ("brave_search.py", "_execute_query_uncached", "brave"),
    ("firecrawl.py", "_scrape_one", "firecrawl"),
    ("data_sources/recherche_entreprises.py", "fetch_company", "recherche_entreprises"),
    ("data_sources/recherche_entreprises.py", "_search_page", "recherche_entreprises"),
    ("data_sources/recherche_entreprises.py", "count_companies", "recherche_entreprises"),
    # #4617 — `list_companies` n'est plus que l'enveloppe de CACHE ; la branche 429 et son
    # `_back_off_from` vivent dans `_list_companies_live`, l'endroit qui classe réellement le
    # statut — donc l'endroit à auditer (même raison que `unites_legales_by_sirens` ci-dessus).
    ("data_sources/recherche_entreprises.py", "_list_companies_live", "recherche_entreprises"),
    ("data_sources/ats_boards.py", "_get_json", "greenhouse/lever"),
    ("data_sources/bodacc.py", "_legal_signals_uncached", "bodacc"),
    ("data_sources/brave_news.py", "recent_news", "brave"),
    ("data_sources/decp.py", "awarded_it_contracts", "decp"),
    ("data_sources/decp.py", "_awards_by_siren", "decp"),
    ("data_sources/decp.py", "list_award_buyers", "decp"),
    ("data_sources/france_travail.py", "_request_token", "france_travail"),
    ("data_sources/france_travail.py", "_search", "france_travail"),
    ("data_sources/france_travail.py", "list_hiring_companies", "france_travail"),
    ("data_sources/geo_communes.py", "_fetch", "geo-communes"),
    ("data_sources/inpi_rne.py", "_token", "inpi"),
    ("data_sources/inpi_rne.py", "beneficial_owners", "inpi"),
    # #4116 — public_tenders() n'est plus que l'orchestrateur BOAMP + TED ; le 429 BOAMP
    # est classé dans _boamp_tenders, celui de TED dans ted_tenders.
    ("data_sources/public_tenders.py", "_boamp_tenders", "boamp"),
    ("data_sources/ted.py", "ted_tenders", "ted"),
    ("data_sources/public_tenders.py", "list_tender_buyers", "boamp"),
    ("data_sources/apec.py", "it_job_signals_apec", "apec"),
    ("data_sources/serper.py", "serper_search", "serper"),
    ("data_sources/tavily.py", "tavily_search", "tavily"),
    ("data_sources/wttj.py", "it_job_signals_wttj", "wttj"),
]


def _parse(relpath: str) -> ast.Module:
    return ast.parse((SERVICES_DIR / relpath).read_text())


def _find_function(tree: ast.Module, name: str) -> ast.AST | None:
    """La fonction ``name``, top-level ou imbriquée (une fermeture comme
    ``list_hiring_companies::_call`` compte : elle vit dans le sous-arbre de sa
    fonction englobante)."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    return None


def _calls_back_off(node: ast.AST) -> bool:
    """True si le sous-arbre appelle ``back_off_provider(...)`` (l'aide
    partagée), ``<quelquechose>.back_off(...)`` directement, ou un intermédiaire
    local nommé d'après ce patron (``_back_off_from``, le nom déjà utilisé par
    ``recherche_entreprises`` AVANT ce lot) — n'importe où dans le sous-arbre, y
    compris une fermeture imbriquée. ``back_off`` doit apparaître dans le nom :
    un appel sans rapport (``_fetch``, ``_token``…) ne matche jamais.
    """
    for sub in ast.walk(node):
        if not isinstance(sub, ast.Call):
            continue
        func = sub.func
        if isinstance(func, ast.Name) and "back_off" in func.id:
            return True
        if isinstance(func, ast.Attribute) and "back_off" in func.attr:
            return True
    return False


@pytest.mark.parametrize("relpath,funcname,provider", REGISTRY, ids=[f"{r}::{f}" for r, f, _ in REGISTRY])
def test_429_branch_calls_back_off(relpath: str, funcname: str, provider: str) -> None:
    tree = _parse(relpath)
    node = _find_function(tree, funcname)
    assert node is not None, (
        f"{relpath}::{funcname} introuvable — l'audit du lot résilience est périmé "
        "(fonction renommée ou supprimée sans mise à jour du corpus GA-299)"
    )
    assert _calls_back_off(node), (
        f"{relpath}::{funcname} (fournisseur={provider}) classe un 429 sans jamais "
        "appeler back_off() : le compartiment partagé continue d'émettre au même "
        "débit vers la requête suivante après un refus explicite du fournisseur "
        "— très exactement #631, rejouable sur ce fournisseur."
    )


def test_registry_reads_something() -> None:
    """La garde ne peut protéger que ce qu'elle LIT : un corpus vide serait
    vert pour toujours, la forme exacte de la garde borgne dénoncée dans
    CLAUDE.md."""
    assert len(REGISTRY) >= 30, "GA-299 : le corpus des branches 429 est vide ou tronqué"
    # Chaque fichier cité existe réellement — sinon le corpus décrit un audit
    # qui n'a jamais correspondu au dépôt.
    for relpath, _funcname, _provider in REGISTRY:
        assert (SERVICES_DIR / relpath).is_file(), f"{relpath} n'existe pas sous app/services/"


def test_a_function_with_no_429_notion_is_not_flagged() -> None:
    """La garde ne doit PAS attraper ce qu'elle ne vise pas : un mappeur pur,
    sans aucune notion de statut HTTP, ne doit jamais ressortir comme appelant
    ``back_off`` — sinon le prédicat serait trivialement toujours vrai, ce qui
    ne prouverait rien (la forme exacte des six gardes borgnes du dépôt)."""
    tree = _parse("data_sources/recherche_entreprises.py")
    node = _find_function(tree, "_dirigeant")
    assert node is not None
    assert not _calls_back_off(node), (
        "_dirigeant est un mappeur pur (aucun appel réseau) — le trouver "
        "'conforme' au câblage back_off signifierait que le prédicat ne "
        "distingue rien"
    )
