# Brief — fix-zoho-multi-dc-4380

Périmètre : apps/api/src/modules/zoho/zoho-config.ts, apps/api/src/modules/zoho/zoho.client.ts, apps/api/src/modules/zoho/zoho.client.spec.ts, changes/fix-zoho-multi-dc-4380.yml, docs/briefs/fix-zoho-multi-dc-4380.md

## Contexte

#4380.2 — la connexion Zoho doit gérer le Multi-DC : le serveur de comptes (`accounts-server` / `location` du callback) et le domaine d'API (`api_domain` du token) sont ceux de la région de l'organisation, stockés avec la connexion (`accounts_server`, `instance_url`) et réutilisés au rafraîchissement et à la révocation. Déjà livré par L.6 ; reste la liste blanche du `api_domain` (il reçoit le jeton d'accès : une URL arbitraire est un SSRF). #4380.3 (recette `zoho=connected`) : après déploiement.

## Droits

Inchangés : qui branche un connecteur (`integrations:manage`) ne change pas.
