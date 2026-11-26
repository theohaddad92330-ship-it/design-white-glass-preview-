"""Le banc de comparaison de modèles — corpus rejouable, 4 colonnes, juge choisi.

Ce que ces tests tiennent, dans l'ordre où ça compte :

1. **L'enregistreur éteint est un no-op STRICT** — pas « presque » : l'objet
   ``llm_gateway.complete`` est le MÊME objet avant, pendant l'import du module,
   et après un bloc ``recording()``. Une comparaison d'identité, pas de
   comportement : c'est la seule preuve qu'aucun octet du chemin de production
   ne change.
2. **Un enregistrement rejoué redonne le même prompt, byte-identique.**
   Sans ça, comparer deux modèles c'est comparer deux collectes.
3. **Le banc refuse un run où le juge est aussi candidat** — une exception, pas
   un avertissement.
4. **La note du juge ne peut pas faire basculer une colonne déterministe.**
5. **Un échec de validation de schéma est COMPTÉ**, jamais avalé.

Zéro réseau : la passerelle est remplacée par une fonction locale partout.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.eval.bench import compare as CMP
from app.eval.bench import corpus as CORPUS
from app.eval.bench import judge as JUDGE
from app.eval.bench import quality as QUALITY
from app.eval.bench import recorder as REC
from app.eval.bench import replay as REPLAY
from app.eval.bench.run import main as bench_main
from app.eval.strategy.variants import (
    ModelSpec,
    known_providers,
    model_env,
    model_variant,
)
from app.models.outputs.research import ResearchStrategy
from app.services import claude_service, llm_gateway

# ── helpers ───────────────────────────────────────────────────────────────────


def _usage(input_tokens: int = 100, output_tokens: int = 50, cost: float = 0.01, model: str = "m"):
    return claude_service.TokenUsage(
        input_tokens=input_tokens, output_tokens=output_tokens, model=model, cost_usd=cost
    )


def _fake_gateway(result=None, *, usage=None, raises: BaseException | None = None, sink: list | None = None):
    """A ``llm_gateway.complete`` replacement that records its call arguments."""

    async def _complete(task, system_prompt, user_prompt, **kwargs):
        if sink is not None:
            sink.append({"task": task, "system": system_prompt, "user": user_prompt, **kwargs})
        if raises is not None:
            raise raises
        return result, (usage or _usage())

    return _complete


def _call(**over) -> CORPUS.CallRecord:
    base = dict(
        corpus="c",
        case="acme",
        prompt_name="bellum_strategy",
        task="strategy",
        system="SYS",
        user="USR",
        response_model="app.models.outputs.research:ResearchStrategy",
        max_tokens=12000,
        max_retries=2,
        model_requested="claude-sonnet-5",
    )
    base.update(over)
    base.setdefault(
        "record_id",
        CORPUS.compute_record_id(
            prompt_name=base["prompt_name"],
            system=base["system"],
            user=base["user"],
            response_model=base["response_model"],
            max_tokens=base["max_tokens"],
        ),
    )
    return CORPUS.CallRecord(**base)  # type: ignore[arg-type]


# ══ 1. l'enregistreur éteint est un no-op STRICT ═══════════════════════════════


def test_importing_the_recorder_does_not_patch_the_gateway():
    """Le seul import ne touche à rien — comparaison d'IDENTITÉ, pas de comportement."""
    import importlib

    before = llm_gateway.complete
    importlib.reload(REC)
    assert llm_gateway.complete is before
    assert REC.is_recording() is False


def test_recording_restores_the_exact_same_function_object(tmp_path: Path):
    before = llm_gateway.complete
    with REC.recording(tmp_path / "c.jsonl", corpus="c"):
        assert llm_gateway.complete is not before
        assert REC.is_recording() is True
    assert llm_gateway.complete is before
    assert REC.is_recording() is False


def test_recording_restores_even_when_the_body_raises(tmp_path: Path):
    before = llm_gateway.complete
    with pytest.raises(RuntimeError), REC.recording(tmp_path / "c.jsonl", corpus="c"):
        raise RuntimeError("boom")
    assert llm_gateway.complete is before


@pytest.mark.asyncio
async def test_recorder_off_writes_nothing_and_changes_no_argument(tmp_path: Path, monkeypatch):
    """Éteint : zéro fichier, et les arguments arrivent inchangés au dispatch."""
    sink: list = []
    monkeypatch.setattr(llm_gateway, "complete", _fake_gateway("ok", sink=sink))
    store = tmp_path / "c.jsonl"
    await llm_gateway.complete("strategy", "SYS", "USR", response_model=None, max_tokens=7)
    assert not store.exists()
    assert sink == [{"task": "strategy", "system": "SYS", "user": "USR",
                     "response_model": None, "max_tokens": 7}]


@pytest.mark.asyncio
async def test_recorder_on_captures_the_replayable_input(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(llm_gateway, "complete", _fake_gateway({"angles": []}, usage=_usage(model="claude-sonnet-5")))
    store = tmp_path / "c.jsonl"
    with REC.recording(store, corpus="run1", case="acme"):
        await llm_gateway.complete(
            "bellum_strategy", "SYS", "USR", response_model=dict, max_tokens=9000, model="claude-sonnet-5"
        )
    rows = CORPUS.load_calls(store)
    assert len(rows) == 1
    r = rows[0]
    assert (r.prompt_name, r.system, r.user) == ("bellum_strategy", "SYS", "USR")
    assert r.response_model == CORPUS.RESPONSE_MODEL_DICT
    assert r.max_tokens == 9000
    assert r.model_requested == "claude-sonnet-5"
    assert r.arm == CORPUS.ARM_RECORDED
    assert r.status == CORPUS.STATUS_OK
    assert r.corpus == "run1" and r.case == "acme"


@pytest.mark.asyncio
async def test_recorder_resolves_the_gateway_defaults_it_was_not_given(tmp_path: Path, monkeypatch):
    """Un appelant qui ne passe pas ``max_tokens`` a QUAND MÊME un max_tokens :
    celui du défaut de la passerelle. On enregistre l'effectif, pas le déclaré."""
    monkeypatch.setattr(llm_gateway, "complete", _fake_gateway("txt"))
    store = tmp_path / "c.jsonl"
    with REC.recording(store, corpus="c"):
        await llm_gateway.complete("bellum_facts", "S", "U")
    r = CORPUS.load_calls(store)[0]
    assert r.max_tokens == claude_service.DEFAULT_MAX_TOKENS
    assert r.max_retries == claude_service.DEFAULT_MAX_RETRIES
    assert r.model_requested == claude_service.CLAUDE_MODEL
    assert r.response_model == CORPUS.RESPONSE_MODEL_TEXT


@pytest.mark.asyncio
async def test_the_hook_really_catches_a_REAL_call_claude(tmp_path: Path, monkeypatch):
    """La prémisse du branchement, prouvée et pas affirmée.

    ``call_claude`` fait ``from app.services.llm_gateway import complete`` DANS
    sa fonction : l'attribut du module est relu à chaque appel, donc l'envelopper
    suffit. Si ce jour-là quelqu'un remonte l'import au niveau du module, ce test
    devient rouge — et c'est exactement ce qu'on veut savoir.
    """
    async def _dispatch(system_prompt, user_prompt, **kwargs):
        return {"angles": []}, _usage(model="claude-sonnet-5")

    monkeypatch.setattr(claude_service, "_dispatch_anthropic", _dispatch)
    store = tmp_path / "c.jsonl"
    with REC.recording(store, corpus="c", case="acme"):
        await claude_service.call_claude(
            "SYS", "USR", response_model=dict, max_tokens=4321, prompt_name="bellum_strategy",
        )
    rows = CORPUS.load_calls(store)
    assert len(rows) == 1
    assert rows[0].prompt_name == "bellum_strategy"
    assert rows[0].task == "strategy"
    assert rows[0].max_tokens == 4321


def test_the_hook_does_NOT_see_call_claude_sync_and_that_is_documented(tmp_path: Path, monkeypatch):
    """La FRONTIÈRE du banc, écrite en test plutôt que découverte en réunion.

    ``call_claude_sync`` (le Profiler → ``ProfileContext``) et
    ``call_claude_with_citations`` ne passent PAS par la passerelle : ils
    appellent Anthropic en direct. Le corpus ne les contient donc pas, et le banc
    ne mesure pas leur conformité de schéma. Un banc qui prétend tout mesurer ment.
    """
    monkeypatch.setattr(claude_service, "_call_sync",
                        lambda *a, **k: (object(), _usage()))
    store = tmp_path / "c.jsonl"
    with REC.recording(store, corpus="c"):
        claude_service.call_claude_sync("S", "U", response_model=dict, prompt_name="bellum_profiler")
    assert CORPUS.load_calls(store) == []

    import inspect

    for fn in (claude_service.call_claude_sync, claude_service.call_claude_with_citations):
        assert "llm_gateway" not in inspect.getsource(fn), (
            f"{fn.__name__} passe désormais par la passerelle — le banc peut l'enregistrer, "
            "mettre à jour agent_docs/banc-modeles.md § « Ce que le banc REFUSE de mesurer »"
        )
    assert "llm_gateway" in inspect.getsource(claude_service.call_claude)


# ══ 2. rejouer redonne le MÊME prompt, byte-identique ══════════════════════════


@pytest.mark.asyncio
async def test_a_replayed_record_sends_a_byte_identical_prompt(tmp_path: Path, monkeypatch):
    """Enregistrer puis rejouer : system, user, response_model, max_tokens et la
    tâche routée sont identiques — et l'identifiant d'enregistrement aussi, ce
    qui est ce qui permet d'APPARIER deux bras."""
    outbound: list = []
    monkeypatch.setattr(llm_gateway, "complete", _fake_gateway("out", sink=outbound))
    store = tmp_path / "c.jsonl"
    with REC.recording(store, corpus="c", case="acme"):
        await llm_gateway.complete(
            "bellum_strategy", "SYS\nligne 2\tavec tab", "USR — accentué", response_model=dict, max_tokens=11
        )
    recorded = CORPUS.load_calls(store)[0]

    outbound.clear()
    replayed = await REPLAY.replay_record(
        recorded, "haiku", ModelSpec.parse("claude-haiku-4-5"), store=store, complete=llm_gateway.complete
    )

    sent = outbound[-1]
    assert sent["system"] == recorded.system
    assert sent["user"] == recorded.user
    assert sent["max_tokens"] == recorded.max_tokens
    assert sent["response_model"] is dict
    assert sent["task"] == recorded.task
    assert replayed.record_id == recorded.record_id
    assert replayed.arm == "haiku"
    assert replayed.model == "claude-haiku-4-5"


@pytest.mark.asyncio
async def test_replay_routes_the_arm_and_restores_the_environment(tmp_path: Path, monkeypatch):
    seen: list = []

    async def _complete(task, system_prompt, user_prompt, **kwargs):
        import os

        seen.append((os.environ.get("LLM_ROUTE_STRATEGY"), kwargs.get("model")))
        return "x", _usage()

    monkeypatch.delenv("LLM_ROUTE_STRATEGY", raising=False)
    rec = _call(response_model=CORPUS.RESPONSE_MODEL_TEXT)
    await REPLAY.replay_record(
        rec, "luna", ModelSpec.parse("openai:gpt-5.6-luna"), store=tmp_path / "s.jsonl", complete=_complete
    )
    assert seen == [("openai:gpt-5.6-luna", "gpt-5.6-luna")]
    import os

    assert "LLM_ROUTE_STRATEGY" not in os.environ


def test_record_id_ignores_the_model_so_two_arms_pair_on_the_same_input():
    a = CORPUS.compute_record_id(
        prompt_name="p", system="s", user="u", response_model="dict", max_tokens=10
    )
    b = CORPUS.compute_record_id(
        prompt_name="p", system="s", user="u", response_model="dict", max_tokens=10
    )
    c = CORPUS.compute_record_id(
        prompt_name="p", system="s", user="u DIFFERENT", response_model="dict", max_tokens=10
    )
    assert a == b != c


def test_replay_skips_a_record_already_captured_ok_for_this_arm(tmp_path: Path):
    store = tmp_path / "s.jsonl"
    rec = _call()
    CORPUS.append_call(store, rec)
    done = CORPUS.replayed_ok_ids(CORPUS.load_calls(store), CORPUS.ARM_RECORDED)
    assert done == {rec.record_id}
    assert CORPUS.replayed_ok_ids(CORPUS.load_calls(store), "haiku") == set()


def test_corpus_inputs_deduplicate_and_keep_only_replayable_lines(tmp_path: Path):
    store = tmp_path / "s.jsonl"
    a = _call(user="A")
    CORPUS.append_call(store, a)
    CORPUS.append_call(store, a)  # même entrée, capturée deux fois
    CORPUS.append_call(store, _call(user="B"))
    # Une ligne de REJEU n'est pas une entrée du corpus : elle en est une mesure.
    CORPUS.append_call(store, _call(user="C", arm="haiku"))
    inputs = CORPUS.corpus_inputs(CORPUS.load_calls(store))
    assert len(inputs) == 2
    assert {i.user for i in inputs} == {"A", "B"}


def test_load_calls_drops_a_truncated_final_line(tmp_path: Path, caplog):
    store = tmp_path / "s.jsonl"
    CORPUS.append_call(store, _call())
    with store.open("a", encoding="utf-8") as fh:
        fh.write('{"record_id": "half')
    with caplog.at_level("ERROR"):
        rows = CORPUS.load_calls(store)
    assert len(rows) == 1


# ── la résolution du response_model est une porte, pas un import libre ─────────


def test_response_model_round_trips_through_its_name():
    name = CORPUS.describe_response_model(ResearchStrategy)
    assert name == "app.models.outputs.research:ResearchStrategy"
    assert CORPUS.resolve_response_model(name) is ResearchStrategy
    assert CORPUS.resolve_response_model(CORPUS.RESPONSE_MODEL_DICT) is dict
    assert CORPUS.resolve_response_model(CORPUS.RESPONSE_MODEL_TEXT) is None


def test_response_model_resolution_refuses_a_module_outside_the_allowlist():
    """Un corpus est une DONNÉE. Importer un module nommé dans un fichier de
    données, c'est exécuter du code écrit par le fichier."""
    with pytest.raises(ValueError, match="hors périmètre"):
        CORPUS.resolve_response_model("os:system")
    with pytest.raises(ValueError, match="hors périmètre"):
        CORPUS.resolve_response_model("subprocess:run")


def test_response_model_allowlist_is_not_empty():
    assert CORPUS.ALLOWED_RESPONSE_MODEL_MODULES
    assert all(p.startswith("app.") for p in CORPUS.ALLOWED_RESPONSE_MODEL_MODULES)


# ══ 3. l'axe « modèle » dans les variantes (lot B) ═════════════════════════════


def test_model_spec_parses_a_bare_model_as_the_default_provider():
    s = ModelSpec.parse("claude-haiku-4-5")
    assert (s.provider, s.model) == ("anthropic", "claude-haiku-4-5")
    assert s.label == "anthropic:claude-haiku-4-5"
    assert s.route_value == "anthropic:claude-haiku-4-5"


def test_model_spec_parses_an_explicit_provider():
    s = ModelSpec.parse("openai:gpt-5.6-luna")
    assert (s.provider, s.model) == ("openai", "gpt-5.6-luna")


def test_model_spec_refuses_an_unknown_provider_rather_than_guessing():
    with pytest.raises(ValueError, match="fournisseur"):
        ModelSpec.parse("opnai:gpt-4o")
    with pytest.raises(ValueError):
        ModelSpec.parse("   ")


def test_known_providers_come_from_the_gateway_not_from_a_copy():
    assert set(known_providers()) == set(llm_gateway._PROVIDERS)
    assert "anthropic" in known_providers()


def test_model_variant_is_a_dictionary_entry_not_a_code_change():
    v = model_variant(ModelSpec.parse("openai:gpt-5.6-luna"), tasks=("strategy",), prompts=("bellum_strategy",))
    assert v.env == {
        "LLM_ROUTE_STRATEGY": "openai:gpt-5.6-luna",
        "MODEL_BELLUM_STRATEGY": "gpt-5.6-luna",
    }
    assert not v.is_baseline


def test_model_env_covers_every_canonical_task_when_asked():
    env = model_env(ModelSpec.parse("claude-haiku-4-5"), tasks=llm_gateway.CANONICAL_TASKS)
    assert set(env) == {f"LLM_ROUTE_{t.upper()}" for t in llm_gateway.CANONICAL_TASKS}
    assert set(env.values()) == {"anthropic:claude-haiku-4-5"}


def test_model_variant_applies_and_restores_like_any_other_variant(monkeypatch):
    from app.eval.strategy.variants import applied

    monkeypatch.delenv("MODEL_BELLUM_STRATEGY", raising=False)
    v = model_variant(ModelSpec.parse("claude-haiku-4-5"), prompts=("bellum_strategy",))
    import os

    with applied(v):
        assert os.environ["MODEL_BELLUM_STRATEGY"] == "claude-haiku-4-5"
    assert "MODEL_BELLUM_STRATEGY" not in os.environ


def test_the_shipped_variant_registry_is_untouched_by_the_model_axis():
    """Le lot B ajoute une FABRIQUE, il ne bascule aucun défaut de production."""
    from app.eval.strategy.variants import VARIANTS

    assert VARIANTS["baseline"].env == {}
    for name, v in VARIANTS.items():
        assert not any(k.startswith("LLM_ROUTE_") or k.startswith("MODEL_") for k in v.env), name


# ══ 4. les quatre colonnes ═════════════════════════════════════════════════════


def _strategy_payload(n_angles: int = 3) -> dict:
    return {
        "angles": [
            {
                "title": f"Angle {i}",
                "strategy": "Promesse claire, preuve chiffrée, action datée sous 15 jours.",
                "entryContactPersona": "DSI",
                "specificOffer": "TMA 3 ETP sur 12 mois",
                "estimatedDealSize": "450 k€",
                "prerequisites": "Accès aux specs",
            }
            for i in range(n_angles)
        ],
    }


def _records_two_arms() -> list[CORPUS.CallRecord]:
    rows: list[CORPUS.CallRecord] = []
    for i, case in enumerate(("acme", "bolt", "cog")):
        rid = CORPUS.compute_record_id(
            prompt_name="bellum_strategy", system="S", user=f"U{i}", response_model="dict", max_tokens=10
        )
        rows.append(_call(record_id=rid, case=case, user=f"U{i}", response_model="dict",
                          max_tokens=10, arm="A", model="claude-haiku-4-5", provider="anthropic",
                          cost_usd=0.10, latency_s=2.0, output=_strategy_payload(3),
                          input_tokens=1000, output_tokens=500))
        rows.append(_call(record_id=rid, case=case, user=f"U{i}", response_model="dict",
                          max_tokens=10, arm="B", model="gpt-5.6-luna", provider="openai",
                          cost_usd=0.02, latency_s=8.0, output=_strategy_payload(1),
                          input_tokens=1000, output_tokens=400))
    return rows


def test_the_four_columns_never_merge_into_one_score():
    c = CMP.compare_arms(_records_two_arms(), ["A", "B"])
    assert [col.arm for col in c.columns] == ["A", "B"]
    a, b = c.columns
    # qualité, coût, latence, conformité : quatre grandeurs, quatre attributs.
    assert a.quality_mean > b.quality_mean          # 3 plays contre 1
    assert a.cost_usd_total > b.cost_usd_total      # et pourtant A coûte plus cher
    assert a.latency_mean_s < b.latency_mean_s      # et B est plus lent
    assert a.schema_failures == b.schema_failures == 0
    payload = c.as_dict()
    assert "score" not in payload
    assert not any(k in payload for k in ("winner", "overall", "total_score"))


def test_a_schema_failure_is_counted_not_swallowed():
    """Le bras qui échoue GARDE sa ligne dans l'appariement : un échec est une
    mesure, pas une absence. L'exclure ferait disparaître le défaut mesuré."""
    rows = _records_two_arms()
    rows.append(_call(record_id="zz", case="dud", arm="A", model="claude-haiku-4-5",
                      provider="anthropic", output=_strategy_payload(3), latency_s=1.0, cost_usd=0.1))
    rows.append(_call(record_id="zz", case="dud", arm="B", model="gpt-5.6-luna", provider="openai",
                      status=CORPUS.STATUS_SCHEMA_ERROR, error="2 validation errors",
                      latency_s=1.0, cost_usd=0.0))
    c = CMP.compare_arms(rows, ["A", "B"])
    a, b = c.columns
    assert b.schema_failures == 1
    assert b.schema_ok == 3
    assert b.schema_attempted == 4
    assert b.schema_rate == 0.75
    assert a.schema_failures == 0 and a.schema_rate == 1.0
    assert "conformité" in " ".join(c.notes).lower()


def test_a_truncation_is_counted_apart_from_a_schema_failure():
    """Un plafond trop bas est un défaut de RÉGLAGE. Le fondre dans « schéma »
    ferait accuser un modèle d'une configuration."""
    rows = _records_two_arms()
    rows.append(_call(record_id="zz", case="dud", arm="A", output=_strategy_payload(3), latency_s=1.0))
    rows.append(_call(record_id="zz", case="dud", arm="B", status=CORPUS.STATUS_TRUNCATED,
                      error="max_tokens", latency_s=1.0))
    b = CMP.compare_arms(rows, ["A", "B"]).columns[1]
    assert b.truncations == 1
    assert b.schema_failures == 0


def test_quality_of_a_prompt_without_a_deterministic_grid_is_NOT_zero():
    """« Non mesuré » n'est jamais « 0 » — le banc le NOMME."""
    rows = [
        _call(record_id="r1", arm="A", prompt_name="bellum_contacts", task="classify",
              output={"contacts": []}, latency_s=1.0, cost_usd=0.01),
    ]
    col = CMP.compare_arms(rows, ["A"]).columns[0]
    assert col.quality_mean is None
    assert col.quality_scored == 0
    assert col.quality_unmeasured == 1
    q = QUALITY.score_call(rows[0])
    assert q.measured is False and q.total is None and q.reason


def test_quality_uses_the_published_rubric_for_a_strategy_output():
    rec = _call(arm="A", output=_strategy_payload(3))
    q = QUALITY.score_call(rec)
    assert q.measured is True
    assert q.total is not None and q.total > 0
    assert "angles" in q.bands


def test_only_records_present_in_every_arm_are_compared():
    rows = _records_two_arms()
    rows.append(_call(record_id="solo", case="solo", arm="A", output=_strategy_payload(3),
                      latency_s=1.0, cost_usd=99.0))
    c = CMP.compare_arms(rows, ["A", "B"])
    assert "solo" not in c.cases
    assert c.columns[0].cost_usd_total == pytest.approx(0.30)
    assert any("appari" in n.lower() for n in c.notes)


def test_comparison_without_a_single_paired_record_says_so():
    rows = [_call(record_id="a", arm="A"), _call(record_id="b", arm="B")]
    c = CMP.compare_arms(rows, ["A", "B"])
    assert c.cases == []
    assert any("aucun" in n.lower() for n in c.notes)


def test_the_result_carries_the_commit_the_date_the_cases_the_models_and_the_judge():
    c = CMP.compare_arms(_records_two_arms(), ["A", "B"], corpus="c",
                         judge=ModelSpec.parse("claude-sonnet-5"))
    d = c.as_dict()
    for key in ("generated_at", "repo_commit", "corpus", "cases", "arms", "models", "judge"):
        assert key in d, key
    assert d["arms"] == ["A", "B"]
    assert d["models"] == {"A": "anthropic:claude-haiku-4-5", "B": "openai:gpt-5.6-luna"}
    assert d["judge"] == "anthropic:claude-sonnet-5"
    assert len(d["cases"]) == 3


def test_repo_commit_is_a_real_sha_or_none_never_invented():
    sha = CMP.repo_commit()
    assert sha is None or (len(sha) == 40 and all(ch in "0123456789abcdef" for ch in sha))


# ══ 5. le juge — choisissable, enregistré, et jamais décisionnaire ═════════════


def test_the_default_judge_is_named_in_exactly_one_place():
    import inspect

    from app.eval.bench import judge as judge_mod

    src = inspect.getsource(judge_mod)
    assert src.count(f'"{JUDGE.DEFAULT_JUDGE_MODEL}"') == 1
    assert JUDGE.default_judge().model == JUDGE.DEFAULT_JUDGE_MODEL


def test_the_judge_can_be_chosen_including_from_another_provider(monkeypatch):
    monkeypatch.delenv(JUDGE.JUDGE_MODEL_ENV, raising=False)
    assert JUDGE.resolve_judge("openai:gpt-4o") == ModelSpec("openai", "gpt-4o")
    assert JUDGE.resolve_judge(None).model == JUDGE.DEFAULT_JUDGE_MODEL
    monkeypatch.setenv(JUDGE.JUDGE_MODEL_ENV, "claude-opus-4-1")
    assert JUDGE.resolve_judge(None).model == "claude-opus-4-1"


def test_the_bench_REFUSES_a_run_where_the_judge_is_also_a_candidate():
    judge = ModelSpec.parse("claude-haiku-4-5")
    with pytest.raises(JUDGE.JudgeConflictError) as exc:
        JUDGE.assert_judge_is_not_a_candidate(judge, [ModelSpec.parse("claude-haiku-4-5"),
                                                      ModelSpec.parse("openai:gpt-5.6-luna")])
    assert "juge" in str(exc.value).lower()


def test_a_judge_from_another_provider_is_accepted():
    JUDGE.assert_judge_is_not_a_candidate(
        ModelSpec.parse("claude-sonnet-5"),
        [ModelSpec.parse("claude-haiku-4-5"), ModelSpec.parse("openai:gpt-5.6-luna")],
    )


@pytest.mark.asyncio
async def test_the_judge_goes_through_the_gateway_and_routes_itself():
    seen: list = []

    async def _complete(task, system_prompt, user_prompt, **kwargs):
        import os

        seen.append((task, os.environ.get("LLM_ROUTE_BENCH_JUDGE"), kwargs.get("model")))
        return JUDGE.JudgeVerdict(score=7, reason="plausible"), _usage()

    rec = _call(arm="A", output=_strategy_payload(3))
    score = await JUDGE.judge_call(rec, ModelSpec.parse("openai:gpt-4o"), complete=_complete)
    assert seen == [(JUDGE.JUDGE_TASK, "openai:gpt-4o", "gpt-4o")]
    assert score.measured is True and score.score == 7.0
    assert score.judge == "openai:gpt-4o"


@pytest.mark.asyncio
async def test_a_judge_failure_is_unmeasured_never_a_zero():
    async def _boom(task, system_prompt, user_prompt, **kwargs):
        raise RuntimeError("429")

    s = await JUDGE.judge_call(_call(arm="A", output=_strategy_payload()), ModelSpec.parse("claude-sonnet-5"),
                               complete=_boom)
    assert s.measured is False
    assert s.score is None
    assert "429" in s.reason


def test_the_judge_score_CANNOT_flip_a_deterministic_column():
    """La doctrine de ``rubric.py``, rendue exécutable : la note du juge est une
    colonne À CÔTÉ, jamais fondue dedans."""
    rows = _records_two_arms()
    judge = ModelSpec.parse("claude-sonnet-5")
    flattering = [JUDGE.JudgeScore(record_id=r.record_id, arm=r.arm, judge=judge.label,
                                   score=10.0 if r.arm == "B" else 0.0, reason="", measured=True)
                  for r in rows]
    damning = [JUDGE.JudgeScore(record_id=r.record_id, arm=r.arm, judge=judge.label,
                                score=0.0 if r.arm == "B" else 10.0, reason="", measured=True)
               for r in rows]

    a = CMP.compare_arms(rows, ["A", "B"], judge=judge, judge_scores=flattering)
    b = CMP.compare_arms(rows, ["A", "B"], judge=judge, judge_scores=damning)

    assert a.deterministic_dict() == b.deterministic_dict()
    assert a.columns[1].judge_mean == 10.0
    assert b.columns[1].judge_mean == 0.0
    assert a.columns[1].quality_mean == b.columns[1].quality_mean


def test_the_judge_column_is_flagged_advisory_in_the_payload():
    c = CMP.compare_arms(_records_two_arms(), ["A", "B"], judge=ModelSpec.parse("claude-sonnet-5"))
    assert c.as_dict()["judge_is_advisory"] is True
    assert "juge" in " ".join(c.notes).lower()


def test_without_a_judge_the_column_is_absent_not_zero():
    c = CMP.compare_arms(_records_two_arms(), ["A", "B"])
    assert c.as_dict()["judge"] is None
    assert all(col.judge_mean is None for col in c.columns)


def test_the_campaign_verdict_does_not_read_the_judge_at_all():
    """Garde de source : ``passed`` ne peut pas dépendre de ce que le moteur ne
    connaît pas. Le corpus lu n'est pas vide — le test le vérifie."""
    import inspect

    from app.eval.strategy import campaign

    src = inspect.getsource(campaign)
    assert len(src) > 2000
    assert "def compare(" in src
    assert "judge" not in src.lower()


# ══ 6. la CLI ══════════════════════════════════════════════════════════════════


def test_cli_corpus_on_an_empty_store_is_hermetic(tmp_path: Path, capsys):
    assert bench_main(["corpus", "--store", str(tmp_path / "none.jsonl")]) == 0
    assert "Aucun" in capsys.readouterr().out


def test_cli_compare_prints_the_four_columns(tmp_path: Path, capsys):
    store = tmp_path / "s.jsonl"
    for r in _records_two_arms():
        CORPUS.append_call(store, r)
    assert bench_main(["compare", "--store", str(store), "--arm", "A", "--arm", "B"]) == 0
    out = capsys.readouterr().out
    for header in ("qualité", "coût", "latence", "schéma"):
        assert header in out.lower()


def test_cli_compare_json_carries_the_envelope(tmp_path: Path, capsys):
    store = tmp_path / "s.jsonl"
    for r in _records_two_arms():
        CORPUS.append_call(store, r)
    assert bench_main(["compare", "--store", str(store), "--arm", "A", "--arm", "B", "--json"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["arms"] == ["A", "B"]
    assert payload["judge"] is None


def test_cli_compare_REFUSES_when_the_judge_is_a_candidate(tmp_path: Path, capsys):
    store = tmp_path / "s.jsonl"
    for r in _records_two_arms():
        CORPUS.append_call(store, r)
    code = bench_main(["compare", "--store", str(store), "--arm", "A", "--arm", "B",
                       "--judge", "claude-haiku-4-5", "--models", "A=claude-haiku-4-5"])
    assert code == 2
    assert "juge" in capsys.readouterr().err.lower()


def test_cli_replay_refuses_to_spend_without_confirmation(tmp_path: Path, capsys):
    store = tmp_path / "s.jsonl"
    CORPUS.append_call(store, _call())
    assert bench_main(["replay", "--store", str(store), "--model", "claude-haiku-4-5"]) == 2
    assert "--yes-run-live" in capsys.readouterr().err


def test_cli_record_refuses_to_spend_without_confirmation(capsys):
    assert bench_main(["record", "--company", "doctolib"]) == 2
    assert "--yes-run-live" in capsys.readouterr().err


def test_cli_cost_says_not_measured_rather_than_inventing(tmp_path: Path, capsys):
    assert bench_main(["cost", "--store", str(tmp_path / "none.jsonl"),
                       "--model", "claude-haiku-4-5"]) == 0
    out = capsys.readouterr().out
    assert "non mesuré" in out.lower() or "aucun" in out.lower()


def test_cost_announces_a_model_whose_price_is_only_a_FALLBACK_tier(tmp_path: Path, capsys):
    """Un modèle qui vient de sortir n'est dans aucune table : son « coût projeté »
    est alors le prix d'un AUTRE modèle. Le taire serait un chiffre inventé.

    ⚠️ Le témoin était `openai:gpt-5.6-luna`, et il a cessé d'en être un le jour
    où son tarif réel est entré dans `_OPENAI_PRICING`. La garde est donc passée
    au rouge en CI **en disant vrai sur un monde qui avait changé** — c'est le
    bon sens du rouge, pas un défaut. Le témoin est désormais un identifiant
    qu'aucune table ne peut porter : s'il en gagne un un jour, c'est que
    quelqu'un l'a ajouté exprès, et la garde le dira.
    """
    from app.eval.bench.cost import price_is_a_fallback_tier

    assert price_is_a_fallback_tier(ModelSpec.parse("openai:modele-inexistant-pour-la-garde")) is True
    # Et les deux contre-épreuves : un modèle RÉELLEMENT tarifé de chaque côté.
    # `gpt-5.6-luna` en fait désormais partie — c'est ce que cette ligne prouve.
    assert price_is_a_fallback_tier(ModelSpec.parse("openai:gpt-5.6-luna")) is False
    assert price_is_a_fallback_tier(ModelSpec.parse("claude-haiku-4-5")) is False
    assert price_is_a_fallback_tier(ModelSpec.parse("openai:gpt-4o")) is False

    store = tmp_path / "s.jsonl"
    CORPUS.append_call(store, _call(arm=CORPUS.ARM_RECORDED, input_tokens=1000, output_tokens=1000,
                                    cost_usd=1.0))
    assert bench_main(["cost", "--store", str(store),
                       "--model", "openai:modele-inexistant-pour-la-garde"]) == 0
    out = capsys.readouterr().out
    # Le fournisseur ne sait PAS le tarifer : le banc n'emprunte aucun prix.
    assert "non tarifé" in out
    assert "aucun prix connu" in out.lower()

    # La contre-épreuve, sur le modèle qui vient de GAGNER son tarif : plus
    # d'avertissement. Sans elle, la garde resterait verte le jour où le message
    # s'afficherait partout — un avertissement qui crie sur tout ne prévient plus.
    assert bench_main(["cost", "--store", str(store), "--model", "openai:gpt-5.6-luna"]) == 0
    out = capsys.readouterr().out
    assert "palier de repli" not in out


def test_cli_cost_projects_from_the_recorded_token_counts(tmp_path: Path, capsys):
    store = tmp_path / "s.jsonl"
    CORPUS.append_call(store, _call(arm=CORPUS.ARM_RECORDED, input_tokens=1_000_000,
                                    output_tokens=1_000_000, cost_usd=12.0))
    assert bench_main(["cost", "--store", str(store), "--model", "claude-haiku-4-5"]) == 0
    out = capsys.readouterr().out
    # Haiku : $1 / M en entrée + $5 / M en sortie = $6.00 pour cet enregistrement.
    assert "6.0" in out or "6,0" in out


# ══ 7. la garde sait dire NON — le corpus lu n'est pas vide ════════════════════


def test_the_bench_reads_a_non_empty_corpus_of_strict_response_models():
    """Une garde doit LIRE quelque chose — et savoir dire NON si on lui retire une
    ligne. Les cinq sites stricts nommés au cahier des charges sont là, chacun se
    nomme et se re-résout ; en retirer un fait rougir ce test."""
    from app.agents.profiler import ProfileContext
    from app.models.outputs.contacts import ContactsOutput, OrganigrammeOutput
    from app.models.outputs.research import ResearchSignals, ResearchStrategy

    required = (ResearchSignals, ContactsOutput, OrganigrammeOutput, ProfileContext, ResearchStrategy)
    missing = [m.__name__ for m in required if m not in QUALITY.STRICT_RESPONSE_MODELS]
    assert not missing, f"site strict retiré du corpus surveillé : {missing}"
    names = [CORPUS.describe_response_model(m) for m in QUALITY.STRICT_RESPONSE_MODELS]
    assert len(names) >= len(required)
    for n in names:
        assert CORPUS.resolve_response_model(n) is not None


def test_every_strict_response_model_is_actually_used_by_a_paying_call_site():
    """Sinon la « conformité de schéma » mesurerait un risque imaginaire.

    L'alias compte : ``OrganigrammeOutput`` EST ``OrgChartOutput``, et c'est
    l'alias que le site d'appel écrit. On cherche donc tous les noms sous
    lesquels la classe est exportée par son module, pas seulement ``__name__``.
    """
    import importlib
    import re
    from pathlib import Path as _P

    app_dir = _P(__file__).resolve().parents[1] / "app"
    sources = "\n".join(p.read_text(encoding="utf-8") for p in app_dir.rglob("*.py"))
    assert len(sources) > 100_000
    # ⚠ ``@router.post(..., response_model=X)`` de FastAPI est un AUTRE mécanisme
    # que ``call_claude(response_model=X)`` : les confondre ferait passer la garde
    # sur des schémas HTTP qui ne partent jamais dans un prompt.
    lines = [ln for ln in sources.splitlines() if not ln.lstrip().startswith("@")]
    used = set(re.findall(r"response_model=\s*([A-Za-z_][A-Za-z_0-9]*)", "\n".join(lines)))
    assert len(used) > 5, "aucun site d'appel trouvé — la garde ne lit rien"
    for model in QUALITY.STRICT_RESPONSE_MODELS:
        module = importlib.import_module(model.__module__)
        aliases = {n for n, v in vars(module).items() if v is model}
        assert aliases & used, f"{model.__name__} (alias {sorted(aliases)}) n'est appelé nulle part"


# ── `replay --arm` : le nom du bras est une CHAÎNE, jamais une liste ───────────
#
# ``--arm`` est déclaré ``action="append"`` parce que ``compare`` en prend
# plusieurs. ``replay``, lui, n'en écrit qu'un — et il le lisait ainsi :
#
#     arm = args.arm or args.model[0]
#
# Avec ``--arm a1``, ``args.arm`` vaut ``["a1"]``, une liste NON VIDE donc
# truthy : le bras devenait la LISTE, sérialisée en JSON comme ``["a1"]``.
# ``compare --arm a1`` cherche ensuite ``r.arm == "a1"`` et ne trouve jamais
# rien. Autrement dit : le seul moyen documenté de rejouer deux fois le même
# modèle pour mesurer sa variance — « rejouer sous deux noms de bras » — ne
# pouvait pas fonctionner, et rien ne le disait.


def _replay_args(tmp_path: Path, **over):
    import argparse

    base = dict(
        store=str(tmp_path / "bench.jsonl"),
        model=["claude-haiku-4-5"],
        arm=[],
        prompt=None,
        limit=None,
        yes_run_live=False,
        no_store_output=False,
    )
    base.update(over)
    return argparse.Namespace(**base)


def _seed_one_record(tmp_path: Path) -> Path:
    store = tmp_path / "bench.jsonl"
    CORPUS.append_call(store, _call(user="A", arm=CORPUS.ARM_RECORDED))
    return store


def test_replay_arm_is_a_string_not_the_list_argparse_collected(tmp_path: Path, capsys):
    """La garde qui dit NON : `--arm a1` doit nommer le bras `'a1'`."""
    from app.eval.bench import run as RUN

    _seed_one_record(tmp_path)
    args = _replay_args(tmp_path, arm=["a1"])

    # Sans --yes-run-live, `replay` s'arrête AVANT tout appel réseau et imprime
    # le nom du bras qu'il utiliserait : c'est notre point d'observation gratuit.
    assert RUN._cmd_replay(args) == 2
    err = capsys.readouterr().err

    assert "'a1'" in err, err
    assert "['a1']" not in err, "le bras est resté la liste d'argparse — compare ne le retrouvera pas"


def test_replay_without_arm_still_falls_back_to_the_model_name(tmp_path: Path, capsys):
    """Le défaut documenté ne bouge pas : sans `--arm`, le bras EST le modèle."""
    from app.eval.bench import run as RUN

    _seed_one_record(tmp_path)

    assert RUN._cmd_replay(_replay_args(tmp_path)) == 2
    assert "'claude-haiku-4-5'" in capsys.readouterr().err


def test_replay_refuses_two_arms_rather_than_silently_keeping_one(tmp_path: Path, capsys):
    """Deux bras pour un rejeu est une erreur d'intention, pas un défaut à deviner."""
    from app.eval.bench import run as RUN

    _seed_one_record(tmp_path)

    assert RUN._cmd_replay(_replay_args(tmp_path, arm=["a1", "a2"])) == 2
    assert "--arm" in capsys.readouterr().err
