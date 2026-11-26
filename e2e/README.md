# E2E — Playwright smoke tests

Socle e2e du monorepo : des smoke tests **déterministes**, sans backend ni secret, exécutables en local et dans le CI (job `E2E (Playwright smoke)`, non-bloquant pour l'instant).

## Lancer en local

```bash
pnpm install                       # une fois (installe @playwright/test)
pnpm --filter @bellum/e2e exec playwright install chromium   # une fois (navigateur)

pnpm e2e                           # depuis la racine — build (turbo) + tous les tests
pnpm --filter @bellum/e2e e2e:website     # tier 1 seulement (apps/website)
pnpm --filter @bellum/e2e e2e:web         # tier 2 seulement (apps/web)
pnpm --filter @bellum/e2e e2e:web-mobile  # tier mobile seulement (#2639.1, viewport 375×812)
pnpm --filter @bellum/e2e e2e:report      # ouvrir le rapport HTML du dernier run
```

`pnpm e2e` fait deux choses :

1. `turbo build --filter=@bellum/website --filter=@bellum/web` avec `VITE_API_URL=http://127.0.0.1:4599` (port mort → la SPA résout la session en « anonyme » de façon déterministe).
2. `playwright test` — les `webServer` du config démarrent les builds de prod : `next start` sur `127.0.0.1:4310` (website) et `vite preview` sur `127.0.0.1:4311` (web).

Chromium seul, headless, `retries: 0` (un test flaky est un bug, pas un aléa à masquer). Traces + screenshots conservés sur échec (`test-results/`, rapport HTML dans `playwright-report/`).

## Ce qui est couvert

### Tier 1 — site marketing (`tests/website/`, aucun backend)

- Home FR rend (`lang="fr"`, h1 hero) ; version EN servie sous `/en`.
- `/pricing` affiche la grille 3 tiers (Starter-Solo / Team / Growth, 119 / 259 / 599 €) + toggle Mensuel/Annuel.
- `/beta` et `/webinar` rendent, formulaire présent (email + submit) — **jamais soumis**.
- `/sitemap.xml` servi, avec les URLs FR et `/en/*`.

Le navigateur est forcé en `fr-FR` : la détection Accept-Language de next-intl ne peut pas rediriger `/` vers `/en`.

### Tier 2 — shell de l'app (`tests/web/`, backend mocké par un port mort)

- `/login` rend en FR : titre « Se connecter », bouton Google, « Recevoir un code par email ».
- Switch FR↔EN : la détection i18n de la SPA est **localStorage-only** (clé `bellum_lang`, fallback FR — il n'y a pas de switcher visible pré-auth) ; le test pose/retire la clé et vérifie les deux langues.
- Redirection non-authentifié : `/dashboard` → `/login` (le boot de session échoue vite sur le port mort → anonyme → guard `CustomerPage`).

### Tier mobile — LA PREUVE MOBILE (`tests/web-mobile/`, projet `web-mobile`, #2639.1)

Décision Louis 22/09/2026 : la famille « bouton de reprise de l'onboarding / mobile / Windows 125-150 % / portable 13″ » (#2639.1 et ses voisins) est **impossible à prouver au navigateur piloté** — `resize_window` répond « Successfully resized » mais `window.innerWidth` mesuré reste bloqué à 1512 (constaté les 21 et 22/09). Elle se prouve donc ici, dans un viewport Playwright **réel**.

- Projet `web-mobile` : viewport **375×812**, `isMobile: true`, `hasTouch: true` — ces deux derniers sont indispensables : c'est `@media (pointer: coarse)` qui active le plancher tactile `pointer-coarse:min-h-11` du design system (`packages/ui/src/components/button.tsx`). Sans eux, Chromium reste en pointeur **fin** malgré le viewport réduit et le test mesure la hauteur desktop (36 px) — un faux vert.
- `screen-reach.spec.ts` vérifie, pour `/onboarding` (bouton « Compléter mon profil », l'entrée `resume` d'un compte dont des sous-étapes n'ont jamais été posées), `/signup` et `/forgot-password`, trois choses **mesurées** :
  1. le bouton d'action est atteignable après un **vrai** défilement de la page (`page.mouse.wheel`, jamais `locator.scrollIntoViewIfNeeded()` — ce dernier peut forcer le `scrollTop` d'un conteneur `overflow: hidden` par script, ce qu'un doigt ou une molette réels ne peuvent jamais faire ; c'est exactement le bug d'origine de #2639.1) ;
  2. la cible fait **≥ 44 px** dans les deux dimensions (garde GA-32) ;
  3. **aucun défilement horizontal** du corps (`scrollWidth <= innerWidth`).
- `/onboarding` exige une session que ce tier n'a pas (pas de backend) : le test pose le cookie sentinelle `loggedIn:` (lu par `hasLoggedInCookie()`) et mocke uniquement `GET /auth/session` et `GET /onboarding/state` — le strict nécessaire pour que `SessionManager` et `useOnboardingState` résolvent un compte authentifié. Tout le reste (crédits, espaces à rejoindre) échoue contre le port mort exactement comme pour un visiteur anonyme ; le code le tolère déjà.
- **CI** : ce projet tourne dans le job nocturne (`.github/workflows/e2e-nightly.yml`, 03:30 UTC) et à la demande (`gh workflow run e2e-nightly.yml --ref <branche>`). Plus sur les PR depuis le 22/10/2026 (~8 min de runner par PR web, rouge permanent sur la base, non exigé par le ruleset) : une régression sur le plancher tactile ou la portée d'écran mobile n'est vue que la nuit suivante.

## Ajouter un test

1. Créer un fichier `tests/website/*.spec.ts`, `tests/web/*.spec.ts` ou `tests/web-mobile/*.spec.ts` (le `testDir` du projet Playwright fait le routage — voir `playwright.config.ts`).
2. Règles du socle : attentes **explicites** (`expect(...).toBeVisible()`, `waitForURL`), pas de `waitForTimeout`, pas de dépendance réseau externe, aucune soumission de formulaire qui toucherait une API réelle.
3. Vérifier en local : `pnpm --filter @bellum/e2e e2e:website` (ou `e2e:web`, `e2e:web-mobile`).

## Roadmap — Tier 3 (parcours authentifiés)

Non construit volontairement : un parcours login réel → dashboard → analyse exige un backend et des données. Ce qu'il faudrait :

- **Environnement** : une stack API + Postgres + Redis éphémère (le repo a déjà `tools/docker-compose.yml` pour l'infra locale) OU un environnement de staging dédié e2e. Le service IA peut rester coupé (les écrans dégradent proprement) tant qu'on ne teste pas le pipeline d'analyse.
- **Seed** : un utilisateur de test dédié (email + mot de passe, onboarding complété, workspace + crédits) créé par un script de seed idempotent côté API — il n'existe pas aujourd'hui ; c'est le prérequis n°1.
- **Auth dans les tests** : un project Playwright `web-authenticated` avec `storageState` généré par un setup project (login une fois, réutilisé partout). Les cookies d'auth étant HttpOnly, passer par le vrai flow `/login` du navigateur.
- **Scénarios cibles** : login → dashboard, navigation comptes/contacts, réglages (langue persistée serveur), billing (page rend — pas de checkout Stripe réel), logout.
- **CI** : job séparé (services Postgres/Redis en containers GitHub Actions), toujours non-bloquant au début, avec les secrets de seed en repository secrets.
