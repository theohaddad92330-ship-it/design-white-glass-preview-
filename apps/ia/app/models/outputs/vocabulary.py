"""AccountVocabulary — la « grille de lecture » par compte (Théo 2026-07-06).

Pour VINCI : Axians, ERP Codex, POSIT'V, Leonard, VINCI Energies, bruit « Da Vinci »…
Chaque terme = sens + importance commerciale + nature (entité / programme /
concurrent interne / outil-ERP / piège-bruit / angle / personne / acronyme).

Objet typé (comme Play / Cockpit) → fondation front + messages + chatbot + mémoire.
Voir agent_docs/knowledge-architecture.md. Le tag déterministe réutilise le
niveau-1 (entities relevance, competitors, truth_status) ; le prompt
AccountVocabularyBuilder (slice 2) enrichit meaning / commercialWhy."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

VOCAB_VERSION = "v1"

# Natures d'un terme du vocabulaire du groupe.
VOCAB_KINDS = (
    "entity",
    "program",
    "internal_competitor",
    "tool_erp",
    "trap_noise",
    "angle",
    "person",
    "acronym",
)


class VocabularyTerm(BaseModel):
    term: str = ""
    kind: str = "acronym"  # l'une des VOCAB_KINDS
    meaning: str = ""
    commercial_why: str = Field(alias="commercialWhy", default="")
    aliases: list[str] = []
    related_entity: str = Field(alias="relatedEntity", default="")
    truth_status: str = Field(alias="truthStatus", default="")
    source_refs: list[str] = Field(alias="sourceRefs", default=[])

    model_config = {"populate_by_name": True, "extra": "allow"}

    @field_validator("kind", mode="before")
    @classmethod
    def _coerce_kind(cls, value: object) -> str:
        """Coerce ``kind`` into a member of :data:`VOCAB_KINDS` — never raise.

        The LLM ``AccountVocabularyBuilder`` (slice 2) can emit a ``kind`` outside
        the 8 allowed natures — e.g. "regulation", "market", "product", "role".
        The API persists it verbatim into ``account_vocabulary.kind``, whose DB
        CHECK constraint (``account_vocabulary_kind_check``) then rejects the INSERT
        and aborts the WHOLE analysis (the QONTO incident, mis-surfaced as a
        truncated stream). A bad kind must DEGRADE to the safe fallback ``"acronym"``,
        never fail the run. Case/whitespace-insensitive so "Entity" / " ENTITY "
        map cleanly onto the canonical lowercase natures.
        """
        if not isinstance(value, str):
            return "acronym"
        normalised = value.strip().lower()
        return normalised if normalised in VOCAB_KINDS else "acronym"


class AccountVocabulary(BaseModel):
    terms: list[VocabularyTerm] = []
    version: str = VOCAB_VERSION

    model_config = {"populate_by_name": True, "extra": "allow"}
