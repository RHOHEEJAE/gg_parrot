import { useMemo, useState } from "react";

// 코린이(코인 입문자)용 가이드 — 문서(docs) 형식: 좌측 목차 + 검색 + 본문.
// 각 섹션은 검색용 plain `text`와 렌더용 `body`(JSX)를 함께 갖는다.

function P({ children }) {
  return <p className="text-slate-700 leading-relaxed mb-3">{children}</p>;
}
function H({ children }) {
  return <h3 className="text-slate-900 font-bold mt-5 mb-2">{children}</h3>;
}
function Note({ children }) {
  return (
    <div className="my-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
      {children}
    </div>
  );
}
function Steps({ items }) {
  return (
    <ol className="list-decimal pl-5 space-y-1.5 text-slate-700 mb-3">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  );
}

const RULES = [
  ["A", "익절/손절 후 재진입", "평단 대비 +X% 오르면 익절(또는 -Y% 내리면 손절)하고, 비면 다시 진입해요. 가장 기본형."],
  ["B", "지정가 밴드 매매", "정한 가격 이하에서 사고, 정한 가격 이상에서 팔아요. '싸게 사서 비싸게' 단순 규칙."],
  ["C", "정기 분할매수(DCA)", "N일마다 정해진 금액만큼 계속 매수. 평단을 시간에 분산시켜요. 롱 전용."],
  ["D", "그리드 매매", "상·하단 구간을 격자로 나눠, 내려가면 사고 한 칸 오르면 파는 걸 반복. 횡보장에 강해요."],
  ["E", "트레일링 스탑", "+X% 이익이 난 뒤부터 고점 대비 Y% 빠지면 청산. 이익을 따라 올라가며 지켜요."],
  ["F", "RSI 조건 매매", "RSI가 낮으면(과매도) 진입, 높으면(과매수) 청산. 대표적인 지표 전략."],
  ["G", "볼린저밴드", "밴드 하단 터치에 사서 중앙선/상단에 파는 역추세, 또는 밴드 돌파에 따라가는 돌파형."],
  ["H", "마틴게일 / 세이프티오더", "가격이 내려갈수록 추가 매수(물타기)로 평단을 낮추고, 평단 대비 +X%에 익절. 자금 관리가 핵심."],
  ["I", "변동성 돌파", "전일 변동폭의 k배만큼 오늘 시가에서 오르면 진입(래리 윌리엄스 전략)."],
  ["J", "이동평균 크로스", "단기 이평선이 장기 이평선을 위로 뚫으면(골든크로스) 진입, 아래로 뚫으면(데드크로스) 청산."],
  ["K", "하락 방어 전환(SAR)", "롱을 들고 있다가 하락하면 일부 매도 후 숏으로 전환해 방어. 선물 전용."],
];

const SECTIONS = [
  {
    id: "start",
    title: "껄무새가 뭐예요?",
    text: "껄무새 소개 교육 모의 페이퍼 백테스트 실거래 아님 코린이 입문",
    body: (
      <>
        <P>
          껄무새는 <b>실제 돈을 넣지 않고</b> 코인 매매 전략(매크로)을 만들어보고, 과거 데이터로
          돌려보고(<b>백테스트</b>), 실시간 모의로 굴려보는(<b>페이퍼 트레이딩</b>) <b>교육용 놀이터</b>예요.
        </P>
        <P>목표는 "돈 잃지 않고 배우기". 여기서 마음껏 실패하면서 감을 잡는 게 핵심이에요.</P>
        <Note>⚠️ 껄무새 안의 모든 수치는 과거/모의 시뮬레이션 결과예요. 투자 조언이 아니고, 수익을 보장하지 않아요.</Note>
      </>
    ),
  },
  {
    id: "buy-transfer",
    title: "코인 사서 바이낸스로 옮기기 (한국 투자자)",
    text: "업비트 빗썸 트론 이더리움 전송 바이낸스 지갑 usdt 매수 출금 네트워크 수수료 김프",
    body: (
      <>
        <P>
          한국 거래소(업비트·빗썸)에서는 <b>원화로 코인</b>을 사고, 해외 거래소(바이낸스)에서는 보통
          <b> USDT</b>로 매매해요. 그래서 "원화 → 코인 → 바이낸스로 전송 → USDT" 흐름을 많이 씁니다.
        </P>
        <H>보통의 흐름</H>
        <Steps
          items={[
            "업비트/빗썸에서 원화로 전송이 빠르고 수수료가 싼 코인(예: 트론 TRX, 리플 XRP, 이더리움 ETH)을 매수해요.",
            "바이낸스에서 그 코인의 '입금(Deposit)' 주소 + 네트워크를 확인해요. (예: TRX는 TRON 네트워크)",
            "업비트/빗썸의 '출금'에서 바이낸스 입금 주소로 보내요. 네트워크가 양쪽 동일한지 꼭 확인!",
            "몇 분~하루 안에 바이낸스 지갑에 코인이 들어오면, 그 코인을 팔아 USDT로 바꿔요.",
            "이제 그 USDT로 원하는 코인을 매매하면 됩니다.",
          ]}
        />
        <Note>
          🚨 <b>네트워크·주소를 틀리면 자산이 사라질 수 있어요.</b> 첫 전송은 꼭 소액으로 테스트하세요.
          전송 코인/네트워크 선택, 수수료, 한국 거래소의 트래블룰(수취인 확인)도 미리 확인하세요.
          이건 절차 설명일 뿐 특정 코인 추천이 아니고, 실제 자산 이동 책임은 본인에게 있어요.
        </Note>
        <P>
          참고로 한국 가격이 해외보다 비싼 정도를 <b>김치 프리미엄(김프)</b>이라고 해요. 껄무새 상단에서
          김프를 참고용으로 볼 수 있어요.
        </P>
      </>
    ),
  },
  {
    id: "long-short",
    title: "롱 포지션 / 숏 포지션이 뭐예요?",
    text: "롱 숏 포지션 공매도 상승 하락 현물 선물 레버리지",
    body: (
      <>
        <H>롱(Long) = 오르면 이익</H>
        <P>싸게 사서 비싸게 파는 거예요. 가격이 <b>오르면</b> 이익. 현물 매수도 롱이에요.</P>
        <H>숏(Short) = 내리면 이익</H>
        <P>
          빌려서 먼저 팔고 나중에 싸게 되사는 방식(공매도). 가격이 <b>내리면</b> 이익이에요. 숏은
          <b> 선물</b>에서만 가능하고, 오르면 손실이 이론상 무제한이라 <b>손절이 필수</b>예요.
        </P>
        <Note>
          🧨 <b>레버리지</b>는 수익도 손실도 배로 키워요. 예: 10배면 가격이 약 10%만 반대로 움직여도
          <b> 청산(투입금 전액 손실)</b>돼요. 코린이라면 레버리지는 낮게(1~3배) 또는 안 쓰는 걸 권해요.
        </Note>
      </>
    ),
  },
  {
    id: "rules",
    title: "규칙(전략) A~K 설명",
    text: "규칙 전략 A B C D E F G H I J K 익절 손절 DCA 그리드 트레일링 RSI 볼린저 마틴게일 변동성돌파 이동평균 골든크로스 SAR " +
      RULES.map((r) => r[1] + " " + r[2]).join(" "),
    body: (
      <>
        <P>껄무새 빌더에서 고를 수 있는 전략들이에요. 하나를 고르고 숫자(파라미터)만 조정하면 돼요.</P>
        <div className="space-y-2">
          {RULES.map(([k, name, desc]) => (
            <div key={k} className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2">
              <div className="font-bold text-slate-900">
                <span className="inline-block w-6 text-indigo-600">{k}</span> {name}
              </div>
              <div className="text-sm text-slate-700">{desc}</div>
            </div>
          ))}
        </div>
        <Note>어떤 걸 골라야 할지 모르겠다면, <b>A(익절/손절)</b>나 <b>C(DCA)</b>처럼 단순한 것부터 백테스트해보며 감을 잡아요.</Note>
      </>
    ),
  },
  {
    id: "read-result",
    title: "백테스트 결과 읽는 법",
    text: "백테스트 수익률 MDD 최대낙폭 승률 샤프 손익비 홀딩 HODL 페이퍼 자산곡선",
    body: (
      <>
        <P>백테스트는 과거 데이터로 이 전략을 돌렸다면 어땠을지 보여줘요. 숫자 뜻만 알면 절반은 이해한 거예요.</P>
        <Steps
          items={[
            "수익률: 기간 끝 최종 손익. '그냥 홀딩(HODL)'보다 나은지 함께 봐요.",
            "MDD(최대낙폭): 가는 길에 최고점 대비 얼마나 깊게 빠졌나. 수익률만큼 중요해요 — 실제로 버텨야 하니까.",
            "승률 / 손익비(PF): 몇 번 중 이겼나 / 번 돈 대비 잃은 돈 비율.",
            "샤프지수: 변동성(위험) 대비 수익. 1 이상이면 준수.",
            "최대 연속손절: 몇 번 연속으로 손절났나 — 심리적으로 버티기 힘든 구간의 신호.",
          ]}
        />
        <P>결과 밑의 <b>🦜 껄무새 AI 해설</b>을 누르면 "왜 이렇게 나왔는지 + 이 매크로를 쓴다면" 관점을 쉽게 정리해줘요.</P>
        <Note>⚠️ 백테스트가 좋아도 '과거의 한 구간'일 뿐이에요. 다른 기간·다른 종목에서도 되는지 확인하는 습관(과최적화 주의)이 중요해요.</Note>
      </>
    ),
  },
  {
    id: "leaderboard",
    title: "리더보드 · 포인트 · 언락",
    text: "리더보드 포인트 언락 등록 수익률 경쟁 왕관 판매 70% 마이페이지 AI 챌린지",
    body: (
      <>
        <P>
          <b>오늘의 리더보드</b>에 내 매크로를 등록하면 실시간 모의 수익률로 다른 사람들과 겨뤄요. 매일
          자정(KST)에 초기화돼요.
        </P>
        <Steps
          items={[
            "회원가입하면 스타터 포인트를 줘요(헤더의 🪙).",
            "남의 매크로는 아이디·종목·등락률만 보이고, 🔓 포인트를 쓰면 전략과 매크로가 공개+복사돼요.",
            "내 매크로를 남이 언락하면 그 포인트의 70%가 나에게 적립돼요.",
            "판매·좋아요가 쌓이면 아이디에 👑이 붙어요. 내 활동은 마이페이지에서 확인해요.",
          ]}
        />
        <Note>포인트는 서비스 내 가상 재화예요. 실거래/투자 자문이 아니에요.</Note>
      </>
    ),
  },
  {
    id: "faq",
    title: "코린이 자주 헷갈리는 것",
    text: "FAQ 자주 묻는 질문 실거래 되나요 왜 안 사요 조건 진입 청산 리플레이 라이브 종목 심볼 BTCUSDT 헷갈림",
    body: (
      <>
        <H>실제로 돈이 움직이나요?</H>
        <P>아니요. 껄무새는 모의(페이퍼)만 해요. 실제 주문/자산 이동은 없어요.</P>
        <H>백테스트에서 매매가 0번이에요.</H>
        <P>진입 조건이 그 기간에 한 번도 안 맞은 거예요. 조건을 느슨하게 하거나 기간·봉 단위를 바꿔보세요.</P>
        <H>종목(symbol)은 어떻게 쓰나요?</H>
        <P>거래쌍 형식이에요. 예: 비트코인은 <b>BTCUSDT</b>, 이더리움은 <b>ETHUSDT</b>.</P>
        <H>실시간 / 데모 리플레이 차이는?</H>
        <P>실시간은 지금 시세로, 데모 리플레이는 최근 시세를 빠르게 되감아 보여줘요(발표·데모용).</P>
        <Note>더 궁금한 게 있으면 상단 메뉴의 각 화면에서 ⓘ 아이콘을 눌러 용어 설명을 볼 수 있어요.</Note>
      </>
    ),
  },
];

export default function Guide() {
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return SECTIONS;
    return SECTIONS.filter(
      (s) => s.title.toLowerCase().includes(query) || s.text.toLowerCase().includes(query)
    );
  }, [q]);

  // Keep a valid active section as the filter changes.
  const active = filtered.find((s) => s.id === activeId) || filtered[0] || null;

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-6">
      {/* sidebar */}
      <aside className="md:sticky md:top-20 self-start">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 가이드 검색…"
          className="w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm text-slate-900 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <nav className="space-y-1">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={
                "w-full text-left px-3 py-2 rounded-lg text-sm " +
                (active && active.id === s.id
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-slate-600 hover:bg-slate-100")
              }
            >
              {s.title}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-sm text-slate-400 px-3 py-2">검색 결과가 없어요.</div>
          )}
        </nav>
      </aside>

      {/* content */}
      <article className="rounded-2xl bg-surface border border-slate-200 p-6 min-w-0">
        {active ? (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-4">{active.title}</h2>
            {active.body}
          </>
        ) : (
          <div className="text-slate-500">문서를 선택하세요.</div>
        )}
        <p className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400">
          본 가이드는 교육용 정보이며 투자 조언이 아닙니다. 실제 거래·자산 이동의 책임은 본인에게 있습니다.
        </p>
      </article>
    </div>
  );
}
