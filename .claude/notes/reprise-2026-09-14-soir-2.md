# Reprise — 14/09/2026, soir (2)

## L'état, mesuré

- `origin/main` = **`898367181`** — api ET ia le servent (sonde `/version`, vérifié).
- **PR #2168 « Intégration J »** — non draft, MERGEABLE, 55 fichiers, **5 branches
  fusionnées sans conflit** : `golden-set-multi-persona`,
  `idempotence-generation-profil`, `page-restitution-audit`,
  `profiler-anti-hallucination`, `profiler-charge-utile`.
  ⚠️ Sa CI était **rouge** sur `Test (API) 1/4` → **corrigé et poussé**
  (`21dff0ab2`, prouvé par `ls-remote`). La CI est repartie : **c'est elle qu'il
  faut relire en premier**.

### Le rouge de J, et pourquoi il n'était visible nulle part ailleurs

`GA-265` (`apps/api/src/architecture/product-screens-catalog-covers-routes.spec.ts`)
a rougi **à la fusion**. J ajoute la route `/settings/profile/audit`
(`apps/web/src/routes/settings/profile/audit.tsx`) ; `PRODUCT_SCREENS`
(`packages/contracts/src/schemas/product-screens-catalog.ts`) ne la connaissait
pas. Un écran absent du catalogue est **invisible** aux quatre écrans
d'analytique produit (#1683, #1684, #1687, #1688) — il ne sortirait pas
« jamais ouvert », il ne sortirait **pas du tout**.
Aucune des 5 branches ne pouvait le voir seule. Énième instance de
`deux-cotes-verts-rouge-a-la-fusion`. La garde a bien travaillé : elle **nomme**
la route manquante dans son message.

## Balayage live — 59/59, ZÉRO défaut

Portée calculée par `python3 tools/recette/portee.py b8e432a7a..898367181` :
régime CIBLÉ, 59 écrans atteints (tirés par `ChangelogMenu.tsx` → `entries.ts`,
monté partout — **le trou de `portee.py` reste à signaler**).

Les 59 routes ont été sondées par lots de 7 à 9, sonde unique :

```js
(()=>{const t=(document.querySelector('main')||document.body).innerText||'';
const b=/(Une erreur|a eu une erreur|indisponible|Impossible de|Something went wrong)/i.exec(t);
return JSON.stringify([location.pathname,t.length,
document.documentElement.scrollWidth>document.documentElement.clientWidth,b?b[0]:0])})()
```

**Résultat : aucun débordement horizontal, aucune erreur console, aucune
bannière de panne, sur aucune des 59.** `/settings` couvert avec ses 18
sous-routes (liste tirée du DOM, pas devinée).

⚠️ **La démo n'a PAS été recettée** — à faire **en dernier**, elle remplace la
session pilotée (mémoire `recette-demo-remplace-la-session-pilotee`).

## Branches poussées, en attente d'intégration K (8)

| Branche | SHA |
| --- | --- |
| `analytique-produit-1946` | `b9cdc7d89` |
| `artefacts-de-brief` | `234936cbb` |
| `cable-audit-validate-et-demo` | `de075debe` |
| `chat-lot1-coquille` | `3cb3142e1` ← **livré ce soir** |
| `constats-discover-et-cloche` | `90ce4a606` |
| `entitlement-et-grille-tarifaire` | `47f10d5a6` |
| `feedback-assets` | `2174db8c3` |
| `welcome-comptes-reels` | `60d89319c` |

## Le lot 1 `/chat` (`3cb3142e1`) — ce qu'il a livré, et ses deux questions

5 infractions design corrigées, chacune gardée avec contrôle négatif :
① D81/GA-34 `max-w-[min(680px,92%)]` → `CHAT_SURFACE.reading` en `ch`
② GA-28 trois `sm:` → `md:` ③ GA-30 lien « voir tout » 24 px →
`pointer-coarse:min-h-11` ④ GA-26 anneau ×6 → un jeton, et `primary-500` →
`--bellum-text-accent` (2,68:1 en sombre, sous le 3:1 de WCAG 1.4.11)
⑤ GA-26 `ml-14` → `composerFeedbackGutter`. Hauteur du `<form>` : **−16 px**
des deux côtés (1 440 px : 122→106 ; 390 px : 162→146).

⚠️ **Le brief était périmé sur son point central** : `chat-surface.ts:61` disait
`mr-auto` et non `mx-auto` depuis `da6466359` (11h37 le même jour). **#2001 et le
#1994 d'entête étaient déjà LIVRÉS.** Encore
`diagnostic-de-ce-matin-deja-perime`.

**Deux décisions dues à Louis** :
- **(a) #2141 « recentrer au milieu » contre #2001** — centrer l'accueil défait
  la décision d'il y a 4 h et fait **sauter l'écran de ~238 px au premier
  message** ; la garde `chat-mise-en-page.test.ts` le refuse nommément. L'autre
  moitié de #2141 est livrée : grille à **2 colonnes**.
- **(b) « en mettre 6 »** — `laura-home-suggestions.ts` écrit qu'un espace neuf
  n'a que **4** suggestions vraies ; en forcer 6 en **inventerait 2**. Non fait.

**Dettes nommées du lot** : 2 pastilles de démo sous 44 px
(`DemoSuggestionRow` était hors périmètre) · pas de jeton
`--bellum-focus-ring` global (`tokens.css` hors périmètre) · **changelog dû**
(FR/EN rédigés, dans le rapport de l'agent).

## Faux rouges et sondes à ne pas rejouer

- La sonde de déploiement a **échoué en TIMEOUT** : elle guettait `b8e432a7a`,
  déjà servi. Fausse alerte — ne pas relancer une sonde sans recalculer sa cible.
- **`vitest` lancé depuis la RACINE** ne résout pas l'alias `@` de `apps/web` et
  rend « Failed to load url @/… » sur des suites saines : le lancer **depuis
  `apps/web`**.
- **`node_modules/.bin/jest` n'existe pas à la racine.** Depuis `apps/api` :
  `/bin/sh -c 'node node_modules/jest/bin/jest.js <spec> --maxWorkers=2'`.
- **`vitest` non plus n'est pas à `node_modules/vitest/vitest.mjs`** : `pnpm exec vitest run`.

## Ce qui reste, par ordre

1. **Relire la CI de #2168** (`gh pr checks 2168`) → merger → attendre les DEUX
   déploiements → recetter J.
2. **Intégration K** sur les 8 branches ci-dessus.
3. **Recetter la démo, en dernier.**
4. Les câbles dus (défaut n°1) : `POST /profile-context/validate` **sans
   appelant** · les 10 émetteurs `#1946` **sans appelant en prod** ·
   `profiler.py:37` `exclude={"user_id", …}` → `welcome-comptes-reels` lit vide ·
   traductions FR/EN de `briefing.artifacts.meetingAttendees` (clé brute à
   l'écran).
5. Signaler le trou de `portee.py` (le changelog est exclu du classement
   FONDATION mais pas de la marche du graphe d'imports).
6. Fermer #2013 en pointant #2086 ; renommer le titre « V3 » de #2086.
7. À vérifier sur `/briefing` : « 2 rendez-vous à venir · **50 h en réunion** »
   — valeur qui a l'air absurde.

## Questions parquées pour Louis (à poser en UN lot)

`REFERENCE_TIMEZONE = "Europe/Paris"` en dur (`current_time.py:43`) · #2129/#2130
doublon · #2116 dossiers legacy · K1 `/dashboard` = « Aujourd'hui » ou son
contraire ? · K2 `AccountsToWatch` n'existe pas · DataForge : à nous ou branché
par le client ? · #1912.4 périmètre actif · #1907.9 dégradé violet ·
#1995.3 la borne 10+5 sur 2 027 contacts · **#2141 (a) et (b) ci-dessus**.
