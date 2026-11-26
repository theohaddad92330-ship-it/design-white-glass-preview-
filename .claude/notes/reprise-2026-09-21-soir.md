# Reprise — 21/09/2026, après la fusion de la vague 1

## Où en est la production

- `origin/main` = **`5483e3631`** — PR #2670 fusionnée, **CI 26/26 verte**.
  Elle porte les 12 branches de la vague du 20/09 + le correctif des deux rouges IA.
- Vercel (web) et Railway (api, ia) déploient depuis ce SHA. **La recette ÉCRAN de la vague 1
  reste DUE** : rien de cette vague n'est encore passé à `recetté`.
- ⚠️ `/version` rend DEUX commits (api et ia) et demande un rechargement de l'onglet.

## Les deux rouges CI corrigés, et leur cause

Nés de la fusion, pas de régressions — deux branches qui ne se voyaient pas :

| Test | Cause | Correctif |
| --- | --- | --- |
| `test_chaque_pack_est_tranche` | #2633.1 a posé le pack `ia` sans trancher son tri de sources | Trou déclaré avec sa raison dans `domain_filter_gaps.py` : le vocabulaire du pack (data, IA, ML) est celui que `esn_it` matche déjà large ; ROME et CPV rangent ces métiers dans les mêmes familles, donc le tri doit se faire à l'INTITULÉ, après curation sur offres réelles — même exigence que `finance`. |
| `test_un_profil_vide_reste_inconnu_partout` | #2645.2 a ajouté un 5ᵉ axe `revenueModel` à `businessModel` ; le test en énumérait 4 | Cinq axes attendus. Un profil vide reste inconnu PARTOUT. |

**La leçon** : l'intégrateur n'avait **jamais lancé `pytest apps/ia`** (plafond de tours atteint
avant). Les deux rouges en sortaient directement. Porte passée depuis : **8815 passed, 1 skipped,
3 xfailed**.

## Vague 2 — EN VOL

Un intégrateur travaille sur `integration-vague-2-21-09`, branchée sur `origin/main` frais.
**24 branches** à absorber, toutes poussées sur origin :

- **Bloc 1 — les lots du 21/09 (15 branches)**, dans l'ordre : manifeste connecteurs · latence
  produit · hero welcome · sources qui saignent · derniers points 2165/2173 · durée estimée ·
  onglet contacts · deux états de l'audit · vivier · questionnaire · recherche hors IT ·
  trois réglages · **paire pièces jointes + service de documents** · registres en dernier.
- **Bloc 2 — les traînards du 16-18/09 (9 branches)** : repli de collecte · besoin sans projet ·
  réglages d'espace · portées de mémoire · rang d'un contact · prochaine action · plafond de
  collecte contacts · rafraîchissement expliqué · `integration/vague-18-09-m` en dernier.

⚠️ **La paire C/N touche le même `Chat.tsx`** — zip+xlsx d'un côté, pptx+OCR de l'autre. Elles
vont ensemble, résolution en gardant **les deux côtés**.

## Ce qui a été mesuré pour que le `/clear` ne perde rien

**Méthode** : `git cherry origin/main <branche>` — le seul test qui voit qu'un commit a été
redélivré sous un autre numéro. Un compte de commits ne le voit pas.

- **13 branches MORTES** (cherry = 0, tout leur patch est déjà dans main) : `tmp/v25-avec-main-17-09`,
  `feat/questionnaire-six-issues-17-09`, `feat/profil-trois-couches-suite-17-09-reprise`,
  `integration/vague-14-code-16-09`, `integration-vague10`, `integration-q`, `integration-i`,
  `docs/profil-releves-2026-09-14`, `fix/laura-pied-de-reponse`, `fix/ia-sse-delta-redaction`,
  et 3 `worktree-agent-*`. **Supprimables sans rien perdre.**
- **28 branches locales poussées sur origin** en un seul push — plus rien ne dépend d'un worktree.
- **Deux sauvetages** de travail jamais commité :
  - `feat/rafraichissement-explique-complet-18-09` ← commit `2482ede58`, 11 fichiers (historique
    CRM, i18n fr/en, changelog, spec de module, registre). **N'a jamais passé de porte** — c'est
    du brouillon, l'intégrateur trie.
  - `wip/refusion-voix-merge-abandonnee-21-09` ← archive d'une fusion laissée au milieu,
    **6 conflits non résolus**, marqueurs compris. Mesuré avant sauvegarde : ses commits sont tous
    dans main et ses 37 fichiers ajoutés y sont déjà. Branche d'archive, personne ne la fusionne.
- **Les « dirty » des autres worktrees étaient des artefacts** : `uv.lock`, `bellum_ia.egg-info/`,
  un fichier nommé `0`, un log de portes, et deux copies de `tools/registres/` déjà dans main.
  Aucun octet de travail dedans.

## Un tri EN COURS

Un vérificateur trie les **12 branches traînardes d'avant le 18/09** qui portent encore au moins un
commit absent de main — dont **les trois `security/*` du 12/09**, qui méritent la lecture la plus
attentive : un correctif de sécurité non fusionné est le pire des traînards. Verdict attendu par
branche : À REPRENDRE · DÉJÀ LÀ · NON TRANCHÉ.

## Ce qui reste à faire, dans l'ordre

1. **Recette ÉCRAN de la vague 1** sur la prod qui sert `5483e3631` — un recetteur À LA FOIS.
2. Vague 2 : CI verte → fusion → recette.
3. Trancher les traînards d'avant le 18/09 sur le rapport du vérificateur.
4. **Purger les worktrees** (30 restants) — seulement APRÈS, et jamais pendant que des suites
   tournent : rendre douze worktrees pendant une vague a fait passer la charge de 22 à 90.
5. Supprimer les 13 branches mortes.

## Preuves ÉCRAN toujours dues

#2662.4 (débordement de tableau à 1512 ET 378 px) · #2658.1 · #2659.1 · #2261.13 · #2532.2 ·
#2086.17 · #2088.34 · #2084.13 et .14 · #2667.x · #2668.1 · les trois réglages de #2018.5,
#2035.10 et #2035.11 (preuve CODE seulement pour l'instant, le registre le dit).

## Une question qui attend Louis

Le placement de la carte d'hypothèse de Laura : sur la page de revue, ou entre la question et les
boutons ?
