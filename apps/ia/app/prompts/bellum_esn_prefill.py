"""BELLUM-ESN-PREFILL — mapper le profil public d'une ESN vers le catalogue fermé
du questionnaire d'onboarding.

Le commercial tape le nom de son ESN ; les sources publiques (registre, Pappers,
web, stack technique) sont collectées puis résumées ici pour que Claude CHOISISSE
— jamais n'invente — les valeurs des champs non déductibles mécaniquement
(expertises, secteurs cibles, positionnement, modèle de staffing, types
d'entreprises visées).

Deux règles structurantes :

1. **Catalogue fermé fourni à l'exécution.** La liste des valeurs autorisées
   arrive dans la requête (``options``), envoyée par l'API NestJS depuis
   ``@bellum/contracts`` — elle n'est PAS dupliquée côté Python, ce qui interdit
   toute dérive TS/Python. Toute valeur hors catalogue est droppée après coup.
2. **Zéro donnée fictive** (règle projet). Sans élément de preuve dans le
   contexte fourni, le champ est OMIS — un questionnaire à moitié vide est le
   comportement attendu, pas un échec.
"""

from __future__ import annotations

import json

# Champs délégués au LLM. Les autres (nom, effectif, zone géo, domaine d'offre)
# sont dérivés de façon déterministe côté service — pas de LLM sur du factuel.
LLM_FIELD_KEYS: tuple[str, ...] = (
    "expertise_areas",
    "target_sectors",
    "positioning",
    "staffing_model",
    "target_company_types",
)

# Champs multi-valeurs (les autres attendent une chaîne unique).
MULTI_VALUE_KEYS: frozenset[str] = frozenset({"expertise_areas", "target_sectors", "target_company_types"})


def build_system_prompt() -> str:
    """Prompt système — invariant, aucune donnée de run injectée."""
    return """Tu es BELLUM-PREFILL. Mission : à partir d'informations PUBLIQUES sur une ESN \
(société de services numériques), pré-remplir son questionnaire de profil commercial.

RÈGLES ABSOLUES :
1. Tu ne CHOISIS que parmi les valeurs listées dans « VALEURS AUTORISÉES ». Une valeur \
doit être recopiée CARACTÈRE POUR CARACTÈRE, accents et parenthèses compris.
2. Tu n'INVENTES rien. Si le contexte fourni ne contient aucun élément de preuve pour un \
champ, tu OMETS entièrement ce champ. Un champ absent est un résultat correct et attendu.
3. Aucune connaissance externe : tu raisonnes UNIQUEMENT sur le contexte fourni \
(registre, objet social, extraits web, stack technique observée). Ce que tu « crois savoir » \
de cette société ne compte pas.
4. Pour chaque champ retenu tu fournis :
   - "confidence" : "high" (le contexte l'énonce explicitement), "medium" (déduction \
directe et solide, ex. objet social), "low" (indice faible / signal indirect).
   - "rationale" : UNE phrase courte (< 200 caractères) citant l'élément de preuve \
concret (« objet social : … », « site web : … », « NAF 62.02A »). Jamais de citation inventée.
5. Les champs multi-valeurs sont classés du plus certain au moins certain, 5 éléments \
maximum. Mieux vaut 2 valeurs sûres que 5 valeurs plausibles.

Réponds UNIQUEMENT en JSON valide, sans texte autour."""


def _format_options(options: dict[str, list[str]]) -> str:
    lines: list[str] = []
    for key in LLM_FIELD_KEYS:
        values = options.get(key) or []
        if not values:
            continue
        kind = "liste, max 5" if key in MULTI_VALUE_KEYS else "valeur unique"
        rendered = "\n".join(f"  - {value}" for value in values)
        lines.append(f"{key} ({kind}) :\n{rendered}")
    return "\n\n".join(lines)


def _format_section(title: str, body: str) -> str:
    return f"{title} :\n{body}" if body else f"{title} : (aucune donnée)"


def build_user_prompt(
    *,
    identity: dict,
    web_snippets: list[dict],
    tech_stack: list[str],
    options: dict[str, list[str]],
) -> str:
    """Prompt utilisateur — contexte collecté + catalogue fermé + schéma de sortie.

    ``identity`` regroupe les faits registre/Pappers (nom, NAF, objet social,
    effectif, ville…), ``web_snippets`` les extraits de recherche web
    (titre/url/description), ``tech_stack`` la stack réellement observée sur le
    site. Toute section vide est annoncée comme telle — le modèle doit voir
    l'absence de preuve, pas un trou silencieux.
    """
    identity_lines = "\n".join(f"- {label} : {value}" for label, value in identity.items() if value)
    snippet_lines = "\n".join(
        f"- {(hit.get('title') or '').strip()} — {(hit.get('url') or '').strip()}\n  "
        f"{(hit.get('description') or '').strip()[:400]}"
        for hit in web_snippets
        if hit.get("url")
    )
    stack_line = ", ".join(tech_stack)

    schema = json.dumps(
        {
            "fields": {
                "expertise_areas": {"value": ["<valeur autorisée>"], "confidence": "medium", "rationale": "<preuve>"},
                "positioning": {"value": "<valeur autorisée>", "confidence": "low", "rationale": "<preuve>"},
            }
        },
        ensure_ascii=False,
    )

    return f"""{_format_section("IDENTITÉ REGISTRE", identity_lines)}

{_format_section("EXTRAITS WEB", snippet_lines)}

{_format_section("STACK TECHNIQUE OBSERVÉE SUR LE SITE", stack_line)}

VALEURS AUTORISÉES (recopier à l'identique, aucune autre valeur n'est acceptée) :

{_format_options(options)}

Renvoie un objet JSON `fields` ne contenant QUE les champs que le contexte ci-dessus \
permet de fonder. Exemple de forme (les champs non fondés sont simplement absents) :
{schema}"""
