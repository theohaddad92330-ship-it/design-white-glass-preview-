"""Un filtre doit dire ce qu'il REJETTE — y compris quand il ne filtre rien.

``job_filter_for`` et ``market_filter_for`` rendent ``None`` pour six des huit
packs enregistrés, et le tri IT historique s'applique alors. Ce ``None`` est
correct — c'est la sûreté du chemin par défaut — mais il ne disait RIEN : un
vendeur finance recevait des annonces de développeurs sans qu'aucune ligne du
dépôt n'explique pourquoi.

C'est le même défaut que celui du parseur DATAFORGE, mesuré le 29/08/2026 :
dix-huit colonnes tombaient parce qu'un filtre de préfixes silencieux se lit
« il n'y avait rien ». La réponse est la même — nommer, compter, garder.

Ce que cette garde tient : **aucun pack ne peut exister sans que quelqu'un ait
tranché**. Soit il a un filtre, soit il est le défaut IT, soit son absence de
filtre est déclarée AVEC sa raison.
"""

from __future__ import annotations

from app.services.domain_filter_gaps import DOMAIN_FILTER_GAPS, filter_gap_for
from app.services.domain_job_filters import DOMAIN_JOB_FILTERS, job_filter_for
from app.services.domain_market_filters import DOMAIN_MARKET_FILTERS, market_filter_for
from app.services.offer_domains import OFFER_DOMAIN_PACKS
from app.services.offer_domains.base import DEFAULT_OFFER_DOMAIN


def test_le_corpus_nest_pas_vide() -> None:
    """Sans ça, la garde serait verte sur un registre vidé par erreur."""
    assert len(OFFER_DOMAIN_PACKS) >= 8
    assert DOMAIN_FILTER_GAPS, "un registre vide ne garde rien"


def test_chaque_pack_est_tranche() -> None:
    """Filtré, défaut IT, ou déclaré manquant — jamais un silence."""
    undecided = [
        code
        for code in OFFER_DOMAIN_PACKS
        if code != DEFAULT_OFFER_DOMAIN and code not in DOMAIN_JOB_FILTERS and code not in DOMAIN_FILTER_GAPS
    ]
    assert undecided == []


def test_les_deux_referentiels_sont_traites_ensemble() -> None:
    """ROME (emploi) et CPV (marchés) : un pack filtré d'un seul côté serait un
    trou à moitié bouché, et c'est la moitié restante qu'on oublierait."""
    assert set(DOMAIN_JOB_FILTERS) == set(DOMAIN_MARKET_FILTERS)


def test_chaque_raison_est_ecrite_et_chiffree() -> None:
    for pack, reason in DOMAIN_FILTER_GAPS.items():
        assert len(reason) > 60, f"{pack} : une raison de deux mots n'est pas une raison"
        assert any(char.isdigit() for char in reason), f"{pack} : un pack de données se décrit par des chiffres"


def test_le_registre_ne_garde_aucune_entree_perimee() -> None:
    """Un pack retiré doit disparaître d'ici, sinon le registre décrit un dépôt
    qui n'existe plus."""
    stale = [pack for pack in DOMAIN_FILTER_GAPS if pack not in OFFER_DOMAIN_PACKS]
    assert stale == []


def test_un_pack_filtre_nest_pas_aussi_declare_manquant() -> None:
    """Les deux affirmations se contrediraient, et on croirait la plus rassurante."""
    assert set(DOMAIN_FILTER_GAPS) & set(DOMAIN_JOB_FILTERS) == set()


def test_la_garde_sait_dire_non() -> None:
    """Preuve qu'elle ne passe pas au vert sur du vide : un pack inventé n'est ni
    filtré, ni le défaut, ni déclaré — donc il serait vu."""
    invente = "pack_qui_nexiste_pas"
    assert invente not in OFFER_DOMAIN_PACKS
    assert job_filter_for(invente) is None
    assert market_filter_for(invente) is None
    assert filter_gap_for(invente) is None


def test_le_defaut_it_reste_le_defaut() -> None:
    """Le tri IT vit dans les sources, pas ici — le déclarer « manquant »
    inviterait à le recopier, et deux définitions du même tri divergent."""
    assert DEFAULT_OFFER_DOMAIN not in DOMAIN_FILTER_GAPS
    assert job_filter_for(DEFAULT_OFFER_DOMAIN) is None
    assert job_filter_for(None) is None


def test_un_pack_declare_manquant_rend_sa_raison() -> None:
    for pack in DOMAIN_FILTER_GAPS:
        assert filter_gap_for(pack) == DOMAIN_FILTER_GAPS[pack]
        # …et il continue de retomber sur le tri historique, à l'octet près.
        assert job_filter_for(pack) is None
        assert market_filter_for(pack) is None
