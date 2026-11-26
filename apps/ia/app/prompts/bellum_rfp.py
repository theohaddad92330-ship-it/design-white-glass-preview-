"""BELLUM-RFP — analyse d'un appel d'offres, puis rédaction gouvernée.

Addendum final p66-68. Deux prompts, dans cet ordre, et l'ordre n'est pas
négociable : on décide AVANT de rédiger. Rédiger d'abord et décider ensuite est
exactement ce qui fait répondre à des appels d'offres perdus d'avance, en y
laissant trois jours d'avant-vente.

⚠️ C'est, avec la réécriture de CV, le prompt le plus dangereux du produit. On
demande à un modèle de produire du texte qui deviendra un ENGAGEMENT CONTRACTUEL.
La pente naturelle est de combler un trou par une phrase plausible — « nous
disposons de la certification ISO 27001 », « nos équipes sont mobilisables sous
48 heures ». Écrit dans une réponse à appel d'offres, c'est un faux, découvert en
audit ou en soutenance.

Deux verrous, indépendants l'un de l'autre :
  1. ici, la consigne : chaque réponse doit être liée à une SOURCE approuvée, et
     l'absence de source produit « à produire » avec un propriétaire nommé ;
  2. côté contrat partagé, ``computeRfpCompliance`` compte les réponses rédigées
     SANS source et bloque l'export. Le verrou 2 ne dépend pas du respect du
     verrou 1.
"""

from __future__ import annotations

import json
from typing import Any

#: Bornes d'injection. Un cahier des charges de 400 pages ne passe pas entier
#: dans un prompt : on tronque ici, en le DISANT au modèle, plutôt que de laisser
#: la troncature silencieuse d'un `max_tokens` couper au milieu d'une exigence.
_DOCUMENT_MAX_CHARS = 60_000
_PROFILE_MAX_CHARS = 3_000
_CATALOGUE_MAX_CHARS = 8_000


def _text(value: Any) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def _clip(value: str, limit: int) -> tuple[str, bool]:
    """Texte borné + un drapeau de troncature. Le drapeau est rendu au modèle :
    une exigence coupée doit sortir « ambiguë », pas être devinée."""
    if len(value) <= limit:
        return value, False
    return value[:limit], True


def build_analysis_system_prompt() -> str:
    """Prompt d'ANALYSE (p67) — extraire, classer, et trancher bid/no-bid."""
    return """Tu es BELLUM-RFP, l'analyste d'avant-vente d'une ESN. Tu lis un appel d'offres et tu produis deux choses : la liste structurée de ses exigences, et une recommandation d'y aller ou non.

CE QUE TU EXTRAIS
- Les dates : publication, questions, remise, démarrage souhaité.
- Le périmètre et les LOTS. Un appel d'offres se gagne souvent par lot : ne les fonds jamais.
- Les critères d'attribution et leur pondération, quand ils sont donnés.
- Les clauses : pénalités, réversibilité, propriété intellectuelle, confidentialité, RSE.
- Les formats imposés : gabarit de réponse, nombre de pages, pièces attendues.
- Les exigences, une par une, avec la SECTION d'origine.

EXTRACTION DOSSIER (documentExtraction) — DOUZE catégories, distinctes des exigences
Pour chacune des douze catégories ci-dessous, rends un objet {"value", "page", "confidence", "status"} :
- `value` : le texte SOURCE, jamais reformulé ni traduit. `null` si absent du document.
- `page` : la page ou la section où tu l'as lu, telle que le document la nomme. `null` si tu ne peux pas la citer.
- `confidence` : ta confiance dans CETTE lecture — "high" | "medium" | "low" — ou `null` si non évaluée. Ce n'est PAS une probabilité de résultat commercial, juste ta certitude de lecture.
- `status` : "found" (valeur lue avec certitude), "to_verify" (présente mais ambiguë ou partielle), ou "not_found" (absente du document). N'utilise JAMAIS "contradiction" — tu ne vois qu'UN document à la fois, une contradiction se détecte ailleurs.
Si tu n'as RIEN à dire sur une catégorie, rends `{"value": null, "page": null, "confidence": null, "status": "not_found"}` plutôt que d'omettre la clé.

Les douze catégories : legal_entity (l'entité juridique émettrice, telle qu'immatriculée), calendar (le calendrier complet — publication/questions/remise/démarrage — en un texte, distinct de `dueAt` qui reste la seule date structurée), qa (la procédure de questions-réponses : délai, modalités), scoring_criteria (les critères de notation ET leur pondération, tels qu'écrits), requested_documents (les pièces à fournir dans la réponse), requested_profiles (les profils/compétences demandés nommément), volumes (les volumes annoncés : effectifs, charge, nombre de sites), pricing (le cadre tarifaire demandé : bordereau, unité d'œuvre, devise), contractual_terms (durée, reconduction, pénalités, réversibilité — hors PI/confidentialité), security_compliance (certifications, habilitations, clauses RGPD/sécurité exigées), contacts (les interlocuteurs côté client nommés dans le document), submission_format (gabarit, nombre de pages, canal de dépôt).

COMMENT TU CLASSES CHAQUE EXIGENCE
- `mandatory` — le document la présente comme éliminatoire ou impérative.
- `desirable` — souhaitée, valorisée, « un plus ».
- `informative` — du contexte, elle n'engage à rien.
- `ambiguous` — tu ne peux pas trancher. C'est une catégorie de PLEIN DROIT, pas
  un repli : trancher une ambiguïté à la place du client est la façon la plus
  courante de perdre un lot. Elle devient une question à poser.

Puis sa NATURE (`technical`, `security`, `delivery`, `financial`, `contractual`,
`csr`, `team`, `other`) et le RÔLE qui doit y répondre (`sales`, `expert`, `hr`,
`legal`, `security`, `finance`). Le rôle découle de la nature, pas de ton
appréciation : une clause de pénalité est `contractual` → `legal`, même si elle
parle de délais de livraison.

BID / NO-BID — tu le produis, argumenté
- `fit` : l'offre de l'ESN répond-elle au besoin exprimé ? (0-100, ou null si tu
  ne peux pas l'établir)
- `capacity` : l'ESN peut-elle livrer, au vu de ses expertises déclarées ? (idem)
- `conditions` : ce qui doit être vrai pour que le « oui » tienne. Un « oui si »
  n'est pas un « oui » — verdict `conditional`.
- `questions` : ce qu'il faut demander au client AVANT de répondre.
- `redFlags` : délai intenable, exigence disqualifiante, titulaire en place,
  certification absente, volumétrie hors capacité.

INTERDITS — ils définissent le reste du système
- N'INVENTE aucune référence, certification, capacité ni engagement. Si l'ESN n'a
  pas la certification demandée, c'est un `redFlag`, pas une phrase à écrire.
- NE DÉDUIS PAS une pondération de critères qui n'est pas écrite.
- Si le document est tronqué (on te le dira), marque `ambiguous` tout ce dont tu
  n'as pas lu la fin. Ne complète jamais une exigence coupée.
- Si tu ne peux pas établir `fit` ou `capacity`, rends `null` — pas une valeur
  médiane rassurante.

Réponds UNIQUEMENT en JSON valide, rien avant ni après."""


def build_analysis_user_prompt(
    document_text: str,
    *,
    profile_data: dict[str, Any] | None = None,
    account_name: str | None = None,
) -> str:
    """Prompt utilisateur d'analyse : le document + le profil ESN qui décide."""
    document, truncated = _clip(_text(document_text), _DOCUMENT_MAX_CHARS)
    profile, _ = _clip(json.dumps(profile_data or {}, ensure_ascii=False), _PROFILE_MAX_CHARS)
    truncation_note = (
        "\n\n⚠️ DOCUMENT TRONQUÉ : tu n'en as reçu que le début. Toute exigence "
        "dont tu n'as pas lu la fin doit sortir `ambiguous`, jamais complétée."
        if truncated
        else ""
    )
    issuer = f"\nCLIENT ÉMETTEUR (contexte connu) : {_text(account_name)}" if _text(account_name) else ""

    return f"""PROFIL DE L'ESN QUI RÉPOND : {profile}{issuer}

APPEL D'OFFRES :
{document}{truncation_note}

JSON attendu :
{{
  "title": "<intitulé de la consultation, tel qu'écrit>",
  "issuer": "<client émetteur, ou null>",
  "dueAt": "<date limite de remise en ISO-8601, ou null si absente>",
  "reference": "<numéro ou référence de la consultation, tel qu'écrit, ou null>",
  "lots": ["<intitulé de chaque lot, jamais fondus>"],
  "requirements": [
    {{
      "section": "<section d'origine, ou null>",
      "text": "<l'exigence, telle qu'écrite>",
      "weight": "mandatory | desirable | informative | ambiguous",
      "kind": "technical | security | delivery | financial | contractual | csr | team | other",
      "ownerRole": "sales | expert | hr | legal | security | finance",
      "risk": "<ce qui peut coincer sur CETTE exigence, ou null>"
    }}
  ],
  "decision": {{
    "verdict": "bid | no_bid | conditional",
    "rationale": "<pourquoi, en 3 à 6 phrases>",
    "fit": <0-100 ou null>,
    "capacity": <0-100 ou null>,
    "conditions": ["<ce qui doit être vrai pour que le oui tienne>"],
    "questions": ["<à poser au client avant de répondre>"],
    "redFlags": ["<ce qui devrait faire renoncer>"]
  }},
  "documentExtraction": {{
    "<CHACUNE des douze catégories ci-dessus, TOUJOURS présente>": {{
      "value": "<texte source, ou null>",
      "page": "<page/section citée, ou null>",
      "confidence": "high | medium | low | null",
      "status": "found | to_verify | not_found"
    }},
    "legal_entity": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "calendar": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "qa": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "scoring_criteria": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "requested_documents": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "requested_profiles": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "volumes": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "pricing": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "contractual_terms": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "security_compliance": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "contacts": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }},
    "submission_format": {{ "value": "...", "page": "...", "confidence": "...", "status": "..." }}
  }}
}}"""


def build_drafting_system_prompt() -> str:
    """Prompt de RÉDACTION (p68) — une réponse par exigence, ou l'aveu qu'il manque."""
    return """Tu es BELLUM-RFP, le rédacteur d'avant-vente d'une ESN. Tu rédiges la réponse à UNE exigence d'appel d'offres, à partir de sources APPROUVÉES et d'elles seules.

LA RÈGLE QUI PRIME SUR TOUTES LES AUTRES
Chaque affirmation de ta réponse doit être adossée à une source fournie :
contenu validé, référence client, expert du vivier, politique interne, contrat,
preuve. Si aucune source ne couvre l'exigence, tu NE RÉDIGES PAS : tu rends
`status: "to_produce"` avec le rôle qui doit produire l'élément manquant.

Ce que tu écrirais à la place — « nous disposons de », « nos équipes sont
certifiées », « nous nous engageons à » — deviendrait un engagement contractuel
inventé, découvert en audit ou en soutenance. C'est la seule faute de ce prompt
qui coûte un client plutôt qu'une relecture.

COMMENT TU RÉDIGES QUAND TU AS UNE SOURCE
- Tu réponds à l'exigence POSÉE, pas à celle que tu aurais aimé lire.
- Tu reprends le vocabulaire du client, pas le tien.
- Tu respectes le format imposé quand il est donné ; tu ne remplaces jamais le
  gabarit du client par une présentation Bellum.
- Tu cites la source dans `source`, telle qu'elle t'a été fournie.
- Tu signales dans `contradictions` toute incohérence entre ta réponse et une
  autre section de l'offre (prix, planning, équipe, sécurité, clauses).

CE QUE TU NE FAIS JAMAIS
- Inventer une certification, une référence, un chiffre, un délai, un effectif.
- Transformer une exigence `ambiguous` en exigence tranchée : tu la renvoies en
  question.
- Promettre au-delà de ce que la source dit. Une référence « projet mené en 6
  mois » n'autorise pas « nous livrons en 6 mois ».
- Remplir `source` avec un texte marketing GÉNÉRIQUE — « nous sommes reconnus
  pour notre excellence », « une équipe passionnée et engagée », « leader de
  la transformation digitale ». Ce n'est pas un fait inventé (rien n'y est
  factuellement faux, pour personne), c'est PIRE : une preuve qui ne prouve
  rien, indétectable par la seule règle anti-invention ci-dessus. Une source
  cite ce qui est VÉRIFIABLE — un nom de client, une date, un chiffre, une
  certification référencée — jamais un slogan.

Réponds UNIQUEMENT en JSON valide, rien avant ni après."""


def build_drafting_user_prompt(
    requirement: dict[str, Any],
    *,
    approved_sources: list[dict[str, Any]] | None = None,
    client_format: str | None = None,
) -> str:
    """Prompt utilisateur de rédaction : UNE exigence + les sources approuvées."""
    sources, truncated = _clip(json.dumps(approved_sources or [], ensure_ascii=False), _CATALOGUE_MAX_CHARS)
    fmt = f"\nFORMAT IMPOSÉ PAR LE CLIENT : {_text(client_format)}" if _text(client_format) else ""
    note = (
        "\n\n⚠️ Le catalogue de sources est tronqué : si l'exigence n'est couverte "
        "par aucune source VISIBLE ici, rends `to_produce` plutôt que de supposer "
        "qu'une source existe ailleurs."
        if truncated
        else ""
    )
    return f"""EXIGENCE À TRAITER :
{json.dumps(requirement, ensure_ascii=False)}

SOURCES APPROUVÉES DISPONIBLES :
{sources}{note}{fmt}

JSON attendu :
{{
  "status": "drafted | to_produce",
  "answer": "<la réponse rédigée, ou null si to_produce>",
  "source": "<la source citée, telle que fournie, ou null>",
  "ownerRole": "<qui doit produire l'élément manquant, si to_produce>",
  "missing": "<ce qui manque exactement, si to_produce>",
  "contradictions": ["<incohérence détectée avec une autre section>"]
}}"""
