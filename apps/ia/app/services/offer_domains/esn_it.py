"""``esn_it`` — the DEFAULT domain: IT/digital services (the live product).

This module is the single home of the EXACT historical IT prompt strings. The
constants below ARE the current prompt wording — ``domain_focus.py`` imports
them for its default resolution, and the golden tests render the default path
against committed baselines, so any drift here (a stray space, a reworded
parenthetical) surfaces as a failing golden diff.

Resolution note: the registry deliberately returns ``None`` for ``esn_it``
(see ``get_offer_domain_pack``), so the default path never goes through the
pack — it keeps the historical ``resolve_domain_focus`` logic byte-identical,
INCLUDING the Drive #9 offers-derived generalisation for a non-IT ESN that
never picked a domain. The pack still exists so the domain is enumerable
(UI/meta) and its curated content lives with its siblings.
"""

from __future__ import annotations

from typing import Any

from app.services.offer_domains.base import OfferDomainPack

# ── Exact historical IT strings (the current prompt wording) ─────────────────

#: The historical IT lens — moved verbatim from ``domain_focus._IT_FOCUS``.
IT_FOCUS: dict[str, str] = {
    "label": "IT",  # short domain noun — "programmes {label}", "défis {label}", "décideur {label}"
    "label_long": "IT/digital",  # "organigramme {label_long}"
    "system_label": "SI",  # the analysed asset — "son {system_label}"
    "budget_signal": "Budget IT visible (offres CDI tech, AO recents, transfo majeure)",
    # ── User-prompt lens (Phase 2) — same byte-identity contract as above. ──
    # Facts: the "identify the group's IT entity = ESN target n°1" directive
    # (bellum_facts.build_user_prompt, entitiesExhaustive schema).
    "tech_entity_directive": (
        "IMPERATIF: identifie l'entite IT/digitale du groupe (GIE informatique, DSI mutualisee, "
        "filiale 'Technologies/Services' ; ex: Credit Mutuel -> Euro-Information, GICM) et inclus-la "
        "TOUJOURS — c'est la cible n1 d'un ESN. Pour un groupe federe / confederation (mutualiste "
        "bancaire = plusieurs groupes autonomes), liste les branches majeures ET l'entite IT de "
        "chacune, pas seulement la branche du SIREN resolu."
    ),
    # Facts: whatToSell concrete-angle examples (a "..." is appended by the caller).
    "sell_examples": "data, cloud, cyber, run/TMA, paiements, mobile, MLOps",
}

#: The historical body of the « GRILLE DES SIGNAUX DYNAMIQUES » section of the
#: ``bellum_signals`` system prompt — moved verbatim from the prompt f-string.
IT_SIGNAL_GRID = """Estime le niveau d'investissement IT sans budget officiel, via signaux publics :
- Offres CDI tech 10+ -> besoin structurel / projet massif -> niveau ELEVE -> "renfort immediat sur la stack"
- Technos dominantes (offres d'emploi) -> stack a pousser -> MOYEN -> aligner les profils
- Annonces de transformation (presse / rapport annuel) -> chantiers finances -> ELEVE -> accompagnement programme
- Incidents publics -> urgence operationnelle -> ELEVE -> renfort immediat
- Levee de fonds / acquisition -> budget disponible -> TRES ELEVE -> timing ideal
- Changement de C-level IT (DSI/CTO/CDO) -> nouvelle strategie probable -> ELEVE -> approche rapide du nouveau decideur
- Partenariats cloud / editeurs -> nouveaux chantiers + vendors en place -> MOYEN"""

#: The historical "defi IT" noun of the ``bellum_strategy`` USER prompt
#: (`"(MIN 4, viser 5) Pour chaque defi IT :"`).
IT_CHALLENGE_LABEL = "IT"

#: The historical axesEcartes examples of the ``bellum_strategy`` USER prompt —
#: verbatim from « (ex: SAP, cyber/SOC, data, workplace/M365, achats,
#: prospection inversee) ».
IT_PLAY_EXAMPLES_INLINE = "SAP, cyber/SOC, data, workplace/M365, achats, prospection inversee"

#: Block keys shared by BOTH historical resolution paths (IT lens AND the
#: offers-derived generalisation) — today these blocks are the same for every
#: profile; only an explicit non-default domain pack overrides them.
DEFAULT_BLOCKS: dict[str, str] = {
    "signal_grid": IT_SIGNAL_GRID,
    "challenge_label": IT_CHALLENGE_LABEL,
    "play_examples_inline": IT_PLAY_EXAMPLES_INLINE,
    "domain_brief": "",  # appended verbatim → "" keeps the default prompts byte-identical
}


class EsnItPack(OfferDomainPack):
    """IT/digital services — the default, fully-curated domain (live product)."""

    code = "esn_it"
    label_fr = "ESN / Services IT"
    label_en = "IT services (ESN)"
    status = "live"

    def perimeters(self) -> tuple[str, ...]:
        return (
            "DSI / direction des systemes d'information",
            "Cybersecurite (RSSI/CISO)",
            "Data / BI / IA (CDO, head of data)",
            "Infrastructure & cloud (CTO infra, ops)",
            "Etudes & developpement (directeur etudes, engineering)",
            "Architecture SI & urbanisation",
            "Digital / e-commerce (CDO digital)",
            "Support & ITSM (run, service desk)",
        )

    def signal_families(self) -> tuple[str, ...]:
        return (
            "Offres CDI tech 10+ -> besoin structurel / projet massif",
            "Technos dominantes dans les offres d'emploi -> stack a pousser",
            "Annonces de transformation (presse / rapport annuel) -> chantiers finances",
            "Incidents publics (panne, breche) -> urgence operationnelle",
            "Levee de fonds / acquisition -> budget disponible",
            "Changement de C-level IT (DSI/CTO/CDO) -> nouvelle strategie probable",
            "Partenariats cloud / editeurs -> nouveaux chantiers + vendors en place",
            "Appels d'offres publics IT (CPV 48xx/72xx) -> achat en cours",
        )

    def play_examples(self) -> tuple[str, ...]:
        return (
            "Audit flash cybersecurite avant echeance reglementaire (DORA/NIS2)",
            "Squad data/MLOps pour industrialiser les modeles",
            "Migration cloud avec engagement de reversibilite",
            "Reprise de TMA / run applicatif en centre de services",
            "Renfort projet ERP S/4HANA (montee de version)",
            "Atelier 45 min architecture SI post-acquisition",
        )

    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        """The exact historical IT lens + default blocks.

        Never consulted by ``resolve_domain_focus`` (the registry gates
        ``esn_it`` to the historical path), but kept correct so the pack is
        self-describing and testable like its siblings.
        """
        return {**IT_FOCUS, **DEFAULT_BLOCKS}
