"""Garde : **la seule copie documentaire des TTL de cache dit ce que le code dit.**

## Le défaut qu'elle ferme

Deux documents décrivaient les mêmes durées. ``agent_docs/caching.md`` annonçait
14 / 2 / 2 / 14 jours ; le code disait 30 / 1 / 3 / 7. Personne ne l'a vu pendant
des mois, parce qu'un nombre recopié dans un second document ne casse aucun test
en dérivant — il se contente de mentir à qui le lit pour régler un coût ou
diagnostiquer une donnée périmée.

La correction n'a pas consisté à réécrire les deux : ``caching.md`` a cessé de
porter les valeurs (il ne dit plus que le CÂBLAGE — quel appel sur quel tier) et
renvoie à ``source-cache.md``, qui les porte seul. Cette garde est ce qui empêche
CE document-là de dériver à son tour.

## Ce qu'elle vérifie

Le tableau « TTL par volatilité » de ``agent_docs/source-cache.md`` est lu ligne
à ligne : chaque ligne donne une durée (« **30 j** », « **24 h** ») et le nom de
la variable d'environnement qui la surcharge. Cette variable est ensuite
retrouvée DANS LE CODE, et c'est son DÉFAUT écrit dans le ``os.getenv(...)`` qui
est comparé — pas la valeur résolue à l'exécution, sinon un
``CACHE_TTL_FIRMO_S`` posé dans l'environnement d'un poste ferait passer ou
échouer la garde au hasard.

Deux preuves obligatoires (« une garde doit prouver qu'elle LIT et qu'elle sait
dire NON ») :

* ``test_the_guard_reads_both_sides`` — le tableau n'est pas vide, tous les tiers
  du code y sont, et les défauts ont bien été extraits du code ;
* ``test_the_comparison_says_no`` — la comparaison est exercée sur un couple
  volontairement faux et DOIT le refuser. Sans elle, un extracteur qui rend deux
  dictionnaires vides rendrait la garde verte pour toujours.
"""

from __future__ import annotations

import pathlib
import re

# ``apps/ia/tests/<ce fichier>`` → parents[2] == ``apps`` → parents[3] == racine du dépôt.
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_IA_ROOT = _REPO_ROOT / "apps" / "ia"

SOURCE_CACHE_DOC = _REPO_ROOT / "agent_docs" / "source-cache.md"
CACHING_DOC = _REPO_ROOT / "agent_docs" / "caching.md"
PROVIDER_CACHE = _IA_ROOT / "app" / "services" / "provider_cache.py"
SCRAPE_CACHE = _IA_ROOT / "app" / "services" / "scrape_cache.py"

_DAY_SECONDS = 24 * 3600

# Une ligne du tableau : « | … | **30 j** | `CACHE_TTL_FIRMO_S` | … | ».
_DOC_ROW = re.compile(r"\*\*(\d+)\s*(j|h)\*\*\s*\|\s*`([A-Z0-9_]+)`")

# Le DÉFAUT écrit dans le code, sous ses deux formes réelles :
#   os.getenv("CACHE_TTL_FIRMO_S", str(30 * _DAY))
#   os.getenv("SCRAPE_CACHE_TTL_S", str(7 * 24 * 3600))
_CODE_DEFAULT = re.compile(
    r"""os\.getenv\(\s*["']([A-Z0-9_]+)["']\s*,\s*str\(\s*(\d+)\s*\*\s*(?:_DAY|24\s*\*\s*3600)\s*\)""",
)


def documented_ttls() -> dict[str, int]:
    """Nom d'env → durée EN SECONDES, telle que la documente `source-cache.md`."""
    text = SOURCE_CACHE_DOC.read_text(encoding="utf-8")
    out: dict[str, int] = {}
    for amount, unit, env in _DOC_ROW.findall(text):
        out[env] = int(amount) * (_DAY_SECONDS if unit == "j" else 3600)
    return out


def coded_ttl_defaults() -> dict[str, int]:
    """Nom d'env → durée EN SECONDES, telle que le CODE la prend par défaut."""
    out: dict[str, int] = {}
    for path in (PROVIDER_CACHE, SCRAPE_CACHE):
        for env, days in _CODE_DEFAULT.findall(path.read_text(encoding="utf-8")):
            out[env] = int(days) * _DAY_SECONDS
    return out


def disagreements(documented: dict[str, int], coded: dict[str, int]) -> dict[str, tuple[int, int]]:
    """Les tiers sur lesquels les deux côtés ne disent pas la même chose.

    Un tier documenté mais absent du code est un désaccord aussi : il désigne une
    variable que personne ne lit."""
    out: dict[str, tuple[int, int]] = {}
    for env, doc_seconds in documented.items():
        code_seconds = coded.get(env)
        if code_seconds != doc_seconds:
            out[env] = (doc_seconds, code_seconds if code_seconds is not None else -1)
    return out


def test_the_guard_reads_both_sides() -> None:
    """Preuve que la garde LIT : les deux fichiers existent, le tableau rend
    plusieurs tiers, et les défauts ont réellement été extraits du code."""
    assert SOURCE_CACHE_DOC.is_file(), SOURCE_CACHE_DOC
    documented = documented_ttls()
    coded = coded_ttl_defaults()
    assert len(documented) >= 6, f"tableau de TTL trop maigre ({documented}) — la garde ne lirait presque rien"
    assert len(coded) >= 6, f"défauts introuvables dans le code ({coded}) — la regex ne mord plus"
    # Tout tier qui a un défaut dans le code doit être documenté : c'est la
    # direction qui compte, un tier codé et non écrit est invisible à qui règle.
    assert set(coded) <= set(documented), (
        f"tiers présents dans le code et absents du tableau : {sorted(set(coded) - set(documented))}"
    )


def test_the_comparison_says_no() -> None:
    """Preuve que la garde sait dire NON : la comparaison est exercée sur le
    désaccord HISTORIQUE (doc à 14 j, code à 30 j) et doit le signaler."""
    assert disagreements({"CACHE_TTL_FIRMO_S": 14 * _DAY_SECONDS}, {"CACHE_TTL_FIRMO_S": 30 * _DAY_SECONDS})
    # Et un tier documenté que le code ne porte pas est un désaccord lui aussi.
    assert disagreements({"CACHE_TTL_FANTOME_S": _DAY_SECONDS}, {})
    # Un accord n'en est pas un.
    assert not disagreements({"CACHE_TTL_FIRMO_S": 30 * _DAY_SECONDS}, {"CACHE_TTL_FIRMO_S": 30 * _DAY_SECONDS})


def test_documented_ttls_match_the_code() -> None:
    """L'invariant : chaque durée du tableau est celle que le code prend par défaut."""
    found = disagreements(documented_ttls(), coded_ttl_defaults())
    assert not found, (
        "Le tableau de `agent_docs/source-cache.md` et les constantes ne disent plus la "
        "même chose (env → doc en s, code en s ; -1 = absent du code) : "
        f"{found}. Le tableau est la SEULE copie documentaire de ces durées — le corriger "
        "ici suffit, mais il faut le corriger."
    )


def test_caching_doc_no_longer_keeps_a_second_copy() -> None:
    """`caching.md` ne doit pas re-porter les durées : c'est la copie qui a
    dérivé (14 / 2 / 2 / 14 j face à 30 / 1 / 3 / 7 dans le code). Il décrit le
    CÂBLAGE — quel appel sur quel tier — et renvoie ici pour les valeurs."""
    text = CACHING_DOC.read_text(encoding="utf-8")
    assert "source-cache.md" in text, "caching.md ne renvoie plus vers la page qui porte les durées"
    # Le tableau de câblage ne doit plus porter de colonne « Défaut » chiffrée.
    table_rows = [line for line in text.splitlines() if line.startswith("| **")]
    assert table_rows, "le tableau de câblage de caching.md a disparu — la garde ne lit plus rien"
    offenders = [row for row in table_rows if re.search(r"\|\s*\*\*\d+\s*(j|h)\*\*", row)]
    assert not offenders, (
        "caching.md a recommencé à recopier des durées : "
        f"{offenders}. Une durée vit dans source-cache.md et dans le code, nulle part ailleurs."
    )
