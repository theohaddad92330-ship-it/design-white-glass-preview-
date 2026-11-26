"""``industrial_engineering`` — conseil en INGÉNIERIE INDUSTRIELLE.

Pour une société de conseil dont les offres visent le bureau d'études, les
méthodes, la qualité, la maintenance et la production — pas la DSI. C'est le
domaine du retour bêta du 24/08/2026 : « Bellum est techniquement capable de
changer de domaine d'offre, mais reste IT/Data par défaut. »

Ce que la lentille redirige : la chasse à l'entité (le SITE industriel, pas la
DSI groupe), la grille de signaux (CAPEX, plan de charge, appel d'offres
d'ingénierie, externalisation, arrêt de tranche) et le vocabulaire des plays.
Les CLÉS du contrat JSON (``itAutonomy``, ``it_implications_for_esn``,
``programNames``…) ne bougent PAS — seuls leurs libellés lisibles se
spécialisent, comme pour ``finance``.

Deux règles de fond, tirées du retour :

1. **Une activité interne n'est jamais une preuve d'achat externe.** Un bureau
   d'études interne massif, un recrutement de méthodes, une usine qui monte en
   cadence disent une TENSION, pas une externalisation — le signal est utile,
   sa lecture comme « ils achètent » est fausse et se paie en rendez-vous perdus.
2. **Le décideur est TECHNIQUE.** Direction technique, BE, méthodes, qualité,
   maintenance, industrialisation d'abord ; les achats sont un passage, pas une
   porte d'entrée. La grille IT (DSI/RSSI/CTO) ne dit rien de cette chaîne.

Statut ``live`` : périmètres, familles de signaux et plays sont curés à partir
de types de signaux PUBLICS et vérifiables — aucune méthodologie de vente
inventée, aucune valeur chiffrée d'un client codée en dur (les zones, les
seuils d'effectif et les secteurs cibles vivent dans le portefeuille de
l'espace, jamais ici).
"""

from __future__ import annotations

from typing import Any

from app.services.offer_domains.base import OfferDomainPack, build_domain_brief, clean_offers

_INDUSTRIAL_SIGNAL_GRID = """Estime le niveau d'investissement industriel sans budget officiel, via signaux publics :
- Programme CAPEX / nouvelle usine / extension / nouvelle ligne / electrification -> investissement date et localise -> TRES ELEVE -> "se positionner avant le choix des partenaires"
- Appel d'offres ou accord-cadre d'ingenierie (assistance technique, work package, EPCM, maintenance) -> ACHAT en cours, preuve explicite -> TRES ELEVE -> repondre ou viser le rang 2
- Prestataire d'ingenierie nomme / panel publie / sous-traitance declaree -> route d'acces prouvee -> ELEVE -> rang 2 ou renfort du titulaire
- Montee en cadence / carnet de commandes / transfert industriel / relocalisation -> plan de charge sous tension -> ELEVE -> renfort methodes/industrialisation
- Nouveau produit, prototype, homologation, redesign, certification -> demande systemes/meca/elec/IVVQ -> ELEVE -> cadrage etudes
- Crise qualite, rappel, non-conformite, audit fournisseur -> urgence datee -> TRES ELEVE -> renfort qualite/validation
- Arret programme, turnaround, vieillissement des actifs, programme de fiabilite -> fenetre maintenance/MRO -> ELEVE -> preparation d'arret
- Nouveau directeur technique / directeur industriel / creation d'un BE ou d'un centre R&D -> feuille de route a ecrire -> ELEVE -> approche du nouveau decideur
- Programme reseau, reacteur, transition energetique, renouvelables -> contraintes de qualification et de surete -> ELEVE -> qualification prealable
- Recrutements methodes/qualite/maintenance/automatisme en volume -> ACTIVITE interne, jamais une preuve d'externalisation -> MOYEN -> a confirmer par un signal d'achat"""


class IndustrialEngineeringPack(OfferDomainPack):
    """Conseil en ingénierie industrielle — domaine curé (retour bêta 24/08)."""

    code = "industrial_engineering"
    label_fr = "Ingénierie industrielle"
    label_en = "Industrial engineering"
    status = "live"

    def perimeters(self) -> tuple[str, ...]:
        return (
            "Direction technique & direction industrielle",
            "Bureau d'etudes & conception (meca, elec, systemes)",
            "Methodes, industrialisation & NPI",
            "Automatisme, controle-commande & robotique",
            "Qualite, validation & conformite technique",
            "Maintenance, fiabilite & asset management (MRO)",
            "Production & performance usine",
            "R&D, essais & prototypes",
            "HSE & securite industrielle",
            "Pilotage de grands projets industriels (CAPEX, EPCM, project controls)",
        )

    def signal_families(self) -> tuple[str, ...]:
        return (
            "Programme CAPEX / nouvelle usine / nouvelle ligne -> investissement date et localise",
            "Appel d'offres ou accord-cadre d'ingenierie -> achat en cours, preuve explicite",
            "Prestataire d'ingenierie nomme / panel publie -> route d'acces prouvee",
            "Montee en cadence / transfert industriel -> plan de charge sous tension",
            "Nouveau produit, homologation, certification -> demande etudes",
            "Crise qualite, rappel, audit fournisseur -> urgence datee",
            "Arret programme / turnaround / vieillissement des actifs -> fenetre maintenance",
            "Nouveau directeur technique ou industriel, creation d'un BE -> feuille de route a ecrire",
            "Recrutements techniques en volume -> ACTIVITE interne, jamais une preuve d'achat",
        )

    def play_examples(self) -> tuple[str, ...]:
        return (
            "Renfort bureau d'etudes sur un pic de conception (meca / elec / systemes)",
            "Cadrage industrialisation et gammes avant une montee en cadence",
            "Assistance technique methodes sur un transfert de ligne",
            "Renfort qualite/validation apres une non-conformite ou un audit fournisseur",
            "Preparation d'arret programme et plan de maintenance preventive",
            "Work package d'ingenierie sur un lot d'un programme CAPEX",
            "Mise en service et commissioning d'une ligne automatisee",
        )

    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        offers = clean_offers(profile_data)
        sell_examples = (
            ", ".join(offers[:4])
            if offers
            else "bureau d'etudes, methodes/industrialisation, qualite/validation, maintenance & fiabilite"
        )
        return {
            "label": "Ingenierie industrielle",
            "label_long": "ingenierie industrielle",
            "system_label": "appareil industriel",
            "budget_signal": (
                "Budget industriel visible (programme CAPEX, appel d'offres d'ingenierie, "
                "montee en cadence, arret programme, crise qualite, nouveau produit)"
            ),
            "tech_entity_directive": (
                "IMPERATIF: identifie le SITE industriel et l'entite qui porte l'activite technique "
                "(usine, bureau d'etudes, centre R&D, direction industrielle de la branche) et inclus-la "
                "TOUJOURS — c'est la cible n1 d'un vendeur du domaine Ingenierie industrielle. La taille du "
                "GROUPE ne dit rien de la surface d'un site : un site de 300 personnes chez une PME peut "
                "peser plus qu'un site de 30 chez un grand groupe. Pour un groupe federe, liste les branches "
                "majeures ET leur direction technique, pas seulement celle du SIREN resolu."
            ),
            "sell_examples": sell_examples,
            "signal_grid": _INDUSTRIAL_SIGNAL_GRID,
            "challenge_label": "industriels",
            "play_examples_inline": (
                "renfort bureau d'etudes, industrialisation et methodes, qualite & validation, "
                "maintenance et fiabilite, automatisme et mise en service, work package sur programme CAPEX"
            ),
            "domain_brief": build_domain_brief(
                label=self.label_fr,
                perimeters=self.perimeters(),
                signal_families=self.signal_families(),
                play_examples=self.play_examples(),
            ),
        }
