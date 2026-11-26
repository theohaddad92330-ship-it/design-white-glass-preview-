"""BELLUM-PROJECT-SYNTHESIS — la synthèse en 7 questions d'une opportunité
(#2171.27, contrat posé dans `packages/contracts/src/schemas/project-synthesis.ts`).

Le contrat distingue CONFIRMÉ (des faits) et HYPOTHÈSES (encore supposé,
#2171.44) — jamais confondus. `decisionMaker` est un RÔLE du circuit de
décision, jamais une probabilité (doctrine `c26_probabilite`). La garde
`projectSynthesisHasVaguePhraseWithoutFact` (#2171.28) rejette côté serveur
toute phrase de la liste bannie non étayée par un fait — la consigne ici est
la première ligne de défense, pas la seule : comme pour `bellum_need_play`,
le prompt interdit ce que le contrat interdit, et le serveur ne fait pas
confiance au prompt seul.
"""

from __future__ import annotations

import json
from typing import Any

_DETAIL_MAX_CHARS = 2000
_CONTEXT_MAX_CHARS = 6000
_MAX_CONTACTS = 12

_FORBIDDEN_PHRASES = ("Opportunité intéressante", "Bon potentiel", "À suivre")


def _text(value: Any) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def build_system_prompt() -> str:
    forbidden = " · ".join(f"« {p} »" for p in _FORBIDDEN_PHRASES)
    return f"""Tu es BELLUM-PROJECT-SYNTHESIS, l'assistant qui résume UNE opportunité commerciale pour une ESN, sur exactement SEPT questions.

TON RÔLE
Le commercial ouvre la fiche de l'opportunité et doit comprendre en un coup d'œil où en est l'affaire — sans relire tout l'historique. Tu ne redécris pas le besoin, tu dis où ça en est VRAIMENT.

RÈGLE ABSOLUE — FAITS ET HYPOTHÈSES NE SE MÉLANGENT JAMAIS
- "confirmed" : uniquement ce que le dossier ATTESTE (un échange, une donnée du compte, un document). Jamais une déduction.
- "hypotheses" : ce que tu SUPPOSES à partir du contexte, nommé comme tel. Une hypothèse qui se glisse dans "confirmed" est la pire erreur possible ici : elle fait annoncer au commercial une certitude qu'il n'a pas.
- Une case vide (aucun fait, aucune hypothèse) reste un tableau vide — n'invente rien pour la remplir.

RÈGLE ABSOLUE — AUCUNE PHRASE VAGUE SANS FAIT
Interdites SANS un fait précis pour les porter : {forbidden}. Une phrase de ce type ne tient que si "confirmed" ou "hypotheses" contient au moins un élément concret à côté — sinon elle ne veut rien dire et le commercial ne peut rien en faire.

DÉCIDEUR
Un RÔLE du circuit de décision (ex. "DSI", "sponsor identifié"), jamais un nom au hasard, et jamais une probabilité de closing — BellumAI n'affiche jamais de probabilité. `null` si le dossier ne permet pas encore de le dire.

FORMAT — JSON STRICT, rien avant, rien après :
{{
  "problem": "Le problème que le client cherche à résoudre, en 1 à 3 phrases",
  "confirmed": ["fait attesté par le dossier"],
  "hypotheses": ["ce qui est encore supposé, nommé comme tel"],
  "decisionMaker": "un rôle du circuit de décision, ou null",
  "blockingConditions": ["ce qui peut bloquer l'affaire"],
  "nextToObtain": "ce que l'équipe doit obtenir ensuite — une action, pas une généralité",
  "whatNotToDo": "ce qu'il ne faut PAS faire sur cette affaire, précisément"
}}

Écris en français, sobrement. Une synthèse crédible tient en une demi-page et ne promet rien que le dossier ne prouve pas."""


def build_user_prompt(
    project: dict[str, Any],
    account: dict[str, Any],
    contacts: list[dict[str, Any]] | None = None,
) -> str:
    """L'opportunité + la matière autorisée (compte, contacts liés). Rien
    d'autre n'est une source valide pour "confirmed"."""
    opportunite = {
        "besoin": _text(project.get("label")),
        "nature": _text(project.get("kind")),
        "detail": _text(project.get("detail"))[:_DETAIL_MAX_CHARS],
        "offre_esn_rattachee": _text(project.get("offer")),
        "urgence": _text(project.get("urgency")),
        "etape": _text(project.get("stage")),
    }

    compte = {
        "nom": _text(account.get("company_name")),
        "secteur": _text(account.get("sector")),
        "contexte": _text(account.get("context"))[:_CONTEXT_MAX_CHARS],
    }

    personnes = [
        {"nom": _text(c.get("full_name")), "role_sur_ce_projet": _text(c.get("role"))}
        for c in (contacts or [])[:_MAX_CONTACTS]
    ]

    return f"""OPPORTUNITÉ À SYNTHÉTISER
{json.dumps({k: v for k, v in opportunite.items() if v}, ensure_ascii=False, indent=2)}

LE COMPTE — dossier déjà analysé
{json.dumps({k: v for k, v in compte.items() if v}, ensure_ascii=False, indent=2)}

CIRCUIT DE DÉCISION CONNU (les seules personnes que tu peux nommer)
{json.dumps(personnes, ensure_ascii=False, indent=2)}

Synthétise cette opportunité en sept réponses. Réponds en JSON strict."""
