"""Un fichier déposé dans la conversation doit ARRIVER jusqu'au modèle.

Signalé en bêta, marqué urgent : « le chatbot ne peut pas lire de fichier PDF,
PNG, DOC, CSV alors qu'il donne la possibilité de les uploader — je veux
pouvoir donner un CV d'un consultant ». Le copilote répondait « je n'ai reçu
aucun fichier », et il disait vrai : le dépôt écrivait bien le document dans la
base de connaissance, mais rien ne le rattachait au message.

La récupération RAG ordinaire ne comblait pas ce trou. Elle cherche par
similarité et cite des extraits de 400 caractères — assez pour rappeler une
référence, inutile pour juger un CV, et rien ne garantit qu'elle retrouve le
document qu'on vient de déposer.
"""

from app.models.chat import ChatAttachedFile
from app.prompts.bellum_advisor import build_system_prompt
from app.services.rag_service import (
    ATTACHED_DOC_CHARS,
    ATTACHED_DOC_MAX,
    ephemeral_attached_documents,
    format_attached_documents,
)


def _prompt(attached: str = "") -> str:
    return build_system_prompt({}, {}, "", "", attached_documents=attached)


class TestFormatAttachedDocuments:
    def test_rend_le_document_bien_au_dela_de_l_extrait_rag(self) -> None:
        # 400 caractères, c'est ce que rend la base de connaissance : sur un CV,
        # ça s'arrête au nom et à la première ligne d'expérience.
        cv = "Expérience Kubernetes " * 200
        out = format_attached_documents([{"title": "CV Martin", "content": cv}])
        assert "CV Martin" in out
        assert len(out) > 2000

    def test_une_troncature_est_annoncee(self) -> None:
        # Un document coupé en silence se lit comme un document complet : le
        # modèle conclurait sur une fin qu'il n'a jamais vue.
        out = format_attached_documents([{"title": "Long", "content": "x" * (ATTACHED_DOC_CHARS + 500)}])
        assert "document tronqué" in out

    def test_un_document_vide_n_occupe_aucune_place(self) -> None:
        assert format_attached_documents([{"title": "Vide", "content": "   "}]) == ""

    def test_aucun_document_rend_une_chaine_vide(self) -> None:
        assert format_attached_documents([]) == ""
        assert format_attached_documents(None) == ""  # type: ignore[arg-type]

    def test_le_nombre_de_documents_est_borne(self) -> None:
        # Sans borne, un utilisateur qui dépose dix fichiers évince le compte,
        # les contacts et le plan de la fenêtre du modèle.
        docs = [{"title": f"D{i}", "content": f"contenu {i}"} for i in range(10)]
        out = format_attached_documents(docs)
        assert out.count("### ") == 3


class TestEphemeralAttachedFiles:
    """#2148.16 — la pièce jointe de CONVERSATION (cas a) : du texte déjà
    extrait (`/rag/extract`), lu par Laura pour CE tour, jamais une ligne de
    `rag_documents`. `ephemeral_attached_documents` le rend dans la MÊME forme
    que `fetch_documents_by_ids` — `format_attached_documents` ne les
    distingue pas."""

    def test_rejoint_le_meme_bloc_de_prompt_que_les_documents_ingeres(self) -> None:
        files = [ChatAttachedFile(name="cv.pdf", text="Jean Dupont, développeur Kubernetes.")]
        out = format_attached_documents(ephemeral_attached_documents(files))
        assert "cv.pdf" in out
        assert "Jean Dupont" in out

    def test_id_reste_absent_rien_na_ete_ecrit(self) -> None:
        files = [ChatAttachedFile(name="cv.pdf", text="Jean Dupont.")]
        docs = ephemeral_attached_documents(files)
        assert docs[0]["id"] is None

    def test_borne_au_meme_plafond_que_les_documents_ingeres(self) -> None:
        files = [ChatAttachedFile(name=f"f{i}.txt", text=f"contenu {i}") for i in range(ATTACHED_DOC_MAX + 2)]
        assert len(ephemeral_attached_documents(files)) == ATTACHED_DOC_MAX

    def test_sans_piece_rien_najoute_au_prompt(self) -> None:
        assert ephemeral_attached_documents([]) == []
        assert format_attached_documents(ephemeral_attached_documents([])) == ""


class TestPromptBlock:
    def test_le_bloc_apparait_avec_le_document(self) -> None:
        prompt = _prompt(format_attached_documents([{"title": "CV Martin", "content": "Kubernetes, Terraform"}]))
        assert "DOCUMENTS JOINTS" in prompt
        assert "CV Martin" in prompt
        # #1956 — et l'enveloppe voyage jusqu'au prompt : le titre est DANS la
        # balise, pas seulement quelque part dans le texte.
        assert "<attached_documents>" in prompt and "</attached_documents>" in prompt
        fenced = prompt.split("<attached_documents>", 1)[1].split("</attached_documents>", 1)[0]
        assert "CV Martin" in fenced and "Kubernetes, Terraform" in fenced

    def test_sans_document_le_prompt_est_inchange(self) -> None:
        # La discipline du dépôt : une nouveauté ne doit pas déplacer un octet
        # du prompt de ceux qui ne s'en servent pas.
        assert _prompt("") == build_system_prompt({}, {}, "", "")
        assert "DOCUMENTS JOINTS" not in _prompt("")

    def test_le_bloc_interdit_de_completer_le_document(self) -> None:
        # Un CV est une donnée de source : le copilote peut le lire et le
        # citer, jamais lui ajouter une compétence qu'il n'y a pas.
        prompt = _prompt(format_attached_documents([{"title": "CV", "content": "Java"}]))
        assert "ne complète" in prompt
