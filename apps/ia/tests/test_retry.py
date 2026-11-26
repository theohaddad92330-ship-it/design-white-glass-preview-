from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

from app.services.retry import retry_with_backoff


class TestRetryWithBackoff:
    @pytest.mark.asyncio
    async def test_succeeds_first_try(self) -> None:
        fn = AsyncMock(return_value="ok")
        result = await retry_with_backoff(fn, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert fn.call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_failure(self) -> None:
        fn = AsyncMock(side_effect=[Exception("fail"), Exception("fail"), "ok"])
        result = await retry_with_backoff(fn, max_retries=3, base_delay=0.01)
        assert result == "ok"
        assert fn.call_count == 3

    @pytest.mark.asyncio
    async def test_raises_after_max_retries(self) -> None:
        fn = AsyncMock(side_effect=Exception("always fails"))
        with pytest.raises(Exception, match="always fails"):
            await retry_with_backoff(fn, max_retries=3, base_delay=0.01)
        assert fn.call_count == 3

    @pytest.mark.asyncio
    async def test_only_catches_specified_exceptions(self) -> None:
        fn = AsyncMock(side_effect=TypeError("wrong type"))
        with pytest.raises(TypeError):
            await retry_with_backoff(fn, max_retries=3, base_delay=0.01, exceptions=(ValueError,))
        assert fn.call_count == 1
