"""``rh`` — scaffold domain: selling into HR (people) organisations.

TODO (curation — promote to ``live``): fill ``perimeters()`` (DRH, talent
acquisition, comp & ben, formation/learning, SIRH côté métier, relations
sociales), ``signal_families()`` (plan de recrutement massif annoncé, PSE /
restructuration, projet SIRH, nouveau DRH, accord télétravail/GEPP, marque
employeur en campagne) and ``play_examples()`` (RPO ciblé, diagnostic process
recrutement, cadrage SIRH côté métier, plan GEPP). Validation métier requise
avant de passer ``status = "live"`` — voir ``agent_docs/offer-domains.md``.
"""

from __future__ import annotations

from app.services.offer_domains._scaffold import ScaffoldDomainPack


class RhPack(ScaffoldDomainPack):
    code = "rh"
    label_fr = "Ressources humaines"
    label_en = "Human resources"
