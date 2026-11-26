"""#1903.22 — « CLARIFIE SEULEMENT LES CRITÈRES INDISPENSABLES ».

─────────────────────────────────────────────────────────────────────────────
CE QUE LE REGISTRE TROUVAIT PARTIEL, ET POURQUOI
─────────────────────────────────────────────────────────────────────────────
`ask_clarification` était déjà borné à UNE question par conversation
(`chat_orchestrator.py`, §9.4) et sa description disait déjà de ne l'utiliser
que si le modèle ne peut « RIEN faire d'utile sans la réponse » — mais rien
n'était SPÉCIFIQUE au routage : rien ne distinguait, avant une redirection
(`find_accounts`, `prepare_campaign`, `open_screen`, …), le critère qui BLOQUE
vraiment l'ouverture de l'écran d'un réglage qu'on peut ajuster une fois la
page ouverte (une fois sur `/discover`, les filtres restent modifiables —
#1903.19). Dépenser l'unique clarification de la conversation sur un réglage
secondaire, juste avant une redirection, la retirait pour tout ce qui suit.

Ce test ne peut pas observer un modèle en train de décider — il tient la
PROMPT, comme `test_chat_thread_ruled_out.py` le fait déjà pour `ruled_out` /
`assumptions`. Il sait dire NON : retirer la clause fait échouer
`test_the_description_names_routing_as_the_cheapest_criterion_only` sans y
toucher.
"""

from __future__ import annotations

from app.services.chat_tools import ASK_CLARIFICATION_TOOL


def test_the_description_already_bounds_usefulness() -> None:
    # Témoin du sol existant avant ce lot — ne doit pas régresser.
    description = ASK_CLARIFICATION_TOOL["description"]
    assert "RIEN faire d'utile sans la réponse" in description


def test_the_description_names_routing_as_the_cheapest_criterion_only() -> None:
    description = ASK_CLARIFICATION_TOOL["description"]
    assert "redirection" in description.lower() or "redirige" in description.lower()
    # Le mot qui distingue « bloque l'ouverture » d'un réglage ajustable une
    # fois l'écran ouvert (#1903.19) — sans lui, la clause ne dit rien de plus
    # que la borne générale déjà testée ci-dessus.
    assert "modifiable une fois l'écran ouvert" in description
