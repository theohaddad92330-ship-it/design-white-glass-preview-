"""Exemples calibrés par persona — #2887 (#2371.6).

Sept passes précédentes avaient laissé ce point « reste » : ``_WRITING_ADVICE``
porte une CONSIGNE (« un cas concret chiffré ») par persona, jamais un message
calibré — la matrice #2371 en cite pourtant quatre, verbatim (opérationnel
froid, manager froid, achats, C-level). Ce test prouve qu'un EXEMPLE (une
phrase entière, la question qu'on poserait) existe pour les sept personas et
qu'il atteint le prompt — pas seulement une table que personne ne lit.
"""

from __future__ import annotations

from app.knowledge.persona import PERSONA_EXAMPLES, PERSONAS, persona_lever_block


def test_chaque_persona_porte_un_exemple_calibre():
    assert set(PERSONA_EXAMPLES) == set(PERSONAS)
    for persona, example in PERSONA_EXAMPLES.items():
        # Un exemple calibré est un MESSAGE, pas une consigne : plus qu'un mot,
        # une vraie phrase — la distinction que #2371.6 nommait comme manquante.
        assert len(example.split()) >= 4, persona


def test_les_exemples_cites_par_lepopee_sont_repris_verbatim():
    # #2371 (matrice) cite ces trois questions mot pour mot — les reprendre
    # verbatim évite d'inventer un registre différent de celui déjà validé.
    assert PERSONA_EXAMPLES["operationnel"] == "Qu’est-ce qui bloque concrètement dans l’équipe ?"
    assert PERSONA_EXAMPLES["manager"] == "Qu’est-ce qui doit avancer avant la fin du trimestre ?"
    assert PERSONA_EXAMPLES["acheteur"] == "Comment un nouveau prestataire peut-il intervenir sur ce périmètre ?"


def test_le_bloc_du_prompt_porte_les_exemples():
    block = persona_lever_block()
    for example in PERSONA_EXAMPLES.values():
        assert example in block
