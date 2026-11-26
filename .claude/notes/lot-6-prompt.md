# Prompt de reprise — palier back-office, LOT 6

> Écrit le 07/09/2026, fin du LOT 5. À coller après `/clear`.

---

Reprends le palier back-office de belllum-monorepo, en **parallèle sur tout ce qui
peut l'être**, en intégrant dans `main`, et va jusqu'aux clôtures.

`main` = **`22bba451e`** (PR #1710, #1711, #1712, #1713, #1714, #1715 mergées ;
#1716 en vol au moment de l'écriture — vérifier son état avant de commencer).

Il reste **39 issues** du palier `beta-backoffice`, énumérées :
`1642 1643 1645 1646 1647 1648 1649 1650 1651 1652 1653 1655 1656 1657 1658 1659
1660 1661 1662 1663 1664 1665 1666 1667 1669 1671 1672 1673 1674 1676 1678 1681
1682 1683 1684 1685 1686 1687 1688`.
Les ~54 « MARKET MEMORY » sont un **AUTRE chantier** : ne les mélange pas.

## 0. ⚠️ LA LEÇON DU LOT 5 — à lire avant de merger quoi que ce soit

**Deux PR ont été mergées avec leurs contrôles ROUGES**, et la console de
production est restée deux lots en arrière pendant une heure. Le CI avait tout
vu ; personne ne l'a lu.

Les deux défauts étaient invisibles à `vitest`, `tsc --noEmit` ET `eslint` :
1. `Module not found: Can't resolve '@bellum/contracts'` — un import ajouté sans
   la dépendance au `package.json` de l'app. En local, pnpm remonte les paquets
   de l'espace de travail : **tout passe**. Vercel installe de façon isolée.
2. `You cannot use different slug names for the same dynamic path` — une route
   `feedback/[id]/…` posée à côté de `feedback/[number]/…`.

**Donc, sans exception :**
- après `gh pr create`, attendre `Build`, `Check types` et `CI Status` verts.
  Un `Monitor` avec une boucle `until all(.bucket != "pending")` le fait sans
  bloquer le fil.
- ignorer les `fail` de `BellumAI - *` (Railway) : ils échouent **toujours** sur
  une PR. Ce ne sont pas des échecs.
- toute PR qui touche `apps/dashboard-manager` ou `apps/web` : `npx next build`
  en local AVANT de proposer le merge, et **lire `routes-manifest.json`** pour
  prouver que les routes attendues sont construites — pas conclure de l'absence
  d'erreur.
- ajouter un `@bellum/*` à un import = l'ajouter au `package.json` **et
  committer le `pnpm-lock.yaml`**. Gardé depuis par
  `apps/dashboard-manager/src/architecture/toute-dependance-est-declaree.test.ts`.

## 1. TRANCHÉ — ne repose pas ces questions

1. **#1654** (facture PDF légale) et **#1677** (runbook) : **fermés, écartés**,
   avec la raison écrite dans l'issue.
2. **#1644** (rail à 6 sections) : **fermé**, il était déjà livré.
3. **#1668** (identité + TOTP) et **#1670** (RGPD impersonation) : **fermés**,
   les cinq points de #1670 compris.
4. **Rôles** : `DM_ALLOWED_EMAILS="email:owner|operator|viewer"`, une seule
   variable, sans suffixe = `operator`, rôle relu à CHAQUE requête depuis la
   variable, jamais depuis le cookie.
5. **Trésorerie owner-seul** sur `/facturation`, `/couts`, `/offres`, `/usage`.
6. **Le back-office est FRANÇAIS** hors `/monitoring`.
7. **Pas d'entrée de changelog** pour le back-office : le changelog est ce que
   les **clients** lisent.
8. **~10 issues par PR, groupées par ÉCRAN, recette en prod entre chaque.**

## 2. CE QUI RESTE DE #1671 — le prochain morceau évident

Le point 2 (journal d'accès) est **livré** (PR #1715) : table
`backoffice_access_events`, neuf événements en catalogue fermé, IP + navigateur +
pays enfin LUS (ils ne l'étaient jamais), rétention 12 mois greffée sur le
balayage de 04:17 existant. Restent :

- **Point 3 — alerte sur accès anormaux** (pays inhabituel · 4ᵉ échec · 1h–6h).
  Les trois règles se calculent **en SQL sur la nouvelle table**, au moment
  d'écrire l'événement. Le service expose déjà `countRecentFailures()` et
  `knownCountries()` — écrits pour ça, pas encore appelés.
  ⚠️ **N'utilise PAS le chemin d'observabilité existant** : il est quotidien, par
  lot, et son transport est Sentry groupé par texte de message. « E-mail
  immédiat » est une cadence qu'il ne sait pas produire. Utiliser
  `MailerService.sendNotificationEmail()` en appel direct.
  ⚠️ **Anti-répétition obligatoire, mesurée EN BASE** (pas une variable de
  processus : plusieurs instances). Sans elle, six erreurs de frappe = six mails.
  ⚠️ Destinataires = les adresses `:owner` de `DM_ALLOWED_EMAILS`. Créer un
  `BACKOFFICE_ALERT_RECIPIENTS` serait la seconde liste que `roles.ts` interdit.

- **Point 4 — page « état de sécurité »** (`/securite`, owner-seul : ajouter le
  chemin à `ECRANS_PROPRIETAIRE` dans `roles.ts` SUFFIT).
  ⚠️ « Secrets configurés » **DOUBLONNE** `/integrations?view=catalogue`, qui
  affiche déjà présence-jamais-valeur. Y renvoyer ; n'ajouter que ce qu'il ne
  couvre pas (`INTERNAL_API_SECRET`, `SUPABASE_*`, `DM_BASIC_AUTH_*`,
  `IMPERSONATION_SIGNING_KEY`).
  ⚠️ « Date du dernier changement de mot de passe » n'est **PAS MESURABLE** :
  GoTrue ne l'expose pas. Afficher « non mesuré », **jamais** une date dérivée
  d'`updated_at`.
  ⚠️ « Impersonations en cours » ressemble à `ImpersonationVisibilityService`
  mais ce n'est pas le même objet : celui-là est borné à l'espace du demandeur et
  ne dit jamais QUI. Il faut une seconde lecture, cross-tenant. Le docblock du
  service avertit déjà de ne pas les confondre.

## 3. NON VÉRIFIÉ — ne pas compter comme fait

- **Le 403 d'un `viewer`.** Les trois comptes de `DM_ALLOWED_EMAILS` sont
  `owner` ; il n'existe aucun viewer, donc la moitié « refus » de #1669 n'a
  jamais été vue en vrai. C'est pour ça que **#1669 reste OUVERTE**. Moyen le
  moins cher : créer un vrai compte Supabase de test, le poser `:viewer`,
  redéployer, `curl` une route d'écriture, constater le 403.
- **Le mobile du back-office.** `resize_window` réussit sans rien prouver.

## 4. À FAIRE, HORS CODE

- ⚠️ **`DM_ENROLLMENT_OPEN=1` est encore posée en production.** Elle doit être
  RETIRÉE dès que Théo est enrôlé (Louis l'est depuis le 07/09, `owner`,
  confirmé dans le journal). Tant qu'elle est là, quiconque connaît le Basic Auth
  ET un mot de passe de la liste peut s'auto-enrôler.
- Retour arrière de la couche d'identité, si besoin : retirer `DM_ALLOWED_EMAILS`
  dans Vercel + redéployer → la console revient au Basic Auth seul, chemin
  byte-identique (vérifié).

## 5. DÉFAUTS TROUVÉS EN RECETTE, PAS DANS LES TESTS — le motif à reproduire

Le lot 5 en a trouvé **cinq** que 9 956 tests API et 135 tests back-office ne
voyaient pas. Tous par la MESURE de l'écran servi, jamais par la lecture du code :

- `/feedback` rendait **34,7 Mo** (94 % de captures base64 jamais affichées).
- Son filtre actif avait un contraste de **1,00:1** — libellé dans le DOM,
  invisible à l'œil.
- Les captures pointent un blob GitHub de dépôt **privé** : elles ne s'affichent
  chez personne, et depuis toujours (PR #1716).
- Le champ « code » `required` rendait la première connexion impossible.
- Les dates étaient rendues en UTC sur **20 sites** — deux heures trop tôt.

**Comment les trouver** : `getComputedStyle` sur les couples texte/fond,
`html.length` sur chaque route, `img.naturalWidth` sur une image (0 = cassée),
comparer le HTML SERVEUR au DOM hydraté pour les erreurs #418/#423/#425. Et
toujours une SONDE témoin qui prouve que le lecteur lit quelque chose — sinon
« zéro erreur » et « je n'ai rien lu » se ressemblent.

## 6. Pièges d'outillage payés dans ce lot

- ⚠️ `gh issue list --limit 60` a rendu **41** puis **39** pour le même état :
  compter en ÉNUMÉRANT (`--jq '[.[].number] | sort'`), jamais en lisant un total.
- RTK réécrit et TRONQUE les sorties : `eslint` annonçait « 2 errors » là où
  l'entrée réelle (`node node_modules/eslint/bin/eslint.js -f json`) en trouvait
  **zéro**. Lancer les binaires par leur chemin et lire du JSON.
- `ls` rend du vide dans le bac à sable ; `find` marche.
- `javascript_tool` du navigateur coupe à 45 s, et un `fetch` qui reçoit un 401
  fait perdre le Basic Auth en cache à Chrome — la page passe en page d'erreur.
- Une garde qui contient un `import '@bellum/x'` **comme cas de test** se prend
  elle-même : exclure les `*.test.ts` du corpus, et le vérifier par un test.
- `commitlint` : scope `dashboard-manager` (pas `back-office`), en-tête ≤ 100.
