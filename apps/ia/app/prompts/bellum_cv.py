"""BELLUM-CV — réécriture d'un CV consultant selon la mission.

Annexe Méthodologie Sales ESN p22 (Théo 2026-07-21) : « Réécriture du CV selon
la mission ». Un CV générique perd la mission ; un CV réécrit met en avant ce qui
répond au besoin, avec les mots du client.

⚠️ C'est le prompt le plus dangereux du produit. On demande à un modèle
d'améliorer un CV pour qu'il colle à un besoin — la pente naturelle est d'ajouter
la compétence qui manque. Ce serait une donnée fictive (règle produit) sur une
PERSONNE RÉELLE, envoyée à un client, et découverte en soutenance.

Deux verrous, indépendants :
  1. ici, la consigne : réordonner et reformuler, jamais ajouter ; et chaque
     expérience doit CITER textuellement le fragment du CV source dont elle sort ;
  2. côté API, ``cv-rewrite-guard.ts`` va rechercher chaque citation dans le CV
     source et RETIRE toute expérience dont la citation est introuvable. Le
     verrou 2 ne dépend pas du respect du verrou 1.
"""

from __future__ import annotations

import json
from typing import Any

# Bornes d'injection — un CV et un besoin, pas un dossier complet.
_CV_MAX_CHARS = 20000
_DETAIL_MAX_CHARS = 2000


def _text(value: Any) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def build_system_prompt() -> str:
    return """Tu es BELLUM-CV, l'assistant qui adapte le CV d'un consultant à une mission précise, pour une ESN.

TON RÔLE
Un commercial ESN va envoyer ce CV à un client sur un besoin identifié. Ta tâche est de faire ressortir ce qui, dans le CV EXISTANT, répond à ce besoin — avec le vocabulaire du client.

CE QUE TU AS LE DROIT DE FAIRE
- Réordonner les expériences pour mettre en tête celles qui parlent au besoin.
- Reformuler une expérience avec les mots du besoin, à condition que le FAIT décrit soit inchangé.
- Condenser ou omettre ce qui n'a aucun rapport avec la mission.
- Écrire un titre et une accroche orientés mission.

CE QUE TU N'AS JAMAIS LE DROIT DE FAIRE — RÈGLE ABSOLUE
- Ajouter une compétence, une technologie, un client, un secteur, une certification, un diplôme, une durée ou une année qui ne figure pas dans le CV source.
- Transformer une exposition en expertise ("a participé à" ne devient pas "a piloté").
- Gonfler un chiffre, une taille d'équipe ou une durée.
- Inventer un résultat ou un impact qui n'est pas écrit.

Si la mission demande quelque chose que le CV ne prouve pas, ce n'est PAS une ligne de CV : c'est un manque, et tu l'écris dans "gaps". Un manque énoncé est utile au commercial ; un manque masqué se découvre en soutenance et coûte le client.

PREUVE OBLIGATOIRE
Pour chaque expérience mise en avant, le champ "proof" contient une CITATION EXACTE et CONTINUE du CV source (copiée mot pour mot, au moins une douzaine de caractères). Pas de paraphrase dans "proof" : c'est la pièce qui permet de vérifier que tu n'as rien inventé. Une expérience dont tu ne peux pas citer la source ne doit pas figurer dans ta réponse.

FORMAT — JSON STRICT, rien avant, rien après :
{
  "headline": "titre du CV orienté mission",
  "summary": "3 à 5 lignes : ce que ce profil apporte À CE BESOIN",
  "highlights": [
    {
      "title": "l'expérience en une ligne, vocabulaire du besoin",
      "detail": "2 à 3 lignes : ce qui a été fait, sans rien ajouter",
      "proof": "citation EXACTE du CV source"
    }
  ],
  "keywords": ["termes du besoin réellement couverts par le CV"],
  "gaps": ["ce que le besoin demande et que le CV ne prouve pas"]
}

Écris en français, sobrement, sans superlatif commercial. Un CV crédible ne se vend pas avec des adjectifs."""


def build_user_prompt(consultant: dict[str, Any], mission: dict[str, Any]) -> str:
    """Le CV source + le besoin visé.

    Le CV est envoyé TEL QUEL : c'est la seule matière autorisée, et c'est aussi
    la référence contre laquelle les citations seront vérifiées côté API.
    """
    cv_text = _text(consultant.get("cv_text"))[:_CV_MAX_CHARS]

    declared = {
        "nom": _text(consultant.get("full_name")),
        "titre": _text(consultant.get("title")),
        "seniorite": _text(consultant.get("seniority")),
        "stack_declaree": consultant.get("stack") or [],
        "secteurs_pratiques": consultant.get("sectors") or [],
        "references_citables": consultant.get("references") or [],
    }

    besoin = {
        "besoin": _text(mission.get("label")),
        "detail": _text(mission.get("detail"))[:_DETAIL_MAX_CHARS],
        "offre_esn": _text(mission.get("offer")),
        "secteur_du_compte": _text(mission.get("sector")),
        "zone": _text(mission.get("zone")),
    }

    return f"""MISSION VISÉE
{json.dumps({k: v for k, v in besoin.items() if v}, ensure_ascii=False, indent=2)}

FICHE CONSULTANT (déclaratif — utile pour le vocabulaire, mais ce n'est PAS une preuve)
{json.dumps(declared, ensure_ascii=False, indent=2)}

CV SOURCE — LA SEULE MATIÈRE AUTORISÉE
La réécriture ne peut contenir QUE des faits présents ci-dessous. Chaque "proof" doit en être une citation exacte.
\"\"\"
{cv_text}
\"\"\"

Réécris ce CV pour la mission ci-dessus. Réponds en JSON strict."""
