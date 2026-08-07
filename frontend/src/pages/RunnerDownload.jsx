import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader, SectionTitle } from "../components/Page.jsx";

function fmtSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// 4개 입력칸 설명 (실행기 화면과 1:1 대응)
const INPUTS = [
  ["① 매크로 파일", "빌더에서 내려받은 .ggm.json 파일을 선택해요."],
  ["② 바이낸스 실거래 여부", "체크하면 메인넷(실제 자금), 해제하면 테스트넷(가짜 자금)이에요."],
  ["③ 바이낸스 API 키 / 시크릿", "실행기 안에서만 쓰고 서버로 전송·저장하지 않아요."],
  ["④ 껄무새 회원 키", "마이페이지에서 발급받아 붙여넣어요. 계정당 1개예요."],
];

const STEPS = [
  {
    t: "빌더에서 매크로 파일 받기",
    d: (
      <>
        <Link to="/builder" className="font-semibold text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-900">매크로 빌더</Link>에서 전략을 만들고 검증한 뒤,
        아래쪽 <b>매크로 파일 내려받기(.ggm.json)</b> 버튼을 눌러요.
      </>
    ),
  },
  {
    t: "마이페이지에서 회원 키 복사",
    d: (
      <>
        <Link to="/mypage" className="font-semibold text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-900">내 활동(마이페이지)</Link> → <b>내 매크로 실행 현황</b>에서
        회원 키를 복사해요. 계정당 1개이고, 재발급하면 기존 키는 무효가 돼요.
      </>
    ),
  },
  {
    t: "실행기 열고 4칸 입력",
    d: "매크로 실행기를 열어 ①매크로 파일 ②실거래 여부 ③API 키/시크릿 ④회원 키를 넣어요.",
  },
  {
    t: "시작 → 마이페이지에서 현황·종료",
    d: (
      <>
        <b>매크로 시작</b>을 누르면 마이페이지 실행 현황에 실시간으로 보여요.
        거기서 <b>매크로만 종료</b> 또는 <b>청산 후 종료</b>로 원격 종료할 수 있어요.
      </>
    ),
  },
];

function DownloadCard() {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api.runnerDownloadInfo()
      .then((d) => alive && setInfo(d))
      .catch((e) => alive && setErr(String(e.message || e)));
    return () => { alive = false; };
  }, []);

  const available = info?.available;
  return (
    <div className="notice-good space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="t-title text-slate-900">Windows용 매크로 실행기</div>
          <div className="t-caption text-slate-500">
            설치 불필요 · 더블클릭 실행
            {available && info.size ? <> · {fmtSize(info.size)}</> : null}
            {available && info.version ? <> · v{info.version}</> : null}
          </div>
        </div>
        {available ? (
          <a
            href={info.url || api.runnerDownloadUrl}
            download
            {...(info.url ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="btn btn-l btn-primary shrink-0"
          >
            실행기 내려받기 (.exe)
          </a>
        ) : (
          <button disabled className="btn btn-l btn-secondary shrink-0" title="배포 준비 중">
            준비 중
          </button>
        )}
      </div>
      {!available && !err && (
        <p className="t-small text-slate-700">
          실행기 배포 파일을 준비하고 있어요. 준비되면 이 버튼으로 바로 받을 수 있어요.
          (개발자: <code className="num">runner/dist</code> 에 exe 를 두거나 <code className="num">RUNNER_EXE_PATH</code> 를 설정하세요.)
        </p>
      )}
      {err && <p className="t-small text-red-600">상태 확인 오류: {err}</p>}
      <p className="t-caption text-slate-500">
        macOS·모바일은 아직 지원하지 않아요. 실거래는 사용자 PC에서 본인 API 키로 실행돼요.
      </p>
    </div>
  );
}

export default function RunnerDownload() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="매크로 실행기"
        title="매크로 실행기 내려받기"
        description="터미널·파이썬 설치 없이, 빌더에서 만든 매크로를 내 PC에서 돌리는 프로그램이에요. 실행 현황과 원격 종료는 마이페이지에서 확인해요."
      />

      <DownloadCard />

      {/* 무엇인가요 */}
      <section>
        <SectionTitle>어떤 프로그램인가요</SectionTitle>
        <p className="t-small text-slate-700 measure">
          껄무새 빌더에서 만든 <b>매크로 파일(.ggm.json)</b>을 넣으면, 바이낸스 현물/선물에
          조건대로 자동 주문(진입·청산)을 실행하는 실행기예요. 익절·손절·일일 최대손실·최대
          보유시간·재진입 금지 같은 안전장치가 함께 적용돼요. 기본값은 <b>테스트넷(가짜 자금)</b>이에요.
        </p>
      </section>

      {/* 화면 구성 */}
      <section>
        <SectionTitle>화면 구성 (입력 4칸)</SectionTitle>
        <div className="divide-y divide-slate-200">
          {INPUTS.map(([label, desc]) => (
            <div key={label} className="py-3 flex gap-3 flex-wrap">
              <div className="t-label font-bold text-slate-900 w-full sm:w-56 shrink-0">{label}</div>
              <div className="t-small text-slate-700 flex-1 min-w-0">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 사용법 */}
      <section>
        <SectionTitle>사용법 (4단계)</SectionTitle>
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="num shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="t-label font-bold text-slate-900">{s.t}</div>
                <div className="t-small text-slate-700 mt-0.5">{s.d}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Windows 경고 우회 */}
      <section>
        <SectionTitle>실행 시 Windows 경고가 뜨면</SectionTitle>
        <div className="notice space-y-2">
          <p className="t-small text-slate-700">
            서명되지 않은 새 프로그램이라 처음 실행할 때 <b>"Windows의 PC 보호"(SmartScreen)</b>
            파란 창이 뜰 수 있어요. 정상이며, 아래처럼 실행하면 돼요.
          </p>
          <ol className="t-small text-slate-700 list-decimal pl-5 space-y-1">
            <li>파란 창에서 <b>추가 정보</b>를 눌러요.</li>
            <li>아래에 나타나는 <b>실행</b> 버튼을 눌러요.</li>
          </ol>
          <p className="t-small text-slate-700">
            백신이 새 exe 를 오탐(차단·삭제)하는 경우도 있어요. 이때는 백신의 <b>격리/차단 목록</b>에서
            이 파일을 <b>허용(예외 추가)</b>하고 다시 받아 실행하세요.
          </p>
          <p className="t-caption text-slate-500">
            다운로드는 껄무새 서버에서만 받고, 출처가 불분명한 재배포본은 쓰지 마세요.
          </p>
        </div>
      </section>

      {/* 안전·책임 */}
      <section>
        <SectionTitle>안전·책임 안내</SectionTitle>
        <ul className="t-small text-slate-700 list-disc pl-5 space-y-1.5">
          <li><b>API 키는 서버로 가지 않아요.</b> 실행기가 내 PC에서만 사용하고, 서버로 전송·저장·기록하지 않아요.</li>
          <li><b>출금 기능이 없어요.</b> 진입/청산 주문만 해요. API 키 발급 시 출금 권한은 끄는 걸 권해요.</li>
          <li><b>실거래(메인넷)는 실제 자금이 움직여요.</b> 실행기에서 실거래 체크를 켜야 하고, 경고 확인 단계가 있어요. 처음엔 소액부터.</li>
          <li>레버리지·숏은 원금 초과 손실(청산)이 날 수 있어요. 손절을 꼭 설정하세요.</li>
          <li>본 도구는 투자 조언이 아니며, 실거래 손익 책임은 사용자 본인에게 있어요.</li>
        </ul>
      </section>

      <div className="flex items-center gap-3 flex-wrap pt-2">
        <Link to="/builder" className="btn btn-m btn-secondary">매크로 빌더로 가기</Link>
        <Link to="/mypage" className="btn btn-m btn-secondary">마이페이지에서 회원 키 보기</Link>
      </div>
    </div>
  );
}
