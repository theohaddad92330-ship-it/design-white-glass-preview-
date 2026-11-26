"""La garde d'ingestion de la base de connaissance, côté service IA.

## Le défaut qu'elle ferme

La doctrine est écrite depuis le premier jour — « ⚠ Le fichier brut ne va JAMAIS
dans un index d'IA. Jamais. » — et `IaClient.ragIngest` (NestJS) la tenait, en se
décrivant comme « la porte UNIQUE du magasin ».

Elle ne l'était pas. Quatre écritures dans `rag_documents` vivent côté Python et
ne traversent jamais NestJS :

- `rag_service.ingest()` — l'INSERT réel ;
- `rag_service.upsert()` — le flywheel de connaissance distillée ;
- `rag_knowledge.populate_from_analysis()`, qui appelle le second ;
- `scripts/ingest_crm.py`, qui insérait un classeur CRM LIGNE À LIGNE, ce qui est
  mot pour mot le premier interdit du manifeste (« export CRM brut »).

Le refus est donc porté ici, sur le SERVICE et non sur la route `/rag/ingest` :
une garde posée sur la route laisserait le script — qui n'y passe pas — écrire.
C'est la différence entre retirer la permission et retirer le MOYEN.

## Pourquoi c'est une COPIE et non un import

La racine Railway du service IA est `apps/ia` : `packages/` n'est pas dans son
contexte de build, donc `packages/contracts/src/knowledge/ingestion-guard.ts`
n'est pas importable. Même contrainte que `RAG_DECAY_HORIZON_DAYS` dans
`rag_service.py`. Deux copies étaient inévitables ; qu'elles divergent ne l'était
pas. Les constantes voyagent en JSON
(`packages/contracts/src/knowledge/ingestion-guard.constants.json`) et
`tests/test_ingestion_guard.py` rougit dès que les deux listes s'écartent.

## Pourquoi elle est aussi ÉTROITE

Un filtre trop large ferait refuser des documents légitimes, et quelqu'un le
désactiverait dans la semaine — ce qui est pire que pas de filtre. Trois règles
seulement, chacune adossée à une preuve :

1. **Un fichier que le manifeste NOMME** et classe hors base de connaissance.
   Le manifeste est une liste d'autorisations POUR LE PAQUET ; le lire comme une
   liste d'interdictions pour tout le produit refuserait chaque dépôt.
2. **Un nom qui porte un codename interne** (#3881, `INTERNAL_CODENAMES`) : un
   fichier nommé d'après un outil interne (« DATAFORGE_V4_FINAL (4).xlsx »)
   devenait une citation visible au client — l'interdit était déjà écrit dans
   `RAG_INGESTION_EXCLUDED`, rien ne l'appliquait.
3. **Un tableau de contacts** : un en-tête délimité qui porte au moins une
   COORDONNÉE et au moins trois colonnes personnelles en tout, suivi d'au moins
   trois lignes de la même forme. C'est la forme exacte d'un export de CRM ; ce
   n'est la forme d'aucun document de méthode, d'aucune plaquette.

Le seuil de TROIS colonnes personnelles n'est pas une coquetterie : « Source ;
URL ; Email de contact » est une bibliographie et doit passer, « Prénom ; Nom ;
Société ; Fonction ; Email ; Téléphone » est un carnet d'adresses et doit être
refusé.

Ce que la garde ne prétend PAS attraper : un carnet d'adresses en PDF, en
classeur, ou recopié en prose. Une garde qui devinerait cela refuserait des CV et
des comptes rendus.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# ── Miroir de `packages/contracts/src/knowledge/method-delta.ts` ──────────────

#: Ce que le paquet autorise à ingérer, et sous quel type. `notRag: True` ⇒ ce
#: fichier n'a RIEN à faire dans la base de connaissance.
RAG_INGESTION_MANIFEST: tuple[dict, ...] = (
    {"file": "commercial_method_delta.md", "type": "retrieval_knowledge", "notRag": False},
    {"file": "title_taxonomy_seed.json", "type": "classifier_seed", "notRag": True},
    {"file": "outreach_scenario_registry.json", "type": "template_metadata", "notRag": True},
    {"file": "meeting_question_library.json", "type": "template_library", "notRag": False},
    {"file": "workflow_catalog_delta.json", "type": "workflow_spec", "notRag": True},
    {"file": "golden_set_candidates.json", "type": "eval_spec", "notRag": True},
)

#: Ce qui ne doit JAMAIS être ingéré, en toutes lettres. La première ligne est la
#: plus coûteuse : l'export CRM brut. Le mettre dans un magasin vectoriel le
#: rendrait retrouvable par n'importe quelle question, indéfiniment, sans
#: qu'aucun des intéressés l'ait su.
RAG_INGESTION_EXCLUDED: tuple[str, ...] = (
    "export CRM brut",
    "doublon DATAFORGE V4",
    "anciens prompts",
    "données de compte propres à un client",
    "images d'inspiration de design",
    "ancienne grille tarifaire",
    "listes d'outils propres à un fournisseur",
)


def may_be_ingested(file: str) -> bool:
    """Ce fichier du paquet peut-il entrer dans la base de connaissance ?

    Un fichier ABSENT du manifeste n'est pas ingérable : le manifeste est une
    liste d'autorisations, pas une liste d'interdictions.
    """
    for entry in RAG_INGESTION_MANIFEST:
        if entry["file"] == file:
            return not entry["notRag"]
    return False


# ── Miroir de `packages/contracts/src/knowledge/ingestion-guard.ts` ───────────

#: Les trois seuls refus possibles. Un code inventé d'un côté produirait un
#: refus que l'autre porte ne saurait pas nommer.
REFUSAL_CODES: tuple[str, ...] = ("not_retrieval_knowledge", "internal_codename", "contact_table")

#: #3881 — les noms internes qu'aucun dépôt ne doit porter : l'interdit
#: (`RAG_INGESTION_EXCLUDED[1]` == « doublon DATAFORGE V4 ») était déjà écrit,
#: rien ne l'appliquait — un fichier nommé d'après l'outil interne traversait
#: la garde et devenait une citation visible au client.
#:
#: V13 (recette prod 08/10) — trois noms de plus, vus EN PRODUCTION dans une
#: citation : « STELYA…zip » et « ORION_DATAPACK_V12…zip » (les archives
#: internes DataForge, `agent_docs/archive-06-dataforge-stelya-2026-08-25.md`
#: / `agent_docs/orion-v12-2026-08-31.md`), et « CRM BASE DE DONNÉES BELLUMAI »
#: — le nom de l'outil lui-même, qu'un client ne doit jamais voir (doctrine :
#: « nos fournisseurs ne se nomment jamais »). Volontairement PRÉCIS plutôt que
#: le mot « orion » seul, qui collisionnerait avec le nom d'un vrai prospect.
INTERNAL_CODENAMES: tuple[str, ...] = ("dataforge", "stelya", "oriondatapack", "bellumai")

#: Ce que chaque type du manifeste est, en français, pour le dire à la personne
#: qui vient de déposer le fichier. Un refus qui ne nomme pas la nature du
#: fichier laisse chercher une panne.
TYPE_LABELS: dict[str, str] = {
    "classifier_seed": "une graine de classifieur",
    "template_metadata": "des métadonnées de gabarits",
    "workflow_spec": "un contrat de workflow",
    "eval_spec": "un jeu d’évaluation",
}

#: Le type existe mais personne ne lui a écrit d'étiquette : on dit quand même ce
#: qu'il est, plutôt que de laisser un trou dans la phrase du refus.
DEFAULT_TYPE_LABEL = "une spécification"

#: Les colonnes qui font d'une ligne une COORDONNÉE — ce avec quoi on joint
#: quelqu'un. C'est leur présence qui distingue un carnet d'un tableau.
#: L'ORDRE est significatif : il est comparé tel quel à la copie TypeScript.
COORDINATE_WORDS: tuple[str, ...] = (
    "email",
    "mail",
    "courriel",
    "telephone",
    "tel",
    "phone",
    "mobile",
    "portable",
    "gsm",
    "linkedin",
)

#: Les colonnes qui désignent une PERSONNE ou son rattachement. Volontairement
#: sans « titre » ni « rôle », trop génériques pour valoir preuve.
IDENTITY_WORDS: tuple[str, ...] = (
    "nom",
    "prenom",
    "name",
    "firstname",
    "lastname",
    "fullname",
    "civilite",
    "contact",
    "societe",
    "company",
    "entreprise",
    "organisation",
    "organization",
    "fonction",
    "poste",
    "job",
)

_COORDINATE_LOOKUP = frozenset(COORDINATE_WORDS)
_IDENTITY_LOOKUP = frozenset(IDENTITY_WORDS)

#: Les séparateurs d'un export réel : le point-virgule d'un Excel français
#: d'abord, parce que c'est celui qu'on rencontre.
SEPARATORS: tuple[str, ...] = (";", "\t", ",")

#: Un en-tête se cherche dans les premières lignes, pas dans tout le fichier :
#: plus on descend, plus on risque de prendre une phrase pour un en-tête.
HEADER_SCAN_LINES = 5
#: Assez de lignes pour reconnaître une régularité, assez peu pour ne rien coûter.
MAX_LINES = 200
MIN_COLUMNS = 3
MIN_DATA_ROWS = 3
MIN_PERSONAL_COLUMNS = 3

#: Les deux refus, EN TOUTES LETTRES, avec leurs trous nommés. Ce sont des
#: gabarits et non des chaînes construites en ligne parce que la porte
#: TypeScript porte les MÊMES : deux refus rédigés séparément divergent en trois
#: semaines, et une personne verrait alors deux explications différentes du même
#: refus selon la porte qu'elle a poussée.
MESSAGE_TEMPLATES: dict[str, str] = {
    "not_retrieval_knowledge": (
        "« {file} » est {label} : le manifeste d’ingestion le classe hors base de connaissance. "
        "Indexé, il remonterait comme réponse à une question commerciale, alors que c’est un fichier "
        "de configuration — sa place est dans le code, où il est versionné et testé."
    ),
    "contact_table": (
        "Ce dépôt a la forme d’un carnet d’adresses : les colonnes « {columns} », et au moins {rows} "
        "lignes derrière. La base de connaissance n’indexe jamais un fichier de contacts — il "
        "deviendrait retrouvable par n’importe quelle question, indéfiniment, sans qu’aucune des "
        "personnes citées l’ait su. Pour faire entrer ces contacts dans Bellum, passe par l’assistant "
        "d’import, qui simule avant d’écrire et te montre ce qu’il a compris."
    ),
    "internal_codename": (
        "« {file} » porte le nom d’un outil interne ({excluded}) : ce dépôt n’entre jamais dans la base "
        "de connaissance — il y resterait retrouvable par n’importe quelle question, indéfiniment, et "
        "une citation le montrerait à un client, qui ne doit jamais voir le nom d’un outil interne. "
        "Renomme le fichier avant de le déposer à nouveau."
    ),
}

_PLACEHOLDER = re.compile(r"\{(\w+)\}")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_EDGE_QUOTES = re.compile(r'^"+|"+$')
_PATH_SEPARATOR = re.compile(r"[/\\]")
# `\r?\n` et non `str.splitlines()` : ce dernier coupe aussi sur \v, \f et
# U+2028, ce que le `split(/\r?\n/)` du contrat TypeScript ne fait pas. Deux
# découpages différents, c'est déjà deux gardes différentes.
_LINE_BREAK = re.compile(r"\r?\n")


@dataclass(frozen=True)
class RagIngestionRefusal:
    """Un refus d'ingestion : son code, et la phrase que la personne lit."""

    #: L'un de :data:`REFUSAL_CODES`.
    code: str
    #: Ce qui a été écarté ET pourquoi. Jamais un silence, jamais « refusé ».
    message: str


class RagIngestionRefused(Exception):
    """Ce dépôt n'entre pas dans la base de connaissance, et voici pourquoi.

    Une exception et non un retour ignorable : le refus doit ARRÊTER l'écriture.
    Un magasin vectoriel ne se dé-indexe pas — une fois le document dedans, il
    reste retrouvable indéfiniment — donc le refus est PRÉALABLE : il tombe avant
    la moindre requête, et il n'y a jamais rien à effacer ensuite.
    """

    def __init__(self, refusal: RagIngestionRefusal) -> None:
        super().__init__(refusal.message)
        self.refusal = refusal
        self.code = refusal.code


def _fill(template: str, values: dict[str, str]) -> str:
    """Remplace `{nom}` par sa valeur. Volontairement bête : un gabarit de refus
    n'a pas de conditionnel, et un moteur en aurait un."""
    return _PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), template)


def _normalize(cell: str) -> str:
    """minuscules, sans accents, ponctuation ramenée à des espaces."""
    decomposed = unicodedata.normalize("NFD", cell.lower())
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _NON_ALNUM.sub(" ", stripped).strip()


def _singular(word: str) -> str:
    """« emails » et « email » sont la même colonne ; « mailing » n'en est pas une."""
    return word[:-1] if len(word) > 3 and word.endswith("s") else word


def _cell_words(cell: str) -> list[str]:
    return [_singular(w) for w in _normalize(cell).split(" ") if w]


def _split_cells(line: str, separator: str) -> list[str]:
    return [_EDGE_QUOTES.sub("", cell.strip()).strip() for cell in line.split(separator)]


def _classify_header(cells: list[str]) -> tuple[list[str], list[str]]:
    """Classe chaque cellule d'en-tête UNE fois — coordonnée d'abord,
    rattachement ensuite. « Email de contact » est une coordonnée, pas deux
    colonnes."""
    coordinates: list[str] = []
    identities: list[str] = []
    for cell in cells:
        words = _cell_words(cell)
        if any(word in _COORDINATE_LOOKUP for word in words):
            coordinates.append(cell)
        elif any(word in _IDENTITY_LOOKUP for word in words):
            identities.append(cell)
    return coordinates, identities


def is_internal_codename(name: str) -> bool:
    """Ce nom porte-t-il un codename interne, quelle que soit sa casse ou sa
    ponctuation (« DATAFORGE_V4_FINAL (4).xlsx », « Export_DataForge.xlsx ») ?

    Partagée entre le refus d'INGESTION (``_internal_codename_refusal``, juste
    en dessous) et le filtre de SORTIE (V13, `rag_knowledge._inject`) : un
    document déjà en base AVANT que cette garde n'existe ne doit pas non plus
    devenir une citation visible au client — la recette prod du 08/10 l'a
    montré (#3881 bis). Un seul calcul, jamais deux qui pourraient diverger
    (GA-26)."""
    folded = _NON_ALNUM.sub("", name.lower())
    return any(codename in folded for codename in INTERNAL_CODENAMES)


def _internal_codename_refusal(filename: str) -> RagIngestionRefusal | None:
    """#3881 — un dépôt dont le NOM porte le codename interne, quelle que soit
    sa casse ou sa ponctuation (« DATAFORGE_V4_FINAL (4).xlsx », « Export_DataForge.xlsx »)."""
    if not is_internal_codename(filename):
        return None
    return RagIngestionRefusal(
        code="internal_codename",
        message=_fill(
            MESSAGE_TEMPLATES["internal_codename"],
            {"file": filename, "excluded": RAG_INGESTION_EXCLUDED[1]},
        ),
    )


def _contact_table_refusal(sample: str) -> RagIngestionRefusal | None:
    lines = [
        stripped for stripped in (line.strip() for line in _LINE_BREAK.split(sample)) if stripped
    ][:MAX_LINES]

    for separator in SEPARATORS:
        for head in range(min(HEADER_SCAN_LINES, len(lines))):
            cells = _split_cells(lines[head], separator)
            if len(cells) < MIN_COLUMNS:
                continue

            coordinates, identities = _classify_header(cells)
            if len(coordinates) < 1:
                continue
            if len(coordinates) + len(identities) < MIN_PERSONAL_COLUMNS:
                continue

            # Un export est RÉGULIER : les lignes ont le nombre de colonnes de
            # leur en-tête. De la prose ponctuée ne l'est pas — c'est ce qui
            # empêche un document de méthode plein de virgules d'être pris pour
            # un tableau.
            rows = sum(
                1 for line in lines[head + 1 :] if len(_split_cells(line, separator)) == len(cells)
            )
            if rows < MIN_DATA_ROWS:
                continue

            named = " », « ".join((coordinates + identities)[:4])
            return RagIngestionRefusal(
                code="contact_table",
                message=_fill(
                    MESSAGE_TEMPLATES["contact_table"], {"columns": named, "rows": str(rows)}
                ),
            )
    return None


def rag_ingestion_refusal(
    filename: str | None = None, sample: str | None = None
) -> RagIngestionRefusal | None:
    """Ce dépôt peut-il entrer dans la base de connaissance ? ``None`` = oui.

    Pure : aucune lecture, aucun réseau, aucun modèle. ``sample`` est du TEXTE —
    le contenu quand on l'a, sinon le début du fichier décodé ; un binaire n'y
    ressemblera à aucun tableau et passera, ce qui est le bon comportement.
    """
    name = _PATH_SEPARATOR.split((filename or "").strip())[-1]

    # Règle 1 — le manifeste, et UNIQUEMENT pour les fichiers qu'il nomme.
    for entry in RAG_INGESTION_MANIFEST:
        if entry["file"] != name:
            continue
        if may_be_ingested(name):
            break
        label = TYPE_LABELS.get(str(entry["type"]), DEFAULT_TYPE_LABEL)
        return RagIngestionRefusal(
            code="not_retrieval_knowledge",
            message=_fill(
                MESSAGE_TEMPLATES["not_retrieval_knowledge"], {"file": name, "label": label}
            ),
        )

    # Règle 2 — le nom interne.
    if name:
        codename_refusal = _internal_codename_refusal(name)
        if codename_refusal is not None:
            return codename_refusal

    # Règle 3 — le carnet d'adresses.
    text = sample or ""
    return _contact_table_refusal(text) if text.strip() else None
