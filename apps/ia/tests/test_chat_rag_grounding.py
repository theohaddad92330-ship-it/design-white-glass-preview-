"""RAG branché sur le chatbot — grounding par les docs de l'utilisateur (niveau 3)."""

from __future__ import annotations

import json

from app.prompts.bellum_advisor import build_system_prompt
from app.services import rag_service


def _terminal_event(text: str) -> dict:
    """`/chat/message` diffuse en SSE (LOT STREAM) — le dernier événement porte
    la MÊME forme que l'ancien corps JSON de cet endpoint."""
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def test_format_knowledge_context():
    docs = [{"title": "Playbook VINCI", "content": "Axians est la BU IT du groupe"}, {"title": "", "content": ""}]
    ctx = rag_service.format_knowledge_context(docs)
    assert "Playbook VINCI" in ctx and "Axians" in ctx
    # #1956 — le titre et l'extrait sont DANS l'encadrement de données non
    # fiables, pas seulement quelque part dans la chaîne.
    fenced = ctx.split("<rag_knowledge>", 1)[1].split("</rag_knowledge>", 1)[0]
    assert "Playbook VINCI" in fenced and "Axians" in fenced
    assert rag_service.format_knowledge_context([]) == ""


async def test_retrieve_degrades_on_error(monkeypatch):
    async def _boom(*a, **k):
        raise RuntimeError("db down")

    monkeypatch.setattr(rag_service, "query", _boom)
    assert await rag_service.retrieve_knowledge_context("q", "user-1") == ""


async def test_retrieve_skips_when_no_user_or_empty_query(monkeypatch):
    called = False

    async def _q(*a, **k):
        nonlocal called
        called = True
        return []

    monkeypatch.setattr(rag_service, "query", _q)
    assert await rag_service.retrieve_knowledge_context("q", "") == ""
    assert await rag_service.retrieve_knowledge_context("   ", "user-1") == ""
    assert called is False


async def test_retrieve_formats_hits(monkeypatch):
    async def _q(qt, uid, top_k=5, workspace_id=None, account_id=None):
        return [{"title": "T", "content": "contenu utile pour le compte"}]

    monkeypatch.setattr(rag_service, "query", _q)
    assert "contenu utile" in await rag_service.retrieve_knowledge_context("q", "user-1")


def test_advisor_prompt_injects_kb_only_when_present():
    with_kb = build_system_prompt({}, {}, "", "", "DOC: Axians = BU IT VINCI")
    assert "BASE DE CONNAISSANCE" in with_kb and "Axians = BU IT" in with_kb
    without = build_system_prompt({}, {}, "", "")
    assert "BASE DE CONNAISSANCE" not in without


def test_advisor_prompt_never_lets_an_internal_pack_be_cited():
    """#3881 bis (V13) — la règle au prompt, à côté du filtre de sortie
    (`rag_knowledge._inject`) : même si la question nomme « mémoire interne »
    ou « data forge », la source citée reste un document du client."""
    with_kb = build_system_prompt({}, {}, "", "", "DOC: Axians = BU IT VINCI")
    assert "RÈGLE DE SOURCE" in with_kb
    assert "document DU CLIENT" in with_kb
    without = build_system_prompt({}, {}, "", "")
    assert "RÈGLE DE SOURCE" not in without


def test_chat_prompt_caps_oversized_inputs_server_side():
    from app.prompts.bellum_advisor import build_system_prompt, build_user_prompt

    big = "x" * 50000
    # Ce que les ENTRÉES ajoutent, mesuré contre le même prompt aux entrées vides.
    # Compter les « x » du prompt ENTIER comptait aussi ceux de sa prose (103 le
    # 13/09/2026 : « excuses », « exact », « exception »…) : un bloc de texte
    # ajouté au prompt faisait tomber la garde sans qu'aucun plafond n'ait bougé.
    prose = build_system_prompt({}, {}, "", "", "").count("x")
    assert 0 < build_system_prompt({}, {}, big, "", "").count("x") - prose <= 4000  # contacts plafonnés
    assert 0 < build_system_prompt({}, {}, "", big, "").count("x") - prose <= 4000  # plan plafonné
    sys = build_system_prompt({}, {}, big, big, "")
    assert sys.count("x") - prose <= 8000  # contacts + plan, jamais 50000
    user = build_user_prompt("salut", [{"role": "user", "content": "y" * 50000}])
    assert user.count("y") <= 1300  # per-history-message content capped


def test_chat_endpoint_returns_error_flag_not_a_fake_reply(client, monkeypatch):
    # #16 : sur exception, success=False + message générique (pas l'exception brute).
    async def _boom(*a, **k):
        raise RuntimeError("secret db url leaked")

    async def _retrieve(*a, **k):
        return []

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _boom)
    monkeypatch.setattr(rag_service, "retrieve_knowledge_docs", _retrieve)
    res = client.post("/chat/message", json={"message": "salut", "user_id": "u"})
    assert res.status_code == 200
    body = _terminal_event(res.text)
    assert body["success"] is False
    assert "secret db url" not in body["data"]["reply"]  # pas de fuite d'exception


def test_plan_shared_context_injects_kb_only_when_present():
    from app.prompts.bellum_plan import build_plan_shared_context

    with_kb = build_plan_shared_context("VINCI", "analyse", "contacts", "", "DOC: Axians = BU IT")
    assert "BASE DE CONNAISSANCE" in with_kb and "Axians = BU IT" in with_kb
    without = build_plan_shared_context("VINCI", "analyse", "contacts")
    assert "BASE DE CONNAISSANCE" not in without


def test_chat_endpoint_grounds_the_prompt_with_rag(client, monkeypatch):
    captured: dict = {}

    # Outils ON par défaut : c'est l'orchestrateur qui reçoit le prompt système.
    # Le prompt lui-même est construit à l'identique par le routeur — c'est bien
    # lui qu'on vérifie ici.
    async def _call(system, user, **k):
        captured["system"] = system
        return ("réponse", [])

    # ⚠️ Le point de simulation a changé le 25/08. Le copilote refaisait à la main
    # les trois gestes de `retrieve_reranked_citations` — récupérer, formater,
    # tracer — en SAUTANT le reclassement, dont le seul consommateur était son
    # propre test. C'est maintenant `rag_service.query` qu'on simule : le
    # reclassement, le formatage et la trace passent par le vrai chemin, et le
    # test vérifie donc ce que le copilote reçoit RÉELLEMENT.
    async def _query(msg, uid, top_k=5, workspace_id=None, account_id=None):
        captured["retrieve_args"] = (msg, uid)
        return [{"id": "doc-1", "title": "Playbook VINCI", "content": "Axians = BU IT du groupe"}]

    async def _mark(*a, **k):
        return None

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    monkeypatch.setattr(rag_service, "query", _query)
    monkeypatch.setattr(rag_service, "mark_documents_used", _mark)
    res = client.post("/chat/message", json={"message": "parle-moi d'Axians", "user_id": "user-1"})
    assert res.status_code == 200
    body = _terminal_event(res.text)
    assert body["data"]["reply"] == "réponse"
    assert captured["retrieve_args"] == ("parle-moi d'Axians", "user-1")
    assert "Axians = BU IT du groupe" in captured["system"]  # KB reached the system prompt
    # #1956 — et il y arrive ENCADRÉ : le chemin réel (routeur → rerank →
    # formatage) porte l'enveloppe, pas seulement la fonction prise isolément.
    fenced = captured["system"].split("<rag_knowledge>", 1)[1].split("</rag_knowledge>", 1)[0]
    assert "Axians = BU IT du groupe" in fenced
    # The retrieved doc surfaces as a cited source in the transparency object.
    # La source porte son `doc_id` : c'est ce qui rend la citation CLIQUABLE (M5).
    # Elle ne l'avait pas tant que le copilote sautait le chemin de citation.
    # #1954.21/#1954.31 — `excerpt` porte l'extrait réel du contenu injecté.
    assert {
        "kind": "knowledge_doc",
        "label": "Playbook VINCI",
        "doc_id": "doc-1",
        "excerpt": "Axians = BU IT du groupe",
    } in body["data"]["context"]["sources"]


def test_chat_endpoint_resolves_a_named_account_when_the_thread_is_not_anchored(client, monkeypatch):
    """#3887 (lot V13, recette prod 08/10) — « espace entier », AUCUN compte ancré
    (pas d'`account_id` dans la requête) : une question qui NOMME un compte du
    portefeuille doit retrouver ses documents `account`, exactement comme un
    fil déjà ancré sur ce compte — sans que l'utilisateur ait eu à dire
    « mémoire interne » ou tout autre vocabulaire de fondateur."""
    from app.services import chat_tools

    captured: dict = {}

    async def _call(system, user, **k):
        return ("réponse", [])

    async def _named_like(company, user_id):
        return [{"id": "acc-sanofi", "company_name": "Sanofi"}] if "Sanofi" in company else []

    async def _query(msg, uid, top_k=5, workspace_id=None, account_id=None):
        captured["account_id"] = account_id
        return []

    async def _mark(*a, **k):
        return None

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    monkeypatch.setattr(chat_tools, "_accounts_named_like", _named_like)
    monkeypatch.setattr(rag_service, "query", _query)
    monkeypatch.setattr(rag_service, "mark_documents_used", _mark)

    res = client.post(
        "/chat/message",
        json={"message": "qu'est-ce qu'on sait déjà de Sanofi pour préparer mon approche", "user_id": "user-1"},
    )
    assert res.status_code == 200
    assert captured["account_id"] == "acc-sanofi"


def test_chat_endpoint_keeps_the_anchored_account_over_any_name_in_the_message(client, monkeypatch):
    """Un fil déjà ancré garde SON compte : la résolution par nom ne le
    concurrence jamais (`req.account_id or …`, jamais l'inverse)."""
    from app.services import chat_tools

    captured: dict = {}

    async def _call(system, user, **k):
        return ("réponse", [])

    async def _named_like(company, user_id):
        return [{"id": "acc-wrong", "company_name": "Sanofi"}]

    async def _query(msg, uid, top_k=5, workspace_id=None, account_id=None):
        captured["account_id"] = account_id
        return []

    async def _mark(*a, **k):
        return None

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    monkeypatch.setattr(chat_tools, "_accounts_named_like", _named_like)
    monkeypatch.setattr(rag_service, "query", _query)
    monkeypatch.setattr(rag_service, "mark_documents_used", _mark)

    res = client.post(
        "/chat/message",
        json={
            "message": "des nouvelles de Sanofi ?",
            "user_id": "user-1",
            "account_id": "acc-ancre",
        },
    )
    assert res.status_code == 200
    assert captured["account_id"] == "acc-ancre"
