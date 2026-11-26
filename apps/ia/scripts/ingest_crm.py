"""ingest_crm.py — ce script n'écrit plus rien, et voici pourquoi.

## Ce qu'il faisait

Il lisait un classeur CRM (`RAG_BELLUMAI_CRM.xlsx`), transformait chaque ligne en
texte, et l'insérait dans la table `rag_documents` — le magasin que la recherche
sémantique interroge. Des milliers de contacts, avec leurs coordonnées, dans un
index d'IA.

## Pourquoi c'est refusé

C'est le premier interdit du manifeste d'ingestion, en toutes lettres :
`RAG_INGESTION_EXCLUDED[0] == "export CRM brut"`. Un carnet d'adresses indexé
devient retrouvable par n'importe quelle question, indéfiniment, sans qu'aucune
des personnes citées l'ait su — et un magasin vectoriel ne se dé-indexe pas.

Le refus vit à DEUX niveaux, délibérément :

1. ici, dans le script, qui s'arrête avant même d'ouvrir le fichier ;
2. dans `app/services/ingestion_guard.py`, branché sur `rag_service.ingest()` et
   `rag_service.upsert()` — donc un script réécrit demain se heurterait à la même
   porte, sans rien avoir à respecter de lui-même.

Et le MOYEN a disparu avec la permission : plus aucun client Supabase, plus aucun
`insert`, plus aucune lecture de `SUPABASE_SERVICE_ROLE_KEY` dans ce fichier. Un
refus qu'il suffirait de commenter pour retrouver le geste n'est pas un refus.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_IA_ROOT = _SCRIPT_DIR.parent

# Le service est importable quand on lance le script à la main depuis le dépôt :
# le refus CITE l'interdit plutôt que de le paraphraser, donc il doit pouvoir le
# lire là où il vit.
sys.path.insert(0, str(_IA_ROOT))

from app.services.ingestion_guard import RAG_INGESTION_EXCLUDED  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


#: Ce que l'opérateur lit. Il dit POURQUOI et QUOI FAIRE À LA PLACE : un refus
#: sans issue se contourne, et quelqu'un rouvrirait le chemin de bonne foi.
REFUSAL = f"""
Refusé : un export CRM brut ne va pas dans un index d’IA.

Ce script insérait chaque ligne d’un classeur CRM dans la table `rag_documents`,
celle que la recherche sémantique interroge. C’est mot pour mot le premier
interdit du manifeste d’ingestion (« {RAG_INGESTION_EXCLUDED[0]} ») : un carnet
d’adresses indexé devient retrouvable par n’importe quelle question,
indéfiniment, sans qu’aucune des personnes citées l’ait su — et un magasin
vectoriel ne se dé-indexe pas.

À la place :

  • Des comptes et des contacts à faire entrer dans Bellum
    → l’assistant d’import, qui simule avant d’écrire et te montre ce qu’il a
      compris. Ils vont dans le CRM, pas dans l’index.

  • De la CONNAISSANCE à faire entrer dans la base (une méthode, une référence,
    une plaquette, un cadrage sectoriel)
    → Connaissances › Mes documents. Ce dépôt-là passe par la garde
      d’ingestion, qui laisse passer un document de méthode et refuse un
      tableau de contacts.

La garde vit dans `app/services/ingestion_guard.py` (miroir de
`packages/contracts/src/knowledge/ingestion-guard.ts`) et elle est branchée sur
`rag_service.ingest()` et `rag_service.upsert()` : il n’y a pas de chemin
alentour à trouver.
""".strip()


def main(file_path: Path, dry_run: bool = False) -> None:
    """Refuse, explique, et sort en erreur. Ne lit RIEN — pas même le fichier.

    ``dry_run`` est accepté et ignoré : un opérateur qui tape la commande qu'il
    connaît doit tomber sur l'explication, pas sur une erreur d'argument.
    """
    logger.error("Ingestion CRM refusée : %s", file_path)
    # L'explication passe par stdout : elle se lit, elle ne s'analyse pas, et
    # elle ne doit pas être noyée dans un flux d'erreurs.
    print(REFUSAL)  # noqa: T201 — c'est la sortie utile de ce script
    # 2 et non 1 : « refusé par une règle » n'est pas « le fichier est illisible ».
    sys.exit(2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="OBSOLÈTE — un export CRM brut ne va pas dans un index d’IA. "
        "Voir `apps/ia/scripts/README.md`.",
    )
    parser.add_argument(
        "--file",
        required=True,
        type=Path,
        metavar="PATH",
        help="Ignoré : ce script n’écrit plus rien.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Ignoré : ce script n’écrit plus rien.",
    )
    args = parser.parse_args()
    main(file_path=args.file, dry_run=args.dry_run)
