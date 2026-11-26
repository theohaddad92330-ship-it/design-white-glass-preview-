from __future__ import annotations

import base64
import binascii
import logging
import re
import unicodedata
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.prompts import bellum_cv_parse
from app.prompts.bellum_cv import build_system_prompt, build_user_prompt
from app.services import cv_experiences, cv_identity
from app.services.claude_service import call_claude
from app.services.document_reader import read_document
from app.services.document_text import DocumentTextError
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cv", tags=["CV"])


class CvRewriteRequest(BaseModel):
    """Le consultant et la mission, envoyés TELS QUELS par l'API.

    Ce routeur ne lit pas la base : le vivier (`consultants`) appartient à
    NestJS, qui le scope déjà au workspace de l'appelant. Rien à re-résoudre ici,
    et donc aucun risque de fuite entre équipes par cette route.
    """

    consultant: dict[str, Any]
    mission: dict[str, Any]


@router.post("/rewrite")
async def rewrite_cv(req: CvRewriteRequest) -> dict:
    """Réécrit le CV d'un consultant pour une mission (annexe méthodo p22).

    Sans CV source, on ne réécrit RIEN : il n'y a pas de matière, et laisser le
    modèle « composer » à partir de la seule fiche déclarative produirait un CV
    entièrement inventé. C'est un 422 explicite, pas un CV vide.
    """
    cv_text = req.consultant.get("cv_text")
    if not isinstance(cv_text, str) or not cv_text.strip():
        raise HTTPException(status_code=422, detail="cv_text is required to rewrite a CV")

    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(req.consultant, req.mission)

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        result, _usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=dict,
            max_tokens=3000,
            prompt_name="bellum_cv",
            model=model_for("bellum_cv"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # La sortie part telle quelle : c'est l'API qui confronte chaque citation au
    # CV source (`cv-rewrite-guard.ts`). Filtrer ici aussi dupliquerait la règle
    # à deux endroits, et c'est côté API que le CV source fait autorité.
    return {"success": True, "data": result}


class CvExtractRequest(BaseModel):
    """Un fichier de CV, encodé en base64, avec son nom d'origine."""

    file_b64: str
    filename: str | None = None


@router.post("/extract")
async def extract_cv(req: CvExtractRequest) -> dict:
    """Extrait le TEXTE d'un fichier de CV (PDF 3 §3.2).

    Le vivier ne savait recevoir que du texte collé à la main : déposer un CV
    supposait de l'ouvrir, tout sélectionner, copier. L'extraction existait
    pourtant déjà côté IA, pour l'ingestion documentaire — elle n'était
    simplement branchée sur rien du côté talent.

    Deux règles, toutes deux contre un silence :

    - un fichier illisible produit un **422 NOMMÉ** (« probablement un scan »,
      « archive corrompue »), pas une fiche vide. Le §3.2 est explicite :
      « si l'extraction échoue, on le DIT et on propose la saisie » ;
    - aucun appel de modèle ici. L'extraction est déterministe, elle ne coûte
      rien, et le parsing qui vient ensuite est un geste séparé.
    """
    try:
        raw = base64.b64decode(req.file_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Fichier base64 invalide.") from exc

    # #3935 — UN seul lecteur de documents : `read_document` (lecture directe → qualité → recollage →
    # OCR → Claude). Le CV n'y ajoute que deux réglages : la densité de texte par page entre dans le
    # jugement, et le repli par Claude part même sans clé OCR. `partial` (#2542.3, une page jamais lue)
    # voyage jusqu'à la réponse, GA-18/GA-19 : un champ « non trouvé » sur une page jamais lue n'est
    # pas un champ absent du CV.
    try:
        extracted = await read_document(raw, req.filename, judge_pages=True, fallback_without_key=True)
    except DocumentTextError as exc:
        # Fichier valide mais inexploitable (scan, vide, protégé) et aucune voie de repli n'a mieux
        # lu : on le DIT (§3.2 « si l'extraction échoue, on le DIT et on propose la saisie »).
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    text, partial = extracted.text, extracted.partial

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="Aucun texte extractible de ce fichier — saisis le CV à la main.",
        )

    return {"success": True, "data": {"text": text, "chars": len(text), "partial": partial}}


class CvParseRequest(BaseModel):
    """Le TEXTE d'un CV, déjà extrait par `/cv/extract` ou collé à la main."""

    cv_text: str


# Les treize blocs du §4, dans l'ordre. La liste vit ici ET dans le contrat
# partagé : la duplication est assumée, parce que le service IA n'a pas accès
# aux paquets TypeScript — et un test de parité côté API la verrouille.
DETECTION_KEYS = [key for key, _ in bellum_cv_parse.DETECTIONS]


@router.post("/parse")
async def parse_cv(req: CvParseRequest) -> dict:
    """Lit un CV et rend treize blocs, chacun avec sa citation (PDF 3 §4).

    Le validateur est ici, pas seulement dans le prompt : **un champ sans
    citation est RETIRÉ**. C'est la garde qui rend l'écran de revue honnête —
    sans elle, un champ inventé serait indistinguable d'un champ lu, et le
    recruteur validerait les deux du même clic.

    De la même façon, une citation ABSENTE du CV source est retirée : citer de
    mémoire est exactement ce qu'un modèle fait quand il ne trouve pas.
    """
    cv_text = req.cv_text
    if not isinstance(cv_text, str) or not cv_text.strip():
        raise HTTPException(status_code=422, detail="cv_text is required to parse a CV")

    try:
        result, _usage = await call_claude(
            bellum_cv_parse.build_system_prompt(),
            bellum_cv_parse.build_user_prompt(cv_text),
            response_model=dict,
            max_tokens=4000,
            prompt_name="bellum_cv_parse",
            model=model_for("bellum_cv_parse"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    fields = _validate_fields(result.get("fields") if isinstance(result, dict) else None, cv_text)
    # #4401 (N4) — l'identité se complète de ce que le document ÉCRIT (e-mail, téléphone, LinkedIn, nom de
    # la première ligne), et ce qui n'a pas été trouvé se DIT.
    fields, identity_gaps = _complete_identity(fields, cv_text)
    # #4401.2 — au-delà de l'identité : les expériences ÉCRITES sous leur rubrique, quand le modèle n'en rend pas.
    fields = _complete_experiences(fields, cv_text)
    if identity_gaps:
        logger.info("cv_parse: identité incomplète, non trouvé : %s", ", ".join(identity_gaps))
    return {
        "success": True,
        "data": {"fields": fields, "source_chars": len(cv_text), "identity_gaps": identity_gaps},
    }


def _complete_identity(fields: list[dict[str, Any]], cv_text: str) -> tuple[list[dict[str, Any]], list[str]]:
    """#4401 (N4) — complète le bloc ``identity`` avec les coordonnées LUES dans le texte brut.

    Ce n'est pas inventer : chaque pièce ajoutée est un morceau du document, et sa citation EST la valeur
    lue (``_find_quote`` la retrouve, sinon rien n'est ajouté). Le modèle qui a rendu le nom garde sa valeur ;
    on n'y ajoute que ce qui lui manque. Rend aussi la liste de ce qui n'a PAS été trouvé (``name``, ``email``,
    ``phone``) — un champ vide qui se dit, jamais un champ approché."""
    facts = cv_identity.read_contact_facts(cv_text)
    position = next((i for i, field in enumerate(fields) if field.get("detection") == "identity"), None)
    if position is None:
        return fields, []
    current = fields[position]
    value = current.get("value")
    existing = " ".join(str(v) for v in value) if isinstance(value, list) else ("" if value is None else str(value))
    existing_digits = re.sub(r"\D", "", existing)

    haystack, raw_index = _normalise_with_index(cv_text)
    wanted: list[str] = []
    name = cv_identity.guess_name(cv_text) if value is None else None
    if name:
        wanted.append(name)
    email, phone, linkedin = facts["email"], facts["phone"], facts["linkedin"]
    # #4401.2 — la ville à sa forme codée, quand l'identité du modèle n'en porte pas déjà une.
    city = cv_identity.read_city(cv_text)
    if city and _normalise(city) not in _normalise(existing):
        wanted.append(city)
    if email and email.lower() not in existing.lower():
        wanted.append(email)
    if phone and re.sub(r"\D", "", phone) not in existing_digits:
        wanted.append(phone)
    if linkedin and "linkedin" not in existing.lower():
        wanted.append(linkedin)

    added = [(haystack.find(_normalise(piece)), piece) for piece in wanted]
    added = [(pos, piece) for pos, piece in added if pos >= 0]
    gaps = [
        label
        for label, found in (("name", bool(name) or value is not None), ("email", bool(email)), ("phone", bool(phone)))
        if not found
    ]
    if not added:
        return fields, gaps

    pieces = list(added)
    if value is not None:
        for part in _ELLIPSIS.split(str(current.get("source_excerpt") or "")):
            if part.strip() and (pos := haystack.find(_normalise(part))) >= 0:
                pieces.append((pos, part.strip()))
    pieces.sort(key=lambda item: item[0])
    excerpt = " … ".join(dict.fromkeys(piece for _pos, piece in pieces))
    offset = _find_quote(haystack, raw_index, excerpt)
    if offset < 0:
        return fields, gaps
    new_texts = [piece for _pos, piece in sorted(added, key=lambda item: item[0])]
    if value is None:
        new_value: Any = " — ".join(new_texts)
    elif isinstance(value, list):
        new_value = [*value, *new_texts]
    else:
        new_value = " — ".join([str(value), *new_texts])
    confidence = current.get("confidence") if isinstance(current.get("confidence"), (int, float)) else 0.0
    completed = {
        "detection": "identity",
        "value": new_value,
        "confidence": max(float(confidence), 0.8 if not name else 0.7),
        "source_excerpt": excerpt,
        "excerpt_offset": offset,
    }
    return [*fields[:position], completed, *fields[position + 1 :]], gaps


def _complete_experiences(fields: list[dict[str, Any]], cv_text: str) -> list[dict[str, Any]]:
    """#4401.2 — le bloc ``experiences`` complété de ce que la rubrique d'expériences ÉCRIT.

    Le modèle garde la priorité : un bloc qu'il a rendu (et dont la citation s'est retrouvée) n'est jamais
    remplacé. Sinon les lignes lues à la forme (``cv_experiences``) deviennent le bloc, citées par le texte
    même du CV ; aucune ligne lue, le bloc reste absent."""
    position = next((i for i, field in enumerate(fields) if field.get("detection") == "experiences"), None)
    if position is None or fields[position].get("value") not in (None, "", []):
        return fields
    read = cv_experiences.read_experience_lines(cv_text)
    if not read:
        return fields
    haystack, raw_index = _normalise_with_index(cv_text)
    offset = _find_quote(haystack, raw_index, read[0][1].split("\n")[0])
    if offset < 0:
        return fields
    completed = {
        "detection": "experiences",
        "value": [line for line, _source in read],
        "confidence": 0.6,
        "source_excerpt": read[0][1].split("\n")[0],
        "excerpt_offset": offset,
    }
    return [*fields[:position], completed, *fields[position + 1 :]]


def _log_dropped(detection: Any, reason: str) -> None:
    """#4401 (N4) — un bloc écarté par le validateur laisse une trace : son nom et son MOTIF."""
    name = detection if isinstance(detection, str) and len(detection) <= 40 else "?"
    logger.info("cv_parse: bloc écarté detection=%s motif=%s", name, reason)


def _validate_fields(raw: Any, cv_text: str) -> list[dict[str, Any]]:
    """Retient ce qui est LU, écarte ce qui est affirmé.

    Trois filtres, chacun contre une façon d'inventer :

    - un bloc inconnu est jeté (le modèle a inventé une catégorie) ;
    - un bloc avec une valeur mais SANS citation est jeté ;
    - un bloc dont la citation ne se retrouve pas dans le CV est jeté — citer de
      mémoire est ce qu'un modèle fait quand il ne trouve pas.

    Un bloc attendu et absent de la réponse est rendu à `null` : « ce CV ne dit
    pas où la personne habite » est une information, et la taire ferait croire à
    un oubli d'affichage.
    """
    haystack, raw_index = _normalise_with_index(cv_text)
    seen: dict[str, dict[str, Any]] = {}

    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        detection = item.get("detection")
        if detection not in DETECTION_KEYS or detection in seen:
            # #4401 (N4) — le MOTIF seul : ni la valeur ni la citation (un CV est une donnée de personne).
            _log_dropped(detection, "unknown_detection" if detection not in DETECTION_KEYS else "duplicate")
            continue

        value = item.get("value")
        excerpt = item.get("source_excerpt")
        excerpt = excerpt.strip() if isinstance(excerpt, str) else ""

        if value is None or value == "" or value == []:
            seen[detection] = _absent(detection)
            continue

        offset = _find_quote(haystack, raw_index, excerpt) if excerpt else -1
        if offset < 0 and detection == "skills":
            # #3811.2 — un tableau de compétences (catégorie | colonne |
            # colonne) sort de l'extracteur entrelacé ou semé en lignes : le
            # modèle RECOMPOSE un extrait qui n'existe nulle part à
            # l'identique. La preuve se prend alors terme par terme : on ne
            # garde QUE les compétences dont le libellé se lit comme un mot
            # du CV — jamais une compétence absente du texte.
            kept, first_offset = _skills_read_in_text(value, haystack, raw_index, cv_text)
            if kept:
                confidence = item.get("confidence")
                seen[detection] = {
                    "detection": detection,
                    "value": kept,
                    "confidence": float(confidence) if isinstance(confidence, (int, float)) else 0.5,
                    "source_excerpt": kept[0],
                    "excerpt_offset": first_offset,
                }
                continue
        if not excerpt or offset < 0:
            # Valeur affirmée sans preuve retrouvable : on garde la QUESTION
            # (le bloc reste, à null) plutôt que la réponse.
            _log_dropped(detection, "no_quote" if not excerpt else "quote_not_found")
            seen[detection] = _absent(detection)
            continue

        confidence = item.get("confidence")
        seen[detection] = {
            "detection": detection,
            "value": value,
            "confidence": float(confidence) if isinstance(confidence, (int, float)) else 0.5,
            "source_excerpt": excerpt,
            "excerpt_offset": offset,
        }

    return [seen.get(key) or _absent(key) for key in DETECTION_KEYS]


# #3811.7 — mesuré en prod (IA 4aa0cf5858) : une fois le libellé retrouvé MOT
# pour MOT dans le CV (ci-dessous), le bloc `skills` mélange encore deux
# choses qui ne sont pas des compétences : l'intitulé de la colonne d'un
# tableau de compétences, et une phrase de mission qui traînait juste à côté.
# Liste COURTE, volontairement : un faux négatif (une rubrique qu'on ne
# reconnaît pas) laisse passer un intitulé ; un faux positif écarterait une
# vraie compétence qui porterait ce nom.
_CATEGORY_HEADINGS = frozenset(
    {
        "développement",
        "developpement",
        "qualité",
        "qualite",
        "base de données",
        "base de donnees",
        "bases de données",
        "bases de donnees",
        "devops",
        "langues",
        "outils",
        "frameworks",
        "compétences",
        "competences",
        "development",
        "quality",
        "database",
        "databases",
        "languages",
        "tools",
        "skills",
    }
)

# Une valeur qui COMMENCE par un de ces noms d'action décrit un FAIT, pas un
# terme qu'on cherche dans une offre de mission — elle appartient à
# `experiences`. `Développement` seul (sans préposition) reste une rubrique,
# pas une mission : la préposition qui suit est ce qui distingue les deux.
_MISSION_ACTION_PREFIXES = (
    "création",
    "creation",
    "développement de",
    "développement des",
    "développement d'",
    "developpement de",
    "developpement des",
    "developpement d'",
    "mise en place",
    "correction",
    "réalisation",
    "realisation",
    "refonte",
    "migration",
)

_MISSION_MIN_WORDS = 5


def _looks_like_a_category_heading(label: str) -> bool:
    return _normalise(label).strip() in _CATEGORY_HEADINGS


def _heads_a_column_of_other_values(label: str, cv_text: str, other_labels: list[str]) -> bool:
    """`label` seul sur sa ligne, la ligne SUIVANTE regroupant au moins DEUX
    AUTRES valeurs déjà lues (« Spring NestJS C/C++ ») : la forme d'un intitulé
    de colonne, jamais celle d'une compétence listée une par ligne — une seule
    autre valeur sur la ligne suivante est le cas normal d'une liste, pas un
    intitulé (#3811.7)."""
    needle = _normalise(label).strip()
    if not needle:
        return False
    lines = cv_text.splitlines()
    normalised_lines = [_normalise(line).strip() for line in lines]
    others = [other for other in other_labels if other != label]
    for index, line in enumerate(normalised_lines):
        if line != needle:
            continue
        next_line = normalised_lines[index + 1] if index + 1 < len(normalised_lines) else ""
        hits = sum(1 for other in others if re.search(rf"(?<!\w){re.escape(_normalise(other))}(?!\w)", next_line))
        if hits >= 2:
            return True
    return False


def _looks_like_a_mission_sentence(label: str) -> bool:
    normalised = _normalise(label).strip()
    if not normalised:
        return False
    if len(normalised.split(" ")) >= _MISSION_MIN_WORDS:
        return True
    return normalised.startswith(_MISSION_ACTION_PREFIXES)


def _skills_read_in_text(value: Any, haystack: str, raw_index: list[int], cv_text: str) -> tuple[list[str], int | None]:
    """Les libellés de `value` qui se lisent comme un MOT du CV, et la position
    brute du premier. `Java` ne se lit pas dans `JavaScript`, `Go` pas dans
    `Google` : le libellé ne doit être collé à aucun caractère de mot.

    #3811.7 — parmi ceux-là, on écarte encore un intitulé de rubrique de
    tableau et une phrase de mission : ce ne sont pas des compétences, même
    quand elles se lisent mot pour mot dans le CV. Les valeurs écartées ne
    disparaissent pas en silence : elles restent dans la trace du bloc (log).
    """
    labels = value if isinstance(value, list) else [value]
    read: list[tuple[str, int]] = []
    for label in labels:
        if not isinstance(label, str):
            continue
        needle = _normalise(label)
        if not needle:
            continue
        match = re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", haystack)
        if match is None:
            continue
        read.append((label, raw_index[match.start()]))

    read_labels = [label for label, _ in read]
    kept: list[str] = []
    dropped: list[tuple[str, str]] = []
    first: int | None = None
    for label, position in read:
        if _looks_like_a_category_heading(label) or _heads_a_column_of_other_values(label, cv_text, read_labels):
            dropped.append((label, "category_heading"))
            continue
        if _looks_like_a_mission_sentence(label):
            dropped.append((label, "mission_sentence"))
            continue
        kept.append(label)
        first = position if first is None else min(first, position)

    if dropped:
        logger.info(
            "skills: %d valeur(s) écartée(s) par le filet déterministe (#3811.7) : %s",
            len(dropped),
            dropped,
        )
    return kept, first


def _absent(detection: str) -> dict[str, Any]:
    return {
        "detection": detection,
        "value": None,
        "confidence": 0.0,
        "source_excerpt": "",
        "excerpt_offset": None,
    }


# #3734 — `Tél :06…|Email :…` dans le CV, `Tél : 06… | Email : …` dans la
# citation : l'espacement autour d'une ponctuation ne distingue pas deux
# citations du même passage, pas plus que la casse ou les retours à la ligne.
_TIGHT_PUNCTUATION = frozenset(":|,;/·•")
# Un extrait recollé de plusieurs lignes (le bloc `identity` : nom, puis
# téléphone et e-mail, puis ville) se rend avec des points de suspension.
_ELLIPSIS = re.compile(r"…|\.{3}")
# #3811 — puces et césures d'un CV exporté.
_BULLETS = frozenset("•▪●◦■□◆◇‣∙➢➤►")
_HYPHENS = frozenset("-\u2010\u2011")
_LINE_WRAP = re.compile(r"[ \t]*\r?\n\s*")


def _normalise_with_index(value: str) -> tuple[str, list[int]]:
    """Casse, espaces et espacement de ponctuation ne distinguent pas deux
    citations du même passage.

    Rend aussi, pour chaque caractère normalisé, sa position dans le texte BRUT :
    l'écran de revue surligne `cv_text[offset:]`, jamais le texte normalisé.
    """
    chars: list[str] = []
    index: list[int] = []
    position = 0
    while position < len(value):
        char = value[position]
        if char.isspace():
            if chars and chars[-1] != " ":
                chars.append(" ")
                index.append(position)
            position += 1
            continue
        # #3811 — un CV exporté d'un autre SaaS : le texte porte des caractères
        # invisibles (trait d'union conditionnel, espace de largeur nulle), des
        # puces, des mots coupés en fin de ligne (`déve-\nloppement`). Rien de
        # cela ne distingue deux citations du même passage.
        if unicodedata.category(char) == "Cf" or char in _BULLETS:
            position += 1
            continue
        if char in _HYPHENS and chars and chars[-1].isalpha():
            wrapped = _LINE_WRAP.match(value, position + 1)
            if wrapped and value[wrapped.end() : wrapped.end() + 1].islower():
                position = wrapped.end()
                continue
        # NFKC défait les ligatures (ﬁ → fi, ﬃ → ffi) et les formes de
        # compatibilité ; chaque caractère produit garde la position du brut.
        for folded in unicodedata.normalize("NFKC", char).casefold():
            if folded.isspace():
                if chars and chars[-1] != " ":
                    chars.append(" ")
                    index.append(position)
                continue
            chars.append(folded)
            index.append(position)
        position += 1
    kept_chars: list[str] = []
    kept_index: list[int] = []
    for position, char in enumerate(chars):
        if char == " ":
            before = kept_chars[-1] if kept_chars else ""
            after = chars[position + 1] if position + 1 < len(chars) else ""
            if not before or not after or before in _TIGHT_PUNCTUATION or after in _TIGHT_PUNCTUATION:
                continue
        kept_chars.append(char)
        kept_index.append(index[position])
    return "".join(kept_chars), kept_index


def _normalise(value: str) -> str:
    return _normalise_with_index(value)[0]


def _find_quote(haystack: str, raw_index: list[int], excerpt: str) -> int:
    """Position BRUTE de la citation dans le CV, ou -1.

    Un extrait recollé (`morceau … morceau`) est accepté si CHAQUE morceau se lit
    dans le CV, dans l'ordre : la garde ne s'assouplit pas, un seul morceau
    introuvable et toute la citation est rejetée.
    """
    pieces = [piece for piece in (_normalise(part) for part in _ELLIPSIS.split(excerpt)) if piece]
    if not pieces:
        return -1
    start = haystack.find(pieces[0])
    if start < 0:
        return -1
    cursor = start + len(pieces[0])
    for piece in pieces[1:]:
        found = haystack.find(piece, cursor)
        if found < 0:
            return -1
        cursor = found + len(piece)
    return raw_index[start]
