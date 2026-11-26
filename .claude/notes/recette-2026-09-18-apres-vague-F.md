# Recette ÉCRAN du 18/09/2026 sur `cc90f0d76` — verdicts à reporter

⚠️ **Ce fichier n'est pas un registre** : il ne porte pas de lignes comptées, et
`coherence.py` ne le lit pas. Il existe parce que les registres concernés sont
**modifiés par des branches en vol** (vague G) : y écrire maintenant fabriquerait
des conflits d'intégration sur les lignes mêmes que ces branches réécrivent.
**À reporter dans les registres dès que la vague G a atterri**, puis supprimer ce
fichier.

Tout ce qui suit a été mesuré à l'écran, en production, sur `cc90f0d76`, en
lecture seule (aucun clic d'envoi, d'analyse ou d'enrichissement).

## Ce qui est prouvé — passe à `recetté`

| Point | Registre | Ce qui a été vu |
| --- | --- | --- |
| 2420.15 | `registre-2026-09-17-lau-134-2420.md` | `/missions` → « Refonte du portail fournisseurs — forfait » → onglet Conditions commerciales : les alertes sont NOMMÉES — « Coût chargé manquant », « Contact de facturation inconnu », « Marge non mesurée ». **Le constat du 17/09 au soir (« aucune alerte rendue ») est caduc.** |
| #2005.4 | `registre-2026-09-15-onboarding-audit-welcome.md` | `/settings/profile` → « Profil ESN (partagé) » : Ton ESN, Ton offre, Tes cibles, Politique de site, implantations (« Paris (siège) », « Lyon »). Et les absences **se disent** : « Rien n'est encore configuré ici — ce que tu vois plus bas est vide, pas un choix par défaut », « Effectif minimum sur site : aucun seuil ». Jamais un « 0 ». |
| #2005.5 | (idem) | `/settings/profile` → « Mes périmètres » : 3 BU — « Agence Lyon · 1 membre · Tu en fais partie », « BU Banque & Assurance · 1 membre · Tu en fais partie », « Équipe Nouvelles activités · **0 membre** » avec le bouton « **Rejoindre** ». Le semis des 3 périmètres, dont un volontairement sans membre, est exactement celui décrit par `demo-seed.service.spec.ts`. |

## Ce qui est réfuté — ne se referme pas sur une preuve de code

**2551.1** (`registre-2026-09-18-T-consultants.md`) — « Un compte compatible doit
être désigné par un ID vérifiable, pas par son seul nom ». Sur la fiche de Salomé
Dufour, onglets **Missions** et **Positionnements**, « NOVA LOGISTIQUE (client
d'exemple) » est rendu en `<p>` de texte brut — vérifié en JavaScript :
`href=null`, `role=null`, `cursor:auto`. Aucun lien vers `/accounts/<uuid>`.

⚠️ **Nuance d'honnêteté** : le livrable de 2551.1 est le champ `accountId` de
`matchNeedSchema`, et son écran est la section des **besoins/comptes compatibles**
(`InternalNeedsSection`), que cette recette **n'a pas atteinte** — elle a mesuré
deux autres onglets. Le verdict juste est donc : *la désignation par nom nu existe
bel et bien à l'écran, à deux endroits au moins*, et la section visée reste à
recetter. Dans les deux cas le point **ne passe pas** à `recetté`.
La branche en vol `feat/reverse-market-interlocuteurs-18-09` (2551.4) touche cette
zone : vérifier après son atterrissage si elle pose le lien.

## Ce qui n'a pas pu être atteint — et pourquoi ce n'est pas la même chose

### 1931.9 et 1931.18 : inatteignables **À DESSEIN**, ce n'est PAS un défaut

`/chat` affiche « Aucune conversation » dans la salle de démonstration, donc
aucune carte d'action refusée (1931.9) ni aucune carte portant un résultat
(1931.18) ne peut s'y observer.

⚠️ **C'est une décision écrite, pas un oubli.** `demo-coverage.ts:1211-1269`
classe `chat_messages` « vide à dessein » avec sa raison : semer un fil
montrerait « au visiteur des conversations qu'il n'a jamais eues — le défaut
exact que cette ligne refuse depuis le début ». Le fil du copilote commence
vide, le visiteur tape sa question, Laura répond pareil. **Ne pas semer.**
Ces deux points ne se recettent donc pas dans la salle : leur preuve est
unitaire, ou passe par un espace réel.

*(Correction : la première rédaction de cette note les appelait « défauts de
démo ». C'était faux — je n'avais pas lu la raison écrite dans
`demo-coverage.ts` avant de les classer.)*

### 2420.17 : inatteignable, et là c'est bien un manque

Le seuil de l'espace est à 20 % (`/settings/finance` : « Sous ce seuil, une
mission déclenche le diagnostic de marge basse de Laura »). Les **9 missions
« En cours » ont toutes une marge mesurée ≥ 30 % ou « non mesurée »** — aucune
sous le seuil. Le bloc « Le diagnostic de Laura » ne peut littéralement pas
s'afficher dans la salle.

Aucune ligne de `demo-coverage.ts` ne justifie cette absence (contrairement à
`chat_messages`) : c'est donc craft rule n°9 qui s'applique — *« un écran livré
mais vide en démo se découvre en réunion, pas en CI »*. Il manque **une mission
dont la marge mesurée passe sous le seuil de l'espace**, et elle doit rester
cohérente avec le reste de la salle (mêmes TJ, mêmes coûts chargés, la marge
tombe pour une raison lisible — pas un nombre posé à la main).
⚠️ Avant de la semer, relire `demo-coverage.ts:805-825` : les marges de cette
salle sont recomptées par `demo-mission-margin-engine.spec.ts`, et une mission
de plus peut déplacer des assertions calibrées.

## Défaut croisé en chemin — à instruire

Onglet « **Risque & opportunité** » d'une mission **sans relevé d'activité** : les
sous-scores « Relevés d'activité » et « Paiement » s'affichent à « **0** » alors
que la donnée source est **absente**.

C'est la forme exacte de ce que les gardes **GA-18 / GA-19** interdisent : « non
mesuré » n'est jamais « 0 », et un axe non évaluable **sort du dénominateur**.
À instruire avant d'accuser : il se peut que ce 0 soit un score légitimement
**calculé** (zéro relevé fourni = zéro point sur cet axe, ce qui est une mesure,
pas une absence). La question qui tranche : **le dénominateur du score global
compte-t-il ces deux axes ?** S'il les compte, c'est un défaut ; s'il les exclut
et que seul l'affichage montre « 0 », c'est l'affichage qui ment.
