"""#2861 (#2437.2) — le niveau SOURCE des quatre niveaux de langue demandés
(membre/workspace/destinataire/source). Le lot g22 (26/09) avait fermé
DESTINATAIRE (`contacts.locale`) ; celui-ci ferme SOURCE : la langue
ORIGINALE d'un document déposé dans la base de connaissance, DÉCLARÉE au
dépôt (`RagController.ingest` → `POST /rag/ingest` → `rag_service.ingest`),
jamais détectée (doctrine « jamais de donnée fictive »).
"""

from __future__ import annotations

import pytest

from app.services import rag_service

ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
WS_A = "11111111-1111-1111-1111-111111111111"


class _Res:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error


class _InsertSpy:
    def __init__(self):
        self.inserted: list[dict] = []

    def table(self, name):
        spy = self

        class _T:
            def insert(self_inner, data):
                spy.inserted.append(data)

                class _E:
                    async def aexecute(self_e):
                        return _Res([{"id": "new"}])

                return _E()

        return _T()


@pytest.fixture
def insert_spy(monkeypatch):
    spy = _InsertSpy()
    monkeypatch.setattr(rag_service, "get_supabase", lambda: spy)

    async def _ws(user_id, workspace_id):
        return workspace_id

    async def _no_embedding(title, content):
        return None

    monkeypatch.setattr(rag_service, "_effective_workspace", _ws)
    monkeypatch.setattr(rag_service, "_maybe_generate_embedding", _no_embedding)
    return spy


@pytest.mark.parametrize("language", ["fr", "en", "de"])
async def test_ingest_writes_the_declared_language(insert_spy, language):
    await rag_service.ingest("t", "une note", "ref", ALICE, WS_A, language=language)
    assert insert_spy.inserted[0]["language"] == language


async def test_ingest_default_path_is_unchanged_language_omitted(insert_spy):
    """Byte-identique : un appelant qui ignore la langue n'écrit AUCUNE clé
    `language` — comportement inchangé, même arbitrage que `scope`/`account_id`."""
    await rag_service.ingest("t", "une note", "ref", ALICE, WS_A)
    assert "language" not in insert_spy.inserted[0]


@pytest.mark.parametrize("bad", ["", "xx", "FR", "fr-FR"])
async def test_ingest_ignores_a_language_outside_the_catalogue_never_guessed(insert_spy, bad):
    """Une valeur hors catalogue n'est PAS écrite telle quelle — elle serait
    invisible à `rag_documents_language_check` (contrainte SQL) sans ce filet,
    mais le principe est le même que `account_id` malformé : on ignore, on
    n'invente jamais une valeur proche."""
    await rag_service.ingest("t", "une note", "ref", ALICE, WS_A, language=bad)
    assert "language" not in insert_spy.inserted[0]
