"""#3707 / #3760 / #3762 / #3767 / #3771 / #3764 / #3759 (lot L1 07/10) — LA PORTE DE FORME.

Recette prod du 07/10 (commit 7491be8e31) : « comptes Java dans la banque », « cartographie complète…
Montpellier », « Priorise mes comptes de la semaine », « Classe-moi huit comptes » sortaient TOUS en texte.

DIAGNOSTIC — un tour suivi de bout en bout :
  intention (``routers/chat.py`` → ``classify_reply_family``) → consigne de carte posée à côté de la demande
  → modèle + outils (``run_chat_with_tools`` → ``_execute_one_tool``) → texte du modèle
  → ``normalize_reply_blocks`` → ``reply_family_outcome`` → ``context.reply_family`` → écran (``ReplyFamilyRetry``).
  Le serveur ne BÂTISSAIT une carte depuis la sortie d'un outil que pour deux formes (verdict #3395, contacts
  #3229). Pour les quatre formes du lot, la carte dépendait du seul modèle ; quand il écrivait du texte, rien ne
  la rendait. Le maillon cassé, forme par forme :
    * ENTREPRISES (#3707) — ``run_account_search`` rend ses ``items`` et ses ``axes`` (R2 les fait bien arriver),
      sa description dit « carte ``account_ranking`` »… et aucun code ne la bâtit : le modèle écrit
      « 8 acteurs financiers », 0 carte.
    * CARTOGRAPHIE (#3760 / #3762) — la famille ``account_map`` est RECONNUE et sa consigne posée, mais
      ``reply_family_outcome`` ne fait que MESURER le repli (``text_fallback`` → bandeau « Refaire en carte ») :
      le routage s'arrêtait à la mesure.
    * PRIORISATION (#3767) — aucune famille ne reconnaissait « priorise » ; ``get_portfolio_priorities`` rend
      ses catégories, aucun code n'en fait une carte → 19 puces.
    * CLASSEMENT (#3771) — aucune famille pour « classe-moi » ; même outils, même absence de carte, donc la
      note « Ce que cette réponse n'établit pas » (qui lit les CARTES) n'avait rien à lire.

LA PORTE — UNE seule, pour toutes les formes connues (``route_known_shapes``, appelée à UN endroit :
``chat_orchestrator.run_chat_with_tools``) :
  * l'outil qui rend des objets d'une forme connue dépose ici sa LECTURE (``shape_read_from_tool`` — la carte
    bâtie de SES lignes, jamais un second calcul, jamais un champ inventé : un champ que l'outil n'a pas rendu
    reste absent) ;
  * à la fin du tour, si la réponse ne porte AUCUNE carte qui satisfait la forme attendue (famille de la demande,
    sinon la forme de l'outil), la carte PART, et le texte du modèle n'est plus qu'un chapeau : ses puces qui
    répètent un objet de la carte sont retirées (rien n'apparaît deux fois sous la même forme, GA-26) ;
  * si la demande relève d'une forme connue et que l'outil a répondu SANS objet, l'absence se NOMME (carte
    ``missing_data``) — jamais une carte vide, jamais une donnée inventée. Un outil en ERREUR ne produit rien
    ici : l'erreur se dit dans le texte, elle ne se maquille pas en liste vide bien présentée (#3707) ;
  * les replis verdict (#3395) et contacts (#3229) passent par la MÊME porte (``_LEGACY``), avec leurs règles
    propres (complétion d'une carte trop courte).

Doctrine : aucune probabilité, aucun score affiché (le rang est ordonné par des AXES nommés), nos fournisseurs
ne sont jamais nommés (« registre public des entreprises » est la source telle que l'outil la décrit), le niveau
d'un compte (#3764 : Prioritaire / À surveiller / À qualifier) vient de la catégorie que la règle du portefeuille
a rendue, jamais deviné.

#3759 (BEL-LAU-1002, lot S03 07/10) — cette porte EST le contrat de sortie structuré demandé par #3759 : un
schéma commun par forme (``app.models.reply_blocks.ReplyBlock``, miroir de ``reply-blocks.ts``), posé à un seul
endroit (``route_known_shapes``, ici), tolérant au partiel (une carte invalide retombe en texte, jamais une
réponse cassée), étendu sans rupture (une nouvelle forme s'ajoute à l'union discriminée). Le second schéma
générique ouvert pour #3759 (``packages/contracts/src/schemas/laura-response.ts`` : ``response_type`` /
``sections[]`` / ``schema_version``) n'avait AUCUN appelant (`git grep` sur ``parseLauraResponse`` /
``lauraResponseSchema`` : zéro résultat hors son propre test) — un second contrat de forme concurrent de celui-ci,
exactement ce que GA-26 interdit (« un réglage vit à un seul endroit »). Retiré plutôt que câblé : câbler un
schéma générique PAR-DESSUS cette porte aurait dédoublé la même décision (quelle carte pour quelle réponse) dans
deux endroits qui auraient fini par diverger.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from app.models.reply_blocks import validate_reply_block
from app.services.contact_card_fallback import with_contact_card
from app.services.reply_blocks import REPLY_BLOCK_FENCE, as_one_verdict_card, split_reply_blocks
from app.services.reply_family import classify_reply_family, reply_family_cards
from app.services.verdict_card_fallback import with_verdict_card
from app.services.work_progress_tool import with_progress_card

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")
_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")
_RANKING_MAX = 20
#: #4421.3 — un bouton « Préparer le mail » par contact à joindre (dix au plus par compte, comme l'outil).
_FOLLOW_UPS_MAX = 10
_MAP_GROUPS_MAX = 8
_COUNTRY_SUFFIXES = {"france", "fr"}


def _headquarters_city(headquarters: object) -> str | None:
    """#3769.7 — la VILLE du siège, jamais l'adresse complète. Miroir de
    ``headquartersCity`` (``apps/web/.../account-detail/tabs/synthesis/accountSynthesis.ts``) :
    `accounts.headquarters` porte deux formes en base, l'adresse complète
    (« 29 boulevard Haussmann, 75009 Paris ») ou la ville seule — jamais devinée,
    `None` quand rien n'est lisible."""
    parts = [p.strip() for p in str(headquarters or "").split(",") if p.strip()]
    while len(parts) > 1 and parts[-1].lower() in _COUNTRY_SUFFIXES:
        parts.pop()
    if not parts:
        return None
    city = re.sub(r"^\d{4,5}\s+", "", parts[-1]).strip()
    return city if city and not city.isdigit() else None

#: Les libellés que la porte écrit elle-même — FR et EN, un seul endroit.
_LABELS: dict[str, dict[str, str]] = {
    "fr": {
        # #4287.4 — « Ce qui manque » vide se DIT, jamais « 0 », jamais une section qui disparaît.
        "nothing_missing": "Aucun manque signalé par Laura sur ce compte.",
        "registry": "Registre public des entreprises",
        "registry_fact": "Rendu par le registre public des entreprises sur les critères de la recherche.",
        "headcount": "{n} salariés",
        "tech_not_applied": "Technologies demandées non vérifiées par le registre : {tech}.",
        "out_of_scope": "{n} entreprises hors des critères demandés ne sont pas listées ici.",
        "city_gap": "{n} comptes listés ont leur siège hors de {city} : le filtre porte sur le siège enregistré.",
        "map_title": "Cartographie des comptes",
        "map_coverage": "{n} comptes rendus par le registre public des entreprises, sur : {axes}.",
        "map_other_activity": "Activité non renseignée",
        "map_hq": "La zone filtre sur le siège enregistré : autres sites, équipes locales et périmètres de mission ne sont pas mesurés.",
        "map_need": "Les besoins actuels de ces comptes ne sont pas établis par cette sélection.",
        "priorities_title": "Priorités du portefeuille",
        "priorities_axis": "Catégorie de la règle du portefeuille",
        "priorities_why": "Classé « {bucket} » par la règle du portefeuille.",
        "priorities_headquarters": "Siège : {headquarters}.",
        # LUDOVIC-D LC.6 — « avec qui appeler » : le signal daté et les personnes, sur la ligne.
        "call_signal": "Signal daté : {label} ({date}).",
        "people_to_call": "À appeler : {people}.",
        "people_to_find": "Personne connue : à trouver — « Trouver qui appeler ».",
        "offer_targeted": "Offre visée : {offer}",
        "access_class_line": "Classe d'accès {klass} — {label}",
        "access_shown_count": "{total} comptes trouvés ; les {shown} plus accessibles ci-dessous : {counts}.",
        "priorities_long_bet": "Pari long déclaré.",
        "priorities_interlocutor": "Interlocuteur : {name}, {role} ({scope}).",
        "priorities_interlocutor_none": "Interlocuteur : à identifier.",
        # #4054.1 — contacts déjà connus, provenance import, éléments manquants (faits lus, jamais déduits).
        "priorities_from_import": "Compte importé de votre base.",
        "priorities_known_contacts": "Contacts connus : {names}.",
        "priorities_missing": "Manque : {items}.",
        "priorities_missing_analysis": "analyse du compte",
        "priorities_missing_contact": "aucun contact connu",
        "priorities_missing_headquarters": "siège non renseigné",
        "match_group_known": "Groupe dont vous connaissez déjà une filiale : {name}.",
        "match_to_verify": "Rapprochement à vérifier : proche de {name} dans votre base.",
        # #4055.1 — même fait que `already_in_workspace` (carte `account_ranking`), repris ici
        # pour la carte « Cartographie » (groupes) sous forme de phrase, faute de badge dédié.
        "map_already_known": "Déjà dans ta base.",
        "priorities_role_unset": "rôle non renseigné",
        "priorities_scope_unset": "périmètre à établir",
        "bucket_now": "maintenant",
        "bucket_to_verify": "à vérifier",
        "bucket_to_watch": "à surveiller",
        "bucket_to_qualify": "à qualifier",
        "bucket_not_now": "pas maintenant",
        "not_now": "{n} comptes classés « pas maintenant » ne sont pas listés ici.",
        "priorities_zone": "Zone : {zone}",
        "priorities_unlocated": "Siège non renseigné, donc non rattaché à la zone : {names}.",
        "empty_title": "Aucun objet rendu",
        "empty_what": "{what} : la recherche a répondu sans aucun résultat.",
        # #4631 — des comptes ont été lus mais AUCUN n'a pu être mis en carte : le nombre cité plus haut ne vaut pas liste.
        "empty_unlisted": "{what} : {n} lus, aucun n'a pu être mis en carte — le nombre cité dans le texte n'est pas une liste affichée.",
        "empty_how": "Élargis les critères (zone, secteur, taille), ou précise ce que tu cherches.",
        # #4287.5 — un résultat vide propose AUSSI ses actions suivantes (même grammaire que les résultats pleins).
        "empty_next": "Élargir à la région ou au département voisin|Retirer le secteur ou la taille|Lancer la recherche dans Découvrir",
        "unbuilt_title": "Carte non construite",
        "unbuilt_what": "{what} : la recherche n'a rendu aucun résultat exploitable dans ce tour (non mesuré).",
        "unbuilt_how": "Relance la même demande : la carte se construit sur les comptes réellement rendus.",
        # #4462.6 — le vide vient de l'ABSENCE des comptes dans l'espace : relancer rendrait le même vide.
        "unbuilt_how_absent": "Ces comptes ne sont pas encore dans ton espace : demande-moi de les analyser, la "
        "carte se construit sur leurs dossiers.",
        # #4705 — les comptes SONT dans l'espace (la recherche par nom vient de les rendre) : la carte seule manque.
        "unbuilt_how_present": "Ces comptes sont bien dans ton espace : la carte n'a pas pu être construite à ce tour. "
        "Redemande-la, elle se construit sur leurs dossiers.",
        "unbuilt_how_launched": "Leurs analyses sont lancées : la carte se construit au retour des analyses, sur "
        "les comptes réellement rendus.",
        "what_accounts": "Comptes correspondant à la demande",
        "what_priorities": "Comptes à prioriser dans le portefeuille",
        "talent_title": "Comptes où placer {name}",
        "talent_axes": "Compétences de la fiche demandées sur la zone|Offres publiées par l'entreprise sur la zone",
        "talent_source": "Veille territoriale (offres publiques)",
        "what_talent_accounts": "Comptes où placer ce profil",
        # #3247.r41 — alternatives à un groupe : la carte bâtie des alternatives mesurées par l'outil.
        "alt_title": "Alternatives à {name}",
        "alt_title_plain": "Alternatives plus accessibles",
        "alt_axis": "Fait qui rend le compte plus accessible",
        "alt_set_aside": "Écartés — partenaires déclarés de l'espace, pas des cibles : {names}.",
        "alt_signal": "Signal actuel : {signal}",
        "alt_path": "Chemin d'accès : {path}",
        "what_alternatives": "Alternatives plus accessibles",
        "shared_reserve": "{reserve} (non évaluée pour : {names})",
        "follow_analysis": "Lancer l'analyse",
        "follow_analysis_ask": "Lance l'analyse du compte {account} pour y placer {name}.",
        "follow_contacts": "Voir les contacts",
        "follow_contacts_ask": "Montre-moi à qui m'adresser chez {account} pour placer {name}.",
        "follow_message": "Préparer le message",
        "follow_message_ask": "Prépare un message pour proposer {name} chez {account} — je l'enverrai moi-même.",
        # #4421.3 — par compte : ses besoins relevés, ses contacts à joindre, et le mail à préparer pour chacun.
        "talent_needs": "Besoins relevés : {needs}.",
        "talent_contacts": "À joindre : {contacts}.",
        "talent_no_contact": "Aucun contact connu — lancer l'analyse.",
        "talent_not_in_space": "Pas encore dans ton espace — aucun contact collecté, lancer l'analyse.",
        # #4421.10 — un compte hors espace : les personnes trouvées dans le tour, à vérifier, et le mail préparé.
        "talent_found_outside": "Trouvés hors de ton espace, à vérifier : {contacts}.",
        "talent_prepared_mail": "Mail préparé pour {contact} — à relire, c'est toi qui l'envoies.",
        "talent_people_no_space": "Recherche de personnes non lancée : espace de travail actif introuvable — les contacts arrivent avec l'analyse.",
        "talent_people_capped": "Recherche de personnes du jour déjà faite pour ton espace — les contacts arrivent avec l'analyse.",
        "talent_unread": "Contacts non lus à l'instant — redemande-les.",
        # #4631 — ce que la carte n'a pas pu porter se DIT, avec son nombre (jamais un compte annoncé sans ligne).
        "talent_dropped_one": "{n} compte lu n'est pas listé : sa fiche n'a pas pu être mise en carte.",
        "talent_dropped_other": "{n} comptes lus ne sont pas listés : leurs fiches n'ont pas pu être mises en carte.",
        "follow_mail": "Préparer le mail à {contact}",
        # R22-LG (#4421.2) — un compte du marché qui recrute (offre datée) : le mail au recruteur, préparé.
        "market_offer": "Recrute : {title} (offre du {date})",
        "follow_market_mail": "Préparer le mail",
        # #4432.2 — l'ouverture d'un compte hors de l'espace : l'écran d'analyse, zone présélectionnée.
        "open_search": "Analyser ce compte",
        "follow_market_mail_ask": "Prépare un mail au recruteur de {account} pour l'offre « {title} » du {date} — je l'enverrai moi-même.",
        "follow_market_contact_mail_ask": "Prépare un mail à {contact} (contact {contact_id}) chez {account} pour l'offre « {title} » du {date} — je l'enverrai moi-même.",
        "follow_market_contact_mail_ask_no_offer": "Prépare un mail à {contact} (contact {contact_id}) chez {account} — je l'enverrai moi-même.",
        "follow_mail_ask": "Prépare un mail à {contact} (contact {contact_id}) chez {account} pour proposer {name} — je l'enverrai moi-même.",
        "what_meeting_recap": "Compte rendu du rendez-vous",
        # #3866.1 (BEL-LAU-1008-015, recette prod 08/10, 2e passe) — un compte
        # classé « Prioritaire » sur un tour d'horizon purement démographique
        # (secteur, zone, effectif) est rabaissé : le critère métier demandé
        # n'a jamais été vérifié.
        "fit_unverified_capped": "{n} compte(s) rabaissé(s) : aucun élément métier vérifié (secteur/zone/effectif seuls ne suffisent pas).",
    },
    "en": {
        "nothing_missing": "No gap flagged by Laura on this account.",
        "registry": "Public company register",
        "registry_fact": "Returned by the public company register for the search criteria.",
        "headcount": "{n} employees",
        "tech_not_applied": "Requested technologies not checked by the register: {tech}.",
        "out_of_scope": "{n} companies outside the requested criteria are not listed here.",
        "city_gap": "{n} listed accounts have their head office outside {city}: the filter applies to the registered head office.",
        "map_title": "Account map",
        "map_coverage": "{n} accounts returned by the public company register, on: {axes}.",
        "map_other_activity": "Activity not stated",
        "map_hq": "The area filters on the registered head office: other sites, local teams and delivery scope are not measured.",
        "map_need": "The current needs of these accounts are not established by this selection.",
        "priorities_title": "Portfolio priorities",
        "priorities_axis": "Category from the portfolio rule",
        "priorities_why": "Ranked « {bucket} » by the portfolio rule.",
        "priorities_headquarters": "Head office: {headquarters}.",
        "call_signal": "Dated signal: {label} ({date}).",
        "people_to_call": "To call: {people}.",
        "people_to_find": "No known person yet — “Find who to call”.",
        "offer_targeted": "Target offer: {offer}",
        "access_class_line": "Access class {klass} — {label}",
        "access_shown_count": "{total} accounts found; the {shown} most accessible below: {counts}.",
        "priorities_long_bet": "Declared long bet.",
        "priorities_interlocutor": "Interlocutor: {name}, {role} ({scope}).",
        "priorities_interlocutor_none": "Interlocutor: to be identified.",
        "priorities_from_import": "Account imported from your database.",
        "priorities_known_contacts": "Known contacts: {names}.",
        "priorities_missing": "Missing: {items}.",
        "priorities_missing_analysis": "account analysis",
        "priorities_missing_contact": "no known contact",
        "priorities_missing_headquarters": "head office not on file",
        "match_group_known": "Group with a subsidiary you already know: {name}.",
        "match_to_verify": "Match to verify: close to {name} in your database.",
        "map_already_known": "Already in your base.",
        "priorities_role_unset": "role not provided",
        "priorities_scope_unset": "scope to be established",
        "bucket_now": "now",
        "bucket_to_verify": "to verify",
        "bucket_to_watch": "to watch",
        "bucket_to_qualify": "to qualify",
        "bucket_not_now": "not now",
        "not_now": "{n} accounts ranked « not now » are not listed here.",
        "priorities_zone": "Area: {zone}",
        "priorities_unlocated": "Headquarters not on file, so not placed in the area: {names}.",
        "empty_title": "Nothing returned",
        "empty_what": "{what}: the search answered with no result.",
        "empty_unlisted": "{what}: {n} read, none could be put on a card — the number quoted in the text is not a displayed list.",
        "empty_how": "Widen the criteria (area, sector, size), or say more precisely what you are looking for.",
        "empty_next": "Widen to the region or a neighbouring department|Drop the sector or the size|Run the search in Discover",
        "unbuilt_title": "Card not built",
        "unbuilt_what": "{what}: the search returned nothing usable in this turn (not measured).",
        "unbuilt_how": "Ask again: the card is built on the accounts actually returned.",
        "unbuilt_how_absent": "These accounts are not in your workspace yet: ask me to analyse them, the card is "
        "built on their files.",
        "unbuilt_how_present": "These accounts are in your workspace: the card could not be built this turn. Ask "
        "again, it is built on their files.",
        "unbuilt_how_launched": "Their analyses are running: the card is built when they come back, on the accounts "
        "actually returned.",
        "what_accounts": "Accounts matching the request",
        "what_priorities": "Accounts to prioritise in the portfolio",
        "talent_title": "Accounts to place {name}",
        "talent_axes": "Profile skills in demand in the area|Offers published by the company in the area",
        "talent_source": "Territorial watch (public job offers)",
        "what_talent_accounts": "Accounts to place this profile",
        "alt_title": "Alternatives to {name}",
        "alt_title_plain": "Easier-to-reach alternatives",
        "alt_axis": "Fact that makes the account easier to reach",
        "alt_set_aside": "Set aside — declared partners of the workspace, not targets: {names}.",
        "alt_signal": "Current signal: {signal}",
        "alt_path": "Access path: {path}",
        "what_alternatives": "Easier-to-reach alternatives",
        "shared_reserve": "{reserve} (not evaluated for: {names})",
        "follow_analysis": "Run the analysis",
        "follow_analysis_ask": "Run the analysis of {account} to place {name} there.",
        "follow_contacts": "See the contacts",
        "follow_contacts_ask": "Show me who to reach at {account} to place {name}.",
        "follow_message": "Prepare the message",
        "follow_message_ask": "Prepare a message proposing {name} at {account} — I will send it myself.",
        "talent_needs": "Needs spotted: {needs}.",
        "talent_contacts": "Who to reach: {contacts}.",
        "talent_no_contact": "No known contact — run the analysis.",
        "talent_not_in_space": "Not in your workspace yet — no contact collected, run the analysis.",
        "talent_found_outside": "Found outside your workspace, to verify: {contacts}.",
        "talent_prepared_mail": "Email drafted for {contact} — review it, you send it.",
        "talent_people_no_space": "People search not run: no active workspace found — contacts come with the analysis.",
        "talent_people_capped": "Today's people searches for your workspace are used up — contacts come with the analysis.",
        "talent_unread": "Contacts not read just now — ask again.",
        "talent_dropped_one": "{n} account read is not listed: its record could not be put on the card.",
        "talent_dropped_other": "{n} accounts read are not listed: their records could not be put on the card.",
        "follow_mail": "Prepare the email to {contact}",
        "market_offer": "Hiring: {title} (posted {date})",
        "follow_market_mail": "Prepare the email",
        "open_search": "Analyse this account",
        "follow_market_mail_ask": "Prepare an email to the recruiter at {account} about the « {title} » offer posted {date} — I will send it myself.",
        "follow_market_contact_mail_ask": "Prepare an email to {contact} (contact {contact_id}) at {account} about the « {title} » offer posted {date} — I will send it myself.",
        "follow_market_contact_mail_ask_no_offer": "Prepare an email to {contact} (contact {contact_id}) at {account} — I will send it myself.",
        "follow_mail_ask": "Prepare an email to {contact} (contact {contact_id}) at {account} proposing {name} — I will send it myself.",
        "what_meeting_recap": "Meeting recap",
        "fit_unverified_capped": "{n} account(s) downgraded: no business signal verified (sector/area/headcount alone are not enough).",
    },
}


def _labels(language: str | None) -> dict[str, str]:
    return _LABELS["en"] if (language or "").lower().startswith("en") else _LABELS["fr"]


def _readable(value: object) -> str:
    """#3247.3 (18/10) — jamais le ``repr`` Python d'une liste ou d'un dict dans un texte rendu : une liste se
    joint (doublons retirés), un dict se lit par son libellé, faute de quoi il ne dit rien."""
    if isinstance(value, Mapping):
        for key in ("label", "title", "text", "summary", "name"):
            if isinstance(value.get(key), str) and value[key].strip():
                return value[key]
        return ""
    if isinstance(value, (list, tuple, set)):
        return " ; ".join(dict.fromkeys(t for v in value if (t := _readable(v).strip())))
    return str(value or "")


def _clean(value: object, limit: int) -> str | None:
    text = " ".join(_readable(value).split())
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _account_href(value: object) -> str | None:
    text = str(value or "").strip()
    return f"/accounts/{text.lower()}" if _UUID.match(text) else None


def _texts(values: object, limit: int, count: int) -> list[str]:
    out = [t for v in values if (t := _clean(v, limit))] if isinstance(values, list) else []
    return out[:count]


# ── Les lectures, une par outil — ce que l'outil a RENDU, mis en forme ─────────────────────


def _search_items(output: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    items = output.get("items")
    return [i for i in items if isinstance(i, Mapping) and _clean(i.get("name"), 120)] if isinstance(items, list) else []


def _search_fact(item: Mapping[str, Any], labels: dict[str, str]) -> str | None:
    parts = [_clean(item.get("activity"), 120), _clean(item.get("city"), 80)]
    headcount = item.get("headcount")
    if isinstance(headcount, int) and not isinstance(headcount, bool) and headcount > 0:
        parts.append(labels["headcount"].format(n=headcount))
    fact = " · ".join(p for p in parts if p)
    return fact or None


def _search_limits(output: Mapping[str, Any], labels: dict[str, str]) -> list[str]:
    limits: list[str] = []
    tech = _texts(output.get("technologies_not_applied"), 40, 6)
    if tech:
        limits.append(labels["tech_not_applied"].format(tech=", ".join(tech)))
    out_of_scope = output.get("out_of_scope_count")
    if isinstance(out_of_scope, int) and not isinstance(out_of_scope, bool) and out_of_scope > 0:
        limits.append(labels["out_of_scope"].format(n=out_of_scope))
    gap = _city_gap(output)
    if gap:
        limits.append(labels["city_gap"].format(n=gap[0], city=gap[1]))
    return limits


def _fold_city(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").casefold()
    return re.sub(r"[\s\-']+", " ", text).strip()


def _city_gap(output: Mapping[str, Any]) -> tuple[int, str] | None:
    """#3769.3 (lot Q02) — le filtre « Ville : X » porte sur le siège enregistré ; des comptes rendus
    dont le siège est ailleurs (Paris, Issy) se COMPTENT et se nomment, jamais listés en silence.
    Un siège sans ville n'est ni dedans ni dehors : jamais compté."""
    axes = output.get("axes")
    city = next((a[len("Ville :"):].strip() for a in axes or [] if isinstance(a, str) and a.startswith("Ville :")), "")
    wanted = _fold_city(city)
    if not wanted:
        return None
    outside = 0
    for item in _search_items(output):
        found = _fold_city(item.get("city"))
        if found and found != wanted and not found.startswith(wanted + " "):
            outside += 1
    return (outside, city) if outside else None


def _offer_of_output(output: Mapping[str, Any]) -> str:
    """#3866 — l'offre déclarée de la recherche, telle que l'outil l'a échoée dans ses critères."""
    criteria = output.get("criteria")
    return (_clean(criteria.get("offer"), 80) or "") if isinstance(criteria, Mapping) else ""


def _rows_with_offer(rows: Sequence[Any], offer: str, labels: dict[str, str]) -> list[Any]:
    """#3866 (recette prod 13/10) — la ligne « Offre visée : <offre> » sur chaque compte quand une offre
    est déclarée ; jamais doublée, jamais sans offre. ``why`` plafonne à 5 : la ligne garde sa place."""
    if not offer:
        return list(rows)
    line = labels["offer_targeted"].format(offer=offer)
    out: list[Any] = []
    for row in rows:
        why = row.get("why") if isinstance(row, Mapping) else None
        if not isinstance(why, list) or line in why:
            out.append(row)
        else:
            out.append({**row, "why": [*why[:4], line]})
    return out


def _call_lines(item: Mapping[str, Any], labels: dict[str, str]) -> list[str]:
    """LUDOVIC-D LC.6 — le signal daté (intitulé + date) et les personnes CONNUES posés par
    `laura_call_ranking.attach_call_facts`, en tête de ligne ; sans personne, « à trouver ». Rien
    n'est écrit pour une ligne que l'outil n'a pas enrichie (byte-identique)."""
    lines: list[str] = []
    signal = item.get("call_signal")
    if isinstance(signal, Mapping) and _clean(signal.get("label"), 200) and _clean(signal.get("date"), 20):
        lines.append(
            labels["call_signal"].format(label=_clean(signal.get("label"), 200), date=_clean(signal.get("date"), 20))
        )
    # #4421.3 — coordonnées pro EN CLAIR (c87) à côté du nom, quand l'outil les a rendues.
    people = [
        " — ".join(
            p
            for p in (
                _clean(person.get("name"), 80),
                _clean(person.get("title"), 80),
                _clean(person.get("email"), 120),
                _clean(person.get("phone"), 40),
            )
            if p
        )
        for person in item.get("people_to_call") or []
        if isinstance(person, Mapping) and _clean(person.get("name"), 80)
    ]
    if people:
        lines.append(labels["people_to_call"].format(people=", ".join(people[:3])))
    elif item.get("people_note"):
        lines.append(labels["people_to_find"])
    return lines


def _search_zone(output: Mapping[str, Any]) -> dict[str, Any] | None:
    """#4432.3 — la zone de la recherche, en LIBELLÉS (« Haute-Garonne », « Occitanie »), pour qu'elle
    voyage avec le nom quand un compte part en analyse. Un code inconnu ne se nomme pas."""
    from app.services.discover_request_reading import region_label
    from app.services.geo_labels import department_name

    criteria = output.get("criteria")
    if not isinstance(criteria, Mapping):
        return None
    zone: dict[str, Any] = {}
    if city := _clean(criteria.get("city"), 120):
        zone["city"] = city
    raw_departments = str(criteria.get("department") or "").split(",")
    if departments := [name for code in raw_departments if (name := department_name(code))]:
        zone["departments"] = departments[:20]
    raw_regions = criteria.get("region")
    codes = raw_regions if isinstance(raw_regions, list) else [raw_regions] if raw_regions else []
    if regions := [name for code in codes if (name := region_label(str(code)))]:
        zone["regions"] = regions[:18]
    return zone or None


def _open_search_href(name: str, zone: Mapping[str, Any] | None) -> str:
    """#4432.2 — ``/search?company=…&zone=…`` : la zone de la recherche (ville, sinon département, sinon région)
    devient le périmètre présélectionné de l'écran d'analyse. Sans zone, le nom seul."""
    from urllib.parse import urlencode

    zone = zone or {}
    place = zone.get("city") or next(iter(zone.get("departments") or []), "") or next(iter(zone.get("regions") or []), "")
    return "/search?" + urlencode({"company": name, **({"zone": place} if place else {})})


def _dated_hiring_demand(item: Mapping[str, Any]) -> tuple[str, str] | None:
    """R22-LG — (intitulé, date) de la première offre d'emploi DATÉE relevée sur le compte, ou ``None``."""
    for demand in item.get("current_demands") or ():
        if not isinstance(demand, Mapping) or demand.get("type") != "hiring":
            continue
        title = _clean(demand.get("label"), 120)
        date = str(demand.get("date") or "").strip()
        if title and _ISO_DATE.match(date):
            return title, date[:10]
    return None


def _market_contact_follow_ups(
    account: str, item: Mapping[str, Any], offer: tuple[str, str] | None, labels: dict[str, str]
) -> list[dict[str, str]]:
    """#4421.3 — un bouton « Préparer le mail à <nom> » par contact IDENTIFIÉ du compte (``contact_id``), dix au plus,
    préparé par Laura et jamais envoyé. Sans identifiant, aucun : un geste sans objet ne se pose pas."""
    out: list[dict[str, str]] = []
    for person in item.get("people_to_call") or ():
        if not isinstance(person, Mapping):
            continue
        contact = _clean(person.get("name"), 80)
        contact_id = str(person.get("contact_id") or "").strip()
        if not contact or not contact_id:
            continue
        values = {"account": account, "contact": contact, "contact_id": contact_id}
        key = "follow_market_contact_mail_ask" if offer else "follow_market_contact_mail_ask_no_offer"
        if offer:
            values = {**values, "title": offer[0], "date": offer[1]}
        out.append(
            {
                "label": _clean(labels["follow_mail"].format(**values), 120) or "",
                "ask": _clean(labels[key].format(**values), 400) or "",
            }
        )
        if len(out) == _FOLLOW_UPS_MAX:
            break
    return out


def _search_ranking(output: Mapping[str, Any], labels: dict[str, str]) -> dict | None:
    """ENTREPRISES / CLASSEMENT — le tour d'horizon en carte ``account_ranking``. Les axes sont ceux que
    l'outil a rendus (un rang n'est jamais nu) ; aucun score n'est recopié."""
    axes = _texts(output.get("axes"), 80, 6)
    rows: list[dict[str, Any]] = []
    search_zone = _search_zone(output)
    for item in _search_items(output)[:_RANKING_MAX]:
        why = _texts(item.get("why"), 400, 5) or [_search_fact(item, labels) or labels["registry_fact"]]
        # #3769.1 (recette prod 09/10) — le SIÈGE, MÊME libellé que `_priorities_ranking`
        # (GA-26) : sans lui, un raffinement géographique sur cette carte (« seulement en
        # Occitanie ») n'a rien à lire et retombe sur une clarification. `_search_fact`
        # (ci-dessus) ne porte la ville que dans son REPLI (`why` vide côté outil) : un
        # classement qui a de VRAIS facteurs de score (le cas courant) ne la disait jamais
        # — exactement les « 0 Siège sur 53 comptes » constatés en recette.
        city = _clean(item.get("city"), 80)
        if city:
            siege = labels["priorities_headquarters"].format(headquarters=city)
            if not any(siege == w for w in why):
                why = [*why[:4], siege] if len(why) >= 5 else [*why, siege]
        why = [*_call_lines(item, labels), *why][:5]
        row: dict[str, Any] = {"name": _clean(item.get("name"), 120), "why": why}
        href = _account_href(item.get("account_id"))
        if href:
            row["href"] = href
        elif row["name"]:
            # #4432.2 — hors de l'espace, la carte s'OUVRE (plus seulement « Sélectionner ») : l'analyse, zone posée.
            row["action"] = {"label": labels["open_search"], "href": _open_search_href(row["name"], search_zone)}
        verdict = _clean(item.get("verdict"), 300)
        if verdict:
            row["verdict"] = verdict
        why_now = _clean(item.get("why_now"), 400)
        if why_now:
            row["why_now"] = why_now
        not_evaluated = _texts(item.get("not_evaluated"), 80, 6)
        if not_evaluated:
            row["not_evaluated"] = not_evaluated
        as_of = str(item.get("as_of") or "")
        if _ISO_DATE.match(as_of):
            row["source"] = {"label": labels["registry"], "as_of": as_of[:10]}
        # #3704.2 — recette prod 06/10 : `already_in_workspace` existait déjà sur
        # la sortie de l'outil (rapprochement SIREN), mais cette porte ne le
        # recopiait pas dans la carte — rien à l'écran ne distinguait une
        # « nouvelle cible » d'un compte déjà au portefeuille.
        match = item.get("workspace_match")
        # #4055 (recette prod 13/10, lot W-C) — une ligne RAPPROCHÉE d'un compte de l'espace n'est jamais une
        # « nouvelle cible » : le badge d'appartenance n'est pas posé, la ligne dit le niveau (ci-dessous).
        rapprochee = isinstance(match, Mapping) and str(match.get("level") or "") in ("group_known", "to_verify")
        if isinstance(item.get("already_in_workspace"), bool) and (item["already_in_workspace"] or not rapprochee):
            row["already_in_workspace"] = item["already_in_workspace"]
        # #4055 — les deux niveaux intermédiaires, dits sur la ligne, jamais confondus avec « déjà dans la base ».
        if isinstance(match, Mapping) and not item.get("already_in_workspace"):
            level = str(match.get("level") or "")
            matched = _clean(match.get("name"), 120)
            if matched and level in ("group_known", "to_verify"):
                row["why"] = [*row["why"], labels[f"match_{level}"].format(name=matched)]
        # #4432.3 — le palier de zone d'un compte élargi, tel que l'outil l'a rendu.
        zone_label = _clean(item.get("zone_label"), 80)
        if zone_label:
            row["zone_label"] = zone_label
        # R22-LG (#4421.2) — un compte qui recrute (offre DATÉE relevée par l'outil) : l'offre se lit sur la
        # ligne et le geste « Préparer le mail » au recruteur s'y pose. Sans offre datée, aucun geste.
        offer = _dated_hiring_demand(item)
        if offer:
            values = {"account": row["name"], "title": offer[0], "date": offer[1]}
            line = _clean(labels["market_offer"].format(**values), 400)
            if line:
                row["why"] = [*row["why"][:4], line]
            row["follow_ups"] = [
                {
                    "label": labels["follow_market_mail"],
                    "ask": _clean(labels["follow_market_mail_ask"].format(**values), 400) or "",
                }
            ]
        # #4421.3 — RÉFUTÉ en prod le 23/10 : un compte qui recrute dont les contacts sont CONNUS porte un geste
        # « Préparer le mail à <nom> » par contact (dix au plus) — même grammaire que les missions d'un talent.
        if mails := _market_contact_follow_ups(row["name"], item, offer, labels):
            row["follow_ups"] = mails
        rows.append(row)
    if not rows or not axes:
        return None
    # #3866 — l'offre déclarée se lit sur CHAQUE carte, pas seulement dans « Classé selon ».
    rows = _rows_with_offer(rows, _offer_of_output(output), labels)
    block: dict[str, Any] = {"type": "account_ranking", "axes": axes, "items": rows}
    if search_zone:
        block["search_zone"] = search_zone
    limits = _search_limits(output, labels)
    if limits:
        block["not_evaluated"] = limits
    return validate_reply_block(block)


def _search_map(output: Mapping[str, Any], labels: dict[str, str]) -> dict | None:
    """CARTOGRAPHIE — le même tour d'horizon, lu en GROUPES (``account_map``, #3758.2) : groupés par activité
    déclarée, sans rang ni score, la couverture DITE, et ce que la sélection ne couvre pas nommé (la carte se lit
    donc « partielle » : une sélection du registre n'est jamais une cartographie complète).

    #3762 Reste (lot K06 07/10) — POURQUOI JAMAIS LA GRILLE (``accounts``), À DESSEIN.

    La GRILLE canonique (en-tête, cadrage, grille de cartes) existe dans LE MÊME contrat
    (``accountMapBlock`` / ``AccountMapBlock``) et son rendu écran est déjà livré — mais ``proof``,
    ``caution`` ET ``next_action`` y sont OBLIGATOIRES sur CHAQUE carte (contrat), et ``run_account_search``
    ne rend ni l'un ni l'autre pour TOUS les comptes : ``why``/``verdict`` (une « raison ») n'existent que
    si le registre a rendu un score ou une qualification, ``limits`` (une « prudence ») seulement sur une
    hypothèse de doublon, et AUCUN champ ne porte une prochaine action PAR COMPTE — seul le texte du modèle
    en écrit une, par jugement, jamais cette porte (``shape_read_from_tool`` ne fait « jamais un second
    calcul, jamais un champ inventé »). Forcer la grille ici inventerait donc une prudence ou une action sur
    les comptes qui n'en rendent aucune — exactement ce que la doctrine refuse (« JAMAIS de données
    fictives »). La grille reste ATTEIGNABLE : si le MODÈLE l'écrit lui-même (son propre jugement), cette
    porte ne la double jamais (``present & satisfied`` dans ``route_known_shapes``) — seul CE repli
    déterministe se limite aux groupes. Voir ``test_known_shape_gate_account_map_grid.py``.
    """
    items = _search_items(output)
    if not items:
        return None
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        label = _clean(item.get("activity"), 120) or labels["map_other_activity"]
        entry: dict[str, Any] = {"name": _clean(item.get("name"), 120)}
        href = _account_href(item.get("account_id"))
        if href:
            entry["href"] = href
        detail_parts = [_clean(item.get("city"), 80)]
        headcount = item.get("headcount")
        if isinstance(headcount, int) and not isinstance(headcount, bool) and headcount > 0:
            detail_parts.append(labels["headcount"].format(n=headcount))
        # #4055.1 — les mêmes trois niveaux que la carte `account_ranking` (déjà dans ta base /
        # groupe dont tu connais déjà une filiale / rapprochement à vérifier), jamais recalculés
        # une seconde fois : même champ `already_in_workspace`/`workspace_match` que
        # `run_account_search` pose déjà, même priorité (un fait vérifié gagne sur une
        # proposition) que `_search_ranking` juste au-dessus.
        match = item.get("workspace_match")
        if isinstance(item.get("already_in_workspace"), bool) and item["already_in_workspace"]:
            detail_parts.append(labels["map_already_known"])
        elif isinstance(match, Mapping):
            level = str(match.get("level") or "")
            matched = _clean(match.get("name"), 120)
            if matched and level in ("group_known", "to_verify"):
                detail_parts.append(labels[f"match_{level}"].format(name=matched))
        detail = " · ".join(p for p in detail_parts if p)
        if detail:
            entry["detail"] = detail
        groups.setdefault(label, []).append(entry)
    ordered = list(groups.items())
    if len(ordered) > _MAP_GROUPS_MAX:
        head, tail = ordered[: _MAP_GROUPS_MAX - 1], ordered[_MAP_GROUPS_MAX - 1 :]
        ordered = [*head, (labels["map_other_activity"], [e for _, rows in tail for e in rows])]
    axes = _texts(output.get("axes"), 80, 6)
    block: dict[str, Any] = {
        "type": "account_map",
        "title": labels["map_title"],
        "coverage": _clean(labels["map_coverage"].format(n=len(items), axes=", ".join(axes) or "—"), 300),
        "groups": [{"label": label, "items": rows[:40]} for label, rows in ordered],
        "not_covered": [labels["map_hq"], labels["map_need"], *_search_limits(output, labels)][:6],
    }
    return validate_reply_block(block)


_BUCKETS: tuple[tuple[str, str, str], ...] = (
    # (clé de l'outil, niveau #3764, libellé de catégorie)
    ("now", "priority", "bucket_now"),
    ("toVerify", "to_qualify", "bucket_to_verify"),
    ("toWatch", "to_watch", "bucket_to_watch"),
)


def _is_test_account(row: Mapping[str, Any]) -> bool:
    """B2-RESTES (recette prod 12/10) — un compte de recette (« Recette 10-10 ») n'est jamais exclu d'office,
    mais il ne passe pas devant un vrai compte de même niveau."""
    return "recette" in (_clean(row.get("companyName") or row.get("name"), 120) or "").casefold()


def _priority_rows(output: Mapping[str, Any]) -> list[tuple[Mapping[str, Any], str, str]]:
    rows: list[tuple[Mapping[str, Any], str, str]] = []
    for key, level, bucket in _BUCKETS:
        values = output.get(key)
        bucket_rows = [
            (row, level, bucket)
            for row in (values if isinstance(values, list) else [])
            if isinstance(row, Mapping) and _clean(row.get("companyName") or row.get("name"), 120)
        ]
        # Tri stable : l'ordre de la règle est conservé, seuls les comptes de recette descendent en fin de seau.
        rows.extend(sorted(bucket_rows, key=lambda entry: _is_test_account(entry[0])))
    return rows


_INTERLOCUTOR_PREFIXES = ("Interlocuteur", "Interlocutor")


def _interlocutor_line(row: Mapping[str, Any], labels: dict[str, str]) -> str | None:
    """#3399 — la ligne « Interlocuteur : … » d'un compte du portefeuille. La clé `interlocutor` ABSENTE
    = les contacts n'ont pas été lus : aucune ligne (jamais un « à identifier » affirmé sans avoir
    regardé). `null` = lus, aucun contact lisible : « à identifier ». Rôle / périmètre vides se NOMMENT."""
    if "interlocutor" not in row:
        return None
    person = row.get("interlocutor")
    if person is None:
        return labels["priorities_interlocutor_none"]
    if not isinstance(person, Mapping):
        return None
    name = _clean(person.get("name"), 80)
    if not name:
        return labels["priorities_interlocutor_none"]
    return labels["priorities_interlocutor"].format(
        name=name,
        role=_clean(person.get("role"), 80) or labels["priorities_role_unset"],
        scope=_clean(person.get("scope"), 80) or labels["priorities_scope_unset"],
    )


_MISSING_CODES = ("analysis", "contact", "headquarters")
_KNOWN_CONTACTS_MAX = 5


def _known_fact_lines(row: Mapping[str, Any], labels: dict[str, str]) -> list[str]:
    """#4054.1 — « contacts déjà connus, éléments manquants » d'un compte du portefeuille, lus tels que l'API
    les a rendus (``fromImport``, ``knownContacts``, ``missing``). Rien n'est déduit : une clé absente ne fait
    aucune ligne, un code inconnu est ignoré, jamais un « 0 contact » affirmé."""
    lines: list[str] = []
    if row.get("fromImport") is True:
        lines.append(labels["priorities_from_import"])
    contacts = row.get("knownContacts")
    if isinstance(contacts, list):
        names: list[str] = []
        for person in contacts:
            if not isinstance(person, Mapping):
                continue
            name = _clean(person.get("name"), 80)
            if not name:
                continue
            role = _clean(person.get("role"), 80)
            names.append(f"{name} ({role})" if role else name)
        if names:
            lines.append(labels["priorities_known_contacts"].format(names=", ".join(names[:_KNOWN_CONTACTS_MAX])))
    missing = row.get("missing")
    if isinstance(missing, list):
        items = [labels[f"priorities_missing_{code}"] for code in _MISSING_CODES if code in missing]
        if items:
            lines.append(labels["priorities_missing"].format(items=", ".join(items)))
    return lines


def _interlocutor_by_name(reads: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    """Le nom → ligne « Interlocuteur » que l'outil a déjà rendue CE tour, jamais un second calcul."""
    by_name: dict[str, str] = {}
    for read in reads:
        block = (read.get("blocks") or {}).get("account_ranking")
        if not isinstance(block, Mapping):
            continue
        for item in block.get("items") or []:
            if not isinstance(item, Mapping):
                continue
            line = next((w for w in item.get("why") or [] if isinstance(w, str) and w.startswith(_INTERLOCUTOR_PREFIXES)), None)
            name = str(item.get("name") or "").strip().casefold()
            if name and line:
                by_name[name] = line
    return by_name


#: #3769 — l'identifiant stable de la carte de priorisation du portefeuille (miroir `card_id` du contrat).
PORTFOLIO_PRIORITIES_CARD_ID = "portfolio_priorities"


def _priorities_ranking(
    output: Mapping[str, Any], labels: dict[str, str], keep: frozenset[str] = frozenset()
) -> dict | None:
    """PRIORISATION — les catégories de la règle du portefeuille (``derivePortfolioPriorities``, NestJS) en carte
    ``account_ranking``, dans l'ordre de la règle (maintenant → à vérifier → à surveiller), chaque compte avec
    son NIVEAU (#3764) dérivé de sa catégorie. « Pas maintenant » n'est pas listé : il se compte."""
    items: list[dict[str, Any]] = []
    # #3245 (RAN, recette ND 10/10) — Accor ET AIRBUS « Pari long » : le plafond de 20 lignes coupait
    # Accor (55 « à surveiller », 0 « maintenant »). Un pari DÉCLARÉ n'est jamais coupé par le plafond :
    # il garde sa place dans l'ordre de la règle, les autres comptes remplissent le reste.
    # #3399 (lot F3399, recettes prod 11/10) — de même un compte NOMMÉ par le modèle (``keep``) : le plafond
    # coupait « Doctolib » (40e du portefeuille), la carte du modèle n'était plus un sous-ensemble de celle de
    # l'outil et la porte la gardait, sans Accor ni Airbus.
    all_rows = _priority_rows(output)

    def _pinned(row: Mapping[str, Any]) -> bool:
        name = _clean(row.get("companyName") or row.get("name"), 120) or ""
        return bool(_clean(row.get("betHorizon"), 20)) or name.casefold() in keep

    pinned = [r for r in all_rows if _pinned(r[0])]
    budget = max(_RANKING_MAX - len(pinned), 0)
    kept_rows: list[tuple[Mapping[str, Any], str, str]] = []
    for entry in all_rows:
        if _pinned(entry[0]):
            kept_rows.append(entry)
        elif budget > 0:
            kept_rows.append(entry)
            budget -= 1
    for row, level, bucket in kept_rows:
        reason = _clean(row.get("reason"), 400)
        why = [reason or labels["priorities_why"].format(bucket=labels[bucket])]
        if (_clean(row.get("betHorizon"), 20) or "").lower() == "long":
            why.append(labels["priorities_long_bet"])
        # #3399 (RAN, recette ND 10/10) — l'interlocuteur est dit par l'OUTIL sur chaque carte.
        interlocutor_line = _interlocutor_line(row, labels)
        if interlocutor_line:
            why.append(interlocutor_line)
        # #4054.1 — contacts connus, provenance import, manques : la liste, pas seulement un interlocuteur.
        why.extend(_known_fact_lines(row, labels))
        # #3769.7 (recette prod nuit 08→09/10) — un fait RÉEL (colonne `accounts.headquarters`,
        # #3762 l'utilise déjà pour `run_account_search`), jamais une région devinée : sans lui,
        # un raffinement géographique sur cette carte (« seulement en Occitanie ») n'avait rien à
        # lire et retombait sur une clarification.
        city = _headquarters_city(row.get("headquarters"))
        if city:
            why.append(labels["priorities_headquarters"].format(headquarters=city))
        item: dict[str, Any] = {
            "name": _clean(row.get("companyName") or row.get("name"), 120),
            "level": level,
            "why": why,
        }
        href = _account_href(row.get("id") or row.get("accountId"))
        if href:
            item["href"] = href
        items.append(item)
    if not items:
        return None
    block: dict[str, Any] = {
        "type": "account_ranking",
        "title": labels["priorities_title"],
        # #3769 (recette 13/10) — l'identifiant de LA carte de priorisation : un affinage (« seulement en
        # Occitanie ») la met à jour au lieu d'en poser une seconde (l'écran remplace la précédente).
        "card_id": PORTFOLIO_PRIORITIES_CARD_ID,
        "axes": [labels["priorities_axis"]],
        "items": items,
    }
    not_now = output.get("notNow")
    if isinstance(not_now, list) and not_now:
        block["not_evaluated"] = [labels["not_now"].format(n=len(not_now))]
    # #3769.2 — la zone appliquée par l'outil se lit sur la carte ; un siège non
    # localisé se NOMME, il n'est jamais compté hors zone.
    geo = output.get("geoFilter")
    if isinstance(geo, Mapping):
        zone = _clean(geo.get("label"), 70)
        if zone:
            block["axes"].append(labels["priorities_zone"].format(zone=zone))
            # #3769 — la zone est dite dans l'EN-TÊTE de la carte, pas seulement parmi ses axes.
            block["title"] = f'{labels["priorities_title"]} · {labels["priorities_zone"].format(zone=zone)}'[:120]
        unlocated = _texts(geo.get("unlocated"), 60, 8)
        if unlocated:
            note = labels["priorities_unlocated"].format(names=", ".join(unlocated))
            block.setdefault("not_evaluated", []).append(note[:400])
    return validate_reply_block(block)


def _count_search(output: Mapping[str, Any]) -> int:
    return len(_search_items(output))


def _count_priorities(output: Mapping[str, Any]) -> int:
    return len(_priority_rows(output))


def _talent_items(output: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    accounts = output.get("accounts") if output.get("status") == "ok" else None
    return [a for a in accounts if isinstance(a, Mapping) and _clean(a.get("name"), 120)] if isinstance(accounts, list) else []


def _talent_follow_ups(account: str, consultant: Mapping[str, Any], labels: dict[str, str]) -> list[dict[str, str]]:
    """#3816.2 — les trois maillons qui EXISTENT déjà (analyse → contacts → message), chacun en phrase
    envoyée à Laura au clic. Le profil voyage avec : son NOM dans la phrase, son identifiant du vivier en
    métadonnée (`talent_id`, #4397) : le commercial ne le
    ressaisit jamais. Sans consultant identifié, aucune suite — jamais un geste sans objet."""
    name = _clean(consultant.get("name"), 80)
    consultant_id = str(consultant.get("id") or "").strip()
    if not name or not _UUID.match(consultant_id):
        return []
    values = {"account": account, "name": name, "id": consultant_id.lower()}
    return [
        # #4397 (N1) — le texte envoyé au clic ne porte JAMAIS l'identifiant : il voyage en `talent_id`.
        {
            "label": labels[key],
            "ask": _clean(labels[f"{key}_ask"].format(**values), 400) or "",
            "talent_id": values["id"],
        }
        for key in ("follow_analysis", "follow_contacts", "follow_message")
    ]


def _talent_mail_follow_ups(
    account: str, consultant: Mapping[str, Any], contacts: list[Mapping[str, Any]], labels: dict[str, str]
) -> list[dict[str, str]]:
    """#4421.3 — un compte dont les contacts sont CONNUS : le geste est le mail à chacun (dix au plus, recruteurs
    d'abord, l'ordre de l'outil), préparé par Laura et jamais envoyé. Sans contact identifié, aucun : les trois
    maillons de #3816.2 restent."""
    name = _clean(consultant.get("name"), 80)
    consultant_id = str(consultant.get("id") or "").strip()
    if not name or not _UUID.match(consultant_id):
        return []
    out: list[dict[str, str]] = []
    for contact in contacts:
        contact_name = _clean(contact.get("name"), 80)
        contact_id = str(contact.get("contact_id") or "").strip()
        if not contact_name or not contact_id:
            continue
        values = {"account": account, "name": name, "id": consultant_id.lower(), "contact": contact_name}
        out.append(
            {
                "label": _clean(labels["follow_mail"].format(**values), 120) or "",
                "ask": _clean(labels["follow_mail_ask"].format(**values, contact_id=contact_id), 400) or "",
            }
        )
        if len(out) == _FOLLOW_UPS_MAX:
            break
    return out


def _talent_reach(item: Mapping[str, Any], labels: dict[str, str]) -> tuple[list[str], list[Mapping[str, Any]]]:
    """#4421.3 — les lignes « besoins relevés » et « à joindre » d'un compte, et ses contacts NOMMÉS (pour le
    mail à préparer). Coordonnées EN CLAIR (c87). Ce que l'outil n'a pas rendu ne fait aucune ligne ; un compte
    lu sans contact le DIT, avec le geste qui en trouve."""
    lines: list[str] = []
    needs = [n for n in item.get("needs") or [] if isinstance(n, Mapping) and _clean(n.get("title"), 120)]
    if needs:
        listed = " · ".join(
            f"{_clean(n.get('title'), 120)} ({n.get('date')})" if n.get("date") else str(_clean(n.get("title"), 120))
            for n in needs
        )
        lines.append(_clean(labels["talent_needs"].format(needs=listed), 400) or "")
    raw = item.get("contacts")
    contacts = (
        [c for c in raw or [] if isinstance(c, Mapping) and _clean(c.get("name"), 120)] if isinstance(raw, list) else []
    )
    if contacts:
        listed = "; ".join(
            f"{_clean(c.get('name'), 120)} ({', '.join(str(v) for v in (c.get('title'), c.get('email'), c.get('phone')) if v)})"
            if any(c.get(k) for k in ("title", "email", "phone"))
            else str(_clean(c.get("name"), 120))
            for c in contacts
        )
        outside = item.get("contacts_state") == "found_outside"
        label = labels["talent_found_outside"] if outside else labels["talent_contacts"]
        lines.append(_clean(label.format(contacts=listed), 400) or "")
        mail = item.get("prepared_message")
        to_row = mail.get("to") if isinstance(mail, Mapping) else None
        to = _clean(to_row.get("name"), 120) if isinstance(to_row, Mapping) else None
        if outside and to:
            lines.append(_clean(labels["talent_prepared_mail"].format(contact=to), 400) or "")
    elif isinstance(raw, list):
        # #4421.3 — « Aucun contact connu » ne s'écrit que si le compte n'en a vraiment aucun.
        state = item.get("contacts_state")
        refused = item.get("people_search")
        lines.append(
            labels[f"talent_people_{refused}"]
            if state == "not_in_workspace" and refused in {"no_space", "capped"}
            else labels["talent_not_in_space"]
            if state == "not_in_workspace"
            else labels["talent_unread"]
            if state == "unread"
            else labels["talent_no_contact"]
        )
    elif item.get("contacts_state") == "unread":
        lines.append(labels["talent_unread"])
    return [line for line in lines if line], contacts


_SIREN = re.compile(r"^\d{9}$")
_REVEAL_MAX = 3


def _talent_reveal(item: Mapping[str, Any]) -> dict[str, Any] | None:
    """#4421.15 — les personnes trouvées HORS de l'espace que le commercial peut révéler au clic (« Obtenir
    l'e-mail ») : seulement celles dont l'outil a rendu la référence opaque, trois au plus. `mail_to` marque la
    destinataire du mail préparé. Un contact de l'espace, une personne sans référence : rien (jamais un bouton
    sans objet)."""
    if item.get("contacts_state") != "found_outside" or not isinstance(item.get("contacts"), list):
        return None
    mail = item.get("prepared_message")
    to_row = mail.get("to") if isinstance(mail, Mapping) else None
    mail_ref = str(to_row.get("person_ref") or "").strip() if isinstance(to_row, Mapping) else ""
    people: list[dict[str, Any]] = []
    for contact in item["contacts"]:
        if not isinstance(contact, Mapping) or contact.get("contact_id"):
            continue
        name = _clean(contact.get("name"), 120)
        ref = str(contact.get("person_ref") or "").strip()[:64]
        if not name or not ref:
            continue
        person: dict[str, Any] = {"name": name}
        title = _clean(contact.get("title"), 120)
        if title:
            person["title"] = title
        person["person_ref"] = ref
        if mail_ref and ref == mail_ref:
            person["mail_to"] = True
        people.append(person)
        if len(people) == _REVEAL_MAX:
            break
    if not people:
        return None
    siren = str(item.get("siren") or "").strip()
    return {"siren": siren, "people": people} if _SIREN.match(siren) else {"people": people}


def _talent_offers(item: Mapping[str, Any]) -> list[dict[str, str]]:
    """#4642 — les offres relevées du compte (intitulé + date TELS QUE LA LIGNE LES AFFICHE, `_talent_reach`) :
    elles voyagent avec le nom vers l'analyse. Une offre sans intitulé n'est pas une offre ; une date illisible
    ne s'écrit pas (jamais devinée)."""
    out: list[dict[str, str]] = []
    for need in item.get("needs") or []:
        if not isinstance(need, Mapping):
            continue
        title = _clean(need.get("title"), 160)
        if not title:
            continue
        offer = {"title": title}
        date = str(need.get("date") or "")[:10]
        if _ISO_DATE.match(date):
            offer["date"] = date
        out.append(offer)
    return out[:10]


def _talent_context(output: Mapping[str, Any], consultant: Mapping[str, Any]) -> dict[str, Any] | None:
    """#4642 — la DEMANDE dont la carte est la réponse : la fiche du talent, l'union (ordre de la carte) des
    compétences qui ont relié les comptes, et la zone lue (départements nommés). Rien n'est deviné : un
    identifiant qui n'est pas un uuid, une compétence ou un département absents ne font aucune clé. La zone est
    un LIBELLÉ : le contexte priorise, il ne devient jamais le périmètre de l'analyse."""
    from app.services.geo_labels import department_name

    context: dict[str, Any] = {}
    consultant_id = str(consultant.get("id") or "").strip()
    if _UUID.match(consultant_id):
        context["talent_id"] = consultant_id.lower()
    skills: list[str] = []
    zones: list[str] = []
    for item in _talent_items(output):
        for skill in item.get("matched_skills") or []:
            text = _clean(skill, 60)
            if text and text.casefold() not in {s.casefold() for s in skills}:
                skills.append(text)
        name = department_name(str(item.get("department") or "")) if item.get("department") else None
        if name and name not in zones:
            zones.append(name)
    if skills:
        context["skills"] = skills[:20]
    zone = _clean(", ".join(zones), 120) if zones else None
    if zone:
        context["zone"] = zone
    # #4642 — le NOM du talent voyage avec la fiche : le dossier dit « Cadré sur : Camille Fournier · … » (mesure prod
    # 27/10 : 0 occurrence du nom). Un nom seul n'est pas un axe : sans fiche, compétence ni zone, aucun contexte.
    talent_name = _clean(consultant.get("name"), 120)
    if context and talent_name:
        context["talent_name"] = talent_name
    return context or None


def _talent_rows(output: Mapping[str, Any], labels: dict[str, str]) -> tuple[list[dict[str, Any]], int]:
    """#4631 — LE prédicat des comptes rendus : une ligne n'existe que si elle porte une raison ET que la carte l'accepte
    SEULE. Un texte refusé (ex. une mention de probabilité) écarte CETTE ligne, jamais les neuf autres ; le nombre
    d'écartées est rendu avec les lignes, pour que le compte annoncé et la liste sortent de la même collection."""
    consultant = output.get("consultant") if isinstance(output.get("consultant"), Mapping) else {}
    rows: list[dict[str, Any]] = []
    dropped = 0
    for item in _talent_items(output)[:_RANKING_MAX]:
        why = _texts(item.get("why"), 400, 5)
        if not why:
            dropped += 1
            continue
        reach, contacts = _talent_reach(item, labels)
        why = [*why[: 5 - len(reach)], *reach]
        row: dict[str, Any] = {"name": _clean(item.get("name"), 120), "why": why}
        not_evaluated = _texts(item.get("not_evaluated"), 80, 6)
        if not_evaluated:
            row["not_evaluated"] = not_evaluated
        as_of = str(item.get("observed_on") or "")
        if _ISO_DATE.match(as_of):
            row["source"] = {"label": labels["talent_source"], "as_of": as_of[:10]}
        follow_ups = _talent_mail_follow_ups(row["name"], consultant, contacts, labels) or _talent_follow_ups(
            row["name"], consultant, labels
        )
        if follow_ups:
            row["follow_ups"] = follow_ups
        reveal = _talent_reveal(item)
        if reveal:
            row["reveal"] = reveal
        offers = _talent_offers(item)
        if offers:
            row["offers"] = offers
        # #4631 — la ligne est jugée SEULE : la carte entière ne tombe pas pour un seul texte refusé.
        if validate_reply_block({"type": "account_ranking", "axes": ["x"], "items": [row]}) is None:
            dropped += 1
            continue
        rows.append(row)
    return rows, dropped


def _talent_ranking(output: Mapping[str, Any], labels: dict[str, str]) -> dict | None:
    """#3816.1 — « missions pour ce profil » : les comptes du marché inversé d'UN talent en carte
    ``account_ranking``, chacun avec SA raison (compétences de la fiche ↔ offres relevées), sa source
    et sa date. Rien n'est recalculé : l'ordre et les raisons sont ceux de ``compile_talent_accounts``."""
    consultant = output.get("consultant") if isinstance(output.get("consultant"), Mapping) else {}
    rows, dropped = _talent_rows(output, labels)
    if not rows:
        return None
    # Garde de parité #3707.7 (`reply-parity.ts`) : une réserve portée par PLUSIEURS comptes se dit UNE
    # fois, au niveau de la carte, avec les comptes qu'elle concerne — jamais répétée ligne à ligne.
    shared: list[str] = []
    for reserve in dict.fromkeys(r for row in rows for r in row.get("not_evaluated") or []):
        holders = [row for row in rows if reserve in (row.get("not_evaluated") or [])]
        if len(holders) < 2:
            continue
        for row in holders:
            row["not_evaluated"] = [r for r in row["not_evaluated"] if r != reserve]
            if not row["not_evaluated"]:
                row.pop("not_evaluated")
        names = ", ".join(str(row["name"]) for row in holders)
        shared.append(_clean(labels["shared_reserve"].format(reserve=reserve, names=names), 400) or reserve)
    block: dict[str, Any] = {
        "type": "account_ranking",
        "axes": labels["talent_axes"].split("|"),
        "items": rows,
    }
    name = _clean(consultant.get("name"), 80)
    if name:
        block["title"] = _clean(labels["talent_title"].format(name=name), 120)
    if context := _talent_context(output, consultant):
        block["talent_context"] = context
    # #4631 — « N comptes lus ne sont pas listés » : le nombre vient de la MÊME collection que les lignes.
    unlisted = [labels["talent_dropped_one" if dropped == 1 else "talent_dropped_other"].format(n=dropped)] if dropped else []
    limits = [*shared, *unlisted, *_texts(output.get("limits"), 400, 6)][:6]
    if limits:
        block["not_evaluated"] = limits
    return validate_reply_block(block)


def _count_talent(output: Mapping[str, Any]) -> int:
    return len(_talent_items(output))


def _alternative_items(output: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    alts = output.get("alternatives")
    if not alts:
        # #4289.4 — sans alternative mesurée, les comptes voisins (nommés tels) font la carte.
        alts = output.get("neighbours")
    if not isinstance(alts, list):
        return []
    return [
        a
        for a in alts
        if isinstance(a, Mapping) and isinstance(a.get("account"), Mapping) and _clean(a["account"].get("name"), 120)
    ]


def _count_alternatives(output: Mapping[str, Any]) -> int:
    return len(_alternative_items(output))


def _alternatives_ranking(output: Mapping[str, Any], labels: dict[str, str]) -> dict | None:
    """#3247.r41 (recette prod 17/10 : « quelles alternatives à Safran ? » rendu en UNE phrase) — les
    alternatives MESURÉES par ``suggest_account_alternatives`` en carte ``account_ranking``, bâtie des lignes de
    l'outil (jamais du texte du modèle) : chaque candidat dit son fait d'accessibilité, ses trois lectures
    (relation CRM, présence marché, preuve dans ce secteur — ``checked``), son signal et ce qui n'a pas été
    vérifié. Les partenaires écartés se NOMMENT sur la carte. Aucun verdict n'est posé sur le groupe visé."""
    rows: list[dict[str, Any]] = []
    for alt in _alternative_items(output)[:_RANKING_MAX]:
        account = alt["account"]
        why = [
            t
            for t in (_clean(alt.get("why_similar"), 400), _clean(alt.get("why_easier"), 400), _clean(alt.get("evidence"), 400))
            if t
        ]
        path = _clean(alt.get("access_path"), 300)
        if path:
            why.append(labels["alt_path"].format(path=path))
        row: dict[str, Any] = {"name": _clean(account.get("name"), 120), "why": why[:5] or [labels["registry_fact"]]}
        limits = _texts(alt.get("checked"), 400, 5)
        if limits:
            row["limits"] = limits
        signal = _clean(alt.get("current_signal"), 300)
        if signal:
            row["why_now"] = labels["alt_signal"].format(signal=signal)
        missing = _texts(alt.get("missing_check"), 400, 6)
        if missing:
            row["not_evaluated"] = missing
        verdict = _clean(alt.get("registry_verdict"), 300)
        if verdict:
            row["verdict"] = verdict
        rows.append(row)
    if not rows:
        return None
    block: dict[str, Any] = {"type": "account_ranking", "axes": [labels["alt_axis"]], "items": rows}
    title = _clean(output.get("source_account_name"), 80)
    block["title"] = labels["alt_title"].format(name=title) if title else labels["alt_title_plain"]
    note = _clean(output.get("neighbours_note"), 400) if not output.get("alternatives") else None
    aside = _texts(output.get("set_aside_partners"), 80, 8)
    if note:
        block["not_evaluated"] = [note]
    if aside:
        block["not_evaluated"] = [*(block.get("not_evaluated") or []), labels["alt_set_aside"].format(names=", ".join(dict.fromkeys(aside)))[:400]]
    return validate_reply_block(block)


def meeting_recap_block_from_account_briefing(output: object, *, language: str | None = None) -> dict | None:
    """#3758 (reste du lot J14) — LA carte ``post_meeting_summary``, bâtie du SEUL compte rendu
    réellement ENREGISTRÉ (``get_account_briefing``'s ``last_meeting_recap``, lu depuis
    ``notes.meeting_recap_snapshot``) — jamais le texte du modèle.

    ⚠️ Volontairement HORS de ``_SHAPE_TOOLS`` / ``shape_read_from_tool`` : ``get_account_briefing``
    est appelé pour bien d'autres raisons (dossier de compte, verdict…) où l'ABSENCE d'un compte
    rendu n'est pas une absence d'OBJET à nommer — le registre générique dirait « rien trouvé » sur
    un tour qui a pourtant réussi. Cette carte a sa règle propre, posée par ``route_known_shapes``
    (même famille de traitement que ``verdict_block`` / ``contact_block``), appliquée SEULEMENT
    quand la demande relève explicitement de la famille ``post_meeting_summary``.
    """
    if not isinstance(output, Mapping):
        return None
    recap = output.get("last_meeting_recap")
    if not isinstance(recap, Mapping):
        return None
    recorded_at = str(recap.get("recorded_at") or "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", recorded_at):
        return None
    decisions = _texts(recap.get("decisions"), 300, 12)
    actions: list[dict[str, Any]] = []
    for step in recap.get("next_steps") or []:
        if not isinstance(step, Mapping):
            continue
        what = _clean(step.get("action"), 300)
        if not what:
            continue
        action: dict[str, Any] = {"what": what}
        owner = _clean(step.get("owner"), 120)
        if owner:
            action["owner"] = owner
        due = _clean(step.get("due"), 120)
        if due:
            action["due"] = due
        actions.append(action)
    reminder = None
    raw_reminder = recap.get("reminder")
    if isinstance(raw_reminder, Mapping):
        content = _clean(raw_reminder.get("content"), 400)
        if content:
            reminder = {"content": content}
            due_label = _clean(raw_reminder.get("due_label") or raw_reminder.get("dueLabel"), 120)
            if due_label:
                reminder["due_label"] = due_label
    if not decisions and not actions and not reminder:
        return None
    block: dict[str, Any] = {
        "type": "post_meeting_summary",
        "title": _labels(language)["what_meeting_recap"],
        "as_of": recorded_at,
    }
    if decisions:
        block["decisions"] = decisions
    if actions:
        block["actions"] = actions[:12]
    if reminder:
        block["reminder"] = reminder
    return validate_reply_block(block)


def _manager_review_action(row: object, *, with_completed_at: bool = False, with_due_date: bool = False) -> dict | None:
    if not isinstance(row, Mapping):
        return None
    label = _clean(row.get("label"), 200)
    if not label:
        return None
    item: dict[str, Any] = {"label": label}
    target = _clean(row.get("targetLabel"), 160)
    if target:
        item["target"] = target
    owner = _clean(row.get("ownerName"), 120)
    if owner:
        item["owner"] = owner
    if with_completed_at:
        completed_at = row.get("completedAt")
        if isinstance(completed_at, str) and _ISO_DATE.match(completed_at):
            item["completed_at"] = completed_at[:10]
    if with_due_date:
        due_date = row.get("dueDate")
        if not (isinstance(due_date, str) and _ISO_DATE.match(due_date)):
            return None
        item["due_date"] = due_date[:10]
    return item


def manager_review_block_from_tool(output: object) -> dict | None:
    """#2985 (lot E07 08/10) — LA carte ``manager_review``, bâtie du SEUL résultat de
    ``get_account_manager_review`` (``copilot-bridge.controller.ts``, ``accountManagerReview``) —
    aucun second calcul, aucune donnée inventée : ce compilateur ne fait que reformer les champs déjà
    composés côté NestJS en bloc ``bellum-block``. Le verdict reste un STATUT fermé avec ses raisons
    COMPTÉES (jamais une probabilité) ; les axes non lus restent NOMMÉS (``not_evaluated``, GA-18/19) ;
    une section vide (aucun risque écrit, couverture non lue) ne fait AUCUNE ligne.

    ⚠️ Volontairement HORS de ``_SHAPE_TOOLS`` / ``shape_read_from_tool`` (même famille de traitement
    que ``meeting_recap_block_from_account_briefing`` juste au-dessus) : cette carte n'a ni ``items``
    ni ``axes`` à compter, un seul objet par compte — son absence (outil en erreur, compte introuvable)
    se dit dans le texte, elle ne nomme jamais une liste vide.
    """
    if not isinstance(output, Mapping) or output.get("error"):
        return None
    account_name = _clean(output.get("accountName"), 160)
    href = _account_href(output.get("accountId"))
    verdict = output.get("verdict")
    if not account_name or not href or not isinstance(verdict, Mapping):
        return None
    status = verdict.get("status")
    if status not in ("attention", "stable", "not_evaluable"):
        return None
    reasons = [
        {"kind": r.get("kind"), "count": r.get("count")}
        for r in (verdict.get("reasons") or [])
        if isinstance(r, Mapping) and isinstance(r.get("count"), int) and r.get("count", 0) > 0
    ][:5]
    not_evaluated = [a for a in (verdict.get("notEvaluated") or []) if isinstance(a, str)][:4]
    block: dict[str, Any] = {
        "type": "manager_review",
        "account_name": account_name,
        "href": href,
        "verdict": {"status": status, "reasons": reasons, "not_evaluated": not_evaluated},
    }
    change_digest = output.get("changeDigest")
    if isinstance(change_digest, Mapping):
        compared_at = change_digest.get("comparedAt")
        if isinstance(compared_at, str) and _ISO_DATE.match(compared_at):
            block["change_digest"] = {
                "compared_at": compared_at[:10],
                "changed_count": len(change_digest.get("changed") or []),
                "appeared_count": len(change_digest.get("appeared") or []),
                "disappeared_count": len(change_digest.get("disappeared") or []),
            }
    # ⚠️ Les six listes ci-dessous sont des champs OBLIGATOIRES du contrat (une absence se lit
    # « aucun », jamais « non mesuré » — une liste vide reste une liste) : toujours posées, même
    # vides. Seuls `change_digest` et `coverage` sont nullables (axe non lu, voir `verdict`).
    block["actions_completed"] = [
        a for row in (output.get("actionsCompleted") or [])[:10] if (a := _manager_review_action(row, with_completed_at=True))
    ]
    block["actions_stalled"] = [
        a for row in (output.get("actionsStalled") or [])[:10] if (a := _manager_review_action(row, with_due_date=True))
    ]
    risks = []
    for row in (output.get("risks") or [])[:10]:
        if not isinstance(row, Mapping):
            continue
        project = _clean(row.get("projectLabel"), 160)
        risk_text = _clean(row.get("risks"), 600)
        if project and risk_text:
            risks.append({"project": project, "risks": risk_text})
    block["risks"] = risks
    coverage = output.get("coverage")
    if isinstance(coverage, Mapping):
        gaps = [
            {"label": label, "reason": reason}
            for g in (coverage.get("gaps") or [])[:5]
            if isinstance(g, Mapping)
            and (label := _clean(g.get("label"), 120))
            and (reason := _clean(g.get("reason"), 300))
        ]
        gap_count = coverage.get("gapCount")
        if isinstance(gap_count, int) and not isinstance(gap_count, bool) and gap_count >= 0:
            block["coverage"] = {"gap_count": gap_count, "gaps": gaps}
    important_facts = []
    for row in (output.get("importantFacts") or [])[:10]:
        if not isinstance(row, Mapping):
            continue
        label = _clean(row.get("label"), 200)
        if not label:
            continue
        fact: dict[str, Any] = {"label": label}
        date = row.get("date")
        if isinstance(date, str) and _ISO_DATE.match(date):
            fact["date"] = date[:10]
        important_facts.append(fact)
    block["important_facts"] = important_facts
    block["decisions_requested"] = [
        a for row in (output.get("decisionsRequested") or [])[:10] if (a := _manager_review_action(row))
    ]
    arbitrations_requested = []
    for row in (output.get("arbitrationsRequested") or [])[:10]:
        if not isinstance(row, Mapping):
            continue
        project = _clean(row.get("projectLabel"), 160)
        consultant = _clean(row.get("consultantName"), 120)
        account_owner = _clean(row.get("accountOwnerName"), 120)
        resource_owner = _clean(row.get("resourceOwnerName"), 120)
        if not (project and consultant and account_owner and resource_owner):
            continue
        arbitration: dict[str, Any] = {
            "project": project,
            "consultant": consultant,
            "account_owner": account_owner,
            "resource_owner": resource_owner,
        }
        need = _clean(row.get("needTitle"), 160)
        if need:
            arbitration["need"] = need
        arbitrations_requested.append(arbitration)
    block["arbitrations_requested"] = arbitrations_requested
    return validate_reply_block(block)


#: Le REGISTRE de la porte : un outil qui rend des objets d'une forme connue → ses lectures possibles (carte par
#: type, la première étant la forme par défaut de l'outil), son compte d'objets, et le nom de ce qu'il cherche.
_SHAPE_TOOLS: dict[str, tuple[tuple[tuple[str, Callable[..., dict | None]], ...], Callable[..., int], str]] = {
    "run_account_search": (
        (("account_ranking", _search_ranking), ("account_map", _search_map)),
        _count_search,
        "what_accounts",
    ),
    "get_portfolio_priorities": (
        (("account_ranking", _priorities_ranking),),
        _count_priorities,
        "what_priorities",
    ),
    # #3816.1 — les comptes où placer UN consultant (marché inversé).
    "find_accounts_for_talent": (
        (("account_ranking", _talent_ranking),),
        _count_talent,
        "what_talent_accounts",
    ),
    # #3247.r41 — les alternatives à un groupe (portefeuille ou non) : la carte part de l'outil.
    "suggest_account_alternatives": (
        (("account_ranking", _alternatives_ranking),),
        _count_alternatives,
        "what_alternatives",
    ),
}

#: Les cartes que l'outil accepte comme DÉJÀ rendues (le modèle a écrit l'une d'elles : la porte ne double pas).
_TOOL_SATISFIED_BY: dict[str, frozenset[str]] = {
    "run_account_search": frozenset({"account_ranking", "account_map", "account_volume_sprint", "count_contract"}),
    "get_portfolio_priorities": frozenset({"account_ranking", "file_export"}),
    "find_accounts_for_talent": frozenset({"account_ranking"}),
    "suggest_account_alternatives": frozenset({"account_ranking"}),
}


def _access_order(output: Mapping[str, Any]) -> list[dict[str, str]]:
    """#5013 — vide sans ``sorted_by == "access"`` : l'ordre du registre n'est alors jamais touché. Une classe
    absente (non estimable) reste vide : elle ne se range pas dans l'une des quatre."""
    if output.get("sorted_by") != "access":
        return []
    out: list[dict[str, str]] = []
    for item in _search_items(output):
        klass = str(item.get("access_class") or "")
        out.append(
            {
                "name": (_clean(item.get("name"), 120) or "").casefold(),
                "klass": klass if klass in ("A", "B", "C", "D") else "",
                "label": _clean(item.get("access_label"), 80) or "",
            }
        )
    return out


def shape_read_from_tool(name: str, output: object, *, language: str | None = None) -> dict | None:
    """La LECTURE d'un outil de forme connue, posée sur son entrée d'action (jamais vers l'écran) :
    ``{"tool", "count", "blocks": {type: carte}}``. ``None`` : outil hors registre, ou en erreur."""
    spec = _SHAPE_TOOLS.get(name)
    if spec is None or not isinstance(output, Mapping) or output.get("error"):
        return None
    builders, count, what = spec
    labels = _labels(language)
    blocks = {card: block for card, build in builders if (block := build(output, labels)) is not None}
    if name == "find_accounts_for_talent":
        # #4631 — le nombre annoncé est celui des lignes RENDUES, jamais celui des comptes que l'outil a nommés.
        card = blocks.get("account_ranking")
        rendered = len(card["items"]) if isinstance(card, Mapping) else 0
    else:
        rendered = count(output)
    unlisted = count(output) - rendered if name == "find_accounts_for_talent" else 0
    return {
        "tool": name,
        "count": rendered,
        **({"unlisted": unlisted} if unlisted > 0 else {}),
        "what": labels[what],
        "blocks": blocks,
        # #3866.1 — le tour d'horizon est purement démographique (secteur, zone,
        # effectif) : aucun élément métier n'a été vérifié pour ces comptes.
        "commercial_fit_unverified": bool(output.get("commercial_fit_note")),
        # #3866 — l'offre déclarée, pour la carte écrite par le modèle (ex. après « affine »).
        "offer": _offer_of_output(output),
        # #5013 — l'ordre A→D de l'outil (`sort_by: "access"`) et la classe de chaque compte : la carte écrite par
        # le modèle les suit, par nom, au lieu de son propre ordre.
        **({"access_order": _access_order(output)} if name == "run_account_search" else {}),
        # #3399 (lot F3399) — la carte du portefeuille se RECONSTRUIT avec les comptes que le modèle a nommés.
        **(
            {
                "priorities_rebuild": lambda keep: _priorities_ranking(output, labels, keep),
                "priorities_names": [_clean(r[0].get("companyName") or r[0].get("name"), 120) or "" for r in _priority_rows(output)],
                "priorities_bets": [
                    _clean(r[0].get("companyName") or r[0].get("name"), 120) or ""
                    for r in _priority_rows(output)
                    if _clean(r[0].get("betHorizon"), 20)
                ],
            }
            if name == "get_portfolio_priorities"
            else {}
        ),
    }


# ── La porte ───────────────────────────────────────────────────────────────────────────────


def _block_types(reply: str) -> set[str]:
    return {s.block["type"] for s in split_reply_blocks(reply) if s.kind == "block" and s.block}


_RAW_BUCKET_TOKEN = re.compile(r"\b(to_watch|to_verify|to_qualify|not_now)\b")
_RAW_BUCKET_LABEL = {
    "to_watch": "bucket_to_watch",
    "to_verify": "bucket_to_verify",
    "to_qualify": "bucket_to_qualify",
    "not_now": "bucket_not_now",
}


def _raw_bucket_tokens_named(reply: str, labels: dict[str, str]) -> str:
    """#3769.2 (lot Q02, recette prod 09/10 soir) — le jeton brut ``to_watch`` (valeur de
    ``emptyBuckets``, un code technique) s'affichait 3 fois dans la prose. Les TEXTES de la réponse
    disent la catégorie en mots ; les cartes (JSON) ne sont jamais touchées."""
    if not _RAW_BUCKET_TOKEN.search(reply):
        return reply

    def name(text: str) -> str:
        return _RAW_BUCKET_TOKEN.sub(lambda m: labels[_RAW_BUCKET_LABEL[m.group(1)]], text)

    segments = split_reply_blocks(reply)
    if all(s.kind == "text" for s in segments):
        return name(reply)
    out: list[str] = []
    for s in segments:
        if s.kind == "text":
            out.append(name(s.text))
        elif s.kind == "block" and s.block:
            out.append(_fence(s.block))
        else:
            return reply
    return "\n\n".join(part for part in out if part.strip())


def _fence(block: Mapping[str, Any]) -> str:
    return f"```{REPLY_BLOCK_FENCE}\n{json.dumps(block, ensure_ascii=False)}\n```"


def _names_of(block: Mapping[str, Any]) -> list[str]:
    rows = [*(block.get("items") or [])]
    for group in block.get("groups") or []:
        rows.extend(group.get("items") or [])
    return [str(row.get("name")).casefold() for row in rows if isinstance(row, Mapping) and row.get("name")]


def _as_header(reply: str, block: Mapping[str, Any]) -> str:
    """Le texte du modèle devient le CHAPEAU de la carte : ses puces qui répètent un objet de la carte partent."""
    names = _names_of(block)
    kept = [
        line
        for line in reply.split("\n")
        if not (_BULLET.match(line) and any(name in line.casefold() for name in names))
    ]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()


def _with_card(reply: str, block: Mapping[str, Any]) -> str:
    header = _as_header(reply, block)
    return f"{header}\n\n{_fence(block)}" if header else _fence(block)


#: #3704.A (recette prod 08/10, W 5b4b10d2f3) — un titre qui COMMENCE par un
#: nombre (« 5 nouvelles entreprises ») fait une promesse de COMPTE : celui-ci
#: doit être celui de la liste qu'il coiffe, jamais un autre chiffre que le
#: modèle aurait retenu (ce qui a été DEMANDÉ, par exemple). Volontairement
#: étroit : un nombre ailleurs dans le titre (un seuil d'effectif, une année)
#: n'est pas une annonce de compte — la garde ne le touche pas.
_LEADING_COUNT = re.compile(r"^(\d+)(\s)")


def _title_with_count_corrected(title: str, real_count: int) -> str:
    """#3704.A — « le compte annoncé = le compte affiché, toujours (dérivé
    d'une seule liste) » : si le titre OUVRE sur un nombre, ce nombre devient
    celui de la liste réellement rendue (``real_count``), jamais un second
    calcul ni un chiffre mémorisé d'un tour précédent. Un titre déjà juste, ou
    qui n'ouvre pas sur un nombre, ressort à l'identique."""
    match = _LEADING_COUNT.match(title)
    if not match or int(match.group(1)) == real_count:
        return title
    return f"{real_count}{title[len(match.group(1)):]}"


def _is_geo_axis(text: str) -> bool:
    # #3769.2 (lot Q02) — « Zone : Occitanie » (filtre de `get_portfolio_priorities`) est une géographie
    # comme les deux autres : la carte écrite par le modèle la perdait, la restauration ne la connaissait pas.
    return text.startswith(("Département :", "Région :", "Zone :", "Area:", "Ville :"))


def _geo_axes_from_remembered_search(remembered: Mapping[str, Any] | None) -> list[str]:
    """#3704 (re-lotée G03, recette prod 09/10 aef69661e9 — défaut INCHANGÉ malgré la
    restauration posée par le lot F03) — cause nommée : cette restauration ne lisait QUE
    les lectures d'outil DE CE TOUR (``reads``) ; sur un tour « donne-moi aussi des
    besoins » répondu SANS rappeler ``run_account_search`` (le modèle complète sa propre
    carte de mémoire), ``reads`` est vide et rien n'était là pour restaurer. Repli, dans le
    MÊME format que ``_search_axes`` (``chat_tools.py``) : la région/le département du
    DERNIER ``run_account_search`` du fil (``ThreadState.searches``, tenu par
    ``ThreadStateCollector`` d'un tour à l'autre) — jamais un second calcul, seulement ce
    qu'une recherche RÉELLE, d'un tour précédent, a déjà posé."""
    if not isinstance(remembered, Mapping):
        return []
    from app.services.geo_labels import department_label, region_label

    axes: list[str] = []
    department = remembered.get("department")
    if isinstance(department, str) and department:
        axes.append(f"Département : {department_label(department)}")
    region = remembered.get("region")
    if isinstance(region, list) and region:
        codes = [str(code) for code in region if isinstance(code, str) and code]
        if codes:
            axes.append("Région : " + ", ".join(region_label(code) for code in codes))
    return axes


def _real_geo_axes(
    reads: Sequence[Mapping[str, Any]], remembered_search: Mapping[str, Any] | None = None
) -> list[str]:
    """#3704 (recette prod 09/10) — les lignes de GÉOGRAPHIE que la recherche RÉELLEMENT
    exécutée CE tour portait (``_search_axes``, appelant : ``_run_account_search``), dans
    l'ordre des lectures : la plus RÉCENTE l'emporte, comme le reste de cette porte. Jamais
    un second calcul — seulement ce que l'outil a déjà rendu. Sans lecture de ce tour (le
    modèle a répondu de mémoire, sans rappeler l'outil) : repli sur la dernière recherche
    connue du fil (``_geo_axes_from_remembered_search``)."""
    geo: list[str] = []
    for read in reads:
        block = (read.get("blocks") or {}).get("account_ranking")
        if not isinstance(block, Mapping):
            continue
        axes = block.get("axes")
        if isinstance(axes, list):
            found = [str(a) for a in axes if isinstance(a, str) and _is_geo_axis(a)]
            if found:
                geo = found
    return geo or _geo_axes_from_remembered_search(remembered_search)


def _axes_with_geography_restored(axes: Sequence[Any], real_geo_axes: Sequence[str]) -> list[Any]:
    """#3704 — la géographie du brief (décision F03 09/10 : « les critères du 1er tour,
    géographie comprise, se conservent d'un tour à l'autre tant que l'utilisateur ne les
    change pas ») restaurée dans la liste ``axes`` ÉCRITE PAR LE MODÈLE, quand la recherche
    réelle en portait une que le modèle a omise. Volontairement ÉTROIT : seule la GÉOGRAPHIE
    est visée — un axe métier (secteur, effectif, mots-clés) que le modèle aurait reformulé
    ou omis à dessein n'est jamais touché ici. Aucune géographie dans la recherche réelle ⇒
    rien n'est ajouté, jamais une zone devinée."""
    current = [a for a in axes if isinstance(a, str)]
    missing = [a for a in real_geo_axes if a not in current]
    if not missing:
        return list(axes)
    return [*axes, *missing][:6]


def _membership_by_name(reads: Sequence[Mapping[str, Any]]) -> dict[str, bool]:
    """#3704.1 — recette prod 07/10 (8d7c6957f0) : le nom → ``already_in_workspace`` que
    l'outil a rendu CE tour (``_search_ranking`` l'a déjà recopié dans sa propre lecture,
    jamais un second calcul ici). Un nom que l'outil n'a pas rendu reste absent."""
    by_name: dict[str, bool] = {}
    for read in reads:
        block = (read.get("blocks") or {}).get("account_ranking")
        if not isinstance(block, Mapping):
            continue
        for item in block.get("items") or []:
            if not isinstance(item, Mapping):
                continue
            name = str(item.get("name") or "").strip().casefold()
            value = item.get("already_in_workspace")
            if name and isinstance(value, bool):
                by_name[name] = value
    return by_name


def _real_offer(reads: Sequence[Mapping[str, Any]], remembered_search: Mapping[str, Any] | None = None) -> str:
    """#3866 — l'offre de la recherche RÉELLE de ce tour (la plus récente), sinon celle de la dernière
    recherche du fil (« affine » répondu sans rappeler l'outil). Jamais devinée."""
    for read in reversed(reads):
        offer = read.get("offer")
        if isinstance(offer, str) and offer:
            return offer
    remembered = remembered_search.get("offer") if isinstance(remembered_search, Mapping) else None
    return (_clean(remembered, 80) or "") if isinstance(remembered, str) else ""


def _with_membership_enriched(
    reply: str,
    reads: Sequence[Mapping[str, Any]],
    remembered_search: Mapping[str, Any] | None = None,
    language: str | None = None,
) -> str:
    """#3704.1 — quand le modèle a écrit SA PROPRE carte ``account_ranking`` (``present &
    satisfied`` : la porte ne la double jamais), elle sortait sans ``already_in_workspace``
    même si l'outil l'avait rendu pour ces mêmes entreprises — recette prod 07/10, 5
    entreprises rendues, 0 « Nouvelle cible » / « Déjà dans ton espace ». Recopié ici par
    NOM (insensible à la casse), jamais un second calcul ni une valeur devinée pour un nom
    que l'outil n'a pas rendu ; une ligne qui porte déjà le champ n'est jamais réécrite.

    #3704.A (recette prod 08/10) — la MÊME carte du modèle pouvait aussi annoncer un compte
    (``title``) différent du nombre de lignes qu'elle affiche RÉELLEMENT (``items``) : « 5
    nouvelles entreprises » coiffant 3 lignes. Corrigé ici aussi, indépendamment de
    l'appartenance (une carte sans aucun ``already_in_workspace`` à recopier peut quand
    même avoir un titre à corriger) : voir ``_title_with_count_corrected``.

    #3704 (recette prod 09/10, brief F03) — et ses propres ``axes`` (« Classé selon ») peuvent
    omettre une GÉOGRAPHIE que la recherche réelle de ce tour portait (« Région : IDF »
    disparue au 2e tour) : restaurée depuis la même lecture, voir ``_axes_with_geography_restored``."""
    membership = _membership_by_name(reads)
    interlocutors = _interlocutor_by_name(reads)
    real_geo_axes = _real_geo_axes(reads, remembered_search)
    offer = _real_offer(reads, remembered_search)
    labels = _labels(language)
    segments = split_reply_blocks(reply)
    if any(segment.kind not in ("text", "block") for segment in segments):
        return reply
    parts: list[str] = []
    changed = False
    for segment in segments:
        if segment.kind == "text":
            if segment.text.strip():
                parts.append(segment.text.strip())
            continue
        block = segment.block or {}
        if block.get("type") != "account_ranking":
            parts.append(_fence(block))
            continue
        items = []
        touched = False
        for item in block.get("items") or []:
            if isinstance(item, Mapping) and "already_in_workspace" not in item and membership:
                name = str(item.get("name") or "").strip().casefold()
                if name in membership:
                    item = {**item, "already_in_workspace": membership[name]}
                    touched = True
            # #3399 (RAN) — la ligne « Interlocuteur » que l'outil a rendue pour ce compte, restaurée
            # par NOM quand le modèle l'a omise ; jamais doublée, jamais pour un nom que l'outil n'a pas rendu.
            if isinstance(item, Mapping) and interlocutors:
                line = interlocutors.get(str(item.get("name") or "").strip().casefold())
                why = item.get("why")
                if line and isinstance(why, list) and not any(
                    isinstance(w, str) and w.startswith(_INTERLOCUTOR_PREFIXES) for w in why
                ):
                    item = {**item, "why": [line, *why][:5]}
                    touched = True
            items.append(item)
        # #3866 — la ligne « Offre visée » sur chaque compte de la carte du modèle.
        with_offer = _rows_with_offer(items, offer, labels)
        if with_offer != items:
            items, touched = with_offer, True
        enriched = {**block, "items": items}
        title = block.get("title")
        if isinstance(title, str) and title:
            corrected_title = _title_with_count_corrected(title, len(items))
            if corrected_title != title:
                enriched["title"] = corrected_title
                touched = True
        axes = block.get("axes")
        if isinstance(axes, list) and real_geo_axes:
            restored_axes = _axes_with_geography_restored(axes, real_geo_axes)
            if restored_axes != axes:
                enriched["axes"] = restored_axes
                touched = True
        if not touched:
            parts.append(_fence(block))
            continue
        validated = validate_reply_block(enriched)
        if validated is None:
            parts.append(_fence(block))
            continue
        parts.append(_fence(validated))
        changed = True
    return "\n\n".join(parts) if changed else reply


def _with_access_order(reply: str, reads: Sequence[Mapping[str, Any]], labels: dict[str, str]) -> str:
    """#5013 (recette prod 02/11) — « les comptes les plus faciles où entrer » : la carte ``account_ranking``
    écrite par le modèle suit l'ordre A→D de l'outil (tri stable, noms inconnus de l'outil en fin) et chaque
    compte dit sa classe, comme le texte de Laura. Sans tri par accès dans la lecture, rien ne change."""
    order = {
        entry["name"]: entry
        for read in reads
        for entry in read.get("access_order") or []
        if isinstance(entry, Mapping) and entry.get("name")
    }
    if not order:
        return reply
    rank = {name: index for index, name in enumerate(order)}
    segments = split_reply_blocks(reply)
    if any(segment.kind not in ("text", "block") for segment in segments):
        return reply
    parts: list[str] = []
    shown: list[Mapping[str, Any]] = []
    changed = False
    for segment in segments:
        if segment.kind == "text":
            if segment.text.strip():
                parts.append(segment.text.strip())
            continue
        block = segment.block or {}
        raw_items = block.get("items") if block.get("type") == "account_ranking" else None
        if not isinstance(raw_items, list):
            parts.append(_fence(block))
            continue
        items = []
        for item in raw_items:
            entry = order.get(str(item.get("name") or "").strip().casefold()) if isinstance(item, Mapping) else None
            why = item.get("why") if isinstance(item, Mapping) else None
            if entry and entry["klass"] and isinstance(why, list):
                # 5e tour : une ligne du modèle qui dit déjà la classe (« Classe A — … », « classe C : … ») est
                # retirée au profit de la ligne normalisée — la classe ne se dit jamais deux fois sur une carte.
                line = labels["access_class_line"].format(klass=entry["klass"], label=entry["label"]).rstrip(" —")
                rest = [w for w in why if not (isinstance(w, str) and _ACCESS_CLASS_SAID.match(w))]
                item = {**item, "why": [line, *rest][:5]}
            items.append(item)
        items.sort(key=lambda it: rank.get(str(it.get("name") or "").strip().casefold(), len(rank)))
        shown.extend(items)
        validated = validate_reply_block({**block, "items": items})
        block_out = validated or block
        parts.append(_fence(block_out))
        changed = changed or (validated is not None and validated != block)
    if shown and len(shown) < len(order):
        recounted = _with_shown_access_count(parts, shown, order, labels)
        if recounted is not None:
            return recounted
    return "\n\n".join(parts) if changed else reply


_ACCESS_CLASS_SAID = re.compile(r"^\s*(?:classe(?:\s+d['’]accès)?|access\s+class)\s+[A-D]\b", re.IGNORECASE)
#: Une phrase du modèle qui DÉCOMPTE par classe (« 9 en classe A et 11 en classe B », « 3 comptes de classe A »).
_ACCESS_COUNT_SENTENCE = re.compile(
    r"\b\d+\s+(?:comptes?\s+)?(?:en\s+)?(?:de\s+)?(?:classe\s+(?:d['’]accès\s+)?)?[A-D]\b(?=\s*(?:[,.;:)]|et\b|$))"
    r"|\b\d+\s+(?:comptes?\s+)?(?:en|de)\s+classe\b",
    re.IGNORECASE,
)


def _with_shown_access_count(
    parts: list[str], shown: Sequence[Mapping[str, Any]], order: Mapping[str, Mapping[str, str]], labels: dict[str, str]
) -> str | None:
    """5e tour (recette prod 02/11 18h50) — « 20 comptes : 9 en classe A et 11 en B » au-dessus de TROIS cartes
    (1 A, 2 B). ``access_line`` décompte les comptes que l'outil a RENDUS ; la carte du modèle en montre moins.
    Déterministe : la phrase de décompte écrite par le modèle est REMPLACÉE par celle des cartes montrées,
    le total trouvé gardé (« 20 trouvés, les 3 plus accessibles ci-dessous : 1 en A, 2 en B »). Sans phrase de
    décompte dans le texte, rien n'est ajouté ni retiré."""
    if not order or not shown:
        return None
    counts: dict[str, int] = {}
    for item in shown:
        entry = order.get(str(item.get("name") or "").strip().casefold())
        key = entry["klass"] if entry and entry["klass"] else ""
        counts[key] = counts.get(key, 0) + 1
    if not any(counts.get(k) for k in "ABCD"):
        return None
    pieces = [f"{counts[k]} en {k}" for k in "ABCD" if counts.get(k)]
    if counts.get(""):
        n = counts[""]
        pieces.append(f"{n} non estimable{'s' if n > 1 else ''}")
    sentence = labels["access_shown_count"].format(total=len(order), shown=len(shown), counts=", ".join(pieces))
    replaced = False
    out: list[str] = []
    for part in parts:
        if part.lstrip().startswith("```") or replaced:
            out.append(part)
            continue
        sentences = re.split(r"(?<=[.!?])\s+", part)
        rewritten: list[str] = []
        for piece in sentences:
            if not replaced and _ACCESS_COUNT_SENTENCE.search(piece):
                rewritten.append(sentence)
                replaced = True
            else:
                rewritten.append(piece)
        out.append(" ".join(rewritten))
    return "\n\n".join(out) if replaced else None


def _with_priorities_card_completed(reply: str, reads: Sequence[Mapping[str, Any]]) -> str:
    """#3399.1 / #3245 (lots RBI puis F3399, recettes G6 et prod 11/10) — « Quel compte attaquer en premier ? » :
    l'outil est forcé (RAW) et lit TOUT le portefeuille, mais le modèle répond par SA carte courte (2 lignes,
    puis 1 ligne « Doctolib »), que la porte gardait (``present & satisfied``) : Accor et Airbus absents,
    0 « Pari long déclaré. ». Une carte du modèle dont les comptes sont TOUS dans la lecture de
    ``get_portfolio_priorities`` mais qui n'en nomme pas toute la carte est une carte tronquée : elle est
    remplacée par la carte de l'outil — la même que « Où investir ? » — RECONSTRUITE avec les comptes que le
    modèle avait nommés (le plafond de 20 lignes ne les coupe jamais : ils sont le choix du commercial).
    « Tous dans la lecture » se mesure sur le portefeuille ENTIER, jamais sur les 20 lignes plafonnées.
    Une carte qui nomme toute celle de l'outil, ou un compte que l'outil n'a pas rendu (autre liste), n'est
    jamais touchée."""
    read = next((r for r in reversed(reads) if r.get("tool") == "get_portfolio_priorities"), None)
    rebuild = read.get("priorities_rebuild") if read else None
    tool_block = (read.get("blocks") or {}).get("account_ranking") if read else None
    if not callable(rebuild) or not isinstance(tool_block, Mapping):
        return reply
    portfolio = {str(n).strip().casefold() for n in (read.get("priorities_names") or []) if n}
    on_card = {str(i.get("name") or "").strip().casefold() for i in tool_block.get("items") or [] if isinstance(i, Mapping)}
    bets = {str(n).strip().casefold() for n in (read.get("priorities_bets") or []) if n}
    segments = split_reply_blocks(reply)
    if any(segment.kind not in ("text", "block") for segment in segments):
        return reply
    parts: list[str] = []
    changed = False
    for segment in segments:
        if segment.kind == "text":
            if segment.text.strip():
                parts.append(segment.text.strip())
            continue
        block = segment.block or {}
        if block.get("type") == "account_ranking":
            named = {str(i.get("name") or "").strip().casefold() for i in block.get("items") or [] if isinstance(i, Mapping)}
            if named and named <= portfolio and not on_card <= named:
                block, changed = rebuild(frozenset(named)) or block, True
            elif named and bets - named:
                # B2-RESTES (recette prod 12/10) — la carte nomme un compte HORS des seaux (« à ne pas
                # travailler »…) : elle n'est pas remplacée, mais un pari DÉCLARÉ n'y manque jamais.
                missing = [
                    i
                    for i in tool_block.get("items") or []
                    if isinstance(i, Mapping) and str(i.get("name") or "").strip().casefold() in bets - named
                ]
                completed = validate_reply_block({**block, "items": [*(block.get("items") or []), *missing]})
                if completed is not None:
                    block, changed = completed, True
        parts.append(_fence(block))
    return "\n\n".join(parts) if changed else reply


def _with_priorities_card_id(reply: str, reads: Sequence[Mapping[str, Any]]) -> str:
    """#3769 (reste) — la carte de priorités ÉCRITE PAR LE MODÈLE (la porte la garde) porte le même ``card_id``
    que celle de l'outil : sans lui, « seulement en Occitanie » pose une NOUVELLE carte à l'écran au lieu
    d'actualiser la précédente. Seulement quand tous ses comptes sont dans la lecture de
    ``get_portfolio_priorities`` : une autre liste n'emprunte jamais l'identifiant."""
    read = next((r for r in reversed(reads) if r.get("tool") == "get_portfolio_priorities"), None)
    if not read:
        return reply
    portfolio = {str(n).strip().casefold() for n in (read.get("priorities_names") or []) if n}
    segments = split_reply_blocks(reply)
    if not portfolio or any(segment.kind not in ("text", "block") for segment in segments):
        return reply
    parts: list[str] = []
    changed = False
    for segment in segments:
        if segment.kind == "text":
            if segment.text.strip():
                parts.append(segment.text.strip())
            continue
        block = segment.block or {}
        if block.get("type") == "account_ranking" and not block.get("card_id"):
            named = {str(i.get("name") or "").strip().casefold() for i in block.get("items") or [] if isinstance(i, Mapping)}
            if named and named <= portfolio:
                block, changed = {**block, "card_id": PORTFOLIO_PRIORITIES_CARD_ID}, True
        parts.append(_fence(block))
    return "\n\n".join(parts) if changed else reply


def _with_fit_verdict_capped(reply: str, reads: Sequence[Mapping[str, Any]], labels: dict[str, str]) -> str:
    """#3866.1 (BEL-LAU-1008-015, recette prod 08/10, 2e passe) — « L'adresse, l'ancienneté
    ou l'existence juridique d'une société ne suffisent pas à la recommander. » Recette KO :
    un tour d'horizon purement démographique (``commercial_fit_note`` posé par l'outil,
    aucun signal métier vérifié) rendait quand même un compte classé « Prioritaire » —
    ``commercial_fit_note`` n'était qu'une CONSIGNE au modèle, jamais une vérification
    structurelle.

    Même famille que ``_with_membership_enriched`` juste au-dessus (la porte ne double
    jamais la carte écrite par le modèle, mais la CORRIGE par ce que l'outil a déjà dit) :
    un compte classé ``priority`` SANS ``why_now`` (l'élément réel qui justifierait
    l'adéquation) est rabaissé à ``to_qualify`` — le verdict se NOMME et se rabaisse,
    plutôt que de rester nu sur un critère jamais évalué."""
    if not any(read.get("commercial_fit_unverified") for read in reads):
        return reply
    segments = split_reply_blocks(reply)
    if any(segment.kind not in ("text", "block") for segment in segments):
        return reply
    parts: list[str] = []
    changed = False
    for segment in segments:
        if segment.kind == "text":
            if segment.text.strip():
                parts.append(segment.text.strip())
            continue
        block = segment.block or {}
        if block.get("type") != "account_ranking":
            parts.append(_fence(block))
            continue
        items = []
        capped = 0
        for item in block.get("items") or []:
            if isinstance(item, Mapping) and item.get("level") == "priority" and not item.get("why_now"):
                item = {**item, "level": "to_qualify"}
                capped += 1
            items.append(item)
        if not capped:
            parts.append(_fence(block))
            continue
        not_evaluated = [*(block.get("not_evaluated") or []), labels["fit_unverified_capped"].format(n=capped)]
        validated = validate_reply_block({**block, "items": items, "not_evaluated": not_evaluated})
        if validated is None:
            parts.append(_fence(block))
            continue
        parts.append(_fence(validated))
        changed = True
    return "\n\n".join(parts) if changed else reply


def _absence_card(reads: Sequence[Mapping[str, Any]], labels: dict[str, str]) -> dict | None:
    what = str(reads[-1].get("what") or labels["what_accounts"])
    unlisted = reads[-1].get("unlisted")
    # #4631 — « sans aucun résultat » ne s'écrit que si l'outil n'a RIEN nommé ; sinon on dit combien n'ont pas pu être listés.
    said = (
        labels["empty_unlisted"].format(what=what, n=unlisted)
        if isinstance(unlisted, int) and unlisted > 0
        else labels["empty_what"].format(what=what)
    )
    return validate_reply_block(
        {
            "type": "missing_data",
            "title": labels["empty_title"],
            "missing": [{"what": said, "how": labels["empty_how"]}],
            # #4287.5 — jamais un vide muet : la suite possible se propose.
            "still_possible": labels["empty_next"].split("|"),
        }
    )


_EMPTY_OPENING = re.compile(
    r"^(?:aucun(?:e)?s?\b|plus aucun|rien\b|je n'ai (?:trouv\w+ |pu )?aucun|pas un seul|no\b|none\b|nothing\b|there (?:is|are) no\b)",
    re.IGNORECASE,
)
_EMPTY_SENTENCE_MAX = 400


def _states_emptiness(reply: str, reads: Sequence[Mapping[str, Any]]) -> bool:
    """RV4-E-FIX 4287.4 — la réponse (sans aucune carte) DIT qu'il ne reste rien : une lecture à zéro objet, ou une
    phrase courte qui s'ouvre sur « Aucun… ». Une réponse factuelle ordinaire ne passe jamais ici."""
    if reads and all(int(r.get("count") or 0) == 0 for r in reads):
        return True
    text = reply.strip()
    return bool(text) and len(text) <= _EMPTY_SENTENCE_MAX and bool(_EMPTY_OPENING.match(text))


def _thread_empty_card(reply: str, labels: dict[str, str], proposed_actions: Sequence[str]) -> dict | None:
    """RV4-E-FIX 4287.4 — le vide d'un fil qui a déjà une carte garde la MÊME famille de rendu : une carte d'état
    vide qui porte la phrase de Laura, avec UNE seule suite, jamais celle que le fil a déjà proposée."""
    sentence = _clean(re.sub(r"\s+", " ", reply).strip().rstrip("."), 240) or labels["what_accounts"]
    proposed = {str(a).strip().casefold() for a in proposed_actions}
    next_actions = [a for a in labels["empty_next"].split("|") if a.strip().casefold() not in proposed][:1]
    block: dict[str, Any] = {
        "type": "missing_data",
        "title": labels["empty_title"],
        "missing": [{"what": sentence, "how": labels["empty_how"]}],
    }
    if next_actions:
        block["still_possible"] = next_actions
    return validate_reply_block(block)


def _without_refused_cards(reply: str, card_types: Sequence[str]) -> tuple[str, bool]:
    """#3769.3 — la réponse SANS les cartes refusées par le contrat dont le type est l'une
    de ``card_types`` (le texte et les cartes valides restent, dans l'ordre). Une carte
    refusée finirait aplatie en puces de feuilles (« filter », « Occitanie »…)."""
    segments = split_reply_blocks(reply)
    refused = [
        s for s in segments if s.kind == "invalid" and isinstance(s.value, Mapping) and s.value.get("type") in card_types
    ]
    if not refused:
        return reply, False
    parts = [
        s.text if s.kind == "text" else _fence(s.block) if s.kind == "block" else None
        for s in segments
        if s not in refused
    ]
    return "\n\n".join(part for part in parts if part), True


#: #4462.6 — les outils qui LANCENT une analyse : le vide de ce tour se comble au retour des dossiers.
_ANALYSIS_LAUNCH_TOOLS = frozenset({"start_account_analysis", "analyze_named_companies"})


def _unbuilt_how(actions: Sequence[Mapping[str, Any]], labels: dict[str, str]) -> str:
    """#4462.6 — « Relance la même demande » seulement quand relancer peut rendre autre chose : jamais
    après des analyses lancées ce tour, ni quand le vide vient de comptes absents de l'espace (une recherche
    PAR NOM dans l'espace, qui rendrait le même vide)."""
    tools = [a for a in actions if isinstance(a, Mapping) and a.get("status") != "failed"]
    if any(a.get("tool") in _ANALYSIS_LAUNCH_TOOLS for a in tools):
        return labels["unbuilt_how_launched"]
    by_name = [
        a
        for a in tools
        if a.get("tool") == "search_workspace_accounts" and isinstance(a.get("input"), Mapping) and a["input"].get("query")
    ]
    # #4705 — « pas dans ton espace » se PROUVE par la sortie de la recherche (`workspace_found`), jamais par le seul
    # fait d'avoir cherché : des comptes trouvés ne sont jamais dits absents, une recherche sans résultat lu ne dit rien.
    if any(int(a.get("workspace_found") or 0) > 0 for a in by_name):
        return labels["unbuilt_how_present"]
    if by_name and all(a.get("workspace_found") == 0 for a in by_name):
        return labels["unbuilt_how_absent"]
    return labels["unbuilt_how"]


def _unbuilt_card(labels: dict[str, str], how: str | None = None) -> dict | None:
    """#3769.3 — une carte refusée SANS lecture d'outil : l'absence se nomme « non
    mesurée », jamais « aucun résultat » (rien ne dit que la recherche est vide)."""
    return validate_reply_block(
        {
            "type": "missing_data",
            "title": labels["unbuilt_title"],
            "missing": [
                {
                    "what": labels["unbuilt_what"].format(what=labels["what_accounts"]),
                    "how": how or labels["unbuilt_how"],
                }
            ],
        }
    )


def route_known_shapes(
    reply: str,
    actions: list[dict[str, Any]],
    *,
    user_message: str | None,
    language: str | None = None,
    remembered_run_account_search: Mapping[str, Any] | None = None,
    prior_card_family: str | None = None,
    proposed_actions: Sequence[str] = (),
) -> str:
    """LA porte de forme (unique appelant : ``run_chat_with_tools``). Retire de chaque action ce qu'elle porte
    pour la porte (jamais vers l'écran), puis :
      1. replis historiques verdict (#3395) et contacts (#3229) ;
      2. formes connues (#3707 / #3762 / #3767 / #3771) : la carte part si la réponse n'en porte aucune qui
         satisfasse la forme attendue ; sinon l'absence d'objet se nomme.
    Réponse sans lecture de forme connue ⇒ inchangée, à l'octet."""
    verdict_block = None
    contact_block = None
    meeting_recap_block = None
    manager_review_block = None
    progress_block = None
    comparison_block = None
    reads: list[dict[str, Any]] = []
    for action in actions:
        verdict_block = action.pop("verdict_block", None) or verdict_block
        contact_block = action.pop("contact_block", None) or contact_block
        meeting_recap_block = action.pop("meeting_recap_block", None) or meeting_recap_block
        manager_review_block = action.pop("manager_review_block", None) or manager_review_block
        progress_block = action.pop("progress_block", None) or progress_block
        comparison_block = action.pop("comparison_block", None) or comparison_block
        read = action.pop("shape_read", None)
        if read:
            reads.append(read)
    reply = with_verdict_card(with_contact_card(reply, contact_block), verdict_block)
    # #4611.3 — l'avancement du travail lancé : la carte de l'OUTIL part, ses chiffres font foi. Une
    # `comparison` écrite par le modèle (avec les siens) est remplacée, jamais doublée.
    if progress_block:
        reply = with_progress_card(reply, progress_block)
    reply = _raw_bucket_tokens_named(reply, _labels(language))

    family = classify_reply_family(user_message or "")
    # #3769.3 — une carte de la famille demandée REFUSÉE par le contrat ne part jamais en
    # puces : retirée ici, puis remplacée par la carte de l'outil, ou par une absence nommée.
    reply, dropped_refused = _without_refused_cards(reply, reply_family_cards(family))
    # #4705.2 — la comparaison bâtie du résultat de `compare_accounts` prend la place d'une carte que le contrat a
    # refusée ; une `comparison` valide du modèle (ou celle de l'avancement, ci-dessus) n'est jamais doublée (GA-26).
    if comparison_block and "comparison" not in _block_types(reply):
        reply = _with_card(reply, comparison_block)
    # #4287.4 — « prochaine action et ce qui manque » : UNE famille de rendu (la carte `verdict`), quels que soient
    # l'outil appelé ce tour et la forme que le modèle a choisie ; « Ce qui manque » y est toujours rendu.
    if family == "account_next_step":
        return as_one_verdict_card(reply, _labels(language)["nothing_missing"])
    present = _block_types(reply)

    # RV4-E-FIX 4287.4 — un raffinement n'a aucun marqueur de famille et le modèle répond souvent de mémoire :
    # un VIDE dans un fil qui a déjà une carte reste une carte (état vide), jamais un texte brut.
    if prior_card_family and not present and not dropped_refused and _states_emptiness(reply, reads):
        card = _thread_empty_card(reply, _labels(language), proposed_actions)
        if card:
            return _fence(card)

    # #3758 (reste du lot J14) — post_meeting_summary a sa règle PROPRE, hors du
    # registre générique : son compte « zéro » (aucun compte rendu enregistré)
    # ne doit jamais se lire comme l'absence d'objet d'un AUTRE appel de
    # `get_account_briefing` (dossier de compte, verdict…) dans le même tour.
    if family == "post_meeting_summary" and "post_meeting_summary" not in present:
        if meeting_recap_block:
            return _with_card(reply, meeting_recap_block)
        card = _absence_card([{"what": _labels(language)["what_meeting_recap"]}], _labels(language))
        if card:
            return f"{reply.strip()}\n\n{_fence(card)}" if reply.strip() else _fence(card)
        return reply

    # #2985 (lot E07 08/10) — même famille de traitement : « point manager … sur
    # <compte> » appelle `get_account_manager_review` (compte NOMMÉ), jamais
    # `get_portfolio_priorities` (portefeuille) — les deux partagent la famille
    # `account_manager_overview` (GA-26), seul l'outil réellement appelé distingue
    # la carte. Un outil en ERREUR (compte introuvable, pont éteint) ne produit
    # aucun bloc : l'erreur se dit dans le texte du modèle, jamais une carte vide.
    if family == "account_manager_overview" and manager_review_block and "manager_review" not in present:
        return _with_card(reply, manager_review_block)

    if not reads:
        # #3704 (re-lotée G03, recette prod 09/10 aef69661e9) — un tour « donne-moi aussi
        # des besoins » répondu SANS rappeler `run_account_search` (le modèle complète sa
        # propre carte account_ranking de mémoire) n'a AUCUNE lecture de ce tour, mais peut
        # quand même avoir omis la géographie du fil : seul ce point précis se corrige sans
        # lecture, par le repli mémoire (`_geo_axes_from_remembered_search`) — jamais la
        # correction d'appartenance/titre, qui a BESOIN d'une lecture fraîche pour ne rien
        # deviner.
        if "account_ranking" in present and (
            _geo_axes_from_remembered_search(remembered_run_account_search)
            or _real_offer(reads, remembered_run_account_search)
        ):
            return _with_membership_enriched(reply, reads, remembered_run_account_search, language)
        if dropped_refused and not present & set(reply_family_cards(family)):
            card = _unbuilt_card(_labels(language), _unbuilt_how(actions, _labels(language)))
            if card:
                return f"{reply.strip()}\n\n{_fence(card)}" if reply.strip() else _fence(card)
        return reply

    family_cards = reply_family_cards(family)
    satisfied = set(family_cards) or set().union(*(_TOOL_SATISFIED_BY.get(r["tool"], frozenset()) for r in reads))
    if present & satisfied:
        # #3704.1 — la porte ne double jamais la carte écrite par le modèle, mais lui
        # manque encore `already_in_workspace` quand ce champ n'existait pas avant : il est
        # recopié depuis la lecture de l'outil, jamais une carte nouvelle.
        # #3866.1 — et un compte « Prioritaire » SANS élément métier vérifié, après un tour
        # d'horizon purement démographique, est rabaissé plutôt que laissé nu.
        if "account_ranking" not in present:
            return reply
        # #3399.1 (lot RBI) — une carte tronquée du modèle cède la place à la carte complète de l'outil.
        reply = _with_priorities_card_id(_with_priorities_card_completed(reply, reads), reads)
        reply = _with_access_order(reply, reads, _labels(language))
        return _with_fit_verdict_capped(
            _with_membership_enriched(reply, reads, remembered_run_account_search, language), reads, _labels(language)
        )

    # La forme voulue : celle de la famille de la demande, sinon celle de l'outil (sa première lecture).
    for read in reversed(reads):  # la lecture la plus récente du tour d'abord
        blocks: Mapping[str, Any] = read.get("blocks") or {}
        wanted = [c for c in family_cards if c in blocks] or ([] if family_cards else list(blocks)[:1])
        if wanted:
            return _with_card(reply, blocks[wanted[0]])

    # Aucune carte possible : si la demande relève d'une forme connue et que l'outil a répondu SANS objet,
    # l'absence se NOMME. Des objets rendus mais d'une autre forme ⇒ rien d'inventé, le repli reste mesuré.
    if family_cards and all(int(r.get("count") or 0) == 0 for r in reads) and "missing_data" not in present:
        card = _absence_card(reads, _labels(language))
        if card:
            return f"{reply.strip()}\n\n{_fence(card)}" if reply.strip() else _fence(card)
    if dropped_refused:
        card = _unbuilt_card(_labels(language))
        if card:
            return f"{reply.strip()}\n\n{_fence(card)}" if reply.strip() else _fence(card)
    return reply
