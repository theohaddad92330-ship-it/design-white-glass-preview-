"""L'IA n'écrit que dans les tables dont elle est PROPRIÉTAIRE.

L'interdit n°4 du socle : « écrire en base depuis apps/ia ». Il n'est pas
absolu — l'IA produit des documents RAG, tient le fil du copilote et pose les
points de reprise de son graphe. Ce qu'elle ne doit pas faire, c'est écrire dans
un objet COMMERCIAL : l'API seule sait qui a le droit d'écrire, quoi tracer et
quoi notifier. Deux écrivains sur la même colonne, c'est deux vérités.

Le défaut trouvé le 22/08 : ``/scorer/recalculate`` persistait
``accounts.priority_score`` — et le faisait en silence, un ``except`` repliant
l'échec en ``warning``. L'endpoint n'avait aucun appelant, donc rien ne l'a
jamais montré.
"""

from __future__ import annotations

import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"

#: Ce que l'IA PRODUIT, et dont elle est donc légitimement propriétaire.
OWNED_TABLES = {
    "rag_documents",
    "chat_messages",
    "chat_conversations",
    # ORION V12 (31/08/2026) — même exception que `rag_documents`, pour la
    # même colonne : `dataforge_rag_chunks.py` n'écrit QUE `embedding`, jamais
    # le contenu métier (texte, statut, anomalie…), qui arrive exclusivement
    # par les scripts d'ingestion NestJS (`apps/api/src/scripts/ingest-orion-*`).
    "dataforge_rag_chunks",
    # #3750 — les MORCEAUX d'un `rag_documents` (onglet, diapositive, section) :
    # une projection DÉRIVÉE du document que l'IA écrit déjà, calculée par elle
    # seule (découpage + embeddings) à l'ingestion et au rattrapage. Aucun
    # contenu métier n'y entre qui ne soit déjà dans le document parent.
    "rag_document_chunks",
}

#: ``.table("nom").update(`` / ``.insert(`` / ``.upsert(`` / ``.delete(``
WRITE = re.compile(r'\.table\(\s*["\']([a-z_]+)["\']\s*\)((?:\s*\.\w+\([^)]*\))*?)\.(update|insert|upsert|delete)\(')


def _sources() -> list[Path]:
    return [path for path in APP.rglob("*.py") if "tests" not in path.parts]


def test_the_ia_never_writes_to_a_business_table() -> None:
    offenders: list[str] = []
    for path in _sources():
        text = path.read_text(encoding="utf-8")
        for match in WRITE.finditer(text):
            table = match.group(1)
            if table in OWNED_TABLES:
                continue
            line = text[: match.start()].count("\n") + 1
            offenders.append(f"{path.relative_to(APP.parent)}:{line} — {table}.{match.group(3)}()")

    assert not offenders, (
        "Le service IA écrit dans une table dont il n'est pas propriétaire.\n"
        "L'API sait qui a le droit d'écrire, quoi tracer et quoi notifier ; l'IA ne le sait pas.\n"
        "Rends la valeur à l'appelant, qui la persistera.\n\n" + "\n".join(f"  · {entry}" for entry in offenders)
    )


def test_the_guard_actually_reads_something() -> None:
    """Sans ceci, une expression régulière cassée passerait au vert pour toujours."""
    sources = _sources()
    assert len(sources) > 50
    corpus = "\n".join(path.read_text(encoding="utf-8") for path in sources)
    # Les écritures LÉGITIMES existent bien : la garde ne passe pas au vert
    # parce qu'elle ne trouve aucune écriture du tout.
    assert WRITE.search(corpus) is not None
