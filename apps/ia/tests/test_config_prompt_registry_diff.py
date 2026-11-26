"""GET /config/prompt-registry/{name}/diff — #2445.1 (épopée #2766), la part
DIFF/ROLLBACK restée hors de la tranche `/config/prompt-registry` (liste
seule). Dérive du module `app.prompts.registry_history` déjà testé
(`test_prompt_registry_history.py`) : jamais une seconde façon de comparer un
contenu déjà pinné dans le golden set. Le rollback n'est JAMAIS exécuté — la
route ne rend que la commande git, comme `rollback_command`."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.prompts.registry_history import registered_prompt_names


def test_diff_rend_le_texte_git_diff_entre_deux_refs(client: TestClient) -> None:
    name = registered_prompt_names()[0]
    res = client.get(f"/config/prompt-registry/{name}/diff", params={"ref_a": "HEAD", "ref_b": "HEAD"})
    assert res.status_code == 200
    body = res.json()
    # HEAD vs HEAD : aucun changement, diff vide — mais la route a bien tourné
    # `git diff` (jamais une comparaison inventée).
    assert body["diff"] == ""
    assert body["rollbackCommand"][:3] == ["git", "checkout", "HEAD"]


def test_diff_404_sur_un_prompt_non_enregistre(client: TestClient) -> None:
    res = client.get("/config/prompt-registry/ce-prompt-nexiste-pas/diff", params={"ref_a": "HEAD"})
    assert res.status_code == 404


def test_diff_ref_a_obligatoire(client: TestClient) -> None:
    name = registered_prompt_names()[0]
    res = client.get(f"/config/prompt-registry/{name}/diff")
    assert res.status_code == 422
