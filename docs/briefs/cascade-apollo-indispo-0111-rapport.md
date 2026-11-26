# Rapport — cascade d'enrichissement, Apollo à sec (01/11/2026)

- Branche `claude/cascade-apollo-indispo-0111`, PR prête vers main.
- ÉCART AU BRIEF : Kaspr/FullEnrich n'existent PAS dans l'IA (`apps/ia`) ; la cascade des sources suivantes vit dans l'API (`contacts.service.ts`, `extraEnrichers`). Le correctif est donc côté API, pas dans `contact_enrich.py`/`apollo.py`.
- `enrichment-failure.ts` : `isApolloDry` (quota_exceeded, unauthorized, missing_api_key, ou upstream_error « insufficient credits »/HTTP 422). Timeout/réseau/429 : exclus.
- `contacts.service.ts` : Apollo à sec + une source configurée ⇒ erreur journalisée, `notifyEnrichmentOutage` toujours émis, la cascade continue (Dropcontact, Kaspr/FullEnrich…) ; Apollo tracé `error` (journal + sources), durée non mesurée.
- Si rien n'est trouvé ailleurs ⇒ comportement d'avant (`enrichment_unavailable`, aucun débit), via `failEnrichmentOutage` (extrait du `catch`, sans changement).
- Source sans clé ⇒ `isEnabled()` faux ⇒ jamais appelée.
- Tests (rouge → vert) : `contacts.service.spec.ts` « Apollo à sec » (5 cas) ; 556 verts avec `enrichment-failure.spec.ts`. `tsc --noEmit` : aucune erreur dans contacts/.
- Pas de pytest : aucun changement IA.
- Non fait : coût par fournisseur D19 non modifié (l'en-tête de coût IA est absent quand Apollo lève ; les sources suivantes gardent leur propre ledger).
