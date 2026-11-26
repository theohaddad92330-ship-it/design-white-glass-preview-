"""Portefeuille de domaines de conseil — miroir Python de la taxonomie V10.

Source de vérité : ``packages/contracts/src/schemas/consulting-domains.ts``
(les 66 domaines du pack DATAFORGE, chacun rattaché à l'un des 7 packs
d'offre). Le service IA lit ``esn_profiles`` en direct et n'a pas accès au
paquet contracts à l'exécution (Railway root = ``apps/ia``), donc la table
voyage ici — et ``tests/test_consulting_domains_parity.py`` lit le fichier TS
pour empêcher les deux copies de diverger (même discipline que les schémas
embarqués de ``app/contracts/schemas/``). Ne JAMAIS éditer une seule des deux.

Deux fonctions, toutes deux des miroirs exacts de leurs homologues TS :

* :func:`dominant_pack` — le pack le plus représenté du portefeuille ; à
  égalité, le premier dans l'ordre ``OFFER_DOMAINS``. Code inconnu = ignoré,
  jamais deviné. Rien de connu → ``None`` (comportement historique).
* :func:`portfolio_names_fr` — les libellés FRANÇAIS, ce que le prisme de
  prompts énumère.
"""

from __future__ import annotations

#: Ordre de départage — copie de ``OFFER_DOMAINS`` (contracts onboarding.ts),
#: verrouillée par le test de parité.
PACK_PRIORITY: tuple[str, ...] = (
    "esn_it",
    "finance",
    "supply_chain",
    "product_design",
    "pmo",
    "rh",
    "generic",
    "industrial_engineering",
    "ia",
    # #3186.3 / #3186.5 — ajoutés EN FIN, même raison que `ia` (#2633.1).
    "cyber",
    "hse",
)

#: code → (pack, libellé français). Miroir VERBATIM de ``CONSULTING_DOMAINS``.
CONSULTING_DOMAIN_TABLE: dict[str, tuple[str, str]] = {
    # #2633.1 — pointait sur "esn_it" (générique) : un vendeur qui choisit CE
    # domaine ne voyait jamais Data Science/ML/GenAI cités spécifiquement.
    "AI_ML_GENAI": ("ia", "IA, machine learning, GenAI & agents"),
    "ARCH_INTEGRATION": ("esn_it", "Architecture SI, intégration, API & middleware"),
    "BI_MDM_GOV": ("esn_it", "BI, analytics, MDM & gouvernance des données"),
    "CLOUD_DEVOPS_SRE": ("esn_it", "Cloud, DevOps, SRE, plateformes & FinOps"),
    # #3186.3 — pointait sur "esn_it" (générique) : un vendeur cyber pur ne
    # voyait jamais CISO/IAM/GRC/SOC cités spécifiquement.
    "CYBER_IAM_GRC": ("cyber", "Cybersécurité, IAM, GRC, SOC & résilience numérique"),
    "DATA_ENGINEERING": ("esn_it", "Data engineering, plateformes & pipelines"),
    "ERP_SAP_EPM": ("esn_it", "ERP, SAP, Oracle, EPM & applications d'entreprise"),
    "INFRA_NETWORK_WORKPLACE": ("esn_it", "Infrastructure, réseau, workplace & télécom d'entreprise"),
    "ITSM_SERVICE_OPS": ("esn_it", "ITSM, service management, support & opérations"),
    "OT_IOT_EDGE": ("esn_it", "OT, IoT, edge, systèmes industriels & digitalisation terrain"),
    "QA_TESTING": ("esn_it", "QA logiciel, tests, recette & IVVQ"),
    "RPA_LOWCODE": ("esn_it", "RPA, low-code, BPM & automatisation des processus"),
    "SW_ENGINEERING": ("esn_it", "Développement logiciel & applications"),
    "TELECOM_5G": ("esn_it", "Télécoms, réseaux opérateurs, fibre, radio & 5G"),
    "CRM_MARTECH": ("product_design", "CRM, MarTech, customer platforms & marketing automation"),
    "CREATIVE_CONTENT_DESIGN": ("product_design", "Création, direction artistique, contenu & design graphique"),
    "CUSTOMER_SERVICE_CX": ("product_design", "Service client, contact center, CX & opérations clients"),
    "MARKETING_BRAND_MEDIA": ("product_design", "Marketing, marque, média, contenu & communication commerciale"),
    "MEDIA_ENTERTAINMENT_PROD": ("product_design", "Audiovisuel, média, production, broadcast & entertainment"),
    "PRODUCT_UX_ECOM": ("product_design", "Produit digital, UX/UI, e-commerce & expérience digitale"),
    "SALES_REVOPS_PRICING": ("generic", "Sales, RevOps, pricing & business development"),
    "ACTUARIAL": ("generic", "Actuariat, pricing, reserving & underwriting"),
    "BANKING_CREDIT_PAYMENTS": ("finance", "Banque, crédit, paiements & opérations bancaires"),
    "FINANCE_FPNA": ("finance", "Finance, comptabilité, FP&A, contrôle de gestion & consolidation"),
    "INSURANCE_CLAIMS": ("finance", "Assurance métier, sinistres, distribution & opérations"),
    "INTERNAL_AUDIT_CONTROL": ("finance", "Audit interne, contrôle interne, SOX & assurance"),
    "MARKET_FINANCE": ("finance", "Finance de marché, quant, FO/MO/BO, ALM & trésorerie bancaire"),
    "RISK_COMPLIANCE_AML": ("finance", "Risques, conformité, AML/KYC, réglementaire & modèles"),
    "TREASURY_WC": ("finance", "Trésorerie, cash, financement & working capital"),
    "LOGISTICS_TRANSPORT_OPS": ("supply_chain", "Logistique, transport, entrepôts & opérations de flux"),
    "MANUFACTURING_OPS": ("industrial_engineering", "Opérations industrielles, performance usine & production"),
    "PROCESS_EXCELLENCE": ("supply_chain", "Excellence opérationnelle, processus & Lean"),
    "PROCUREMENT_SRM": ("supply_chain", "Achats, sourcing, category management & SRM"),
    "SUPPLY_CHAIN_SOP": ("supply_chain", "Supply chain, planning, S&OP & logistique stratégique"),
    "AUTOMATION_ROBOTICS": ("industrial_engineering", "Automatisme, contrôle-commande, robotique & instrumentation"),
    "CAPEX_EPCM": ("pmo", "CAPEX, EPCM, project controls & grands projets"),
    "CIVIL_CONSTRUCTION_BIM": ("generic", "Construction, génie civil, MOE/AMO, BIM & infrastructures"),
    "ELECTRICAL_ELECTRONICS": ("industrial_engineering", "Ingénierie électrique, électronique, hardware & FPGA"),
    "ENERGY_UTILITIES_NUCLEAR": ("generic", "Énergie, utilities, nucléaire & transition énergétique"),
    "INDUSTRIALIZATION_METHODS": ("industrial_engineering", "Industrialisation, méthodes, process & NPI"),
    "MAINTENANCE_MRO": ("industrial_engineering", "Maintenance, MRO, fiabilité & asset management"),
    "MECHANICAL_ENGINEERING": ("industrial_engineering", "Ingénierie mécanique, calcul, CAO & essais"),
    "PROCESS_CHEM_OILGAS": ("generic", "Procédés, chimie, oil & gas & ingénierie de process"),
    # #3186.5 — pointait sur "industrial_engineering" (bureau d'études) : un
    # cabinet QHSE/environnement pur ne voyait jamais ICPE/CSRD/HSE cités.
    "QUALITY_VALIDATION_HSE": ("hse", "Qualité, validation, HSE, sûreté & conformité technique"),
    "SYSTEMS_MBSE": ("industrial_engineering", "Ingénierie systèmes, MBSE, sûreté & embarqué"),
    "CHANGE_ORG_AGILE": ("pmo", "Change, organisation, agilité & coaching"),
    "INNOVATION_RD": ("pmo", "Innovation, R&D management & open innovation"),
    "INTERIM_MANAGEMENT": ("pmo", "Management de transition & direction opérationnelle temporaire"),
    "MNA_PMI": ("pmo", "M&A, due diligence, carve-out & post-merger integration"),
    "PMO_PORTFOLIO": ("pmo", "PMO, portefeuille, programme & gestion de projet"),
    "PUBLIC_POLICY_GOV": ("pmo", "Politiques publiques, économie, réglementation & transformation publique"),
    "STRATEGY": ("pmo", "Stratégie, operating model & transformation"),
    "HRIS_PAYROLL": ("rh", "SIRH, paie, workforce tech & HR operations"),
    "HR_TALENT_LEARNING": ("rh", "RH, talent, recrutement, learning & organisation"),
    "LEARNING_EDTECH": ("rh", "Formation, ingénierie pédagogique, academy & EdTech"),
    "AGRI_FOOD_RND": ("generic", "Agroalimentaire, agronomie, formulation & qualité produit"),
    "HEALTHCARE_OPS": ("generic", "Santé, hôpitaux, medtech & opérations de soins"),
    "LIFE_SCIENCES_CLINICAL": ("generic", "Clinique, médical, réglementaire, CMC & pharmacovigilance"),
    "PHARMA_GMP": ("generic", "Pharma manufacturing, GMP, CSV, validation & qualité industrielle"),
    "COMMUNICATIONS_PA": ("generic", "Communication corporate, affaires publiques & relations institutionnelles"),
    "ESG_CLIMATE": ("generic", "ESG, RSE, climat, CSRD & décarbonation"),
    "LEGAL_TAX_GOV": ("generic", "Juridique, fiscalité, contrats & gouvernance"),
    "REAL_ESTATE_FM": ("generic", "Immobilier, facilities, workplace & asset services"),
    "SECURITY_SAFETY_BCM": ("generic", "Sûreté, sécurité physique, BCM & gestion de crise"),
    "HOSPITALITY_TRAVEL_OPS": ("generic", "Hospitality, tourisme, travel, revenue management & opérations"),
    "LUXURY_RETAIL_MERCH": ("generic", "Luxe, retail, merchandising, store planning & omnicanal"),
}


def dominant_pack(codes: list[str] | tuple[str, ...] | None) -> str | None:
    """Le pack d'offre dominant d'un portefeuille — miroir de ``dominantOfferDomain``."""
    counts: dict[str, int] = {}
    for code in codes or []:
        entry = CONSULTING_DOMAIN_TABLE.get(str(code))
        if entry is None:
            continue
        counts[entry[0]] = counts.get(entry[0], 0) + 1
    best: str | None = None
    best_count = 0
    for pack in PACK_PRIORITY:
        count = counts.get(pack, 0)
        if count > best_count:
            best = pack
            best_count = count
    return best


def portfolio_names_fr(codes: list[str] | tuple[str, ...] | None) -> list[str]:
    """Les libellés français du portefeuille — miroir de ``consultingDomainNamesFr``."""
    names: list[str] = []
    for code in codes or []:
        entry = CONSULTING_DOMAIN_TABLE.get(str(code))
        if entry is not None:
            names.append(entry[1])
    return names
