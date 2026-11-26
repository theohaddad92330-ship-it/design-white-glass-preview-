"""#2283.24 — idempotency key par outil de chat.

Absent jusqu'ici côté IA (`grep -ri idempotency apps/ia` ne trouvait rien) ;
`workflow-run.entity.ts` côté API porte déjà ce concept, mais pour les
workflows Action OS, pas pour un appel d'outil de LECTURE/proposition du chat.

Le besoin ici est plus étroit que côté API : dédupliquer un appel STRICTEMENT
identique (même outil, même utilisateur, même entrée) relancé pendant que le
premier vient tout juste de répondre — le cas concret étant le retry interne
de `tool_resilience` qui ne doit jamais compter deux fois le même essai. Ce
n'est PAS un remplacement du verrou Action OS (double-clic sur une ÉCRITURE
réelle), déjà tenu par `action-router.service.spec.ts:898`."""

from __future__ import annotations

from app.services.tool_idempotency import idempotency_key_for, recent_result, remember_result


def test_same_tool_same_user_same_input_yields_same_key() -> None:
    k1 = idempotency_key_for("get_account_briefing", "user-1", {"account_id": "abc"})
    k2 = idempotency_key_for("get_account_briefing", "user-1", {"account_id": "abc"})
    assert k1 == k2


def test_key_order_of_dict_keys_does_not_matter() -> None:
    k1 = idempotency_key_for("get_account_briefing", "user-1", {"account_id": "abc", "sector": "it"})
    k2 = idempotency_key_for("get_account_briefing", "user-1", {"sector": "it", "account_id": "abc"})
    assert k1 == k2


def test_different_user_yields_a_different_key() -> None:
    # Deux utilisateurs qui appellent le même outil avec la même entrée ne
    # doivent JAMAIS partager un résultat — chacun lit son propre portefeuille.
    k1 = idempotency_key_for("get_account_briefing", "user-1", {"account_id": "abc"})
    k2 = idempotency_key_for("get_account_briefing", "user-2", {"account_id": "abc"})
    assert k1 != k2


def test_different_tool_yields_a_different_key() -> None:
    k1 = idempotency_key_for("get_account_briefing", "user-1", {"account_id": "abc"})
    k2 = idempotency_key_for("get_account_timeline", "user-1", {"account_id": "abc"})
    assert k1 != k2


def test_remember_then_recent_result_returns_the_cached_output() -> None:
    key = idempotency_key_for("get_account_briefing", "user-3", {"account_id": "xyz"})
    assert recent_result(key) is None
    remember_result(key, {"account_id": "xyz", "summary": "ok"})
    assert recent_result(key) == {"account_id": "xyz", "summary": "ok"}


def test_recent_result_expires_after_its_ttl(monkeypatch) -> None:
    import app.services.tool_idempotency as mod

    clock = {"t": 1000.0}
    monkeypatch.setattr(mod, "_now", lambda: clock["t"])
    key = idempotency_key_for("get_account_briefing", "user-4", {"account_id": "old"})
    remember_result(key, {"ok": True})
    assert recent_result(key) == {"ok": True}
    clock["t"] += mod.DEDUP_TTL_S + 1
    assert recent_result(key) is None
