"""#1949.23 — décision Louis 13/09 batch 12 : « Enregistrer anonymement
l'intention non reconnue ».

La règle levée, et pour ce seul usage
------------------------------------
La règle 2 de ``c64_analytique_produit`` (« aucun contenu ») interdisait de
garder ce qu'une personne a écrit. Louis la lève, CONTRE la recommandation,
pour la seule demande que Laura n'a pas su router, et assume le traitement
avant la relecture juridique RGPD — toujours due. Tout le reste de c64 tient.

Ce que fait ce module, et ce qu'il ne fait pas
----------------------------------------------
* Laura SIGNALE une demande par l'outil silencieux ``note_unrouted_request``
  (une catégorie, jamais un texte — ``chat_tools.NOTE_UNROUTED_REQUEST_TOOL``).
* Ce module transforme le signal en ``{"category", "text"}`` : le texte de la
  demande, MASQUÉ par les deux masquages existants (``redact_secrets`` —
  secrets, IBAN, adresses internes — puis ``redact_personal_data`` — e-mails,
  téléphones) et BORNÉ à :data:`UNROUTED_INTENT_TEXT_MAX_CHARS` caractères.
  L'ordre compte : le motif de téléphone mangerait sinon une partie d'un IBAN
  imprimé (« 0112 3456 78 » a la forme d'un numéro), et laisserait le reste.
* Il n'écrit RIEN. L'API écrit la trace, sans identité et jamais depuis une
  salle de démonstration (``apps/api/src/modules/laura-unrouted-intents``).

⚠️ RISQUE RÉSIDUEL, dit en clair : le masquage ne reconnaît pas un NOM de
personne ou de société écrit dans la demande. C'est le plancher de lecture
côté back-office (cinq occurrences distinctes, GA-267) qui l'empêche d'atteindre
un écran — pas ce module.
"""

from __future__ import annotations

from typing import Any

from app.services.langfuse_client import redact_personal_data
from app.services.secret_redaction import redact_secrets

#: Le nom de l'outil silencieux — un seul endroit, lu par l'outil, l'orchestrateur
#: et le routeur.
UNROUTED_INTENT_TOOL_NAME = "note_unrouted_request"

#: Les trois catégories — MIROIR de ``UNROUTED_INTENT_CATEGORIES`` dans
#: ``packages/contracts/src/schemas/laura-unrouted-intent.ts`` (relu par
#: ``tests/test_unrouted_intent.py``) et de la contrainte SQL côté API.
UNROUTED_INTENT_CATEGORIES: tuple[str, ...] = ("hors_perimetre", "capacite_absente", "intention_incomprise")

#: La borne du texte gardé — la même que la contrainte SQL côté API.
UNROUTED_INTENT_TEXT_MAX_CHARS = 300

#: Le statut qu'un signal porte dans ``actions`` : ni « fait », ni « à valider ».
NOTED_STATUS = "noted"


def mask_unrouted_text(message: str) -> str:
    """Le texte d'une demande, débarrassé de ce qui a la forme d'une donnée
    personnelle ou d'un secret. Secrets et IBAN D'ABORD, puis e-mails et
    téléphones — voir l'en-tête pour la raison de l'ordre."""
    return redact_personal_data(redact_secrets(message or ""))


def build_unrouted_intent(message: str, actions: list[dict[str, Any]]) -> dict[str, str] | None:
    """Le signal d'un tour, prêt à voyager vers l'API — ou ``None``.

    ``None`` sans signal, avec une catégorie inconnue, ou quand il ne reste
    rien de la demande une fois masquée : on n'écrit jamais une trace vide.
    Seules la catégorie et le texte sortent — aucun champ d'identité.
    """
    signal = next(
        (
            action
            for action in actions
            if action.get("tool") == UNROUTED_INTENT_TOOL_NAME and action.get("status") == NOTED_STATUS
        ),
        None,
    )
    if signal is None:
        return None
    category = (signal.get("input") or {}).get("category")
    if category not in UNROUTED_INTENT_CATEGORIES:
        return None
    # Une chaîne Python se découpe en POINTS DE CODE — ce que compte
    # `char_length` côté Postgres.
    text = mask_unrouted_text(message).strip()[:UNROUTED_INTENT_TEXT_MAX_CHARS]
    if not text:
        return None
    return {"category": str(category), "text": text}


def without_unrouted_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Les actions telles que le panneau de transparence les montre : sans le
    signal, qui n'est ni quelque chose de fait ni quelque chose à valider."""
    return [action for action in actions if action.get("tool") != UNROUTED_INTENT_TOOL_NAME]
