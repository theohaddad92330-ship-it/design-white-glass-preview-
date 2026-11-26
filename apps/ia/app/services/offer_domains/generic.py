"""``generic`` — domain-agnostic lens, driven by the seller's own offers.

For a seller whose domain fits none of the curated packs (or who explicitly
does not want a domain prism). The lens generalises from the seller's declared
offers — the same philosophy as the Drive #9 dé-silo — but is EXPLICIT: unlike
the default heuristic (which keeps the IT lens for an IT-looking profile),
selecting ``generic`` always drops the assumed-IT wording.

Status ``live``: the vocabulary below is deliberately domain-neutral (it names
signal SHAPES — recruitment, leadership change, funded programme — that exist
in every business domain), never invented domain expertise.
"""

from __future__ import annotations

from typing import Any

from app.services.heavy_offer_gate import play_examples_inline
from app.services.offer_domains.base import OfferDomainPack, build_domain_brief, clean_offers

_GENERIC_SIGNAL_GRID = """Estime le niveau d'investissement du compte sur le domaine d'offre du vendeur, via signaux publics :
- Recrutements 5+ sur le domaine -> besoin structurel / projet massif -> niveau ELEVE -> "renfort immediat sur le perimetre"
- Competences dominantes dans les offres d'emploi -> perimetre a pousser -> MOYEN -> aligner les profils
- Annonces de transformation (presse / rapport annuel) -> chantiers finances -> ELEVE -> accompagnement programme
- Incidents / crises publiques sur le perimetre -> urgence operationnelle -> ELEVE -> renfort immediat
- Levee de fonds / acquisition -> budget disponible -> TRES ELEVE -> timing ideal
- Changement du decideur du perimetre (direction concernee) -> nouvelle strategie probable -> ELEVE -> approche rapide du nouveau decideur
- Partenariats / appels d'offres sur le domaine -> achat en cours + acteurs en place -> MOYEN"""


class GenericPack(OfferDomainPack):
    """Domain-agnostic — the seller's declared offers ARE the lens."""

    code = "generic"
    label_fr = "Générique (multi-domaines)"
    label_en = "Generic (multi-domain)"
    status = "live"

    def perimeters(self) -> tuple[str, ...]:
        return (
            "Directions metiers porteuses du besoin (a identifier par les offres du vendeur)",
            "Direction generale / COMEX (sponsor)",
            "Directions support concernees (finance, RH, achats, juridique)",
            "Achats / referencement fournisseurs",
        )

    def signal_families(self) -> tuple[str, ...]:
        return (
            "Recrutements 5+ sur le domaine d'offre -> besoin structurel",
            "Changement du decideur du perimetre -> nouvelle strategie probable",
            "Annonces de transformation / programme finance -> chantiers ouverts",
            "Incidents / crises publiques sur le perimetre -> urgence operationnelle",
            "Levee de fonds / acquisition -> budget disponible",
            "Appels d'offres / partenariats sur le domaine -> achat en cours",
        )

    def play_examples(self) -> tuple[str, ...]:
        return (
            "Audit flash du perimetre avant un jalon annonce",
            "Atelier de cadrage 45 min avec la direction concernee",
            "Renfort d'equipe pendant un pic (transformation, integration)",
            "Mission pilote courte a perimetre borne, KPI explicite",
        )

    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        offers = clean_offers(profile_data)
        label = offers[0] if offers else "métier"
        label_long = " / ".join(offers[:3]) if offers else "périmètres métiers"
        sell_examples = ", ".join(offers[:4]) if offers else "offres declarees du vendeur"
        return {
            "label": label,
            "label_long": label_long,
            "system_label": "périmètre métier",
            "budget_signal": (f"Budget {label} visible (recrutements/CDI sur le domaine, AO recents, transfo majeure)"),
            "tech_entity_directive": (
                f"IMPERATIF: identifie l'entite du groupe la plus pertinente pour le domaine « {label_long} » "
                "(filiale, direction ou BU qui porte ce metier) et inclus-la TOUJOURS — c'est la cible n1 d'un "
                "vendeur de ce domaine. Pour un groupe federe / confederation (plusieurs groupes autonomes), "
                "liste les branches majeures ET l'entite metier de chacune, pas seulement la branche du SIREN resolu."
            ),
            "sell_examples": sell_examples,
            "signal_grid": _GENERIC_SIGNAL_GRID,
            "challenge_label": label,
            # Garde-fou p31 n°5 : l'« audit flash » n'est proposé que si le PROFIL
            # le porte (références déclarées + capacité de delivery). Sans cela,
            # il sortait par réflexe pour n'importe quel vendeur.
            "play_examples_inline": play_examples_inline(profile_data, "audit flash du perimetre"),
            "domain_brief": build_domain_brief(
                label=label_long if offers else self.label_fr,
                perimeters=self.perimeters(),
                signal_families=self.signal_families(),
                play_examples=self.play_examples(),
            ),
        }
