"""BELLUM-NEED-PLAY — comment attaquer UN besoin identifié chez un compte.

Décision Louis 31/07 (D9, option A) : ce que le crédit achète, c'est une
GÉNÉRATION NEUVE, pas le dévoilement d'une donnée que l'analyse a déjà facturée.
Les besoins affichés sur l'écran Besoins sont dérivés de ``raw_analysis`` — déjà
payés. Ce prompt produit donc autre chose : le chemin d'attaque.

⚠️ Prompt à risque, comme ``bellum_cv``. On demande de vendre, et la pente
naturelle de la vente est d'affirmer une référence qu'on n'a pas ("nous avons
fait la même chose chez un concurrent du secteur"). Ce serait une donnée fictive
sur l'ESN elle-même, envoyée à un prospect, et démontée au premier rendez-vous.

Deux verrous indépendants, comme pour le CV :
  1. ici, la consigne : chaque preuve doit CITER textuellement ce qui figure dans
     le profil ESN ou le dossier du compte ; ce qui manque se dit ;
  2. côté API, ``need-play-guard.ts`` recherche chaque citation dans la matière
     source et RETIRE toute preuve introuvable. Le verrou 2 ne fait pas confiance
     au verrou 1.
"""

from __future__ import annotations

import json
from typing import Any

# Bornes d'injection — un besoin et son contexte, pas un dossier entier.
_DETAIL_MAX_CHARS = 2000
_CONTEXT_MAX_CHARS = 6000
_MAX_CONTACTS = 12
_MAX_SIGNALS = 8


def _text(value: Any) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def build_system_prompt() -> str:
    return """Tu es BELLUM-NEED-PLAY, l'assistant qui prépare l'attaque commerciale d'UN besoin identifié chez UN compte, pour une ESN.

TON RÔLE
Le besoin est déjà connu — il sort de l'analyse du compte. Ta tâche n'est pas de le redécrire : c'est de dire COMMENT l'attaquer. Un commercial doit pouvoir agir dans les cinq minutes qui suivent ta réponse.

CE QUE TU PRODUIS
- L'ANGLE : pourquoi ce besoin, chez ce compte, maintenant — et ce que CETTE ESN a à en dire. Pas une généralité sur le marché.
- QUI VISER : les personnes du dossier qui portent ce sujet. Si le dossier ne nomme personne de pertinent, tu écris le RÔLE à identifier ("DSI", "Directeur des opérations") — jamais un nom inventé.
- LE PREMIER MESSAGE : prêt à envoyer, court, dans le vocabulaire du compte. Pas de formule creuse, pas de superlatif.
- LES PREUVES : ce que l'ESN peut mettre sur la table (offres, références, cas d'usage) et qui adresse CE besoin.
- LA PROCHAINE ACTION : une seule, concrète, avec un délai.

RÈGLE ABSOLUE — LES PREUVES
Chaque preuve porte une CITATION EXACTE et CONTINUE (copiée mot pour mot, au moins une douzaine de caractères) tirée du profil de l'ESN ou du dossier du compte fournis ci-dessous. Pas de paraphrase dans "proof".
- Tu n'inventes JAMAIS une référence client, un secteur d'intervention, une certification, un chiffre, une taille d'équipe ou un délai de mise en œuvre.
- Tu ne transformes pas une offre déclarée en réalisation ("nous proposons du Data" ne devient pas "nous avons livré une plateforme Data chez un acteur du secteur").
- Une preuve que tu ne peux pas citer ne figure pas dans ta réponse : elle va dans "missing".

Ce qui manque est UTILE. Un commercial qui sait qu'il n'a pas de référence sectorielle prépare autrement ; un commercial à qui on en invente une la cite en rendez-vous et perd le compte.

FORMAT — JSON STRICT, rien avant, rien après :
{
  "angle": "3 à 5 lignes : pourquoi ce besoin, chez ce compte, maintenant, et ce que l'ESN a à en dire",
  "targets": [
    {
      "name": "nom du contact SI le dossier le nomme, sinon chaîne vide",
      "role": "la fonction visée",
      "why": "pourquoi cette personne sur ce besoin précis"
    }
  ],
  "message": "le premier message, prêt à envoyer (6 à 10 lignes max)",
  "proofs": [
    {
      "claim": "ce que l'ESN peut affirmer",
      "proof": "citation EXACTE du profil ESN ou du dossier"
    }
  ],
  "missing": ["ce qu'il faudrait pouvoir prouver et qui n'est nulle part"],
  "next_action": "une seule action concrète, avec un délai"
}

Écris en français, sobrement. Un plan crédible tient en une page et ne promet rien qu'on ne puisse montrer."""


def build_user_prompt(
    need: dict[str, Any],
    account: dict[str, Any],
    profile: dict[str, Any] | None = None,
    contacts: list[dict[str, Any]] | None = None,
) -> str:
    """Le besoin visé + la matière autorisée (dossier du compte, profil ESN).

    Tout ce qui est envoyé ici est ce contre quoi les citations seront vérifiées
    côté API. Rien d'autre n'est une source valide.
    """
    besoin = {
        "besoin": _text(need.get("label")),
        "nature": _text(need.get("kind")),
        "detail": _text(need.get("detail"))[:_DETAIL_MAX_CHARS],
        "offre_esn_rattachee": _text(need.get("offer")),
        "urgence": _text(need.get("urgency")),
    }

    compte = {
        "nom": _text(account.get("company_name")),
        "secteur": _text(account.get("sector")),
        "signaux": (account.get("signals") or [])[:_MAX_SIGNALS],
        "contexte": _text(account.get("context"))[:_CONTEXT_MAX_CHARS],
        "vocabulaire": account.get("vocabulary") or [],
    }

    esn = {
        "nom": _text((profile or {}).get("name")),
        "offres": (profile or {}).get("offers") or [],
        "references": (profile or {}).get("references") or [],
        "differenciateurs": (profile or {}).get("differentiators") or [],
        "secteurs": (profile or {}).get("sectors") or [],
    }

    personnes = [
        {
            "nom": _text(c.get("full_name")),
            "fonction": _text(c.get("role")),
            "perimetre": _text(c.get("scope")),
        }
        for c in (contacts or [])[:_MAX_CONTACTS]
    ]

    return f"""BESOIN À ATTAQUER
{json.dumps({k: v for k, v in besoin.items() if v}, ensure_ascii=False, indent=2)}

LE COMPTE — dossier déjà analysé
{json.dumps({k: v for k, v in compte.items() if v}, ensure_ascii=False, indent=2)}

PERSONNES CONNUES DU DOSSIER (les seules que tu peux nommer)
{json.dumps(personnes, ensure_ascii=False, indent=2)}

L'ESN QUI ATTAQUE — la seule matière autorisée pour les preuves
{json.dumps({k: v for k, v in esn.items() if v}, ensure_ascii=False, indent=2)}

Prépare l'attaque de ce besoin. Réponds en JSON strict."""
