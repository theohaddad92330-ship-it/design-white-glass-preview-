# #4998 — phrase libre compilée : rapport (recette prod 02/11)

- Cause prouvée (sonde sur la phrase de la recette) : `unrecognizedFreetextZone` exigeait la zone EN FIN de phrase (`\s*$`) ; « en Zorglub-sur-Mer, freelance Java » ne la voyait donc pas (retour `null`). La taille « plus de 500 personnes » n'était lue nulle part, donc ni posée ni dite.
- Hypothèse (a) écartée : l'URL `?freetext=` alimente `filters.freetext` (`discover-prefill.ts:272,373`) ; `PreLaunchReading` (`Discover.tsx:2799`) lit ce champ, que la phrase vienne de la saisie ou de l'URL. Un seul appelant, deux chemins.
- Hypothèses (b)/(c) confirmées : la lecture n'avait ni taille ni zone suivie d'une virgule ; la zone inconnue n'était dite que si elle terminait la phrase.
- Correctif : `discover-needs-freetext.ts` — zone inconnue acceptée avant `,`/`;` (+ `\b` pour ne pas lire « entreprises » comme « en »+« treprises ») ; nouvelle `unreadSizePhrase` (« plus/moins de N personnes/salariés… »). `PreLaunchReading.tsx` dit « Non pris en compte : taille » (clé `reading.sizeUnread`, fr + en).
- Aucune valeur devinée : la taille n'est pas convertie en tranche, elle est DITE non lue et renvoie au filtre Taille.
- Tests (rouge → vert) : `discover-needs-freetext.test.ts`, `PreLaunchReading.test.tsx`, `SearchReadingNotice.test.tsx` — 65 verts.
- Démo (règle n°9) : non concernée, affichage pur d'un champ saisi ; aucune donnée à semer.
- Limites : la taille et l'expertise (« freelance Java ») ne sont pas compilées en filtres (tranche de taille posée à la main) ; seules la zone et la taille non lues sont dites. Pas de recette navigateur dans cette routine.
