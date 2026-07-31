import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../lib/auth.js";

// Themed input surface. `bg-white` must NOT be used here: it is Tailwind's
// literal white, while `text-slate-900` flips to near-white under `.dark`
// (see index.css) — the pair rendered invisible text in dark mode.
const commentInputCls =
  "rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm text-slate-900 " +
  "placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// 댓글 작성 — 리더보드 채팅처럼 계정 없이 '일회성 이름+비밀번호'를 매번 입력.
function CommentForm({ postId, onAdded }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!username.trim() || !password.trim() || !text.trim()) {
      setErr("이름·비밀번호·내용을 모두 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const { comment } = await api.boardAddComment(postId, { username, password, text });
      onAdded(comment);
      setText("");
      // 이름/비밀번호는 남겨둬 연속 작성 편하게 (계정 아님, 일회성 입력값)
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="이름"
          maxLength={24}
          className={"w-1/2 " + commentInputCls}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호(삭제용)"
          className={"w-1/2 " + commentInputCls}
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="댓글을 입력하세요"
        rows={2}
        maxLength={500}
        className={"w-full " + commentInputCls}
      />
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">계정 없이 남길 수 있어요 · 비밀번호는 삭제할 때만 필요</span>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-1.5 text-sm font-bold text-white"
        >
          {busy ? "등록 중…" : "댓글 등록"}
        </button>
      </div>
    </form>
  );
}

function Comment({ c, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function remove() {
    setErr("");
    setBusy(true);
    try {
      await api.boardDeleteComment(c.id, password);
      onDeleted(c.id);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">{c.username}</span>
        <span className="text-[11px] text-slate-400">
          {c.created_kst}
          <button onClick={() => setConfirming((v) => !v)} className="ml-2 text-slate-400 hover:text-red-600">
            삭제
          </button>
        </span>
      </div>
      <div className="text-sm text-slate-800 whitespace-pre-line mt-0.5">{c.text}</div>
      {confirming && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="작성 시 비밀번호"
            className="min-w-0 flex-1 sm:flex-none rounded-lg bg-slate-100 border border-slate-300 px-2 py-1 text-xs text-slate-900 placeholder-slate-400"
          />
          <button onClick={remove} disabled={busy} className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 px-3 py-1 text-xs font-semibold text-white">
            삭제 확인
          </button>
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      )}
    </div>
  );
}

export default function BoardPost() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setPost(null);
    setErr("");
    api
      .boardGet(id)
      .then((d) => setPost(d))
      .catch((e) => setErr(String(e.message || e)));
  }, [id]);

  async function removePost() {
    if (!window.confirm("이 글을 삭제할까요? 되돌릴 수 없어요.")) return;
    setDeleting(true);
    try {
      await api.boardDelete(id);
      navigate("/board");
    } catch (e) {
      setErr(String(e.message || e));
      setDeleting(false);
    }
  }

  if (err) return <div className="max-w-3xl mx-auto text-red-600">오류: {err}</div>;
  if (!post) return <div className="max-w-3xl mx-auto text-slate-500">불러오는 중…</div>;

  const isMine = user && user.id === post.author_user_id;

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/board" className="text-sm text-indigo-600 hover:underline">← 목록으로</Link>

      <article className="mt-3 rounded-2xl bg-surface border border-slate-200 p-5 sm:p-6">
        <h1 className="text-xl font-bold text-slate-900">{post.title}</h1>
        <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm text-slate-500">
            {post.author_name} · {post.created_kst}
          </div>
          {isMine && (
            <button
              onClick={removePost}
              disabled={deleting}
              className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-40"
            >
              {deleting ? "삭제 중…" : "글 삭제"}
            </button>
          )}
        </div>

        {post.image_url && (
          <img
            src={api.boardImageUrl(post.id)}
            alt="첨부 이미지"
            className="mt-4 max-w-full rounded-xl border border-slate-200"
          />
        )}

        {post.body && <div className="mt-4 text-slate-800 whitespace-pre-line leading-relaxed">{post.body}</div>}
      </article>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          댓글 <span className="text-slate-400">({post.comments.length})</span>
        </h2>
        <div className="rounded-2xl bg-surface border border-slate-200 px-4 sm:px-5 divide-y divide-slate-100">
          {post.comments.length === 0 ? (
            <div className="py-4 text-sm text-slate-400">첫 댓글을 남겨보세요.</div>
          ) : (
            post.comments.map((c) => (
              <Comment
                key={c.id}
                c={c}
                onDeleted={(cid) =>
                  setPost((p) => ({ ...p, comments: p.comments.filter((x) => x.id !== cid) }))
                }
              />
            ))
          )}
        </div>
        <div className="mt-3">
          <CommentForm
            postId={post.id}
            onAdded={(comment) => setPost((p) => ({ ...p, comments: [...p.comments, comment] }))}
          />
        </div>
      </section>
    </div>
  );
}
