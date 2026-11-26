# Système RAG — Retrieval-Augmented Generation

## Qu'est-ce que le RAG

Au lieu de laisser Claude improviser, on lui DONNE du contenu de référence avant qu'il génère.
La différence entre un stagiaire qui improvise et un commercial senior avec 10 ans de templates.

## Architecture technique

- pgvector activé dans Supabase (extension PostgreSQL pour les vecteurs)
- Table rag_documents avec colonne embedding VECTOR(1536)
- LangChain (Python) pour le chunking, l'embedding et la recherche
- Au moment de générer un message, le système :
  1. Cherche le template le plus pertinent (par persona + scénario + secteur)
  2. L'injecte dans le prompt Claude comme contexte
  3. Claude génère un message dans le STYLE du template, pas du générique

## Contenu à injecter (3 couches)

### Couche 1 — Templates Sales Connect (36 messages)

4 scénarios × 3 personas × 3 messages = 36 templates

- Scénarios : approche froide, relance, suivi post-RDV, réactivation
- Personas : DSI/CTO, directeur métier, acheteur
- Messages : LinkedIn, email, relance
  Chaque template a : accroche, corps, CTA, variantes par secteur

### Couche 2 — Playbook cold calling ESN

- Structure d'appel (opening → qualification → pitch → objections → closing)
- Accroches par secteur (banque, industrie, retail, public)
- Objections fréquentes et réponses argumentées
- Techniques de closing ESN (régie vs forfait)

### Couche 3 — Données CRM historiques

- 1188 comptes avec secteur, taille, historique
- 4266 contacts avec postes, interactions
- 1102 missions avec TJM, durée, technos
- Usage : quand un utilisateur analyse "Société Générale", le prompt récupère les missions passées

## Implémentation avec LangChain + pgvector

```python
from langchain.embeddings import OpenAIEmbeddings  # ou Anthropic
from langchain.vectorstores import SupabaseVectorStore
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 1. Chunker les documents
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(documents)

# 2. Embedder et stocker dans Supabase
vector_store = SupabaseVectorStore.from_documents(
    chunks,
    embedding=OpenAIEmbeddings(),
    client=supabase_client,
    table_name="rag_documents"
)

# 3. Recherche au moment de la génération
results = vector_store.similarity_search(
    query="template LinkedIn approche DSI secteur banque",
    k=3
)
# Injecter results dans le prompt Claude
```

## Vision long terme du RAG

1. Les utilisateurs uploadent leurs propres pitchs, CVs, références → le RAG se personnalise
2. Le RAG apprend des missions passées : "chez SocGen, les missions data se vendent à 580€/j"
3. Le RAG croise les comptes : "3 autres utilisateurs ont aussi ciblé SNCF" (anonymisé)
4. Avantage cumulatif : plus on a d'utilisateurs, plus le RAG est intelligent
