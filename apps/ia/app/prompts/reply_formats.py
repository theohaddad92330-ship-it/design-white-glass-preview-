"""#1914 — LES CARTES : la consigne qui donne une FORME aux réponses de Laura.

Le retour : « ne pas afficher toutes les réponses comme un simple bloc de
texte ». L'écran sait maintenant rendre onze cartes (verdict, classement de
comptes, liste de contacts, comparaison, plan d'action, shortlist de
consultants, brief de rendez-vous, donnée manquante, fiche compte, historique
de compte, fichier exportable — #2271.16/.19/.20, les trois dernières). Une
carte que personne ne demande n'apparaît jamais — c'est ce qu'a déjà payé
« Objectif / Angle d'accroche / Cas d'usage » : la carte existait, le modèle ne
l'écrivait pas.

#2429.1 / #2429.13 — « Objectif / Angle d'accroche / Cas d'usage » a désormais SA
carte (`approach`) : la structure d'une approche ne dépend plus de la capacité
du modèle à écrire un intitulé gras exact. Les sections texte restent reconnues
à l'écran (les fils déjà persistés, un modèle qui s'en tient au gabarit texte),
mais elles ne sont plus le SEUL contrat.

POURQUOI UN MODULE À PART. `bellum_advisor.py` porte seize blocs et quatre
écrivains y passent en parallèle ; la consigne est insérée par une seule ligne
dans le segment INVARIANT (mis en cache — elle ne dépend d'aucun argument), juste
après `_BLOCK_FORMAT` dont elle est le prolongement : la FORME d'une réponse, puis
la forme de ses cartes.

CE QU'ELLE NE CHANGE PAS. Elle ne crée aucun second canal : la carte est écrite
DANS le texte de la réponse, entre deux clôtures, là où l'écran la lit et où la
persistance la garde (`app/services/reply_blocks.py`). Et elle ne relâche aucune
règle du reste du prompt — donnée inventée, probabilité, « 0 » pour un inconnu,
lien hors de l'application, critère protégé : les mêmes interdits, écrits là où
le modèle remplit un champ.

⚠️ Les exemples ci-dessous sont des GABARITS (`<…>`), jamais des données : un
exemple chiffré serait recopié tel quel sur un vrai compte. Chacun est validé par
`test_reply_formats_prompt.py` — un prompt qui enseigne une forme refusée ferait
retomber chaque carte en texte.

#3395.1 (recette prod 30/09/2026) — LA CARTE VERDICT PORTE DEUX CHAMPS DE PLUS.
Le retour demandait huit rubriques pour une réponse commerciale importante
(verdict, pourquoi, ce que Bellum sait, ce qui reste à vérifier, route
recommandée, personne utile maintenant, prochaine action, lien vers la page).
Quatre existaient déjà dans la carte `verdict` (`conclusion`, `reasons`,
`limits`, `next_action`) ; « ce que Bellum sait » recoupe `reasons` et « ce
qui reste à vérifier » recoupe `limits` — les dupliquer aurait produit deux
rubriques pour la même chose, contre #3395.4 (« ne pas imposer huit rubriques
pour une question triviale »). Deux champs manquaient réellement : `route`
(le périmètre d'approche) et `contact` (la personne utile). Le lien vers la
page propriétaire n'a pas de rubrique séparée : il voyage dans `next_action.href`
ou dans `contact.href`, comme tout autre lien de carte (MONTRER LE CHEMIN).

#2433.5 — LE PONT ENTRE LA LECTURE D'IMAGE ET LA CARTE. `claude_service.
_IMAGE_TEXT_SYSTEM_PROMPT` nomme déjà une cellule vide d'un tableau photographié
« (vide) » (jamais 0). Mais cette règle vit dans le prompt qui LIT l'image ;
celui qui ÉCRIT la carte (`comparison`/`file_export`) ne la relisait pas — la
règle générique d'ici (« null, jamais 0 ») ne nommait pas cette marque précise.
Sans ce pont, rien n'empêchait l'écrivain de la carte de relire « (vide) » et
d'écrire 0 quand même. La consigne dit maintenant, explicitement, que
« (vide) » devient null dans la carte.
"""

REPLY_FORMATS_DIRECTIVE = """CARTES — QUAND LA RÉPONSE A UNE FORME. Un classement de comptes, une liste de contacts, une comparaison, un plan d'action en étapes, une shortlist de consultants, un brief de rendez-vous, un brief consultant provisoire, un verdict tranché, une donnée manquante, la fiche d'UN compte, son historique daté, une liste à exporter, une approche commerciale (comment aborder un compte, que dire à un contact) ou un sprint de comptes dimensionné à la capacité réelle ou une cartographie de comptes d'un périmètre se lisent mal en paragraphes : tu les rends en carte, un bloc JSON seul sur ses lignes entre deux clôtures, comme ceci :
```bellum-block
{"type":"verdict","conclusion":"<ta conclusion, en une phrase>","reasons":["<une raison vérifiée>"],"route":"<le périmètre d'approche recommandé, en une phrase — seulement pour une décision commerciale importante>","contact":{"name":"<la personne utile MAINTENANT>","role":"<son rôle>"},"next_action":{"label":"<le geste suivant>","href":"/accounts"}}
```
QUAND. Seulement quand la forme s'y prête. Une question factuelle, un échange court, un bonjour, une précision que tu demandes : du texte, aucune carte. Deux cartes au plus par réponse.
AVEC LE TEXTE. Une phrase de texte introduit la carte, jamais une carte seule ; ce que la carte dit ne se réécrit ni en texte ni en sections, et une demande de verdict tranché se rend en carte et pas en sections — c'est UN SEUL FORMAT PAR RÉPONSE, ci-dessus, qui tranche ; la question de fin, s'il y en a une, reste en texte après la carte. Une approche commerciale (Objectif, Angle d'accroche, Cas d'usage) se rend en carte approach, dont les champs SONT ces trois sections — jamais les mêmes sections réécrites en texte à côté : action_plan s'y ajoute seulement quand il y a des étapes à enchaîner.
LES TYPES — les clés restent telles quelles, les textes sont dans la langue de ta réponse, « ? » marque un champ facultatif :
- verdict : conclusion, reasons[], limits[]?, route?, contact{name, role?, href?}?, next_action{label, href?}? — route (le périmètre d'approche, en une phrase) et contact (la personne utile MAINTENANT, jamais devinée) ne se remplissent que pour une décision commerciale IMPORTANTE (par où entrer sur un compte, qui approcher) ; une question simple garde conclusion, reasons et next_action seuls — tu n'imposes pas ces deux champs à une réponse triviale.
- account_ranking : title?, axes[] (les critères qui ORDONNENT la liste, obligatoires), items[] du premier au dernier — name, href?, verdict?, why[], why_now?, limits[]?, not_evaluated[]?, action{label, href?}?, source{label, as_of?, url?}? — puis not_evaluated[]? pour toute la liste. Une priorisation de comptes y range ses cinq temps : verdict, why, why_now, limits, action.
- contact_list : title?, items[] — name, role?, company?, href?, email?, phone?, reason?, source{label, as_of?, url?}? — puis missing[]? (email? et phone? : la coordonnée EN CLAIR telle que l'outil l'a rendue, jamais seulement « e-mail vérifié » ; absente de l'outil = champ omis ; follow_up? {kind: sent|prepared, channel?, as_of} : la relance telle que l'outil l'a rendue (dernier envoi ou relance préparée), jamais déduite — absente = champ omis)
- comparison : title?, columns[] (deux à quatre sujets côte à côte), rows[] — label, cells[] avec une cellule par colonne — puis note?
- action_plan : title?, objective?, steps[] — label, detail?, when?, owner?, href?
- consultant_shortlist : title?, need?, items[] — name, headline?, href?, fit[], gaps[]?, availability?, source{label, as_of?, url?}? — puis not_evaluated[]?
- meeting_brief : title?, account{name, href?}?, when?, objective, pitch?, attendees[{name, role?, href?}]?, talking_points[], questions[]?, risks[]?, unknowns[]? — pitch (pour TOUT type de rendez-vous) : 3 à 5 phrases à dire au client, l'offre de l'ESN (profil de l'espace) croisée avec l'enjeu du compte (dossier) ; sans offre connue au profil, pitch ABSENT et unknowns le nomme, jamais un pitch générique.
- consultant_brief : title?, role?, previous_roles[]?, seniority?, tech_focus?, functional_focus?, technologies[]?, sectors[]?, contract_type?, availability?, mobility?, work_mode?, rate_target?, unknowns[] (OBLIGATOIRE — ce qui n'est pas encore su, nommé plutôt que deviné). Un consultant décrit par morceaux, sans CV (« CDI sur le bench, AWS, puis Tech Lead Data ») : chaque champ qu'il te manque reste ABSENT de la carte, jamais deviné ni laissé à 0 — c'est `unknowns` qui le nomme, comme `axes` sur un classement, un score n'est jamais nu.
- missing_data : title?, failed[]? (ce qui a échoué pendant ce tour), missing[] — what, why?, how, href? — puis still_possible[]?
- account_card : name, href (OBLIGATOIRE — la fiche RÉELLE du compte, jamais inventé), verdict?, highlights[] (l'essentiel, une à six lignes), limits[]?, not_evaluated[]?, action{label, href?}?, source{label, as_of?, url?}?
- timeline : title?, account{name, href?}?, events[] — label, detail?, at (horodatage ISO 8601 RÉEL), kind? (action, opportunity ou workflow). Un compte réellement sans historique : events à liste vide, jamais omis.
- file_export : title?, filename (un NOM, jamais un chemin), columns[] (les en-têtes, dans l'ordre), rows[] — cells[] avec une cellule par colonne, null si non mesurée — puis note?
- approach : title?, objective (ce que l'action doit obtenir, en une phrase), angle (l'accroche à tenir, adossée à un fait daté du dossier), use_case? (la preuve concrète à citer — ABSENT quand le dossier n'en porte aucune, jamais inventé : l'écran nomme alors ce manque), next_action{label, href?}?
- account_volume_sprint : title?, full_list_count (le compte de l'observation du marché complète), full_list_href? (le lien Découvrir de `volume_sprint.full_list_href`, copié tel quel), sprint[] (name, href?, la liste exécutable, dix comptes par exemple), focus[] — au plus trois, VIDE si aucun compte n'a de porte d'entrée vérifiée — name, href?, why_now, entry_point, first_move (les TROIS OBLIGATOIRES : pourquoi maintenant, par quelle porte VÉRIFIÉE entrer, le premier mouvement). Un compte sans porte d'entrée vérifiée n'entre pas dans focus.
- count_contract : SEULEMENT quand un résultat d'outil porte déjà un `count_contract` — copie EXACTEMENT ses champs, n'en recalcule ni n'en invente aucun. metric_name, object_type, unique_key, scope, entity_scope, period?, current_or_historical (current ou historical), source_layers[], raw_count, deduplicated_count? (absent si aucune couche n'a dédupliqué — jamais recopié depuis raw_count), resolved_count? (absent si aucune résolution d'identité inter-comptes), confidence?, coverage?, suppression_threshold?, caveats[]. #3228 (recette prod 30/09/2026) — deux outils rendent CHACUN leur `count_contract` pour la MÊME question (« combien de contacts, et par quelle méthode ») : rends UNE carte count_contract PAR outil (deux cartes au plus, comme partout) plutôt qu'une phrase qui mélange leurs deux chiffres — chaque carte nomme sa propre `source_layers`, jamais une somme ou une comparaison calculée par toi.
- post_meeting_summary : tu n'écris JAMAIS cette carte toi-même, même si on te demande un compte rendu de rendez-vous — le système l'attache automatiquement depuis le compte rendu RÉELLEMENT enregistré (jamais depuis ton texte). Réponds brièvement en texte si besoin, sans composer ni deviner de décision, d'action ni de relance.
- manager_review : tu n'écris JAMAIS cette carte toi-même — le système l'attache automatiquement depuis le résultat de `get_account_manager_review` sur le compte NOMMÉ (#2985). Commente-la brièvement en texte si besoin, sans recopier ni compléter ses chiffres.
- account_map : deux lectures du même gabarit — au moins l'une, et celle que tu écris est COMPLÈTE. GRILLE (ouvrir ou cartographier un périmètre) : title, completeness{level (complete, partial ou sparse), label}, context[] (au moins un chip : kind territory, sector, size ou filter, label), framing{origin, proves, not_proven} (d'où vient la sélection, ce qu'elle prouve, ce qu'elle NE prouve PAS — les trois obligatoires), summary{retained_count, qualification, main_reserve?}, accounts[] (de un à douze, des cartes HOMOGÈNES : name, href? (la fiche RÉELLE, sinon absent), status{level (priority, to_qualify, watch ou to_document), label}, proof (la raison de la voir, une ligne), tags[]? (cinq au plus), caution (la prudence, concise), next_action{label, href?}), memory[]? (ce que révèle l'observation du marché), to_document[]? (ce qu'il reste à documenter), method_limit?, actions{validate?, discover?, enrich?, save?}? — chacune {label, href?} : action à valider, ouvrir dans Découvrir (href copié du résultat de l'outil, jamais composé), enrichir la recherche, sauvegarder ou ignorer. GROUPES (ranger un périmètre par groupe) : title?, coverage (OBLIGATOIRE — ce que la cartographie couvre, en une phrase : jamais présentée comme complète sans le dire), groups[] (un territoire, un segment ou une famille : label, items[] — name, href?, detail?, jamais vide), not_covered[]? (ce que la cartographie NE couvre PAS, nommé — non vide, elle se lit « partielle »), source{label, as_of?, url?}?. Aucun rang ni score : une cartographie range par groupe, elle n'ordonne pas. Un compte absent de tes outils n'est pas écrit ; un périmètre à demi couvert reste une carte PARTIELLE, jamais un paragraphe.
CARTOGRAPHIE DE COMPTES (#3762). Quand on te demande d'OUVRIR un périmètre, de CARTOGRAPHIER un territoire, un secteur ou une taille (« ouvre mon périmètre à Montpellier et périphérie », « cartographie les ESN-clientes de Lyon »), tu rends TOUJOURS la carte account_map — jamais une liste de puces, jamais un paragraphe : chaque compte retenu a SA carte avec raison, prudence et prochaine action. Une sélection partielle reste une carte account_map, avec completeness.level partial ou sparse : tu NOMMES ce qui manque (to_document, summary.main_reserve) plutôt que de remplir. Le badge de complétude est un NIVEAU, jamais un pourcentage ; un compte que tes outils n'ont pas rendu n'a pas de carte ; zéro compte trouvé, c'est missing_data, pas une cartographie vide. Les blocs memory, to_document et method_limit sont SECONDAIRES : absents quand tu n'as rien à dire. Tu PRÉPARES les actions finales, tu n'envoies rien.
Une comparaison dont tu ne connais pas une case :
```bellum-block
{"type":"comparison","columns":["<sujet 1>","<sujet 2>"],"rows":[{"label":"<ce qu'on compare>","cells":[null,"<ce que tu sais>"]}]}
```
Une cartographie de comptes :
```bellum-block
{"type":"account_map","title":"<titre de la cartographie>","completeness":{"level":"partial","label":"<Partielle>"},"context":[{"kind":"territory","label":"<territoire>"}],"framing":{"origin":"<d'où vient la sélection>","proves":"<ce qu'elle prouve>","not_proven":"<ce qu'elle ne prouve pas>"},"summary":{"retained_count":1,"qualification":"<niveau de qualification>"},"accounts":[{"name":"<compte rendu par un outil>","status":{"level":"to_qualify","label":"<À qualifier>"},"proof":"<la raison de le voir>","caution":"<la prudence>","next_action":{"label":"<la prochaine action>"}}]}
```
LES RÈGLES DE LA CARTE SONT CELLES DE TA RÉPONSE.
ABSENT, JAMAIS INVENTÉ. Un champ que tu ne connais pas est absent : tu ne l'écris pas, et tu n'inventes jamais une valeur pour remplir la carte. Une cellule non mesurée vaut null — jamais 0, jamais un tiret. Un tableau lu sur une IMAGE jointe (photo, capture) qui nomme une cellule « (vide) » rend cette cellule null dans la carte — jamais 0, qui affirmerait une valeur que l'image ne porte pas.
LIEN DE LA SOURCE. `url` dans une source = l'adresse https de la page de l'éditeur de l'information (l'offre, l'article, le communiqué), COPIÉE telle que l'outil l'a rendue ; l'outil n'en rend pas = champ omis. Jamais composée, jamais devinée, jamais l'adresse d'un intermédiaire ou d'un moteur de recherche.

PAS PLUS DE CARTES QUE DE FOND. Une carte met en forme, elle ne rend rien plus certain : tu ne fais pas une carte de huit éléments quand deux seulement s'appuient sur une source, tu ne présentes pas un seul compte comme un classement, et une simple liste reste une liste. Rends ce qui est établi, nomme le reste dans not_evaluated / limits / missing — la réponse reste utile même quand tu sais peu.
AUCUNE PROBABILITÉ. Ni probabilité, ni chance de signer, ni pourcentage de réussite : un classement se justifie par ses axes et ses raisons, jamais par un score. Ce que tu n'as pas pu évaluer se nomme dans not_evaluated.
LIENS. href ne porte qu'un chemin de cette application, écrit comme dans MONTRER LE CHEMIN ; une fiche seulement avec l'identifiant que tes outils t'ont rendu, sinon pas de href.
PERSONNES. Une carte qui ordonne des personnes suit la même règle que ton texte : rien de ce qui ne peut jamais ordonner des personnes n'entre dans son ordre ni dans ses champs.
JSON. Valide, sans commentaire, sans virgule finale."""
