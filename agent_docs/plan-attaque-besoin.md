# Plan d'attaque d'un besoin — spécification d'exécution

Décision Louis 31/07 (D9, option **A**) : le crédit paie une **génération neuve**, pas
le dévoilement d'une donnée déjà payée.

C'est le point qui a bloqué la première tentative : les besoins affichés sur `/needs`
sont **dérivés de `raw_analysis`**, donc d'une analyse déjà facturée 1 crédit. Faire
repayer leur lecture, c'est vendre deux fois la même chose — et ça se voit. Le crédit
achète donc quelque chose qui n'existait pas avant le clic : **comment attaquer ce
besoin**.

Deuxième décision : le plan généré appartient à **l'équipe** (workspace), pas à celui
qui a cliqué. Trois sièges ne paient pas trois fois le même besoin.

---

## Ce que le crédit achète

Un plan d'attaque pour UN besoin d'UN compte :

- **l'angle** — pourquoi ce besoin, chez ce compte, maintenant, et ce que l'ESN a à en
  dire (dérivé de son profil : offres, références, différenciateurs) ;
- **les personnes à viser** — les contacts déjà connus du dossier qui portent ce sujet,
  et à défaut le RÔLE à identifier (jamais un nom inventé) ;
- **le premier message** — prêt à envoyer, dans le vocabulaire du compte ;
- **les preuves à apporter** — références et cas d'usage de l'ESN qui adressent ce
  besoin ; **une preuve absente du profil se dit absente**, elle ne s'invente pas ;
- **la prochaine action** — datée, concrète.

Ce qui reste **gratuit** : la liste des besoins, leur détail tel que l'analyse l'a
produit, la qualification BTMMP, la comparaison à un besoin similaire, l'export CRM.
Relire un plan déjà généré est gratuit et le restera — c'est la génération qui coûte.

---

## Découpage

### 1. IA — nouveau prompt `bellum_need_play`

- Router `POST /needs/play` (`apps/ia/app/routers/`), envelope standard.
- Entrée : le besoin (nature, libellé, détail), le compte (`raw_analysis` utile :
  signaux, entités, vocabulaire), les contacts connus, le profil ESN.
- Entrée du contrat : réutiliser la forme de `battlecard`/`rewriteCv` (le NestJS
  possède la donnée, l'IA ne lit rien en base).
- **`PROMPT_MODELS`** : entrée obligatoire (`REASONING` — c'est un livrable vendable,
  pas un remplissage de gabarit). Le test de politique de modèle échoue sinon.
- Golden : `tests/golden/system/need_play.txt` + empreinte dans
  `prompt_fingerprint.json`.
- Garde anti-invention, sur le modèle de `cv-rewrite-guard.ts` : toute « preuve »
  citée doit exister dans le profil ESN ou dans le dossier ; sinon elle est retirée et
  listée comme manque. Ne pas faire confiance à la consigne du prompt seule.

### 2. API — persistance et débit

- Table `need_plays` : `id`, `workspace_id`, `account_id`, `need_key`, `content` jsonb,
  `generated_by`, `generated_at`. **Unique `(workspace_id, need_key)`** — c'est ce qui
  rend le plan collectif.
- `need_key` : hash stable et déterministe de `account_id` + nature + libellé
  normalisé (minuscules, accents et ponctuation retirés). Il DOIT survivre à une
  re-analyse qui reformule à la marge, sinon l'équipe repaie un plan qu'elle a déjà.
  Prévoir le test : deux libellés qui ne diffèrent que par la casse/les accents
  donnent la même clé.
- `POST /accounts/needs/play` `{ account_id, kind, label }` :
  1. plan existant pour `(workspace, need_key)` → **retour immédiat, aucun débit** ;
  2. solde vide → **402** AVANT l'appel modèle ;
  3. appel IA → garde anti-invention → persistance → `consumeEnrichmentCredit(userId,
{ reason: 'need_play', accountId })` → retour.
     Un échec IA ne persiste rien et ne débite rien (règle identique à l'enrichissement
     et à la réécriture de CV).
- `GET /accounts/needs/plays` → les plans du workspace, pour que la liste sache
  lesquels sont déjà payés.
- Gating : `@RequireFeature('needs')` (l'écran est ouvert dès Team depuis le 31/07).

### 3. Web

- Sur chaque besoin : bouton « Préparer l'attaque » avec **le coût annoncé avant le
  clic** (1 crédit), ou « Voir le plan » quand il existe déjà — le second ne coûte rien
  et doit le dire.
- Panneau de restitution réutilisant `StructuredReply` (Objectif / Angle / Cas
  d'usage / Prochaine action) : la forme est déjà connue des utilisateurs.
- 402 → message actionnable (« crédits épuisés »), pas un toast d'erreur générique.
- i18n FR + EN.

### 4. Démo

Le lien de démonstration doit montrer un plan **déjà généré** (données fictives, zéro
appel modèle, zéro crédit) : seeder `need_plays` dans `demo-dataset.ts` +
`DemoSeedService`, puis classer la table dans `demo-coverage.ts`. Sans ça, le premier
prospect qui clique tombe sur un écran vide — et la garde CI le refusera.

### 5. Changelog

Une entrée FR + EN (règle permanente).

---

## Ce qu'il ne faut pas faire

- **Ne pas** brancher le débit sur la table `opportunities` : elle alimente le graphe
  d'opportunités, pas l'écran Besoins (qui lit `GET /accounts/needs`). C'est le piège
  qui a fait échouer la première tentative.
- **Ne pas** facturer la relecture. Le crédit paie une génération, une fois, pour
  l'équipe.
- **Ne pas** laisser le prompt être seul juge de ses preuves : le garde côté API
  vérifie, comme pour le CV.
