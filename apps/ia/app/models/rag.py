from pydantic import BaseModel


class RagQueryRequest(BaseModel):
    query: str
    user_id: str
    top_k: int = 5
    # Team scope. NestJS owns the workspace model and resolves it from the JWT,
    # so the knowledge base an ESN uploads grounds every member's work. Empty =
    # legacy per-user scope (never a widening) — see rag_service._scope.
    workspace_id: str = ""


class RagIngestRequest(BaseModel):
    title: str
    # Texte brut (txt/md/csv/json lus côté client). Optionnel : un PDF/document
    # binaire arrive via ``file_b64`` et le texte est extrait serveur-side.
    content: str = ""
    category: str = ""
    user_id: str
    # Team scope — the uploaded document belongs to the ESN, not the uploader.
    workspace_id: str = ""
    # RAG PDF server-side (Théo p.21) : contenu du fichier en base64 + son nom.
    # Quand présent, le serveur extrait le texte (PDF via pypdf, sinon UTF-8) et
    # l'utilise comme ``content``.
    file_b64: str | None = None
    filename: str | None = None
    # #1954.7 — la PORTÉE du document (Louis, 12/09/2026). "workspace" (défaut,
    # comportement d'avant) ancre l'analyse de toute l'équipe. "conversation" :
    # le document ne sert QU'AU FIL qui l'a déposé — jamais listé dans
    # /knowledge, jamais dans le RAG d'une analyse de compte, jamais dans un
    # autre fil. Un caller qui omet le champ (tout le reste du produit,
    # aujourd'hui) obtient exactement le comportement d'avant.
    scope: str = "workspace"
    # Le fil visé quand scope == "conversation". "" (défaut) = pas de fil —
    # rejeté par rag_service.ingest si scope == "conversation" (le refus est
    # PRÉALABLE, avant toute requête, même arbitrage que _refuse_unless_knowledge).
    conversation_id: str = ""
    # #2779 — le compte visé quand scope == "account" (UUID). "" = aucun —
    # rejeté par rag_service.ingest si scope == "account". NestJS a déjà
    # vérifié que ce compte appartient à l'espace de l'appelant.
    account_id: str = ""
    # #2861 (#2437.2, niveau SOURCE) — la langue ORIGINALE du document,
    # DÉCLARÉE par la personne qui dépose, jamais détectée. "" = non
    # renseigné (NULL en base) — ragIngestSchema (NestJS) n'envoie la clé
    # que si elle est fournie, même arbitrage que account_id ci-dessus.
    language: str = ""


class RagExtractRequest(BaseModel):
    """#2148.16 — extraire le texte d'un fichier SANS l'ingérer : la pièce
    jointe de conversation (cas a, éphémère) n'a besoin que du texte, jamais
    d'une ligne dans ``rag_documents``. Pas de ``user_id``/``workspace_id`` :
    rien n'est lu ni écrit dans le magasin, donc rien à scoper.
    """

    file_b64: str
    filename: str | None = None
    # #3586 — la synchro du Drive interne ("internal_drive") a son propre plafond
    # de taille ; absent = pièce jointe d'utilisateur (8 Mo).
    source: str | None = None
    # #2433.12 (épopée #2876, lot P02 09/10) — le localiseur d'objets (bords du
    # document, grille d'un tableau) : un second appel de vision, demandé par
    # l'API pour une image du CHAT seulement (jamais en salle de démonstration).
    # Absent = `False` : tout autre appelant garde un corps et un coût identiques.
    locate_objects: bool = False


class RagResponse(BaseModel):
    success: bool = True
    data: dict = {}


class DataforgeRagSearchRequest(BaseModel):
    """Recherche sur le corpus ORION V12 PARTAGÉ — pas de `user_id` ni
    `workspace_id` : c'est un fait de marché, pas un contenu d'espace (GA-16).
    """

    query: str
    # Scope la PERTINENCE, jamais l'éligibilité des chunks globaux
    # (`GARDE_FOU_QUALITE`, référentiel) — voir dataforge_rag_chunks.py.
    account_id: str | None = None
    top_k: int = 8


class DataforgeRagBackfillRequest(BaseModel):
    batch_size: int = 100
    max_chunks: int | None = None
    # #3586 — aucun nouveau lot après ce délai ; l'appelant reboucle tant que `done` est faux.
    max_seconds: float | None = None
