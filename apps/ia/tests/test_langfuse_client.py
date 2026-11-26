"""Observabilité LLM — client Langfuse minimal (traces, générations, spans).

Ce que ces tests tiennent, ce sont les trois contrats du dépôt appliqués à une
métrique de plus :

1. **Sans clés = no-op strict, ZÉRO réseau.** La paire ``LANGFUSE_PUBLIC_KEY``
   + ``LANGFUSE_SECRET_KEY`` est le seul interrupteur ; ``LANGFUSE_DISABLED``
   est le break-glass inverse (clés posées, envoi coupé sans les retirer).
2. **Une métrique ne casse jamais ce qu'elle mesure.** Aucune fonction du
   client ne lève, jamais — un POST d'ingestion qui échoue se jette, il ne se
   rejoue pas et ne bloque rien.
3. **Le contenu des prompts ne sort PAS par défaut.** Les prompts portent la
   donnée des comptes clients : seuls les tokens, le coût, le modèle et la
   latence partent. ``LANGFUSE_CAPTURE_CONTENT=true`` est l'opt-in explicite
   de l'opérateur, borné en taille.
"""

from __future__ import annotations

import pytest

from app.services import langfuse_client as lf


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    """Chaque test part d'un client vierge et SANS clés (l'hermeticité de la
    suite balaie déjà ``LANGFUSE_SECRET_KEY`` ; on retire aussi le reste)."""
    for var in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_HOST",
                "LANGFUSE_CAPTURE_CONTENT", "LANGFUSE_DISABLED"):
        monkeypatch.delenv(var, raising=False)
    lf._reset_for_tests()
    yield
    lf._reset_for_tests()


def _enable(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")


def _events():
    return lf._pending_events()


def _bodies(event_type: str) -> list[dict]:
    return [e["body"] for e in _events() if e["type"] == event_type]


# ── interrupteur ──────────────────────────────────────────────────────────────


def test_sans_cles_tout_est_un_no_op_strict(monkeypatch):
    # Pas de clés : rien ne s'active, rien ne s'enfile, aucun réseau possible.
    def _boom(*_a, **_kw):  # pragma: no cover - ne doit jamais être appelé
        raise AssertionError("aucun POST ne doit partir sans clés")

    monkeypatch.setattr(lf, "_post_batch", _boom)

    assert lf.enabled() is False
    lf.record_generation(name="bellum_facts", model="claude-sonnet-5", input_tokens=10, output_tokens=5)
    with lf.bind_trace("chat_turn", user_id="u1"):
        lf.record_generation(name="bellum_chat", model="claude-sonnet-5", input_tokens=1, output_tokens=1)
        with lf.span("tool:compare_accounts"):
            pass
    assert _events() == []
    lf.flush()  # file vide → aucun POST


def test_une_seule_cle_ne_suffit_pas(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    assert lf.enabled() is False


def test_le_kill_switch_coupe_meme_avec_les_cles(monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setenv("LANGFUSE_DISABLED", "true")
    assert lf.enabled() is False
    lf.record_generation(name="bellum_facts", model="claude-sonnet-5", input_tokens=10, output_tokens=5)
    assert _events() == []


# ── générations ───────────────────────────────────────────────────────────────


def test_une_generation_orpheline_cree_sa_propre_trace(monkeypatch):
    _enable(monkeypatch)
    lf.record_generation(
        name="bellum_icebreaker",
        model="claude-haiku-4-5",
        input_tokens=120,
        output_tokens=40,
        cache_read_tokens=8,
        cache_creation_tokens=2,
        cost_usd=0.0042,
        duration_s=1.5,
        correlation_id="cid-123",
    )

    traces = _bodies("trace-create")
    gens = _bodies("generation-create")
    assert len(traces) == 1 and len(gens) == 1
    assert traces[0]["name"] == "bellum_icebreaker"
    # La corrélation regroupe les traces d'un même run/d'une même requête.
    assert traces[0]["sessionId"] == "cid-123"
    gen = gens[0]
    assert gen["traceId"] == traces[0]["id"]
    assert gen["name"] == "bellum_icebreaker"
    assert gen["model"] == "claude-haiku-4-5"
    assert gen["usageDetails"]["input"] == 120
    assert gen["usageDetails"]["output"] == 40
    assert gen["usageDetails"]["cache_read_input_tokens"] == 8
    assert gen["usageDetails"]["cache_creation_input_tokens"] == 2
    assert gen["costDetails"]["total"] == 0.0042
    assert gen["metadata"]["correlationId"] == "cid-123"
    # La latence est portée par le couple start/end.
    assert gen["startTime"] < gen["endTime"]


def test_le_contenu_des_prompts_ne_sort_pas_par_defaut(monkeypatch):
    _enable(monkeypatch)
    lf.record_generation(
        name="bellum_facts",
        model="claude-sonnet-5",
        input_tokens=1,
        output_tokens=1,
        input_obj={"system": "données client confidentielles", "user": "ACME"},
        output_obj={"data": "résultat"},
    )
    gen = _bodies("generation-create")[0]
    assert "input" not in gen
    assert "output" not in gen


def test_l_opt_in_de_contenu_capture_et_borne(monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setenv("LANGFUSE_CAPTURE_CONTENT", "true")
    long_text = "x" * (lf._CONTENT_CAP_CHARS + 5000)
    lf.record_generation(
        name="bellum_facts",
        model="claude-sonnet-5",
        input_tokens=1,
        output_tokens=1,
        input_obj={"system": "sys", "user": long_text},
        output_obj="ok",
    )
    gen = _bodies("generation-create")[0]
    assert "sys" in gen["input"]
    assert len(gen["input"]) <= lf._CONTENT_CAP_CHARS
    assert gen["output"] == "ok"


def test_un_cout_inconnu_ne_devient_pas_zero(monkeypatch):
    # Même règle que le cost_ledger : « prix inconnu » ne se lit jamais « gratuit ».
    _enable(monkeypatch)
    lf.record_generation(name="bellum_facts", model="claude-sonnet-5", input_tokens=1, output_tokens=1)
    gen = _bodies("generation-create")[0]
    assert "costDetails" not in gen


# ── traces liées ──────────────────────────────────────────────────────────────


def test_bind_trace_est_paresseux_et_regroupe(monkeypatch):
    # Une trace SANS événement enfant n'est jamais émise (pas de bruit sur les
    # endpoints qui n'appellent aucun modèle).
    _enable(monkeypatch)
    with lf.bind_trace("chat_turn", user_id="u1", session_id="cid-9"):
        assert _events() == []
        lf.record_generation(name="bellum_chat", model="m", input_tokens=1, output_tokens=1)
        lf.record_generation(name="bellum_chat", model="m", input_tokens=1, output_tokens=1)

    traces = _bodies("trace-create")
    gens = _bodies("generation-create")
    assert len(traces) == 1  # une seule trace pour les deux générations
    assert traces[0]["name"] == "chat_turn"
    assert traces[0]["userId"] == "u1"
    assert traces[0]["sessionId"] == "cid-9"
    assert {g["traceId"] for g in gens} == {traces[0]["id"]}


# ── #2442.2 — trace_id dérivé du correlation-id, convention commune ───────────


def test_derive_trace_id_est_deterministe_sur_un_identifiant_hex():
    # Un correlation-id UUID (avec ou sans tirets) devient le trace_id Langfuse
    # SOUS LA MÊME FORME COMPACTE : un support qui tient la référence BLM-XXXXXXXX
    # (dérivée du même correlation-id — `observability-privacy.ts:supportReference`)
    # retrouve le run en cherchant CE trace_id, sans détour par `sessionId`.
    dashed = "3f2a1b4c-5d6e-7f80-9012-3456789abcde"
    compact = "3f2a1b4c5d6e7f8090123456789abcde"
    assert lf.derive_trace_id(dashed) == compact
    assert lf.derive_trace_id(compact) == compact
    assert lf.derive_trace_id(compact.upper()) == compact


def test_derive_trace_id_retombe_sur_un_hash_hors_forme_hex():
    # Un identifiant fourni par un appelant externe (pas un UUID) n'est JAMAIS
    # recopié en clair dans un id Langfuse : hashé, 32 hexadécimaux, stable.
    weird = "checkout-session-42"
    derived = lf.derive_trace_id(weird)
    assert derived != weird
    assert derived is not None
    assert len(derived) == 32
    assert all(c in "0123456789abcdef" for c in derived)
    assert lf.derive_trace_id(weird) == derived  # déterministe, pas un nouveau tirage


def test_derive_trace_id_absent_rend_none():
    # « pas de correlation-id » n'est jamais une valeur inventée.
    assert lf.derive_trace_id(None) is None
    assert lf.derive_trace_id("") is None
    assert lf.derive_trace_id("   ") is None


def test_bind_trace_avec_session_id_derive_le_trace_id_de_la_correlation(monkeypatch):
    # #2442.2 — LA convention commune : trace_id Langfuse, correlation-id des
    # journaux/Sentry et référence support partagent la MÊME racine.
    _enable(monkeypatch)
    with lf.bind_trace("chat_turn", session_id="3f2a1b4c-5d6e-7f80-9012-3456789abcde"):
        lf.record_generation(name="bellum_chat", model="m", input_tokens=1, output_tokens=1)
    trace = _bodies("trace-create")[0]
    assert trace["id"] == "3f2a1b4c5d6e7f8090123456789abcde"


def test_bind_trace_sans_session_id_garde_un_identifiant_aleatoire(monkeypatch):
    # Hors requête HTTP (tâche de fond), pas de correlation-id : le trace_id
    # reste tiré au hasard, comme avant — rien à dériver.
    _enable(monkeypatch)
    with lf.bind_trace("analysis_run"):
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)
    trace = _bodies("trace-create")[0]
    assert len(trace["id"]) == 32


def test_update_current_trace_enrichit_avant_emission(monkeypatch):
    _enable(monkeypatch)
    with lf.bind_trace("analysis_run"):
        lf.update_current_trace(user_id="u42", session_id="cid-7")
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)
    trace = _bodies("trace-create")[0]
    assert trace["userId"] == "u42"
    assert trace["sessionId"] == "cid-7"


def test_update_current_trace_hors_trace_est_un_no_op(monkeypatch):
    _enable(monkeypatch)
    lf.update_current_trace(user_id="u1")  # ne lève pas, n'émet rien
    assert _events() == []


# ── spans ─────────────────────────────────────────────────────────────────────


def test_un_span_sous_trace_porte_debut_fin_et_trace_id(monkeypatch):
    _enable(monkeypatch)
    with lf.bind_trace("analysis_run"), lf.span("phase_research"):
        pass
    spans = _bodies("span-create")
    traces = _bodies("trace-create")
    assert len(spans) == 1
    assert spans[0]["name"] == "phase_research"
    assert spans[0]["traceId"] == traces[0]["id"]
    assert spans[0]["startTime"] <= spans[0]["endTime"]


def test_un_span_en_echec_le_dit_et_propage(monkeypatch):
    _enable(monkeypatch)
    with lf.bind_trace("chat_turn"), pytest.raises(ValueError), lf.span("tool:enrich_contact"):
        raise ValueError("boom outil")
    span = _bodies("span-create")[0]
    assert span["level"] == "ERROR"
    assert "boom outil" in span["statusMessage"]


def test_un_span_hors_trace_n_emet_rien(monkeypatch):
    # Un span sans trace parente serait un orphelin illisible : on n'émet pas.
    _enable(monkeypatch)
    with lf.span("phase_research"):
        pass
    assert _events() == []


# ── transport ─────────────────────────────────────────────────────────────────


def test_flush_poste_le_lot_en_basic_auth(monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setenv("LANGFUSE_HOST", "https://langfuse.example")
    captured: dict = {}

    class _Resp:
        status_code = 207

    def _fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        captured["headers"] = kwargs.get("headers")
        return _Resp()

    monkeypatch.setattr(lf.httpx, "post", _fake_post)
    lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)
    lf.flush()

    assert captured["url"] == "https://langfuse.example/api/public/ingestion"
    assert isinstance(captured["json"]["batch"], list) and captured["json"]["batch"]
    auth = captured["headers"]["Authorization"]
    assert auth.startswith("Basic ")
    import base64

    assert base64.b64decode(auth.removeprefix("Basic ")).decode() == "pk-lf-test:sk-lf-test"
    assert _events() == []  # la file est drainée


def test_un_echec_d_ingestion_ne_leve_jamais(monkeypatch):
    _enable(monkeypatch)

    def _fake_post(*_a, **_kw):
        raise OSError("réseau coupé")

    monkeypatch.setattr(lf.httpx, "post", _fake_post)
    lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)
    lf.flush()  # avale l'échec : le lot est jeté, jamais rejoué, jamais levé
    assert _events() == []


def test_la_file_est_bornee(monkeypatch):
    _enable(monkeypatch)
    for i in range(lf._MAX_QUEUE + 50):
        lf.record_generation(name=f"p{i}", model="m", input_tokens=1, output_tokens=1)
    assert len(lf._pending_events()) <= lf._MAX_QUEUE


def test_start_sans_cles_ne_demarre_rien(monkeypatch):
    lf.start()
    assert lf._worker_thread() is None


# ── environnement et version ──────────────────────────────────────────────────
#
# Exigence d'observabilité de l'archive 03 : « séparation dev/staging/prod ».
# Elle ne peut pas se tenir au niveau de l'appelant — il faudrait que les onze
# sites de `bind_trace` y pensent tous, et le douzième ne le ferait pas. Sans
# elle, les traces de développement, de recette et de production tombent dans la
# même vue sans rien pour les distinguer.


def test_chaque_trace_porte_l_environnement_et_la_version(monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")
    monkeypatch.setenv("SENTRY_RELEASE", "abc1234")

    with lf.bind_trace("analysis_run", session_id="cid-1"):
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)

    meta = _bodies("trace-create")[0]["metadata"]
    assert meta["environment"] == "production"
    assert meta["release"] == "abc1234"


def test_les_metadonnees_de_l_appelant_survivent(monkeypatch):
    # L'héritage ne doit RIEN écraser : `thread_id` est ce qui relie une trace
    # à son run, et le perdre rendrait la trace inutilisable.
    _enable(monkeypatch)
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "staging")

    with lf.bind_trace("analysis_run", metadata={"thread_id": "t-42"}):
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)

    meta = _bodies("trace-create")[0]["metadata"]
    assert meta["thread_id"] == "t-42"
    assert meta["environment"] == "staging"


def test_l_appelant_gagne_sur_l_heritage(monkeypatch):
    # Une trace qui déclare son propre environnement sait quelque chose que le
    # processus ignore.
    _enable(monkeypatch)
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")

    with lf.bind_trace("analysis_run", metadata={"environment": "replay"}):
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)

    assert _bodies("trace-create")[0]["metadata"]["environment"] == "replay"


def test_sans_environnement_connu_aucune_cle_n_est_inventee(monkeypatch):
    # « inconnu » se lirait comme une valeur. Une clé absente se lit comme une
    # absence — même règle que partout ailleurs dans le produit.
    _enable(monkeypatch)
    for var in ("SENTRY_ENVIRONMENT", "LANGFUSE_ENVIRONMENT", "SENTRY_RELEASE", "RAILWAY_GIT_COMMIT_SHA"):
        monkeypatch.delenv(var, raising=False)

    with lf.bind_trace("analysis_run"):
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)

    assert "metadata" not in _bodies("trace-create")[0]


def test_langfuse_environment_prime_sur_sentry(monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")
    monkeypatch.setenv("LANGFUSE_ENVIRONMENT", "prod-eu")

    with lf.bind_trace("analysis_run"):
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)

    assert _bodies("trace-create")[0]["metadata"]["environment"] == "prod-eu"
