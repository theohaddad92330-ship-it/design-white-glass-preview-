"""GA-21 — toute réponse construite sur le magasin porte ses `doc_id`.

La garde du §38 (M5). Ce qu'elle empêche est nommé dans le tome : « la citation
implicite » — une réponse bâtie sur trois documents qui ne dit pas lesquels, et
qu'aucun commercial ne peut donc vérifier avant de la répéter à un client.

⚠️ Elle est écrite en PYTHON et non en TypeScript, parce que c'est le service IA
qui compose la réponse. Une garde côté web ne verrait que ce que le serveur a
bien voulu envoyer.
"""

from __future__ import annotations

import inspect
from pathlib import Path

from app.prompts import context_transparency
from app.services import rag_service

_APP = Path(__file__).resolve().parent.parent / "app"

#: La nature que porte une source issue du magasin de connaissance, telle
#: qu'elle s'écrit dans le code — avec ses guillemets.
#:
#: ⚠️ Chercher `knowledge_doc` nu attraperait `knowledge_docs`, le nom du
#: PARAMÈTRE qui transporte les documents (`routers/chat.py`,
#: `services/rag_service.py`) : la garde accuserait deux fichiers qui ne
#: fabriquent aucune source, et on la relâcherait jusqu'à ce qu'elle ne dise
#: plus rien. Une garde qui crie faux se fait désarmer.
_KNOWLEDGE_SOURCE_KIND = "knowledge_doc"
_KIND_LITERALS = (f'"{_KNOWLEDGE_SOURCE_KIND}"', f"'{_KNOWLEDGE_SOURCE_KIND}'")

#: Le seul fichier autorisé à FABRIQUER une source de connaissance.
_THE_ONE_DOOR = "prompts/context_transparency.py"


def _python_sources() -> list[Path]:
    return sorted(p for p in _APP.rglob("*.py") if "__pycache__" not in p.parts)


def _source_builders() -> list[str]:
    """Les fichiers qui ÉCRIVENT la nature d'une source de connaissance."""
    return [
        p.relative_to(_APP).as_posix()
        for p in _python_sources()
        if any(lit in p.read_text(encoding="utf-8") for lit in _KIND_LITERALS)
    ]


def test_the_guard_reads_a_corpus_that_is_not_empty():
    """Le témoin. Une garde qui balaye zéro fichier est verte pour toujours —
    ce dépôt en a eu six en deux jours."""
    files = _python_sources()
    assert len(files) > 50, f"corpus suspect : {len(files)} fichiers balayés"
    assert _source_builders(), (
        f"aucune occurrence de « {_KNOWLEDGE_SOURCE_KIND} » — la garde ne surveille rien"
    )


def test_only_one_place_builds_a_knowledge_source():
    """Ce qui rend les tests unitaires ci-dessous SUFFISANTS.

    Les trois assertions qui suivent portent sur `_sources_from_docs`. Elles ne
    prouvent la règle « toute réponse RAG porte ses `doc_id` » que s'il n'existe
    aucune AUTRE fabrique de source de connaissance : un second endroit qui
    composerait `{"kind": "knowledge_doc", …}` à la main pourrait oublier
    l'identifiant, et cette garde resterait verte — c'est exactement la forme de
    garde borgne que le dépôt s'interdit.

    On ne surveille donc pas seulement le comportement de la porte, on surveille
    qu'il n'y en ait qu'UNE.
    """
    builders = _source_builders()
    assert builders == [_THE_ONE_DOOR], (
        "une source de connaissance se fabrique à un seul endroit ; trouvée dans : "
        + ", ".join(builders)
    )


def test_a_used_source_always_carries_its_identifier():
    sources = context_transparency._sources_from_docs(
        [
            {"id": "doc-1", "title": "Playbook", "content": "…"},
            {"id": "doc-2", "title": "Objections", "content": "…"},
        ]
    )
    assert [s["doc_id"] for s in sources] == ["doc-1", "doc-2"]


def test_the_formatter_returns_its_sources_and_not_only_a_string():
    """Le point de passage OBLIGÉ.

    Si quelqu'un revenait un jour à une fonction qui ne rend qu'une chaîne, la
    citation redeviendrait impossible sans relire la base — c'est-à-dire une
    requête de plus pour une information qu'on avait déjà en main.
    """
    signature = inspect.signature(rag_service.format_knowledge_context_with_sources)
    assert signature.return_annotation == "tuple[str, list[dict]]"


def test_every_source_field_the_interface_needs_is_present():
    _block, used = rag_service.format_knowledge_context_with_sources(
        [{"id": "1", "title": "A", "content": "z", "similarity": 1, "category": "winning_angle"}]
    )
    assert set(used[0]) == {"docId", "title", "category", "origin"}
