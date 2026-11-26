# Reprise — 21/09/2026, état de fin de journée

> **Cette note est l'état complet.** Tout est poussé sur `origin` : aucun octet ne dépend
> d'un worktree local, et un `/clear` ne perd rien de mesuré.

## La production

`origin/main` = **`9d93047ca`**. Quatre PR fusionnées aujourd'hui, CI verte à chaque fois :

| PR | Ce qu'elle porte |
| --- | --- |
| **#2670** | la vague du 20/09 — 12 branches + le correctif des deux rouges IA |
| **#2672** | la doctrine du suivi financier (#2564), perdue depuis le 18/09 |
| **#2673** | les dix verdicts de recette de la vague 20/09 |
| **#2675** | #2643.2 recetté — l'état du siège provisionné s'affiche au back-office |

## Vague 2 — EN VOL, PR #2674 (draft)

Branche `integration-vague-2-21-09`, **75 commits** au-dessus de main. Un intégrateur
(plafond 250 tours, rapport exigé à 200) y travaille encore au moment où cette note s'écrit.

**Absorbé** : les 15 lots du 21/09, plus `le-repli-de-collecte`, `pourquoi-la-collecte-contacts-plafonne`
et `integration/vague-18-09-m`.

**Reste six branches**, toutes poussées sur origin :
`feat/besoin-sans-projet-18-09` (3) · `feat/reglages-despace-capacite-et-priorisation-18-09` (3) ·
`feat/portees-de-memoire-et-role-16-09` (6) · `feat/le-rang-dun-contact-sexplique-18-09` (2) ·
`feat/la-prochaine-action-nomme-ce-qui-passe-dabord-18-09` (2) ·
`feat/rafraichissement-explique-complet-18-09` (2).

⚠️ **`feat/rafraichissement-explique-complet-18-09` porte un commit `wip` de sauvetage**
(`2482ede58`, 11 fichiers récupérés dans un worktree d'agent) qui **n'a jamais passé de porte**.
C'est du brouillon : garder ce qui compile, jeter ce qui casse, et le DIRE.

### Les rouges de CI, diagnostiqués et relayés

- `Test (artefact d'avancement)` — **erreur de la session principale** : les états ont été écrits
  en **gras** dans les registres fusionnés (`**livré**`), alors que la garde
  `tools/registres/test_coherence.py` cherche exactement un des sept états. Corriger dans
  `registre-2026-09-21-{A,B,C}-*.md`, et vérifier le `|` fermant de chaque ligne de point.
- `test_phase2_contacts.py:1270` et `:1295` — `mock_search.call_count` rend 2 au lieu de 1.
  **Collision réelle** entre « thème = titres explicites ⇒ pas d'élargissement séniorité » et
  l'extension des thèmes hors informatique. Il faut TRANCHER laquelle gagne, pas neutraliser le test.
- `test_settings_screens_catalog.py:68` — `/settings/commercial-priority` existe sans que Laura
  le connaisse. Ajouter l'entrée au catalogue ; la garde dit NON à juste titre.
- `GA-84` — une lecture d'environnement neuve hors des deux registres. L'inscrire, ne pas
  toucher la garde. **Jamais la valeur d'une clé dans un commit, un log ou un rapport.**

**Règle donnée à l'intégrateur : aucune garde ne se relâche pour faire passer un test.**

## La recette — 5 recettés sur 23

**Prouvés en production** (`5483e3631`, `/version` relu deux fois, api = ia) :

- **#2655.1** — `/discover?type=contacts` rend des contacts réellement localisés (Paris, Chartres,
  Saint-Maur-des-Fossés), champ « Localisation » présent.
- **#2624.1** — « Transport Île-de-France +1000 salariés » ne ramène aucun compte hors zone.
- **#2643.2** — `/esn/[id]` affiche l'état du siège provisionné. Le cas « Aucune invitation à
  préparer » **se nomme** au lieu de se confondre avec une absence.

**Partiels, avec leur limite écrite** :

- **#2639.1** — prouvé à **1512 px** (largeur RÉELLE relue dans `window.innerWidth`) ; à 378 px
  **jamais mesuré** : `resize_window` n'a pas changé la largeur. Louis regarde sur son téléphone.
- **#2623.1** — la chaîne est prouvée **jusqu'à la porte** (RATP repris du contexte sans ressaisie,
  plan confirmé par Laura), pas au-delà : l'analyse de 3-6 min n'a pas été lancée.

### ⛔ Cinq points bloqués par un geste humain — LE point de reprise

**#2626.1 · #2626.2 · #2640.1 · #2645.1 · #2644.1** attendent un **compte de test vierge**.

Mesuré le 21/09 : ce qui répond sur `app.bellum-ai.com` est `schlegellouis2@gmail.com`, un compte
**réel et rempli** (onboarding 4/7, profil ESN 63/68, un seul espace). Écrire dessus fausserait
tout ce qui suit, donc le recetteur s'est arrêté sans rien toucher — c'est la règle et elle a tenu.

**Décision de Louis du 21/09** : il crée un second compte de test (le signup et le mot de passe
sont SON geste, jamais celui d'un agent). Dès qu'il est connecté dans le Chrome piloté, relancer
UN recetteur : sur un compte de test, **écrire est autorisé et attendu**.

⚠️ **#2644.1 restera bloqué même là** : la bascule demande un utilisateur membre de DEUX espaces,
pas deux comptes ayant chacun le sien. Y arriver passe par une invitation, donc un envoi d'e-mail —
interdit à un agent. C'est Louis qui invite, on recette après.

⚠️ **Piège de #2645.1** : le fait que le choix « sous-traitance rang 2 » existe dans le
questionnaire **ne prouve rien**. Le point demande qu'il SE RELISE dans le profil et nourrisse
`rankPosition` dans `PlanSalesContext`. Il a déjà été fermé à tort là-dessus.

## Le ménage qui reste, dans l'ordre

1. Vague 2 verte → fusionner #2674 → recetter.
2. Les 6 branches restantes, dans une vague 3 si l'intégrateur ne les a pas prises.
3. **Purger les worktrees** — il en reste ~25. Jamais pendant que des suites tournent : en rendre
   douze pendant une vague a fait passer la charge de 22 à 90.
4. **Supprimer les 25 branches mortes** — 13 mesurées à `git cherry` = 0, plus les 12 traînards
   triés « déjà là » le 21/09 (dont les trois `security/*` du 12/09, tous déjà en prod, vérifiés
   `fichier:ligne`). Elles ne se suppriment qu'APRÈS la purge des worktrees : un worktree qui tient
   une branche empêche de la supprimer.
5. Deux onglets Chrome ouverts par un recetteur restent à fermer.

## Le geste qui a tout débloqué aujourd'hui, à refaire

**`git cherry`, jamais `rev-list --count` ni un diffstat.** Sur 49 branches traînantes, les deux
autres outils montraient tout comme vivant ; `git cherry` a dit que **13 étaient entièrement
redélivrées ailleurs**, et qu'il restait **exactement un commit** qui ne l'était pas — la doctrine
du suivi financier, sur une branche qu'on s'apprêtait à supprimer.

## Une question qui attend Louis

Le placement de la carte d'hypothèse de Laura : sur la page de revue, ou entre la question et les
boutons ?
