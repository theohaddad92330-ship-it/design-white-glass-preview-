"""La garde d'ingestion côté Python — et la porte qu'elle ferme réellement.

## Le défaut

`IaClient.ragIngest` (NestJS) se décrit comme « la porte UNIQUE du magasin » et
refuse un export CRM brut avant tout appel réseau. Elle n'était pas unique :
`apps/ia/app/services/rag_service.py` écrit dans `rag_documents` par DEUX chemins
qui ne traversent jamais NestJS — `ingest()` et `upsert()` — et
`apps/ia/scripts/ingest_crm.py` insérait un classeur CRM ligne à ligne, ce qui
est mot pour mot le premier interdit du manifeste (« export CRM brut »).

## Ce que ce fichier tient

1. le miroir Python refuse et laisse passer EXACTEMENT ce que refuse et laisse
   passer `packages/contracts/src/knowledge/ingestion-guard.ts` (les cas sont
   repris un pour un de `ingestion-guard.test.ts`) ;
2. le refus est posé sur le SERVICE, pas sur la route — donc il tient aussi pour
   un appelant qui ne passe pas par FastAPI ;
3. le flywheel légitime (connaissance distillée, `rag_knowledge.py`) passe
   toujours : la garde refuse le BRUT, pas le DISTILLÉ ;
4. les deux copies des constantes ne peuvent pas diverger sans rougir.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services import ingestion_guard, rag_knowledge, rag_service
from app.services.ingestion_guard import (
    RAG_INGESTION_EXCLUDED,
    RAG_INGESTION_MANIFEST,
    RagIngestionRefused,
    rag_ingestion_refusal,
)

# Un export CRM tel qu'un commercial le télécharge : point-virgule (Excel FR),
# en-tête de coordonnées, des lignes derrière. Repris à l'identique du test
# TypeScript — deux corpus différents laisseraient les deux gardes diverger sans
# qu'aucune ne rougisse.
CRM_EXPORT = "\n".join(
    [
        "Prénom;Nom;Société;Fonction;Email;Téléphone",
        "Jean;Dupont;ACME;DSI;jean.dupont@acme.fr;01 42 00 00 00",
        "Marie;Martin;BETA;DAF;marie.martin@beta.fr;01 43 00 00 00",
        "Paul;Durand;GAMMA;CTO;paul.durand@gamma.fr;01 44 00 00 00",
    ]
)


# ── Règle 1 : ce que le manifeste NOMME ───────────────────────────────────────


def test_refuse_un_fichier_du_paquet_classe_hors_base_de_connaissance() -> None:
    refusal = rag_ingestion_refusal(filename="title_taxonomy_seed.json")
    assert refusal is not None
    assert refusal.code == "not_retrieval_knowledge"
    # Le refus DIT ce que le fichier est, pas seulement qu'il est refusé.
    assert "title_taxonomy_seed.json" in refusal.message
    assert "graine de classifieur" in refusal.message


def test_laisse_passer_les_entrees_du_manifeste_qui_sont_de_la_connaissance() -> None:
    knowledge = [e for e in RAG_INGESTION_MANIFEST if not e["notRag"]]
    assert knowledge, "le manifeste n'autorise plus rien — corpus vide"
    for entry in knowledge:
        assert (
            rag_ingestion_refusal(
                filename=entry["file"], sample="Le plan de compte est une discipline."
            )
            is None
        )


def test_ne_juge_pas_un_fichier_absent_du_manifeste_sur_son_nom() -> None:
    # Le manifeste est une liste d'autorisations pour LE PAQUET. Le lire comme
    # une liste d'interdictions pour tout le produit refuserait chaque dépôt.
    assert rag_ingestion_refusal(filename="plaquette-commerciale.pdf", sample="Notre offre.") is None
    assert rag_ingestion_refusal(filename="methode-vente.md", sample="Une objection se valide.") is None


# ── Règle 2 : le nom interne ───────────────────────────────────────────────────


def test_refuse_un_fichier_dont_le_nom_porte_le_codename_interne() -> None:
    # #3881 — « JE JAMAIS CITÉ DATAFORGE » : un fichier nommé d'après l'outil
    # interne traversait la garde et devenait une citation visible au client.
    # L'interdit (`RAG_INGESTION_EXCLUDED[1]` == « doublon DATAFORGE V4 ») était
    # déjà écrit ; rien ne l'appliquait avant ce correctif.
    refusal = rag_ingestion_refusal(filename="DATAFORGE_V4_FINAL (4).xlsx")
    assert refusal is not None
    assert refusal.code == "internal_codename"
    assert "DATAFORGE_V4_FINAL (4).xlsx" in refusal.message
    assert "doublon DATAFORGE V4" in refusal.message


def test_refuse_le_codename_interne_quelle_que_soit_la_casse_ou_la_ponctuation() -> None:
    for name in ("dataforge-export.csv", "Export_DataForge.xlsx", "data forge (copie).pdf"):
        assert rag_ingestion_refusal(filename=name).code == "internal_codename"


def test_ne_refuse_pas_un_nom_qui_ne_porte_pas_le_codename() -> None:
    assert rag_ingestion_refusal(filename="plaquette-commerciale.pdf", sample="Notre offre.") is None


def test_refuse_les_trois_codenames_vus_en_recette_prod_08_10() -> None:
    # V13 (#3881 bis) — « mémoire interne data forge » restituait ces trois
    # noms comme sources visibles au client : STELYA et ORION_DATAPACK sont
    # les archives internes DataForge, BELLUMAI est le nom de l'outil lui-même.
    for name in ("STELYA_SOMETHING_FINAL (2).zip", "ORION_DATAPACK_V12_FINAL.zip", "CRM BASE DE DONNÉES BELLUMAI.xlsx"):
        assert rag_ingestion_refusal(filename=name).code == "internal_codename"


def test_ne_refuse_pas_un_nom_de_prospect_qui_ressemble_a_orion() -> None:
    # Le codename est `oriondatapack`, jamais `orion` seul : une ESN qui
    # prospecte une vraie entreprise « Orion » ne doit jamais voir son dossier
    # refusé au dépôt.
    assert rag_ingestion_refusal(filename="Orion — fiche compte.pdf", sample="Notre offre.") is None


# ── Règle 3 : le carnet d'adresses ────────────────────────────────────────────


def test_refuse_un_export_crm_brut() -> None:
    refusal = rag_ingestion_refusal(filename="export_crm_17387_contacts.csv", sample=CRM_EXPORT)
    assert refusal is not None
    assert refusal.code == "contact_table"
    # Ce qui a été RECONNU est nommé — sinon la personne ne sait pas quoi corriger.
    assert "Email" in refusal.message
    assert "Téléphone" in refusal.message


def test_refuse_le_meme_export_en_virgules_en_tabulations_et_sans_extension_parlante() -> None:
    comma = CRM_EXPORT.replace(";", ",")
    tab = CRM_EXPORT.replace(";", "\t")
    assert rag_ingestion_refusal(filename="contacts.txt", sample=comma).code == "contact_table"
    assert rag_ingestion_refusal(sample=tab).code == "contact_table"


def test_refuse_un_export_dont_seules_les_coordonnees_sont_en_anglais() -> None:
    english = "\n".join(
        [
            "First name,Last name,Company,Work email,Phone number",
            "Jean,Dupont,ACME,jean@acme.fr,0142000000",
            "Marie,Martin,BETA,marie@beta.fr,0143000000",
            "Paul,Durand,GAMMA,paul@gamma.fr,0144000000",
        ]
    )
    assert rag_ingestion_refusal(sample=english).code == "contact_table"


# ── Ce qu'elle ne bloque PAS ──────────────────────────────────────────────────


def test_laisse_passer_un_document_de_methode_meme_avec_des_virgules_partout() -> None:
    prose = "\n".join(
        [
            "Le plan de compte est une discipline hebdomadaire, pas un document figé.",
            "Le haut et le bas de l’organisation se travaillent en parallèle, jamais l’un après l’autre.",
            "Une objection se valide d’abord, puis s’explore par une question, sans réciter l’offre.",
            "Le NON-résultat d’une action est un résultat exploitable, et il se journalise.",
        ]
    )
    assert rag_ingestion_refusal(filename="methode.md", sample=prose) is None


def test_laisse_passer_un_tableau_qui_ne_porte_aucune_coordonnee() -> None:
    grid = "\n".join(
        [
            "Palier;Prix mensuel;Crédits inclus;Siège supplémentaire",
            "Starter;119;80;39",
            "Growth;249;250;59",
            "Team;sur devis;sur devis;sur devis",
        ]
    )
    assert rag_ingestion_refusal(filename="grille.csv", sample=grid) is None


def test_laisse_passer_un_tableau_de_moins_de_trois_colonnes_personnelles() -> None:
    # C'est le seuil qui sépare une bibliographie d'un carnet d'adresses.
    sources = "\n".join(
        [
            "Source;URL;Email de contact",
            "BOAMP;https://boamp.fr;contact@boamp.fr",
            "DECP;https://data.gouv.fr;contact@data.gouv.fr",
            "BODACC;https://bodacc.fr;contact@bodacc.fr",
        ]
    )
    assert rag_ingestion_refusal(filename="sources.csv", sample=sources) is None

    tools = "\n".join(
        [
            "Outil;Société éditrice;Email support;Documentation",
            "Registre;ACME;support@acme.fr;https://acme.fr/doc",
            "Annuaire;BETA;support@beta.fr;https://beta.fr/doc",
            "Cartographie;GAMMA;support@gamma.fr;https://gamma.fr/doc",
        ]
    )
    assert rag_ingestion_refusal(filename="outils.csv", sample=tools) is None


def test_laisse_passer_un_entete_de_contacts_sans_lignes_derriere() -> None:
    # Un gabarit vide n'est le carnet de personne.
    assert rag_ingestion_refusal(sample="Prénom;Nom;Email;Téléphone") is None


def test_laisse_passer_un_depot_vide_ou_binaire() -> None:
    assert rag_ingestion_refusal() is None
    assert rag_ingestion_refusal(filename="plaquette.pdf", sample="%PDF-1.4\n%âãÏÓ\n") is None


# ── La porte est sur le SERVICE, pas sur la route ─────────────────────────────


class _ExplodingClient:
    """Tout appel au magasin est une erreur : le refus doit tomber AVANT."""

    def table(self, name: str):  # pragma: no cover — appelé = test rouge
        raise AssertionError(f"le magasin a été touché ({name}) alors que le dépôt est refusé")


class _Res:
    def __init__(self, data: list[dict]) -> None:
        self.data = data
        self.error = None


class _Exec:
    def __init__(self, res: _Res) -> None:
        self._res = res

    async def aexecute(self) -> _Res:
        return self._res


class _RecordingClient:
    """Le minimum pour qu'une écriture aboutisse, en gardant ce qui a été écrit.

    La recherche de doublon ne trouve rien : le chemin exercé est donc l'INSERT,
    celui qui écrit réellement dans le magasin."""

    def __init__(self) -> None:
        self.inserted: list[dict] = []

    def table(self, name: str):
        return self

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def or_(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def insert(self, data):
        self.inserted.append(data)
        return _Exec(_Res([{"id": "doc-1"}]))

    async def aexecute(self) -> _Res:
        return _Res([])


async def test_ingest_refuse_un_export_crm_avant_toute_ecriture(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _ExplodingClient())
    with pytest.raises(RagIngestionRefused) as excinfo:
        await rag_service.ingest("export_crm.csv", CRM_EXPORT, "crm", "u1")
    assert excinfo.value.code == "contact_table"
    # Le refus explique — un magasin vectoriel ne se dé-indexe pas, donc la
    # personne doit savoir quoi faire au lieu de réessayer.
    assert "assistant d’import" in str(excinfo.value)


async def test_upsert_refuse_un_export_crm_avant_toute_ecriture(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _ExplodingClient())
    with pytest.raises(RagIngestionRefused) as excinfo:
        await rag_service.upsert("export_crm.csv", CRM_EXPORT, "crm", "u1")
    assert excinfo.value.code == "contact_table"


async def test_le_flywheel_distille_passe_toujours(monkeypatch: pytest.MonkeyPatch) -> None:
    """La garde refuse le BRUT et laisse passer le DISTILLÉ.

    C'est la moitié qui compte autant que l'autre : une garde qui casserait
    `rag_knowledge.populate_from_analysis` serait désactivée dans la semaine, et
    on se retrouverait sans garde du tout.
    """
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    client = _RecordingClient()
    monkeypatch.setattr(rag_service, "get_supabase", lambda: client)

    docs = rag_knowledge._distill_docs(
        "ACME",
        {
            "sector": "Banque",
            "businessDescription": "Banque de détail",
            "employees": "12 000",
            "headquarters": "Paris",
            "pains": [{"pain": "Dette technique sur le core banking"}],
            "itChallenges": ["Migration cloud"],
            "angles": [{"title": "Modernisation du SI", "rationale": "Programme lancé en 2026."}],
        },
        {"actionPlan": {"strategy": "Entrer par la DSI, puis le métier."}},
    )
    assert docs, "rien à distiller — le test ne prouverait rien"

    for doc in docs:
        assert rag_ingestion_refusal(filename=doc["title"], sample=doc["content"]) is None
        out = await rag_service.upsert(doc["title"], doc["content"], doc["category"], "u1")
        assert out["id"] == "doc-1"

    # Le flywheel a bien ÉCRIT — sans cette assertion, une garde qui refuserait
    # tout en silence passerait ce test.
    assert len(client.inserted) == len(docs)


# ── La parité TypeScript ↔ Python ─────────────────────────────────────────────
#
# Les deux copies existent parce que la racine Railway du service IA est
# `apps/ia` : `packages/` n'est pas dans son contexte de build, donc rien ne peut
# être importé (même contrainte que `RAG_DECAY_HORIZON_DAYS`). Ce qui n'était pas
# inévitable, c'est qu'elles divergent.

SHARED = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "src"
    / "knowledge"
    / "ingestion-guard.constants.json"
)


def _shared() -> dict:
    assert SHARED.exists(), f"constantes partagées introuvables : {SHARED}"
    return json.loads(SHARED.read_text(encoding="utf-8"))


def test_le_corpus_partage_nest_pas_vide() -> None:
    """La preuve que cette garde LIT quelque chose.

    Un JSON vidé, tronqué ou renommé rendrait toutes les comparaisons
    ci-dessous vraies par vacuité. Ces bornes-là ne peuvent pas se vider sans
    qu'un test rougisse.
    """
    shared = _shared()
    # Les clés d'abord : un JSON tronqué doit rougir en DISANT ce qui manque,
    # pas exploser en KeyError trois assertions plus bas.
    manquantes = {
        "codes",
        "coordinateWords",
        "identityWords",
        "separators",
        "typeLabels",
        "defaultTypeLabel",
        "thresholds",
        "messages",
        "manifest",
        "excluded",
        "internalCodenames",
    } - set(shared)
    assert not manquantes, f"clés absentes des constantes partagées : {sorted(manquantes)}"

    assert len(shared["coordinateWords"]) >= 10
    assert len(shared["identityWords"]) >= 16
    assert len(shared["manifest"]) == 6
    assert len(shared["excluded"]) == 7
    assert len(shared["internalCodenames"]) >= 1
    assert "{columns}" in shared["messages"]["contact_table"]
    assert "{file}" in shared["messages"]["not_retrieval_knowledge"]
    assert "{file}" in shared["messages"]["internal_codename"]


def test_le_vocabulaire_est_le_meme_des_deux_cotes_et_dans_le_meme_ordre() -> None:
    shared = _shared()
    assert list(ingestion_guard.COORDINATE_WORDS) == shared["coordinateWords"]
    assert list(ingestion_guard.IDENTITY_WORDS) == shared["identityWords"]
    assert list(ingestion_guard.SEPARATORS) == shared["separators"]
    assert list(ingestion_guard.INTERNAL_CODENAMES) == shared["internalCodenames"]


def test_les_seuils_sont_les_memes_des_deux_cotes() -> None:
    thresholds = _shared()["thresholds"]
    assert thresholds["headerScanLines"] == ingestion_guard.HEADER_SCAN_LINES
    assert thresholds["maxLines"] == ingestion_guard.MAX_LINES
    assert thresholds["minColumns"] == ingestion_guard.MIN_COLUMNS
    assert thresholds["minDataRows"] == ingestion_guard.MIN_DATA_ROWS
    assert thresholds["minPersonalColumns"] == ingestion_guard.MIN_PERSONAL_COLUMNS


def test_les_refus_sont_redigés_a_lidentique_des_deux_cotes() -> None:
    shared = _shared()
    assert shared["messages"] == ingestion_guard.MESSAGE_TEMPLATES
    assert shared["typeLabels"] == ingestion_guard.TYPE_LABELS
    assert shared["defaultTypeLabel"] == ingestion_guard.DEFAULT_TYPE_LABEL
    assert list(ingestion_guard.REFUSAL_CODES) == shared["codes"]


def test_le_manifeste_et_linterdit_sont_les_memes_des_deux_cotes() -> None:
    shared = _shared()
    assert [dict(e) for e in RAG_INGESTION_MANIFEST] == shared["manifest"]
    assert list(RAG_INGESTION_EXCLUDED) == shared["excluded"]
    # L'interdit que `ingest_crm.py` enfreignait, en toutes lettres.
    assert RAG_INGESTION_EXCLUDED[0] == "export CRM brut"
