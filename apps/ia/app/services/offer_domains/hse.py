"""``hse`` — conseil en ENVIRONNEMENT / HSE (LAU-FINAL-192, #3186.5).

Même diagnostic que ``cyber`` (#3186.3) : le retour bêta liste ENVIRONNEMENT /
HSE comme une famille d'ESN à part entière — HSE, QHSE, environnement,
conformité, risques industriels, direction de site — distincte de
l'ingénierie industrielle généraliste. Le code portefeuille
``QUALITY_VALIDATION_HSE`` pointait sur ``industrial_engineering``
(`offer_domains/portfolio.py`) : un cabinet QHSE/environnement pur (aucune
offre bureau d'études, méthodes ou automatisme) recevait donc le prisme
industriel générique — décideur bureau d'études, signaux CAPEX/production —
jamais la conformité réglementaire environnementale ou le risque industriel
qui font le métier de CE vendeur-là.

Ce que la lentille redirige : la chasse à l'entité (la direction HSE / site,
pas le bureau d'études), la grille de signaux (mise en demeure ICPE, échéance
réglementaire environnementale, incident industriel, certification), et le
vocabulaire des plays (audit HSE, conformité ICPE, plan de prévention).

Statut ``live`` : périmètres, familles de signaux et plays sont curés à partir
de types de signaux PUBLICS et vérifiables — aucune méthodologie de vente
inventée.
"""

from __future__ import annotations

from typing import Any

from app.services.offer_domains.base import OfferDomainPack, build_domain_brief, clean_offers

_HSE_SIGNAL_GRID = """Estime le niveau d'investissement HSE/environnement sans budget officiel, via signaux publics :
- Mise en demeure ou sanction ICPE (installation classee) -> obligation de mise en conformite datee -> TRES ELEVE -> "renfort conformite reglementaire"
- Accident industriel ou incident HSE publie -> budget de remediation immediat -> TRES ELEVE -> audit HSE d'urgence
- Echeance reglementaire environnementale (CSRD, bilan carbone, REACH, ICPE) -> obligation datee -> ELEVE -> offre conformite/reporting
- Certification ou audit en cours (ISO 14001, ISO 45001, MASE) -> chantier de mise en conformite -> ELEVE -> renfort audit/preparation
- Nomination d'un directeur HSE / QHSE Groupe -> nouvelle feuille de route probable -> ELEVE -> approche du nouveau decideur
- Extension ou creation de site industriel classe -> etude d'impact et autorisation requises -> ELEVE -> cadrage reglementaire amont
- Offres d'emploi HSE/environnement en volume -> structuration de la fonction -> MOYEN -> renfort operationnel
- Plan de transition environnementale / decarbonation annonce -> budget engage -> ELEVE -> se positionner en accompagnement"""


class HsePack(OfferDomainPack):
    """Conseil en environnement / HSE — domaine curé (#3186, retour bêta 28/09)."""

    code = "hse"
    label_fr = "Environnement & HSE"
    label_en = "Environment & HSE"
    status = "live"

    def perimeters(self) -> tuple[str, ...]:
        return (
            "Direction HSE / QHSE Groupe",
            "Environnement & conformité réglementaire (ICPE, REACH, CSRD)",
            "Risques industriels & prévention",
            "Direction de site (responsable HSE site)",
            "Sécurité opérationnelle & plans de prévention",
            "Qualité & certification (ISO 14001, ISO 45001, MASE)",
        )

    def signal_families(self) -> tuple[str, ...]:
        return (
            "Mise en demeure ou sanction ICPE -> obligation de mise en conformite datee",
            "Accident industriel ou incident HSE publie -> budget de remediation immediat",
            "Echeance reglementaire environnementale (CSRD, bilan carbone, REACH) -> obligation datee",
            "Certification ou audit en cours (ISO 14001, ISO 45001, MASE) -> mise en conformite",
            "Nomination d'un directeur HSE / QHSE Groupe -> nouvelle feuille de route",
            "Extension ou creation de site industriel classe -> etude d'impact requise",
            "Plan de transition environnementale / decarbonation annonce -> budget engage",
        )

    def play_examples(self) -> tuple[str, ...]:
        return (
            "Audit HSE flash sur un site apres incident ou mise en demeure",
            "Renfort conformite reglementaire avant une echeance ICPE/CSRD",
            "Preparation de certification (ISO 14001, ISO 45001, MASE)",
            "Cadrage plan de prevention avant extension de site",
            "Atelier decarbonation / bilan carbone pour un plan de transition",
        )

    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        offers = clean_offers(profile_data)
        sell_examples = (
            ", ".join(offers[:4])
            if offers
            else ("audit HSE, conformite ICPE/CSRD, plan de prevention, certification ISO 14001/45001")
        )
        return {
            "label": "Environnement & HSE",
            "label_long": "environnement et HSE",
            "system_label": "dispositif HSE",
            "budget_signal": (
                "Budget HSE visible (mise en demeure ICPE, incident publie, echeance reglementaire "
                "environnementale, certification en cours, nomination d'un directeur HSE)"
            ),
            "tech_entity_directive": (
                "IMPERATIF: identifie l'entite qui porte le HSE (Direction HSE/QHSE Groupe, responsable "
                "HSE du site) et inclus-la TOUJOURS — c'est la cible n1 d'un vendeur du domaine "
                "Environnement/HSE. Pour un groupe federe, liste les branches majeures ET leur direction "
                "HSE, pas seulement celle du SIREN resolu."
            ),
            "sell_examples": sell_examples,
            "signal_grid": _HSE_SIGNAL_GRID,
            "challenge_label": "HSE",
            "play_examples_inline": (
                "audit HSE, conformite reglementaire ICPE/CSRD, plan de prevention, certification "
                "ISO 14001/45001, decarbonation"
            ),
            "domain_brief": build_domain_brief(
                label=self.label_fr,
                perimeters=self.perimeters(),
                signal_families=self.signal_families(),
                play_examples=self.play_examples(),
            ),
        }
