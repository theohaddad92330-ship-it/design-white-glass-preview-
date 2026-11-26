"""GET /config/rights-matrix — #2445.4 (épopée #2766) : la matrice des droits
de Laura, PAR OUTIL — lecture / proposition / dépense, pour la console
d'opérations IA. Introspection seule, ne change rien.

Ce que cette route NE prétend PAS : ni un axe « rôle » ni un axe « plan ».
Aucun des deux ne filtre le registre d'outils aujourd'hui — vérifié en lisant
`chat_tools.CHAT_TOOLS` et son dispatcher, jamais un rôle ni un plan consultés
avant d'exposer un outil au modèle. C'est cohérent avec la doctrine du dépôt
(« le rôle change l'ORDRE, jamais le CONTENU », c76) : le contenu du registre
est le MÊME pour tout le monde. La route le DIT plutôt que d'inventer deux
colonnes vides.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services import chat_tools
from app.services.tool_permissions import READ_ONLY_TOOLS, SPENDING_TOOLS


def test_chaque_outil_declare_porte_sa_permission(client: TestClient) -> None:
    res = client.get("/config/rights-matrix")
    assert res.status_code == 200
    body = res.json()
    tools = {row["tool"]: row for row in body["tools"]}

    declared_names = {str(tool["name"]) for tool in chat_tools.CHAT_TOOLS}
    assert set(tools) == declared_names


def test_la_permission_rendue_est_celle_du_classement_reel(client: TestClient) -> None:
    rows = {row["tool"]: row["permission"] for row in client.get("/config/rights-matrix").json()["tools"]}
    for name in READ_ONLY_TOOLS:
        assert rows[name] == "lecture de l'espace, scopée à la personne", name
    for name in SPENDING_TOOLS:
        assert rows[name] == "dépense de crédits, après confirmation", name
    # Un outil déclaré, ni lecture ni dépense, est une PROPOSITION.
    proposal_names = {str(t["name"]) for t in chat_tools.CHAT_TOOLS} - READ_ONLY_TOOLS - SPENDING_TOOLS
    assert proposal_names, "aucun outil de proposition trouvé — le corpus a changé de forme"
    for name in proposal_names:
        assert rows[name] == "proposition — seul le clic de la personne exécute", name


def test_ne_pretend_ni_role_ni_plan() -> None:
    """#2445.4 — « une matrice croisée plan/rôle/connecteur » supposerait que
    l'un des deux filtre le contenu. Aucun ne le fait (vérifié : aucune lecture
    de rôle ni de plan dans le dispatcher). La route ne les liste donc pas
    plutôt que de les inventer à zéro colonne."""
    import inspect

    source = inspect.getsource(chat_tools)
    for forbidden in ("user_role", "workspace_plan", "plan.tier"):
        assert forbidden not in source, (
            f"« {forbidden} » trouvé dans chat_tools.py : le registre filtre peut-être "
            "désormais par rôle ou par plan — le test qui affirme le contraire doit changer."
        )
