"""#1611.4 / #1611.5 — le MIROIR Python de `market-expertise-match.ts`.

Trois choses à défendre, dans l'ordre :

1. Le mirroring lui-même (mêmes cas que `market-expertise-match.test.ts`) —
   accents, `C#`/`Go`, mots vides, `IT`.
2. La PARITÉ avec le fichier TypeScript : la liste des mots vides est comparée
   ligne à ligne, comme `test_focus_weights.py` le fait pour les poids de plan.
3. `reinforced_expertises` — la seule fonction que le pipeline appelle — ne
   laisse jamais passer un fait de mémoire marché : elle ne rend QUE des
   libellés pris dans la liste `offers` qu'on lui donne.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.services.market_memory_angle import (
    EMPTY_TOKENS,
    expertise_tokens,
    matching_expertises,
    reinforced_expertises,
)

_TS_SOURCE = (
    Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "schemas" / "market-expertise-match.ts"
)


def test_accents_sont_plies() -> None:
    assert expertise_tokens("Sécurité") == expertise_tokens("securite")


def test_ponctuation_de_saisie_coupee() -> None:
    assert expertise_tokens("Cloud & DevOps") == {"cloud", "devops"}


def test_garde_les_noms_courts_go_et_c_sharp() -> None:
    assert expertise_tokens("Go") == {"go"}
    assert expertise_tokens("C#") == {"c#"}


def test_jette_une_lettre_isolee() -> None:
    assert expertise_tokens("R") == frozenset()


def test_jette_les_mots_vides() -> None:
    assert expertise_tokens("Data and Cloud") == {"cloud", "data"}


def test_jette_it_qui_recoupe_la_moitie_du_corpus() -> None:
    assert expertise_tokens("Infrastructure IT") == {"infrastructure"}


def test_matching_expertises_rend_lordre_declare() -> None:
    assert matching_expertises(["Data", "Java", "AWS", "PMO"], ["Data / IA", "Cloud AWS", "Product"]) == [
        "Data / IA",
        "Cloud AWS",
    ]


def test_matching_expertises_sans_observation_rend_rien() -> None:
    assert matching_expertises([], ["Data / IA"]) == []


def test_matching_expertises_ne_rapproche_pas_java_et_javascript() -> None:
    assert matching_expertises(["JavaScript"], ["Java"]) == []


def test_parite_avec_le_fichier_typescript() -> None:
    """`EMPTY_TOKENS` ne doit JAMAIS diverger de sa source — une divergence
    ferait recouper deux libellés d'un côté et pas de l'autre, et le web et le
    pipeline IA cesseraient de renforcer les mêmes angles."""
    source = _TS_SOURCE.read_text(encoding="utf-8")
    match = re.search(r"const EMPTY_TOKENS[^\[]*\[([^\]]*)\]", source)
    assert match, "le fichier TypeScript n'a plus la forme attendue — la parité ne peut plus se lire"
    ts_tokens = {word.strip().strip("'").strip('"') for word in match.group(1).split(",")}
    ts_tokens = {word for word in ts_tokens if word}
    assert ts_tokens == set(EMPTY_TOKENS), ts_tokens.symmetric_difference(EMPTY_TOKENS)


# ── `reinforced_expertises` — la seule porte que le pipeline emprunte ───────


def test_reinforced_expertises_ne_rend_que_des_libelles_de_lesn() -> None:
    result = reinforced_expertises(
        observed_stack=["java", "cloud", "python"],
        offers=["Data & Intelligence Artificielle", "Cloud & Infrastructure"],
    )
    assert result == ["Cloud & Infrastructure"]
    # Rien d'autre que les libellés déclarés ne peut sortir de cette fonction —
    # aucun nom de techno observée n'apparaît tel quel dans la sortie.
    assert "java" not in result
    assert "cloud" not in result


def test_reinforced_expertises_rend_liste_vide_sans_couverture() -> None:
    assert reinforced_expertises(observed_stack=None, offers=["Data / IA"]) == []
    assert reinforced_expertises(observed_stack=[], offers=["Data / IA"]) == []


def test_reinforced_expertises_rend_liste_vide_sans_offre_declaree() -> None:
    assert reinforced_expertises(observed_stack=["java"], offers=None) == []


# ── Une entrée de `profile['offers']` qui n'est PAS une chaîne ──────────────
#
# Régression de production du 11/09/2026 : « Analysis failed in phase plan:
# TypeError: normalize() argument 2 must be str, not dict ». `profile_data` est
# un dictionnaire LIBRE, pas un contrat : `esnAnswersToProfileData` rend bien
# `offers: string[]`, mais ce n'est pas le seul producteur. Un dossier complet
# a été perdu pour un signal d'enrichissement.


def test_an_offer_carried_as_an_object_does_not_raise() -> None:
    """La forme exacte qui a fait tomber la phase `plan` en production."""
    assert reinforced_expertises(["python", "spark"], [{"label": "Data & IA"}]) == []


def test_an_offer_carried_as_an_object_still_matches_by_its_label() -> None:
    """Tolérer ne veut pas dire ignorer : le libellé lu s'apparie normalement,
    et c'est LUI qui ressort — jamais l'objet, qui traverserait jusqu'au prompt
    sous une forme que personne n'a écrite."""
    assert reinforced_expertises(["python", "spark"], [{"label": "Python"}]) == ["Python"]
    assert reinforced_expertises(["python"], [{"name": "Python"}]) == ["Python"]


def test_an_entry_without_a_readable_label_is_dropped_never_stringified() -> None:
    """`str({'id': 3})` rendrait « {'id': 3} », qui entrerait dans
    l'appariement comme un mot. Cette expertise-là n'a pas été déclarée."""
    assert reinforced_expertises(["python"], [{"id": 3}, None, 42, "Python"]) == ["Python"]
