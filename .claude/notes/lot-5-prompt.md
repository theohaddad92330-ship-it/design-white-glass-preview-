# Prompt de reprise — palier back-office, LOT 5

> Écrit le 07/09/2026, fin du LOT 4 (#1668 + #1669). À coller après `/clear`.

---

Reprends le palier back-office de belllum-monorepo, en **parallèle sur tout ce qui
peut l'être**, en intégrant dans `main`, et va jusqu'aux clôtures.

`main` = `70da612f0` (PR #1705, #1706, #1707, #1708, #1709 mergées).
Il reste **41 issues** du palier `beta-backoffice`, plus ~54 issues
« MARKET MEMORY » qui sont un **AUTRE chantier** : ne les mélange pas.

## 0. À FAIRE EN PREMIER — trois choses qui traînent

1. **Deux `.gitignore` modifiés NON COMMITÉS** dans l'arbre de travail
   (`.gitignore` racine + `apps/dashboard-manager/.gitignore`). Ils ajoutent
   `.vercel/`, mesuré absent le 07/09 : sans eux, `vercel link` committerait les
   métadonnées de liaison. **Les committer dans la première PR du lot.**
2. **`DM_ENROLLMENT_OPEN=1` est encore posée en production.** Elle doit être
   RETIRÉE dès que Louis et Théo sont enrôlés — c'est elle qui empêche
   l'auto-enrôlement. Ne pas la laisser dormir.
3. **La couche d'identité est ALLUMÉE en production** et personne n'a encore
   réussi à se connecter (voir §3). Retour arrière si besoin : retirer
   `DM_ALLOWED_EMAILS` dans Vercel + redéployer → la console revient au Basic
   Auth seul, chemin byte-identique (vérifié en prod, `document.cookie` vide).

## 1. TRANCHÉ — ne repose pas ces questions

1. **Ordre** : le chrome d'abord (fait), puis #1668 + #1669 (faits) + **#1670 et
   #1671, qui restent** — prioritaires sur tout le reste.
2. **#1654 (facture PDF légale)** : écarté — contredit « aucune facture légale
   n'est émise », et l'issue exige une validation comptable.
3. **#1677 (runbook)** : écarté — son contenu, ce sont les procédures RÉELLES de
   l'équipe ; les inventer produirait un runbook faux.
4. **Rôles** : `DM_ALLOWED_EMAILS="email:owner|operator|viewer"`, **une seule
   variable**, entrée sans suffixe = `operator`, rôle **relu à chaque requête
   depuis la variable**, jamais depuis le cookie.
5. **Trésorerie owner-seul** sur `/facturation`, `/couts`, `/offres`, `/usage` —
   arbitrage de Louis, **plus large que la matrice de #1669**.
6. **Le back-office est FRANÇAIS** hors `/monitoring` (`lib/i18n.ts` le dit).
7. **Pas d'entrée de changelog** pour le back-office : le changelog
   (`packages/contracts/src/changelog/`) est ce que les **clients** lisent.
8. **Enrôlement TOTP** derrière la fenêtre `DM_ENROLLMENT_OPEN`, à poser puis
   retirer.

## 2. MERGÉ et VÉRIFIÉ en production

- Commit servi `70da612f0` lu dans le rail · **25 routes en 200** · `/health`
  → `healthy` · adresses masquées · aucun débordement.
- **Couche éteinte = chemin d'avant** : `document.cookie` VIDE, mesuré en prod.
- **T1 de #1668 prouvé en prod** : adresse hors liste → **403**, sans jamais
  appeler Supabase. Adresse dans la liste → 401. La liste discrimine.
- **Porte d'écriture fermée** : `POST /api/admin/users/…/delete` sans session
  → **401**.

## 3. ⚠️ CE QUI BLOQUE — à diagnostiquer AVANT tout le reste

**Personne n'arrive à se connecter.** Louis saisit
`schlegellouis2@gmail.com` + son mot de passe produit + `000000` et reçoit
**401 « Adresse, mot de passe ou code refusé »**, alors que le comportement
attendu était **409 `mfa_absent`** (→ bouton d'enrôlement).

Donc `signInWithPassword` échoue. Deux causes possibles, **indiscernables** :
mauvais mot de passe, **ou clé anon invalide**.

⚠️ **C'est un défaut de MON code** : `backoffice-auth.ts` mappe toute erreur
Supabase sur `identifiants_refuses`, et `login/route.ts` ne journalise que
`raison: 'identifiants_refuses'`. Le message rendu à l'écran DOIT rester
indistinct (ne pas dire lequel des deux facteurs a échoué) — mais **le journal
serveur doit, lui, porter le code d'erreur Supabase**, sinon on ne peut pas
diagnostiquer. **Premier correctif du lot.**

Piste sérieuse : l'onglet Supabase était sur **« API Keys (Legacy) »**. Si le
projet a basculé sur le nouveau format (`sb_publishable_…`) ou si la clé legacy
est désactivée, l'authentification échoue exactement ainsi. Vérifier QUELLE clé
est posée dans `SUPABASE_ANON_KEY` côté Vercel.

## 4. Les DEUX autres défauts trouvés en recette live

1. **Le champ « code à six chiffres » est `required`** → le navigateur refuse
   d'envoyer le formulaire, donc **la toute première connexion est impossible**
   alors que c'est elle qui mène à l'enrôlement. Contournement actuel : taper
   `000000`. À corriger : rendre le code facultatif tant qu'aucun facteur n'est
   enrôlé, ou offrir un chemin explicite « je n'ai pas encore d'application ».
2. **Erreurs React d'hydratation #418/#423/#425** sur les pages porteuses de
   contenu (`/queues`, `/feedback`, …). **PAS une régression** : `/login` et
   `/acces-refuse`, qui montent la MÊME coque (rail + widget), n'en émettent
   aucune — mesuré. La cause vit dans le contenu de ces pages, non identifiée.
   Mérite son propre ticket.

## 5. JAMAIS vérifié — ne pas compter comme fait

- Le chemin **allumé** de #1668/#1669 de bout en bout (connexion, enrôlement,
  session de 8 h glissantes, rôle dans le rail).
- Le **403 d'un `viewer`** : les deux comptes sont `owner`, il n'existe aucun
  viewer. Moyen le moins cher, après enrôlement : passer une entrée à `:viewer`
  une minute, redéployer, `curl` une route d'écriture, constater le 403, remettre.
- Le mobile du back-office : `resize_window` réussit sans rien prouver.

## 6. RESTE — 41 issues

`gh issue list --state open --label beta-backoffice`. Après le déblocage du §3 :
**#1670 et #1671** (les deux PARTIELS prioritaires), puis les codes internes
R0.x / R2.x / RC.x / RS.x du palier. Regrouper par ÉCRAN, ~10 issues par PR,
et **recetter chaque PR en production avant d'ouvrir la suivante** — il n'y a
pas de préproduction.

## 7. Pièges d'outillage payés DANS ce lot

- ⚠️⚠️ **Une commande de fond annonce « exit code 0 » en ayant ÉCHOUÉ.** Deux
  fois (`lint`, puis `knip` cachant 7 exports de types inutilisés). **Lire la
  SORTIE, jamais le code annoncé par le harnais.**
- `git status --porcelain | wc -l` rend **0 à tort** → écrire dans un fichier
  puis `grep -c .`. Idem `grep` : recouper avec `awk`, et `git check-ignore`
  est l'autorité sur l'ignorance d'un chemin.
- `ls -la` rend du **vide** dans le bac à sable ; `node <bin> --version` prouve.
- **macOS `xargs` n'a pas `-a`** : `< fichier xargs …`.
- **commitlint impose le scope `dashboard-manager`**, pas `back-office` : le
  commit est REFUSÉ et, si un second suit, il avale tout le lot en silence.
- ESLint balaie `.next/types/**` : après un `next build` local, `eslint .` rend
  **1 543 problèmes préexistants**. Mesurer sur `src`.
- `javascript_tool` du navigateur **coupe à 45 s** : pas de boucle d'attente
  dedans, elle gèle le renderer de l'onglet.
- Un **redéploiement Vercel fait perdre à Chrome le Basic Auth en cache** — les
  requêtes repassent en 401 et ça ressemble à une panne. Les logs runtime le
  disent en une ligne (`GET 401 /login`, zéro 500).
- Sur un redéploiement du MÊME commit, **décocher « Use project's Ignore Build
  Step »** : `turbo-ignore` peut sauter la construction et les variables ne sont
  jamais prises, en silence.

## 8. État Vercel (production, posé le 07/09)

`DM_ALLOWED_EMAILS` = `theo@bellum-it.com:owner,schlegellouis2@gmail.com:owner,louis@bellum-it.com:owner`
· `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `DM_ENROLLMENT_OPEN=1`.
⚠️ Louis n'a **pas** de compte Bellum sur `louis@bellum-it.com` — son compte réel
est le Gmail. L'entrée pro est gardée pour le jour où il la crée.
