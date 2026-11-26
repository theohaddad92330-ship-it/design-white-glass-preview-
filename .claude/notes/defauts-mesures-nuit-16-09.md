# Défauts mesurés dans la nuit du 15 au 16/09/2026

> Chacun a été **mesuré**, pas supposé : soit en production dans le navigateur, soit
> par `git grep` sur `origin/main`. Chacun porte son adresse et ce qu'un humain
> subit. Aucun n'est corrigé au moment où cette note est écrite, sauf mention.

---

## 1. Le cockpit personnel affiche « 0 » quand il ÉCHOUE

**Où** : `apps/api/src/modules/dashboard/personal-cockpit.service.ts:132-135`.

```ts
} catch (error) {
  this.logger.warn('Failed to compute personal cockpit', { error })
  return emptyResponse()   // { my_accounts: 0, relances_open: 0, relances_overdue: 0, messages_this_week: 0 }
}
```

**Ce qu'un humain subit** : une panne de calcul s'affiche comme « 0 compte,
0 relance, **0 en retard** ». C'est pire qu'une erreur — c'est rassurant et faux.
Un commercial lit « 0 en retard » et ferme l'onglet.

**Les deux règles violées en même temps** : « non mesuré » n'est jamais « 0 »
(GA-18 / GA-19), et « jamais de donnée fictive — échec API → erreur claire, pas
de repli inventé ».

**L'étalon existe déjà dans le dépôt** : `apps/api/src/modules/briefing/briefing.service.ts:548,550,606`
rend `empty('unavailable', 'agenda_status_failed')` et distingue « la source est
en panne » de « la source n'est pas branchée ». C'est ce qu'il faut copier.

> ⚠️ Le cockpit **calculait bien** au moment de la mesure (31 comptes,
> 294 relances, 135 en retard à l'écran). Ce n'est pas un incident en cours :
> c'est le CHEMIN D'ÉCHEC qui ment.

Confié à un écrivain (branche `fix/trois-zeros-qui-mentent`), avec deux autres.

---

## 2. `CardResult.actorName` : un champ déclaré que personne ne renseigne

**Où** : écrit à **quatre** endroits de `apps/api/src/modules/action-os/copilot-card.service.ts`
(lignes 681, 757, 864, 1187), et **toujours `null`**.

Pourtant le schéma existe (`packages/contracts/src/schemas/copilot-card.ts:353`),
la carte le rend (`apps/web/src/features/chat/view/CopilotCards.tsx:268`), et
l'i18n existe dans les deux langues (`cards.result.actor`).

Point de registre : **#1931.12**. C'est le défaut n°1 du dépôt — du code juste,
testé, que personne n'alimente.

---

## 3. Une démonstration ne montre JAMAIS une carte du copilote

**Où** : `apps/api/src/modules/action-os/copilot-card.service.ts:280` —
`if (isDemo) return { cards: [], counts: { ...counts, demo: true } }`.

La craft rule n°9 dit que toute capacité user-facing est AUSSI remplie en démo.
**Reste à trancher si c'en est un défaut** : si la démo ne fait pas parler Laura
du tout, « aucune carte » est une conséquence — mais alors `demo-coverage.ts`
doit le classer **« vide à dessein, avec sa raison »**, et il ne le fait pas.

---

## 4. ⚠️ Quatre-vingt-quatorze dialogues annoncent « Close » en anglais

**Mesuré** : `<DialogContent>` est utilisé dans **71 fichiers** de `apps/web/src`.
**Un seul** passe `closeLabel` (`components/overlay/BrowsableDialog.tsx:133`).
Les 70 autres prennent le défaut — `closeLabel = 'Close'`
(`packages/ui/src/components/dialog.tsx:45`). Et `<SheetContent>`, utilisé dans
**24 fichiers**, n'a **aucune prop** : `packages/ui/src/components/sheet.tsx:133`
écrit `<span className="sr-only">Close</span>` en dur.

**Ce qu'un humain subit** : un utilisateur de lecteur d'écran, dans une interface
française, entend « Close ». Le libellé est `sr-only` — **invisible à une recette
à l'œil**, ce qui explique qu'il ait survécu.

**L'antériorité est déjà écrite, et elle dit que le travail a été laissé à
moitié** — `dialog.tsx:34-43`, point **#1797** :

> « Il était écrit "Close" EN DUR dans un produit dont la langue par défaut est le
> français : soixante-cinq dialogues annonçaient un mot anglais au lecteur
> d'écran. […] **Le défaut anglais reste pour ne pas rendre la prop obligatoire
> sur les appelants existants.** »

Le mécanisme a été posé, la famille n'a pas été finie. C'est exactement la règle
« un correctif règle une FAMILLE ». Ce qui reste : passer le libellé aux 70
appelants, donner la même prop à `SheetContent`, et poser la garde qui saura dire
non (un test qui casse si un `DialogContent`/`SheetContent` n'a pas de libellé
traduit).

---

## 5. Le dialogue « Nouvelle conversation » ne se ferme pas à Échap, et ne se dit pas modal

**Mesuré en production** sur `/chat`, bouton « Changer ce que Laura lit ».

- **Deux tentatives** de `Escape` (événement synthétique, puis vraie touche via
  l'outil) : le dialogue reste ouvert. Il y a bien « Annuler » et une croix, donc
  ce n'est **pas une impasse** — mais Échap est le geste attendu sur une modale.
- **`aria-modal` vaut `null`** sur ce dialogue. Une technologie d'assistance ne
  sait donc pas que le reste de la page est inerte, et continue de le parcourir.
  Le dépôt sait faire : `BattleCardModal.tsx`, `SessionRevokedNotice.tsx`,
  `MemoryLedgerView.tsx` le posent.

---

## Ce qui a été PROUVÉ en production cette nuit (et non pas cassé)

- **#1951.23** — dans « Changer ce que Laura lit » › **Une personne**, chaque
  personne s'affiche avec **son rôle ET sa société** (« Ulrich — Head of Bids and
  Solutions · THALES »). Deux homonymes seraient donc distinguables.
  ⚠️ **Nuance honnête** : il n'existe pas deux homonymes réels dans l'espace de
  test. Ce qui est prouvé, c'est que l'affichage PORTE un discriminant — pas que
  l'application gère un vrai doublon de nom.
- **#1951.26** — les six portées d'objet existent bien comme onglets : un compte,
  un consultant, un besoin, une mission, une personne, une opportunité. La partie
  « l'annonce nomme le passage » d'une portée à l'autre reste à prouver.
- Le texte d'en-tête de ce dialogue tient la doctrine mot pour mot : « Laura ne lit
  que les données de ton espace, et te dit sous chaque réponse ce qu'elle a
  utilisé. » — la capacité est nommée, aucun fournisseur ne l'est.
- **Mise en page à 1 512 px** : `/dashboard` (266 éléments lus), `/pilotage` (523),
  `/settings/profile` (473), `/mes-cibles` (253), `/chat` (648) — **aucun
  débordement, aucun défilement horizontal du corps, aucun élément écrasé, aucune
  taille en pixels en style inline.** Les deux « 0 » de `/pilotage` sont
  correctement qualifiés (« sur 18 besoins pris en charge », « aucun ce mois-ci »).

## Ce que l'outillage ne sait PAS mesurer, et qu'il faut donc regarder à l'œil

**Le rendu à ~500 px.** Les deux chemins sont fermés, et mesurés :

1. `resize_window` rend « Successfully resized window to 500x900 » et
   `window.innerWidth` **reste à 1512**. L'outil ment.
2. Une iframe de même origine (qui aurait fait répondre les media queries à la
   largeur de l'iframe) est refusée par la CSP du site : `contentDocument` est nul.

La preuve visuelle du mobile appartient donc à un humain devant l'écran.

---

## Recette en PRODUCTION — 16/09 vers 02 h, SHA servi `06e0a6a49`

Session de Louis vivante (`GET /auth/session` → 200, rôle `customer`). Quatre écrans
balayés à 1 512 px, chacun avec son **corpus lu** écrit en face — une sonde sans corpus
rend un vert qui ne prouve rien.

| écran | corpus lu | anglais | fournisseur nommé | bouton sans nom | `div[role=button]` | débordement | `z-[…]` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/chat` | 86 boutons · 5 642 c | **`Close`** | aucun | 0 | 0 | non | 0 |
| `/dashboard` | 25 boutons · 1 096 c | aucun | aucun | 0 | 0 | non | 0 |
| `/settings` | 17 boutons · 1 545 c | aucun | aucun | 0 | 0 | non | 0 |
| `/accounts` | 254 boutons · 8 971 c | aucun | aucun | 0 | 0 | non | 0 |

### 1. `Close` est EN PRODUCTION, et c'est le chemin `sheet`, pas le chemin `dialog`

Un seul nœud texte `Close` sur `/chat` : `<span class="sr-only">Close</span>`, parent
`<button class="absolute right-4 top-4 …">`, `offsetParent !== null` — donc **rendu**,
pas mort. C'est le libellé écrit **en dur** dans `packages/ui/src/components/sheet.tsx:133`,
qui n'a même pas de prop pour le remplacer ; le défaut `closeLabel = 'Close'` de
`dialog.tsx:45` est l'autre moitié de la famille. **Si on n'en corrige qu'un, c'est
`sheet.tsx`** — c'est lui qui sort à l'écran.

### 2. Le tableau de bord affiche « 0 Messages (7j) » — et personne ne peut savoir si c'est vrai

Mesuré : le seul « 0 » nu de l'écran, libellé voisin `Messages (7j)`.
`GET /dashboard/me` rend `{"my_accounts":31,"relances_open":294,"relances_overdue":135,"messages_this_week":0}`.

Les trois premiers nombres sont manifestement mesurés. Le quatrième vient de
`ActionsService.countMessagesSince`, qui — dans la version servie — **attrape sa propre
erreur et rend `0` sans rien dire**. Donc à l'écran, « aucun message cette semaine » et
« le compte est cassé » s'écrivent exactement pareil. C'est la démonstration en grandeur
réelle de GA-18/GA-19, sur la première chose qu'un commercial regarde le matin.

Corrigé sur `fix/trois-zeros-qui-mentent` (l'échec remonte, le cockpit sait montrer un
état d'échec).

**✅ RECETTÉ EN PRODUCTION le 16/09 à 04 h 10**, après le merge de #2360 (`c207f2bcc`,
servi par l'API ET par l'IA — vérifié sur `GET /version`, pas supposé).

Relevé, `location.href` relu dans la capture (`https://app.bellum-ai.com/dashboard`,
corpus lu : 4 cartes, 52 lignes) :

    Mon équipe          31
    Mon portefeuille   294
    Relances à faire   135
    Messages (7j)        0

et `GET /dashboard/me` rend, en 200 :
`{"my_accounts":31,"relances_open":294,"relances_overdue":135,"messages_this_week":0}`.

**Ce que ça prouve, et ce que ça ne prouve pas.** Le `0` est toujours là — mais il n'a
plus le même statut. `countMessagesSince` n'attrape plus son erreur
(`actions.service.ts:372-384`, le commentaire nomme son seul appelant) : une requête
cassée LÈVE désormais, et le cockpit montre un état d'échec. Un `0` rendu en 200, à côté
de trois compteurs manifestement mesurés, est donc un `0` MESURÉ.

⚠️ Et c'est la distinction qui compte pour GA-18/GA-19 : la règle interdit d'afficher
`0` pour une valeur ABSENTE, pas pour une valeur qui vaut zéro. Zéro message préparé en
sept jours est un fait, et `0` en est le bon rendu. Ce qui était faux hier, c'est qu'on
ne pouvait pas faire la différence ; aujourd'hui on le peut. **La question « si cette
valeur est absente, "0" est-il VRAI ? » a maintenant une réponse à l'écran.**

**État au 16/09 à 04 h 35** : le correctif est sur `fix/les-dialogues-ne-disent-plus-close-en-anglais`
(PR #2361), **CI VERTE** sur `2dea6e3d9`, et il traite bien `sheet.tsx` et pas seulement
`dialog.tsx` — vérifié dans le diff : `SheetContentProps` rend `closeLabel` **obligatoire
à la compilation**, sauf quand `hideClose` vaut `true` (dans ce cas la croix ne se rend
pas, et un nom qu'on ne lirait jamais mentirait pour rien).

⚠️ **Elle atterrit en DERNIER, et c'est pour cette raison précise** : rendre `closeLabel`
obligatoire fait échouer la compilation de toute `DialogContent` / `SheetContent`
introduite entre-temps. Vérifié que #2363 n'en introduit aucune — l'ordre tient quand même,
parce qu'il ne coûte rien et qu'une erreur ici casserait `main`.

⚠️ **La recette en production de ce point reste DUE, et elle demande un geste** :
`sheet.tsx:133` (`<span className="sr-only">Close</span>`) ne se rend que lorsqu'un
tiroir est OUVERT. Un balayage de `/chat` au repos ne le voit pas — mesuré : 140 lignes,
52 boutons lus, **zéro libellé anglais nu** à l'écran, ce qui ne prouve rien puisque le
tiroir est fermé. Ce point passera `recetté` quand quelqu'un ouvrira un tiroir après le
déploiement de #2361, pas avant.

### 3. La mesure à ~390 px reste IMPOSSIBLE — et la cause est nommée, ce n'est plus une supposition

Les deux chemins sont fermés, et re-mesurés cette nuit :
- `resize_window` **ment** — il répond « Successfully resized window to 500x900 » pendant
  que `window.innerWidth` reste à `1512`.
- l'iframe de 390 px rend `contentDocument: null`. La raison exacte est dans l'en-tête de
  production : `content-security-policy: frame-ancestors 'none'`.

⚠️ **On ne touche pas à cet en-tête.** `frame-ancestors 'none'` protège contre le
détournement de clic ; l'affaiblir pour notre confort de mesure échangerait une vraie
protection contre un outil. La conséquence est à assumer telle quelle : **tout point
d'onboarding, de Laura ou de réglages dont la preuve est « le rendu sur téléphone » reste
`retenu`**, et se lève par un humain qui regarde son écran — pas autrement.

---

## Deuxième passe de recette — 02 h 20, après le déploiement de la vague 10 (`14a306799`)

### 4. L'audit commercial tient la doctrine À L'ÉCRAN, pas seulement dans le code

`/settings/profile/audit`, corpus lu : 26 titres, 10 boutons, 5 806 caractères. Ce que
l'écran rend, mot pour mot :

> Plan à 4 semaines — **non mesuré** — « Aucune source ne produit encore ce plan. »
> Paliers — **non mesuré** — « Aucune source ne mesure encore de palier. »
> Ce que Laura pourra régler depuis cet audit — **non mesuré** — « Aucun paramètre :
> aucune configuration effective n'est encore dérivée de l'audit. »

et sous « Ce qui n'a pas pu être établi » :

> « Pas de niveau de confiance chiffré : un pourcentage mesurerait nos données et se
> lirait comme une chance de réussite. Voici la liste, nommée. »

C'est exactement ce que la doctrine demande — « non mesuré » n'est pas « 0 », aucune
probabilité, ce qui n'a pas pu être évalué est NOMMÉ — et c'est la première fois qu'on le
voit tourner plutôt que le lire. #2061.1/.23/.24 passent à `recetté`.
⚠️ Ce qui est recetté est le **RENDU**. Le **CONTENU** de #2068 reste dû.

### 5. GA-44 est respecté sur `/welcome` — vérifié, pas supposé

`/welcome` nomme « HubSpot », « Gmail », « Google Calendar » sous « Ce que tes outils font
déjà ». La règle n'autorise à nommer que ce que l'espace a **lui-même branché**.
Vérification sur `/integrations` : **7 branchés · 9 à brancher**, HubSpot porte
« Connecté », le domaine `bellum-it.com` et un bouton « Déconnecter ».
Les trois noms sont donc des outils réellement connectés : pas de violation. Et aucun de
NOS fournisseurs n'apparaît sur aucun des huit écrans balayés.

### 6. Les deux « 0 » de `/pilotage` sont HONNÊTES

- « 0 % — Taux de qualification · **sur 18 besoins pris en charge** » : le dénominateur
  est nommé, la mesure existe.
- « 0 — Clients actifs — **aucun ce mois-ci** » : la période est nommée.

Un zéro qui dit sur quoi il porte n'est pas un zéro qui ment. C'est la différence avec
« 0 Messages (7j) » du tableau de bord, dont rien ne dit s'il a été mesuré.

### 7. ⚠️ Une erreur de MESURE, à ne pas refaire : le `ch` n'est pas `0,5 em`

Premier relevé de la largeur de lecture sur `/pilotage` : **93 caractères par ligne**,
donc au-dessus de la borne de 70 (D81). C'était **faux**, et le correctif du relevé l'a
montré : j'estimais un caractère à `fontSize × 0,5`, alors que l'unité CSS `ch` est la
largeur du **glyphe « 0 » dans la police de l'élément** — ici ≈ 0,66 em. L'erreur
surestime de **33 %**.

Mesure refaite avec un `canvas.measureText('0')` dans la police calculée de chaque
élément : **70 caractères exactement**, `max-w-[70ch]` présent dans la classe, et
**0 paragraphe au-dessus de 72**. La règle est tenue.

La leçon vaut au-delà de ce cas : **un relevé qui contredit une règle gardée par la CI
est d'abord suspect de sa propre méthode.** GA-34 compte les échappements `full` ; si la
garde est verte et que la sonde est rouge, c'est la sonde qu'on relit en premier.

```js
// la bonne façon de mesurer une largeur de lecture dans un navigateur
const cv = document.createElement('canvas').getContext('2d')
const chDe = (cs) => { cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return cv.measureText('0').width }
```

---

## Le balayage complet — douze écrans de production, 02 h 00 → 02 h 30

Un relevé sans **corpus lu** est un vert qui ne prouve rien : chaque ligne porte le sien.
Sondes : anglais résiduel · nos fournisseurs nommés · outils client nommés sans être
branchés (GA-44) · boutons à icône seule sans nom (GA-32) · `div[role=button]` (GA-35) ·
« 0 » nus (GA-18/19) · largeur de lecture en `ch` réels (D81) · échelle typographique
(GA-31) · `z-[…]` en dur (GA-33) · débordement horizontal.

| écran | boutons | texte | défaut mesuré |
| --- | --- | --- | --- |
| `/chat` | 86 | 5 642 c | **`Close`** — `sheet.tsx:133`, en dur, sans prop |
| `/dashboard` | 25 | 1 096 c | **« 0 Messages (7j) »** — indiscernable d'une panne |
| `/accounts` | 254 | 8 971 c | — |
| `/accounts/:id` | 51 | 5 017 c | — (« probablement » est une nuance de prose, pas une probabilité affichée) |
| `/settings` | 17 | 1 545 c | — |
| `/settings/security` | 14 | 1 151 c | — (« 4 sessions actives », lecture réussie) |
| `/settings/profile/audit` | 10 | 5 806 c | — **la doctrine tenue à l'écran** (§4) |
| `/settings/team` | 12 | 1 983 c | — |
| `/integrations` | 51 | 8 775 c | — (7 branchés · 9 à brancher) |
| `/welcome` | 7 | 3 247 c | — (les 3 outils nommés sont bien branchés, §5) |
| `/discover` | 52 | 2 890 c | — |
| `/contacts` | 85 | 6 569 c | — |
| `/actions` | 48 | 3 807 c | — (« À valider 0 » / « Terminées 0 » : compteurs d'une liste qu'on possède, « 0 » est VRAI) |
| `/projects` | 67 | 6 287 c | — (11 paragraphes mesurés, 31 `ch` au plus large) |
| `/pilotage` | 41 | 5 873 c | — (les deux « 0 » nomment leur périmètre, §6) |
| `/briefing` | 35 | 6 857 c | — **exemplaire** (voir ci-dessous) |
| `/mes-cibles` | 21 | 882 c | — |

**Sur les seize écrans : zéro nom de fournisseur, zéro bouton à icône seule sans nom,
zéro `div[role=button]`, zéro `z-[…]` en dur, zéro débordement horizontal, zéro taille
hors de l'échelle Tailwind, zéro paragraphe au-dessus de 72 caractères.** Deux défauts
seulement, tous deux déjà en cours de correction.

### `/briefing` est l'écran qui montre ce que la doctrine donne quand elle est tenue

Relevé verbatim : « **Sources utilisées aujourd'hui** : ton agenda · connecté · ta
messagerie · connecté · tes tâches · connecté » — des **capacités**, jamais un
fournisseur (GA-44). « TES 7 ACTIONS · 5 visibles · 2 autres · **rien ne sera envoyé** » —
la promesse « le copilote prépare, le commercial envoie » écrite à l'écran, pas seulement
dans un document. « Sources : ton agenda · ta messagerie » sur le bloc d'actions — la
provenance à côté de ce qu'elle a produit. Et **trois « Non mesuré »** là où la donnée
manque.

C'est le modèle à citer quand un écran doit être refait : il ne promet rien qu'il ne
tienne, et il dit d'où vient chaque chose.

### Une note d'exactitude sur la méthode

`/agenda` n'existe pas — c'était une URL devinée, et la page 404 qui s'affiche est elle
aussi propre (française, « Retour à l'accueil », « Signaler un problème », « Ouvrir
Laura »). Les routes réelles se lisent dans `apps/web/src/routes/*/index.tsx` ; deviner
une URL produit un faux défaut aussi facilement qu'un faux vert.

---

## 8. ⚠️ Ma propre erreur : « garder les deux côtés » est une règle de LISTE, pas de texte

Treize jobs de CI rouges d'un coup sur la vague 11 onboarding, tous pour la même
cause : `labels.fr.ts` et `labels.en.ts` ne compilaient plus — `'}' expected` en fin de
fichier. C'est moi qui l'avais cassé, en résolvant le conflit du changelog avec :

```
<<<<<<< HEAD (.*?) ======= (.*?) >>>>>>> origin/main   →   groupe1 + groupe2
```

Ça marche sur `entries.ts`, dont chaque élément tient sur **une ligne**. Ça casse sur
`labels.*.ts`, où une entrée est un **objet de plusieurs lignes** : la frontière
`=======` tombait à l'intérieur de la dernière entrée du côté HEAD, et son `},` de
fermeture vivait dans le **tronc commun**, après le marqueur `>>>>>>>`. En concaténant
les deux côtés, cette fermeture se retrouvait à fermer l'entrée du côté distant.
**Une accolade de moins, exactement une**, invisible à la lecture du diff.

**La règle, corrigée** : « garder les deux côtés » ne s'applique telle quelle que
lorsqu'un élément de la liste tient sur une ligne. Dès qu'un élément est un BLOC, la
fusion se vérifie — et le contrôle coûte une seconde :

```sh
python3 -c "
import io
for f in ['packages/contracts/src/changelog/labels.fr.ts','packages/contracts/src/changelog/labels.en.ts','packages/contracts/src/changelog/entries.ts']:
    s=io.open(f,encoding='utf-8').read()
    print(f, 'delta', s.count('{')-s.count('}'))
"
```

Les trois doivent rendre `0`. Ce contrôle manquait à mon script ; il y est maintenant.
Et l'ordre de grandeur utile pour le second contrôle : `entries.ts` porte **766**
identifiants, **zéro doublon**.

Le motif est le même que celui qui a déjà coûté 127 lignes dupliquées une autre fois :
une règle de fusion juste, appliquée à une structure à laquelle elle ne s'applique pas.

---

## 9. Le choix de portée de `/chat` n'est pas une modale pour le clavier — non corrigé

Mesuré deux fois dans la nuit sur le dialogue « Nouvelle conversation » (`?new=`,
`apps/web/src/features/chat/view/Chat.tsx:596-616` → `setScopeDialogOpen(true)`) :

- **Échap ne le ferme pas** — deux tentatives, un évènement synthétique puis une vraie
  touche. Ce n'est pas une impasse : un bouton « Annuler » existe.
- **`aria-modal` vaut `null`** — donc, pour un lecteur d'écran, le reste de la page
  n'est pas neutralisé.
- Son libellé de fermeture était en anglais. **Cette moitié-là est corrigée** par
  `fix/les-dialogues-ne-disent-plus-close-en-anglais` (PR #2361), qui rend `closeLabel`
  obligatoire à la compilation. Le reste ne l'est pas — l'écrivain l'a croisé et **ne
  l'a volontairement pas touché**, c'était hors de son lot.

⚠️ **Limite de la mesure, à dire honnêtement** : une troisième tentative de reproduction
à 02 h 50 n'a pas réussi à rouvrir le dialogue depuis `/chat?new=1` — l'effet consomme le
paramètre et le retire de l'URL (c'est voulu, et documenté dans le code), et le relevé
n'a trouvé **aucun** `[role="dialog"]`. Deux lectures restent ouvertes : soit le dialogue
s'était refermé avant la capture, soit il se rend **sans** `role="dialog"` — ce qui serait
cohérent avec l'`aria-modal: null` déjà mesuré, et bien plus grave. **Arrêté là** (règle
des 2-3 tentatives) plutôt que de deviner.

Ce qui est sûr et suffit à ouvrir un lot : un dialogue de choix qui ne se ferme pas à
Échap, sur l'écran le plus utilisé du produit. **Ce qui se clique se tabule** (GA-35), et
ce qui s'ouvre se ferme au clavier.

## Défaut n°3 (à confirmer) — un onglet ouvert PENDANT un déploiement retombe sur `/login`

**Mesuré le 16/09/2026 vers 03 h 10.** Un onglet ouvert sur `/chat` depuis
avant le déploiement de `4172ec196` s'est retrouvé sur `/login`, **alors que
la session était valide** :

```
location.pathname                                   → /login
GET /api/dashboard/me (depuis CE MÊME onglet)       → 200
```

Un utilisateur connecté voit donc l'écran de connexion. Sur une bêta, c'est le
genre de chose qui fait fermer l'onglet.

**Ce qui est vérifié** : le même geste sur un onglet FRAIS ne le reproduit pas.
`/chat` chargé à neuf tient `/chat` pendant six relevés sur 9 secondes, session
à 200 tout du long. **Le défaut n'apparaît donc pas au chargement** — il
apparaît sur un onglet qui a vécu à travers un déploiement.

**Hypothèse, et elle n'est PAS prouvée** : le paquet web est servi par Vercel
et se déploie séparément de l'API. Un onglet qui garde l'ANCIEN bundle voit ses
morceaux différés (`import()` paresseux) disparaître du CDN au déploiement
suivant ; l'échec de chargement d'un morceau, s'il n'est pas distingué d'un
échec d'authentification, envoie sur `/login`. C'est cohérent avec ce qu'on a
mesuré une heure plus tôt : le même onglet exécutait encore `Close` en anglais
quand l'API servait déjà le SHA qui le corrige.

**Ce qu'il faudrait pour trancher** : rejouer un déploiement avec un onglet
ouvert, la console gardée, et regarder si un `ChunkLoadError` précède la
redirection. Tant que ce n'est pas fait, c'est une piste, pas une cause.

⚠️ **Ne pas « corriger » sur cette hypothèse.** Si c'est bien ça, le correctif
n'est pas dans l'authentification : c'est de distinguer « le morceau de code
n'a pas pu être chargé » de « tu n'es pas connecté », et de proposer un
rechargement plutôt qu'une déconnexion.

---

## Défaut n°4 — l'audit dit « tout a pu être établi » trois lignes sous trois « non mesuré » (06 h 27)

**Mesuré en production**, `/settings/profile/audit`, compte réel, API
`4172ec196`. Sur la même page, dans cet ordre :

```
Plan à 4 semaines                          → non mesuré  (« Aucune source ne produit encore ce plan. »)
Paliers                                    → non mesuré  (« Aucune source ne mesure encore de palier. »)
Ce que Laura pourra régler depuis cet audit → non mesuré  (« aucune configuration effective… »)

Ce qui n'a pas pu être établi
  « Voici la liste, nommée. »
  ► Tout ce que cet écran affiche a pu être établi.
```

**Le bloc dont le métier est de nommer ce qui manque déclare qu'il ne manque
rien**, alors que trois blocs de la même page disent « non mesuré ».

**La cause, au code** (`build-audit.ts:278-287`) : `unestablished` est dérivé des
seules entrées du PROFIL — posture, archétype, compte idéal, coaching, cadence,
cibles, style, paramètres, phrases. Les trois blocs qui rendent « non mesuré »
n'y entrent jamais. Le bloc mesure ce qui manque au PROFIL ; son libellé promet
ce qui manque à l'ÉCRAN.

C'est GA-18/GA-19 pris à revers : ce qui n'a pas pu être évalué est bien nommé
en place, et **démenti** en bas de page. Un lecteur qui fait confiance au bloc
récapitulatif repart avec l'idée que l'audit est complet.

⚠️ **Divergence relevée au passage, non tranchée** : `origin/main` porte une
neuvième ligne `if (!kpiTargets) unestablished.push('kpiTargets')` que
`feat/contexte-audit-commercial-cable` (`ea8460426`) n'a plus. Retrait
délibéré ou perte à la fusion : c'est dans le brief de l'écrivain.

**Non fait ici** : remplir les trois blocs. C'est le lot de
`feat/contexte-audit-commercial-cable`. Celui-ci ne corrige qu'une chose —
**que l'écran dise la vérité sur son propre état**, remplis ou pas.

### Ce que le MÊME écran prouve, en revanche

Le reste de l'audit tient la doctrine, verbatim :

- « Chaque ligne vient de tes réponses. **Ce qui n'a pas pu être établi est
  nommé, jamais compté pour zéro.** » — en tête d'écran ;
- « **Pas de niveau de confiance chiffré** : un pourcentage mesurerait nos
  données et se lirait comme une chance de réussite. » — l'interdit des
  probabilités, écrit à l'écran ;
- la cadence est donnée comme **hypothèse** : « Une hypothèse de Bellum, pas une
  conversion démontrée… jamais à la hausse si ton temps disponible baisse » ;
- chaque voie porte ses neuf faces, **condition d'arrêt comprise** (« Aucune
  réponse après deux relances espacées : changer de voie plutôt que d'insister ») ;
- chaque bloc porte sa provenance (« D'après ton style de message », « D'après
  la lecture de tes réponses ») et l'écran sa version datée (« Version 26 ·
  Actualisé le 15 septembre 2026 ») ;
- **zéro nu : aucun.**

---

## Défaut n°5 — la page d'entrée de la DÉMO se contredit sur elle-même (06 h 48)

**Mesuré en production**, `/demo`, paquet `index-6AcAfAGb.js`. Deux phrases, sur
le même écran, l'une au-dessus de l'autre :

> « Les dossiers que tu vas ouvrir portent sur de **VRAIES entreprises**,
> construits à partir d'**informations publiques** : c'est exactement ce que le
> produit sait faire. » — `fr/common.json:240`, `demo.entry.introBody`

> « **Aucune donnée réelle**, aucun crédit consommé, aucun compte à créer. »
> — `fr/common.json:247`, `demo.entry.introFootnote`

**Sept lignes d'écart dans le MÊME fichier.** Les versions anglaises portent les
deux mêmes défauts.

**Pourquoi ça compte plus qu'une coquille.** `introBody` dit la vérité, et c'est
l'ARGUMENT de la démonstration — un prospect voit ce que le produit sait
vraiment faire. `introFootnote` est la ligne de RÉASSURANCE, celle qu'on lit
comme un engagement sur le traitement des données, et elle se trompe **dans les
deux sens** : elle promet une absence de données réelles qui n'existe pas, et
elle laisse croire que tout ce qui est montré est inventé — ce qui démolit la
phrase du dessus.

C'est le seul écran du produit où une contradiction se lit d'un seul coup d'œil,
et c'est celui que voient les prospects.

**Défaut adjacent, dans la même chaîne** : « {{brand}} **sort en septembre** ».
On est le 16 septembre 2026. Une date de sortie écrite en dur dans une chaîne
i18n pourrit toute seule, et personne ne la surveille — il faut la traduire dans
toutes les langues à chaque glissement.

**Écrivain lancé** : la note de bas de page dit ce qui est vrai (chaque garantie
adossée à une ligne de code qui la prouve, mesurée et non supposée), la date sort
de l'interface, FR+EN à parité, et une garde qui empêche la récidive de la
CLASSE — aucune AFFIRMATION du produit ne porte un nom de mois. ⚠️ Avec ses
témoins de cas légitimes voisins : `accountDetail.json:818` (« Sopra est en
place jusqu'en mars 2027 ») et `projects.json:277` (« Budget gelé jusqu'en
janvier ») sont des **placeholders d'illustration**, pas des promesses — une
garde qui les attrape serait trop gourmande.
