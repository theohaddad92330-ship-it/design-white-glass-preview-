"""``ia`` — curated domain: selling Data Science / Machine Learning / GenAI.

#2633.1 : un vendeur dont le profil citait déjà « Data Science », « ML »,
« GenAI » recevait pourtant le même prompt générique IT que n'importe quel ESN
généraliste — ``esn_it`` matche large sur des mots-clés (data, ia, ml…) et ne
distingue jamais un ESN narrowly spécialisé IA d'un ESN IT tous domaines.
Pire : le portefeuille de conseil (``portfolio.py``) routait même le code
``AI_ML_GENAI`` (« IA, machine learning, GenAI & agents ») vers ``esn_it`` — un
vendeur qui choisissait EXPLICITEMENT ce domaine ne voyait jamais Data
Science/ML/GenAI cités spécifiquement dans ses recommandations. C'était LA
cause, jamais diagnostiquée jusqu'ici.

Status ``live`` : perimeters / signal families / plays sont curated (signaux
publics vérifiables uniquement — aucune méthodologie commerciale inventée).
"""

from __future__ import annotations

from typing import Any

from app.services.offer_domains.base import OfferDomainPack, build_domain_brief, clean_offers

_IA_SIGNAL_GRID = """Estime le niveau d'investissement Data Science/ML/GenAI sans budget officiel, via signaux publics :
- Recrutements Data Science/ML/GenAI 5+ -> structuration / montee en puissance IA -> niveau ELEVE -> "renfort immediat sur la squad IA"
- Nomination d'un Chief AI Officer / Head of AI/Data -> nouvelle feuille de route IA probable -> ELEVE -> approche rapide du nouveau decideur
- Pilote ou deploiement GenAI annonce (POC LLM, assistant interne, copilote) -> budget IA engage -> TRES ELEVE -> industrialiser le pilote
- Offres d'emploi MLOps / Data Platform -> industrialisation en cours -> ELEVE -> renfort MLOps
- Levee de fonds / financement dedie IA -> budget disponible -> TRES ELEVE -> timing ideal
- Partenariat avec un fournisseur de modeles ou de plateforme IA -> chantier en cours -> MOYEN -> se positionner
- Echeance reglementaire (AI Act) -> obligation datee -> ELEVE -> offre gouvernance/conformite IA
- Publication scientifique / papier IA -> expertise interne a valoriser ou renforcer -> MOYEN"""


class IaPack(OfferDomainPack):
    """Data Science / Machine Learning / GenAI — domaine curated live."""

    code = "ia"
    label_fr = "IA"
    label_en = "AI"
    status = "live"

    def perimeters(self) -> tuple[str, ...]:
        return (
            "Data Science & Machine Learning (Head of Data Science, ML Engineers)",
            "GenAI / LLM (equipe GenAI, prompt engineering, RAG)",
            "MLOps & plateforme IA (industrialisation, mise en production des modeles)",
            "Data Engineering & plateforme data (pipelines, data platform)",
            "Computer Vision / IA specialisee",
            "Gouvernance & IA responsable (ethique, conformite AI Act)",
            "R&D IA / Innovation Lab",
            "Direction Data & IA (CDO, Chief AI Officer)",
        )

    def signal_families(self) -> tuple[str, ...]:
        return (
            "Recrutements Data Science/ML/GenAI 5+ -> structuration / montee en puissance IA",
            "Nomination d'un Chief AI Officer / Head of AI -> nouvelle feuille de route IA probable",
            "Pilote ou deploiement GenAI annonce (POC LLM, assistant interne, copilote) -> budget IA engage",
            "Offres d'emploi MLOps / Data Platform -> industrialisation en cours",
            "Levee de fonds / financement dedie IA -> budget disponible",
            "Partenariat avec un fournisseur de modeles ou de plateforme IA -> chantier en cours",
            "Echeance reglementaire (AI Act) -> obligation datee",
            "Publication scientifique / papier IA -> expertise interne a valoriser ou renforcer",
        )

    def play_examples(self) -> tuple[str, ...]:
        return (
            "Audit flash de maturite IA (cas d'usage, gouvernance, industrialisation)",
            "Squad GenAI pour industrialiser un POC LLM en production",
            "Renfort MLOps pour industrialiser des modeles deja developpes",
            "Cadrage gouvernance IA / conformite AI Act avant deploiement",
            "Atelier 45 min cas d'usage GenAI prioritaires",
            "Renfort Data Science pour un programme en cours",
        )

    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        offers = clean_offers(profile_data)
        sell_examples = (
            ", ".join(offers[:4]) if offers else ("data science, machine learning, GenAI/LLM, MLOps")
        )
        return {
            "label": "IA",
            "label_long": "IA / Data Science",
            "system_label": "plateforme IA/ML",
            "budget_signal": (
                "Budget IA visible (recrutements Data Science/ML/GenAI, POC LLM annonce, "
                "Chief AI Officer nomme, partenariat plateforme IA)"
            ),
            "tech_entity_directive": (
                "IMPERATIF: identifie l'entite du groupe qui porte la Data Science/le Machine "
                "Learning/le GenAI (Data Office, AI Factory, Lab IA, direction Data & IA) et inclus-la "
                "TOUJOURS — c'est la cible n1 d'un vendeur du domaine IA. Pour un groupe federe / "
                "confederation, liste les branches majeures ET l'entite IA de chacune, pas seulement la "
                "branche du SIREN resolu."
            ),
            "sell_examples": sell_examples,
            "signal_grid": _IA_SIGNAL_GRID,
            "challenge_label": "IA",
            "play_examples_inline": (
                "GenAI/LLM, MLOps, Data Science, gouvernance IA, computer vision, plateforme data"
            ),
            "domain_brief": build_domain_brief(
                label=self.label_fr,
                perimeters=self.perimeters(),
                signal_families=self.signal_families(),
                play_examples=self.play_examples(),
            ),
        }
