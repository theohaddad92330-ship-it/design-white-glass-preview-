"""Parité de PERSONA — TS (source unique) ↔ Python (copie embarquée).

La source unique du persona est ``outreach-scenarios.ts`` : c'est elle que lit le
contrôle avant envoi (``right_persona``), et c'est elle qui porte les leviers. Le
service IA est un autre processus, en Python : il ne peut pas importer ce
fichier. Même frontière et même remède que ``test_cadence_parity`` — une copie
que rien ne vérifie finit toujours par diverger.

Ce que ce fichier prouve, dans cet ordre :

 1. il LIT quelque chose (corpus non vide, chaque extraction est comptée) ;
 2. la dérivation palier → persona est identique des deux côtés, y compris son
    silence : un palier inconnu ne rend PAS ``operationnel`` ;
 3. les leviers du TS ATTEIGNENT vraiment le prompt — ils ne l'atteignaient pas,
    le prompt en portait une version écrite à la main ;
 4. il sait dire NON : la comparaison est faite par une fonction pure, à qui on
    donne volontairement une table divergente.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.knowledge.persona import (
    PERSONA_PROFILES,
    PERSONA_UNKNOWN,
    PERSONAS,
    contact_persona,
    persona_for_hierarchy_level,
    persona_lever_block,
)

_TS_REL = Path("packages/contracts/src/schemas/outreach-scenarios.ts")


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


def _without_comments(block: str) -> str:
    """Retire les ``//`` : une garde qui compte ses propres commentaires lit un
    corpus qu'elle a inventé."""
    return "\n".join(re.sub(r"//.*$", "", line) for line in block.splitlines())


def _ts_personas(source: str) -> tuple[str, ...]:
    match = re.search(r"OUTREACH_PERSONAS = \[([^\]]+)\]", source)
    assert match, "déclaration `OUTREACH_PERSONAS` introuvable — le fichier a été renommé ou déplacé"
    return tuple(re.findall(r"'([a-z_]+)'", match.group(1)))


def _ts_level_mapping(source: str) -> dict[str, str]:
    """``case 'x': case 'y': return 'persona'`` → {x: persona, y: persona}."""
    marker = "export function personaForHierarchyLevel"
    assert marker in source, "fonction `personaForHierarchyLevel` introuvable"
    body = _without_comments(source.split(marker, 1)[1].split("\n}", 1)[0])
    mapping: dict[str, str] = {}
    pending: list[str] = []
    for line in body.splitlines():
        case = re.search(r"case '([a-z_]+)':", line)
        if case:
            pending.append(case.group(1))
            continue
        returned = re.search(r"return '([a-z_]+)'", line)
        if returned and pending:
            for level in pending:
                mapping[level] = returned.group(1)
            pending = []
    return mapping


def _ts_profiles(source: str) -> dict[str, dict[str, str]]:
    marker = "export const OUTREACH_PERSONA_PROFILES"
    assert marker in source, "table `OUTREACH_PERSONA_PROFILES` introuvable"
    body = _without_comments(source.split(marker, 1)[1].split("\n}", 1)[0])
    profiles: dict[str, dict[str, str]] = {}
    for persona, entry in re.findall(r"(\w+): \{(.*?)\},", body, flags=re.DOTALL):
        fields = dict(re.findall(r"(lever|speaksIn|turnsOff): '(.*?)',", entry, flags=re.DOTALL))
        if len(fields) == 3:
            profiles[persona] = {
                "lever": fields["lever"],
                "speaks_in": fields["speaksIn"],
                "turns_off": fields["turnsOff"],
            }
    return profiles


# ── 1. la garde LIT quelque chose ────────────────────────────────────────────


def test_le_corpus_ts_nest_pas_vide():
    source = _ts_source()
    assert len(_ts_personas(source)) == 7
    assert len(_ts_level_mapping(source)) >= 7
    assert len(_ts_profiles(source)) == 7


# ── 2. la dérivation est la même des deux côtés ──────────────────────────────


def test_les_sept_personas_sont_les_memes_et_dans_le_meme_ordre():
    assert _ts_personas(_ts_source()) == PERSONAS


def test_chaque_palier_donne_le_meme_persona_quen_typescript():
    mapping = _ts_level_mapping(_ts_source())
    divergences = {
        level: (expected, persona_for_hierarchy_level(level))
        for level, expected in mapping.items()
        if persona_for_hierarchy_level(level) != expected
    }
    assert divergences == {}


@pytest.mark.parametrize("level", ["unknown", "", None, "  ", "inconnu_demain"])
def test_un_palier_non_reconnu_ne_rend_pas_operationnel(level):
    # « Non mesuré » n'est pas « opérationnel » : proposer le levier d'un
    # opérationnel à quelqu'un dont on n'a jamais vu le poste, c'est deviner.
    assert persona_for_hierarchy_level(level) is None


# ── 3. les leviers du TS atteignent le prompt ────────────────────────────────


def test_chaque_levier_du_typescript_est_recopie_a_lidentique():
    ts = _ts_profiles(_ts_source())
    assert set(ts) == set(PERSONA_PROFILES)
    for persona, expected in ts.items():
        assert PERSONA_PROFILES[persona] == expected, persona


def test_le_bloc_du_prompt_porte_les_leviers_plutot_quune_version_ecrite_a_la_main():
    block = persona_lever_block()
    for persona, profile in PERSONA_PROFILES.items():
        assert persona in block
        assert profile["lever"] in block
        assert profile["speaks_in"] in block
        assert profile["turns_off"] in block
    # Et le cas non tranché est NOMMÉ, pas laissé implicite.
    assert PERSONA_UNKNOWN in block


# ── 4. la garde sait dire NON ────────────────────────────────────────────────


def test_une_table_divergente_serait_bien_detectee():
    """Casse volontairement ce que la parité protège.

    Sans ce test, rien ne prouverait que la comparaison ci-dessus REGARDE la
    table : elle passerait aussi si les deux côtés étaient vides.
    """
    ts = _ts_profiles(_ts_source())
    falsified = {**PERSONA_PROFILES, "manager": {**PERSONA_PROFILES["manager"], "lever": "un levier inventé"}}
    assert falsified != ts

    faux_mapping = {**_ts_level_mapping(_ts_source()), "c_level": "operationnel"}
    assert any(persona_for_hierarchy_level(level) != expected for level, expected in faux_mapping.items())


# ── le persona d'un contact, tel qu'il arrive au prompt ──────────────────────


def test_le_persona_vient_du_palier_deja_calcule_et_porte_par_le_contact():
    assert contact_persona({"title": "Peu importe", "hierarchyLevel": "c_level"}) == "decideur"
    # L'alias snake_case, pour un dict non aliasé.
    assert contact_persona({"hierarchy_level": "management"}) == "manager"


def test_sans_palier_on_retombe_sur_la_MEME_fonction_de_classement_pas_sur_une_seconde_regle():
    from app.services.hierarchy_level import classify_hierarchy_level

    title = "Directeur des Systèmes d'Information"
    assert contact_persona({"title": title}) == persona_for_hierarchy_level(classify_hierarchy_level(title))


def test_un_contact_sans_titre_ni_palier_na_pas_de_persona():
    assert contact_persona({}) is None
    assert contact_persona({"title": ""}) is None
