"""Prompt d'extraction d'une PROPOSITION de mission depuis un document (#2560).

Un contrat, une fiche de poste ou un e-mail décrit souvent déjà tout ce qu'une
mission ESN a besoin de porter : le client, le rôle, les dates, le TJM, le
volume de jours. Le commercial ne doit pas retaper ce que le document dit
déjà — c'est le fil des trois retours du call bêta François Thomas du
17/09/2026 (#2560/#2561/#2562).

⚠️ **UNE EXTRACTION EST UNE PROPOSITION, JAMAIS UNE CRÉATION.** Ce prompt ne
crée rien : il lit, et il dit d'où il tient chaque valeur. Le geste qui crée la
mission est le clic de l'utilisateur, ailleurs (`mission-extraction.controller.ts`
ne fait qu'un GET conceptuel — aucune écriture).

Même discipline que `bellum_cv_parse` et `expense_receipt_prompt` :
- **chaque champ cite le document** dans `source_excerpt` — une citation
  reconstituée est un échec, `value` doit rester `null` ;
- **rien n'est déduit ou halluciné** : pas de TJM moyen de marché, pas de date
  de démarrage devinée sur une simple mention de trimestre, pas de nombre de
  jours calculé sur une durée de mission approximative ;
- **aucun critère protégé** : le prompt ne s'intéresse ni à l'identité, ni à
  l'âge, ni à l'origine de qui que ce soit — seulement aux termes commerciaux
  de la mission.
"""

from __future__ import annotations

FIELD_DESCRIPTIONS = [
    ("account_name", "le nom du CLIENT final (l'entreprise qui achète la prestation), tel qu'écrit"),
    ("role_title", "l'intitulé du rôle ou du poste recherché, tel qu'écrit"),
    ("started_on", "la date de début de mission, au format AAAA-MM-JJ"),
    ("ends_on", "la date de fin PRÉVUE de mission, au format AAAA-MM-JJ"),
    ("daily_rate", "le TARIF JOURNALIER (TJM), en euros, sans le symbole monétaire"),
    ("days", "le NOMBRE DE JOURS du bon de commande ou de la prestation"),
    (
        "supervised_forfait",
        "la valeur `supervised` UNIQUEMENT si le document dit que la mission est un FORFAIT réalisé "
        "par les salariés du client (l'ESN cadre ou supervise, sans placer de consultants) ; sinon `null`",
    ),
]


def build_system_prompt() -> str:
    blocs = "\n".join(f"- `{key}` : {description}" for key, description in FIELD_DESCRIPTIONS)
    return f"""Tu lis un contrat, une fiche de poste ou un e-mail commercial ESN, et tu en
extrais sept champs pour PROPOSER une mission — tu ne la crées pas, un humain
validera ou corrigera chaque champ ensuite.

LES SEPT CHAMPS
{blocs}

LA RÈGLE QUI COMMANDE TOUT
Chaque champ que tu remplis DOIT citer, dans `source_excerpt`, la portion EXACTE
du texte qui te fait écrire cette valeur. Une citation approximative,
reformulée ou reconstituée est un échec : elle sera rejetée. Si tu ne peux pas
citer, mets `value` à `null`.

CE QUE TU NE FAIS JAMAIS
- Halluciner une date, un TJM ou un volume de jours qui n'apparaît nulle part
  dans le texte, même à titre d'exemple plausible.
- Déduire une date de début d'une mention vague (« au plus tôt », « dès que
  possible », « prochainement ») — sans date écrite, `started_on` reste `null`.
- Calculer un nombre de jours à partir d'une durée en mois ou en semaines
  (« 6 mois de mission ») : `days` ne se remplit que si un NOMBRE DE JOURS est
  écrit noir sur blanc.
- Confondre le TJM (tarif journalier) avec un montant total de contrat, un
  salaire annuel, ou un taux horaire.
- Extraire ou deviner un GENRE, un ÂGE, une ORIGINE, une NATIONALITÉ, ou toute
  autre donnée qui identifierait une personne physique — ce prompt ne
  s'intéresse qu'aux termes commerciaux de la mission, jamais à qui la fera.

LA CONFIANCE
Chaque champ rempli porte une `confidence` entre 0 et 1 — à quel point la
LECTURE est sûre, pas à quel point la mission est probable :
- 0.9 et plus : c'est écrit noir sur blanc, sans ambiguïté ;
- 0.6 à 0.9 : c'est écrit mais l'interprétation demande un choix ;
- moins de 0.6 : la lecture est un pari. Remplis quand même le champ avec ta
  meilleure lecture — c'est le serveur, pas toi, qui décide si une confiance
  aussi basse doit rester affichée.

FORMAT DE SORTIE
Un objet JSON, rien d'autre, aucun texte autour :
{{
  "account_name": {{"value": <texte ou null>, "confidence": <0 à 1>, "source_excerpt": "<citation ou \\"\\">"}},
  "role_title": {{"value": <texte ou null>, "confidence": <0 à 1>, "source_excerpt": "<citation ou \\"\\">"}},
  "started_on": {{"value": "<AAAA-MM-JJ ou null>", "confidence": <0 à 1>, "source_excerpt": "<citation ou \\"\\">"}},
  "ends_on": {{"value": "<AAAA-MM-JJ ou null>", "confidence": <0 à 1>, "source_excerpt": "<citation ou \\"\\">"}},
  "daily_rate": {{"value": <nombre ou null>, "confidence": <0 à 1>, "source_excerpt": "<citation ou \\"\\">"}},
  "days": {{"value": <nombre ou null>, "confidence": <0 à 1>, "source_excerpt": "<citation ou \\"\\">"}},
  "supervised_forfait": {{"value": "<supervised ou null>", "confidence": <0 à 1>, "source_excerpt": "<citation ou \\"\\">"}}
}}

Les sept champs figurent TOUJOURS dans ta réponse."""


def build_user_prompt(document_text: str) -> str:
    return f"""Voici le texte extrait du document déposé (contrat, fiche de poste ou e-mail).
--- DÉBUT DU TEXTE ---
{document_text}
--- FIN DU TEXTE ---

Rends les sept champs. Chaque champ rempli cite le texte."""
