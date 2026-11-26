"""#2450.5 / #2450.6 / #2448.7 / #2448.16 (épopée #2882) — CE QUE CHAQUE MODE
DEMANDE AU MODÈLE, au-delà du palier de modèle (``chat_model_routing.MODE_TIER``).

Constat qui a motivé ce fichier : avant lui, ``verifie`` et ``approfondi``
forçaient le MÊME palier (``deep``) et RIEN d'autre — deux modes de l'écran
byte-identiques dans tout ce que le dépôt mesure, ce que #2448 interdit
explicitement (« NO-GO : les quatre modes utilisent le même pipeline et
modifient uniquement le nom affiché »). Ce fichier ne règle pas tout l'écart —
l'evidence graph et les jobs reprenables d'APPROFONDI (#2450.6) restent un
système à concevoir — mais il fait la plus petite chose RÉELLE possible :
donner à chaque mode une CONSIGNE de comportement différente, appuyée sur des
capacités qui existent déjà (les outils rendent déjà `sources`/URLs, voir
`chat_tools.py::merge_sources`) plutôt que sur un champ qui n'existe nulle
part (source+date STRUCTURÉS par affirmation, budget, arrêt…).

Comme les blocs de ``thread_state.py`` : VOLATIL, ajouté en QUEUE du prompt
système par l'appelant (``routers/chat.py``, via ``append_before_language_reminder``),
jamais dans le segment mis en cache — même garde GA-293.
"""

from __future__ import annotations

_RAPIDE_BLOCK = (
    "\n\nMODE RAPIDE CHOISI PAR LA PERSONNE : réponds avec ce que tu sais déjà (ce fil, les fiches "
    "déjà chargées, ta mémoire) — ne lance AUCUNE recherche publique supplémentaire pour ce tour "
    "(l'outil n'est de toute façon pas dans ta liste). Distingue toujours clairement, dans ta "
    "réponse, ce qui est DÉJÀ CONNU de ce qui N'EST PAS VÉRIFIÉ AUJOURD'HUI — ne fais jamais semblant "
    "d'être à jour."
)

_VERIFIE_BLOCK = (
    "\n\nMODE VÉRIFIÉ CHOISI PAR LA PERSONNE : pour toute affirmation déterminante (poste actuel, "
    "changement récent, signal, coordonnée), appuie-toi sur un outil qui la vérifie plutôt que sur "
    "ta mémoire seule, et cite la source et sa date quand l'outil te les donne. Un point que tu ne "
    "peux pas vérifier ainsi se DIT non vérifié — jamais affirmé comme s'il l'était."
)

_APPROFONDI_BLOCK = (
    "\n\nMODE APPROFONDI CHOISI PAR LA PERSONNE : mobilise plusieurs sources et outils avant de "
    "conclure, recoupe-les entre eux, et signale EXPLICITEMENT les points où ils se contredisent — "
    "ne tranche jamais en silence à la place de la personne. Un travail encore partiel se dit "
    "partiel, il ne se présente jamais comme complet."
)

#: #2450.2 (épopée #2882) — indexé par la même clé que
#: ``chat_model_routing.CHAT_MODE_POLICIES`` : ``"auto"``/absent n'a
#: délibérément aucune entrée (rien à ajouter à la consigne, l'heuristique
#: décide déjà seule).
RESEARCH_MODE_BLOCKS: dict[str, str] = {
    "rapide": _RAPIDE_BLOCK,
    "verifie": _VERIFIE_BLOCK,
    "approfondi": _APPROFONDI_BLOCK,
}


def research_mode_block(requested_mode: str | None) -> str:
    """Le bloc VOLATIL ci-dessus pour un mode EXPLICITE, ``""`` pour
    ``None``/``"auto"``/tout mode inconnu — prompt inchangé au bit près sans
    mode posé, la même garantie que le reste de #2450.1."""
    return RESEARCH_MODE_BLOCKS.get(requested_mode or "", "")


__all__ = ["RESEARCH_MODE_BLOCKS", "research_mode_block"]
