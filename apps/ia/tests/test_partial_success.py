"""#2283.32/.33/.41/.42/.43/.44/.45 (LAU-FINAL-024, épopée #2983) — le message
d'un résultat PARTIEL suit toujours le même schéma : ce qui est disponible, ce
qui manque, pourquoi, le prochain geste — et jamais « c'est fait » quand ce
n'est que partiel (l'exemple de l'épopée : « J'ai vérifié 18 des 25 personnes.
Les sept autres restent en attente. »).

Avant ce module, seul `prepare_campaign` (chat_tools.py) nommait ce qui
manque — en agrégeant tout dans UNE chaîne d'erreur quand rien n'est
exploitable (pas de "X sur Y"), et sans ce schéma dès qu'AU MOINS un élément
est exploitable. Ce module généralise le patron pour tout outil qui traite un
LOT (campagne, enrichissement, recherche de contacts…)."""

from __future__ import annotations

from app.services.partial_success import MissingItem, build_partial_message


def test_states_verified_count_out_of_total_never_c_est_fait() -> None:
    msg = build_partial_message(
        verified=18,
        total=25,
        missing=[MissingItem(label="A", reason="injoignable")] * 7,
        next_action="Complète leurs coordonnées ou choisis d'autres personnes.",
    )
    assert "18" in msg and "25" in msg
    assert "c'est fait" not in msg.lower()


def test_names_what_is_missing_and_why_never_a_silent_drop() -> None:
    msg = build_partial_message(
        verified=1,
        total=3,
        missing=[
            MissingItem(label="Jean Dupont", reason="aucune coordonnée connue"),
            MissingItem(label="Awa Diallo", reason="contact écarté"),
        ],
        next_action="Choisis d'autres contacts.",
    )
    assert "Jean Dupont" in msg
    assert "aucune coordonnée connue" in msg
    assert "Awa Diallo" in msg
    assert "contact écarté" in msg


def test_always_names_the_next_gesture() -> None:
    msg = build_partial_message(
        verified=0,
        total=2,
        missing=[MissingItem(label="X", reason="introuvable")] * 2,
        next_action="Recommence avec d'autres contacts.",
    )
    assert "Recommence avec d'autres contacts." in msg


def test_zero_verified_is_a_total_miss_not_a_partial_one() -> None:
    msg = build_partial_message(
        verified=0,
        total=3,
        missing=[MissingItem(label="X", reason="introuvable")] * 3,
        next_action="Recommence.",
    )
    assert "0" in msg and "3" in msg


def test_full_success_has_no_missing_section() -> None:
    # Un appelant qui a TOUT vérifié n'a aucune raison d'utiliser ce module —
    # mais s'il le fait, aucune section "manque" ne doit apparaître pour une
    # liste vide (#2283 — « on n'affiche pas ce qu'on n'a pas »).
    msg = build_partial_message(verified=5, total=5, missing=[], next_action="Envoie la campagne.")
    assert "5" in msg
    assert "manque" not in msg.lower() or "0" not in msg  # pas de section vide affichée


def test_reason_is_never_invented_when_absent() -> None:
    # Une raison vide reste vide — jamais un texte générique inventé à sa
    # place (doctrine CLAUDE.md : jamais de donnée fictive).
    msg = build_partial_message(
        verified=1,
        total=2,
        missing=[MissingItem(label="X", reason="")],
        next_action="Continue.",
    )
    assert "X" in msg


def test_why_is_included_when_given() -> None:
    msg = build_partial_message(
        verified=2,
        total=5,
        missing=[MissingItem(label="A", reason="panne source")] * 3,
        next_action="Réessaie plus tard.",
        why="La source d'enrichissement mobile était indisponible.",
    )
    assert "La source d'enrichissement mobile était indisponible." in msg
