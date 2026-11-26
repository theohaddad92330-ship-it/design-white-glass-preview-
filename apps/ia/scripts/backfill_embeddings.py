"""backfill_embeddings.py — calcule l'embedding des documents RAG qui n'en ont pas.

À lancer UNE fois, depuis la console Railway du service IA (l'environnement y
porte déjà `EMBEDDING_API_KEY` et les accès Supabase) :

    python -m scripts.backfill_embeddings --limit 20     # mesurer le coût réel
    python -m scripts.backfill_embeddings                # tout le reste

Pourquoi ce script existe : l'embedding d'un document est calculé à l'ingestion,
donc tout ce qui a été déposé avant que la clé existe n'a pas de vecteur. La
recherche hybride les garde retrouvables par mots, mais pas sémantiquement.

Reprenable : seules les lignes à `embedding IS NULL` sont traitées, une par une.
Une interruption ne laisse aucun état à réparer — on relance, c'est tout.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

_SCRIPT_DIR = Path(__file__).resolve().parent
_IA_ROOT = _SCRIPT_DIR.parent
load_dotenv(_IA_ROOT / ".env")
sys.path.insert(0, str(_IA_ROOT))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("backfill")


async def _run(limit: int | None, batch_size: int) -> int:
    from app.services.rag_service import backfill_embeddings

    if not os.environ.get("EMBEDDING_API_KEY", "").strip():
        logger.error("EMBEDDING_API_KEY absente sur ce service — rien à calculer.")
        return 1

    result = await backfill_embeddings(batch_size=batch_size, max_documents=limit)
    logger.info(
        "Terminé : %s document(s) vectorisé(s), %s en échec, %s parcouru(s).",
        result.get("embedded"),
        result.get("failed"),
        result.get("scanned"),
    )
    # Les échecs restent à NULL et repasseront au prochain lancement : ce n'est
    # pas une erreur fatale, mais le code de sortie doit le dire.
    return 2 if result.get("failed") else 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Nombre maximum de documents à traiter (par défaut : tous). Commencer petit pour mesurer le coût.",
    )
    parser.add_argument("--batch-size", type=int, default=100, help="Taille des lots de lecture.")
    args = parser.parse_args()
    sys.exit(asyncio.run(_run(args.limit, args.batch_size)))


if __name__ == "__main__":
    main()
