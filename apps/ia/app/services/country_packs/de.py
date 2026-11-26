"""Country pack **Allemagne (DE)** — mode **degraded (beta)** : vocabulaire + ontologie.

Registre : **Handelsregister** (portail des Länder, ``handelsregister.de``), tenu par
les Amtsgerichte ; identifiant pivot = **HRB/HRA + numéro + tribunal** (ex. ``HRB 12345,
Amtsgericht München``) + n° TVA ``DE#########``. L'identifiant n'est unique que PAR
tribunal — il n'a pas d'équivalent au SIREN.

Pourquoi ``beta`` : la recherche gratuite du portail est une application à état
(session, jeton, CAPTCHA) non scrutable de façon déterministe, et l'accès structuré
passe par des abonnements payants (Unternehmensregister / fournisseurs agréés). Aucun
endpoint libre « nom → HRB » n'est VÉRIFIÉ : ``registry_lookup`` ne fait **aucun appel
réseau** et ne rend rien — jamais un numéro HRB deviné. La valeur du pack est son
vocabulaire (formes juridiques, ``Konzern``/``Mittelstand``, offres « remote »).

RGPD : membre de l'UE, RGPD plein, aucune barrière de transfert. Aucune donnée
personnelle collectée (pas d'appel). Voir ``COMPLIANCE.md``.
"""

from __future__ import annotations

from app.services.country_packs.base import DegradedCountryPack


class GermanPack(DegradedCountryPack):
    """Allemagne — ontologie + vocabulaire ; registre dégradé (zéro réseau)."""

    code = "DE"
    identifier_label = "Handelsregisternummer (HRB/HRA)"
    country_name = "Allemagne"
    languages = ("de", "en")
    registry_name = "Handelsregister"

    def entity_ontology(self) -> dict:
        return {
            "identifier": "Handelsregisternummer (HRB/HRA + n°) + Amtsgericht ; n° TVA DE#########",
            "legalForms": {
                "GmbH": "société à responsabilité limitée (forme dominante des ESN/Mittelstand)",
                "AG": "société anonyme (grands groupes cotés ou non)",
                "SE": "société européenne (ex. SAP SE)",
                "KG / GmbH & Co. KG": "commandite, très fréquente dans le Mittelstand familial",
                "UG (haftungsbeschränkt)": "mini-GmbH, souvent une jeune structure",
                "eG / e.V.": "coopérative / association (hors cible ESN)",
            },
            "regionalAxis": "Land (Bayern, NRW, Baden-Württemberg, Berlin, Hessen…) — l'axe géographique est le Bundesland",
            "note": (
                "Le Mittelstand (PME familiales industrielles) est le cœur du marché : "
                "décision souvent au niveau Geschäftsführung / IT-Leitung. Distinguer la "
                "maison-mère (Konzern) de ses filiales (Tochtergesellschaft). Les "
                "Betriebsräte (comités d'entreprise) pèsent sur les projets touchant les "
                "salariés. Le télétravail s'écrit « Homeoffice » / « Remote » / « mobiles "
                "Arbeiten » : Homeoffice seul n'est PAS full remote."
            ),
        }

    def local_vocabulary(self) -> dict:
        return {
            "country": "Allemagne",
            "registry": "Handelsregister (Amtsgerichte)",
            "identifier": "Handelsregisternummer (HRB/HRA + Amtsgericht)",
            "languages": ["de", "en"],
            "prompt_fragment": (
                "PAYS CIBLE : Allemagne.\n"
                "- Registre officiel : Handelsregister (tenu par les Amtsgerichte). "
                "Identifiant : HRB (capitaux) ou HRA (personnes) + numéro + tribunal "
                "(unique seulement par tribunal) ; n° TVA DE#########. ⚠️ Pas d'accès "
                "structuré libre : ne PAS inventer de numéro HRB ni de donnée registre.\n"
                "- Formes juridiques : GmbH, AG, SE, KG / GmbH & Co. KG, UG. Le Mittelstand "
                "(PME familiales) est la cible naturelle ; distinguer Konzern et filiales.\n"
                "- Décideurs : Geschäftsführer, CIO / IT-Leiter, CTO ; le Betriebsrat "
                "intervient sur les sujets touchant les salariés.\n"
                "- Télétravail : « full remote » = « vollständig / komplett remote », "
                "« 100 % remote ». « Homeoffice möglich » ou « hybrides Arbeiten » "
                "n'est PAS full remote. Sans mention explicite, la politique reste "
                "NON ÉTABLIE — ne jamais la déduire.\n"
                "- Marché en allemand : rédiger en allemand formel (Sie) pour les "
                "messages, l'anglais convient pour les scale-ups tech de Berlin/Munich."
            ),
        }
