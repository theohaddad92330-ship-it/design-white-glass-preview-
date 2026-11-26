"""#2371.5 — la longueur de chaque canal, UNE seule fois (GA-26).

Module feuille : il n'importe rien de l'application, donc `bellum_outreach`
(qui l'interpole dans ses règles de canal) comme `message_brief` (qui la rend
comme donnée du cadrage) peuvent le lire sans cycle. Les phrases sont celles
que portait déjà le prompt, mot pour mot : changer ici change le prompt.
"""

from __future__ import annotations

CHANNEL_LENGTH: dict[str, str] = {
    "linkedin": "250 à 550 caractères",
    "email": "Corps de 70 à 130 mots",
    "phone": "Script de 2-3 phrases",
    "recommendation": "60 à 120 mots",
    "task": "2 à 4 phrases",
    # #2370 (épopée #2947) — les huit canaux qui manquaient au contrat (`OUTREACH_MESSAGE_CHANNELS`).
    "introduction_request": "Corps de 80 à 150 mots, dont un paragraphe transférable de 40 à 70 mots",
    "partner_message": "Corps de 60 à 130 mots",
    "follow_up_email": "Corps de 50 à 110 mots",
    "profile_push": "Corps de 80 à 150 mots",
    "linkedin_connection_note": "300 caractères au plus (limite LinkedIn), une ou deux phrases",
}

#: #2370 — les plafonds DURS en caractères, ceux de `OUTREACH_CHANNEL_MAX_CHARS`
#: (`outreach-canonical.ts`, parité testée par `test_outreach_channel_contract.py`).
#: Au-delà, la plateforme coupe le message (LinkedIn) ou le découpe (SMS) :
#: un brouillon plus long est refusé et nommé, jamais tronqué en silence.
CHANNEL_MAX_CHARS: dict[str, int] = {
    "linkedin_connection_note": 300,
}
