"""GET /config/prompt-registry — #2445.1 (épopée #2766) : la LISTE des prompts
enregistrés avec leur version (hash de template), pour la console d'opérations
IA. Lecture seule ; diff contre une version antérieure et rollback restent hors
de cette tranche (aucune historisation des versions passées n'existe encore —
inventer un diff sans elle fabriquerait une preuve non vérifiable)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.prompts.registry import prompt_registry_canonical_fingerprint, registry_names


def test_liste_chaque_prompt_enregistre_avec_sa_version(client: TestClient) -> None:
    res = client.get("/config/prompt-registry")
    assert res.status_code == 200
    prompts = {p["name"]: p for p in res.json()["prompts"]}

    assert set(prompts) == set(registry_names())


def test_la_version_est_le_hash_canonique_du_registre(client: TestClient) -> None:
    canonical = prompt_registry_canonical_fingerprint()
    prompts = {p["name"]: p for p in client.get("/config/prompt-registry").json()["prompts"]}

    for name, version in canonical.items():
        assert prompts[name]["version"] == version


def test_aucun_prompt_nest_deviné_le_registre_reste_la_seule_source(client: TestClient) -> None:
    prompts = client.get("/config/prompt-registry").json()["prompts"]
    # Chiffre plancher, pas exact : la garde ne doit pas tomber parce qu'on
    # enregistre un prompt de plus, mais elle doit tomber si le registre
    # cesse d'en être la source.
    assert len(prompts) >= len(registry_names())
    for entry in prompts:
        assert isinstance(entry["version"], str) and len(entry["version"]) == 12
