"""Shared Pappers credential helper.

Lives in a private module so both ``search`` and ``detail`` can call it
without duplicating the same env-read+ValueError boilerplate.
"""

from __future__ import annotations

import os


def get_api_key() -> str:
    """Return ``PAPPERS_API_KEY`` from the environment.

    Raises ``ValueError`` with a single canonical message when the key is
    missing — callers can assume any path past this function has a usable
    key.
    """
    api_key = os.environ.get("PAPPERS_API_KEY", "")
    if not api_key:
        raise ValueError(
            "PAPPERS_API_KEY environment variable is not set. "
            "Cannot query the Pappers API."
        )
    return api_key
