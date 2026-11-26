"""« Les ESN concurrentes déjà présentes » — section compte (demande Matteo/Théo).

Message au sales ESN qui veut ouvrir un compte : « voici les ESN déjà en place —
soit tu les concurrences, soit tu les sollicites pour du rang 2 (co/sous-traitance,
partenariat) ». Claude + Firecrawl repèrent ces ESN en scrapant la presse (gros
projets gagnés, partenariats annoncés) → ça alimente déjà ``competitors``. Ici on
en fait une vue actionnable, DÉTERMINISTE (aucun appel LLM) : pour chaque ESN
détectée, la preuve de présence + un angle CONCURRENCE et un angle PARTENARIAT
rang-2, croisés avec la liste des ESN connues (battlecard) pour la confiance.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.knowledge import known_esn_intel
from app.services.text_norm import dedup_by_name

# #1799 / #1818 — un nom d'ESN est une société, pas une phrase.
#
# Mesuré en production le 09/09/2026 sur `GET /api/partners/on-my-accounts` :
# 50 entrées, dont 34 n'étaient pas des entreprises. `comp.get("name")` copiait
# la sortie du LLM (`competitors[].name`, prompt `bellum_signals.py`) sans la
# moindre vérification. Deux familles d'accident, deux remèdes :
#
# 1. une décoration de certitude COLLÉE au nom (« Capgemini — probable »,
#    « Probable : Capgemini », « Accenture (probable — ...) ») — retirée par
#    `_strip_certainty_decoration`. La certitude a déjà SA place, calculée
#    plus bas par `_certainty()` ; il n'y a rien à inventer, seulement à ne
#    plus dupliquer dans le nom.
# 2. de la PROSE stockée comme un nom (« Aucun concurrent ESN identifié »,
#    « ESN non identifiée », ou plusieurs sociétés écrasées dans un seul champ
#    par « / » ou « | ») — écartée par `_looks_like_a_company_name`.
#
# Volontairement STRUCTUREL, pas une liste de phrases françaises : une liste
# de phrases exactes serait fausse en anglais et au prochain reformulement du
# modèle.
#
# ─────────────────────────────────────────────────────────────────────────
# #1799 (second tour, 09/09/2026) — LE PRODUCTEUR REFUSE À LA SOURCE CE QUE LA
# LECTURE REFUSE DÉJÀ (#1799 / #1818)
# ─────────────────────────────────────────────────────────────────────────
# Ces treize constantes (douze regex + `MAX_NAME_WORDS`) sont la copie
# EMBARQUÉE — même discipline que `test_consulting_domains_parity.py` — de
# celles portées côté LECTURE par
# `apps/api/src/modules/partner-pipeline/esn-on-accounts-merge.ts`
# (`CERTAINTY_PAREN_RE`, `SHORT_PAREN_RE`, `CERTAINTY_SUFFIX_RE`,
# `CERTAINTY_BARE_SUFFIX_RE`, `CERTAINTY_PREFIX_RE`, `ANY_PAREN_RE`,
# `MULTI_ENTITY_RE`, `COMMA_LIST_RE`, `DASH_CERTAINTY_CLAUSE_RE`,
# `LOWERCASE_START_MULTIWORD_RE`, `GENERIC_HEAD_NOUN_RE`, `AMPERSAND_RE`,
# `NEGATION_RE`, `MAX_NAME_WORDS`). Deux implémentations recopiées à la main
# divergent — c'est le défaut qu'on corrige ici — donc
# `tests/test_esn_presence_ts_parity.py` lit le fichier TS et compare le TEXTE
# de chaque regex, pas seulement son effet, avant de rejouer le même corpus
# (les cas mesurés en production + les 477 raisons sociales du référentiel
# ESN) dans les deux sens.
#
# ⚠️ Exception UNIQUE à la parité TEXTUELLE : `LOWERCASE_START_MULTIWORD_RE`
# est `/^\p{Ll}\S*\s/u` côté TS — un échappement de PROPRIÉTÉ UNICODE
# (catégorie générale « Ll », Lettre minuscule), que le module standard `re`
# de Python ne supporte PAS (seul le paquet tiers `regex`, hors périmètre de
# ce lot, le porte). `_starts_with_lowercase_and_a_second_word` ci-dessous en
# est l'équivalent SÉMANTIQUE exact — `unicodedata.category(c) == "Ll"` EST
# la définition stdlib de cette même catégorie Unicode, pas une approximation
# — vérifié par comportement (voir `test_esn_presence_ts_parity.py`) plutôt
# que par égalité de texte.
#
#   - une parenthèse finale qui COMMENCE par « probable » ;
#   - une parenthèse finale COURTE (≤ 24 caractères, un commentaire —
#     « Acasi (acquis juillet 2026) ») retirée, plus LONGUE (une phrase —
#     « Airbus (client principal, probable partenaire IT) ») gardée pour que
#     la parenthèse SURVIVANTE fasse écarter la ligne entière ;
#   - un mot de certitude en SUFFIXE, avec ou sans tiret devant
#     (« Capgemini — probable » ET « Capgemini probable ») ;
#   - un mot de certitude en PRÉFIXE (« Probable : Capgemini ») ;
#   - un séparateur « / » ou « | », espacé ou non (#1799, troisième tour,
#     10/09/2026 — la branche « / » exigeait encore ses deux espaces alors
#     que son propre commentaire promettait « avec ou sans » ; quatre lignes
#     RÉELLEMENT mesurées le prouvent : « Agences web/e-commerce locales ») →
#     plusieurs sociétés écrasées dans un seul champ ;
#   - une VIRGULE, n'importe où dans le nom (#1799, troisième tour) — le trou
#     PRINCIPAL : « Capgemini, Accenture, Sopra Steria, Atos » fait 5 mots,
#     ne porte ni parenthèse ni négation, rien ne le distinguait d'un vrai nom
#     pour l'ancien filtre. La ligne s'écarte ENTIÈREMENT, jamais rabotée sur
#     sa première entité — la garder attribuerait les comptes des AUTRES
#     entités à la seule société conservée ;
#   - un tiret suivi d'une CLAUSE de plusieurs mots qui se termine par un mot
#     de certitude, pas d'un mot de certitude seul (#1818, 10/09/2026 —
#     « EBTrans — ressources internes probables » : EBTrans est un COMPTE, pas
#     une ESN, et la ligne entière est écartée plutôt que rabotée en
#     « EBTrans ») ;
#   - une PHRASE qui commence par une minuscule (#1799, quatrième tour,
#     10/09/2026 — « cabinet de conseil IT généraliste ») : la règle porte
#     sur la PHRASE, minuscule ET plusieurs mots — un mot SEUL stylisé en
#     minuscules (« coconsult », une vraie ESN du référentiel) survit ;
#   - un nom de tête GÉNÉRIQUE en début de chaîne — « ESN », « Agences »,
#     « Éditeur », « Fournisseur », « Cabinet », « Prestataire »,
#     « Intégrateur » (#1799, quatrième tour — « Agences digitales locales »,
#     « ESN locale Occitanie »), et « Freelances » (#1799, cinquième tour,
#     résidu du 10/09/2026 — « Freelances et micro-agences », mesuré en
#     production sur `GET /api/partners/on-my-accounts` APRÈS les quatre
#     tours précédents : 50 entrées réduites à 2 suspects, dont celle-ci) :
#     nomme la CATÉGORIE, jamais la société. « Groupe » n'y figure PAS —
#     « Groupe Onepoint », « Groupe Open », « Groupe Talan » sont de vraies
#     ESN du référentiel ;
#   - un mot de négation/absence en mot ENTIER (jamais une sous-chaîne, pour
#     ne pas attraper une société dont le nom contiendrait ces lettres :
#     « Business & Decision » ne contient aucun de ces mots) ;
#   - plus de six mots → une phrase, pas un nom (aucune ESN réelle du domaine
#     n'a un nom aussi long).
#
# `AMPERSAND_RE` n'est PAS une règle de rejet : c'est une NORMALISATION,
# appliquée seulement à la clé de RAPPROCHEMENT (voir le repli local dans
# `build_esn_presence`), jamais au test de plausibilité ni au nom affiché.
_CERTAINTY_PAREN_RE = re.compile(r"\s*\(\s*probable\b[^)]*\)\s*$", re.IGNORECASE)
_SHORT_PAREN_RE = re.compile(r"\s*\(([^)]{1,24})\)\s*$")
_CERTAINTY_SUFFIX_RE = re.compile(r"\s*[-–—]\s*probable\s*$", re.IGNORECASE)
_CERTAINTY_BARE_SUFFIX_RE = re.compile(
    r"\s+(probable|possible|supposée?|incertaine?|à\s+confirmer)\s*$", re.IGNORECASE
)
_CERTAINTY_PREFIX_RE = re.compile(r"^\s*probable\s*[:\-–—]\s*", re.IGNORECASE)
_ANY_PAREN_RE = re.compile(r"[()]")
_MULTI_ENTITY_RE = re.compile(r"\s*[/|]\s*")
_COMMA_LIST_RE = re.compile(r",")
_NEGATION_RE = re.compile(r"\b(aucune?s?|non|inconnue?s?)\b", re.IGNORECASE)
_MAX_NAME_WORDS = 6
_DASH_CERTAINTY_CLAUSE_RE = re.compile(
    r"[-–—]\s+\S+(?:\s+\S+)*\s+(?:probables?|possibles?|supposée?s?|incertaine?s?|à\s+confirmer)\s*$",
    re.IGNORECASE,
)
_GENERIC_HEAD_NOUN_RE = re.compile(
    r"^(esn|agences?|éditeurs?|intégrateurs?|fournisseurs?|cabinets?|prestataires?|freelances?)(?=\s|$)",
    re.IGNORECASE,
)
# Le RESTE de la structure de `/^\p{Ll}\S*\s/u` — « un second mot suit le
# premier » — se porte SANS souci en `re` standard ; seul `\p{Ll}` (première
# lettre) ne s'y porte pas. Voir `_starts_with_lowercase_and_a_second_word`.
_MULTIWORD_TAIL_RE = re.compile(r"^\S*\s")
_AMPERSAND_RE = re.compile(r"\s*&\s*")


def _starts_with_lowercase_and_a_second_word(name: str) -> bool:
    """Équivalent SÉMANTIQUE de `LOWERCASE_START_MULTIWORD_RE` côté TS
    (`/^\\p{Ll}\\S*\\s/u`) : « commence par une lettre minuscule (catégorie
    Unicode Ll) ET porte un second mot ». Pas une seule regex Python — `re`
    (module standard) ne supporte pas `\\p{}` (réservé au paquet tiers
    `regex`, hors périmètre de ce lot) — donc deux tests composés :
    `unicodedata.category` pour la catégorie Unicode exacte du premier
    caractère, `_MULTIWORD_TAIL_RE` pour la structure « second mot ».

    Un mot SEUL stylisé en minuscules (« coconsult », une vraie ESN du
    référentiel) n'a pas de second mot : il survit.
    """
    if not name:
        return False
    if unicodedata.category(name[0]) != "Ll":
        return False
    return bool(_MULTIWORD_TAIL_RE.match(name[1:]))


def _strip_certainty_decoration(name: str) -> str:
    """« Capgemini — probable » -> « Capgemini ». La certitude n'est pas
    perdue : `_certainty()` la calcule séparément, déterministe, plus bas.

    ⚠️ L'ORDRE compte et reprend celui de `stripCertaintyDecoration` côté TS :
    la parenthèse de certitude puis la parenthèse COURTE sont retirées AVANT
    le suffixe/préfixe, pour qu'une parenthèse qui encadre un vrai nom
    (« Acasi (acquis juillet 2026) ») ne soit pas jugée sur sa forme brute.
    """
    cleaned = _CERTAINTY_PAREN_RE.sub("", name)
    cleaned = _SHORT_PAREN_RE.sub("", cleaned)
    cleaned = _CERTAINTY_SUFFIX_RE.sub("", cleaned)
    cleaned = _CERTAINTY_BARE_SUFFIX_RE.sub("", cleaned)
    cleaned = _CERTAINTY_PREFIX_RE.sub("", cleaned)
    return cleaned.strip()


def _looks_like_a_company_name(name: str) -> bool:
    """Structurel plutôt que lexical — voir `isPlausibleEsnName` côté TS.

    Une parenthèse SURVIVANTE après `_strip_certainty_decoration` est trop
    longue pour être une précision : c'est une phrase, et une phrase ne
    désigne pas une société — la ligne entière est écartée, jamais rabotée en
    un nom qui aurait l'air juste. Même principe pour une VIRGULE (une liste
    de sociétés) et pour une CLAUSE de plusieurs mots après un tiret qui se
    termine par un mot de certitude : jamais rabotée sur la première entité
    ou sur le mot qui précède le tiret — la ligne entière disparaît.
    """
    if not name:
        return False
    if _MULTI_ENTITY_RE.search(name):
        return False
    # #1799 (troisième tour) — une liste séparée par une virgule ne fait pas
    # un nom. La raboter sur sa première entité (« Capgemini » depuis
    # « Capgemini, Accenture, Sopra Steria ») fabriquerait un compte de TROIS
    # comptes attribué à une seule ESN.
    if _COMMA_LIST_RE.search(name):
        return False
    if _ANY_PAREN_RE.search(name):
        return False
    # #1818 — un tiret suivi d'une clause de PLUSIEURS mots qui se termine par
    # un mot de certitude (accordé au pluriel compris) n'est pas la même
    # forme qu'un mot de certitude SEUL après le tiret (déjà retiré plus haut
    # par `_strip_certainty_decoration`) : c'est une phrase, jamais rabotée en
    # ce qui précède le tiret.
    if _DASH_CERTAINTY_CLAUSE_RE.search(name):
        return False
    # #1799 (quatrième tour) — une PHRASE commence par une minuscule quand
    # elle a plusieurs mots (« cabinet de conseil… ») ; un mot seul stylisé en
    # minuscules (« coconsult ») reste une vraie ESN.
    if _starts_with_lowercase_and_a_second_word(name):
        return False
    # #1799 (quatrième tour) — un nom de tête GÉNÉRIQUE (« Agences… », « ESN
    # locale… ») nomme la CATÉGORIE d'une ESN, jamais une société précise.
    if _GENERIC_HEAD_NOUN_RE.search(name):
        return False
    if _NEGATION_RE.search(name):
        return False
    if len(name.split()) > _MAX_NAME_WORDS:
        return False
    return True


def _fold_ampersand_as_et(name: str) -> str:
    """« & » et « et » sont la MÊME conjonction dans une raison sociale —
    voir `foldAmpersandAsEt` côté TS. Repli LOCAL à CE module, appliqué
    uniquement à la clé passée à `dedup_by_name` dans `build_esn_presence` (le
    nom AFFICHÉ n'est jamais touché) : jamais à `text_norm.normalize_name`, le
    normaliseur PARTAGÉ par plus de vingt appelants de ce dépôt — même
    discipline que côté TS, qui ne touche pas non plus au normaliseur
    partagé `marketMatchKey` (appelé par 7 autres fichiers, dont la mémoire
    marché — ~60 000 lignes)."""
    return _AMPERSAND_RE.sub(" et ", name)


def _first_str(*values: Any) -> str:
    for v in values:
        s = str(v or "").strip()
        if s:
            return s
    return ""


def _evidence(comp: dict, intel: dict | None) -> str:
    """Pourquoi on pense que cette ESN est présente : la preuve trouvée par le LLM
    (périmètre / type de contrat / forces sur le compte). Sans preuve → présence
    seulement 'probable'."""
    scope = _first_str(comp.get("scope"))
    contract = _first_str(comp.get("contractType"), comp.get("contract_type"))
    strengths = comp.get("strengths")
    if isinstance(strengths, list):
        strengths = "; ".join(str(s) for s in strengths if s)
    strengths = _first_str(strengths)
    bits = []
    if scope:
        bits.append(f"périmètre : {scope}")
    if contract and contract.lower() != "inconnu":
        bits.append(f"type : {contract}")
    if strengths:
        bits.append(f"forces sur le compte : {strengths}")
    return " · ".join(bits)


def _partnership_angle(name: str, intel: dict | None, scope: str) -> str:
    """Angle rang-2 : comment solliciter cette ESN en co/sous-traitance plutôt que
    l'affronter. S'appuie sur ses offres/secteurs forts (battlecard) quand connue."""
    if intel:
        offers = intel.get("core_offers") or []
        offer_hint = f" (elle est forte sur {', '.join(offers[:2])})" if offers else ""
        return (
            f"Rang 2 : approcher {name} pour de la co/sous-traitance ou un partenariat "
            f"sur les périmètres qu'elle ne couvre pas seule{offer_hint} — se rendre "
            f"complémentaire plutôt que frontal."
        )
    where = f" sur « {scope} »" if scope else ""
    return (
        f"Rang 2 : solliciter {name}{where} pour de la sous-traitance / co-traitance — "
        f"se positionner en renfort de niche là où elle manque de bras ou d'expertise."
    )


def _compete_angle(comp: dict, intel: dict | None) -> str:
    """Angle concurrence : la différenciation trouvée par le LLM, sinon le
    how-to-compete curé de la battlecard."""
    return _first_str(
        comp.get("differentiationStrategy"),
        comp.get("differentiation_strategy"),
        (intel or {}).get("how_to_compete"),
    )


def _certainty(has_evidence: bool, is_known: bool) -> str:
    """Trois niveaux, repris du champ voisin `esnSynergies` — pas un quatrième
    vocabulaire pour la même idée.

    Deux corroborations INDÉPENDANTES valent « forte » : une preuve de périmètre
    trouvée sur ce compte-ci, ET une ESN que la battlecard connaît. Une seule
    vaut « moyenne ». Aucune vaut « faible », et le dire est le but : une ESN
    présente chez un client PRIVÉ est une inférence, jamais un fait — aucune
    source publique ne publie les panels fournisseurs privés.
    """
    if has_evidence and is_known:
        return "forte"
    if has_evidence or is_known:
        return "moyenne"
    return "faible"


# ─────────────────────────────────────────────────────────────────────────
# #1590.7 — LA FUSION « OBSERVÉE + DÉTECTÉE » NE SE FAIT PAS ICI, ET C'EST
# UNE DÉCISION D'ARCHITECTURE — PAS UN OUBLI.
# ─────────────────────────────────────────────────────────────────────────
# Le retour #1590 demande (son test T7) que ``build_esn_presence`` reçoive une
# source supplémentaire — les ESN OBSERVÉES par la mémoire marché — et fusionne
# « observée ET détectée » en une seule entrée à certitude montée. Elle ne s'y
# fera pas. La même décision est écrite côté TypeScript, sur la fonction qui
# fait DÉJÀ cette fusion (``apps/api/src/modules/partners/observed-esn.ts``,
# ``mergePartnerEvidence``) : une décision écrite d'un seul côté se re-propose
# depuis l'autre.
#
# 1. Le résultat est DÉJÀ livré, en AVAL de ce fichier. La sortie ci-dessous
#    part dans ``raw_analysis.esnPresence`` → ``seedDetectedPartners`` en fait
#    des lignes ``account_partners`` → ``PartnersService.landscape`` appelle
#    ``mergePartnerEvidence``, qui rapproche observé et détecté par
#    ``marketMatchKey`` des DEUX côtés et rend UNE ligne portant toutes ses
#    preuves. Et sur une entrée plus large que celle d'ici : elle voit aussi ce
#    qu'un humain a DÉCLARÉ, que ce service n'a pas.
#
# 2. « Certitude montée » ferait PERDRE de l'information. ``_certainty``
#    ci-dessous écrase les corroborations en un mot ; en aval,
#    ``evidence_origins`` les NOMME une par une et l'écran lit la liste.
#
# 3. Fusionner ici promouvrait une OBSERVATION en DÉTECTION. Toute entrée de
#    ``esnPresence`` devient une ligne ``source = 'analysis'``, traduite en
#    aval par « une source ACTUELLE suggère que cette société intervient » —
#    faux d'une observation de parcours, que le corpus ne date pas.
#
# 4. Porter ``marketMatchKey`` ici serait une TROISIÈME recopie manuelle, et la
#    moins gardable. La parité du filtre de plausibilité se prouve en comparant
#    le TEXTE de chaque regex (``tests/test_esn_presence_ts_parity.py``) ;
#    ``marketMatchKey`` n'est pas une regex mais un pipeline (NFD, diacritiques
#    retirés, ponctuation repliée) plus treize mots de structure — rien n'en
#    comparerait le texte. Ce service ne reçoit d'ailleurs pas le corpus, mais
#    la couverture d'UNE entreprise : la clé n'y servirait qu'à se dédoublonner
#    lui-même, jamais à la jointure pour laquelle elle existe.
#
# Ce que ce module garantit à la place, et que ``test_esn_presence.py`` tient :
# sa sortie ne contient QUE des sociétés que le modèle a nommées. Le jour où
# une observation de marché s'y glisserait, ce test le dirait.


def build_esn_presence(competitors: object, detected_at: str | None = None) -> list[dict]:
    """Vue « ESN déjà présentes » à partir des concurrents détectés. Chaque entrée
    porte : preuve de présence, certitude (forte/moyenne/faible), périmètre estimé,
    date de détection, angle CONCURRENCE et angle PARTENARIAT rang-2, + faiblesses
    exploitables / TJM quand l'ESN est dans la battlecard. Déduplique par nom.
    Vide si rien de détecté.

    ``detected_at`` (ISO, la date du run) n'a PAS de défaut « aujourd'hui » :
    une date fabriquée à la lecture rajeunirait la détection à chaque affichage,
    et « cette information date de six mois » est précisément ce qu'il faut voir.
    Absente, elle vaut ``None`` et l'écran le dit.
    """
    if not isinstance(competitors, list):
        return []
    out: list[dict] = []
    for comp in competitors:
        if not isinstance(comp, dict):
            continue
        name = _first_str(comp.get("name"))
        if not name:
            continue
        # #1799 — un nom d'ESN est une société, pas une phrase. La décoration
        # de certitude est retirée d'abord (elle peut entourer un VRAI nom :
        # « Capgemini — probable ») ; ce qui reste doit encore avoir la forme
        # d'un nom de société, sans quoi l'entrée entière est écartée — jamais
        # stockée comme une valeur de remplissage.
        name = _strip_certainty_decoration(name)
        if not _looks_like_a_company_name(name):
            continue
        intel = known_esn_intel(name)
        scope = _first_str(comp.get("scope"))
        evidence = _evidence(comp, intel)
        weaknesses = comp.get("weaknesses")
        if isinstance(weaknesses, str):
            weaknesses = [weaknesses] if weaknesses.strip() else []
        if not weaknesses and intel:
            weaknesses = list(intel.get("weaknesses") or [])[:2]
        out.append(
            {
                "name": name,
                "isKnownEsn": intel is not None,
                # 'confirmée' quand on a une preuve concrète (périmètre/contrat), sinon 'probable'.
                # CONSERVÉ : le dashboard-manager le lit depuis le 06/07, le retirer
                # y viderait la colonne. `certainty` est la lecture à trois niveaux
                # que le produit affiche.
                "presence": "confirmée" if evidence else "probable",
                "certainty": _certainty(bool(evidence), intel is not None),
                "evidence": evidence,
                # Le périmètre estimé chez CE client. Il était lu depuis le premier
                # jour pour composer l'angle rang-2, et jamais rendu.
                "scope": scope or None,
                "detectedAt": detected_at or None,
                # Ce sur quoi la détection s'appuie. `account_vocabulary` lisait
                # déjà ce champ ; personne ne l'avait jamais posé.
                "sourceRefs": [evidence] if evidence else [],
                "competeAngle": _compete_angle(comp, intel),
                "partnershipAngle": _partnership_angle(name, intel, scope),
                "weaknesses": [str(w) for w in (weaknesses or []) if str(w).strip()],
                "tjmRange": _first_str((intel or {}).get("tjm_range")) or None,
            }
        )
    # #1799 (quatrième tour) — « & » replié en « et » AVANT le rapprochement,
    # uniquement pour la clé de dédoublonnage : voir `_fold_ampersand_as_et`
    # pour le rayon de souffle mesuré.
    return dedup_by_name(out, key=lambda d: _fold_ampersand_as_et(d.get("name")))
