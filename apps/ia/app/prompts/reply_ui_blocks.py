"""#3767 (BEL-LAU-1012) — LAURA RAISONNE EN BLOCS D'INTERFACE, PAS EN « JE VAIS ÉCRIRE UNE RÉPONSE ».

Le retour : le prompt doit pousser le modèle à construire une réponse PENSÉE POUR
L'ÉCRAN — la qualité de sortie doit s'améliorer avant même le renderer final.

CE QUE CE MODULE AJOUTE, ET CE QU'IL NE REFAIT PAS. `_BLOCK_FORMAT` dit COMBIEN et
QUEL GABARIT (niveaux MICRO/SHORT/DÉCISION/DEEP, sections nommées) ; `reply_formats.py`
dit COMMENT s'écrit chaque carte JSON. Aucun des deux ne donnait la DÉMARCHE : les
questions qu'on se pose AVANT d'écrire. Ici : six questions, sept exigences, cinq
interdits — et rien d'autre. Ils RENVOIENT aux cartes et au gabarit existants, ils
ne les recopient pas (un réglage vit à un seul endroit).

POURQUOI UN MODULE À PART. Quatre écrivains passent en parallèle dans
`bellum_advisor.py` : une seule ligne y insère la consigne, dans le segment
INVARIANT (mis en cache — elle ne dépend d'aucun argument), juste avant
`REPLY_FORMATS_DIRECTIVE` dont elle est la démarche amont.

DOCTRINE TENUE. Aucune probabilité ; une valeur absente se dit « non mesuré », jamais
« 0 » ; une source absente se nomme ; aucun fournisseur nommé ; Laura prépare,
n'envoie jamais. Gardes : `tests/test_reply_ui_blocks_prompt.py`.
"""

from __future__ import annotations

#: #3767.1 — les six questions, dans l'ordre du retour.
UI_BLOCK_QUESTIONS: tuple[str, ...] = (
    "quel type de réponse rendre",
    "quels blocs composent cette réponse",
    "quelles informations doivent être visibles immédiatement",
    "quelles informations peuvent être dépliées",
    "quelles réserves doivent rester visibles",
    "quelle action finale proposer",
)

#: #3767.2 — les sept exigences, dans l'ordre du retour.
UI_BLOCK_REQUIREMENTS: tuple[str, ...] = (
    "un titre net",
    "un résumé décisionnel",
    "des blocs séparés",
    "des cartes homogènes quand il y a plusieurs objets",
    "des formulations courtes par carte",
    "des réserves explicites",
    "une prochaine action concrète",
)

#: #3767.3 — les cinq défauts interdits, dans l'ordre du retour.
UI_BLOCK_FORBIDDEN: tuple[str, ...] = (
    "la répétition",
    "le bullet point pauvre",
    "les gros pavés",
    "les formulations vagues",
    "les promesses non prouvées",
)


def _enumerate(items: tuple[str, ...]) -> str:
    return " ; ".join(items)


BLOCK_REPLY_UI_BLOCKS = f"""RÉPONSE PENSÉE POUR L'ÉCRAN (#3767, BEL-LAU-1012). Tu ne te demandes pas « comment écrire une réponse » : tu te demandes comment l'écran va la MONTRER. Avant d'écrire, tu décides, dans cet ordre : {_enumerate(UI_BLOCK_QUESTIONS)}.
CE QUE TU CONSTRUIS, quand la réponse a de la matière (une question simple reste une à quatre phrases, sans titre ni bloc — la règle de STRUCTURE ADAPTATIVE ci-dessus s'applique d'abord) : {_enumerate(UI_BLOCK_REQUIREMENTS)}. Le titre dit le sujet en quelques mots ; le résumé décisionnel donne la conclusion et son enjeu en une ou deux phrases, avant tout détail ; chaque bloc porte UNE idée ; plusieurs objets de même nature (comptes, contacts, consultants, étapes) prennent la même carte, les mêmes champs, dans le même ordre ; une carte tient en phrases courtes, un fait par ligne ; ce qui est visible tout de suite est ce qui décide, le reste se déplie ; la réserve (ce qui manque, ce qui est ancien, ce qui n'est pas vérifié) reste visible à côté de ce qu'elle limite, jamais enfouie en fin de texte ; la prochaine action est un geste que la personne peut faire maintenant, avec son objet nommé.
TU T'INTERDIS : {_enumerate(UI_BLOCK_FORBIDDEN)}. INTERDIT : redire dans un bloc ce qu'un autre bloc de la même réponse a déjà dit ; une puce qui n'est qu'un mot ou un fragment sans fait ; un paragraphe de plus de trois phrases ; « plusieurs », « certains », « assez bien », « il semble que » là où un nom, un chiffre ou une date existe dans le dossier ; « je vais », « je m'en occupe », « c'est garanti » pour un geste que tu n'exécutes pas dans ce tour.
LES RÈGLES DU DOSSIER TRAVERSENT LES BLOCS : un champ dont tu n'as pas la valeur se dit « non mesuré » ou reste absent — jamais « 0 », jamais une valeur devinée ; une source absente se dit ; aucune probabilité ; tu prépares, le commercial envoie. La structure habille ce que tu sais, elle ne maquille jamais ce que tu ne sais pas."""
