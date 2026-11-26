# Rapport lot E — #4732 (rachat/fusion) et #4733 (recrutement COO/CFO)

Branche : `claude/bedros-e-signaux-4732` (base origin/main). SHA code : a2802332 (+ démo et rapport dans les commits suivants).

## Fait

- `hierarchy_level.py` : `is_executive_recruitment_title` (COO, CFO, DAF, directeur des opérations / financier / administratif et financier, head of operations|finance ; exclut assistant, adjoint, stagiaire, comptable, paie).
- `dated_signals.py` : une annonce légale qui nomme fusion / absorption / scission / rachat devient `type: acquisition` (date = publication de l'acte, ISO seulement, jamais « 1er janvier ») ; une offre à intitulé de dirigeant porte `executive_role: true` (intitulé réel cité).
- `signal_layers.py` : catégories `rachat_fusion` et `recrutement_dirigeant` (avant `recrutement`), avec impact / interlocuteur / action. « fusion/acquisition » sortis d'`organisation`.
- Démo : deux signaux semés sur le dossier SNCF (`demo-dataset.ts`) ; `recent_signals` déjà classé « seedé » dans `demo-coverage.ts`, rien à ajouter.

## Tests (venv py3.12)

- `tests/test_signaux_rachat_dirigeant_4732.py` (nouveau, rouge à la collecte avant le code) + `test_signal_layers`, `test_dated_signals`, `test_dated_signals_recrutement_ordre`, `test_hierarchy_level`, `test_decision_role` : 266 passed.
- `test_evidence_gate`, `test_dated_proof`, `test_signal_layers` : 49 passed.
- `tsc --noEmit -p apps/api` : aucune erreur dans `demo-dataset.ts` (restent 3 erreurs d'environnement `@bellum/email`, hors lot).

## Reste à faire / questions ouvertes (hors périmètre du brief)

1. **Rang « fort » sur la carte Découvrir** : il se décide dans `discover_card_facts.py` / `discover_signal_grid.py` (et le jumeau web `classifyCardFact`), hors périmètre. Les recrutements y sont déjà forts ; l'acquisition est rangée en « contexte, jamais fort » (ligne ~42). Décision à prendre : faire de `acquisition` un fait fort ?
2. **Contrat** : `executive_role` n'existe pas dans le schéma `recent_signals` (packages/contracts) ; à ajouter pour que le drapeau voyage jusqu'à l'écran (la démo ne le porte donc pas).
3. **Source** : le rachat/la fusion hors annonce légale (presse) n'est reconnu que par texte dans `signal_layers` ; aucune source nouvelle ajoutée (lot F).
4. `signal_freshness.py` : `acquisition` = 545 j (>12 mois du critère) ; non modifié.
5. Fusion détectée sur le libellé des MODIFICATIONS seulement si le libellé le nomme ; sinon rien.
