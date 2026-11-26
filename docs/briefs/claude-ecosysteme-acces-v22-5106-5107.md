# Lot — Compte › Écosystème & Pratiques achats, forme maquette V22 (#5106, #5107)

Branche : `claude/ecosysteme-acces-v22-5106-5107` (contient déjà main). Modèle : sonnet.
Plafond : **300 tours**. À 240 tours : commit de ce qui est vert, push, rapport, STOP.

Lire d'abord les deux issues (`gh issue view 5106`, `gh issue view 5107`) : elles nomment les
fichiers (`fichier:ligne` vérifiés sur `57e3be18a4`). Le contrat ci-dessous a été VALIDÉ par
Louis le 01/11 (QCM) : il prime sur tout ce que tu pourrais déduire.

Périmètre : `apps/web/src/features/accounts/view/account-detail/**`, `apps/web/src/features/brief-blocks/**`, `apps/web/src/i18n/locales/*/accounts.json`, `apps/web/src/i18n/locales/*/brief*.json`, `apps/api/src/modules/demo/**`, `apps/web/src/architecture/**` (seulement si une garde doit connaître un fichier neuf), `CHANGELOG.md`, `changes/**`, `docs/briefs/**`

Le changelog du dépôt vit en fragments `changes/*.yml` (`CHANGELOG.md` n'existe pas).

## Règle maîtresse : forme de la maquette, fonction gardée

Même règle que Laura V8 (31/10) : la page prend la FORME de la maquette ; **aucune capacité
actuelle ne disparaît**. Tout bloc actuel reste atteignable, rangé sous la nouvelle forme.

## #5106 — sous-onglet `access` → « Pratiques achats »

Points (`// #5106.n` en commentaire à l'endroit du comportement) :

- 5106.1 Libellé du sous-onglet : « Pratiques achats » (fr, `accounts.json` clé du sous-onglet `access`, aujourd'hui « Voies d’accès du workspace ») ; TOUTES les autres locales alignées (traduction fidèle). Revient sur le libellé posé pour #3403 — l'écrire dans le commit (« revient sur #3403 : libellé »).
- 5106.2 En-tête : titre « {{prénom}}, vérifie le circuit avant de promettre un accès. » + paragraphe « Les éléments du relevé aident à préparer les questions achats. Ils ne certifient ni ton référencement ni une obligation applicable à chaque filiale. » Prénom = celui du profil connecté (chercher le hook/selecteur déjà utilisé par Laura ou le briefing ; sans prénom, titre sans apostrophe de prénom : « Vérifie le circuit… »).
- 5106.3 Trois cartes d'intro côte à côte (1 colonne sous 768 px) : icône + titre + phrase — _Relation commerciale_ « Un sponsor ou un contact connu peut aider à comprendre un sujet. » · _Référencement fournisseur_ « Un statut et un périmètre distincts, à documenter. » · _Commande & intervention_ « Des conditions à confirmer sur l’opération précise. »
- 5106.4 Grille 2 colonnes (1 sous 768 px), **une carte par ligne** de la section achats du `raw_analysis.commercial_brief` (section `achats-avant-d-appeler`, colonnes `element`, `nom`, `ce_que_c_est`, `ce_que_tu_dois_avoir_en_tete`, `fiabilite` — schéma `packages/contracts/src/schemas/commercial-brief.ts:105`). Carte : sur-titre = `element` ; titre = `nom` (sinon `element`) ; paragraphe = `ce_que_c_est`.
- 5106.5 Dans la carte, un repli (`<details>` accessible ou primitive de repli existante) « Lecture du relevé et points de vigilance » : `ce_que_tu_dois_avoir_en_tete` + petite ligne « Qualification d’origine : {{fiabilite ou « non renseignée »}} · relevé fourni, non revérifié. » Ligne vide ⇒ pas de repli (on n'affiche pas ce qu'on n'a pas).
- 5106.6 Bouton « Préparer la vérification » dans chaque carte : crée une TÂCHE sur le compte via le chemin existant `useCreateTask` (`apps/web/src/features/tasks/hooks/useTasks.ts:38`), titre « Vérifier : {{nom}} », rattachée au compte (`account_id`). Aucun endpoint neuf. Bouton désactivé pendant l'envoi ; toast existant du hook.
- 5106.7 Compte sans section achats (ou section vide) : **aucune carte**, aucun intro inventé côté circuit ; un état vide qui dit « Le circuit achats de ce compte n’est pas encore documenté. » Les 3 cartes d'intro et l'en-tête peuvent rester (ce sont des repères, pas de la donnée).
- 5106.8 Les blocs actuels de `TabAccess` (niveau d'accès, verrou, barrière, adressabilité, voies d'accès personnelles, communauté, détail des modes…) passent **sous la grille, dans un repli « Lecture détaillée » fermé par défaut**, dans leur ordre actuel, sans rien retirer. **Exception : l'avertissement procédure collective reste visible en TÊTE de page** (alerte, jamais repliée).
- 5106.9 Dans « Ce que je dois savoir » (`apps/web/src/features/brief-blocks/BriefSections.tsx` via `tabs/TabCommercialBrief.tsx`), la section achats n'est PLUS rendue en tableau : à sa place, une ligne-lien « Voir le circuit achats dans Pratiques achats » vers le sous-onglet `access` (même mécanisme de navigation que les autres liens d'onglet du dossier). GA-26 : rien n'apparaît deux fois sous la même forme. Les autres sections du brief inchangées.
- 5106.10 Le bloc d'aide « Comment travailler ici ? » replié en tête de section, s'il existe pour ce dossier (`components/primitives/ScreenIntro.tsx` / `CustomerPageContent` guide) : le réutiliser, ne pas en créer un second.
- 5106.11 Démo : BPCE (`apps/api/src/modules/demo/data/commercial-briefs/bpce.json`, porte déjà la section) rend la grille. Mettre `demo-coverage.ts` à jour si une clé nouvelle est lue (normalement aucune).
- 5106.12 Aucune source/fournisseur nommé (doctrine) ; aucune probabilité ; parité clair/sombre (tokens CSS existants, zéro hex dans le JSX, GA-33) ; typo plancher 12 px (la maquette a du 9-11 px : monter à 12 px, GA-31) ; mouvement via `packages/ui/src/motion.ts` seulement (GA-25) ; cibles ≥ 44 px au toucher (GA-35).

## #5107 — sous-onglet `partners` (Écosystème)

- 5107.1 En-tête : titre « Des acteurs cités, pas un accès garanti. » + « {{prénom}}, une observation de collaboration n’établit ni un panel actuel, ni un accord de sous-traitance avec ton entreprise. » (sans prénom : phrase sans « {{prénom}}, », majuscule).
- 5107.2 Grille 3 colonnes (2 entre 768 et ~1100 px, 1 sous 768 px) d'une carte par société de services reliée au compte (la liste que `TabPartners` rend déjà). Carte : monogramme (initiales), nom, périmètre (`scope` du partenaire, sinon « Périmètre non précisé »), la preuve en une phrase (le champ preuve/évidence déjà affiché par `TabPartners` — le retrouver, ne rien recalculer), pastille « Observation du relevé », bouton « Détail & réserve ».
- 5107.3 « Détail & réserve » ouvre `PartnerDetailModal` EXISTANT (`tabs/TabPartners.tsx:1304`) — qualifier, vérifier aujourd'hui, écarter, corriger la relation y restent avec leurs droits et leur tracking actuels.
- 5107.4 Une société **sans preuve ne fait pas de carte** (elle reste dans la lecture détaillée si elle y est aujourd'hui) ; compte sans écosystème : état vide « Aucun acteur de services n’est encore relevé autour de ce compte. », jamais de carte inventée.
- 5107.5 Les blocs actuels — `tabs/ecosystem/AccountEcosystemTop.tsx` (4 blocs : Lecture rapide, Concurrents ou partenaires possibles, Informations à qualifier, Actions) et le reste de `TabPartners` (pipeline, corrections de relation, formulaires) — passent **sous la grille, dans un repli « Lecture détaillée » fermé par défaut**, ordre actuel, rien retiré. « Concurrents ou partenaires possibles » reste un BLOC dans ce repli (pas un filtre). Revient sur la forme principale posée par #2122 et #3684 : l'écrire dans le commit (« revient sur #2122, #3684 : forme principale ; contenu gardé en lecture détaillée »). Garde #3473 (pas deux statuts contradictoires pour la même ESN : la carte et le détail lisent la même source).
- 5107.6 Aide « Comment travailler ici ? » : même règle que 5106.10.
- 5107.7 Démo : BPCE et les comptes démo qui ont un écosystème rendent la grille (vérifier dans `apps/api/src/modules/demo/` que leurs partenaires portent une preuve ; sinon semer la preuve dans le jeu démo — données fictives SEULEMENT dans la démo). `demo-coverage.ts` à jour.
- 5107.8 Même contraintes que 5106.12.
- 5107.9 Écosystème et Pratiques achats restent DEUX sous-onglets distincts (règle du 22/08) : jamais une liste fusionnée.

## Je ne fais pas

- Aucune collecte nouvelle, aucun champ ni colonne neuve, aucune migration, aucun endpoint neuf.
- Rien sur l'ESN de rang 2 (#5063).
- Aucune carte inventée hors démo ; aucune source nommée ; aucun bloc actuel supprimé.
- Pas de refonte de `PartnerDetailModal` au-delà de l'ouvrir depuis la carte.

## Droits

Inchangés. Qui voit le compte voit les deux sous-onglets (même garde de route qu'aujourd'hui,
aucune route ni page nouvelle). « Préparer la vérification » crée une tâche au nom de
l'utilisateur connecté par le chemin existant ; un utilisateur hors espace est refusé par l'API
comme aujourd'hui. Les corrections de relation gardent leurs droits actuels (dans le modal).
Test exigé : un test qui prouve que le bouton envoie `account_id` du compte affiché et rien d'autre.

## Je défais

- #3403 : le libellé « Voies d’accès du workspace » → « Pratiques achats ».
- #2122, #3684 : la tête de section en 4 blocs et la liste partenaires comme forme PRINCIPALE (contenu gardé dans « Lecture détaillée »).
- Le tableau achats dans « Ce que je dois savoir » → un lien (5106.9).
  Garde : #3473.

## Gardé — déplacé tel quel (relevé par la porte d'antériorité le 01/11)

Les blocs actuels de `TabAccess` et `TabPartners` sont DÉPLACÉS dans « Lecture détaillée » (enveloppe +
reformatage Prettier ; `git diff -w` : aucune logique retirée). Chaque décision portée par ces lignes est
GARDÉE : garde #1417, garde #1573, garde #1574, garde #1579, garde #1605, garde #1606, garde #1609,
garde #1611, garde #1624, garde #1631, garde #1640, garde #1692, garde #1818, garde #1887, garde #2130,
garde #2151, garde #2166, garde #2298, garde #2646, garde #3000, garde #3095, garde #3406, garde #3464,
garde #3471, garde #3483, garde #3504, garde #3529, garde #3544, garde #3562, garde #3777, garde #3916,
garde #3922, garde #4016, garde #4295, garde #4681, garde #4802, garde #4926.
Garde #2115 : le bouchon de `TabPartners` du test de structure rend `detailedExtra`, l'assertion « la tête
de section est montée » est celle d'avant.

## Maquette (hors dépôt, recopiée ici) — `Bellum_V22_BPCE.html`

```js
function title(a, text, desc, action = '') {
  return `<div class="ac20-section-head"><div><h2>${text}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${action}</div>`
}
function procurement(a) {
  return (
    title(
      a,
      `${E(first())}, vérifie le circuit avant de promettre un accès.`,
      'Les éléments du relevé aident à préparer les questions achats. Ils ne certifient ni ton référencement ni une obligation applicable à chaque filiale.',
      source(a, 'procurement'),
    ) +
    `<div class="ac20-buying-intro"><div>${icon('link')}<h3>Relation commerciale</h3><p>Un sponsor ou un contact connu peut aider à comprendre un sujet.</p></div><div>${icon('shield')}<h3>Référencement fournisseur</h3><p>Un statut et un périmètre distincts, à documenter.</p></div><div>${icon('file')}<h3>Commande & intervention</h3><p>Des conditions à confirmer sur l’opération précise.</p></div></div><div class="ac20-buying-grid">${purchases()
      .map(
        (r, i) =>
          `<article><span class="ac20-eyebrow">${E(r.element || 'ÉLÉMENT DU CIRCUIT')}</span><h3>${E(r.nom || r.element)}</h3><p>${E(r.ce_que_c_est)}</p><details><summary>Lecture du relevé et points de vigilance</summary><p>${E(r.ce_que_tu_dois_avoir_en_tete || '')}</p><small>Qualification d’origine : ${E(r.fiabilite || 'non renseignée')} · relevé fourni, non revérifié.</small></details>${btn('Préparer la vérification', 'task', 'plain sm', `data-id="${a.id}" data-topic="${E(r.nom || r.element)}"`, 'checklist')}</article>`,
      )
      .join('')}</div>`
  )
}
function ecosystem(a) {
  return (
    title(
      a,
      'Des acteurs cités, pas un accès garanti.',
      `${E(first())}, une observation de collaboration n’établit ni un panel actuel, ni un accord de sous-traitance avec ton entreprise.`,
      source(a, 'ecosystem'),
    ) +
    `<div class="ac20-ecosystem-grid">${B.esn.map((p, i) => `<article><div class="ac20-partner-top"><span class="ac20-company-monogram">${E(initials(p.name))}</span><div><h3>${E(p.name)}</h3><small>${E(p.perimeter || 'Périmètre non précisé')}</small></div></div><p>${E(p.proof)}</p><div class="ac20-partner-bottom">${pill('Observation du relevé')}${btn('Détail & réserve', 'partner', 'plain sm', `data-id="${a.id}" data-index="${i}"`, 'right')}</div></article>`).join('')}</div>`
  )
}
```

`source(a,…)` de la maquette = un badge de source : **ne pas le reproduire** (sources jamais nommées).

CSS de la maquette (traduire en classes Tailwind + tokens `--bellum-*` existants ; tailles < 12 px → 12 px) :

```css
.ac20-buying-intro {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
  margin-bottom: 25px;
}
.ac20-buying-intro > div {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface2);
}
.ac20-buying-intro .icon {
  color: var(--accent);
  float: left;
  margin: 0 13px 15px 0;
}
.ac20-buying-intro h3 {
  font-size: 15px;
  margin-bottom: 9px;
}
.ac20-buying-intro p {
  font-size: 12px;
  color: var(--secondary);
  line-height: 1.7;
}
.ac20-buying-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 17px;
}
.ac20-buying-grid article {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.ac20-buying-grid h3 {
  font-size: 20px;
  letter-spacing: -0.5px;
  margin: 12px 0 8px;
}
.ac20-buying-grid p {
  font-size: 13px;
  line-height: 1.75;
  color: var(--secondary);
}
.ac20-buying-grid details {
  margin: 20px 0 15px;
  width: 100%;
}
.ac20-buying-grid summary {
  color: var(--accent);
  cursor: pointer;
}
.ac20-eyebrow {
  font-size: 10px;
  letter-spacing: 1.5px;
  font-weight: 650;
  color: var(--accent);
  display: block;
  text-transform: uppercase;
}
.ac20-ecosystem-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.ac20-ecosystem-grid article {
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 11px;
  display: flex;
  flex-direction: column;
}
.ac20-ecosystem-grid article > p {
  font-size: 12px;
  color: var(--secondary);
  line-height: 1.75;
  margin-bottom: 20px;
}
.ac20-company-monogram {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface2);
  font-size: 11px;
  font-weight: 650;
  flex-shrink: 0;
  color: var(--accent);
}
.ac20-partner-top h3 {
  font-size: 14px;
  line-height: 1.5;
}
.ac20-partner-top small {
  font-size: 10px;
  color: var(--muted);
  display: block;
  margin-top: 6px;
}
.ac20-partner-bottom {
  margin-top: auto;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.ac20-partner-bottom .btn {
  margin-left: auto;
}
@media (max-width: 767px) {
  .ac20-buying-intro,
  .ac20-buying-grid,
  .ac20-ecosystem-grid {
    grid-template-columns: 1fr;
  }
}
```

## Méthode

1. TDD : tests vitest à côté des composants AVANT le code — cartes rendues depuis une section achats fixture ; état vide (0 carte) ; repli absent quand `ce_que_tu_dois_avoir_en_tete` vide ; bouton → `useCreateTask` appelé avec `account_id` ; partenaire sans preuve ⇒ pas de carte ; « Détail & réserve » ouvre le modal ; « Lecture détaillée » contient les blocs actuels (au moins un test par bloc qu'il est toujours rendu après ouverture) ; procédure collective visible sans ouvrir ; « Ce que je dois savoir » rend le lien et plus le tableau achats.
2. Composants neufs petits, dans `tabs/access/` et `tabs/ecosystem/` (pas de fichier > 400 lignes ajouté ; ne pas gonfler `TabAccess.tsx`/`TabPartners.tsx`, extraire le rendu actuel tel quel dans un composant « lecture détaillée » si besoin).
3. Imports nommés, pas de default export, aucun type exporté consommé seulement dans son fichier (knip).
4. CHANGELOG : une ligne par issue.

## Tests et push — CIBLÉS seulement (la suite complète est la CI)

- Une fois : `pnpm exec turbo run build --filter=@bellum/web^...` (construit les dépendances, sinon `tsc` ne sort que des TS6305).
- Avant chaque push : `pnpm --filter @bellum/web run check-types 2>&1 | grep 'error TS'` → zéro ligne ; `pnpm --filter @bellum/web exec vitest run <tes fichiers de test> src/architecture` (≤ 5 specs + les gardes d'architecture) ; si `apps/api/src/modules/demo` touché : `pnpm --filter @bellum/api exec jest src/modules/demo/demo-coverage.spec.ts`.
- `npx -y prettier@$(node -p "require('./node_modules/prettier/package.json').version") --write <fichiers touchés>` (jamais via rtk).
- Pousse TÔT (dès la première étape verte) puis après chaque point : `git push -u origin HEAD:refs/heads/claude/ecosysteme-acces-v22-5106-5107`. **Push simple uniquement** : jamais `--no-verify`, `--force`, rebase. Si le pre-push refuse : corriger ce qu'il nomme (Prettier, trailer `Doc-inchangée: <fiche> — <raison>` si demandé, erreur TS) et repousser ; refusé deux fois pour la même raison ⇒ STOP avec la sortie exacte dans le rapport.
- Ne PAS ouvrir de PR : le fil principal l'ouvre.

## Rapport (≤ 15 lignes, en dernier commit dans `docs/briefs/claude-ecosysteme-acces-v22-5106-5107.rapport.md`, poussé)

SHA final · par point `5106.n`/`5107.n` : livré (`fichier:ligne` du composant ET de son appelant) ou non fait (pourquoi) · tests lancés et résultat · tout débordement de périmètre (= question, pas livré).
