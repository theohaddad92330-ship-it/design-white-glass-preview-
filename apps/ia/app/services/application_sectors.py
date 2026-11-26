"""Secteurs d'application — miroir embarqué du contrat TS.

``packages/contracts/src/schemas/application-sectors.ts`` est la SOURCE ; le
service IA n'a pas accès au paquet contracts à l'exécution (racine Railway =
``apps/ia``), d'où cette copie. Sa parité est verrouillée par
``tests/test_application_sectors_parity.py``, qui lit le fichier TS — même
discipline que la table des 66 domaines.

Ne pas l'éditer à la main sans éditer le TS : c'est la moitié qui se voit le
moins, et deux copies qui divergent produisent un secteur qui existe d'un côté
du fil et pas de l'autre.
"""

from __future__ import annotations

#: code → libellé français. Miroir VERBATIM de ``APPLICATION_SECTORS``.
APPLICATION_SECTOR_LABELS_FR: dict[str, str] = {
    "automotive": "Automobile",
    "aerospace": "Aéronautique & spatial",
    "defense": "Défense",
    "naval": "Naval & maritime",
    "industrial_equipment": "Équipements industriels",
    "special_machinery": "Machines spéciales",
    "electronics_semiconductor": "Électronique & semi-conducteurs",
    "steel_materials": "Sidérurgie, métallurgie & matériaux",
    "nuclear": "Nucléaire",
    "power_grid_distribution": "Réseaux électriques & distribution",
    "renewables": "Énergies renouvelables",
    "oil_gas": "Pétrole & gaz",
    "water_waste": "Eau & déchets",
    "chemicals": "Chimie & procédés",
    "pharma_manufacturing": "Pharma & production industrielle",
    "food_beverage": "Agroalimentaire",
    "cosmetics": "Cosmétique & parfumerie",
    "paper_packaging": "Papier & emballage",
    "construction": "BTP & génie civil",
    "real_estate": "Immobilier",
    "transport_infrastructure": "Infrastructures de transport",
    "rail": "Ferroviaire",
    "air_transport": "Transport aérien",
    "road_maritime": "Transport routier & maritime",
    "logistics": "Logistique & supply chain",
    "retail_banking": "Banque de détail & privée",
    "investment_banking": "Banque d'investissement & marchés",
    "insurance": "Assurance & mutuelles",
    "fintech": "Fintech & services financiers",
    "healthcare": "Santé & hôpitaux",
    "life_sciences": "Sciences du vivant & biotech",
    "medtech": "Medtech & dispositifs médicaux",
    "retail": "Retail & grande distribution",
    "ecommerce": "E-commerce & marketplaces",
    "luxury": "Luxe & mode",
    "hospitality_tourism": "Hôtellerie, tourisme & loisirs",
    "software_tech": "Éditeurs & tech",
    "telecom": "Télécoms",
    "media_entertainment": "Médias & divertissement",
    "public_sector": "Secteur public & collectivités",
    "education_research": "Éducation & recherche",
}


def application_sector_names_fr(codes: list[str] | tuple[str, ...] | None) -> list[str]:
    """Libellés FR des codes RECONNUS, dans l'ordre reçu.

    Un code inconnu est IGNORÉ et non rendu tel quel : le prisme ne doit jamais
    nommer au modèle un secteur qu'il ne sait pas décrire.
    """
    out: list[str] = []
    for code in codes or []:
        label = APPLICATION_SECTOR_LABELS_FR.get(str(code))
        if label:
            out.append(label)
    return out
