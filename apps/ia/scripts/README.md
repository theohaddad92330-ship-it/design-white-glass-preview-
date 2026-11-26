# BellumAI — scripts d'exploitation du magasin RAG

> **Un export CRM brut ne va JAMAIS dans un index d'IA.**
> C'est le premier interdit du manifeste d'ingestion
> (`RAG_INGESTION_EXCLUDED[0] == "export CRM brut"`, `packages/contracts/src/knowledge/method-delta.ts`).
> Ce README promettait exactement l'inverse — il annonçait, en une ligne, l'insertion d'un export
> CRM dans la table `rag_documents` — et le script qu'il documentait le faisait, ligne à ligne, sans
> jamais traverser la garde d'ingestion de l'API. Les deux sont corrigés.

---

## `ingest_crm.py` — **refusé, conservé pour l'expliquer**

Le script lisait un classeur CRM et insérait chaque ligne dans `rag_documents`.
Aujourd'hui il refuse, dit pourquoi, dit quoi faire à la place, et sort en `2`.

```bash
python apps/ia/scripts/ingest_crm.py --file RAG_BELLUMAI_CRM.xlsx
# → Refusé : un export CRM brut ne va pas dans un index d’IA. […]
```

Il est **gardé en place plutôt que supprimé** : un fichier effacé se réécrit, une
explication se lit. Et le moyen a disparu avec la permission — plus aucun client
Supabase, plus aucun `insert`, plus aucune lecture de
`SUPABASE_SERVICE_ROLE_KEY` dans le fichier. Un refus qu'il suffirait de
commenter pour retrouver le geste n'est pas un refus.
Garde : `apps/ia/tests/test_ingest_crm_refuses_contact_tables.py`.

### Pourquoi

Un carnet d'adresses indexé devient retrouvable par n'importe quelle question,
indéfiniment, sans qu'aucune des personnes citées l'ait su — et **un magasin
vectoriel ne se dé-indexe pas** : il n'y a pas de « défaire » après coup. C'est
pour cette raison que le refus est PRÉALABLE, avant la moindre requête.

### Que faire à la place

| Ce qu'on veut faire entrer                                             | Par où                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Des comptes, des contacts                                              | L'assistant d'import — il simule avant d'écrire et montre ce qu'il a compris. Va dans le CRM. |
| De la connaissance (méthode, référence, plaquette, cadrage sectoriel)  | Connaissances › Mes documents — passe par la garde d'ingestion.                              |

---

## La garde d'ingestion, et où elle vit

`IaClient.ragIngest` (NestJS) se décrivait comme « la porte UNIQUE du magasin ».
Elle ne l'était pas : `apps/ia/app/services/rag_service.py` écrit dans
`rag_documents` par deux chemins qui ne traversent jamais NestJS.

Le refus est donc porté des deux côtés du fil :

| Où                                                        | Quoi                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/contracts/src/knowledge/ingestion-guard.ts`     | La garde d'origine, appelée par `IaClient.ragIngest`.             |
| `apps/ia/app/services/ingestion_guard.py`                 | Son miroir Python, branché sur `rag_service.ingest()` et `upsert()`. |
| `packages/contracts/src/knowledge/ingestion-guard.constants.json` | Le vocabulaire, les seuils et les messages, partagés.        |

Le miroir est une COPIE et non un import : la racine Railway du service IA est
`apps/ia`, donc `packages/` n'est pas dans son contexte de build (même contrainte
que `RAG_DECAY_HORIZON_DAYS`). Deux gardes de parité empêchent les copies de
diverger — `packages/contracts/src/knowledge/ingestion-guard.test.ts` et
`apps/ia/tests/test_ingestion_guard.py`.

Elle est branchée sur le SERVICE et non sur la route `/rag/ingest` : une garde
posée sur la route aurait laissé `ingest_crm.py` — qui n'y passait pas — écrire.

Ce qu'elle refuse, et rien d'autre :

1. un fichier que le manifeste d'ingestion NOMME et classe hors base de
   connaissance (une graine de classifieur, un contrat de workflow…) ;
2. un tableau de contacts — un en-tête portant au moins une coordonnée et trois
   colonnes personnelles, suivi d'au moins trois lignes de la même forme.

Un document de méthode plein de virgules, une grille tarifaire, une
bibliographie avec une colonne « Email de contact » : tout cela passe. Un filtre
trop large ferait refuser des dépôts légitimes, et quelqu'un le désactiverait
dans la semaine — ce qui serait pire que pas de filtre.

---

## Notes

- Le précédent `ingest_rag.py` (graine JSON locale dans `data/`) a été retiré :
  la donnée était orpheline et son contenu qualitatif vit désormais dans
  `apps/ia/app/knowledge/`, chargé et injecté dans le prompt de plan.
- Le rattrapage d'embeddings (`backfill_embeddings.py`) est le seul script de ce
  dossier qui touche encore `rag_documents`, et il n'ajoute AUCUN document : il
  calcule le vecteur des lignes déjà présentes qui n'en ont pas.
