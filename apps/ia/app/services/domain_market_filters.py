"""Quels marchés publics comptent, selon le domaine que le vendeur VEND.

Pendant marchés publics de :mod:`app.services.domain_job_filters`, et même
raison d'être : les deux sources d'appels d'offres (BOAMP pour les avis ouverts,
DECP pour les marchés attribués) filtraient sur les divisions CPV **48**
(progiciels) et **72** (services informatiques), en dur. Une société de conseil
en ingénierie industrielle ne voyait donc aucun des marchés qu'elle sait
gagner — alors que l'appel d'offres est, d'après le retour bêta, le signal le
plus fort de tous : « preuve d'achat et document explicite ».

Deux référentiels distincts (ROME pour l'emploi, CPV pour les marchés), donc
deux modules : les mêler aurait produit une table où la moitié des colonnes ne
veut rien dire pour l'autre moitié.

Sûreté identique : ``None``, ``esn_it`` ou un pack sans filtre ⇒ les divisions
48/72 historiques, à l'octet près.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DomainMarketFilter:
    """Ce qui prouve qu'un marché relève du domaine d'un vendeur."""

    #: Divisions CPV (référentiel PUBLIC de la Commission européenne) qui
    #: suffisent à elles seules.
    cpv_prefixes: tuple[str, ...]
    #: Repli sur l'objet du marché, désaccentué et en minuscules, quand le CPV
    #: est absent ou trop générique — beaucoup d'avis portent un CPV de façade.
    keywords: tuple[str, ...]


#: Ingénierie industrielle. Les divisions retenues, et pourquoi celles-là :
#:  71 — services d'ingénierie (LE cœur : maîtrise d'œuvre, études techniques) ;
#:  73 — recherche et développement ;
#:  50 — réparation et entretien (la maintenance industrielle et les arrêts) ;
#:  42 — machines industrielles (les marchés d'équipement et leur intégration).
#:
#: ⚠️ **45 (travaux de construction) est délibérément EXCLU.** C'est la division
#: la plus volumineuse de la commande publique, et un marché de travaux n'est pas
#: une prestation d'ingénierie : l'ajouter noierait les quelques marchés
#: vraiment adressables sous des centaines de chantiers de voirie.
_INDUSTRIAL = DomainMarketFilter(
    cpv_prefixes=("71", "73", "50", "42"),
    keywords=(
        "ingenierie",
        "maitrise d'oeuvre",
        "assistance technique",
        "bureau d'etudes",
        "etudes techniques",
        "industrialisation",
        "maintenance industrielle",
        "automatisme",
        "controle-commande",
        "controle non destructif",
        "qualification",
        "mise en service",
        "arret de tranche",
        "instrumentation",
        "conception mecanique",
        "essais",
    ),
)


DOMAIN_MARKET_FILTERS: dict[str, DomainMarketFilter] = {
    "industrial_engineering": _INDUSTRIAL,
}


def market_filter_for(pack: str | None) -> DomainMarketFilter | None:
    """Le filtre du pack, ou ``None`` quand le tri IT historique s'applique.

    ``esn_it`` rend explicitement ``None`` : les divisions 48/72 et le lexique IT
    vivent dans les sources et n'ont pas à être recopiés ici — deux définitions
    du même tri divergeraient au premier terme ajouté d'un seul côté.

    ⚠️ ``None`` pour un autre pack n'est PAS un vide : c'est un trou DÉCLARÉ,
    avec sa raison, dans :mod:`app.services.domain_filter_gaps` — et la garde
    ``tests/test_domain_filter_coverage.py`` refuse qu'un pack existe sans que
    quelqu'un ait tranché son tri de sources.
    """
    if not pack or pack == "esn_it":
        return None
    return DOMAIN_MARKET_FILTERS.get(pack)


def market_pack_for_profile(profile: dict | None) -> str | None:
    """LUD.1 — le pack de l'espace qui porte un filtre de marchés, ou ``None``.

    ``None`` = tri IT historique, à l'octet près (espace IT, profil vide). Un
    espace qui déclare plusieurs domaines prend le premier qui a un filtre.
    """
    from app.services.domain_job_filters import profile_job_scope

    scope = profile_job_scope(profile)
    if scope is None:
        return None
    return next((p for p in scope.packs if market_filter_for(p) is not None), None)
