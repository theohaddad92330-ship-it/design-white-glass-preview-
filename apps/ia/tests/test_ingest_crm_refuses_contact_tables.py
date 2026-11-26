"""`scripts/ingest_crm.py` n'écrit plus dans le magasin, et dit pourquoi.

Ce script lisait un classeur CRM et insérait CHAQUE LIGNE dans `rag_documents` —
c'est mot pour mot le premier interdit du manifeste d'ingestion
(`RAG_INGESTION_EXCLUDED[0] == 'export CRM brut'`), et il contournait la garde
TypeScript de `IaClient.ragIngest` en ne passant jamais par NestJS.

Deux choses sont tenues ici, et la seconde est celle qui compte :

1. le script REFUSE, avec un message qui dit pourquoi et quoi faire à la place ;
2. le MOYEN a disparu — plus aucun chemin d'écriture vers `rag_documents` ne
   subsiste dans le fichier. Retirer la permission sans retirer le moyen laisse
   le geste à une ligne de distance : il suffit de commenter le refus.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ingest_crm.py"
README = Path(__file__).resolve().parents[1] / "scripts" / "README.md"


def _load():
    spec = importlib.util.spec_from_file_location("ingest_crm_under_test", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _source() -> str:
    assert SCRIPT.exists(), f"script introuvable : {SCRIPT}"
    text = SCRIPT.read_text(encoding="utf-8")
    # La preuve que cette garde LIT quelque chose : un fichier vidé passerait
    # toutes les recherches de motif ci-dessous.
    assert len(text) > 500, "le script est vide — la garde ne lirait rien"
    return text


def test_le_script_refuse_et_sort_en_erreur() -> None:
    module = _load()
    with pytest.raises(SystemExit) as excinfo:
        module.main(Path("RAG_BELLUMAI_CRM.xlsx"))
    # Non nul : un opérateur qui l'enchaîne dans un script doit s'arrêter là.
    assert excinfo.value.code == 2


def test_le_refus_dit_POURQUOI_et_cite_linterdit_en_toutes_lettres() -> None:
    module = _load()
    assert "export CRM brut" in module.REFUSAL
    assert "index d’IA" in module.REFUSAL or "index d'IA" in module.REFUSAL


def test_le_refus_dit_QUOI_FAIRE_a_la_place() -> None:
    # Un refus sans issue se contourne : quelqu'un rouvrira le chemin.
    module = _load()
    assert "assistant d’import" in module.REFUSAL
    assert "Connaissances" in module.REFUSAL


def test_le_moyen_a_disparu_du_script() -> None:
    """Plus aucun chemin d'écriture vers `rag_documents`, pas seulement un refus."""
    source = _source()
    # `sys.path.insert` est la seule insertion tolérée : elle rend le service
    # importable pour CITER l'interdit, elle n'écrit nulle part.
    inserts = [
        call
        for call in re.findall(r"[\w.\]\)]+\.insert\s*\(", source)
        if not call.startswith("sys.path.")
    ]
    assert not inserts, f"une insertion subsiste dans le script : {inserts}"
    assert "SupabaseREST" not in source, "le client d'écriture est encore importé"
    # Aucune lecture d'environnement : sans identifiants, il n'y a même pas de
    # quoi se connecter. Le nom de la clé peut rester dans la PROSE (le refus
    # explique ce qui a été retiré), jamais dans un appel.
    assert "os.environ" not in source, "le script lit encore l'environnement"
    assert "getenv" not in source, "le script lit encore l'environnement"
    assert "load_dotenv" not in source, "le script charge encore un fichier d'identifiants"
    # Le nom de la table peut rester dans la PROSE du refus (il faut bien dire
    # ce qui était écrit) — mais jamais dans un appel.
    assert not re.search(r"table\s*\(\s*[\"']rag_documents", source)


def test_le_README_ne_promet_plus_linverse_de_la_doctrine() -> None:
    """Le README annonçait « Ingest a CRM export into the `rag_documents` table ».

    Une documentation qui promet le geste interdit le fait revenir : la
    prochaine personne réécrit le script en croyant réparer un manque.
    """
    assert README.exists()
    text = README.read_text(encoding="utf-8")
    assert len(text) > 200, "le README est vide — la garde ne lirait rien"
    assert not re.search(r"inserts? .{0,40}into `?rag_documents", text, re.I)
    assert not re.search(r"ingest a crm export into", text, re.I)
    assert "export CRM brut" in text or "raw CRM export" in text
