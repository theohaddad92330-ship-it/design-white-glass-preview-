"""Sortie de BELLUM-LINKEDIN-POSTS — des sujets de publication, pas des posts.

Le §5.10 du rapport besoins demande « propose les sujets de posts liés à mes
missions et objectifs ». Un SUJET, pas un texte prêt à publier : ce qui circule
sous le nom d'un commercial doit être écrit par lui. On lui donne l'angle, la
matière et la première phrase ; il fait le reste.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PostIdea(BaseModel):
    """Un sujet de publication, avec ce qui le justifie."""

    #: L'angle en une phrase.
    angle: str = ""
    #: Pourquoi ce sujet MAINTENANT — tiré du contexte fourni, jamais inventé.
    why_now: str = ""
    #: Une première phrase pour démarrer. Pas le post entier.
    opening_line: str = ""
    #: Ce sur quoi l'angle s'appuie, cité tel quel. Vide si rien ne l'appuie.
    grounded_on: str = ""


class LinkedInPostsOutput(BaseModel):
    ideas: list[PostIdea] = Field(default_factory=list)
