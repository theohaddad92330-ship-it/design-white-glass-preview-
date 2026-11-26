"""#3586 (lot W2) — le digest du Drive interne, préfixé au system prompt des
surfaces commerciales sans RAG.

Ce qui est verrouillé ici :

* absent / erreur de lecture ⇒ prompt BYTE-IDENTIQUE, zéro exception ;
* le bloc est PRÉFIXÉ (en tête : il profite du ``cache_system`` existant) et
  STABLE d'un appel à l'autre — aucun horodatage dedans, sinon le cache casse ;
* cache mémoire de 10 min : la base n'est relue qu'à expiration ;
* ``call_claude`` n'injecte QUE sur opt-in explicite (``domain_knowledge=True``) ;
* la génération appelle Claude UNE fois, sur les seuls chunks ``DRIVE_INTERNE``
  vivants, et rend un texte borné, sans e-mail ni téléphone.
"""

from __future__ import annotations

import inspect
from pathlib import Path
from typing import Any

import pytest

from app.services import internal_knowledge_digest as ikd


class _Query:
    def __init__(self, fake: _FakeSupabase, table: str) -> None:
        self._fake = fake
        self.table = table
        self.filters: list[tuple[str, Any, Any]] = []

    def select(self, cols: str) -> _Query:
        self.filters.append(("select", cols, None))
        return self

    def eq(self, col: str, value: Any) -> _Query:
        self.filters.append(("eq", col, value))
        return self

    def is_(self, col: str, value: Any) -> _Query:
        self.filters.append(("is", col, value))
        return self

    def order(self, col: str, ascending: bool = True) -> _Query:
        self.filters.append(("order", col, ascending))
        return self

    def limit(self, n: int) -> _Query:
        self.filters.append(("limit", n, None))
        return self

    async def aexecute(self) -> Any:
        self._fake.queries.append(self)
        if self._fake.error:
            raise self._fake.error
        return type("R", (), {"data": self._fake.rows.get(self.table, []), "error": None})()


class _FakeSupabase:
    def __init__(self, rows: dict[str, list[dict]] | None = None, error: Exception | None = None) -> None:
        self.rows = rows or {}
        self.error = error
        self.queries: list[_Query] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)


DIGEST = "Méthode ESN : qualifier le besoin avant de pousser un profil.\n\nTon : direct, vouvoiement."


@pytest.fixture(autouse=True)
def _cache_vide():
    # État global de module : vidé avant ET après, sinon un test hérite du précédent.
    ikd.reset_domain_knowledge_cache()
    yield
    ikd.reset_domain_knowledge_cache()


# ── Préfixe : pur ─────────────────────────────────────────────────────────────


def test_bloc_vide_rend_le_prompt_byte_identique():
    assert ikd.prefix_domain_knowledge("SYSTEM ORIGINAL", "") == "SYSTEM ORIGINAL"
    assert ikd.prefix_domain_knowledge("SYSTEM ORIGINAL", "   \n") == "SYSTEM ORIGINAL"


def test_bloc_prefixe_en_tete_sous_son_titre():
    out = ikd.prefix_domain_knowledge("SYSTEM ORIGINAL", DIGEST)
    assert out.startswith("## Savoir métier Bellum (interne)\n")
    assert out.endswith("SYSTEM ORIGINAL")
    assert DIGEST in out


def test_le_prefixe_garde_le_marqueur_de_cache_du_prompt():
    from app.services.claude_service import CACHE_SEGMENT_BREAK

    system = f"STABLE{CACHE_SEGMENT_BREAK}VOLATILE"
    out = ikd.prefix_domain_knowledge(system, DIGEST)
    head, tail = out.split(CACHE_SEGMENT_BREAK)
    assert DIGEST in head and tail == "VOLATILE"


# ── Lecture : cache 10 min, jamais d'exception ────────────────────────────────


@pytest.mark.asyncio
async def test_lecture_en_erreur_rend_vide_sans_exception(monkeypatch):
    fake = _FakeSupabase(error=RuntimeError("base injoignable"))
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)

    assert await ikd.get_domain_knowledge_block() == ""
    assert await ikd.with_domain_knowledge("SYS") == "SYS"


@pytest.mark.asyncio
async def test_client_absent_rend_vide_sans_exception(monkeypatch):
    def _boom():
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    monkeypatch.setattr(ikd, "get_supabase", _boom)
    assert await ikd.with_domain_knowledge("SYS") == "SYS"


@pytest.mark.asyncio
async def test_aucun_digest_en_base_rend_le_prompt_identique(monkeypatch):
    fake = _FakeSupabase(rows={"internal_knowledge_digests": []})
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)
    assert await ikd.with_domain_knowledge("SYS") == "SYS"


@pytest.mark.asyncio
async def test_lit_le_digest_courant_non_archive(monkeypatch):
    fake = _FakeSupabase(rows={"internal_knowledge_digests": [{"content": DIGEST}]})
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)

    assert await ikd.get_domain_knowledge_block() == DIGEST
    q = fake.queries[0]
    assert q.table == "internal_knowledge_digests"
    assert ("is", "archived_at", "null") in q.filters


@pytest.mark.asyncio
async def test_cache_dix_minutes_puis_relecture(monkeypatch):
    fake = _FakeSupabase(rows={"internal_knowledge_digests": [{"content": DIGEST}]})
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)
    now = [1_000.0]
    monkeypatch.setattr(ikd, "_now", lambda: now[0])

    first = await ikd.with_domain_knowledge("SYS")
    now[0] += 599
    second = await ikd.with_domain_knowledge("SYS")
    assert len(fake.queries) == 1
    # Stable entre deux appels : pas d'horodatage dans le bloc, le cache Anthropic tient.
    assert first == second

    now[0] += 2
    await ikd.with_domain_knowledge("SYS")
    assert len(fake.queries) == 2


@pytest.mark.asyncio
async def test_interrupteur_operateur_coupe_toute_lecture(monkeypatch):
    fake = _FakeSupabase(rows={"internal_knowledge_digests": [{"content": DIGEST}]})
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)
    monkeypatch.setenv("INTERNAL_KNOWLEDGE_DIGEST_DISABLED", "true")

    assert await ikd.with_domain_knowledge("SYS") == "SYS"
    assert fake.queries == []


# ── call_claude : opt-in explicite ────────────────────────────────────────────


def _spy_gateway(monkeypatch) -> list[str]:
    seen: list[str] = []

    async def _complete(task, system_prompt, user_prompt, **kwargs):
        seen.append(system_prompt)
        return "ok", None

    import app.services.llm_gateway as gw

    monkeypatch.setattr(gw, "complete", _complete)
    return seen


@pytest.mark.asyncio
async def test_call_claude_sans_opt_in_n_injecte_rien(monkeypatch):
    from app.services.claude_service import call_claude

    fake = _FakeSupabase(rows={"internal_knowledge_digests": [{"content": DIGEST}]})
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)
    seen = _spy_gateway(monkeypatch)

    await call_claude("SYS", "USER", prompt_name="chat_title")
    assert seen == ["SYS"]
    assert fake.queries == []


@pytest.mark.asyncio
async def test_call_claude_avec_opt_in_prefixe_le_digest(monkeypatch):
    from app.services.claude_service import call_claude

    fake = _FakeSupabase(rows={"internal_knowledge_digests": [{"content": DIGEST}]})
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)
    seen = _spy_gateway(monkeypatch)

    await call_claude("SYS", "USER", prompt_name="bellum_outreach", domain_knowledge=True)
    assert seen[0].startswith("## Savoir métier Bellum (interne)")
    assert seen[0].endswith("SYS")


@pytest.mark.asyncio
async def test_call_claude_avec_opt_in_et_digest_absent_est_byte_identique(monkeypatch):
    from app.services.claude_service import call_claude

    fake = _FakeSupabase(error=RuntimeError("timeout"))
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)
    seen = _spy_gateway(monkeypatch)

    await call_claude("SYS", "USER", prompt_name="bellum_outreach", domain_knowledge=True)
    assert seen == ["SYS"]


# ── Génération : un appel Claude, corpus DRIVE_INTERNE vivant ─────────────────


@pytest.mark.asyncio
async def test_generation_sans_chunk_n_appelle_pas_claude(monkeypatch):
    fake = _FakeSupabase(rows={"dataforge_rag_chunks": []})
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)
    calls: list[Any] = []

    async def _claude(*a, **k):
        calls.append((a, k))
        return "x", None

    monkeypatch.setattr(ikd, "call_claude", _claude)
    result = await ikd.generate_internal_knowledge_digest()
    assert result["digest"] is None
    assert calls == []


@pytest.mark.asyncio
async def test_generation_un_appel_borne_et_masque(monkeypatch):
    rows = [
        {"titre": "Méthode", "drive_path": "Bellum / Méthode", "texte": "Qualifier le besoin."},
        {"titre": "Ton", "drive_path": "Bellum / Ton", "texte": "Vouvoiement."},
    ]
    fake = _FakeSupabase(rows={"dataforge_rag_chunks": rows})
    monkeypatch.setattr(ikd, "get_supabase", lambda: fake)
    calls: list[dict] = []
    long_answer = "Règle : écrire à jean.dupont@exemple.fr ou au 06 12 34 56 78.\n\n" + ("x" * 50 + "\n\n") * 400

    async def _claude(system, user, **kwargs):
        calls.append({"system": system, "user": user, **kwargs})
        return long_answer, None

    monkeypatch.setattr(ikd, "call_claude", _claude)
    result = await ikd.generate_internal_knowledge_digest()

    assert len(calls) == 1
    assert calls[0]["cache_system"] is False
    assert calls[0].get("domain_knowledge", False) is False
    assert "Qualifier le besoin." in calls[0]["user"] and "Vouvoiement." in calls[0]["user"]
    q = fake.queries[0]
    assert ("eq", "type_chunk", "DRIVE_INTERNE") in q.filters
    assert ("is", "archived_at", "null") in q.filters
    digest = result["digest"]
    assert digest and len(digest) <= ikd.MAX_DIGEST_CHARS
    assert "@" not in digest and "06 12" not in digest
    assert result["source_chunks"] == 2


# ── Périmètre : qui reçoit le digest, qui ne le reçoit jamais ─────────────────

_APP = Path(__file__).resolve().parent.parent / "app"

#: Les surfaces commerciales SANS RAG (le lot W1 sert les autres) — opt-in explicite.
_SURFACES_COMMERCIALES = {
    "routers/message.py": 1,
    "routers/scorer.py": 1,
    "routers/icebreaker.py": 1,
    "routers/battlecard.py": 1,
    "routers/compare.py": 1,
    "routers/summary.py": 1,
    "routers/weekly.py": 1,
    "routers/activity.py": 1,
    "routers/need_play.py": 1,
    "routers/project_synthesis.py": 1,
    "routers/phase2_contacts.py": 1,
    "routers/commercial_brief.py": 1,
    "routers/rfp.py": 2,
    "routers/content.py": 1,
    "routers/notes.py": 1,
    "services/esn_prefill.py": 1,
    "services/need_compile_text.py": 1,
    "services/grounding_citations.py": 2,
}

#: Les utilitaires : 2 500 jetons d'entrée qui ne changeraient rien à leur sortie.
_UTILITAIRES = [
    "routers/chat_title.py",
    "routers/cv.py",
    "routers/org_declare.py",
    "routers/onboarding_reformulate.py",
    "routers/mail_reply.py",
    "routers/search_entity.py",
    "services/classification.py",
    "services/expense_extraction.py",
    "services/mission_extraction.py",
    "services/document_text.py",
]


@pytest.mark.parametrize(("rel", "expected"), sorted(_SURFACES_COMMERCIALES.items()))
def test_chaque_surface_commerciale_opte_pour_le_digest(rel, expected):
    source = (_APP / rel).read_text()
    assert source.count("domain_knowledge=True") == expected, rel


@pytest.mark.parametrize("rel", _UTILITAIRES)
def test_aucun_utilitaire_ne_recoit_le_digest(rel):
    path = _APP / rel
    assert path.exists(), f"{rel} introuvable : la garde ne lirait rien"
    assert "domain_knowledge" not in path.read_text()


def test_le_system_prompt_de_laura_est_prefixe():
    source = (_APP / "services" / "chat_orchestrator.py").read_text()
    # LOT (15/10) DATA-C — le system de Laura prend le TTL 1 h ; le préfixe reste.
    assert '"system": _cached_system(await with_domain_knowledge(self._system_prompt), ttl=ONE_HOUR)' in source


def test_l_ocr_ne_recoit_pas_le_digest():
    from app.services import claude_service

    assert "domain_knowledge" not in inspect.signature(claude_service.call_claude_image_text).parameters
