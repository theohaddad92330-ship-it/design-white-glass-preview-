"""Parité de CADENCE — TS (source unique) ↔ Python (copie embarquée).

La source unique du rythme de relance est ``PATTERNS`` dans
``apps/api/src/modules/contacts/cadence-templates.ts`` : c'est elle qui calcule
le ``due_date`` de chaque touche, qui écrit ``action_plan_items.cadence_step`` et
que le cron « Rappels de relance » lit. Le service IA n'a pas le paquet contracts
à l'exécution — et de toute façon la table vit côté API — donc il en porte une
copie dans ``relationship_playbook``. Une copie que rien ne vérifie finit
toujours par diverger : c'est exactement ce qui s'était produit, le prompt
annonçant « J+3 relance » sous une échéance calculée à J+7.

Même discipline que ``test_application_sectors_parity`` : le test PROUVE qu'il
lit quelque chose avant de comparer — une garde qui extrait zéro entrée est verte
pour toujours.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.relationship_playbook import (
    CADENCE_PATTERNS,
    REVENUE_POST_DELIVERY_DAYS,
    REVENUE_STRETCH_FACTOR,
    REVENUE_TIGHTEN_FACTOR,
    STATE_TO_CADENCE_TEMPLATE,
    cadence_directive_block,
    cadence_touches_for_state,
)

_TS_REL = Path("apps/api/src/modules/contacts/cadence-templates.ts")


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _ts_source() -> str:
    source_path = _monorepo_file(_TS_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    return source_path.read_text(encoding="utf-8")


def _section(source: str, marker: str) -> str:
    """Le corps littéral d'une déclaration ``const <marker> ... = { ... }``.

    Les commentaires ``//`` sont RETIRÉS avant toute extraction : une garde qui
    compte ses propres commentaires lit un corpus qu'elle a inventé.
    """
    assert marker in source, f"déclaration `{marker}` introuvable — le fichier a été renommé ou déplacé"
    body = source.split(marker, 1)[1].split("\n}", 1)[0]
    return "\n".join(re.sub(r"//.*$", "", line) for line in body.splitlines())


_TOUCH_RE = re.compile(r"touch\('([a-z_]+)',\s*(\d+)\)")
_PATTERN_LINE_RE = re.compile(r"^\s*([a-z_0-9]+):\s*\[(.+)\],\s*$")
_STATE_LINE_RE = re.compile(r"^\s*([a-z_0-9]+):\s*'([a-z_0-9]+)',\s*$")


def _ts_patterns(source: str) -> dict[str, dict[str, int]]:
    patterns: dict[str, dict[str, int]] = {}
    for line in _section(source, "const PATTERNS").splitlines():
        match = _PATTERN_LINE_RE.match(line)
        if not match:
            continue
        template, touches = match.group(1), match.group(2)
        patterns[template] = {key: int(offset) for key, offset in _TOUCH_RE.findall(touches)}
    return patterns


def _ts_state_to_template(source: str) -> dict[str, str]:
    return dict(
        match.groups()  # type: ignore[arg-type]
        for match in (_STATE_LINE_RE.match(line) for line in _section(source, "const STATE_TO_TEMPLATE").splitlines())
        if match
    )


# ─────────────────────────── la garde LIT quelque chose ───────────────────────


def test_extraction_du_ts_nest_pas_vide() -> None:
    """Sans ce test, une regex qui ne matche plus rendrait la parité verte à vide."""
    source = _ts_source()
    patterns = _ts_patterns(source)
    states = _ts_state_to_template(source)

    assert len(patterns) == 9, f"9 patrons attendus dans cadence-templates.ts, {len(patterns)} extraits"
    assert len(states) == 10, f"10 états de relation attendus, {len(states)} extraits"
    for template, offsets in patterns.items():
        assert offsets, f"patron `{template}` extrait vide — la garde ne garderait rien"
        assert "initial" in offsets, f"patron `{template}` sans touche initiale — extraction partielle"


# ──────────────────────────────── la parité ───────────────────────────────────


def test_les_offsets_python_sont_ceux_du_ts() -> None:
    patterns = _ts_patterns(_ts_source())
    assert set(patterns) == set(CADENCE_PATTERNS), "patrons divergents entre TS et Python"
    for template, offsets in patterns.items():
        assert CADENCE_PATTERNS[template] == offsets, (
            f"{template}: offsets divergents — TS {offsets} vs Python {CADENCE_PATTERNS[template]}. "
            "La source est cadence-templates.ts (elle calcule les échéances réelles)."
        )


def test_la_table_etat_vers_patron_est_celle_du_ts() -> None:
    states = _ts_state_to_template(_ts_source())
    assert states == STATE_TO_CADENCE_TEMPLATE, "état de relation → patron divergent entre TS et Python"


# ─────────────────── ce que le prompt annonce = ce qui est planifié ───────────


def test_le_prompt_annonce_les_jours_reellement_planifies() -> None:
    """Le défaut d'origine : « J+3 relance » écrit dans le corps du message alors
    que la carte l'affiche sous une échéance calculée à J+7."""
    # Compte froid : le patron `standard` — la séquence historique.
    assert cadence_touches_for_state("froid") == [("relance", 3), ("preuve_sociale", 6), ("close_loop", 9)]
    # #4418.1 — la relation DÉCALE la série J+3/J+6/J+9, elle ne la remplace pas.
    assert cadence_touches_for_state("dormant") == [("relance", 7), ("preuve_sociale", 10), ("close_loop", 13)]
    assert cadence_touches_for_state("refere") == [("relance", 4), ("preuve_sociale", 7), ("close_loop", 10)]

    dormant = cadence_directive_block("dormant")
    assert "J+7" in dormant, "le bloc doit citer l'échéance réellement planifiée"
    assert "J+3" not in dormant, "J+3 est l'échéance du patron standard, pas celle d'un dormant"
    assert "preuve sociale" in dormant.lower(), "#4418.1 — les trois relances restent, seules leurs dates se décalent"


# ───────── #2645.2 — la modulation par le modèle de revenu, des deux côtés ────

_NUMBER_RE = re.compile(r"=\s*([0-9]+(?:\.[0-9]+)?)")


def _ts_constant(source: str, name: str) -> float:
    """La valeur littérale d'un `const <name> = <nombre>` du fichier TS."""
    for line in source.splitlines():
        stripped = re.sub(r"//.*$", "", line)
        if f"const {name} " in stripped:
            match = _NUMBER_RE.search(stripped)
            assert match, f"`const {name}` trouvé sans valeur numérique — extraction cassée"
            return float(match.group(1))
    raise AssertionError(f"`const {name}` introuvable dans cadence-templates.ts")


def test_les_facteurs_de_modulation_sont_ceux_du_ts() -> None:
    """#2645.2 — trois nombres recopiés dans deux langages. Sans cette garde,
    le prompt annoncerait J+3 là où la carte planifie J+2."""
    source = _ts_source()
    assert _ts_constant(source, "TIGHTEN_FACTOR") == REVENUE_TIGHTEN_FACTOR
    assert _ts_constant(source, "STRETCH_FACTOR") == REVENUE_STRETCH_FACTOR
    assert _ts_constant(source, "POST_DELIVERY_DAYS") == REVENUE_POST_DELIVERY_DAYS


def test_un_revenu_ponctuel_resserre_et_repousse_la_derniere_touche() -> None:
    # Standard resserré : J+3 → J+2, J+6 → J+4 ; la dernière part après livraison.
    assert cadence_touches_for_state("froid", "ponctuel") == [
        ("relance", 2),
        ("preuve_sociale", 4),
        ("close_loop", 34),
    ]
    # Référé : trois relances, la dernière est la reprise après livraison.
    assert cadence_touches_for_state("refere", "ponctuel") == [("relance", 3), ("preuve_sociale", 5), ("close_loop", 34)]


def test_un_revenu_recurrent_etire_le_suivi() -> None:
    assert cadence_touches_for_state("froid", "recurrent") == [
        ("relance", 5),
        ("preuve_sociale", 9),
        ("close_loop", 14),
    ]


def test_un_modele_non_declare_ne_change_rien() -> None:
    """GA-18/GA-19 — une valeur non mesurée ne se comporte pas comme une valeur
    mesurée : on ne resserre pas la relance de qui n'a rien déclaré."""
    for model in (None, "", "inconnu", "mixte", "modele-qui-nexiste-pas"):
        assert cadence_touches_for_state("froid", model) == cadence_touches_for_state("froid")


def test_le_prompt_dit_que_la_derniere_touche_est_une_reprise_apres_livraison() -> None:
    """Le déplacement de date ne suffit pas : le modèle doit SAVOIR pourquoi la
    dernière touche part si loin, sinon il écrit un close-loop de J+9 daté J+34."""
    bloc = cadence_directive_block("froid", "ponctuel")
    assert "J+34" in bloc
    assert "livraison" in bloc.lower()
    # Un revenu récurrent n'a pas de livraison qui ferme : pas de reprise.
    assert "livraison" not in cadence_directive_block("froid", "recurrent").lower()


def test_un_etat_inconnu_retombe_sur_le_patron_standard() -> None:
    """Miroir exact de `resolveRelationshipEvidence` côté TS : ce qu'on ne sait
    pas nommer vaut « froid », donc le patron standard — jamais un rythme deviné."""
    assert cadence_touches_for_state(None) == cadence_touches_for_state("froid")
    assert cadence_touches_for_state("") == cadence_touches_for_state("froid")
    assert cadence_touches_for_state("etat-qui-nexiste-pas") == cadence_touches_for_state("froid")
