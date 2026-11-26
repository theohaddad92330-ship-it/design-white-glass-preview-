"""``product_design`` — scaffold domain: selling into product & design orgs.

TODO (curation — promote to ``live``): fill ``perimeters()`` (CPO/dir.
produit, product management, UX/UI research & design, design system, growth),
``signal_families()`` (recrutements PM/designers, lancement produit annoncé,
refonte d'app/site, NPS/avis publics en chute, nouveau CPO, levée orientée
produit) and ``play_examples()`` (discovery sprint, audit UX flash, design
system starter, renfort squad produit). Validation métier requise avant de
passer ``status = "live"`` — voir ``agent_docs/offer-domains.md``.
"""

from __future__ import annotations

from app.services.offer_domains._scaffold import ScaffoldDomainPack


class ProductDesignPack(ScaffoldDomainPack):
    code = "product_design"
    label_fr = "Produit & design"
    label_en = "Product & design"
