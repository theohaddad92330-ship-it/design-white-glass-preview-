"""Directive de style rédactionnel partagée par les system prompts.

Les prompts du pipeline sont écrits sans accents (l'auteur a tapé « presente »,
« tres », « decideur »). Le modèle imite ce style : le dossier livré au
commercial sortait donc en français fautif — « le compte presente un timing
tres favorable », « l'acces reel aux decideurs ». C'est le premier paragraphe
que lit un prospect.

Plutôt que ré-accentuer des centaines de lignes d'instructions (risqué, et sans
garantie sur la sortie), on impose une consigne de style EXPLICITE, elle-même
accentuée pour l'exemple, qui prime sur le style non accentué des instructions.
Le modèle produit alors un français normé.
"""

from __future__ import annotations

FRENCH_STYLE_DIRECTIVE = (
    "===== STYLE RÉDACTIONNEL (PRIORITAIRE) =====\n"
    "Rédige TOUJOURS un français normé et INTÉGRALEMENT accentué : é è ê ë, à â, "
    "ù û, ô, î ï, ç — y compris sur les majuscules quand l'usage l'exige. "
    "N'omets JAMAIS un accent. Écris « présente », « très », « décideur », "
    "« accès », « stratégie », « périmètre », « vérifié », « données », jamais "
    "« presente », « tres », « decideur », « acces », « strategie ». Cette "
    "consigne prime sur le style non accentué des instructions ci-dessous, qui "
    "ne doit jamais se retrouver dans ta réponse."
)


def with_french_style(system_prompt: str) -> str:
    """Préfixe un system prompt de la directive de style. Idempotent en pratique
    (un prompt n'est wrappé qu'une fois, à la construction)."""
    return f"{FRENCH_STYLE_DIRECTIVE}\n\n{system_prompt}"
