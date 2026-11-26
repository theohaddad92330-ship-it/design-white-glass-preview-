"""#3278.3 (#3259.7) — « les presets de canal cèdent devant les résultats
MESURÉS du workspace ».

Le preset (`first_channel` de la route) reste le défaut. Il ne cède que si le
preset ET un autre canal ont chacun un échantillon SUFFISANT (drapeau calculé
côté API, jamais un seuil recalculé ici) et que l'autre bat le preset d'une
marge nette. Un canal non mesurable (introduction, échange direct, procédure)
ne cède jamais : on ne remplace pas une introduction par un appel sur la foi
d'un taux qui ne parle pas d'introductions.
"""

from __future__ import annotations

from app.services.opening_movement import (
    channel_prompt_block,
    measured_channel_choice,
    movement_prompt_block,
)

COLD = {
    "esnProfile": {"stage": "petite"},
    "account": {"archetype": "pme_eti"},
    "relationship": {"state": "froid"},
}  # route bottom_up — preset « LinkedIn »
REFERRED = {
    "esnProfile": {"stage": "petite"},
    "account": {"archetype": "startup"},
    "relationship": {"state": "refere"},
}  # route recommandation — preset « introduction »


def _row(channel: str, sent: int, replied: int, sufficient: bool = True) -> dict:
    return {
        "channel": channel,
        "sent": sent,
        "replied": replied,
        "sufficient": sufficient,
        "replyRate": round(100 * replied / sent) if sufficient else None,
    }


def test_sans_mesure_le_bloc_canal_reste_byte_identique() -> None:
    baseline = channel_prompt_block(COLD)
    assert channel_prompt_block(COLD, None) == baseline
    assert channel_prompt_block(COLD, []) == baseline
    assert movement_prompt_block(COLD, []) == movement_prompt_block(COLD)


def test_un_canal_mesure_bat_nettement_le_preset_le_preset_cede() -> None:
    perf = [_row("linkedin", 30, 3), _row("call", 20, 8)]  # 10 % contre 40 %
    choice = measured_channel_choice("LinkedIn", perf)
    assert choice is not None
    assert choice["channel"] == "appel"
    block = channel_prompt_block(COLD, perf)
    assert "Canal à privilégier : appel" in block
    assert "MESURÉ" in block
    assert "LinkedIn" in block  # le preset remplacé est nommé, jamais tu
    assert "40 %" in block and "10 %" in block


def test_marge_insuffisante_le_preset_reste() -> None:
    perf = [_row("linkedin", 30, 10), _row("call", 20, 8)]  # 33 % contre 40 %
    assert measured_channel_choice("LinkedIn", perf) is None
    assert "Canal à privilégier : LinkedIn" in channel_prompt_block(COLD, perf)


def test_un_canal_sous_le_seuil_ne_fait_jamais_ceder_le_preset() -> None:
    perf = [_row("linkedin", 30, 3), _row("call", 4, 4, sufficient=False)]
    assert measured_channel_choice("LinkedIn", perf) is None
    block = channel_prompt_block(COLD, perf)
    assert "Canal à privilégier : LinkedIn" in block
    # Le canal non mesuré est NOMMÉ comme tel, jamais affiché avec un taux.
    assert "non mesuré" in block


def test_un_preset_non_mesure_sur_le_workspace_ne_cede_pas() -> None:
    # Le preset LinkedIn n'a aucune mesure suffisante : rien ne prouve qu'il est moins bon.
    perf = [_row("call", 20, 12)]
    assert measured_channel_choice("LinkedIn", perf) is None


def test_une_introduction_ne_cede_jamais_a_un_canal_mesure() -> None:
    perf = [_row("call", 20, 18), _row("email", 25, 1)]
    assert measured_channel_choice("introduction", perf) is None
    block = channel_prompt_block(REFERRED, perf)
    assert "Canal à privilégier : introduction" in block
    assert "NO-GO" in block


def test_le_bloc_mouvement_porte_aussi_le_canal_mesure() -> None:
    perf = [_row("linkedin", 30, 3), _row("call", 20, 8)]
    assert "Canal à privilégier : appel" in movement_prompt_block(COLD, perf)
