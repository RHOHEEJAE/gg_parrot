import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../lib/auth.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// 로그인 계정만 여는 글쓰기 폼(제목/본문 + 이미지 jpg·png 1장).
function Composer({ onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function pickImage(e) {
    setErr("");
    const f = e.target.files?.[0];
    if (!f) {
      setImage(null);
      setPreview("");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(f.type)) {
      setErr("JPG 또는 PNG 이미지만 올릴 수 있어요.");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setErr("이미지는 2MB 이하만 올릴 수 있어요.");
      e.target.value = "";
      return;
    }
    setImage(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    setErr("");
    if (!title.trim()) return setErr("제목을 입력해 주세요.");
    setBusy(true);
    try {
      const post = await api.boardCreate({ title: title.trim(), body, image });
      onCreated(post);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface border border-slate-200 p-5 space-y-3">
      <div className="font-semibold text-slate-800">✍️ 새 글 쓰기</div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        maxLength={120}
        className="w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="내용을 입력하세요"
        rows={6}
        maxLength={5000}
        className="w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <span className="rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 px-3 py-1.5">📷 사진 첨부</span>
          <input type="file" accept="image/png,image/jpeg" onChange={pickImage} className="hidden" />
          <span className="text-xs text-slate-400">JPG·PNG · 2MB 이하</span>
        </label>
      </div>
      {preview && (
        <div className="relative inline-block">
          <img src={preview} alt="미리보기" className="max-h-48 rounded-lg border border-slate-200" />
          <button
            onClick={() => {
              setImage(null);
              setPreview("");
            }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 text-white text-xs"
          >
            ✕
          </button>
        </div>
      )}
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 py-2 text-sm font-bold text-white"
        >
          {busy ? "등록 중…" : "등록"}
        </button>
        <button onClick={onCancel} className="rounded-lg bg-slate-200 hover:bg-slate-300 px-4 py-2 text-sm">
          취소
        </button>
      </div>
    </div>
  );
}

function Pager({ page, pages, onGo }) {
  if (pages <= 1) return null;
  const nums = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, from + 4);
  for (let i = from; i <= to; i++) nums.push(i);
  const btn = "min-w-[34px] rounded-lg border px-2 py-1 text-sm ";
  return (
    <div className="flex items-center justify-center gap-1.5 mt-6 flex-wrap">
      <button disabled={page <= 1} onClick={() => onGo(page - 1)} className={btn + "border-slate-300 disabled:opacity-30"}>
        ‹
      </button>
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => onGo(n)}
          className={btn + (n === page ? "border-indigo-600 bg-indigo-600 text-white font-semibold" : "border-slate-300 hover:bg-slate-100")}
        >
          {n}
        </button>
      ))}
      <button disabled={page >= pages} onClick={() => onGo(page + 1)} className={btn + "border-slate-300 disabled:opacity-30"}>
        ›
      </button>
    </div>
  );
}

export default function Board() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [composing, setComposing] = useState(false);

  function load(p) {
    setBusy(true);
    api
      .boardList(p, 10)
      .then((d) => setData(d))
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function go(p) {
    setSearchParams({ page: String(p) });
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💬 껄무새 게시판</h1>
          <p className="text-sm text-slate-500 mt-0.5">코린이끼리 전략·질문·정보를 나눠요. (투자 조언 아님)</p>
        </div>
        {token ? (
          <button
            onClick={() => setComposing((v) => !v)}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-bold text-white"
          >
            {composing ? "닫기" : "✍️ 새 글 쓰기"}
          </button>
        ) : (
          <button
            onClick={() => navigate("/login")}
            className="rounded-lg bg-slate-200 hover:bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            title="글쓰기는 로그인 후 이용할 수 있어요"
          >
            🔒 로그인하고 글쓰기
          </button>
        )}
      </div>

      {composing && token && (
        <div className="mb-5">
          <Composer
            onCreated={(post) => {
              setComposing(false);
              navigate(`/board/${post.id}`);
            }}
            onCancel={() => setComposing(false)}
          />
        </div>
      )}

      {busy && <div className="text-slate-400">불러오는 중…</div>}
      {err && <div className="text-red-600 text-sm">오류: {err}</div>}

      {data && (
        <>
          {data.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-500">
              아직 글이 없어요. 첫 글을 남겨보세요!
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-2xl bg-surface border border-slate-200">
              {data.items.map((p) => (
                <li key={p.id}>
                  <Link to={`/board/${p.id}`} className="block px-5 py-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {p.has_image && <span className="mr-1">📷</span>}
                          {p.title}
                          {p.comment_count > 0 && (
                            <span className="ml-1.5 text-xs font-bold text-indigo-600">[{p.comment_count}]</span>
                          )}
                        </div>
                        {p.snippet && <div className="text-sm text-slate-500 truncate mt-0.5">{p.snippet}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-slate-600 font-medium">{p.author_name}</div>
                        <div className="text-[11px] text-slate-400">{p.created_kst}</div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pager page={data.page} pages={data.pages} onGo={go} />
          <p className="mt-4 text-[11px] text-slate-400 text-center">{data.disclaimer}</p>
        </>
      )}
    </div>
  );
}
