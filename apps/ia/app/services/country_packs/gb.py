"""Country pack **Royaume-Uni / Angleterre (GB)** — mode **degraded (beta)**.

Registre : **Companies House** ; identifiant pivot = **Company number** (8 caractères,
ex. ``00000006`` ou ``SC123456`` en Écosse) + n° TVA ``GB#########``. Le périmètre du
lot est l'Angleterre ; le code pays est ``GB`` (ISO), l'Écosse (``SC``) et l'Irlande du
Nord (``NI``) partagent le même registre et sont nommées dans l'ontologie.

Pourquoi ``beta`` : l'API Companies House existe et est gratuite, mais exige une
CLÉ (HTTP Basic, clé en identifiant) et un contrat de réponse que cette itération n'a
pas vérifié sur une instance réelle. Brancher la résolution demande aussi un seau de
débit dans ``rate_limiter`` et une variable d'environnement neuve : hors du périmètre
de ce lot, noté au rapport. D'ici là ``registry_lookup`` ne fait **aucun appel réseau**
et ne rend rien — jamais un numéro de société deviné. Sans clé = no-op strict.

RGPD : le Royaume-Uni bénéficie d'une décision d'adéquation de l'UE (UK GDPR / DPA
2018). Aucune donnée personnelle collectée (pas d'appel). Voir ``COMPLIANCE.md``.
"""

from __future__ import annotations

from app.services.country_packs.base import DegradedCountryPack


class BritishPack(DegradedCountryPack):
    """Royaume-Uni (Angleterre) — ontologie + vocabulaire ; registre dégradé (zéro réseau)."""

    code = "GB"
    identifier_label = "Company number"
    country_name = "Royaume-Uni"
    languages = ("en",)
    registry_name = "Companies House"

    def entity_ontology(self) -> dict:
        return {
            "identifier": "Company number (8 car. : 00000006, SC123456 Écosse, NI123456 Irlande du Nord) ; n° TVA GB#########",
            "legalForms": {
                "Ltd": "private limited company — forme dominante des PME et ESN",
                "PLC": "public limited company — grands groupes, cotés ou non",
                "LLP": "limited liability partnership — cabinets, conseil",
                "Sole trader": "entrepreneur individuel (hors registre des sociétés)",
            },
            "regionalAxis": "région anglaise (Greater London, South East, North West, West Midlands, Yorkshire…) ; Londres concentre les sièges",
            "note": (
                "Londres concentre sièges, finance et scale-ups tech. Distinguer le "
                "holding (Group) de l'entité opérationnelle (Ltd) ; une entité dormante "
                "(dormant company) n'est pas un prospect. Le télétravail s'écrit « remote » "
                "/ « fully remote » ; « hybrid » ou « flexible working » n'est PAS full remote."
            ),
        }

    def local_vocabulary(self) -> dict:
        return {
            "country": "Royaume-Uni (Angleterre)",
            "registry": "Companies House",
            "identifier": "Company number",
            "languages": ["en"],
            "prompt_fragment": (
                "PAYS CIBLE : Royaume-Uni (Angleterre).\n"
                "- Registre officiel : Companies House. Identifiant : Company number "
                "(8 caractères, ex. 00000006 ; préfixe SC = Écosse, NI = Irlande du Nord) ; "
                "n° TVA GB#########. ⚠️ Pas de résolution automatique ici : ne PAS "
                "inventer de numéro de société ni de donnée registre.\n"
                "- Formes juridiques : Ltd, PLC, LLP. Écarter les sociétés dormantes "
                "(dormant) ; distinguer holding (Group) et entité opérationnelle.\n"
                "- Décideurs : CIO, CTO, Head of Engineering, Procurement.\n"
                "- Télétravail : « full remote » = « fully remote », « remote-first », "
                "« 100% remote ». « Hybrid » ou « flexible working » n'est PAS full remote. "
                "Sans mention explicite, la politique reste NON ÉTABLIE — ne jamais la déduire.\n"
                "- Marché anglophone : rédiger en anglais britannique."
            ),
        }
