"""#3978 — classer un signal / un pain / un enjeu par DOMAINE D'OFFRE, à l'analyse.

Pourquoi ce module existe. Les trois libellés par signal de l'onglet Veille (le
fait, « Ce que ça change », le geste) se lisent sur ``opportunities.primary_domain_code``
— et aucune projection de ``ProjectsService.materialize()`` ne l'écrivait, parce
que les sorties de recherche ne portaient qu'un texte libre (``esn_offer``,
``esn_offer_match``). Rapprocher ce texte d'un code APRÈS coup aurait été deviner
un rapprochement ; la seule source honnête est le modèle, qui lit le signal et
dit de quel domaine d'offre il relève — ou ne dit rien.

Le vocabulaire est celui des PACKS (``OFFER_DOMAINS``), pas des 66 codes fins :
c'est celui que l'écran compare au pack de l'espace (``ownDomainCodes`` dans
``AccountOpportunityScreen``). Il n'est PAS recopié ici : il se dérive de
``PACK_PRIORITY``, dont la parité avec le contrat TS est déjà gardée.

``generic`` est exclu : c'est le fourre-tout. Un signal « autre » classé dedans
ferait « toucher l'expertise » de tout vendeur générique. Ne pas savoir classer
= vide = « non mesuré » à l'écran, jamais un domaine choisi par défaut.
"""

from __future__ import annotations

from app.services.offer_domains.portfolio import PACK_PRIORITY

#: Les codes qu'un signal peut porter. Ordre = celui de ``PACK_PRIORITY``.
SIGNAL_DOMAIN_CODES: tuple[str, ...] = tuple(code for code in PACK_PRIORITY if code != "generic")


def normalize_signal_domain(value: object) -> str:
    """Le code de pack reconnu, en minuscules ; sinon ``""`` — jamais un code deviné."""
    if not isinstance(value, str):
        return ""
    code = value.strip().lower()
    return code if code in SIGNAL_DOMAIN_CODES else ""


def signal_domain_prompt_line() -> str:
    """La consigne du champ ``domainCode``, pour le schéma JSON des prompts."""
    codes = " | ".join(SIGNAL_DOMAIN_CODES)
    return (
        f"domaine d'offre que ce sujet appelle, UN SEUL code parmi : {codes}. "
        "Chaine VIDE si le sujet ne releve clairement d'aucun de ces domaines ou si les sources "
        "ne permettent pas de le dire — jamais un domaine choisi par defaut ou pour faire plaisir."
    )
