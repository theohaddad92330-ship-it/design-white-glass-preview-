"""#2284 — le résolveur d'entité a un APPELANT dans le pipeline d'analyse.

Même compromis que ``test_phase1_market_memory_is_wired.py`` : exécuter
``_research`` demanderait de simuler une dizaine de fournisseurs ; on LIT le
chemin, commentaires retirés (un docblock qui raconte le câblage ne suffit pas).
"""

from __future__ import annotations

import inspect
import re

from app.routers import phase1_research


def _corps_de_research() -> str:
    source = inspect.getsource(phase1_research._research)
    sans_commentaires = re.sub(r"(?m)^\s*#.*$", "", source)
    return re.sub(r'"""(?:.|\n)*?"""', "", sans_commentaires)


def test_le_corps_lu_nest_pas_vide() -> None:
    corps = _corps_de_research()
    assert len(corps) > 2000
    assert "assess_identity(" in corps  # témoin : le verdict que le résolveur compose


def test_le_resolveur_est_appele_et_ecrit_raw_analysis() -> None:
    corps = _corps_de_research()
    assert "resolve_account_entity(" in corps
    assert re.search(r'result\["entity_resolution"\]\s*=', corps)


def test_le_resolveur_passe_apres_le_verdict_didentite() -> None:
    """Il COMPOSE ``assess_identity`` : appelé avant, il lirait un verdict absent."""
    corps = _corps_de_research()
    assert corps.index("assess_identity(") < corps.index("resolve_account_entity(")


def test_official_site_match_est_calcule_puis_transmis() -> None:
    """#2284.22 — le flag est posé au SUCCÈS du repli SIREN web/bundle
    (``resolve_pappers_via_web_or_bundle``, lecture déterministe des mentions
    légales), pas deviné, et transmis au résolveur."""
    corps = _corps_de_research()
    assert "_official_site_match = pappers_profile is not None" in corps
    assert corps.index("resolve_pappers_via_web_or_bundle(") < corps.index("official_site_match=_official_site_match")
    assert re.search(r"official_site_match=_official_site_match", corps)
def test_2284_17_la_categorie_juridique_insee_est_appelee_et_appliquee() -> None:
    """#2284.17 — ``unite_legale_by_siren`` (registre légal INSEE déjà branché)
    est appelée pour le SIREN résolu et son résultat composé sur
    ``entity_resolution`` APRÈS ``resolve_account_entity`` (elle précise un
    ``kind`` déjà posé, elle n'en fabrique aucun)."""
    corps = _corps_de_research()
    assert "unite_legale_by_siren(" in corps
    assert "attach_legal_category_kind(" in corps
    assert corps.index("resolve_account_entity(") < corps.index("attach_legal_category_kind(")


def test_2284_33_58_les_denominations_anterieures_sont_appliquees() -> None:
    """#2284.33/.58 — même unité légale que #2284.17 ci-dessus (un SEUL appel
    Sirene) : ``attach_former_legal_names`` compose les dénominations
    antérieures APRÈS ``resolve_account_entity``."""
    corps = _corps_de_research()
    assert "attach_former_legal_names(" in corps
    assert corps.index("resolve_account_entity(") < corps.index("attach_former_legal_names(")


def test_2284_26_le_domaine_prouve_par_alias_est_applique() -> None:
    """#2284.26 — ``bellum_api.market_alias_domain_for`` (pont interne vers
    `MarketMemoryService.aliasProvenDomain`) est appelée et son résultat
    composé sur ``entity_resolution`` APRÈS ``resolve_account_entity``."""
    corps = _corps_de_research()
    assert "market_alias_domain_for(" in corps
    assert "attach_alias_domain(" in corps
    assert corps.index("resolve_account_entity(") < corps.index("attach_alias_domain(")
