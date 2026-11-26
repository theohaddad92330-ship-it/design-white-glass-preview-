"""External-data collection helpers for Phase 1 research.

Three named entry points — one per provider — that the
``/phase/1/research`` router orchestrates. Each helper owns its own
soft-fail policy so a flaky upstream never kills the analysis: Brave
returns ``[]``, Pappers returns ``None``, Firecrawl returns an empty
``ResearchBundle``.

Submodules import each other in a chain (``firecrawl`` service → ``sources``
→ ``research.firecrawl`` wrapper), so this ``__init__`` deliberately does
**not** eagerly load every submodule. Doing so would create a circular
import at startup. Consumers should import the specific name from its
submodule, or the lazy attribute lookup below.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .brave import research_brave  # noqa: F401
    from .firecrawl import ResearchBundle, ResearchSource, research_firecrawl  # noqa: F401
    from .pappers import research_pappers  # noqa: F401
    from .sources import SourceCategory  # noqa: F401

__all__ = [
    "ResearchBundle",
    "ResearchSource",
    "SourceCategory",
    "research_brave",
    "research_firecrawl",
    "research_pappers",
]


def __getattr__(name: str) -> Any:
    """Lazy submodule attribute lookup — keeps the package importable from
    inside one of its own submodules without triggering a circular load.
    """
    if name == "research_brave":
        from .brave import research_brave as v

        return v
    if name in {"ResearchBundle", "ResearchSource", "research_firecrawl"}:
        from . import firecrawl as _fc

        return getattr(_fc, name)
    if name == "research_pappers":
        from .pappers import research_pappers as v

        return v
    if name == "SourceCategory":
        from .sources import SourceCategory as v

        return v
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
