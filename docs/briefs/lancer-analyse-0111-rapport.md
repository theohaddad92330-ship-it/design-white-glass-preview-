# Rapport — lancer-analyse-0111

- Branche `claude/lancer-analyse-0111` ; PR prête vers main.
- Point 1 (angle vide) : `optionalString` (packages/contracts/src/schemas/analysis-context.ts) transforme vide/blanc en absent. Couvre `startAnalysisSchema` donc le DTO API. Règle #3910 intacte (raison jamais inventée).
- Tests : analysis-context.test.ts (+4 : vide, blanc, absent, saisi rogné, requête de lancement) rouge → vert.
- Point 2 (autocomplétion) : `useCompanySearch` ne montre plus l'ancienne liste (placeholderData) pendant l'attente ni le debounce ; react-query ignore déjà les réponses périmées (clé = requête). Sélection déjà par objet suggestion (clé SIREN), pas par index.
- Test : useCompanySearch.test.tsx (désordre des réponses + liste masquée) — le 2e rouge → vert.
- Ciblés verts : contracts (1 spec), web (4 specs : hook, Search, ListLauncher, OnboardingCompanyPage). tsc contracts vert ; tsc web lancé.
- Non fait : aucun test API jest dédié (le DTO réutilise le schéma contrat, couvert côté contrat).
- Compromis : la liste disparaît brièvement à chaque frappe au lieu de s'échanger sous le pointeur.
