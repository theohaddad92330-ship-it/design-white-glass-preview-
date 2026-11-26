# BellumAI White Glass — livraison source et références

Version du 26 novembre 2026, issue du Site White Glass publié (commit 05a6f85cc267dc528a170fb8ea4a2f0f591a3e3c). Ce dossier est destiné à la revue de conception et à la poursuite du développement. Lien de la version publiée : https://bellum-white-glass-operations-2026.theohaddad92330.chatgpt.site. Le thème sombre n’a pas été validé ni retravaillé dans cette livraison.

## Contenu

- `dist/` : prévisualisation statique navigable White Glass, scripts, styles, cartes, avatars et données d’exploration. `index.html` importe aussi `premium-dark.css` comme dépendance passive de l’ancienne base ; seul le thème blanc est livré comme résultat validé.
- `docs/` : décisions de design, parcours, recettes et `INTEGRATION_PLAN.md` qui mappe les vues aux modules réels du monorepo.
- `scripts/` : tests de parcours, composants, libellés, droits locaux, finance et Laura.
- `.openai/hosting.json` : identité et format de déploiement du Site existant. Ne réutiliser son `project_id` que pour modifier le Site du propriétaire.
- `references/design_screenshots/` : neuf captures reçues le 26 novembre, conservées pour analyse visuelle.
- `references/source_uploads/03-belllum-monorepo-main-17-.zip` : code du produit le plus récent fourni ; c’est la référence pour les composants, tokens et services existants.
- `references/source_uploads/02-belllum-monorepo-main-13-.zip` : état plus ancien conservé pour comparaison.
- `references/source_uploads/01-NEW-DESIGN-20261028T160317Z-1-001.zip` : autre référence design fournie.
- `references/prior_iteration/` : itération White/Dark antérieure conservée comme archive, pas comme résultat courant.
- `FICHIERS_SHA256.txt` : taille et empreinte de chaque fichier.

À la racine : `Retours_Theo_BellumAI_Integrale.docx` (messages chronologiques et captures disponibles), sa transcription texte `.md`, et `SYSTEM_PROMPT_CLAUDE_CODE_BELLUMAI.md` prêt pour Claude Code. Les anciens visuels dont les fichiers ne sont pas disponibles restent signalés à leur emplacement dans le Word.

## Exécuter la prévisualisation

Depuis ce dossier :

```bash
python3 -m http.server 4173 --directory dist
```

Ouvrir `http://127.0.0.1:4173/?theme=white` puis parcourir Ma journée, agenda, Équipe et Pilotage. Une autre origine de navigateur possède son propre stockage local ; elle ne récupère pas les saisies du Site hébergé.

## Contrôles

Avec Node.js 24 :

```bash
BELLUM_EXPECT_THEME=light node scripts/premium-route-audit.mjs
node scripts/page-guidance-integration.mjs
node scripts/paid-user-route-matrix.mjs
node scripts/purchaser-workflow.mjs
node scripts/copy-guard.mjs
node scripts/control-inventory.mjs
node scripts/finance-calculator.mjs
node scripts/laura-finance.mjs
```

Les autres scripts de `scripts/` couvrent les états locaux, objectifs et contrats. Les tests vérifient des parcours et contrats ; une revue dans le navigateur reste nécessaire pour les proportions et la lisibilité.

## Frontière actuelle

La prévisualisation lit `performance-data.js` et conserve les modifications de l’espace local dans le navigateur. Les chiffres de Groupe Sillage sont des données d’exploration arrêtées au 25 novembre 2026. **Aucun CRM, ATS, agenda, e-mail ou outil RH n’est raccordé à ce Site statique.** Le monorepo fourni contient des modules d’intégration réels, mais il doit faire l’objet d’un raccordement et d’un déploiement distincts dans l’application authentifiée. Le contrat détaillé se trouve dans `docs/INTEGRATION_PLAN.md`. Les fiches Comptes, Affaires, Talent et Mission du produit restent les références à préserver.
