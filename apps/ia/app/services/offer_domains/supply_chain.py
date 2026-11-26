"""``supply_chain`` — scaffold domain: selling into supply chain & operations.

TODO (curation — promote to ``live``): fill ``perimeters()`` (dir. supply
chain, planification S&OP, logistique/entrepôts, transport, achats/appro,
demand planning), ``signal_families()`` (ouverture/fermeture de site
logistique, projet WMS/TMS/APS, tension appro médiatisée, recrutements supply,
nouveau directeur supply chain, engagement décarbonation transport) and
``play_examples()`` (diagnostic flash S&OP, cadrage WMS avant choix d'outil,
renfort planification pendant un pic, tour de contrôle transport). Validation
métier requise (Théo / expert du domaine) avant de passer ``status = "live"``
— voir ``agent_docs/offer-domains.md``.
"""

from __future__ import annotations

from app.services.offer_domains._scaffold import ScaffoldDomainPack


class SupplyChainPack(ScaffoldDomainPack):
    code = "supply_chain"
    label_fr = "Supply chain"
    label_en = "Supply chain"
