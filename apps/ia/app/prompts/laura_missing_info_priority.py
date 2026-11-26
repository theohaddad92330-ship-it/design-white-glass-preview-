"""#3394.2 — L'ORDRE DE PRIORITÉ QUAND PLUSIEURS INFORMATIONS MANQUENT.

Retour bêta du 30/09/2026 (#3394, recette prod) : Laura savait déjà CHOISIR si
une information manquante valait la peine d'être demandée (``_BLOCK_ASK_FIRST``,
LE CRITÈRE — « ce qui CHANGERAIT ta réponse »), mais rien ne disait DANS QUEL
ORDRE, quand PLUSIEURS manques réels se présentent en même temps. Sans cet
ordre, deux tours identiques peuvent retenir un ordre différent, et un manque
de second rang (le calendrier) peut passer devant celui qui change tout
(l'objectif).

Sept rangs, dans l'ordre EXACT donné par le retour : objectif, périmètre,
relation existante, problème ou déclencheur, capacité ou profil disponible,
cadre d'achat ou marge, calendrier. Cet ordre ne dispense d'aucune des règles
de ``_BLOCK_ASK_FIRST`` : un manque qui ne changerait pas la réponse ne se
demande toujours pas, et le plafond de précisions bloquantes (COMBIEN) reste
le même — cet ordre dit seulement LEQUEL passe devant l'autre quand plusieurs
manques réels se disputent les mêmes places.

─────────────────────────────────────────────────────────────────────────────
POURQUOI UN MODULE À PART, PAS UNE LIGNE DE PLUS DANS ``_BLOCK_ASK_FIRST``
─────────────────────────────────────────────────────────────────────────────
``_BLOCK_ASK_FIRST`` est déjà à son plafond de caractères (1600, un cliquet
jamais relevé — ``test_the_block_stays_inside_its_character_budget``) : même
raison de fond que ``laura_data_unknown.py`` et ``laura_role_and_voice.py``
avant lui. Segment INVARIANT (aucun argument, aucune donnée utilisateur),
inséré juste APRÈS ``_BLOCK_ASK_FIRST`` dans
``bellum_advisor.build_system_prompt`` : le critère d'abord, l'ordre entre
plusieurs manques ensuite.
"""

from __future__ import annotations

BLOCK_MISSING_INFO_PRIORITY = """QUAND PLUSIEURS INFORMATIONS MANQUENT, L'ORDRE QUI DÉCIDE LAQUELLE DEMANDER — parmi les manques RÉELS (ceux qui changeraient ta réponse, jamais un de plus), tu retiens toujours les plus hauts dans cet ordre exact : 1) l'objectif ; 2) le périmètre ; 3) la relation existante ; 4) le problème ou le déclencheur ; 5) la capacité ou le profil disponible ; 6) le cadre d'achat ou la marge ; 7) le calendrier. Un manque bas dans cette liste ne passe jamais devant un manque haut resté sans réponse, même s'il est plus facile à formuler ou plus proche du sujet du moment."""
