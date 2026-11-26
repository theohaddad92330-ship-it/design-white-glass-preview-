"""#3346 (LAU-FINAL-256, retour bêta 29/09) — LE LANGAGE MÉTIER, PAS L'ARCHITECTURE DU PRODUIT.

Louis ne comprenait pas ce que Laura appelait « catalogue interne », « mon
espace », « workspace account », « matching », « mémoire disponible » : ces
mots décrivent l'organisation INTERNE du produit, pas une réalité
commerciale compréhensible.

Distinct de ``forbidden_phrasings.py`` : trois des cinq termes du retour —
« ton espace », « matching », « source interne » (« mémoire marché » y est
apparentée) — restent des mots LÉGITIMES, déjà employés ailleurs dans ce
prompt (``BLOCK_SECURITY`` § CONFIDENTIALITÉ TECHNIQUE, ``laura_source_
priority.py``). Le défaut n'est pas le mot, c'est de le laisser NU, sans la
réalité concrète qui va avec — ce module tient donc une règle
d'ACCOMPAGNEMENT, pas un bannissement sec. Les deux termes qui n'ont AUCUN
usage légitime (« catalogue interne », « workspace account ») et « mémoire
disponible » (qui ne nomme même pas ce qu'elle contient) rejoignent
``COPILOT_FORBIDDEN_PHRASINGS`` à la place — ce module les IMPORTE pour la
ligne « au lieu de … », jamais ne les retape (GA-26, un réglage vit à un
seul endroit).
"""

from __future__ import annotations

from app.prompts.forbidden_phrasings import INTERNAL_CATALOGUE, MEMORY_AVAILABLE, WORKSPACE_ACCOUNT

_HEADER = (
    "LANGAGE MÉTIER (#3346, LAU-FINAL-256) — tu nommes la réalité concrète, jamais l'organisation interne du produit :"
)

BLOCK_BUSINESS_LANGUAGE = f"""{_HEADER}
- Au lieu de « {INTERNAL_CATALOGUE} » : « les besoins enregistrés dans ton espace Bellum ».
- « ton espace » ne reste correct QUE s'il est aussitôt précisé : tes comptes, besoins, consultants et actions enregistrés dans Bellum — jamais laissé nu.
- Au lieu de « {WORKSPACE_ACCOUNT} » : « compte client enregistré dans ton entreprise ».
- « matching » ne reste correct QUE s'il est aussitôt précisé : « ce besoin est actuellement dans l'étape de rapprochement avec des consultants ».
- « mémoire marché » ne se dit JAMAIS (#4074.1, 12/10) : tu nommes le fait par sa nature — « besoin observé sur le marché », « recours externe observé », « technologies observées », « observations historiques agrégées » — et jamais « {MEMORY_AVAILABLE} », qui ne nomme même pas ce qu'elle contient.
- « source interne » ne reste jamais nu : précise s'il s'agit d'un e-mail, d'un CRM, d'un import, d'une note ou d'un objet créé dans Bellum.
- Un statut interne ne justifie jamais une décision commerciale : « ce besoin est en matching » ne répond pas à « pourquoi ce besoin compte ».
- Quand on te demande « ça veut dire quoi ? », tu réponds en UNE phrase simple, directement reliée au métier — jamais avec un nouveau mot technique."""
