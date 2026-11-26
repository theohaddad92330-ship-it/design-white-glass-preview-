"""Plancher de rôles — le gate voit CE compte-là, pas seulement la moyenne.

# #2631.1 — le gate voit CE compte-là, pas la moyenne (doctrine
# `c77_gate_qualite_ia_bloque_sur_role_cle`).

DÉCISION LOUIS 21/09/2026 (#2631.1) : *une moyenne qui monte peut cacher la
perte d'un rôle sur un seul compte nommé — le gate doit voir CE compte-là, pas
seulement l'ensemble.*

Ce que le banc savait faire avant ce module : comparer, par compte, un score
AGRÉGÉ et huit scores de métrique à ``baseline.json`` (``run.compare_to_baseline``).
La métrique ``buying_committee`` y pèse 0,05 et note une COUVERTURE (n sièges
sur 5). Un compte pouvait donc perdre l'acheteur, gagner le champion, et sortir
avec le même 2/5 — invisible, à la fois pour la moyenne du banc et pour la
comparaison par métrique. C'est l'angle mort que ce module ferme : un plancher
NOMMÉ, par compte de référence et par rôle, dont la disparition d'un seul membre
fait échouer la CI.

CE QUI EST DÉCLARÉ, ET OÙ
Chaque ``golden/<slug>.json`` porte son propre plancher, dans son bloc
``expect``, sous la clé ``committeeRoles`` — un réglage vit à UN seul endroit
(GA-26), et c'est déjà le fichier qui porte les attentes de ce compte. Les
valeurs sont celles que le corpus committé DONNE réellement (relevé du
21/09/2026 : ``technical_buyer`` + ``procurement`` sur les neuf goldens) : on ne
déclare pas un rôle pour faire joli, sinon le jeu de référence se met à mentir.

« PERDU » ET « NON ÉVALUABLE » NE SONT PAS LE MÊME MOT
C'est la distinction qui décide si ce gate est utile ou s'il crie au loup à
chaque panne de collecte :

  - un dossier qui porte des contacts et où le siège déclaré n'est plus tenu →
    le rôle est **perdu**, le message le nomme, la CI échoue ;
  - un dossier SANS aucun contact → rien n'a pu être évalué. Le rôle n'est pas
    perdu, il est **non évaluable** : il sort du dénominateur (GA-19), le score
    vaut ``None`` et jamais ``0`` (GA-18), et le compte est nommé à part.

Les deux disent NON — mais ils ne demandent pas le même geste : le premier est
une régression de qualité, le second une collecte absente.

LE PIÈGE QUE CE MODULE REFUSE DE TOMBER DEDANS
Si le jeu de référence est vide ou ne charge pas, « aucun rôle perdu » est VRAI
et le plancher passerait au vert sans avoir rien lu. Le verdict porte donc deux
compteurs de ce qu'il a RÉELLEMENT lu — ``accounts_read`` et ``roles_checked``
— et échoue quand le second vaut zéro. Mesuré deux fois dans ce dépôt en
septembre : une sonde verte sur un corpus vide.

Pur + déterministe, hermétique : aucune I/O hors des fichiers committés du jeu
de référence, aucun appel réseau, aucun contenu de message (le CORPS d'un
message ne sort jamais dans un journal de CI) et aucun nom de fournisseur.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.knowledge.buying_committee import COMMITTEE_ROLES, ROLE_LABELS, assemble_buying_committee

from .golden import Golden

# L'extraction des contacts doit être EXACTEMENT celle du banc : deux lectures
# différentes du même dossier feraient diverger le plancher de la métrique qu'il
# prolonge (GA-26). On réutilise donc la fonction du banc au lieu de la
# re-dériver ici.
from .metrics import _contacts_of as contacts_of

#: La clé du plancher dans le bloc ``expect`` d'un golden.
ROLE_FLOOR_KEY = "committeeRoles"


@dataclass(frozen=True)
class AccountRoleFloor:
    """Le verdict du plancher pour UN compte de référence.

    ``expected`` est le plancher déclaré (rôles connus) ; ``unknown`` les clés
    déclarées qui ne sont pas des rôles de comité — une faute de frappe y serait
    « perdue » à jamais, donc on la nomme au lieu de la subir.
    """

    slug: str
    company: str
    expected: tuple[str, ...]
    covered: tuple[str, ...]
    lost: tuple[str, ...]
    unevaluable: tuple[str, ...]
    unknown: tuple[str, ...]
    contacts_read: int

    @property
    def evaluable(self) -> bool:
        """Un dossier est évaluable dès qu'il porte au moins un contact : c'est
        ce qui permet de dire si un siège est tenu ou non. Zéro contact, ce
        n'est pas « aucun siège tenu » — c'est « on n'a rien à regarder »."""
        return self.contacts_read > 0

    def score(self) -> float | None:
        """Sièges tenus / sièges ÉVALUABLES, ou ``None`` quand rien ne l'était.

        GA-18/GA-19 : « non mesuré » n'est jamais « 0 », et un axe non évaluable
        sort du dénominateur.
        """
        denominator = len(self.expected) - len(self.unevaluable)
        if denominator <= 0:
            return None
        return round(len(self.covered) / denominator, 4)

    def passed(self) -> bool:
        return not self.lost


@dataclass(frozen=True)
class RoleFloorVerdict:
    """Le plancher sur l'ensemble des comptes passés — et ce qu'il a lu."""

    accounts: tuple[AccountRoleFloor, ...]
    undeclared: tuple[str, ...]
    accounts_read: int
    roles_checked: int
    problems: tuple[str, ...]

    def passed(self) -> bool:
        return not self.problems

    def lost_pairs(self) -> tuple[tuple[str, str], ...]:
        """Les couples (compte, rôle) perdus — la forme machine du message."""
        return tuple((a.slug, role) for a in self.accounts for role in a.lost)


def _label(role: str) -> str:
    return ROLE_LABELS.get(role, role)


def declared_floor(golden: Golden) -> tuple[str, ...]:
    """Le plancher déclaré par ce golden, dans l'ordre du fichier.

    Vide quand le compte n'en déclare aucun — ce cas est NOMMÉ par
    :func:`check_role_floor`, jamais avalé en silence.
    """
    raw = (golden.expect or {}).get(ROLE_FLOOR_KEY) or []
    if isinstance(raw, (str, bytes)) or not isinstance(raw, Sequence):
        return ()
    return tuple(str(r).strip() for r in raw if str(r).strip())


def account_role_floor(golden: Golden, analysis: Mapping[str, Any]) -> AccountRoleFloor:
    """Le verdict du plancher de ``golden`` sur le dossier ``analysis``."""
    declared = declared_floor(golden)
    expected = tuple(r for r in declared if r in COMMITTEE_ROLES)
    unknown = tuple(r for r in declared if r not in COMMITTEE_ROLES)

    contacts = contacts_of(analysis)
    contacts_read = len(contacts)

    if contacts_read == 0:
        # Rien n'a pu être évalué : aucun rôle n'est déclaré perdu.
        return AccountRoleFloor(
            slug=golden.slug,
            company=golden.company,
            expected=expected,
            covered=(),
            lost=(),
            unevaluable=expected,
            unknown=unknown,
            contacts_read=0,
        )

    coverage = assemble_buying_committee(contacts).get("roleCoverage") or {}
    covered = tuple(r for r in expected if coverage.get(r))
    lost = tuple(r for r in expected if not coverage.get(r))
    return AccountRoleFloor(
        slug=golden.slug,
        company=golden.company,
        expected=expected,
        covered=covered,
        lost=lost,
        unevaluable=(),
        unknown=unknown,
        contacts_read=contacts_read,
    )


def check_role_floor(
    pairs: Sequence[tuple[Golden, Mapping[str, Any]]],
    *,
    require_corpus: bool = True,
) -> RoleFloorVerdict:
    """Le plancher sur tous les comptes fournis.

    ``require_corpus`` (défaut) fait échouer un plancher qui n'a RIEN vérifié :
    sans lui, un corpus vide rendrait « aucun rôle perdu » — vrai, et faux.
    """
    accounts = tuple(account_role_floor(g, a) for g, a in pairs)
    undeclared = tuple(a.slug for a in accounts if not a.expected and not a.unknown)
    roles_checked = sum(len(a.expected) for a in accounts if a.evaluable)

    problems: list[str] = []
    for account in accounts:
        for role in account.lost:
            problems.append(
                f"{account.company} : le rôle « {_label(role)} » ({role}) a disparu du comité "
                f"d'achat — plancher #2631.1 déclaré dans golden/{account.slug}.json"
            )
        if account.expected and not account.evaluable:
            problems.append(
                f"{account.company} : dossier NON ÉVALUABLE (aucun contact lu) — le plancher "
                f"n'a pu vérifier aucun de ses sièges déclarés ; ce n'est pas une perte de "
                f"rôle, c'est une collecte absente"
            )
        for role in account.unknown:
            problems.append(
                f"{account.slug} : rôle inconnu « {role} » dans expect.{ROLE_FLOOR_KEY} — "
                f"il ne pourra jamais être couvert ; rôles connus : {', '.join(COMMITTEE_ROLES)}"
            )
    problems += [
        f"{slug} : aucun plancher de rôles déclaré (expect.{ROLE_FLOOR_KEY}) — ce compte de "
        f"référence n'est gardé par rien"
        for slug in undeclared
    ]

    if require_corpus and roles_checked == 0:
        problems.append(
            "plancher de rôles : AUCUN rôle vérifié sur AUCUN compte évaluable "
            f"({len(accounts)} compte(s) chargé(s)) — « aucun rôle perdu » serait vrai et le "
            "vert serait faux"
        )

    return RoleFloorVerdict(
        accounts=accounts,
        undeclared=undeclared,
        accounts_read=len(accounts),
        roles_checked=roles_checked,
        problems=tuple(problems),
    )


def format_role_floor(verdict: RoleFloorVerdict) -> list[str]:
    """Le plancher, lisible — un score n'est jamais nu : ses sièges sont nommés,
    et ce qui n'a pas pu être évalué est nommé aussi."""
    lines = [
        f"\n── Plancher de rôles (#2631.1) ──  {verdict.accounts_read} compte(s) lu(s), "
        f"{verdict.roles_checked} siège(s) vérifié(s)"
    ]
    for account in verdict.accounts:
        score = account.score()
        head = "non mesuré" if score is None else f"{score:.2f}"
        parts = [f"tenus: {', '.join(_label(r) for r in account.covered) or '—'}"]
        if account.lost:
            parts.append(f"PERDUS: {', '.join(_label(r) for r in account.lost)}")
        if account.unevaluable:
            parts.append(f"non évaluables: {', '.join(_label(r) for r in account.unevaluable)}")
        mark = "✓" if account.passed() and account.evaluable else "✗"
        lines.append(f"  {mark} {account.slug:<18} {head:>10}  — " + " · ".join(parts))
    return lines
