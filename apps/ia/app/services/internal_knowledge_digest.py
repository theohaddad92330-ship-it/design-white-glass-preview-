"""#3586 (lot W2) — le DIGEST du Drive interne Bellum, pour les surfaces sans RAG.

Le lot W1 (``rag_knowledge.py``) injecte le savoir PERTINENT à une requête dans
l'analyse, le plan, Laura et Découvrir. Les ~20 autres surfaces commerciales
(message, scorer, icebreaker, battlecard…) n'ont pas de requête à vectoriser :
elles reçoivent une SYNTHÈSE statique du Drive (méthode ESN, taxonomie des
métiers et des rôles, règles de prospection, ton), ≤ 2 500 jetons.

Trois arbitrages, et leur raison :

* **Préfixé, en tête du system prompt.** Le system prompt est mis en cache
  (``_cached_system``) ; un bloc identique d'un appel à l'autre, posé AVANT le
  reste, entre dans le même préfixe de cache que le prompt de la surface. Il ne
  porte donc AUCUN horodatage ni compteur : un octet qui bouge à chaque appel
  casserait le cache de toutes les surfaces à la fois.
* **Opt-in explicite par surface** (``call_claude(..., domain_knowledge=True)``).
  Les utilitaires (titre de conversation, OCR, extraction de dépense ou de
  mission, classification…) ne paient pas 2 500 jetons d'entrée pour un savoir
  qui ne change rien à leur sortie.
* **Absent ou illisible ⇒ prompt byte-identique, zéro exception.** Pas de Drive
  branché = pas de digest = aucune surface ne bouge (no-op strict, comme toute
  intégration optionnelle du dépôt). Une panne de base ne fait jamais tomber un
  appel modèle : elle le rend tel qu'il était avant ce lot.

Le digest est ÉCRIT par l'API (``internal_knowledge_digests``, ancienne version
archivée, jamais supprimée), qui appelle ``generate_internal_knowledge_digest``
en fin de synchro quand l'empreinte des fichiers a changé. Ce module ne fait que
le PRODUIRE (un appel Claude) et le LIRE (cache mémoire 10 min).
"""

from __future__ import annotations

import logging
import os
import re
import time

from app.services.claude_service import call_claude
from app.services.kill_switch import INTERNAL_KNOWLEDGE_DIGEST_KILL_SWITCH, disabled
from app.services.model_policy import model_for
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

DIGEST_TABLE = "internal_knowledge_digests"
DRIVE_CHUNK_TYPE = "DRIVE_INTERNE"
DIGEST_BLOCK_TITLE = "## Savoir métier Bellum (interne)"

#: ≈ 2 500 jetons de français (~4 caractères/jeton). Borne DURE appliquée après
#: la génération : la consigne au modèle ne suffit pas à tenir un budget.
MAX_DIGEST_CHARS = 10_000

#: TTL du cache de lecture — le même pas que la synchro du Drive (10 min).
CACHE_TTL_S = 600.0

#: Plafond du corpus envoyé à la génération (~75 000 jetons). Au-delà, les
#: chunks sont pris dans l'ordre des chemins Drive et la fin est coupée.
_DEFAULT_INPUT_CHARS = 300_000
_MAX_CHUNKS_READ = 5_000

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
_PHONE_FR = re.compile(r"(?<![\d+])(?:\+33|0033|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}(?!\d)")
_PHONE_INTL = re.compile(r"\+\d{1,3}(?:[\s.-]?\d){8,12}(?!\d)")

_cache: tuple[float, str] | None = None


def _now() -> float:
    return time.monotonic()


def reset_domain_knowledge_cache() -> None:
    """Vide le cache de lecture (tests, et après une régénération connue)."""
    global _cache
    _cache = None


def _disabled() -> bool:
    # Registre : GA-84 (``kill_switch.py``, capacité ``knowledge.internal_digest``).
    return disabled(INTERNAL_KNOWLEDGE_DIGEST_KILL_SWITCH)


def prefix_domain_knowledge(system_prompt: str, block: str) -> str:
    """Le bloc EN TÊTE du system prompt ; bloc vide ⇒ prompt rendu tel quel."""
    text = (block or "").strip()
    if not text:
        return system_prompt
    return f"{DIGEST_BLOCK_TITLE}\n\n{text}\n\n---\n\n{system_prompt}"


async def _read_current_digest() -> str:
    sb = get_supabase()
    res = (
        await sb.table(DIGEST_TABLE)
        .select("content")
        .is_("archived_at", "null")
        .order("created_at", ascending=False)
        .limit(1)
        .aexecute()
    )
    rows = res.data
    # Forme stricte : une ligne dict dont `content` est une chaîne, sinon rien
    # (un double de test ou une réponse inattendue ne s'imprime jamais dans un prompt).
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return ""
    content = rows[0].get("content")
    return content.strip() if isinstance(content, str) else ""


async def get_domain_knowledge_block() -> str:
    """Le digest courant, ou ``""`` — jamais d'exception.

    Le résultat (vide compris) est gardé 10 min : une base en panne n'est pas
    re-sollicitée à chaque appel modèle, et un digest régénéré est servi au plus
    tard au passage de synchro suivant."""
    global _cache
    if _disabled():
        return ""
    now = _now()
    if _cache is not None and now - _cache[0] < CACHE_TTL_S:
        return _cache[1]
    try:
        content = await _read_current_digest()
    except Exception as exc:  # noqa: BLE001 — une panne de lecture ne casse jamais l'appel modèle
        logger.warning("internal-knowledge: digest illisible, prompt inchangé (%s)", type(exc).__name__)
        content = ""
    _cache = (now, content)
    return content


async def with_domain_knowledge(system_prompt: str) -> str:
    """``system_prompt`` préfixé du digest — ou byte-identique sans digest."""
    try:
        block = await get_domain_knowledge_block()
    except Exception:  # noqa: BLE001 — ceinture : rien ne remonte d'ici
        return system_prompt
    return prefix_domain_knowledge(system_prompt, block)


# ── Génération (appelée par l'API en fin de synchro) ──────────────────────────

_DIGEST_SYSTEM = """Tu rédiges le SAVOIR MÉTIER de Bellum, un copilote commercial pour ESN \
(entreprises de services numériques). On te donne le contenu du Drive interne de l'équipe.

Produis une synthèse en français, en Markdown sobre (titres ###, puces), qui sera lue par \
d'autres assistants avant chacune de leurs tâches commerciales. Couvre, quand le Drive en parle :
1. La méthode commerciale ESN (cycle de vente, qualification d'un besoin, régie / forfait, \
référencement, achats).
2. La taxonomie des métiers et des rôles (qui décide, qui prescrit, qui achète, vocabulaire).
3. Les règles de prospection (ce qu'on fait, ce qu'on ne fait jamais, cadence, canaux).
4. Le ton et le style des messages.

Règles STRICTES :
- 2 000 mots au maximum. Dense, factuel, sans introduction ni conclusion.
- Aucun nom de personne, aucune adresse e-mail, aucun numéro de téléphone, aucun nom de client.
- Aucune date, aucun chiffre daté, aucune mention « mis à jour le » : le texte doit rester \
valable tel quel.
- N'invente rien : ce qui n'est pas dans le Drive n'apparaît pas.
- Rends uniquement la synthèse, sans préambule."""


def _mask(text: str) -> str:
    return _PHONE_INTL.sub("[téléphone]", _PHONE_FR.sub("[téléphone]", _EMAIL.sub("[email]", text)))


def _bound(text: str, limit: int = MAX_DIGEST_CHARS) -> str:
    """Coupe à ``limit`` caractères, sur une fin de paragraphe quand il y en a une."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    para = cut.rfind("\n\n")
    if para > limit // 2:
        cut = cut[:para]
    return cut.rstrip()


def _input_budget() -> int:
    raw = os.environ.get("INTERNAL_KNOWLEDGE_DIGEST_INPUT_CHARS", "").strip()
    try:
        value = int(raw) if raw else _DEFAULT_INPUT_CHARS
    except ValueError:
        value = _DEFAULT_INPUT_CHARS
    return max(10_000, value)


async def _read_drive_chunks() -> list[dict]:
    sb = get_supabase()
    res = (
        await sb.table("dataforge_rag_chunks")
        .select("titre, drive_path, texte")
        .eq("type_chunk", DRIVE_CHUNK_TYPE)
        .is_("archived_at", "null")
        .order("chunk_id", ascending=True)
        .limit(_MAX_CHUNKS_READ)
        .aexecute()
    )
    return list(res.data or [])


async def generate_internal_knowledge_digest() -> dict:
    """UN appel Claude sur les chunks ``DRIVE_INTERNE`` vivants.

    Rend ``{"digest": str | None, "source_chunks": int, "input_chars": int}``.
    Aucun chunk ⇒ ``digest = None`` et AUCUN appel modèle. Le texte rendu est
    masqué (e-mails, téléphones) et borné à ``MAX_DIGEST_CHARS``. Les erreurs
    remontent à l'appelant (le routeur les rend en ``success: false``)."""
    rows = await _read_drive_chunks()
    budget = _input_budget()
    parts: list[str] = []
    used = 0
    for row in rows:
        texte = str(row.get("texte") or "").strip()
        if not texte:
            continue
        piece = f"### {row.get('drive_path') or row.get('titre') or 'document'}\n{texte}"
        if used + len(piece) > budget:
            break
        parts.append(piece)
        used += len(piece)
    if not parts:
        return {"digest": None, "source_chunks": 0, "input_chars": 0}

    corpus = "\n\n".join(parts)
    answer, _usage = await call_claude(
        _DIGEST_SYSTEM,
        f"Contenu du Drive interne :\n\n{corpus}",
        response_model=None,
        max_tokens=4000,
        prompt_name="internal_knowledge_digest",
        model=model_for("internal_knowledge_digest"),
        # Un appel par changement du Drive : rien ne relira ce prompt dans la fenêtre de cache.
        cache_system=False,
    )
    digest = _bound(_mask(str(answer or "").strip()))
    return {"digest": digest or None, "source_chunks": len(parts), "input_chars": len(corpus)}
