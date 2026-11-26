"""#2270.1-.9, .11-.15, .17, .25 (épopée #2954) — le protocole après erreur, la
contradiction commerciale et le plafond d'excuses.

``test_copilote_error_posture.py`` (lot nuit 37, 25→26/09) a livré les six
points isolés que l'audit du 25/09 nommait comme des gaps concrets
(#2270.16, .18, .19, .20, .22, .23). Son commentaire de clôture sur #2954
déclarait le reste — #2270.1-.9, .11-.15, .17, .25 — « système entier,
plusieurs jours de travail » et l'a laissé hors tranche.

Cette suite prouve que ce reste, correctement décomposé, N'EST PAS un système
à calibrer sur plusieurs jours : c'est un paragraphe de prompt de plus,
au même format que tout ce qui l'entoure dans ``_BLOCK_LAURA`` — une règle
écrite, jamais un comportement mesuré à l'exécution. Trois groupes :

* #2270.1, .3, .4, .5, .6, .7, .8, .9 — le protocole en cinq étapes de
  l'épopée source (#2270, LAU-FINAL-013), plus les deux capacités qui
  l'encadrent (reconnaître un défaut réel, retourner vite à la valeur
  métier) ;
* #2270.2, .11, .12 — contredire l'utilisateur, refuser une demande
  commercialement mauvaise, toujours avec une meilleure voie ;
* #2270.13, .14, .15, .17 — la posture quand la personne est irritée : pas
  de ton défensif ni de morale, pas de sur-explication produit, une preuve
  de valeur ou une limite honnête ;
* #2270.25 — le plafond de 20 % d'excuses. Le lot précédent l'avait classé
  hors périmètre au motif qu'il « se MESURE sur une réponse rendue » : la
  RÈGLE elle-même (« ne dépasse jamais 20 % ») s'écrit très bien dans un
  prompt, exactement comme chaque autre plafond de ce fichier (fréquence du
  prénom, longueur des messages) — seule son application se mesure ailleurs,
  et c'est déjà vrai de toutes les autres règles de ce bloc.

⚠️ CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS. Comme
``test_copilote_error_posture.py`` et ``test_copilote_support_block.py`` :
ils tiennent la RÈGLE écrite là où le modèle la lit — le prompt système. Ils
ne prouvent pas que le modèle l'applique — ça reste l'éval en ligne.

#2270.16, .18, .19, .20, .22, .23 restent couverts par
``test_copilote_error_posture.py`` / ``test_forbidden_phrasings.py`` — pas
ici, pour ne pas dupliquer l'oracle.
"""

from __future__ import annotations

from app.eval.chat_hard_failures import HARD_FAILURE_SPECS, ChatHardFailure
from app.prompts.bellum_advisor import _BLOCK_ERROR_PROTOCOL, build_system_prompt

# #2899.24 (#2278.20) — ce test EST l'appelant réel de la taxonomie pour ce
# hard failure : la règle (CONTRADICTION UTILE) existait déjà, elle n'était
# simplement pas nommée sous le vocabulaire de #2443.6.
_INTERMEDIARY_PRESENTED_AS_FINAL_CLIENT = HARD_FAILURE_SPECS[ChatHardFailure.INTERMEDIARY_PRESENTED_AS_FINAL_CLIENT]

# #2899.29 (#2278.26) — même patron : APRÈS UNE ERREUR RÉELLE (#2270.1-.9)
# existait déjà, elle n'était simplement pas nommée sous le vocabulaire de
# #2443.6.
_FAULT_ACKNOWLEDGED_WITHOUT_REAL_CORRECTION = HARD_FAILURE_SPECS[
    ChatHardFailure.FAULT_ACKNOWLEDGED_WITHOUT_REAL_CORRECTION
]

#: Un prompt « nu » : tout ce qu'on y trouve vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")


def _line_of(heading: str) -> str:
    """La ligne du bloc qui ouvre par ``heading`` — un marqueur ailleurs ne compte pas."""
    lines = [line for line in _BLOCK_ERROR_PROTOCOL.splitlines() if line.startswith(heading)]
    assert len(lines) == 1, f"« {heading} » doit ouvrir exactement une ligne du bloc, trouvé {len(lines)}"
    return lines[0]


def test_the_block_reaches_the_bare_prompt():
    assert _BLOCK_ERROR_PROTOCOL in BARE


# ── #2270.1, .3, .4, .5, .6, .7, .8, .9 — le protocole en cinq étapes ───────


def test_2270_protocol_names_all_five_steps_plus_the_return_to_value():
    line = _line_of("APRÈS UNE ERREUR RÉELLE")
    assert "pas simplement un désaccord" in line, "seule une conclusion FAUSSE déclenche le protocole (#2270.1)"
    assert "tu reconnais le défaut en une phrase maximum" in line  # #2270.5
    assert "tu nommes précisément la cause si elle est certaine" in line  # #2270.6
    assert "tu invalides explicitement les éléments faux" in line, (  # #2270.7
        f"Hard failure #2899 : {ChatHardFailure.FAULT_ACKNOWLEDGED_WITHOUT_REAL_CORRECTION.value} — "
        f"{_FAULT_ACKNOWLEDGED_WITHOUT_REAL_CORRECTION.fr}"
    )
    assert "tu produis tout de suite la réponse corrigée" in line  # #2270.8
    assert "tu indiques ce qui reste inconnu après correction" in line  # #2270.9
    assert "tu retournes IMMÉDIATEMENT à la valeur métier" in line  # #2270.4
    assert "Tu corriges vite" in line  # #2270.3


# ── #2270.2, .11, .12 — contredire l'utilisateur, refuser, proposer mieux ──


def test_2270_contradiction_names_the_bad_commercial_asks_and_a_better_path():
    line = _line_of("CONTRADICTION UTILE")
    assert "tu contredis l'utilisateur" in line  # #2270.2
    assert "cinquante grands comptes" in line  # #2270.11 — exemple de l'épopée source
    assert "recrutement CDI" in line
    assert "C-level mondial" in line
    assert "cent messages identiques" in line
    assert "client final" in line, (
        f"Hard failure #2899 : {ChatHardFailure.INTERMEDIARY_PRESENTED_AS_FINAL_CLIENT.value} — "
        f"{_INTERMEDIARY_PRESENTED_AS_FINAL_CLIENT.fr}"
    )
    assert "tu dis non" in line
    assert "meilleure voie concrète" in line  # #2270.12


# ── #2270.13, .14, .15, .17 — face à la frustration ─────────────────────────


def test_2270_frustration_bans_defensive_tone_moralising_and_over_explaining():
    line = _line_of("QUAND ELLE EST IRRITÉE")
    assert "Pas de ton défensif" in line  # #2270.13
    assert "pas de morale sur son ton" in line  # #2270.14
    assert "explication longue du fonctionnement du produit" in line  # #2270.15
    assert "limite honnête" in line  # #2270.17
    assert "jamais les deux mains vides" in line


# ── #2270.25 — le plafond de 20 % d'excuses ─────────────────────────────────


def test_2270_25_apology_cap_is_twenty_percent_of_the_reply():
    line = _line_of("PLAFOND D'EXCUSES")
    assert "20 %" in line
    assert "peut encore recevoir un résultat" in line
