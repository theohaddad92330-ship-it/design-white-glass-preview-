"""GA-17 — une source n'en appelle pas une autre (tome 7 §20.4).

Le service IA compte 112 services. Le risque n'est pas leur nombre : c'est
qu'un service en appelle cinq autres et devienne impossible à tester seul.
`data_sources/` est l'endroit où ça se produirait en premier — chaque source
lit un fournisseur externe, et il est tentant d'en appeler une voisine pour
« compléter ».

Cinq exceptions, toutes des PRIMITIVES partagées et non des sources :
`territory_query` (département + fenêtre), `signal_errors` (le type d'erreur
commun), `registry_lookup` (résolution de nom → SIREN), `_http_pool`
(#2604.2 — le client HTTP partagé, une fois par process, GA-26 : factorisé
UNE fois plutôt que dupliqué dans chaque fichier) et `job_platforms`
(#2616.1 — la table de labels/détection de plateforme d'offres d'emploi,
GA-26 : aucun appel réseau, pas un fournisseur externe, juste une table
partagée entre `job_search.py` et `discover_signals.py`). Elles existent
précisément pour éviter la duplication, et c'est ce qui les distingue.

⚠️ Le cliquet est une LISTE, pas un nombre : un import croisé de plus doit se
justifier par écrit, pas se noyer dans un compteur.
"""

from __future__ import annotations

import re
from pathlib import Path

DATA_SOURCES = Path(__file__).resolve().parents[1] / "app" / "services" / "data_sources"

#: Modules qui ne sont PAS des sources : des primitives partagées.
PRIMITIVES = {"territory_query", "signal_errors", "registry_lookup", "_http_pool", "job_platforms", "employer_match"}

#: Les imports source → source tolérés au 23/08/2026, avec leur raison.
#: Cette liste ne doit que RÉTRÉCIR.
ALLOWED: dict[tuple[str, str], str] = {
    (
        "ats_boards",
        "france_travail",
    ): "Réutilise le filtre IT et la fenêtre de fraîcheur de France Travail plutôt que d'en écrire un second, qui divergerait.",
    (
        "ats_boards_more",
        "ats_boards",
    ): "#3925 — les ATS ajoutés réutilisent les primitives de l'ATS d'origine (slugs, filtre IT, fenêtre de fraîcheur) plutôt que d'en écrire un second jeu qui divergerait.",
    (
        "careers_pages",
        "france_travail",
    ): "#3925 — les pages carrières réutilisent `is_it_offer` : un second vocabulaire IT divergerait du seul déjà mesuré.",
    (
        "wttj",
        "france_travail",
    ): (
        "#2616.1 — `list_hiring_companies_wttj` réutilise `is_it_offer` : l'index "
        "WTTJ couvre TOUS les métiers (pas seulement l'IT, contrairement à l'APEC "
        "qui ne couvre que les cadres), un second vocabulaire IT dupliqué "
        "divergerait du seul déjà mesuré sur un corpus réel."
    ),
    (
        "registry_lookup",
        "recherche_entreprises",
    ): "La primitive de résolution s'appuie sur le registre public : c'est sa raison d'être, pas un couplage subi.",
    (
        "job_search",
        "france_travail",
    ): (
        "#2616.1 — `list_hiring_companies_search` réutilise `is_it_offer` : même "
        "raison que `wttj` ci-dessus, un second vocabulaire IT dupliqué "
        "divergerait du seul déjà mesuré sur un corpus réel."
    ),
    (
        "bodacc_capital",
        "bodacc",
    ): (
        "#3941.5 (décision Louis 17/10 : levée = BODACC B) — la famille B du MÊME bulletin réutilise le client "
        "partagé, le lien d'annonce et la lecture des champs JSON de `bodacc` : un second client du même "
        "service divergerait (GA-26)."
    ),
    (
        "bodacc_takeover",
        "bodacc",
    ): (
        "#4732.1 — « Rachat ou fusion » lit le MÊME bulletin : client partagé, lien d'annonce et lecture des "
        "champs JSON de `bodacc` réutilisés, un second client du même service divergerait (GA-26)."
    ),
    (
        "bodacc_takeover",
        "bodacc_capital",
    ): (
        "#4732.1 — même jeu de données BODACC B que la famille « capital » : base, taille de page, nom de "
        "source et lecture de la société nommée réutilisés plutôt que recopiés."
    ),
}

IMPORT = re.compile(r"from app\.services\.data_sources\.(\w+) import")


def _cross_imports() -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()
    for path in sorted(DATA_SOURCES.glob("*.py")):
        if path.name == "__init__.py":
            continue
        source = path.read_text(encoding="utf-8")
        for match in IMPORT.finditer(source):
            target = match.group(1)
            if target == path.stem or target in PRIMITIVES:
                continue
            found.add((path.stem, target))
    return found


def test_no_source_imports_another_source() -> None:
    unexpected = sorted(_cross_imports() - set(ALLOWED))
    assert unexpected == [], (
        "Une source de données en importe une autre. Extrais la partie commune "
        "dans une primitive (comme `territory_query`), ou inscris l'import dans "
        f"ALLOWED avec sa raison : {unexpected}"
    )


def test_the_allowed_list_holds_no_stale_entry() -> None:
    """Une exception qui n'existe plus ment sur le couplage réel."""
    stale = sorted(set(ALLOWED) - _cross_imports())
    assert stale == [], f"Exception périmée dans ALLOWED : {stale}"


def test_the_guard_actually_reads_the_sources() -> None:
    """Une garde qui ne lit rien passe au vert pour toujours."""
    files = [path.name for path in DATA_SOURCES.glob("*.py")]
    assert len(files) > 5
    assert "france_travail.py" in files
