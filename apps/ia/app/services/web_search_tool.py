"""#2721 — l'outil de recherche web de Laura : elle EXÉCUTE, elle n'explique plus.

Retour Loïc Inacio, call du 22/09/2026 : « Laura parle que de planification…
même si elle n'a pas d'outil, elle doit faire du scraping web — LE SCRAPING WEB
DOIT ÊTRE AUTORISÉ — comme une IA lambda, en mode websearch server et Brave
search. » Cas montré pendant le call : Laura demandée de trouver des
interlocuteurs chez Sopra répondait par des MÉTHODES, jamais par des contacts.

Mesuré (issue) : `CHAT_TOOLS` (`chat_tools.py`) listait ~52 outils, aucun
`web_search`/`brave`/`firecrawl`. Brave EXISTE déjà (`brave_search.py`) mais
n'était câblé qu'au pipeline d'analyse de compte (`phase1_research.py`,
`esn_prefill.py`) — jamais au chat. Ce module ne réinvente rien : il branche
`brave_search.search_web` (la primitive à requête libre ajoutée à côté de la
recherche templée de phase 1) sur le catalogue d'outils du chat.

Ce fichier vit à part de `chat_tools.py` (déjà ~5000 lignes), suivant le
patron le plus récent du dépôt (`app/services/compilers/opportunity_compiler.py`,
#2324) : `chat_tools.py` ne fait qu'ENREGISTRER (import + entrée dans
`CHAT_TOOLS` + une branche d'exécution), ce module assemble.

Doctrine tenue ici :
  - `c79_collecte_large_mais_propre` (décision Louis 21/09/2026, #2634.1) :
    Brave Search est une source AUTORISÉE (web public, aucune usurpation) —
    ce fichier ne rouvre rien, il branche ce qui l'était déjà.
  - **nos fournisseurs ne se nomment JAMAIS** — ni à l'écran, ni dans le
    contexte envoyé au modèle. Le mot « Brave » ne figure dans AUCUNE valeur
    renvoyée par `execute_web_search` : seuls titre, extrait et adresse en
    sortent (voir `test_chat_tools_web_search.py`, qui le vérifie).
  - **JAMAIS de donnée fictive. Échec API → erreur claire.** Une clé absente
    ou un appel qui échoue rend `{"error": ...}` — jamais un résultat inventé.
  - c'est une LECTURE : elle s'exécute directement, comme `get_account_briefing`
    ou `run_account_search` — pas de porte de confirmation (`WRITE_TOOL_NAMES`),
    puisqu'aucune écriture ni aucun message vers un tiers n'en sort
    (`c81_etape_sortante_attend_interne_part` : ce qui est purement interne
    s'exécute, ce qui atteint un humain attend).

#2450.10 (épopée #2882, LOT écrivain 28/09) — SOURCE TOMBÉE : GARDER, SIGNALER.
`brave_search._execute_query_uncached` dégrade DÉJÀ correctement sur un
402/429/timeout — elle rend `[]` pour la requête plutôt que de faire échouer
tout le tour, et journalise la perte via `source_health.record_degradation`
(le mécanisme construit pour le pipeline d'analyse de compte, réutilisé ici
tel quel, GA-26). Ce qui manquait : `[]` pour « la source est tombée » et `[]`
pour « rien sur le web » rendaient EXACTEMENT le même résultat à Laura — la
doctrine (#2450.10) exige de les distinguer. Cette fonction compare l'état de
`source_health` avant/après SON appel (jamais un `clear`, qui effacerait la
dégradation d'un outil précédent du même tour) et signale `coverage: "reduced"`
UNIQUEMENT quand une dégradation est apparue PENDANT cet appel précis — jamais
la RAISON interne ni le nom du fournisseur, qui ne quittent jamais ce module
(même garde que `execute_web_search` plus bas). Le remboursement (3ᵉ volet de
#2450.10) ne s'applique pas à cet outil : une lecture de chat sans coût n'a
rien à rembourser (`cost_credits` absent depuis l'origine) — le remboursement
nocturne des crédits débités à tort (`c78_remboursement_credits_nocturne`)
couvre déjà les runs PAYANTS (analyse de compte), hors périmètre de ce fichier.
"""

from __future__ import annotations

from typing import Any

from app.middleware.correlation_id import get_correlation_id
from app.services.source_health import get_degradations

WEB_SEARCH_TOOL: dict[str, Any] = {
    "name": "web_search",
    "description": (
        "Cherche sur le web PUBLIC pour une requête en langage naturel et renvoie des résultats "
        "RÉELS (titre, extrait, adresse) — jamais une marche à suivre ni un conseil pour chercher "
        "soi-même. À utiliser quand la question porte sur une information qui n'est PAS déjà "
        "couverte par un outil dédié de ce catalogue : une actualité, une page publique, un site "
        "officiel, un sujet général. Ne remplace PAS `find_accounts` (comptes du registre), "
        "`run_account_search` (recherche de comptes exécutée), `get_account_contacts` (contacts "
        "d'un compte déjà analysé) ni aucun autre outil qui lit le portefeuille — utilise ceux-là "
        "d'abord, `web_search` seulement quand aucun d'eux ne peut répondre. Pour une demande d'OFFRES "
        "(emploi, mission, annonce), c'est `search_job_offers` qui répond : `web_search` n'en est qu'un "
        "complément, nommé comme tel, jamais la seule source. Aucun résultat trouvé "
        "n'est jamais comblé par une invention : dis-le franchement plutôt que de deviner."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "La requête de recherche, en langage naturel ou en mots-clés.",
            }
        },
        "required": ["query"],
    },
}

# #3189.4 (rouvert, recette prod 29/09) / #3195 — le résultat d'un outil est la
# seule chose que le modèle relit APRÈS avoir cherché : « Où trouver les
# consultations de la SNCF ? » a reçu des PAGES et les a renvoyées à la personne
# (« tu trouveras … sur la page officielle »). Chaque résultat porte donc le
# geste suivant, jamais une impasse ni un renvoi.
_NEXT_STEP_WITH_RESULTS = (
    "Ces adresses sont tes SOURCES, pas la réponse : rends ce qu'elles contiennent (intitulés, "
    "dates, échéances) tel que les extraits le disent. Si les extraits ne suffisent pas, dis "
    "précisément ce qui manque et relance `web_search` avec une requête plus ciblée — jamais "
    "un renvoi de la personne vers ces pages ni vers d'autres sites."
)
# LOT (15/10) DATA-B.6 — plus de relance AUTOMATIQUE sur résultat vide : chaque `web_search` est
# payant, et une seconde requête devinée par le modèle brûle un crédit sans que personne l'ait
# demandé. Le modèle dit ce qui a été cherché, puis PROPOSE ; la personne décide.
_NEXT_STEP_NO_RESULT = (
    "Aucun résultat : dis ce que tu as cherché et que rien n'en est sorti (« non trouvé » n'est pas "
    "« n'existe pas »), puis propose en une phrase la suite (une requête plus ciblée, ou le registre "
    "avec `find_accounts`, signal `tender` pour les appels d'offres) et laisse la personne décider : "
    "ne lance PAS de nouvelle recherche toi-même. Jamais un renvoi vers un site à consulter."
)
_NEXT_STEP_ERROR = (
    "La recherche n'a pas pu aboutir : dis-le en une phrase, rends ce que tu sais déjà du dossier "
    "avec les outils du catalogue, et propose la meilleure alternative (`find_accounts`, ou "
    "réessayer plus tard) — jamais un renvoi vers un site à consulter."
)

# Combien de résultats une réponse de chat peut raisonnablement digérer — un
# tour de conversation n'est pas un export, et la source peut rendre jusqu'à
# vingt lignes pour une requête large.
_MAX_RESULTS = 8


async def execute_web_search(tool_input: dict[str, Any]) -> dict[str, Any]:
    """Exécute une recherche web pour le chat — lecture seule, aucun coût.

    `{"error": ...}` clair quand la requête est vide, la clé n'est pas posée,
    ou l'appel échoue — jamais de résultat inventé. Le nom du fournisseur ne
    voyage JAMAIS dans la réponse : seuls titre/description/adresse en sortent.

    #2450.10 — une source tombée PENDANT cet appel (quota, débit, timeout) ne
    fait pas échouer la recherche (déjà le cas, `search_web` rend `[]` pour la
    requête perdue) mais ne doit plus non plus se lire comme « rien trouvé » :
    `coverage: "reduced"` l'annonce, sans jamais dire NI la source NI la
    raison technique — voir le docblock de tête.
    """
    query = str(tool_input.get("query") or "").strip()
    if not query:
        return {"error": "Une requête est nécessaire pour chercher sur le web."}

    from app.services.brave_search import search_web

    correlation_id = get_correlation_id()
    degraded_before = len(get_degradations(correlation_id)) if correlation_id else 0

    try:
        hits = await search_web(query)
    except ValueError:
        # Clé absente : sans clé = no-op STRICT (env-reference.md). Zéro appel
        # réseau tenté au-delà de la vérification — on le DIT plutôt que de
        # laisser Laura deviner un résultat.
        return {
            "error": "La recherche web n'est pas configurée sur cet espace.",
            "next_step": _NEXT_STEP_ERROR,
        }
    except Exception:
        return {
            "error": "La recherche web a échoué. Réessaie, ou reformule la requête.",
            "next_step": _NEXT_STEP_ERROR,
        }

    result: dict[str, Any] = {
        "query": query,
        "results": [
            {"title": h.get("title", ""), "description": h.get("description", ""), "url": h.get("url", "")}
            for h in hits[:_MAX_RESULTS]
            if h.get("url")
        ],
    }
    result["next_step"] = _NEXT_STEP_WITH_RESULTS if result["results"] else _NEXT_STEP_NO_RESULT
    # Comparaison AVANT/APRÈS, jamais un `clear` : une dégradation posée par un
    # AUTRE outil plus tôt dans ce même tour ne doit pas s'attribuer à cette
    # recherche-ci.
    if correlation_id and len(get_degradations(correlation_id)) > degraded_before:
        result["coverage"] = "reduced"
        result["note"] = (
            "Couverture réduite : une partie de la recherche web n'a pas abouti, ces résultats peuvent être incomplets."
        )
    return result


__all__ = ["WEB_SEARCH_TOOL", "execute_web_search"]
