// 화면 골격 — 제목 줄, 빈 상태, 로딩, 오류.
//
// 이 네 가지는 화면마다 다시 짜여 있었다. 리더보드는 제목+뱃지, 게시판은
// 제목+부제+버튼, 코인동향은 제목+부제, 마이페이지는 제목이 아예 없었고,
// "불러오는 중…"이 여섯 가지 크기·색으로 흩어져 있었다. 같은 것은 같게 보여야
// 화면을 옮겨 다닐 때 눈이 다시 적응하지 않는다.

// 제목(t-h2) · 부제(t-small) · 우측 액션. 부제는 measure 로 한 줄 길이를 묶는다.
export function PageHeader({ title, description, actions, eyebrow, headingAs: Heading = "h1" }) {
  return (
    <header className="flex items-start justify-between gap-5 flex-wrap mb-7">
      <div className="min-w-0">
        {eyebrow && <div className="t-caption text-slate-500 mb-2">{eyebrow}</div>}
        <Heading className="t-h2 text-slate-900">{title}</Heading>
        {description && <p className="mt-3 t-small text-slate-700 measure">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

// 섹션 제목 — 페이지 안 구획. 개수는 캡션으로 뒤에 붙인다.
export function SectionTitle({ children, count, className = "" }) {
  return (
    <div className={"flex items-center gap-2 mb-3 " + className}>
      <h2 className="t-title text-slate-900">{children}</h2>
      {count != null && <span className="t-caption text-slate-500 num">({count})</span>}
    </div>
  );
}

export function Loading({ label = "불러오는 중…" }) {
  return <div className="py-10 text-center t-small text-slate-500" role="status">{label}</div>;
}

export function ErrorNote({ children }) {
  return <div className="notice-risk t-small text-slate-700" role="alert">{children}</div>;
}

// 빈 상태 — 제목 한 줄 + 다음에 뭘 하면 되는지. 상자를 두르지 않는다(§1-3).
export function EmptyState({ title, children, action }) {
  return (
    <div className="py-14 text-center">
      <div className="t-title text-slate-900">{title}</div>
      {children && <p className="mt-2 t-small text-slate-700 measure mx-auto">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

// 목록 안에서 쓰는 축약형 — 섹션 하나가 비었을 때.
export function EmptyRow({ children }) {
  return <div className="py-8 text-center t-small text-slate-500">{children}</div>;
}
