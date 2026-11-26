"""Cross-lang round-trip (#273) — the PYTHON half.

The same fixtures that ``packages/shared`` validates with ajv/vitest are
validated here with ``jsonschema``. Both halves read the SAME files, so a schema
that drifts from reality — or a branched field that disappears from a payload —
fails on both sides of the monorepo instead of silently diverging between zod
and Pydantic.
"""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path

import pytest
from jsonschema import ValidationError

from app.contracts.shared_schemas import (
    STEPS,
    VENDORED_DIR,
    SharedSchemasNotFound,
    branchable_fields,
    load_step_schema,
    missing_branchable,
    schemas_dir,
    validate_step,
    validate_step_output,
)
from app.contracts.sync_schemas import canonical_dir
from app.contracts.sync_schemas import diff as vendored_diff
from app.contracts.sync_schemas import main as sync_main

#: (step, fixture file, is the fixture a LIST of payloads?) — the round-trip matrix.
FIXTURES = [
    ("research", "real-run-sg.raw.json", False),
    ("contacts", "real-run-sg.contacts.json", True),
    ("classify", "real-run-sg.classify.json", False),
    ("plan", "real-run-sg.plan.json", False),
]


def _fixture(name: str):
    with (schemas_dir() / "__fixtures__" / name).open(encoding="utf-8") as handle:
        return json.load(handle)


class TestSchemaResolution:
    def test_resolves_the_monorepo_schemas_dir(self) -> None:
        # No env var set: the upward walk must find packages/shared/schemas.
        assert schemas_dir().is_dir()
        assert schemas_dir().name == "schemas"

    def test_exposes_exactly_one_schema_per_pipeline_step(self) -> None:
        for step in STEPS:
            assert (schemas_dir() / f"{step}.schema.json").is_file(), step

    def test_step_list_matches_the_typescript_export(self) -> None:
        """``STEPS`` must mirror ``SCHEMA_IDS`` in packages/shared/src/index.ts —
        a step added on one side only is a cross-lang divergence."""
        index_ts = (schemas_dir().parent / "src" / "index.ts").read_text(encoding="utf-8")
        for step in STEPS:
            assert f"{step}: 'https://bellum.ai/schemas/{step}.schema.json'" in index_ts, step

    def test_schema_id_matches_its_filename(self) -> None:
        for step in STEPS:
            assert load_step_schema(step)["$id"] == f"https://bellum.ai/schemas/{step}.schema.json"

    def test_unknown_step_is_rejected(self) -> None:
        with pytest.raises(ValueError):
            load_step_schema("nope")

    def test_missing_schemas_dir_fails_explicitly_never_silently(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """An unresolvable schemas dir must RAISE (and log), not skip quietly."""
        schemas_dir.cache_clear()
        monkeypatch.setattr("app.contracts.shared_schemas._candidate_dirs", lambda: [tmp_path / "nowhere"])
        with pytest.raises(SharedSchemasNotFound):
            schemas_dir()
        schemas_dir.cache_clear()

    def test_env_var_pointing_at_an_incomplete_dir_is_not_accepted(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """A dir missing one step schema must not be picked — else validation
        would silently no-op on that step."""
        partial = tmp_path / "partial"
        partial.mkdir()
        (partial / "research.schema.json").write_text("{}", encoding="utf-8")
        schemas_dir.cache_clear()
        monkeypatch.setattr("app.contracts.shared_schemas._candidate_dirs", lambda: [partial])
        with pytest.raises(SharedSchemasNotFound):
            schemas_dir()
        schemas_dir.cache_clear()

    def test_env_override_is_honoured_first(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        """The container escape hatch: a complete copy pointed at by the env var
        must win over the monorepo walk-up."""
        copied = tmp_path / "vendored"
        copied.mkdir()
        for step in STEPS:
            (copied / f"{step}.schema.json").write_text(
                json.dumps(load_step_schema(step), ensure_ascii=False), encoding="utf-8"
            )
        schemas_dir.cache_clear()
        monkeypatch.setenv("BELLUM_SHARED_SCHEMAS_DIR", str(copied))
        assert schemas_dir() == copied
        schemas_dir.cache_clear()


class TestVendoredCopy:
    """`packages/shared/schemas` is NOT in the IA deployment's build context
    (Railway root = apps/ia), so a copy ships next to the code. A duplicate that
    can drift is exactly the problem #273 exists to kill — these are its guards."""

    def test_the_vendored_copy_exists_and_holds_every_step(self) -> None:
        assert VENDORED_DIR.is_dir(), "the vendored copy must ship with the service"
        for step in STEPS:
            assert (VENDORED_DIR / f"{step}.schema.json").is_file(), step

    def test_the_vendored_copy_is_byte_identical_to_the_source_of_truth(self) -> None:
        """THE anti-divergence guard. Edit a schema in packages/shared without
        re-running `python -m app.contracts.sync_schemas` and this fails."""
        missing, extra, different = vendored_diff(canonical_dir(), VENDORED_DIR)
        assert (missing, extra, different) == ([], [], []), (
            "copie embarquée obsolète — lancer `python -m app.contracts.sync_schemas`"
        )

    def test_the_sync_check_mode_agrees(self) -> None:
        assert sync_main(["--check"]) == 0

    def test_the_sync_check_mode_detects_a_tampered_copy(self, tmp_path: Path, monkeypatch) -> None:
        """Prove the guard has teeth: a same-shape edit must still be caught
        (content comparison, not size/mtime).

        ⚠️ Ce test a été FLAKY, et il avait raison de l'être. `diff()` utilisait
        `filecmp.cmp(..., shallow=False)`, qui consulte un cache indexé sur
        `(taille, mtime)` AVANT de lire les octets. L'édition ci-dessous garde la
        même LONGUEUR ; quand les deux écritures tombent dans le même tick de
        mtime, `filecmp` rendait le verdict précédent — « identiques » — et la
        garde laissait passer une copie falsifiée.

        On force donc les deux conditions au lieu d'espérer les rencontrer : même
        taille ET même mtime que la copie d'origine. Le test échoue de façon
        déterministe sur l'ancienne implémentation, et passe sur la nouvelle.
        """
        fake = tmp_path / "vendored"
        fake.mkdir()
        canonical = canonical_dir()
        for path in canonical.glob("*.schema.json"):
            (fake / path.name).write_bytes(path.read_bytes())
        assert vendored_diff(canonical, fake) == ([], [], [])

        victim = fake / "classify.schema.json"
        before = victim.stat()
        original = victim.read_text(encoding="utf-8")
        tampered = original.replace("decideur", "decideuR", 1)
        # La falsification doit MORDRE : si la chaîne visée disparaît du schéma,
        # `replace` devient un no-op et le test ne prouverait plus rien.
        assert tampered != original, "la chaîne visée n'existe plus dans classify.schema.json"
        victim.write_text(tampered, encoding="utf-8")
        assert victim.stat().st_size == before.st_size, "l'édition doit rester de même taille"
        os.utime(victim, ns=(before.st_atime_ns, before.st_mtime_ns))

        assert vendored_diff(canonical, fake)[2] == ["classify.schema.json"]

    def test_the_vendored_copy_carries_no_test_fixtures(self) -> None:
        """The image must not ship several hundred KB of fixtures — nothing reads
        them at runtime."""
        assert not (VENDORED_DIR / "__fixtures__").exists()


class TestContainerLayout:
    """The layout that actually runs in production: `apps/ia` alone, with no
    `packages/` anywhere up the tree. Everything above this class exercises the
    monorepo layout, which is NOT what Railway deploys."""

    @staticmethod
    def _container_only(monkeypatch) -> None:
        """Simulate the container: the monorepo walk-up finds nothing, so the
        vendored copy is the only candidate left."""
        import app.contracts.shared_schemas as mod

        monkeypatch.setattr(mod, "_candidate_dirs", lambda: [mod.VENDORED_DIR])
        schemas_dir.cache_clear()
        load_step_schema.cache_clear()

    @pytest.fixture(autouse=True)
    def _clear_caches(self):
        yield
        schemas_dir.cache_clear()
        load_step_schema.cache_clear()

    def test_resolves_the_vendored_copy_when_the_monorepo_is_absent(self, monkeypatch) -> None:
        self._container_only(monkeypatch)
        assert schemas_dir() == VENDORED_DIR

    def test_validation_is_fully_functional_in_the_container_layout(self, monkeypatch) -> None:
        """Not just "a path resolves" — the contract must actually be enforced
        from the shipped copy."""
        self._container_only(monkeypatch)
        for step in STEPS:
            assert load_step_schema(step)["$id"].endswith(f"{step}.schema.json")
        # A real drift is caught…
        assert validate_step("classify", {"contacts": [{"bucket": "not-a-bucket"}]})
        assert validate_step("research", {"priority_score": "high"})
        # …and the branchable guard reads its annotation from the shipped file too.
        assert branchable_fields("classify")["items"]["contacts"]

    def test_the_env_override_still_wins_in_the_container_layout(self, monkeypatch, tmp_path: Path) -> None:
        override = tmp_path / "mounted"
        override.mkdir()
        for path in canonical_dir().glob("*.schema.json"):
            (override / path.name).write_bytes(path.read_bytes())
        schemas_dir.cache_clear()
        monkeypatch.setenv("BELLUM_SHARED_SCHEMAS_DIR", str(override))
        assert schemas_dir() == override

    def test_the_service_still_starts_when_nothing_resolves(self, monkeypatch, tmp_path: Path) -> None:
        """Belt and braces: strip the vendored copy too and the pipeline hook must
        still be a no-op rather than an exception — a missing contract must never
        take the service down."""
        import app.contracts.shared_schemas as mod

        monkeypatch.setattr(mod, "_candidate_dirs", lambda: [tmp_path / "nowhere"])
        schemas_dir.cache_clear()
        load_step_schema.cache_clear()
        assert validate_step_output("classify", {"contacts": []}, strict=False) == []


class TestFixturesValidate:
    """The round-trip: every committed fixture honours its step's contract."""

    def test_research_fixtures_validate(self) -> None:
        contracts_fixtures = schemas_dir().parent.parent / "contracts" / "src" / "fixtures"
        for name in ("research.societe-generale.json", "research.doctolib.json"):
            payload = json.loads((contracts_fixtures / name).read_text(encoding="utf-8"))
            assert validate_step("research", payload) == [], name

    @pytest.mark.parametrize(("step", "fixture", "rows"), FIXTURES)
    def test_committed_fixtures_validate(self, step: str, fixture: str, rows: bool) -> None:
        payload = _fixture(fixture)
        assert payload, f"{fixture} must not be empty"
        for index, item in enumerate(payload if rows else [payload]):
            assert validate_step(step, item) == [], f"{fixture}[{index}]"


class TestDriftIsCaught:
    """The point of the exercise: drift must be IMPOSSIBLE to merge in silence."""

    def test_a_wrong_type_fails_validation(self) -> None:
        errors = validate_step("research", {"priority_score": "high"})
        assert errors, "a string priority_score must violate the research contract"

    def test_an_off_taxonomy_enum_fails_validation(self) -> None:
        assert validate_step("contacts", {"bucket": "not-a-bucket"})
        assert validate_step("contacts", {"bucket": "decideur"}) == []

    def test_a_classify_contact_outside_the_deck_taxonomy_fails(self) -> None:
        payload = {"contacts": [{"fullName": "X", "hierarchyLevel": "supreme_leader"}]}
        assert validate_step("classify", payload)

    @pytest.mark.parametrize("step", STEPS)
    def test_every_step_declares_the_fields_consumers_branch_on(self, step: str) -> None:
        assert branchable_fields(step)["root"], f"{step} declares no branchable field"

    @pytest.mark.parametrize(("step", "fixture", "rows"), FIXTURES)
    def test_fixtures_carry_every_branched_field(self, step: str, fixture: str, rows: bool) -> None:
        payload = _fixture(fixture)
        for item in payload if rows else [payload]:
            assert missing_branchable(step, item) == [], step

    @pytest.mark.parametrize(("step", "fixture", "rows"), FIXTURES)
    def test_an_amputated_fixture_is_caught(self, step: str, fixture: str, rows: bool) -> None:
        """THE guard the DoD asks for: drop a branched field from a real payload
        and the round-trip must fail. The schemas are permissive (nothing is
        `required`) so plain JSON-Schema validation would happily accept the
        amputation — `x-bellum-branchable` is what makes it fail, identically in
        vitest and here."""
        raw = _fixture(fixture)
        subject = raw[0] if rows else raw
        victim = branchable_fields(step)["root"][0]
        amputated = copy.deepcopy(subject)
        del amputated[victim]
        # Plain JSON-Schema validation still passes — that is exactly why the guard exists.
        assert validate_step(step, amputated) == [], step
        assert missing_branchable(step, amputated) == [victim], step

    def test_an_amputated_nested_row_is_caught(self) -> None:
        """Same guard one level down: `bucket` is a Pydantic computed_field, so
        a classified contact without it means the IA stopped emitting it."""
        payload = copy.deepcopy(_fixture("real-run-sg.classify.json"))
        del payload["contacts"][0]["bucket"]
        assert missing_branchable("classify", payload) == ["contacts[0].bucket"]


class TestCamelCaseNormalisation:
    """Phase 1 emits camelCase on the IA wire; the research schema documents the
    STORED snake_case shape. Without normalisation the validation would be
    vacuous (every camel key swallowed by `additionalProperties: true`)."""

    def test_camel_wire_keys_are_checked_against_the_snake_contract(self) -> None:
        # `priorityScore` must be checked as `priority_score` → a string fails.
        assert validate_step("research", {"priorityScore": "high"})
        assert validate_step("research", {"priorityScore": 8}) == []
        # …and the /10 bound documented by the schema applies to the camel key too.
        assert validate_step("research", {"priorityScore": 42})

    def test_a_schema_documenting_camelcase_is_left_alone(self) -> None:
        # classify documents camelCase: `decisionChain` must NOT be renamed.
        assert validate_step("classify", {"decisionChain": {"description": "x"}}) == []
        assert validate_step("classify", {"decisionChain": 12})


class TestRuntimeHook:
    """The pipeline hook must never break a production run, and must fail loudly
    when CI asks it to."""

    def test_non_blocking_by_default_and_reports_the_violations(self, caplog) -> None:
        with caplog.at_level("ERROR"):
            errors = validate_step_output("research", {"priority_score": "high"}, strict=False)
        assert errors, "the violation must be returned to the caller"
        assert "Contrat partagé violé" in caplog.text

    def test_a_valid_payload_is_silent(self, caplog) -> None:
        with caplog.at_level("ERROR"):
            assert validate_step_output("classify", _fixture("real-run-sg.classify.json")) == []
        assert "Contrat partagé violé" not in caplog.text

    def test_strict_mode_raises(self) -> None:
        with pytest.raises(ValidationError):
            validate_step_output("research", {"priority_score": "high"}, strict=True)

    def test_strict_mode_can_be_switched_on_by_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("BELLUM_SCHEMA_STRICT", "true")
        with pytest.raises(ValidationError):
            validate_step_output("research", {"priority_score": "high"})

    def test_missing_schemas_degrade_to_a_no_op_but_never_crash_a_run(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        schemas_dir.cache_clear()
        load_step_schema.cache_clear()
        monkeypatch.setattr("app.contracts.shared_schemas._candidate_dirs", lambda: [tmp_path / "nowhere"])
        assert validate_step_output("research", {"priority_score": "high"}, strict=False) == []
        schemas_dir.cache_clear()
        load_step_schema.cache_clear()
