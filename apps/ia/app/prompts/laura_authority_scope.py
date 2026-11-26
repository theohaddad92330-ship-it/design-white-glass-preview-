"""Le périmètre d'autorité DÉCLARÉ — ce que Laura PROPOSE, jamais ce que
l'API autorise.

D3 — décision Louis, 18/09/2026 (``.claude/notes/decisions-louis-18-09-
apresmidi.md``) : le questionnaire collecte le périmètre d'autorité d'une
personne (#2033.2-.8 : décisions autonomes, décisions à faire valider,
personnes managées, et quatre axes de responsabilité — recrutement/comptes,
staffing, marge/facturation, invitation). Ces réponses N'ENTRENT NULLE PART
dans les droits : ``apps/api/src/modules/workspace/workspace-permission.
guard.ts`` reste la SEULE autorité sur ce qui est AUTORISÉ (GA-26, un réglage
vit à un seul endroit). Ce module ne fait qu'une chose : composer le texte
que le prompt du chat (``bellum_advisor.py``) ajoute pour que Laura CESSE de
PROPOSER une action hors du périmètre déclaré, et le DISE (#2033.9) — jamais
qu'elle refuse en silence, et jamais qu'elle lise un rôle déclaré (« directeur »)
comme un accès à toutes les données (#2033.10).

─────────────────────────────────────────────────────────────────────────────
CE QUE CETTE FONCTION N'EST PAS
─────────────────────────────────────────────────────────────────────────────
Elle ne lit ni n'écrit aucune permission, aucun rôle d'espace, aucune matrice
RBAC — un champ de formulaire n'est jamais un vecteur d'élévation de
privilège (#2033.8, registre onboarding-questionnaire). Voir le miroir TS pur
et testé, ``packages/contracts/src/schemas/authority-scope.ts``
(``isProposalWithinDeclaredAuthority``) : même catalogue de trois valeurs
d'échelle, même règle « absence = aucune restriction ».

─────────────────────────────────────────────────────────────────────────────
L'ABSENCE NE RESTREINT RIEN (#2033.10, GA-18/GA-19)
─────────────────────────────────────────────────────────────────────────────
Un profil qui ne déclare rien, qui déclare seulement « Je décide seul », ou
qui porte une valeur HORS du catalogue fermé (un intitulé de poste rangé ici
par erreur, p. ex. « Directeur ») rend un bloc VIDE — Laura propose tout,
exactement le rendu historique. Seule la valeur EXACTE
``"Je n'ai pas cette responsabilité"`` — persistée verbatim par le
questionnaire (``AUTHORITY_SCALE_CHOICES[2]``, ``authority-scope.ts``) — fait
sortir une catégorie du périmètre proposé.
"""

from __future__ import annotations

AUTHORITY_SCALE_DECIDES_ALONE = 'Je décide seul'
AUTHORITY_SCALE_MUST_VALIDATE = 'Je dois faire valider'
AUTHORITY_SCALE_NOT_RESPONSIBLE = "Je n'ai pas cette responsabilité"

# Les quatre axes de responsabilité collectés (#2033.5-.8), et le libellé
# français que Laura cite dans sa phrase. Miroir de `AUTHORITY_CATEGORIES` /
# `CATEGORY_LABEL_FR` (`authority-scope.ts`) — mêmes quatre catégories, même
# ordre de collecte.
_CATEGORY_LABELS: tuple[tuple[str, str], ...] = (
    ('recruitmentAccountsAuthority', 'recruter un nouveau compte'),
    ('staffingAuthority', 'décider un staffing'),
    ('marginBillingAuthority', 'décider de la marge ou de la facturation'),
    ('inviteAuthority', "inviter quelqu'un dans l'espace"),
)


def build_authority_scope_block(p: dict) -> str:
    """Le bloc de prompt à ajouter — vide quand rien ne restreint la
    proposition, exactement le rendu historique. Ne cadre QUE ce que Laura
    PROPOSE ; les droits se vérifient ailleurs, à l'écriture."""
    declined: list[str] = []
    cautioned: list[str] = []
    for key, label in _CATEGORY_LABELS:
        value = p.get(key)
        if value == AUTHORITY_SCALE_NOT_RESPONSIBLE:
            declined.append(label)
        elif value == AUTHORITY_SCALE_MUST_VALIDATE:
            cautioned.append(label)
        # Tout le reste — absent, "Je décide seul", ou une valeur hors
        # catalogue — NE RESTREINT RIEN (#2033.10).

    if not declined and not cautioned:
        return ''

    lines: list[str] = []
    if declined:
        lines.append(
            "- Elle m'a dit NE PAS avoir la responsabilité de : "
            + ', '.join(declined)
            + '. NE PROPOSE JAMAIS ces actions de toi-même : si on te les demande, DIS '
            "explicitement que ça sort de ce qu'elle t'a dit décider — jamais un refus "
            'silencieux, et jamais une supposition sur qui, elle, doit voir à sa place.'
        )
    if cautioned:
        lines.append(
            "- Elle m'a dit devoir FAIRE VALIDER : "
            + ', '.join(cautioned)
            + '. Tu peux les proposer, en nommant que la décision demande une validation '
            'avant le geste.'
        )

    return (
        "\n\nPÉRIMÈTRE D'AUTORITÉ DÉCLARÉ (jamais un droit — le produit vérifie les droits "
        'ailleurs ; ceci cadre UNIQUEMENT ce que tu proposes) :' + ''.join(f'\n{line}' for line in lines)
    )
