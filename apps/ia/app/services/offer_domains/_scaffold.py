"""Shared base for SCAFFOLD domain packs (structure now, curated content later).

A scaffold pack is registered and selectable, but its lens is honestly DERIVED:
the domain label replaces the assumed-IT wording and the generic signal shapes
apply — no half-curated "expert" vocabulary is shipped. Each concrete module
documents its curation TODO; promoting a pack to ``live`` means filling the
three content methods with domain-curated data and flipping ``status``
(checklist in ``agent_docs/offer-domains.md``).
"""

from __future__ import annotations

from typing import Any

from app.services.offer_domains.base import OfferDomainPack, build_domain_brief, clean_offers
from app.services.offer_domains.generic import _GENERIC_SIGNAL_GRID, GenericPack


class ScaffoldDomainPack(OfferDomainPack):
    """Generic-derived lens under the domain's own label. Subclasses only set
    ``code`` / ``label_fr`` / ``label_en`` (+ their curation TODO docstring)."""

    status = "scaffold"

    # Until curated, scaffolds reuse the generic domain-neutral vocabulary.
    _generic = GenericPack()

    def perimeters(self) -> tuple[str, ...]:
        return self._generic.perimeters()

    def signal_families(self) -> tuple[str, ...]:
        return self._generic.signal_families()

    def play_examples(self) -> tuple[str, ...]:
        return self._generic.play_examples()

    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        offers = clean_offers(profile_data)
        label = self.label_fr
        label_long = " / ".join(offers[:3]) if offers else label
        sell_examples = ", ".join(offers[:4]) if offers else "offres declarees du vendeur"
        return {
            "label": label,
            "label_long": label_long,
            "system_label": "périmètre métier",
            "budget_signal": (f"Budget {label} visible (recrutements/CDI sur le domaine, AO recents, transfo majeure)"),
            "tech_entity_directive": (
                f"IMPERATIF: identifie l'entite du groupe la plus pertinente pour le domaine « {label} » "
                "(filiale, direction ou BU qui porte ce metier) et inclus-la TOUJOURS — c'est la cible n1 d'un "
                "vendeur de ce domaine. Pour un groupe federe / confederation (plusieurs groupes autonomes), "
                "liste les branches majeures ET l'entite metier de chacune, pas seulement la branche du SIREN resolu."
            ),
            "sell_examples": sell_examples,
            "signal_grid": _GENERIC_SIGNAL_GRID,
            "challenge_label": label,
            "play_examples_inline": (
                "audit flash du perimetre, atelier de cadrage, renfort d'equipe, mission pilote bornee"
            ),
            "domain_brief": build_domain_brief(
                label=label,
                perimeters=self.perimeters(),
                signal_families=self.signal_families(),
                play_examples=self.play_examples(),
            ),
        }
