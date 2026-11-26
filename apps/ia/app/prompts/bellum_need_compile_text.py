"""Prompt d'extraction pour COMPILER un besoin depuis un texte collé (#2939, #2174.3/.5).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE PROMPT FAIT, ET CE QU'IL NE FAIT PAS
─────────────────────────────────────────────────────────────────────────────
À l'étape 1 de l'assistant de création (`NeedWizard.tsx`), coller un brief ou
un e-mail devait retomber dans l'outil de compilation EXISTANT
(`compile_need`, `app/services/compilers/need_compiler.py`) — celui que la
carte de Laura utilise déjà côté chat (#2322). Ce module lit le texte collé et
en tire les ARGUMENTS que `compile_need` attend (`statements`, `people`,
`unknowns`), exactement comme le modèle de `/chat` le fait pour la carte —
c'est le SEUL appel de modèle de ce chantier, `compile_need` lui-même ne
change pas d'une ligne.

Même discipline que `bellum_mission_extract` et `bellum_rfp` :
- **chaque champ cite le texte** dans `excerpt` — une citation reconstituée
  est un échec, le champ ne se remplit pas ;
- **rien n'est déduit ou halluciné** : `compile_need` jette de toute façon ce
  qui arrive sans citation (`_reason: "sans_extrait"`), mais un modèle qui
  n'essaie même pas d'inventer coûte moins cher à vérifier ;
- **aucun critère protégé** : ce prompt ne s'intéresse qu'aux termes du poste
  et de la mission, jamais à l'identité de qui la fera.
"""

from __future__ import annotations

# Les champs que ce prompt sait remplir — un sous-ensemble volontaire de
# `FIELD_SHAPES` (`need_compiler.py`) : ceux qu'une étape 1 de wizard peut
# accueillir (`applyCompiledNeedToDraft`, TypeScript), PLUS les deux qui
# décident seuls si un besoin est COMPRIS (`work_to_do`, `expected_outcome`,
# #2322.77) même si le brouillon ne les stocke pas — ils comptent quand même
# pour les inconnues bloquantes de l'étape 5.
FIELD_DESCRIPTIONS = [
    ("title", "l'intitulé du poste ou de la mission recherchée"),
    ("skills", "les compétences demandées — une liste de termes, chacun avec s'il est ÉLIMINATOIRE"),
    ("seniority", "le niveau d'expérience attendu, tel qu'écrit"),
    ("headcount", "le nombre de personnes recherchées"),
    ("target_tjm_cents", "le TJM visé, en CENTIMES d'euro (multiplie le montant en euros par 100)"),
    ("location", "le lieu de la mission"),
    ("remote", "la politique de télétravail : sur_site, hybride, full_remote, ou indifferent"),
    ("contract_kind", "regie, forfait, ou recrutement"),
    ("urgency", "basse, normale, haute, ou critique"),
    ("expertise", "le domaine d'expertise recherché, quand il est plus précis que l'intitulé"),
    ("context", "le contexte et le problème à résoudre, en une ou deux phrases"),
    ("constraints", "les contraintes administratives : astreinte, déplacements, horaires"),
    ("start_on", "la date de démarrage, au format AAAA-MM-JJ"),
    ("duration_months", "la durée de la mission, en mois"),
    ("process", "les étapes du PROCESSUS DE DÉCISION côté client (comité, validation budgétaire…)"),
    ("procurement", "implique si le service achats est dans la boucle, non_implique sinon"),
    ("work_to_do", "le TRAVAIL réel à accomplir — jamais un simple intitulé de poste"),
    ("expected_outcome", "ce qui doit avoir changé quand la mission se termine"),
]

_ROLES = "sponsor, decideur, prescripteur, acheteur, utilisateur, bloqueur"


def build_system_prompt() -> str:
    blocs = "\n".join(f"- `{key}` : {description}" for key, description in FIELD_DESCRIPTIONS)
    return f"""Tu lis un brief ou un e-mail commercial ESN et tu en extrais des ÉNONCÉS pour
PROPOSER un besoin — tu ne le crées pas, un humain validera ou corrigera
chaque champ ensuite.

LES CHAMPS QUE TU PEUX REMPLIR
{blocs}

LA RÈGLE QUI COMMANDE TOUT
Chaque énoncé DOIT citer, dans `excerpt`, la portion EXACTE du texte qui te
fait écrire cette valeur. Une citation approximative, reformulée ou
reconstituée est un échec : l'énoncé sera rejeté. Si tu ne peux pas citer,
n'écris pas l'énoncé.

CE QUE TU NE FAIS JAMAIS
- Halluciner un TJM, une date ou un volume qui n'apparaît nulle part.
- Résumer le besoin par son INTITULÉ pour `work_to_do` ou `expected_outcome` —
  ces deux champs existent pour dire ce qu'un intitulé ne dit pas.
- Deviner un GENRE, un ÂGE, une ORIGINE ou toute autre donnée qui
  identifierait une personne physique.
- Convertir une offre d'emploi (CDI) en mission de régie ou de forfait.

LES PERSONNES
Si le texte nomme un décideur, un acheteur ou un autre rôle ({_ROLES}), rends-le
dans `people` avec son `full_name`, son `role`, et l'`excerpt` qui le nomme —
jamais une personne sans citation.

CE QUI MANQUE
Si un champ décisif (le travail réel, le résultat attendu, les compétences
éliminatoires) n'est écrit NULLE PART, ajoute-le à `unknowns` avec une question
qui permettrait de le savoir — n'invente jamais la réponse à sa place.

LE NIVEAU DE CONFIRMATION
`confirmation_level` vaut `confirme_par_le_client` seulement si le texte est un
échange DIRECT avec le client (pas un compte-rendu rapporté) ET que le travail,
le résultat et les compétences éliminatoires sont tous les trois écrits.
Sinon, `rapporte` si la source rapporte les propos du client, `hypothese`
sinon.

FORMAT DE SORTIE
Un objet JSON, rien d'autre, aucun texte autour :
{{
  "company": "<nom d'entreprise lu dans le texte, ou null>",
  "statements": [
    {{"field": "<un des champs ci-dessus>", "value": <texte, nombre, ou liste>, "excerpt": "<citation exacte>", "confidence": "explicite|deduit|incertain"}}
  ],
  "people": [
    {{"full_name": "<nom>", "role": "<un rôle>", "title": "<titre ou null>", "excerpt": "<citation exacte>"}}
  ],
  "unknowns": [
    {{"field": "<champ manquant>", "question": "<question à poser>"}}
  ],
  "confirmation_level": "confirme_par_le_client|rapporte|hypothese"
}}

`statements`, `people` et `unknowns` peuvent être des listes VIDES — jamais
remplies pour remplir le format."""


def build_user_prompt(text: str, source_kind: str) -> str:
    label = "un e-mail" if source_kind == "email" else "un brief collé"
    return f"""Voici {label}.
--- DÉBUT DU TEXTE ---
{text}
--- FIN DU TEXTE ---

Rends les énoncés, les personnes et les inconnues que ce texte porte."""
