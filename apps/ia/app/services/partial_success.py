"""Message de résultat PARTIEL — #2283.32/.33/.41/.42/.43/.44/.45
(LAU-FINAL-024, épopée #2983).

L'exemple de l'épopée tranche le ton : Laura doit dire

    « J'ai vérifié 18 des 25 personnes. Les sept autres restent en attente. »

et jamais « c'est fait ». Le schéma qui rend ça systématique plutôt
qu'inventé au cas par cas : DISPONIBLE (vérifié X sur Y), MANQUANT (chaque
élément nommé, avec sa raison), POURQUOI (un motif global, optionnel), PROCHAIN
GESTE (toujours présent — jamais un résultat partiel sans suite proposée).

Avant ce module, seul ``prepare_campaign`` (``chat_tools.py``) nommait ce qui
manque — en agrégeant tout dans UNE chaîne d'erreur quand rien n'est
exploitable (pas de « X sur Y »), et sans ce schéma dès qu'au moins un élément
EST exploitable (la liste ``excluded`` existe, mais rien ne dit combien sur
combien). Ce module généralise le patron pour tout outil qui traite un LOT.

Le détail TECHNIQUE (une trace, un code fournisseur) reste dans les logs —
#2283.41 : ce module ne prend que des raisons déjà écrites pour un humain
(``MissingItem.reason``), jamais une exception brute."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MissingItem:
    """Un élément du lot qui n'a pas pu être traité — nommé, jamais tu."""

    label: str
    reason: str = ""


def build_partial_message(
    *,
    verified: int,
    total: int,
    missing: list[MissingItem] | tuple[MissingItem, ...],
    next_action: str,
    why: str = "",
) -> str:
    """Le message d'un résultat partiel — toujours dans le même ordre :
    disponible, manquant (nommé, avec sa raison), pourquoi (si fourni),
    prochain geste (toujours présent).

    ``missing`` vide ne produit aucune section « manque » — on n'affiche pas
    ce qu'on n'a pas (doctrine CLAUDE.md)."""
    parts: list[str] = [f"J'ai vérifié {verified} sur {total}."]

    if missing:
        named = "; ".join(f"{item.label} ({item.reason})" if item.reason else item.label for item in missing)
        plural = "s" if len(missing) > 1 else ""
        parts.append(f"{len(missing)} élément{plural} en attente : {named}.")

    if why:
        parts.append(why)

    parts.append(next_action)

    return " ".join(p for p in parts if p)


__all__ = ["MissingItem", "build_partial_message"]
