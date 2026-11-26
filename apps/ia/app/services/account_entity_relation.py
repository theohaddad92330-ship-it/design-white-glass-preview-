"""#219.6 (épopée #3231, reste du 30/09) — CLIENT INTERNE.

> « Pour un compte qui est lui-même une direction informatique servant
> plusieurs métiers, distinguer le commanditaire interne, l'utilisateur,
> l'entité juridique et le client final — au lieu d'appeler automatiquement
> chaque métier cité un "client externe". »

## Ce que ce module N'EST PAS

Ce n'est pas un détecteur qui devine, depuis un texte libre, qu'un « métier »
cité est interne à l'entité analysée. Le triage du 28/09 (commentaire de
clôture de #3213) écarte précisément cette voie pour #219.1/#219.3 : deviner
depuis une ressemblance de texte inventerait une preuve. Les QUATRE rôles
complets de la spec (commanditaire interne / utilisateur / entité juridique /
client final) restent un chantier transverse (collecte → schéma → prompt →
écran) — ce module livre la tranche PROUVABLE sans invention : reconnaître
qu'une entité nommée est une FILIALE DÉCLARÉE du compte (`accounts.
subsidiaries`, déjà saisie par l'utilisateur — jamais un texte deviné), et
donc PAS un client externe distinct. Vocabulaire réutilisé, jamais dupliqué
(GA-26, même décision que #219.1/#219.3) : `ActorType.FILIALE`
(`actor_typology.py`) porte déjà ce nom.

Appelant réel : `chat_tools.py`, l'axe `"identity"` de `search_market_memory`
(#3225) — quand `include_subsidiaries=True`, les entités interrogées sont
DÉJÀ les filiales déclarées du compte ; ce module nomme, dans la réponse
relayée à Laura, laquelle des entités retrouvées EST une de ces filiales,
pour qu'elle ne la présente jamais comme un client tiers.
"""

from __future__ import annotations

from app.services.text_norm import normalize_name


def classify_entity_relation_to_account(name: object, subsidiaries: list[str] | None) -> str | None:
    """`"filiale"` quand `name` correspond (nom normalisé, casse/accents/espaces
    ignorés) à une des filiales DÉCLARÉES du compte — jamais deviné d'un
    intitulé métier seul, d'un secteur, ou d'une ressemblance partielle.
    `None` sinon : rien n'affirme qu'une entité est interne sans cette
    déclaration explicite."""
    normalized = normalize_name(str(name or ""))
    if not normalized:
        return None
    for subsidiary in subsidiaries or []:
        if normalize_name(str(subsidiary)) == normalized:
            return "filiale"
    return None


__all__ = ["classify_entity_relation_to_account"]
