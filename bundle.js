(function () {
'use strict';

const { useState, useCallback, createContext, useContext, createElement } = React;
const { createPortal, createRoot } = ReactDOM;

// From constants.ts
const COMMAND_TO_COPY = "npx firstvibe";
const CORE_VALUES = [
    {
        title: "Q&A 주도식 자동화",
        description: "간단한 질문 답변으로 아이디어를 구체화하고 PRD를 자동으로 완성합니다."
    },
    {
        title: "한 문장으로 시작",
        description: "복잡한 기획서 없이, 당신의 핵심 아이디어 한 문장이면 충분합니다."
    },
    {
        title: "쉽고, 간편하고, 무료",
        description: "설치나 학습 과정 없이 누구나 즉시 무료로 사용할 수 있습니다."
    },
    {
        title: "비개발자를 위한 설계",
        description: "코딩 지식이 없어도, 논코더도 쉽게 제품의 첫 단계를 만들 수 있습니다."
    }
];
const EXAMPLE_PROJECTS = [
    {
        id: "a",
        oneLiner: "동네 사람들과 함께 달리는 러닝 커뮤니티 앱",
        summary: ["문제 정의: 혼자 뛰기 지루하고 동기 부여가 부족함", "솔루션: 그룹 러닝 생성 및 참여 기능", "핵심 기능: 실시간 위치 공유, 러닝 기록, 동네 랭킹"],
        details: ["사용자 역할: 일반 러너, 크루 리더", "주요 기능:", "1. 러닝 크루 생성/탐색/가입", "2. 정기/일회성 러닝 이벤트 관리", "3. GPS 기반 개인/크루 러닝 기록", "4. 커뮤니티 피드 및 사진 공유", "5. 주간/월간 동네 랭킹 시스템", "기술 요건: React Native, Firebase, Mapbox API"]
    },
    {
        id: "b",
        oneLiner: "개인화된 식단을 추천하고 코칭해주는 챗봇",
        summary: ["사용자 여정: 목표 설정 → 식단 기록 → 피드백 및 추천", "대화 흐름: 자연어 처리로 식사 내용 입력", "기술 요건: RAG, 벡터DB, LLM 기반 대화 엔진"],
        details: ["사용자 목표: 건강한 식습관 형성 및 체중 관리", "핵심 플로우:", "1. 온보딩: 건강 목표(다이어트, 근력 증가 등) 설정", "2. 일일 식단 입력 (텍스트 또는 사진)", "3. 챗봇의 영양소 분석 및 실시간 피드백", "4. 주간 리포트 및 목표 달성률 제공", "5. 목표에 맞는 건강 레시피 추천", "수익 모델: 프리미엄 구독 (전문 영양사 연결)"]
    },
    {
        id: "c",
        oneLiner: "촬영 스튜디오 예약을 위한 SaaS",
        summary: ["사용자 역할: 스튜디오 관리자, 사진 작가(고객)", "핵심 플로우: 스케줄 확인 → 예약 → 결제", "차별점: 장비 대여 옵션, 자동 보증금 정산"],
        details: ["관리자 기능:", "1. 스튜디오 타입/시간대별 가격 설정", "2. 예약 현황 캘린더 뷰", "3. 장비 인벤토리 관리", "4. 고객 관리 및 정산 내역 확인", "고객 기능:", "1. 원하는 날짜/시간 스튜디오 검색", "2. 실시간 예약 및 온라인 결제", "3. 예약 내역 확인 및 변경/취소", "기술 스택: Next.js, Stripe API, PostgreSQL"]
    }
];

// From lib/copy.ts
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return { success: true, method: 'clipboard_api' };
        }
    } catch (err) {
        console.warn('Clipboard API failed, falling back.', err);
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.setAttribute('readonly', '');
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
            return { success: true, method: 'fallback' };
        }
    } catch (err) {
        console.error('Fallback copy failed', err);
        document.body.removeChild(textArea);
    }
    return { success: false, method: 'none' };
}

// From components/icons/...
const ClipboardIcon = ({ className = 'w-6 h-6' }) => (
  createElement('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: className },
    createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5.25H7.525a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25h8.25a2.25 2.25 0 0 0 2.25-2.25v-10.5a2.25 2.25 0 0 0-2.25-2.25H12.75M9 5.25V3.75a2.25 2.25 0 0 1 2.25-2.25h1.5a2.25 2.25 0 0 1 2.25 2.25v1.5M9 5.25h6.75" })
  )
);
const CheckIcon = ({ className = 'w-6 h-6' }) => (
  createElement('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: className },
    createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M4.5 12.75l6 6 9-13.5" })
  )
);
const ChevronDownIcon = ({ className = 'w-6 h-6' }) => (
  createElement('svg', { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", strokeWidth: 1.5, stroke: "currentColor", className: className },
    createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M19.5 8.25l-7.5 7.5-7.5-7.5" })
  )
);

// Toast components
const Toast = ({ message, type, onClose }) => {
    const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    return createElement('div', { role: "status", "aria-live": "polite", className: `flex items-center w-full max-w-xs p-4 text-white ${bgColor} rounded-lg shadow-lg animate-fade-in-right` },
        createElement('div', { className: "inline-flex items-center justify-center flex-shrink-0 w-8 h-8 text-green-200 bg-green-700 rounded-lg" },
            createElement(CheckIcon, { className: "w-5 h-5" })
        ),
        createElement('div', { className: "ml-3 text-sm font-normal" }, message),
        createElement('button', { type: "button", className: "ml-auto -mx-1.5 -my-1.5 bg-white/20 text-white hover:text-gray-900 rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-gray-100 inline-flex h-8 w-8", "aria-label": "Close", onClick: onClose },
            createElement('span', { className: "sr-only" }, "Close"),
            createElement('svg', { className: "w-5 h-5", fill: "currentColor", viewBox: "0 0 20 20", xmlns: "http://www.w3.org/2000/svg" },
                createElement('path', { fillRule: "evenodd", d: "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z", clipRule: "evenodd" })
            )
        )
    );
};
const ToastContext = createContext(null);
const useToast = () => useContext(ToastContext);
let toastId = 0;
const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const showToast = useCallback((message, type = 'success') => {
        const id = toastId++;
        setToasts(prevToasts => [...prevToasts, { id, message, type }]);
        setTimeout(() => {
            removeToast(id);
        }, 2500);
    }, []);
    const removeToast = (id) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    };
    const portalElement = typeof window !== 'undefined' ? document.getElementById('toast-portal') : null;
    return createElement(ToastContext.Provider, { value: { showToast } },
        children,
        portalElement && createPortal(
            createElement('div', { className: "fixed top-5 right-5 z-50 space-y-2" },
                toasts.map(toast =>
                    createElement(Toast, {
                        key: toast.id,
                        message: toast.message,
                        type: toast.type,
                        onClose: () => removeToast(toast.id)
                    })
                )
            ),
            portalElement
        )
    );
};

// Main Components
const CopyButton = ({ className }) => {
    const [isCopied, setIsCopied] = useState(false);
    const { showToast } = useToast();
    const handleCopy = async () => {
        if (isCopied) return;
        const { success } = await copyToClipboard(COMMAND_TO_COPY);
        if (success) {
            showToast('명령어가 복사되었습니다', 'success');
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } else {
            showToast('복사에 실패했습니다. 다시 시도해주세요.', 'error');
        }
    };
    return createElement('button', { onClick: handleCopy, "aria-label": "명령어 복사", className: `focus-ring inline-flex items-center justify-center gap-3 px-6 py-3 font-semibold rounded-lg transition-all duration-200 ${isCopied ? 'bg-green-600 text-white' : 'bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-900'} ${className}` },
        createElement('span', { className: "font-mono text-lg" }, COMMAND_TO_COPY),
        isCopied ? createElement(CheckIcon, { className: "w-5 h-5" }) : createElement(ClipboardIcon, { className: "w-5 h-5" })
    );
};

const Header = () => {
    return createElement('header', { className: "sticky top-0 z-40 w-full backdrop-blur flex-none transition-colors duration-500 lg:z-50 lg:border-b lg:border-slate-900/10 bg-white/80" },
        createElement('div', { className: "container mx-auto px-4 sm:px-6 lg:px-8" },
            createElement('div', { className: "flex items-center justify-between h-16" },
                createElement('a', { href: "#top", className: "text-2xl font-bold text-slate-900 focus-ring rounded-md" }, "firstvibe"),
                createElement('div', { className: "hidden sm:block" },
                    createElement(CopyButton, { className: "px-4 py-2 text-sm" })
                )
            )
        )
    );
};

const CodeIllustration = () => (
    createElement('div', { className: "relative mt-12 lg:mt-0 lg:ml-12 w-full max-w-lg" },
        createElement('div', { className: "absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" }),
        createElement('div', { className: "absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000" }),
        createElement('div', { className: "absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000" }),
        createElement('div', { className: "relative bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-xl shadow-2xl p-4" },
            createElement('div', { className: "flex space-x-2 mb-4" },
                createElement('div', { className: "w-3 h-3 rounded-full bg-red-500" }),
                createElement('div', { className: "w-3 h-3 rounded-full bg-yellow-500" }),
                createElement('div', { className: "w-3 h-3 rounded-full bg-green-500" })
            ),
            createElement('pre', { className: "text-slate-300 text-sm md:text-base overflow-x-auto" },
                createElement('code', { className: "font-mono" },
                    createElement('span', {className: 'text-sky-400'}, '$ npx firstvibe'), createElement('br'),
                    createElement('span', {className: 'text-slate-500'}, '? 당신의 아이디어는? (한 문장)'), createElement('br'),
                    createElement('span', {className: 'text-yellow-400'}, '> 동네 러닝 커뮤니티 앱'), createElement('br'),
                    createElement('span', {className: 'text-green-400'}, '✓ PRD 생성 완료'), createElement('br'),
                    createElement('span', {className: 'text-green-400'}, '✓ TRD 생성 완료'), createElement('br'),
                    createElement('span', {className: 'text-green-400'}, '✓ Todo List 생성 완료')
                )
            )
        )
    )
);

const Hero = () => {
    return createElement('section', { className: "py-20 sm:py-24 lg:py-32 bg-white" },
        createElement('div', { className: "container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center" },
            createElement('div', { className: "lg:w-1/2 text-center lg:text-left" },
                createElement('h1', { className: "text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900" },
                    "한 문장으로 시작하세요.",
                    createElement('br'),
                    createElement('span', { className: "bg-gradient-to-r from-blue-500 to-cyan-400 text-transparent bg-clip-text" }, "MVP의 첫 진동, firstvibe.")
                ),
                createElement('p', { className: "mt-6 text-lg text-slate-600 max-w-xl mx-auto lg:mx-0" }, "당신의 한 문장의 아이디어를 확장시켜 MVP로 만들기 위한 토대를 만들어드립니다."),
                createElement('div', { className: "mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4" },
                    createElement(CopyButton, null)
                ),
                createElement('p', { className: "mt-4 text-sm text-slate-500" }, "터미널에 붙여넣고 바로 실행하세요.")
            ),
            createElement('div', { className: "lg:w-1/2 flex justify-center" },
                createElement(CodeIllustration, null)
            )
        )
    );
};

const CoreValues = () => {
    return createElement('section', { id: "core-values", className: "py-20 sm:py-24 bg-slate-100" },
        createElement('div', { className: "container mx-auto px-4 sm:px-6 lg:px-8" },
            createElement('div', { className: "text-center" },
                createElement('h2', { className: "text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" }, "아이디어를 현실로 만드는 가장 빠른 길"),
                createElement('p', { className: "mt-4 text-lg text-slate-600 max-w-2xl mx-auto" }, "firstvibe는 복잡한 과정을 자동화하여, 당신이 가장 중요한 것, 즉 아이디어의 본질에 집중할 수 있도록 돕습니다.")
            ),
            createElement('div', { className: "mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8" },
                CORE_VALUES.map((value, index) =>
                    createElement('div', { key: index, className: "bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300" },
                        createElement('h3', { className: "text-xl font-bold text-slate-900" }, value.title),
                        createElement('p', { className: "mt-2 text-slate-600" }, value.description)
                    )
                )
            ),
            createElement('div', { className: "mt-16 text-center" },
                createElement(CopyButton, null)
            )
        )
    );
};

const ExampleCard = ({ project }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    return createElement('div', { className: "bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl" },
        createElement('div', { className: "p-6" },
            createElement('p', { className: "text-sm font-semibold text-blue-600" }, "한 문장 아이디어"),
            createElement('h3', { className: "mt-2 text-xl font-bold text-slate-900" }, project.oneLiner),
            createElement('div', { className: "mt-4 border-t border-slate-200 pt-4" },
                createElement('p', { className: "text-sm font-semibold text-slate-700" }, "생성 요약"),
                createElement('ul', { className: "mt-2 space-y-2 text-slate-600" },
                    project.summary.map((item, i) =>
                        createElement('li', { key: i, className: "flex items-start" },
                            createElement('svg', { className: "w-4 h-4 mr-2 mt-1 text-cyan-500 flex-shrink-0", fill: "currentColor", viewBox: "0 0 20 20" },
                                createElement('path', { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z", clipRule: "evenodd" })
                            ),
                            createElement('span', null, item)
                        )
                    )
                )
            )
        ),
        createElement('div', { className: `grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}` },
            createElement('div', { className: "overflow-hidden" },
                createElement('div', { className: "bg-slate-50 border-t border-slate-200 p-6" },
                    createElement('p', { className: "text-sm font-semibold text-slate-700" }, "상세 내용 (PRD/TRD 하이라이트)"),
                    createElement('ul', { className: "mt-2 space-y-2 text-slate-600 text-sm" },
                        project.details.map((item, i) =>
                            createElement('li', { key: i, className: "whitespace-pre-wrap" }, item)
                        )
                    )
                )
            )
        ),
        createElement('button', { onClick: () => setIsExpanded(!isExpanded), className: "w-full bg-slate-100 hover:bg-slate-200 p-3 text-sm font-semibold text-slate-700 flex items-center justify-center gap-2 focus-ring", "aria-expanded": isExpanded },
            createElement('span', null, isExpanded ? '간략히' : '더 보기'),
            createElement(ChevronDownIcon, { className: `w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}` })
        )
    );
};

const Examples = () => {
    return createElement('section', { id: "examples", className: "py-20 sm:py-24 bg-white" },
        createElement('div', { className: "container mx-auto px-4 sm:px-6 lg:px-8" },
            createElement('div', { className: "text-center" },
                createElement('h2', { className: "text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" }, "실제 결과물 미리보기"),
                createElement('p', { className: "mt-4 text-lg text-slate-600 max-w-2xl mx-auto" }, "다양한 아이디어가 어떻게 체계적인 문서로 변환되는지 확인해보세요.")
            ),
            createElement('div', { className: "mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" },
                EXAMPLE_PROJECTS.map(project => createElement(ExampleCard, { key: project.id, project: project }))
            )
        )
    );
};

const Footer = () => {
    const socialLinks = [{ name: 'GitHub', href: '#' }, { name: 'Twitter', href: '#' }];
    const policyLinks = [{ name: '이용약관', href: '#' }, { name: '개인정보처리방침', href: '#' }];
    return createElement('footer', { className: "bg-slate-900 text-slate-400" },
        createElement('div', { className: "container mx-auto px-4 sm:px-6 lg:px-8 py-12" },
            createElement('div', { className: "flex flex-col md:flex-row justify-between items-center" },
                createElement('div', { className: "text-center md:text-left mb-4 md:mb-0" },
                    createElement('p', { className: "text-2xl font-bold text-white" }, "firstvibe"),
                    createElement('p', { className: "mt-2 text-sm" }, `© ${new Date().getFullYear()} firstvibe. All rights reserved.`)
                ),
                createElement('div', { className: "flex space-x-6" },
                    socialLinks.map(link =>
                        createElement('a', { key: link.name, href: link.href, className: "hover:text-white transition-colors focus-ring rounded-md", target: "_blank", rel: "noopener noreferrer" }, link.name)
                    )
                )
            ),
            createElement('div', { className: "mt-8 pt-8 border-t border-slate-800 text-center text-sm" },
                createElement('div', { className: "flex justify-center space-x-4" },
                    policyLinks.map(link =>
                        createElement('a', { key: link.name, href: link.href, className: "hover:text-white transition-colors focus-ring rounded-md" }, link.name)
                    )
                )
            )
        )
    );
};

const App = () => {
    return createElement(ToastProvider, null,
        createElement('div', { className: 'flex flex-col min-h-screen' },
            createElement(Header, null),
            createElement('main', { id: 'top' },
                createElement(Hero, null),
                createElement(CoreValues, null),
                createElement(Examples, null)
            ),
            createElement(Footer, null)
        )
    );
};

// From index.tsx
const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}
const root = createRoot(rootElement);
root.render(createElement(App));

})();
