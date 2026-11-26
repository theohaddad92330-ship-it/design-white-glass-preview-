"""#2975 / #2440.82 — la déclaration d'évaluations de routage fournisseur,
ÉCRITE depuis la console d'opérations (table `llm_routing_eval_declarations`),
remplaçant le geste jusque-là réservé à qui pouvait poser une variable d'env
et redéployer. Voir `provider_evals.py` pour la lecture fusionnée (env ∪ table).
"""

from __future__ import annotations

import pytest

from app.services import provider_eval_declarations as decl


class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table: str, store: dict[str, dict]):
        self._table = table
        self._store = store
        self._method = "select"
        self._payload: dict | None = None
        self._eq_key: str | None = None
        self._eq_value: str | None = None

    def select(self, _columns: str = "*"):
        self._method = "select"
        return self

    def insert(self, payload: dict):
        self._method = "insert"
        self._payload = dict(payload)
        return self

    def update(self, payload: dict):
        self._method = "update"
        self._payload = dict(payload)
        return self

    def eq(self, column: str, value):
        self._eq_key = column
        self._eq_value = value
        return self

    async def aexecute(self):
        if self._method == "select":
            if self._eq_key is not None:
                rows = [r for r in self._store.values() if r.get(self._eq_key) == self._eq_value]
            else:
                rows = list(self._store.values())
            return _Res(rows)
        if self._method == "insert":
            self._store[self._payload["destination_key"]] = dict(self._payload)
            return _Res([dict(self._payload)])
        if self._method == "update":
            key = self._eq_value
            self._store[key] = {**self._store.get(key, {}), **self._payload}
            return _Res([dict(self._store[key])])
        raise AssertionError(f"unexpected method {self._method}")


class _Client:
    def __init__(self) -> None:
        self.store: dict[str, dict] = {}

    def table(self, name: str) -> _Query:
        assert name == "llm_routing_eval_declarations"
        return _Query(name, self.store)


class _RaisingClient:
    def table(self, _name: str):
        raise RuntimeError("supabase indisponible")


async def test_declarer_insere_une_ligne_neuve() -> None:
    client = _Client()
    await decl.declare("openai:gpt-4o", "matteo@bellum-it.com", sb=client)
    assert client.store["openai:gpt-4o"]["declared_by"] == "matteo@bellum-it.com"
    assert (await decl.declared_keys(sb=client)) == frozenset({"openai:gpt-4o"})


async def test_declarer_de_nouveau_corrige_la_ligne_plutot_que_de_la_dupliquer() -> None:
    client = _Client()
    await decl.declare("openai:gpt-4o", "matteo@bellum-it.com", sb=client)
    await decl.declare("openai:gpt-4o", "louis@bellum-it.com", note="rejoué 08/10", sb=client)
    assert len(client.store) == 1
    assert client.store["openai:gpt-4o"]["declared_by"] == "louis@bellum-it.com"
    assert client.store["openai:gpt-4o"]["note"] == "rejoué 08/10"


async def test_la_cle_se_normalise_espaces_et_casse() -> None:
    client = _Client()
    await decl.declare("  OpenAI:GPT-4o  ", "matteo@bellum-it.com", sb=client)
    assert (await decl.declared_keys(sb=client)) == frozenset({"openai:gpt-4o"})


async def test_cle_vide_leve_sans_ecrire() -> None:
    client = _Client()
    with pytest.raises(ValueError):
        await decl.declare("   ", "matteo@bellum-it.com", sb=client)
    assert client.store == {}


async def test_auteur_vide_leve_sans_ecrire() -> None:
    client = _Client()
    with pytest.raises(ValueError):
        await decl.declare("openai:gpt-4o", "   ", sb=client)
    assert client.store == {}


async def test_note_vide_devient_null_jamais_une_chaine_vide() -> None:
    client = _Client()
    await decl.declare("openai", "matteo@bellum-it.com", note="   ", sb=client)
    assert client.store["openai"]["note"] is None


async def test_lecture_fail_soft_sur_panne_jamais_une_exception() -> None:
    # Jamais bloquant : une panne de lecture ne doit jamais faire planter la
    # console d'opérations, et ne doit jamais faire passer une destination
    # pour « évaluée » qu'elle ne la laisse « à évaluer ».
    assert (await decl.declared_keys(sb=_RaisingClient())) == frozenset()


async def test_ecriture_sur_panne_remonte_l_echec() -> None:
    # À l'inverse : un geste explicite d'opérateur qui échoue doit se VOIR,
    # jamais un no-op silencieux qui laisserait croire que la déclaration a pris.
    with pytest.raises(RuntimeError):
        await decl.declare("openai:gpt-4o", "matteo@bellum-it.com", sb=_RaisingClient())
