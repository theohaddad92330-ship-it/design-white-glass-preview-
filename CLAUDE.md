# BellumAI — copilote d'intelligence commerciale pour ESN

Un commercial d'ESN tape un nom d'entreprise → dossier de conquête en 5 min : contacts réels, organigramme, plan
d'action, messages prêts à envoyer. Ce fichier est relu à CHAQUE tour de chaque agent : plafond 15 000 octets (job
`Format`). Le détail va dans `agent_docs/`, jamais ici.

## Carte des tests — quoi lancer pour ce que tu touches

| Tu touches                                     | Commande ciblée (≤ 5 specs, jamais la suite)                          |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/**`, `tools/ci/**`                   | `pnpm -C apps/web exec vitest run <specs>`                            |
| `apps/api/**`                                  | `pnpm -C apps/api exec jest <specs>`                                  |
| `apps/ia/**`                                   | `apps/ia/.venv/bin/python -m pytest -q --rootdir apps/ia <test_*.py>` |
| `packages/contracts/**`                        | `pnpm -C packages/contracts exec vitest run <specs>`                  |
| `apps/website/**`, `apps/dashboard-manager/**` | `pnpm -C apps/<app> exec vitest run <specs>`                          |
| `tools/**/*.py`                                | `python3 -m pytest -q <tools/…/test_*.py>`                            |
| tout, avant de pousser                         | `pnpm ci:local` — l'Étage 1 de la CI sur ton diff, écrit le témoin    |

Worktree neuf : `pnpm install --frozen-lockfile --prefer-offline`, puis `pnpm --filter "@bellum/web^..." build` avant
les tests web ; le venv IA est celui de l'arbre principal. Suites complètes, `check-types` racine, build complet = la CI, jamais en local. Détail : `docs/ci.md`.

## Règle de test pour agents

- Tester le comportement NOUVEAU ou MODIFIÉ à SA FRONTIÈRE : la route API, le contrat (schéma), le composant rendu, la
  sortie LLM via une éval. Test d'abord quand c'est possible ; il rougit pour la bonne raison, puis le code.
- Pas de test dont le seul rôle est de prouver qu'une issue est faite. Pas de test qui relit le code source comme du
  texte — sauf pour étendre une garde de doctrine existante (`apps/*/src/architecture/`).
- Ne JAMAIS affaiblir un test : ni `skip`, ni `only`, ni seuil relâché, ni entrée de `demo-coverage.ts` déplacée.
- Tests ciblés via la carte ci-dessus ; `pnpm ci:local` vert avant tout push (le hook le vérifie).

## Git

- Jamais de push sur `main`. Une branche par lot, poussée en refspec complet : `git push -u origin HEAD:refs/heads/<branche>`.
- Une PR **brouillon** par lot : `Closes #N` pour chaque issue ENTIÈREMENT livrée, `Refs #N` sinon. Seul le
  coordinateur passe une PR en `gh pr ready`.
- Issue déjà satisfaite sur `main` → PAS de PR : un commentaire sur l'issue avec la preuve `fichier:ligne` et un run
  vert, puis fermeture ou label `a-recetter`.
- Une branche `claude/lot*` ne touche pas les fichiers chauds (changelog, `demo-coverage.ts`, `agent_docs/demo-mode.md`,
  `agent_docs/chantiers-livres.md`) : elle écrit un fragment `changes/<lot>.yml` (`changes/README.md`).
- Escalades : l'agent tranche ce que la doctrine ci-dessous couvre ; le reste = UN QCM par lot, jamais une question au fil.

## Stack

Web React 18 + Vite + Tailwind + shadcn/ui (sombre par défaut) + TanStack Router + Zustand · API NestJS (TS strict) ·
IA FastAPI (Claude, LangChain, pgvector) · BullMQ + Redis · Socket.IO · PostgreSQL Supabase (RLS, JWT, pgvector) ·
Turborepo + pnpm (`apps/web`, `apps/api`, `apps/ia`, `packages/*`) · Vercel (web) + Railway (api, ia, redis) · Stripe.
Lancer : `pnpm install` puis `pnpm dev`.

## Lire avant de coder

- `agent_docs/chantiers-livres.md` — ce qui est LIVRÉ. Le motif récurrent : du code juste que personne n'appelle —
  chercher l'APPELANT, pas seulement la fonction.
- `agent_docs/env-reference.md` — chaque variable et intégration, avant de toucher un connecteur, un coût, la démo, la facturation.
- `agent_docs/doctrine.md` — la raison et l'historique de chaque arbitrage ci-dessous.
- Au besoin : `prd.md`, `architecture.md`, `database_schema.md`, `pipeline.md`, `agents.md`, `agent-contract.md`,
  `prompts.md`, `apis.md`, `rag.md`, `design.md`, `security.md`, `backlog.md`, `addendum-final-2026-08-02.md`, `plan.md`.
- Conventions d'outillage du dépôt : `.claude/projet.md` (lire la section utile, jamais tout).

## Code

- TypeScript strict (pas de `any`). Chaque module NestJS est indépendant ; chaque endpoint FastAPI a son test pytest.
- Optional chaining sur les données Supabase : `data?.field || fallback`. Vérifier `res.ok` après chaque appel externe.
- JSON de Claude : extraire du premier `{` au dernier `}`.
- Imports nommés (default export seulement pour un module NestJS). Un type consommé dans son seul fichier ne s'exporte
  pas (`pnpm lint:exports:types`, `docs/lint-unused-exports.md`).
- Jamais de clé API côté client. Plus de 3 fichiers touchés : `/impact-check` ; relire avec `/simplify` avant de présenter.
- **Démo (craft rule n°9)** : toute fonctionnalité user-facing est AUSSI remplie en démo — semée dans
  `apps/api/src/modules/demo/demo-dataset.ts` (+ `DemoSeedService`), classée dans `demo-coverage.ts` : **seedée** ou
  **vide à dessein avec sa raison** (gardes `demo-coverage.spec.ts`). Jamais déplacée vers « vide » pour passer.

## Design

Détail : `agent_docs/regles-design-2026-08-23.md` § 12. Une règle non gardée redevient une opinion : chacune a sa garde
dans `apps/web/src/architecture/`.

- Valeur absente jamais « 0 » (GA-18/19). Échelle Tailwind, plancher 12 px, `rem` inline (D80, GA-31).
- Parité clair/sombre, contraste AA, aucun hexadécimal dans le JSX (D79, GA-33).
- Largeur de lecture 70 caractères pour le texte, pleine largeur pour listes/tableaux (D81, GA-34).
- Un réglage à un seul endroit, rien deux fois sous la même forme (GA-26). Mouvement : `packages/ui/src/motion.ts`, ni rebond ni parallaxe (GA-25).
- Mobile = le produit : borne 768 px, quatre onglets, `dvh` jamais `vh` (GA-28/29/30).
- Icône nommée, ce qui se clique se tabule, cibles ≥ 44 px, `<Navigate>` interdit (GA-32/35/27).
- Le copilote s'appelle Laura, partout (D82).

## Variables d'environnement — jamais commit

Référence complète : `agent_docs/env-reference.md`. Une clé NEUVE s'y ajoute (famille, défaut, raison), jamais ici.
**Sans clé = no-op STRICT** pour presque toute clé optionnelle : zéro appel réseau, jamais de donnée inventée.
Exceptions nommées là-bas (`INTERNAL_API_SECRET` absent en production ⇒ 503). Jamais une valeur dans un commit, une
page, un journal ou un transcript. Noms seuls : `railway variables --kv | cut -d= -f1`.

- API : `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `ANTHROPIC_API_KEY` · `STRIPE_SECRET_KEY` · `REDIS_URL` ·
  `IA_SERVICE_URL` · `INTERNAL_API_SECRET` · `COOKIE_DOMAIN`
- IA : `ANTHROPIC_API_KEY` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `INTERNAL_API_SECRET` · `API_INTERNAL_URL`

Supabase : https://qkpuwkziwnljfwlzyngr.supabase.co (Pro, eu-west-1). RLS sur toutes les tables : `auth.uid() = user_id`.

## Doctrine — tranchée, ne se re-litige pas

Registre en code : `packages/contracts/src/schemas/doctrine-registry.ts` (garde GA-38). Raison et historique :
`agent_docs/doctrine.md`. Chaque ligne a déjà été re-proposée par quelqu'un qui ne l'avait pas lue.

**On n'affiche jamais**

- Une PROBABILITÉ (chance de closing, prévisionnel pondéré) — refusé six fois.
- « Non mesuré » comme « 0 » ; un axe non évaluable sort du dénominateur (GA-18/19).
- Ce qu'on n'a pas (Louis 20/09) : dans une LISTE une absence ne fait aucune ligne ; sous un SCORE les axes non évaluables restent nommés.
- Un score nu : ses axes, et ce qui n'a pas pu être évalué est nommé.
- Un TAUX DE COUVERTURE comme ce que le marché FAIT : il mesure ce qu'on SAIT (GA-259).
- Nos fournisseurs : on nomme ce que l'espace a BRANCHÉ, jamais ce qui NOUS sert.
- Une donnée fictive : échec API → erreur claire, jamais de repli inventé.
- Un CRITÈRE PROTÉGÉ dans le rang d'une personne (âge, genre, origine, photo, adresse…).
- Un cinquième statut d'encaissement (21/09, #2419.4) : quatre statuts, le reste dû se NOMME sur `overdue`/`pending`.
- Le rôle change l'ORDRE, jamais le CONTENU (`c76_role_reordonne_jamais_ne_filtre`).

**On ne collecte pas**

- On collecte LARGEMENT tant que c'est PROPRE (#2634.1, `c79_collecte_large_mais_propre`) — élargit « pas de scraping », ne le supprime pas.
- Le CORPS des messages ne sort jamais vers un humain ni vers le modèle (stocké au journal, jamais exposé).
- Un contrat d'API non vérifiable ne se devine pas.
- Le coût d'accès ne s'agrège JAMAIS entre espaces, concurrents entre eux (GA-43).
- L'analytique mesure le PRODUIT, jamais la personne : par écran/fonction/parcours (GA-240/241/264/266/267).

**Rien n'écrit tout seul**

- On PROPOSE une fusion de doublons, on ne fusionne jamais. Laura n'envoie jamais d'e-mail : elle prépare, le commercial envoie.
- « Fait » ne porte jamais de preuve d'envoi : un geste déclaratif, jamais confondu avec un envoi vérifié.
- Une écriture CRM/ERP passe par une porte : auto-approuvée sur geste utilisateur, sinon prévisualisation figée. Seule exception nommée : la synchro CRM REMPLIT un champ vide, n'écrase jamais (#4714, c147).
- Un timeout n'est pas un échec : `unknown` arrête la reprise. Une correction humaine gagne toujours, quelle que soit sa date.
- On archive, on ne supprime pas : un fait périmé redevient inconnu. Seule exception : l'effacement RGPD d'une personne à
  sa demande (c67, #2297), avec une empreinte qui empêche sa recollecte.
- Un correctif de collecte RATTRAPE l'existant (18/09, #2543) : ciblé (jamais tout le parc), par SEGMENT (jamais une
  analyse entière) ; « concerné » = date de collecte du segment < date de la capacité ; tant qu'un compte n'est pas
  rejoué son écran le DIT ; le rejeu ne part pas seul au déploiement et n'écrase jamais une correction humaine.
- BellumAI SUIT le financier, il ne COMPTABILISE pas (#2564, revirement partiel de #2197) : encaissements, marge, CA
  par mission oui ; plan comptable, écritures, journal non. Une facture est préparée ≠ créée ≠ envoyée ; « facturé »
  seulement sur preuve du connecteur de l'outil du client.
- Le remboursement des crédits débités à tort part chaque NUIT, sans geste humain (#2650.2, `c78_remboursement_credits_nocturne`).
- « facturé » se garde ; sa SOURCE se nomme (#2197.41, `c80_facture_se_nomme_sa_source`).

**Ce qui tient les règles**

- Une garde protège une règle, elle ne l'invente pas : elle dit NON, elle LIT, elle n'attrape pas ce qu'elle ne vise pas.
- Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie AVANT le code qui l'écrit (GA-11, GA-12).
- Un réglage vit à UN seul endroit (GA-26). Toute fonctionnalité user-facing est AUSSI remplie en démo (craft rule n°9).
- Un numéro de décision est unique DANS SON CHANTIER : citer « D70 (tome 1) » (GA-40). Les GA-\* ne suivent pas les PDF (D72).
- `campaign_label` (mono-contact) referme l'audience multi-contacts — renversement ASSUMÉ du 16/09 (`c74_campagne_etiquette_mono_contact`).
- Édition du plan de Laura : UN formulaire générique, pas treize (#1950.15, `c75_plan_duplication_edition_generique`).
- La porte de qualité IA est un GATE CI bloquant (#2631.1, `c77_gate_qualite_ia_bloque_sur_role_cle`).
