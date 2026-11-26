"""Country pack **Espagne (ES)** — mode **degraded (beta)** : vocabulaire + ontologie.

Registre : **Registro Mercantil** (provincial, centralisé par le Registro Mercantil
Central) ; identifiant pivot = **NIF/CIF** (``A12345678`` pour une SA, ``B…`` pour une
SL) — c'est aussi le n° de TVA (``ES`` + NIF).

Pourquoi ``beta`` : la consultation du Registro Mercantil est payante (nota simple,
certificats) et sans API libre de recherche par nom ; l'AEAT ne publie pas de service
public d'identification par nom. Aucun endpoint libre « nom → NIF » n'est VÉRIFIÉ :
``registry_lookup`` ne fait **aucun appel réseau** et ne rend rien — jamais un NIF
deviné. La valeur du pack est son vocabulaire (SL/SA, ``teletrabajo``/``remoto``).

RGPD : membre de l'UE, RGPD plein (LOPDGDD en droit national). Aucune donnée
personnelle collectée (pas d'appel). Voir ``COMPLIANCE.md``.
"""

from __future__ import annotations

from app.services.country_packs.base import DegradedCountryPack


class SpanishPack(DegradedCountryPack):
    """Espagne — ontologie + vocabulaire ; registre dégradé (zéro réseau)."""

    code = "ES"
    identifier_label = "NIF/CIF"
    country_name = "Espagne"
    languages = ("es", "en")
    registry_name = "Registro Mercantil"

    def entity_ontology(self) -> dict:
        return {
            "identifier": "NIF/CIF (lettre + 7 chiffres + contrôle, ex. A12345678) = base du n° de TVA ES",
            "legalForms": {
                "S.L.": "sociedad limitada — forme dominante des PME et ESN",
                "S.A.": "sociedad anónima — grands groupes",
                "S.L.U. / S.A.U.": "société unipersonnelle (filiale d'un groupe, souvent)",
                "S.Coop.": "coopérative (hors cible ESN)",
                "Autónomo": "entrepreneur individuel (pas une personne morale — hors registre)",
            },
            "regionalAxis": "Comunidad autónoma (Madrid, Cataluña, Andalucía, País Vasco, Valencia…)",
            "note": (
                "Madrid et Barcelone concentrent les sièges et les centres IT. Distinguer "
                "la filiale locale (S.L.U.) du groupe international. Le télétravail est "
                "encadré par la Ley 10/2021 de trabajo a distancia : « teletrabajo » ou "
                "« trabajo remoto » ; seul « 100 % remoto » / « totalmente remoto » est du "
                "full remote, « híbrido » ou « teletrabajo parcial » ne l'est pas."
            ),
        }

    def local_vocabulary(self) -> dict:
        return {
            "country": "Espagne",
            "registry": "Registro Mercantil",
            "identifier": "NIF/CIF",
            "languages": ["es", "en"],
            "prompt_fragment": (
                "PAYS CIBLE : Espagne.\n"
                "- Registre officiel : Registro Mercantil. Identifiant : NIF/CIF (lettre "
                "+ 8 caractères, ex. A12345678), base du n° de TVA ES. ⚠️ Pas d'accès "
                "structuré libre : ne PAS inventer de NIF ni de donnée registre.\n"
                "- Formes juridiques : S.L., S.A., S.L.U. (filiale unipersonnelle). Un "
                "autónomo n'est pas une société.\n"
                "- Décideurs : CEO / Director General, CIO / Director de Sistemas, CTO.\n"
                "- Télétravail : « full remote » = « 100 % remoto », « totalmente remoto », "
                "« teletrabajo total ». « Híbrido » ou « teletrabajo parcial » n'est PAS "
                "full remote. Sans mention explicite, la politique reste NON ÉTABLIE — "
                "ne jamais la déduire.\n"
                "- Marché en espagnol : rédiger en espagnol (usted pour un premier contact), "
                "l'anglais convient pour les scale-ups de Madrid/Barcelone."
            ),
        }
