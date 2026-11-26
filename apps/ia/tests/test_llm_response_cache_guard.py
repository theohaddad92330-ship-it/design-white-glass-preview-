"""Garde CACHE-LLM : **aucun appel de classe C ne passe par le cache de réponse.**

Lit le CODE (AST de ``app/``) : chaque appel qui pose ``response_cache=True``
doit nommer un rôle (``prompt_name``) présent dans la liste blanche des appels
neutres. Le refus à l'exécution (``require_allowed``) existe aussi — cette garde
le rend visible en CI, avant qu'un appel ne parte.

Deux preuves obligatoires : elle LIT (les appels A attendus sont trouvés) et
elle sait dire NON (un appel de classe C fabriqué est refusé).
"""

from __future__ import annotations

import ast
import pathlib

from app.services import llm_response_cache

_APP = pathlib.Path(__file__).resolve().parents[1] / "app"

#: Les appels de classe A branchés : fichier → rôle. Un ajout ici est un ajout
#: À LA LISTE BLANCHE, avec sa raison dans ``llm_response_cache``.
_EXPECTED = {
    ("routers/search_entity.py", "bellum_search_entity_extract"),
    ("services/esn_prefill.py", "bellum_esn_prefill"),
    ("services/account_vocabulary.py", "bellum_vocabulary_builder"),
    ("routers/rfp.py", "public_document_text"),
}

#: Les lectures de FICHIER n'ont pas de ``prompt_name`` : leur rôle est fixe
#: (``ocr.PUBLIC_DOCUMENT_ROLE``), et l'appelant qui les demande doit être une
#: voie de document PUBLIC.
_FILE_READERS = {"read_document", "extract_text_with_route"}
_FILE_ROLE = "public_document_text"


def _module_constants(tree: ast.Module) -> dict[str, str]:
    out: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    out[target.id] = node.value.value
    return out


def cached_calls(source: str) -> list[str | None]:
    """Les rôles des appels qui demandent le cache de réponse (``None`` = rôle
    illisible statiquement — refusé lui aussi : un rôle se lit dans le code)."""
    tree = ast.parse(source)
    constants = _module_constants(tree)
    roles: list[str | None] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        keywords = {kw.arg: kw.value for kw in node.keywords if kw.arg}
        flag = keywords.get("response_cache")
        if not (isinstance(flag, ast.Constant) and flag.value is True):
            continue
        func = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", None)
        name = keywords.get("prompt_name")
        if name is None and func in _FILE_READERS:
            roles.append(_FILE_ROLE)
        elif isinstance(name, ast.Constant) and isinstance(name.value, str):
            roles.append(name.value)
        elif isinstance(name, ast.Name):
            roles.append(constants.get(name.id))
        else:
            roles.append(None)
    return roles


def refused(roles: list[str | None]) -> list[str | None]:
    return [role for role in roles if role is None or not llm_response_cache.is_allowed(role)]


def _scan() -> set[tuple[str, str | None]]:
    found: set[tuple[str, str | None]] = set()
    for path in _APP.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "response_cache=True" not in text:
            continue
        for role in cached_calls(text):
            found.add((path.relative_to(_APP).as_posix(), role))
    return found


def test_the_guard_reads_the_code() -> None:
    found = _scan()
    assert found >= _EXPECTED, f"appels de classe A attendus introuvables : {sorted(_EXPECTED - found)}"


def test_no_cached_call_is_outside_the_allowlist() -> None:
    found = _scan()
    offenders = [(path, role) for path, role in found if refused([role])]
    assert not offenders, f"cache de réponse demandé hors liste blanche (classe C ?) : {offenders}"
    assert found == _EXPECTED, f"un appel nouveau passe par le cache de réponse : {sorted(found - _EXPECTED)}"


def test_the_guard_says_no() -> None:
    private = 'await call_claude(s, u, prompt_name="bellum_chat_title", response_cache=True)'
    assert refused(cached_calls(private)) == ["bellum_chat_title"]
    dynamic = "await call_claude(s, u, prompt_name=f'x{n}', response_cache=True)"
    assert refused(cached_calls(dynamic)) == [None]
    by_constant = '_P = "bellum_search_entity_extract"\nawait call_claude(s, u, prompt_name=_P, response_cache=True)'
    assert refused(cached_calls(by_constant)) == []
    assert refused(cached_calls("await read_document(raw, name, response_cache=True)")) == []
    assert refused(cached_calls("await parse_cv(raw, response_cache=True)")) == [None]


def test_the_file_role_is_the_one_the_reader_uses() -> None:
    from app.services import ocr

    assert ocr.PUBLIC_DOCUMENT_ROLE == _FILE_ROLE
