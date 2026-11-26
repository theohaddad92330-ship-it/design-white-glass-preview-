"""``finance`` — curated witness domain: selling into the FINANCE function.

For a consulting/services firm whose offers target the finance office (DAF,
contrôle de gestion, consolidation, trésorerie, audit interne, conformité) —
not the DSI. The lens redirects the entity hunt, the signal grid and the play
vocabulary to the finance perimeter while keeping every JSON data-contract key
(``itAutonomy``, ``it_implications_for_esn``, ``programNames``…) untouched.

Status ``live``: perimeters / signal families / plays are curated (public,
verifiable signal types only — no invented sales methodology).
"""

from __future__ import annotations

from typing import Any

from app.services.offer_domains.base import OfferDomainPack, build_domain_brief, clean_offers

_FINANCE_SIGNAL_GRID = """Estime le niveau d'investissement de la fonction finance sans budget officiel, via signaux publics :
- Recrutements finance 5+ (controle de gestion, consolidation, tresorerie) -> structuration / croissance -> niveau ELEVE -> "renfort immediat sur la fonction"
- Changement de CFO/DAF ou de directeur controle de gestion -> nouvelle feuille de route probable -> ELEVE -> approche rapide du nouveau decideur
- Projet ERP/EPM finance annonce (S/4HANA Finance, Anaplan, Tagetik, OneStream...) -> chantier finance -> TRES ELEVE -> accompagnement programme
- Levee de fonds / acquisition / carve-out -> integration financiere + reporting a construire -> TRES ELEVE -> timing ideal
- Echeance reglementaire (CSRD, IFRS, facturation electronique, Pilier 2) -> obligation datee -> ELEVE -> offre conformite
- Retard de publication / reserves d'audit / cloture longue -> douleur process -> ELEVE -> diagnostic cloture
- Croissance internationale / nouvelles filiales -> consolidation et intercos plus lourdes -> MOYEN -> renfort consolidation
- Avis de marche / AO sur des prestations finance -> achat en cours -> ELEVE -> se positionner"""


class FinancePack(OfferDomainPack):
    """Finance office (DAF) — curated non-IT witness domain."""

    code = "finance"
    label_fr = "Finance"
    label_en = "Finance"
    status = "live"

    def perimeters(self) -> tuple[str, ...]:
        return (
            "Direction financiere (CFO/DAF)",
            "Controle de gestion & FP&A",
            "Consolidation & comptabilite groupe",
            "Tresorerie & financement",
            "Audit interne & controle interne",
            "Fiscalite",
            "Conformite & reporting reglementaire (CSRD, IFRS)",
            "Centre de services partages (CSP) finance",
        )

    def signal_families(self) -> tuple[str, ...]:
        return (
            "Recrutements finance 5+ (controle de gestion, consolidation, tresorerie) -> structuration / croissance",
            "Changement de CFO/DAF -> nouvelle feuille de route probable",
            "Projet ERP/EPM finance annonce -> chantier finance majeur",
            "Levee de fonds / acquisition / carve-out -> integration financiere a construire",
            "Echeance reglementaire (CSRD, IFRS, facturation electronique) -> obligation datee",
            "Retard de publication / reserves d'audit / cloture longue -> douleur process",
            "Croissance internationale / nouvelles filiales -> consolidation plus lourde",
            "Avis de marche / AO sur des prestations finance -> achat en cours",
        )

    def play_examples(self) -> tuple[str, ...]:
        return (
            "Diagnostic flash cloture (reduire J+15 -> J+7)",
            "Cadrage projet EPM (consolidation/budget) avant choix d'outil",
            "Renfort controle de gestion pendant une integration post-acquisition",
            "Mise en conformite CSRD : gap analysis + feuille de route",
            "Structuration tresorerie groupe (cash pooling, previsions)",
            "Audit interne externalise sur un perimetre a risque",
        )

    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        offers = clean_offers(profile_data)
        sell_examples = (
            ", ".join(offers[:4])
            if offers
            else ("consolidation, controle de gestion/FP&A, tresorerie, conformite CSRD")
        )
        return {
            "label": "Finance",
            "label_long": "Finance / DAF",
            "system_label": "fonction finance",
            "budget_signal": (
                "Budget finance visible (recrutements finance, projet ERP/EPM finance, "
                "echeance reglementaire, transfo finance annoncee)"
            ),
            "tech_entity_directive": (
                "IMPERATIF: identifie l'entite du groupe qui porte la fonction FINANCE "
                "(direction financiere groupe, CSP finance, holding qui centralise consolidation/tresorerie) "
                "et inclus-la TOUJOURS — c'est la cible n1 d'un vendeur du domaine Finance. Pour un groupe "
                "federe / confederation (plusieurs groupes autonomes), liste les branches majeures ET la "
                "direction financiere de chacune, pas seulement la branche du SIREN resolu."
            ),
            "sell_examples": sell_examples,
            "signal_grid": _FINANCE_SIGNAL_GRID,
            "challenge_label": "Finance",
            "play_examples_inline": (
                "transformation de la fonction finance, consolidation/EPM, tresorerie & cash, "
                "conformite CSRD/IFRS, audit interne, controle de gestion"
            ),
            "domain_brief": build_domain_brief(
                label=self.label_fr,
                perimeters=self.perimeters(),
                signal_families=self.signal_families(),
                play_examples=self.play_examples(),
            ),
        }
