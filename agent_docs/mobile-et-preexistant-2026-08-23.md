# L'appli mobile, et le préexistant — 23/08/2026

**Décision de Louis** : D76 tranchée, puis précisée deux fois. Pas les 34 écrans
portés — une appli mobile **dont la forme est Laura**, avec « Ma journée » à
côté, et tous les écrans qui ont du sens rendus réellement utilisables. « Le
produit ultime sur mobile. »

## 1. Le préexistant, d'abord

Quatre défauts vivants trouvés dans les logs de production. Ils sont traités
AVANT le mobile : une coque neuve en aurait hérité.

### 1.1 · 106 erreurs React par redirection

`<Navigate>` de TanStack Router décide de renaviguer en comparant
l'**identité de l'objet props** :

```js
if (previousPropsRef.current !== props) { navigate(props); … }
```

JSX crée un objet props NEUF à chaque rendu. Pendant la transition React, le
composant qui le rend continue de se rendre, et chaque rendu relance une
navigation. Mesuré sur la seule transition `/` → `/dashboard` : **106 erreurs
#185**. L'écran arrivait quand même — c'est ce qui l'a rendu invisible pendant
des mois. Il coûtait cent rendus et une pile d'exceptions dans Sentry à chaque
connexion. `<RedirectTo>` compare la destination, une chaîne. **Vérifié en
production : 106 → 0.** Garde GA-27.

### 1.2 · Un 429 s'inscrivait « cette ESN n'existe pas »

Le remplissage du référentiel recevait des 429 en rafale du registre.
`search_companies` repliait chaque 429 en `[]` — le contrat « une source
gratuite ne casse jamais une recherche » — et le résolveur en tirait « aucune
entité du registre français ne correspond ». Des sociétés qui existent étaient
marquées introuvables et **jamais retentées**.

Le contrat souple reste le DÉFAUT ; seul l'appelant qui va ÉCRIRE un verdict
passe `strict=True`. Un registre qui répond « rien » reste un verdict.
`ProviderThrottle.back_off()` écoute le refus — un seau à jetons empêche de
dépasser un débit SUPPOSÉ, il ne sait rien du débit réel. Migration
`1789999120000` remet en file les lignes déjà condamnées, et **uniquement**
celles qui portent le motif exact produit par ce chemin.

### 1.3 · Un 406 à chaque démarrage

`maybe_single()` envoie `Accept: application/vnd.pgrst.object+json` ; PostgREST
répond 406 quand le résultat n'est pas exactement un objet — donc à chaque boot,
puisque aucun opérateur n'a jamais écrit de surcharge globale. L'absence de
ligne est le cas NORMAL : la faire ressembler à une erreur apprend à ignorer les
logs de démarrage, et c'est là qu'on regarde quand ça ne va pas.

### 1.4 · Une sonde qui interrogeait une colonne absente

`creditUse` lisait `subscriptions WHERE workspace_id` ; la table est clé par
UTILISATEUR. L'axe « consommation de crédits » du score de santé de Laura n'a
**jamais** été mesurable. Ce qui l'a caché : la fonction rattrape et rend
`null`, et `null` est légitime pour un axe non évaluable — un axe CASSÉ et un
axe NON MESURABLE rendaient la même chose.

## 2. L'appli mobile

**Les mêmes routes, une autre coque.** Sous 768 px, `CustomerPage` remplace la
barre latérale par une barre d'onglets. Un second arbre de routes « mobile »
aurait produit deux produits, et l'un aurait pris du retard — c'est toujours
celui qu'on regarde le moins.

**Laura en premier, et en arrivée.** En mobilité on ne parcourt pas un
portefeuille : on demande quelque chose. Quatre onglets — Laura · Ma journée ·
Comptes · Actions — et pas six : au-delà, les cibles passent sous 44 px. Ce ne
sont pas quatre écrans mais quatre PORTES ; tout le reste reste atteignable.

**Les pièges corrigés :**

| Piège                     | Ce qu'il faisait                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `100vh`                   | comptait la barre d'adresse comme si elle n'existait pas — 21 fichiers, dont `#app-shell`, l'ancrage de toute la chaîne `h-full` |
| deux conteneurs défilants | on atteint le bout de l'intérieur, le geste part sur l'extérieur, la zone de saisie disparaît                                    |
| `min-h-[520px]`           | le copilote dépassait la hauteur utile d'un iPhone                                                                               |
| bouton flottant           | se posait SUR le quatrième onglet, à moitié inatteignable                                                                        |
| liste de comptes          | `min-w-[880px]` : on lisait le nom, on glissait voir le score, on avait perdu le nom                                             |
| onglets d'entête          | treize sur un dossier — les derniers étaient inatteignables sans défilement                                                      |

**PWA** : manifeste, icônes générées (dont une masquable réduite pour survivre au
rognage d'Android), `viewport-fit=cover` — sans lui la zone sûre d'un iPhone à
encoche n'existe pas pour le CSS — et les trois balises `apple-mobile-web-app-*`,
qu'iOS lit à la place du manifeste.

**GA-28** : plus aucun `100vh`, et les grilles à 3+ colonnes sans variante
responsive figées à trois, toutes légitimes (panneau de marque masqué sous `lg`,
grille interne d'un graphique, bande des sept jours d'une semaine).

## 3. Vérifié en production

Sur un viewport de 500 px, salle de démonstration :

- arrivée sur **Laura**, barre d'onglets en bas, quatre onglets atteignables ;
- « Ma journée » lisible d'un regard, carte de rendez-vous avec son bouton ;
- liste de comptes **sans défilement horizontal** ;
- **zéro erreur console** sur la redirection qui en produisait 106 ;
- plus aucun 429 dans l'heure suivant le correctif.

## 4. Ce qui reste

| Sujet                           | Pourquoi pas maintenant                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Les 22 tableaux restants        | `<ResponsiveTable>` existe et est testé ; l'appliquer écran par écran demande de vérifier chacun à l'œil |
| Les 16 visualisations du tome 7 | chacune est un écran, pas une règle                                                                      |
| La densité par persona          | le produit n'a pas de notion de persona                                                                  |
| Un service worker hors-ligne    | le produit lit des données vivantes ; un cache hors-ligne montrerait un portefeuille d'hier sans le dire |
| Les notifications poussées      | elles exigent une clé VAPID et un consentement ; à demander quand quelqu'un les réclame                  |
