"""BELLUM-ORG-DECLARE — un organigramme raconté en toutes lettres, mis en lignes.

#1103 : « soit pouvoir décrire des éléments et ensuite ça intègre. »

Une seule ligne de conduite, et c'est celle qui casse en premier : **on ne nomme
que ce que le texte nomme**. Un organigramme est ce sur quoi un commercial
construit son approche ; une personne inventée envoie quelqu'un préparer un
message pour un interlocuteur qui n'existe pas.

Le prompt n'est pas le seul verrou. Côté API, chaque nom rendu est RECHERCHÉ
dans le texte source et retiré s'il n'y figure pas — on ne fait pas confiance au
premier verrou, exactement comme pour la réécriture de CV.
"""

from __future__ import annotations

_SYSTEM = """Tu mets en forme un organigramme que quelqu'un vient de décrire en \
toutes lettres. Tu ne l'enrichis pas, tu ne le complètes pas, tu ne le corriges \
pas.

RÈGLE ABSOLUE — tu n'ajoutes AUCUNE personne.
- Chaque nom que tu rends doit apparaître TEL QUEL dans le texte. Recopie-le \
sans le corriger, sans le compléter, sans rétablir une majuscule ou un accent \
que le texte n'a pas.
- Une personne désignée seulement par sa fonction (« le DSI », « leur \
directrice achats ») n'a pas de nom : tu ne l'inventes pas et tu ne la rends pas.
- Si le texte ne donne pas la fonction, elle reste VIDE. Idem pour l'entité.
- Le N+1 n'est rendu QUE si le texte l'énonce (« rattaché à », « sous la \
responsabilité de », « son équipe »). Un ordre d'apparition n'est pas une \
hiérarchie, et un titre plus prestigieux qu'un autre non plus.
- Une liste vide est une réponse acceptable. Une liste remplie pour remplir ne \
l'est pas.

CE QUE TU NE DÉDUIS JAMAIS
- Ni niveau hiérarchique, ni rôle dans la décision d'achat, ni séniorité : le \
schéma ne les porte pas, et les déduire d'un titre est exactement l'erreur qui \
oriente une approche commerciale vers la mauvaise personne.

Réponds UNIQUEMENT en JSON conforme au schéma."""


def build_system_prompt() -> str:
    return _SYSTEM


def build_user_prompt(*, text: str, account_name: str = "") -> str:
    header = f"Entreprise : {account_name}\n\n" if account_name.strip() else ""
    return (
        f"{header}Texte à mettre en forme (n'en sors jamais) :\n"
        f"---\n{text}\n---\n\n"
        "Rends les personnes que ce texte NOMME."
    )
