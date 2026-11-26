from __future__ import annotations

import pytest

from app.models.progress import ProgressCallback
from app.services import progress as progress_module


class _Recorder:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def post(self, url, json=None, headers=None):  # noqa: ANN001
        self.calls.append({"url": url, "json": json, "headers": headers})
        return None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


@pytest.mark.asyncio
async def test_emit_progress_no_op_without_callback():
    # Should not raise nor try to network when callback is None.
    await progress_module.emit_progress(None, "research", "x", 10)


@pytest.mark.asyncio
async def test_emit_progress_posts_payload(monkeypatch):
    recorder = _Recorder()

    def fake_async_client(*_args, **_kwargs):
        return recorder

    # The progress callback secret now comes from the INTERNAL_API_SECRET env
    # (sent as the X-Internal-Secret header), not a per-callback field.
    monkeypatch.setenv("INTERNAL_API_SECRET", "s3cr3t")
    monkeypatch.setattr(progress_module.httpx, "AsyncClient", fake_async_client)
    # The SSRF guard resolves the host; `api` isn't resolvable in tests, so bypass
    # it here — this test asserts the POST payload, not the URL-safety check
    # (that has its own suite in test_progress_callback_url.py).
    monkeypatch.setattr(progress_module, "_is_safe_callback_url", lambda _url: True)

    cb = ProgressCallback(url="http://api/internal/progress", accountId="acc-1", jobId="job-1")
    await progress_module.emit_progress(cb, "research", "brave_done", 22, "12 hits")

    assert len(recorder.calls) == 1
    call = recorder.calls[0]
    assert call["url"] == "http://api/internal/progress"
    assert call["headers"] == {"X-Internal-Secret": "s3cr3t"}
    assert call["json"] == {
        "accountId": "acc-1",
        "jobId": "job-1",
        "phase": "research",
        "step": "brave_done",
        "percent": 22,
        "message": "12 hits",
    }


@pytest.mark.asyncio
async def test_emit_progress_swallows_errors(monkeypatch):
    class _Boom:
        async def __aenter__(self):
            raise RuntimeError("network down")

        async def __aexit__(self, *args):
            return False

    monkeypatch.setattr(progress_module.httpx, "AsyncClient", lambda *a, **k: _Boom())
    monkeypatch.setattr(progress_module, "_is_safe_callback_url", lambda _url: True)

    cb = ProgressCallback(url="http://api/x", accountId="a", jobId="j")
    # Must not raise.
    await progress_module.emit_progress(cb, "research", "x", 10)


@pytest.mark.asyncio
async def test_emit_progress_logs_context_on_error(monkeypatch):
    class _Boom:
        async def __aenter__(self):
            raise RuntimeError("network down")

        async def __aexit__(self, *args):
            return False

    warnings: list[str] = []

    monkeypatch.setattr(progress_module.httpx, "AsyncClient", lambda *a, **k: _Boom())
    monkeypatch.setattr(progress_module, "_is_safe_callback_url", lambda _url: True)
    monkeypatch.setattr(
        progress_module.logger,
        "warning",
        lambda msg, *args: warnings.append(msg % args),
    )

    cb = ProgressCallback(url="http://api/x", accountId="a", jobId="j")
    await progress_module.emit_progress(cb, "plan", "evaluation", 97)
    assert warnings
    assert "phase=plan" in warnings[0]
    assert "step=evaluation" in warnings[0]
