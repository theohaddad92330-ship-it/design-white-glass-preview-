"""Boucle d'apprentissage de l'ESN (restitution V2 §6).

L'API NestJS agrège, depuis l'Opportunity Graph, ce que l'ÉQUIPE a fait de ses
besoins passés — convertis, transformés en action, déclarés obsolètes, par
secteur et par offre — et l'envoie ici via le champ ``workspace_learning``.

Contrat, identique à celui de ``account_feedback`` :

* agrégat vide / absent → ``""`` — le prompt appelant reste **byte-identique**
  à avant la feature. Une ESN qui débute n'est pas conseillée par un
  apprentissage qui n'existe pas ;
* agrégat présent → un bloc ADDITIF qui CITE les comptages tels quels.

Trois garde-fous écrits dans le bloc lui-même, parce que c'est le seul endroit
où le modèle les lira :

1. ce sont des décisions humaines COMPTÉES, pas un score ni une prédiction ;
2. c'est un prior sur l'ESN — **jamais** un fait sur l'entreprise analysée. Ne
   jamais écrire « ce compte va convertir » parce qu'un autre compte du même
   secteur a converti ;
3. l'historique PRIORISE, il ne remplace pas les faits du dossier. Un besoin
   réellement constaté sur la cible prime sur une statistique interne.

Le texte est borné côté API ; on re-cape ici par défense en profondeur.
"""

from __future__ import annotations

# Cap dur sur le bloc injecté — même discipline que le feedback de compte.
_LEARNING_MAX_CHARS = 2000


def workspace_learning_block(learning: str | None) -> str:
    """Bloc « ce que cette ESN a déjà converti », ou ``""`` sans apprentissage."""
    text = (learning or "").strip()[:_LEARNING_MAX_CHARS]
    if not text:
        return ""
    return (
        "\n\n===== CE QUE CETTE ESN A DÉJÀ CONVERTI (historique interne — priorisation) =====\n"
        "Bilan des besoins que l'équipe a elle-même déplacés sur ses dossiers précédents. "
        "Chaque ligne est un COMPTAGE de décisions humaines, pas un score ni une prédiction :\n"
        + text
        + "\nRègles : ces chiffres décrivent l'ESN, PAS l'entreprise analysée — n'affirme jamais "
        "qu'un besoin de cette cible va convertir parce qu'un besoin voisin a converti ailleurs. "
        "Ils servent à PRIORISER : à faits égaux, mets en avant les offres qui ont déjà converti "
        "chez cette ESN, et méfie-toi de celles régulièrement déclarées obsolètes. Les faits "
        "constatés sur la cible priment toujours sur cet historique."
    )
