# HubSpot app — BellumAI CRM

Projet HubSpot (framework `hs project`, platform version `2026.03`) qui définit
l'**app publique OAuth** utilisée par le module CRM de l'API (`apps/api/src/modules/crm`).

Depuis 2025, HubSpot a désactivé la création d'apps publiques via l'UI :
elles se créent/déploient uniquement avec le CLI `hs`. Ce dossier est la source
de vérité versionnée de cette app — modifier ici, puis `hs project upload`.

## Identité de l'app

|                    |                                        |
| ------------------ | -------------------------------------- |
| Nom                | BellumAI CRM                           |
| App ID             | `45635880`                             |
| Project ID         | `202908728`                            |
| Client ID (public) | `d16c8797-a1d8-4bb3-8611-eaa8b5de0292` |
| Compte dev         | Bellum (`145394138`)                   |
| Distribution       | marketplace (multi-comptes / OAuth)    |

Le **Client secret** n'est jamais stocké ici ni exposé par le CLI : il se lit
dans l'UI (app → onglet **Auth**) et se met dans Railway (voir plus bas).

## Structure

- `hsproject.json` — config projet (nom, srcDir, platformVersion)
- `src/app/app-hsmeta.json` — manifest de l'app : redirect URLs, scopes, support

Les `redirectUrls` et `requiredScopes` du manifest **doivent** rester alignés
avec le code (`apps/api/src/modules/crm/crm-config.ts`) :

- redirect prod : `https://belllum-backend-service-production.up.railway.app/crm/hubspot/callback`
- redirect dev : `http://localhost:3012/crm/hubspot/callback`
- scopes : `oauth crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write`
  (garde : `crm-config.spec.ts` « HubSpot app manifest » — #4065.8, 18/10 : l'app publiée n'accordait que les
  portées contacts, « affaires perdues » rendait vide et la reprise des sociétés était refusée)

## Déployer

Prérequis : CLI HubSpot authentifié sur le compte dev (config globale
`~/.hscli/config.yml`, générée par `hs account auth` avec une clé d'accès
personnelle du compte `145394138`).

```bash
npx @hubspot/cli project upload --account 145394138   # dans ce dossier
```

Vérifier :

```bash
npx @hubspot/cli project info --account 145394138
```

## Variables d'environnement API (Railway — service `belllum-backend-service`)

Sans ces 3 clés, tout le module CRM est un no-op ("bientôt disponible").

```
HUBSPOT_CLIENT_ID=d16c8797-a1d8-4bb3-8611-eaa8b5de0292
HUBSPOT_CLIENT_SECRET=<Client secret depuis l'UI HubSpot, onglet Auth>
HUBSPOT_REDIRECT_URI=https://belllum-backend-service-production.up.railway.app/crm/hubspot/callback
```

Optionnel : `HUBSPOT_SCOPES` (défaut = les 3 scopes ci-dessus),
`CRM_TOKEN_ENC_KEY` (sinon dérivé de `INTERNAL_API_SECRET`).

⚠️ Le callback rebondit vers `FRONTEND_URL/knowledge?crm=connected`. Après le
swap de domaine (app sur `app.bellum-ai.com`), `FRONTEND_URL` doit pointer
l'app, pas le landing.
