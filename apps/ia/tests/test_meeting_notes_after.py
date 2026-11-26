"""#2319.61-.82 — le compte rendu d'APRÈS : entrées, extractions séparées, et
les deux interdits (aucun budget inventé, aucune mission créée)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.outputs.meeting_notes import (
    DateItem,
    Evidence,
    ExtractedItem,
    MeetingNotesOutput,
    Need,
    Opportunity,
)
from app.prompts.bellum_meeting_notes import build_system_prompt, build_user_prompt
from app.routers.notes import MeetingNotesRequest

# ── Les entrées (#2319.61-.63) ────────────────────────────────────────────────


def test_un_compte_rendu_importe_est_citable():
    prompt = build_user_prompt(notes="n", input_kind="imported_report")
    assert "compte rendu importé" in prompt
    assert "citables telles quelles" in prompt


def test_un_email_colle_est_dit_colle_et_jamais_lu_dans_la_boite():
    prompt = build_user_prompt(notes="n", input_kind="email")
    assert "e-mail COLLÉ par le commercial" in prompt
    assert "citables telles quelles" in prompt


def test_des_notes_restent_non_citables_par_defaut():
    assert "aucune phrase n'est une citation" in build_user_prompt(notes="n")


def test_la_transcription_historique_reste_citable():
    # `from_transcript` existait avant `input_kind` : il garde son sens.
    assert "transcription du rendez-vous" in build_user_prompt(notes="n", from_transcript=True)


def test_la_declaration_voyage_a_part_et_se_source_a_part():
    prompt = build_user_prompt(notes="Le client veut du Java.", user_statement="J'ai promis deux CV.")
    assert "DÉCLARATION DU COMMERCIAL" in prompt
    assert "J'ai promis deux CV." in prompt
    # La déclaration vient APRÈS les notes, dans son propre bloc.
    assert prompt.index("NOTES BRUTES") < prompt.index("DÉCLARATION DU COMMERCIAL")
    assert '"kind": "user-statement"' in build_system_prompt()


def test_sans_declaration_aucun_bloc_vide():
    assert "DÉCLARATION" not in build_user_prompt(notes="n")


def test_la_requete_refuse_une_nature_inconnue():
    assert MeetingNotesRequest(notes="n", input_kind="email").input_kind == "email"
    with pytest.raises(ValidationError):
        MeetingNotesRequest(notes="n", input_kind="mailbox")


# ── Les extractions séparées (#2319.64-.74) ──────────────────────────────────


def test_six_extractions_sont_demandees_nommement():
    system = build_system_prompt()
    for champ in ("facts", "requests", "criteria", "dates", "client_commitments", "user_commitments"):
        assert f"- {champ} :" in system, champ


def test_les_extractions_sont_vides_par_defaut():
    output = MeetingNotesOutput()
    assert output.facts == []
    assert output.requests == []
    assert output.criteria == []
    assert output.dates == []
    assert output.client_commitments == []
    assert output.user_commitments == []


def test_une_date_garde_son_echeance_telle_quelle():
    item = DateItem(label="Comité", when="fin octobre", evidence=Evidence(kind="transcript", excerpt="fin octobre"))
    assert item.when == "fin octobre"


def test_une_declaration_a_son_origine():
    item = ExtractedItem(content="Je rappelle lundi", evidence=Evidence(kind="user-statement"))
    assert item.evidence.kind == "user-statement"


# ── Ne pas surqualifier (#2319.79-.82) ───────────────────────────────────────


def test_les_qualifications_par_defaut_sont_prudentes():
    assert Opportunity(title="Migration").qualification == "to_qualify"
    assert Need(title="Deux devs").qualification == "potential"


def test_le_prompt_nomme_les_deux_libelles_prudents():
    system = build_system_prompt()
    assert "« Projet à qualifier »" in system
    assert "« Besoin potentiel »" in system
    assert "NE PAS SURQUALIFIER" in system


def test_le_prompt_interdit_le_budget_invente_et_la_mission_creee():
    system = build_system_prompt()
    assert "Tu n'inventes JAMAIS de budget" in system
    assert "Tu ne crées JAMAIS de mission" in system


def test_aucun_champ_budget_ni_mission_a_aucune_profondeur():
    def fields(model: type) -> set[str]:
        names: set[str] = set()
        for name, info in model.model_fields.items():
            names.add(name)
            annotation = info.annotation
            for candidate in getattr(annotation, "__args__", ()) or (annotation,):
                inner = getattr(candidate, "__args__", None)
                for sub in inner or (candidate,):
                    if isinstance(sub, type) and hasattr(sub, "model_fields"):
                        names |= fields(sub)
        return names

    names = fields(MeetingNotesOutput)
    assert len(names) > 20
    assert not [name for name in names if "budget" in name]
    assert not [name for name in names if "mission" in name]


def test_un_budget_glisse_par_le_modele_est_ignore():
    output = MeetingNotesOutput.model_validate(
        {"budget": "500 k€", "opportunity": {"title": "Migration", "budget": "500 k€"}}
    )
    assert "500 k€" not in output.model_dump_json()
