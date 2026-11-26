"""Rerun ciblé par FAMILLE / NIVEAU (annexe organigramme §6, phase 5).

Le commercial clique une zone blanche de la matrice de couverture (« Cyber ×
N-1 ») et relance la recherche de CETTE case, sans rejouer le dossier.
``resolve_segment_scope`` traduit (famille, niveau) en scope Apollo réutilisable
par le ré-run existant (``ContactScope`` + endpoint ``enrich-contacts``).
"""

from __future__ import annotations

from app.services.contact_segments import _FAMILY_PRESETS, resolve_segment_scope, role_families

# Les 11 familles de la matrice de couverture (FAMILY_DEFS, coverage.service.ts).
# Ce test est le verrou de parité : une famille affichée au commercial doit
# pouvoir être relancée.
COVERAGE_FAMILY_KEYS = [
    "it",
    "cyber",
    "data",
    "ia",
    "infra",
    "dev",
    "finance",
    "achat",
    "pmo",
    "clevel",
    "rh",
]


def test_role_families_exposes_the_named_vocabulary() -> None:
    # #2314.5 : `_FAMILY_PRESETS` était une table de résolution interne à
    # `resolve_segment_scope` — jamais un vocabulaire qu'un appelant pouvait
    # lister nommément (ex. le playbook d'ouverture compte froid, #2314.1).
    assert role_families() == COVERAGE_FAMILY_KEYS


def test_family_and_level_target_that_cell_titles() -> None:
    scope = resolve_segment_scope("cyber", "n1")
    joined = " ".join(scope["titles"]).lower()
    assert "rssi" in joined or "cybersécurité" in joined
    # Apollo ANDe titres et bandes : combiner les deux viderait la recherche alors
    # que le titre porte déjà le niveau.
    assert scope["seniorities"] == []


def test_org_graph_levels_project_onto_the_same_bands() -> None:
    """Les niveaux L0-L5 du contrat OrgGraph et c_level/n1/n2 de la matrice
    décrivent la même strate : L2 == N-1, L1 == C-Level, L3 == N-2."""
    assert resolve_segment_scope("data", "L2") == resolve_segment_scope("data", "n1")
    assert resolve_segment_scope("data", "L1") == resolve_segment_scope("data", "c_level")
    assert resolve_segment_scope("data", "L3") == resolve_segment_scope("data", "n2")


def test_family_alone_spans_every_level() -> None:
    scope = resolve_segment_scope("achat", None)
    joined = " ".join(scope["titles"]).lower()
    assert "directeur achats groupe" in joined  # C-Level
    assert "acheteur it" in joined  # N-2
    assert scope["seniorities"] == []


def test_level_alone_searches_the_whole_stratum() -> None:
    scope = resolve_segment_scope(None, "n1")
    assert scope["titles"] == []
    assert "director" in scope["seniorities"] and "vp" in scope["seniorities"]
    # L0 = gouvernance, une strate distincte de l'exécutif L1.
    assert resolve_segment_scope(None, "L0")["seniorities"] != resolve_segment_scope(None, "L1")["seniorities"]


def test_family_aliases_and_labels_resolve() -> None:
    """La valeur peut venir de la matrice (clé) comme d'un classifieur (libellé)."""
    assert resolve_segment_scope("RSSI", "n1") == resolve_segment_scope("cyber", "n1")
    assert resolve_segment_scope("C-Level", "n1") == resolve_segment_scope("clevel", "n1")
    assert resolve_segment_scope("Informatique", "n2") == resolve_segment_scope("it", "n2")


def test_unknown_family_falls_back_to_raw_keyword() -> None:
    """Jamais d'échec ni d'élargissement silencieux : on cherche le mot-clé brut."""
    scope = resolve_segment_scope("Robotique", "n1")
    assert scope["titles"] == ["Robotique"]
    assert scope["seniorities"] == []


def test_composite_family_label_resolves_its_known_tokens() -> None:
    """Les zones blanches de l'organigramme portent des libellés COMPOSÉS
    (« Cloud / Infrastructure / HPC »), pas les clés de la matrice. Le libellé
    entier ne matchait aucun preset et partait tel quel en ``person_titles``
    Apollo — une chaîne que personne ne porte comme titre, donc ~0 résultat."""
    scope = resolve_segment_scope("Cloud / Infrastructure / HPC", "n1")
    joined = " ".join(scope["titles"]).lower()
    assert "head of cloud" in joined
    assert scope["titles"] != ["Cloud / Infrastructure / HPC"]
    assert scope["seniorities"] == []


def test_composite_family_unions_every_family_it_names() -> None:
    """Un libellé qui nomme trois métiers les cherche tous les trois : Apollo ORe
    les titres, restreindre à un seul perdrait les deux autres."""
    scope = resolve_segment_scope("Data / IA / Cloud", "n1")
    joined = " ".join(scope["titles"]).lower()
    assert "head of data" in joined
    assert "head of ai" in joined
    assert "head of cloud" in joined
    assert len(scope["titles"]) == len(set(scope["titles"]))  # dédupliqué


def test_composite_family_keeps_the_order_of_the_label() -> None:
    """L'ordre du libellé est celui que le commercial lit — on ne le réordonne pas."""
    scope = resolve_segment_scope("Data / Cloud", "c_level")
    assert scope["titles"][0] == "Chief Data Officer"


def test_composite_family_without_any_known_token_keeps_the_raw_label() -> None:
    """Aucun métier reconnu : on garde le mot-clé brut (comportement d'avant),
    jamais un élargissement silencieux."""
    scope = resolve_segment_scope("Robotique / Mécatronique", "n1")
    assert scope["titles"] == ["Robotique / Mécatronique"]


def test_a_known_family_label_is_never_split() -> None:
    """Un libellé qui matche EN ENTIER garde son preset : le découpage n'est
    qu'un repli, il ne doit pas changer les cas qui marchaient."""
    assert resolve_segment_scope("Ressources humaines", "n1") == resolve_segment_scope("rh", "n1")


def test_unknown_level_is_ignored_not_widened() -> None:
    assert resolve_segment_scope(None, "N-42") == {"titles": [], "seniorities": []}
    # Une famille connue reste cherchée même si le niveau est illisible.
    assert resolve_segment_scope("data", "N-42") == resolve_segment_scope("data", None)


def test_empty_scope_changes_nothing() -> None:
    assert resolve_segment_scope(None, None) == {"titles": [], "seniorities": []}
    assert resolve_segment_scope("", "") == {"titles": [], "seniorities": []}


def test_every_coverage_family_is_searchable_at_every_level() -> None:
    keys = [p["key"] for p in _FAMILY_PRESETS]
    assert keys == COVERAGE_FAMILY_KEYS
    for key in keys:
        for level in ("c_level", "n1", "n2", "L0", "L2", "L4"):
            assert resolve_segment_scope(key, level)["titles"], (key, level)
