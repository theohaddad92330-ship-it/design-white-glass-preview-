# Lot 700 — #4928 garde d'employeur sur la recherche Apollo par nom

Périmètre : apps/ia/app/services/search_hit_employer.py, apps/ia/app/services/apollo.py, apps/ia/app/models/contacts.py, apps/ia/app/routers/phase2_contacts.py, apps/ia/tests/\*, agent_docs/pipeline.md

Livré : #4928.1 (garde pur, toutes les passes : un seul point après fusion des passes), #4928.2 (entité et fonction de l'expérience en cours chez le compte), #4928.6 (tests Boulanger/Boulangerie, Still/Stillfront, Orange/Orange Bleue).
Garde #4465 (pick_current_position inchangé). Aucune surface d'accès touchée.
Non livré, nommé : #4928.3 (aucune passe web par rôle dans apps/ia à ce jour), #4928.4 (rattrapage/archivage : côté API + rejeu #4923.15), #4928.5 (UI Contacts + archivage) — lots API/web distincts.
Garde #4665 (fixture du test d'ancre : seul le nom d'organisation du préchargement change, le garde d'employeur écartait un préchargement d'un autre employeur).
Garde #1100 #1101 #1102 #1104 #1107 #1108 #1109 #1112 (test d'ancre UNEO, `test_phase2_contacts.py:1082` : l'assertion — les trois du préchargement ET la personne que seule l'ancre ramène — reste intacte ; seul le nom d'organisation du préchargement passe de SNCF à Unéo).
