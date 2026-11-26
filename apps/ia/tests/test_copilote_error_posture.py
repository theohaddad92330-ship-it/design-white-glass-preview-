"""#2270.16, .18, .23 (épopée #2954) — la posture de Laura après SA PROPRE erreur.

Tri du 24/09/2026 : #2270 (LAU-FINAL-013) décrit un système entier de
réparation après erreur — ~22 règles, calibration de prompt + golden tests
dédiés, plusieurs jours de travail (voir le corps de #2954). Cette suite ne
couvre PAS ce système : elle prouve la plus petite tranche utile, les trois
points que l'audit du 25/09 (commentaire sur #2954) nommait comme des gaps
concrets et isolés, chacun réparable sans le protocole complet :

* #2270.16 — ne pas boucler sur des excuses pour une erreur de RAISONNEMENT
  (distinct du bloc support #1960, qui couvre les pannes du PRODUIT) ;
* #2270.18 — ne pas utiliser le prénom pour adoucir une erreur reconnue
  (distinct de la règle générale de fréquence du prénom, #2259.25) ;
* #2270.23 — pas de longue auto-justification après une erreur reconnue.

#2270.19, .20, .22 (les trois formules figées bannies) sont prouvées dans
``test_forbidden_phrasings.py`` (paniers ``COPILOT_FORBIDDEN_PHRASINGS``) —
pas ici, pour ne pas dupliquer l'oracle.

⚠️ CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS. Comme
``test_copilote_support_block.py`` : ils tiennent la RÈGLE écrite là où le
modèle la lit — le prompt système. Ils ne prouvent pas que le modèle
l'applique — ça reste l'éval en ligne.

Le reste de l'épopée (#2270.1-.9, .11-.15, .17, .25 — reconnaître le défaut,
nommer la cause, invalider, produire la réponse corrigée, indiquer l'inconnu,
refuser une demande commercialement mauvaise, produire une preuve de valeur,
plafonner les excuses à 20 % de la réponse) reste HORS de cette tranche :
protocole en plusieurs étapes + mesure (le plafond de 20 % ne se lit pas dans
un prompt, il se MESURE sur une réponse rendue) — tranché sans Louis, noté
dans le rapport de lot, pas dans ce fichier.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_LAURA, build_system_prompt
from app.prompts.forbidden_phrasings import LONG_SELF_JUSTIFICATION

#: Un prompt « nu » : tout ce qu'on y trouve vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")


def _line_of(heading: str) -> str:
    """La ligne du bloc qui ouvre par ``heading`` — un marqueur ailleurs ne compte pas."""
    lines = [line for line in _BLOCK_LAURA.splitlines() if line.startswith(heading)]
    assert len(lines) == 1, f"« {heading} » doit ouvrir exactement une ligne du bloc, trouvé {len(lines)}"
    return lines[0]


def test_the_block_reaches_the_bare_prompt():
    assert _BLOCK_LAURA in BARE


# ── #2270.18 — le prénom n'adoucit jamais une erreur reconnue ───────────────


def test_2270_18_the_first_name_rule_also_covers_softening_an_error():
    line = _line_of("PRÉNOM.")
    assert "jamais pour amortir une mauvaise nouvelle" in line, "la règle d'origine (#2259.25) ne doit pas disparaître"
    assert "ni pour adoucir une erreur que tu viens de reconnaître" in line


# ── #2270.23 — pas de longue auto-justification ─────────────────────────────


def test_2270_23_no_long_self_justification_after_an_error():
    line = _line_of(f"PAS DE {LONG_SELF_JUSTIFICATION.upper()}")
    assert "une phrase nomme la cause" in line
    assert "elle ne plaide pas" in line


# ── #2270.16 — pas de boucle d'excuses sur une erreur de raisonnement ───────


def test_2270_16_no_apology_loop_on_laura_s_own_reasoning_errors():
    line = _line_of("PAS DE BOUCLE D'EXCUSES SUR TES PROPRES CONCLUSIONS")
    assert "une erreur de raisonnement de ta part" in line
    # Témoin : la règle se distingue explicitement du bloc support (#1960),
    # qui couvre les pannes du PRODUIT — pas la même famille de problème.
    assert "PRODUIT" in line


def test_2270_16_stays_distinct_from_the_product_support_block():
    # Le bloc support (#1960) existe déjà et couvre un problème DIFFÉRENT
    # (« ça ne marche pas », un connecteur cassé) : cette règle ne le remplace
    # pas, elle comble le trou qu'il ne couvrait pas (l'erreur de Laura elle-même).
    from app.prompts.laura_support import BLOCK_SUPPORT

    assert BLOCK_SUPPORT in BARE
    assert _line_of("PAS DE BOUCLE D'EXCUSES SUR TES PROPRES CONCLUSIONS") not in BLOCK_SUPPORT
