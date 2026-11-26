"""``cyber`` — conseil en CYBERSÉCURITÉ (LAU-FINAL-192, #3186.3).

Le retour bêta #3186 liste CYBER comme une famille d'ESN à part entière — CISO,
responsables sécurité domaine, IAM, GRC, sécurité opérationnelle, équipes
réglementaires — distincte de l'IT généraliste. Avant ce module, un vendeur
cyber pur n'avait AUCUNE lentille dédiée : le code portefeuille
``CYBER_IAM_GRC`` pointait sur ``esn_it`` (`offer_domains/portfolio.py`), donc
« Cybersécurité, IAM, GRC, SOC & résilience numérique » ne changeait RIEN au
prisme — même grille de signaux, même vocabulaire de plays qu'un ESN data ou
cloud. C'est exactement le trou que #2633.1 avait déjà fermé pour ``ia`` :
même diagnostic, même correctif, un domaine plus tard.

Ce que la lentille redirige : la chasse à l'entité (le RSSI / la DSI sécurité,
pas le DSI généraliste), la grille de signaux (incident publié, obligation
réglementaire datée, recrutement CISO, certification), et le vocabulaire des
plays (audit/pentest, SOC managé, IAM, gouvernance). Les CLÉS du contrat JSON
ne bougent pas — seuls les libellés lisibles se spécialisent, comme ``ia`` et
``finance``.

Statut ``live`` : périmètres, familles de signaux et plays sont curés à partir
de types de signaux PUBLICS et vérifiables — aucune méthodologie de vente
inventée.
"""

from __future__ import annotations

from typing import Any

from app.services.offer_domains.base import OfferDomainPack, build_domain_brief, clean_offers

_CYBER_SIGNAL_GRID = """Estime le niveau d'investissement cyber sans budget officiel, via signaux publics :
- Incident de securite publie (breche, ransomware, fuite de donnees) -> budget de remediation immediat -> TRES ELEVE -> "renfort reponse a incident / durcissement"
- Nomination d'un CISO / RSSI Groupe -> nouvelle feuille de route securite probable -> ELEVE -> approche rapide du nouveau decideur
- Echeance reglementaire datee (NIS2, DORA, RGPD, LPM) -> obligation de conformite -> TRES ELEVE -> offre gouvernance/conformite
- Certification ou audit en cours (ISO 27001, SecNumCloud, PCI-DSS) -> chantier de mise en conformite -> ELEVE -> renfort audit/preparation
- Offres d'emploi IAM/SOC/GRC en volume -> structuration de la fonction securite -> ELEVE -> renfort operationnel
- Deploiement cloud/SaaS majeur annonce -> surface d'attaque elargie -> MOYEN -> cadrage securite cloud
- Fusion-acquisition ou integration SI -> convergence de perimetres de securite -> ELEVE -> audit de convergence
- Partenariat avec un editeur de securite (EDR, SIEM, IAM) -> chantier en cours -> MOYEN -> se positionner en integrateur"""


class CyberPack(OfferDomainPack):
    """Conseil en cybersécurité — domaine curé (#3186, retour bêta 28/09)."""

    code = "cyber"
    label_fr = "Cybersécurité"
    label_en = "Cybersecurity"
    status = "live"

    def perimeters(self) -> tuple[str, ...]:
        return (
            "Direction sécurité (CISO / RSSI Groupe)",
            "Responsables sécurité domaine (applicative, infra, cloud)",
            "IAM (identity & access management)",
            "GRC (gouvernance, risques, conformité)",
            "Sécurité opérationnelle (SOC, réponse à incident, threat intel)",
            "Équipes réglementaires selon l'offre (NIS2, DORA, RGPD, LPM)",
            "Architecture de sécurité & sécurité by design",
        )

    def signal_families(self) -> tuple[str, ...]:
        return (
            "Incident de securite publie -> budget de remediation immediat",
            "Nomination d'un CISO / RSSI Groupe -> nouvelle feuille de route securite",
            "Echeance reglementaire datee (NIS2, DORA, RGPD, LPM) -> obligation de conformite",
            "Certification ou audit en cours (ISO 27001, SecNumCloud, PCI-DSS) -> mise en conformite",
            "Offres d'emploi IAM/SOC/GRC en volume -> structuration de la fonction securite",
            "Deploiement cloud/SaaS majeur annonce -> surface d'attaque elargie",
            "Fusion-acquisition ou integration SI -> convergence de perimetres de securite",
        )

    def play_examples(self) -> tuple[str, ...]:
        return (
            "Audit / pentest cible sur un perimetre expose",
            "Renfort SOC managé apres un incident ou avant une echeance reglementaire",
            "Cadrage IAM avant une migration cloud ou une fusion",
            "Preparation de certification (ISO 27001, SecNumCloud)",
            "Atelier de cadrage GRC / mise en conformite NIS2-DORA",
            "Renfort architecture de securite sur un programme cloud",
        )

    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        offers = clean_offers(profile_data)
        sell_examples = (
            ", ".join(offers[:4]) if offers else ("audit/pentest, SOC managé, IAM, GRC, conformité réglementaire")
        )
        return {
            "label": "Cybersécurité",
            "label_long": "cybersécurité",
            "system_label": "surface de sécurité",
            "budget_signal": (
                "Budget cyber visible (incident publié, CISO nommé, échéance réglementaire datée, "
                "certification en cours, recrutements IAM/SOC/GRC)"
            ),
            "tech_entity_directive": (
                "IMPERATIF: identifie l'entite du groupe qui porte la securite (Direction securite / "
                "RSSI Groupe, SOC, equipe GRC) et inclus-la TOUJOURS — c'est la cible n1 d'un vendeur du "
                "domaine Cybersecurite. Pour un groupe federe / confederation, liste les branches majeures "
                "ET l'entite securite de chacune, pas seulement la branche du SIREN resolu."
            ),
            "sell_examples": sell_examples,
            "signal_grid": _CYBER_SIGNAL_GRID,
            "challenge_label": "cyber",
            "play_examples_inline": (
                "audit/pentest, SOC managé, IAM, gouvernance GRC, conformite reglementaire, "
                "architecture de securite"
            ),
            "domain_brief": build_domain_brief(
                label=self.label_fr,
                perimeters=self.perimeters(),
                signal_families=self.signal_families(),
                play_examples=self.play_examples(),
            ),
        }
