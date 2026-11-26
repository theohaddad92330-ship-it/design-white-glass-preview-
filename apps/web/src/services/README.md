# Architecture cache locale (`apps/web`)

- `lib/api/`: client HTTP, query keys, création du `QueryClient`.
- `lib/cache/idb/`: schéma IndexedDB versionné + persister TanStack Query + helpers de lecture/écriture.
- `services/*`: logique métier de cache par domaine (`accounts`, `drafts`, etc.).
- `features/*`: hooks d'écran qui lisent d'abord le cache local puis refetch en arrière-plan.
- `stores/ui/*`: état UI local (sync indicator, statut autosave, etc.) via Zustand.

Stratégie:

1. TanStack Query = source de vérité runtime pour données serveur.
2. Persistance du cache QueryClient dans IndexedDB (`tanstack_query`) pour restauration au reload.
3. Stores métier IndexedDB (`accounts`, `contacts`, `pipeline_runs`, `generated_assets`, `drafts`) pour dernier snapshot local exploitable instantanément.
4. Zustand réservé à l'état UI local (flags/feedback) sans dupliquer les données serveur.
5. Jobs longs: propager un statut métier (`queued`, `running`, `done`, `failed`) dans `pipeline_runs` au lieu d'un loader global.
