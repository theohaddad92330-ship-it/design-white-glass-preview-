"""Prompt d'évaluation de la GRILLE DE QUALIFICATION de l'espace (#3755).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE PROMPT FAIT, ET CE QU'IL NE FAIT PAS
─────────────────────────────────────────────────────────────────────────────
L'ESN a sa propre grille go/no-go : des filtres ÉLIMINATOIRES (PASS/FAIL) et des
critères PONDÉRÉS (des points jusqu'à un poids). Ce prompt lit le dossier d'un
compte et évalue chaque critère AVEC SA PREUVE — un fait du dossier, cité.

- **Pas de preuve, pas d'évaluation** : un critère que le dossier n'établit pas
  est `not_evaluable`. Il sort du dénominateur ; il ne vaut jamais 0.
- **Non évaluable n'est pas FAIL** : un filtre n'élimine que sur un fait contraire.
- **Les critères internes** (staffing, appétence de l'équipe, effort d'avant-vente,
  budget validé) ne sont même pas envoyés : le service les marque lui-même.
- **Jamais une probabilité**, jamais une « chance de closing » (c26).
- **Aucun critère protégé** (âge, genre, origine…) ne pèse dans une évaluation.
"""

from __future__ import annotations

import json
from typing import Any


def build_system_prompt() -> str:
    return (
        "Tu es l'analyste de qualification d'une ESN. Tu évalues un compte client "
        "contre la grille de qualification PROPRE à cette ESN, critère par critère, "
        "à partir du SEUL dossier fourni.\n\n"
        "Deux types de critères :\n"
        "- `eliminatory` (filtre éliminatoire) : statut `pass` si le dossier établit "
        "que le critère est rempli, `fail` si le dossier établit le CONTRAIRE, sinon "
        "`not_evaluable`.\n"
        "- `weighted` (critère pondéré) : statut `scored` avec `points` entre 0 et le "
        "poids du critère, en t'appuyant sur les descriptions des paliers (le palier "
        "maximum et le palier zéro) ; `not_evaluable` si le dossier ne permet pas de "
        "noter.\n\n"
        "Règles absolues :\n"
        "1. Chaque `pass`, `fail` ou `scored` porte une `evidence` : le fait du dossier "
        "qui le justifie, cité ou résumé fidèlement, en une phrase. Sans fait, le statut "
        "est `not_evaluable` — jamais une note devinée.\n"
        "2. `not_evaluable` n'est PAS un échec : n'écris `fail` que sur un fait contraire.\n"
        "3. N'invente aucun fait. N'utilise aucune connaissance extérieure au dossier.\n"
        "4. Jamais de probabilité, de pourcentage de chance ni de prévision de signature.\n"
        "5. Aucun critère protégé (âge, genre, origine, photo, adresse personnelle) ne "
        "pèse dans une évaluation.\n"
        "6. Le tier et le niveau du décideur ne se déduisent que des `signals` fournis ; "
        "s'ils valent null, ces critères sont `not_evaluable`.\n\n"
        "Réponds UNIQUEMENT par un objet JSON de la forme :\n"
        '{"evaluations": [{"code": "F1", "status": "pass", "points": null, '
        '"evidence": "Siège social à Paris (dossier : headquarters)."}]}'
    )


def build_user_prompt(
    account_name: str,
    dossier: dict[str, Any],
    criteria: list[dict[str, Any]],
    signals: dict[str, Any],
) -> str:
    return (
        f"Compte : {account_name}\n\n"
        f"Grille (critères à évaluer) :\n{json.dumps(criteria, ensure_ascii=False)}\n\n"
        f"Signaux importés par l'espace :\n{json.dumps(signals, ensure_ascii=False)}\n\n"
        f"Dossier du compte :\n{json.dumps(dossier, ensure_ascii=False, default=str)}"
    )
