"""CACHE-LLM (Louis 15/10) — le cache de RÉPONSE des appels LLM NEUTRES.

─────────────────────────────────────────────────────────────────────────────
LA DEMANDE
─────────────────────────────────────────────────────────────────────────────
« Du cache sur Mistral et Anthropic — le contexte fait que c'est souvent
personnalisé, mais souvent des appels (ou des parties) sont neutres. » Trois
classes d'appels (inventaire complet : description de la PR CACHE-LLM) :

* **A — NEUTRE** : la sortie ne dépend que d'une entrée publique ou d'un
  document. Sa RÉPONSE se garde, ici, COMMUNE à tous les espaces.
* **B — MIXTE** : préfixe stable + partie personnalisée. Jamais de cache de
  réponse ; le préfixe stable est mis en tête et marqué ``cache_control``
  (cache de PROMPT du fournisseur, ``claude_service._cached_system``).
* **C — PRIVÉ** : chat, brouillons, corps de messages, notes. Jamais de cache
  de réponse — :data:`PRIVATE_ROLES` les nomme pour que la garde le prouve.

─────────────────────────────────────────────────────────────────────────────
LES RÈGLES
─────────────────────────────────────────────────────────────────────────────
* **Liste blanche explicite** (:data:`RESPONSE_CACHE_ALLOWLIST`) : un appel
  n'entre dans ce cache que s'il le DEMANDE (``response_cache=True``) ET que
  son rôle y figure avec la raison de sa neutralité. Un rôle absent lève —
  jamais un repli silencieux sur « pas de cache », qui cacherait l'erreur.
* **Commun à tout le monde** : la clé ne porte NI espace NI utilisateur (pas de
  GA-43 ici, Louis 15/10) — seulement ``(fournisseur, modèle, empreinte du
  prompt, entrée normalisée, paramètres qui changent la sortie)``. Un fichier
  se clé par l'empreinte SHA-256 de son CONTENU.
* **L'empreinte du prompt** est celle des prompts golden
  (``prompts.registry._content_hash``), calculée sur le texte RÉELLEMENT
  envoyé : un prompt modifié change la clé, l'ancienne entrée n'est plus lue.
* **Jamais écrit** si l'appel a échoué (exception), a été tronqué
  (``stop_reason == "max_tokens"``), ou si la sortie n'a pas passé sa
  validation (texte vide, JSON qui n'est pas un objet non vide, schéma).
* **Effacement RGPD (c67)** : aucun appel qui traite une PERSONNE n'est en liste
  blanche (CV, organigramme, contacts, justificatifs, missions, voix) — une
  sortie qui contiendrait une personne effacée ne peut donc pas être resservie.
* **Stockage** : celui de ``provider_cache`` (Redis L1 + Postgres L2), espace de
  noms ``llm:<rôle>``, TTL ``CACHE_TTL_LLM_S`` (30 j). Best-effort : sans
  cache branché, l'appel part, à l'identique.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections.abc import Mapping
from typing import Any

from app.services import provider_cache

logger = logging.getLogger(__name__)

CACHE_TTL_LLM_S = provider_cache.TTL_LLM

_NAMESPACE = "llm:"

#: Statuts de la ligne de mesure « llm <rôle> cache_réponse=… ».
STATUS_HIT = "hit"
STATUS_MISS = "miss"
STATUS_EXCLUDED = "exclu"

#: Classe A — rôle (``prompt_name``) → POURQUOI sa sortie est neutre. La raison
#: est obligatoire (garde) : ajouter un rôle ici, c'est écrire qu'il ne lit
#: aucune donnée privée d'un espace et ne traite aucune personne.
RESPONSE_CACHE_ALLOWLIST: Mapping[str, str] = {
    "bellum_search_entity_extract": (
        "Extrait un NOM D'ENTREPRISE d'une phrase de recherche. La sortie ne dépend que du texte "
        "tapé, et ne contient qu'un nom de société — jamais une personne."
    ),
    "bellum_esn_prefill": (
        "Déduit offres / secteurs / métiers d'une ESN depuis son identité publique (registre), des "
        "extraits web publics et sa stack détectée, contre des catalogues fermés. Aucune donnée d'espace."
    ),
    "bellum_vocabulary_builder": (
        "Étiquette le vocabulaire d'un compte (terme, type, sens) depuis des sources PUBLIQUES "
        "collectées sur l'entreprise. Aucune donnée d'espace, aucune personne."
    ),
    "public_document_text": (
        "Lecture (OCR / PDF) d'un document d'APPEL D'OFFRES — un document public de marché, clé par "
        "l'empreinte SHA-256 de son contenu. Les documents qui portent des personnes (CV, "
        "organigramme, justificatif, mission) ne passent jamais par ici."
    ),
}

#: Classe C — rôles qui lisent des données PRIVÉES d'un espace (ou des
#: personnes) et ne doivent JAMAIS passer par ce cache. Lue par la garde
#: ``test_llm_response_cache`` : l'intersection avec la liste blanche est vide.
PRIVATE_ROLES: frozenset[str] = frozenset(
    {
        "bellum_chat",
        "bellum_chat_fast",
        "bellum_chat_deep",
        "bellum_chat_title",
        "bellum_meeting_notes",
        "bellum_onboarding_reformulate",
        "bellum_mail_reply",
        "bellum_outreach",
        "bellum_icebreaker",
        "bellum_weekly",
        "bellum_activity",
        "bellum_summary",
        "bellum_cv",
        "bellum_cv_parse",
        "bellum_org_declare",
        "bellum_organigramme",
        "bellum_contacts_fallback",
        "expense_receipt_extract",
        "mission_extract",
        "need_compile_text",
        "bellum_profiler",
        "vision_region_locate",
        "vision_object_locate",
        "rag_knowledge_rerank",
        "internal_knowledge_digest",
        "image_text_extraction",
        "pdf_text_extraction",
    }
)


def is_allowed(role: str) -> bool:
    return role in RESPONSE_CACHE_ALLOWLIST and role not in PRIVATE_ROLES


def require_allowed(role: str) -> None:
    """Lève si ``role`` n'est pas un appel de classe A déclaré."""
    if not is_allowed(role):
        raise ValueError(
            f"Cache de réponse refusé pour « {role} » : absent de la liste blanche des appels neutres "
            "(llm_response_cache.RESPONSE_CACHE_ALLOWLIST)."
        )


_SPACES = re.compile(r"\s+")


def normalize_input(text: str) -> str:
    """L'entrée telle qu'elle entre dans la clé : espaces repliés, bords coupés.
    La casse est GARDÉE — « ACME » et « acme » ne sont pas garantis de rendre la
    même sortie."""
    return _SPACES.sub(" ", text or "").strip()


def prompt_fingerprint(text: str) -> str:
    """L'empreinte des prompts golden, sur le texte réellement envoyé."""
    from app.prompts.registry import _content_hash  # import paresseux : le registre importe les prompts

    return _content_hash(text or "")


def _digest(parts: Mapping[str, Any]) -> str:
    canonical = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def response_key(*, provider: str, model: str, system_prompt: str, user_input: str, params: Mapping[str, Any]) -> str:
    """Clé d'un appel texte : aucun espace, aucun utilisateur, aucune corrélation."""
    return _digest(
        {
            "provider": provider,
            "model": model,
            "prompt": prompt_fingerprint(system_prompt),
            "input": hashlib.sha256(normalize_input(user_input).encode("utf-8")).hexdigest(),
            "params": dict(params),
        }
    )


def file_key(*, content: bytes, pipeline: Mapping[str, Any]) -> str:
    """Clé d'un fichier : l'empreinte SHA-256 du CONTENU + ce qui le lit
    (fournisseurs, modèles, empreinte de consigne). Jamais le nom du fichier."""
    return _digest({"sha256": hashlib.sha256(content).hexdigest(), "pipeline": dict(pipeline)})


async def lookup(role: str, key: str) -> Any | None:
    """La sortie gardée, ou ``None``. Best-effort : une panne de cache = un miss."""
    require_allowed(role)
    try:
        entry = await provider_cache.get_json(_NAMESPACE + role, key)
    except Exception as exc:  # noqa: BLE001 — le cache ne casse jamais un appel
        logger.debug("Cache de réponse LLM illisible (%s) : %s", role, type(exc).__name__)
        return None
    if isinstance(entry, dict) and "v" in entry:
        return entry["v"]
    return None


async def store(role: str, key: str, value: Any) -> None:
    """Écrit une sortie DÉJÀ validée par l'appelant (JSON-sérialisable)."""
    require_allowed(role)
    if value is None:
        return
    try:
        await provider_cache.set_json(_NAMESPACE + role, key, {"v": value}, CACHE_TTL_LLM_S)
    except Exception as exc:  # noqa: BLE001 — le cache ne casse jamais un appel
        logger.debug("Cache de réponse LLM non écrit (%s) : %s", role, type(exc).__name__)


def log_line(role: str, status: str, cache_read: int = 0, cache_written: int = 0) -> None:
    """La ligne de mesure d'UN appel LLM — aucun contenu, aucune donnée personnelle."""
    logger.info("llm %s cache_réponse=%s cache_prompt_lu=%d écrit=%d", role, status, cache_read, cache_written)
