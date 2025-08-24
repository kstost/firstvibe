# firstvibe 📝

**MVP의 첫 진동, firstvibe.**  
당신의 한 문장의 아이디어를 확장시켜 MVP로 만들기 위한 토대를 만들어드립니다.

[![npm version](https://badge.fury.io/js/firstvibe.svg)](https://badge.fury.io/js/firstvibe)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

**🌐 공식 웹사이트**: [https://firstvibe.dev/](https://firstvibe.dev/)  
**📚 GitHub 저장소**: [https://github.com/kstost/firstvibe](https://github.com/kstost/firstvibe)  
**📦 NPM 패키지**: [https://www.npmjs.com/package/firstvibe](https://www.npmjs.com/package/firstvibe)

---

## 🎯 아이디어를 현실로 만드는 가장 빠른 길

firstvibe는 복잡한 과정을 자동화하여, 당신이 가장 중요한 것, 즉 **아이디어의 본질**에 집중할 수 있도록 돕습니다.

코딩을 전혀 모르는 사람들도 간단한 아이디어를 확장시켜 **MVP 형태로 빠르게** 만들어 볼 수 있도록 PRD, TRD 등의 형태로 기획을 만드는데 도움을 드리는 프로그램입니다.

### ✨ 핵심 가치
- 🚀 **빠른 시작**: 한 문장의 아이디어에서 완전한 개발 계획까지
- 🤖 **AI 자동화**: 복잡한 문서 작성 과정을 AI가 대신 처리
- 📋 **체계적 접근**: PRD → TRD → TODO로 이어지는 단계별 문서 생성
- 💡 **실용적 결과**: 바로 개발에 들어갈 수 있는 구체적인 액션 플랜

---

## 🔥 주요 기능

### 📋 인터랙티브 설문 시스템
- **스마트 질문**: AI가 프로젝트에 최적화된 핵심 질문만 선별
- **직관적 UI**: 다중 선택 또는 직접 입력으로 쉬운 답변
- **진행률 표시**: 실시간으로 진행 상황 확인 (예: [3/10])
- **답변 수정**: 언제든 이전 답변으로 돌아가 수정 가능

### 🤖 AI 기반 문서 생성
- **OpenAI GPT 활용**: 최신 AI 기술로 고품질 문서 자동 생성
- **Google Gemini 지원**: 다양한 AI 제공자 선택 가능
- **최적화된 프롬프트**: 각 문서별로 특화된 AI 프롬프트 시스템
- **구체적 결과물**: 추상적이지 않은 실행 가능한 내용 생성

### 📄 3단계 문서 생성 파이프라인
1. **📊 PRD 생성**: 설문 결과를 바탕으로 제품요구사항문서 생성
2. **🔧 TRD 생성**: PRD를 기반으로 기술요구사항문서 생성
3. **✅ TODO 생성**: TRD를 기반으로 YAML 형식의 개발 할일 목록 생성

---

## 🚀 빠른 시작 가이드

### 1️⃣ 설치
```bash
npm install firstvibe -g
```

### 2️⃣ 첫 실행 (초기 설정)
```bash
firstvibe
```
처음 실행 시 AI 제공자와 API 키를 설정하는 대화형 설정이 시작됩니다.

### 3️⃣ 성능 모드 선택
```bash
# 💰 빠르고 경제적 (프로토타입용)
firstvibe config mode cheap

# 💎 고품질, 고비용 (실제 프로젝트용)
firstvibe config mode expensive
```

### 4️⃣ 문서 생성 시작
```bash
firstvibe
```

### 5️⃣ 결과 확인
생성된 파일들을 확인하고 **✨ 바이브코딩**을 시작하세요!
- 📄 `prd.md` - 제품요구사항문서
- 🔧 `trd.md` - 기술요구사항문서  
- ✅ `todo.yaml` - 개발 할일 목록

---

## 📖 상세 사용법

### 🎛️ 기본 명령어

```bash
# 기본 실행 (대화형 모드)
firstvibe

# 명령줄에서 프로젝트 설명 제공
firstvibe "음식 주문 배달 앱"

# 도움말 보기
firstvibe help
```

### ⚡ 실행 옵션

```bash
# 상세 출력 모드 (디버깅 정보 포함)
firstvibe -v

# 질문 횟수 조절 (1-50)
firstvibe -q 5               # 빠른 생성 (5문항)
firstvibe --questions 15     # 상세 생성 (15문항)

# 선택적 생성
firstvibe --skip-trd         # PRD만 생성
firstvibe --skip-todo        # PRD, TRD만 생성
```

### 🔧 고급 설정

#### AI 제공자 설정
```bash
# OpenAI 설정
firstvibe config set openai.apiKey sk-your-api-key-here
firstvibe config set provider openai

# Google Gemini 설정  
firstvibe config set gemini.apiKey your-gemini-api-key-here
firstvibe config set provider gemini
```

#### 모델별 세부 설정
```bash
# OpenAI 모델 설정
firstvibe config set openai.prdModel gpt-5          # PRD용 모델
firstvibe config set openai.trdModel gpt-5-mini     # TRD용 모델
firstvibe config set openai.todoModel gpt-5-mini    # TODO용 모델

# Gemini 모델 설정
firstvibe config set gemini.prdModel gemini-2.5-pro
firstvibe config set gemini.trdModel gemini-2.5-flash
```

#### OpenAI 성능 및 품질 조절
```bash
# Verbosity 레벨 (생성 결과의 상세도) - OpenAI 전용
firstvibe config set openai.prdVerbosity high       # high/medium/low
firstvibe config set openai.trdVerbosity medium

# Reasoning Effort (AI 추론 노력도) - OpenAI 전용
firstvibe config set openai.prdReasoningEffort high # high/medium/minimal
```

### 📊 설정 관리

```bash
# 현재 설정 확인
firstvibe config get

# 특정 설정 확인
firstvibe config get openai.apiKey

# 현재 모드 확인
firstvibe config mode

# 모든 설정 키 목록
firstvibe config list

# 설정 초기화
firstvibe config reset
```

---

## 📁 생성되는 파일 상세

### 📊 `prd.md` - 제품요구사항문서
**Product Requirements Document**
- 🎯 제품 개요 및 비전
- 👥 대상 사용자 페르소나
- 📖 사용자 스토리 및 유스케이스  
- ⚙️ 기능적/비기능적 요구사항
- 📈 성공 측정 기준 (KPI)
- 🗺️ 개발 로드맵 및 일정

### 🔧 `trd.md` - 기술요구사항문서
**Technical Requirements Document**
- 🏗️ 고수준 시스템 아키텍처
- 💾 데이터베이스 모델 및 스키마
- 🛠️ 기술 스택 및 라이브러리 선택
- 🔒 보안 설계 및 인증 방식
- ⚡ 성능 최적화 전략
- 🧪 테스트 전략 및 QA 계획

### ✅ `todo.yaml` - 개발 할일 목록
**YAML 형식의 구조화된 작업 목록**
- 📋 우선순위별 작업 분류 (P0/P1/P2)
- 🔍 세부 작업 및 구현 가이드
- 🔗 작업 간 의존성 관계
- ✔️ 완료 기준 및 검증 방법
- 📅 실행 순서 및 타임라인
- 💡 구현 가이드 및 코드 예시

---

## 💡 사용 시나리오

### 🎨 시나리오 1: 아이디어 검증
```bash
# 빠른 프로토타입 검증용
firstvibe config mode cheap
firstvibe -q 5 "소셜 독서 플랫폼"
```
**결과**: 빠른 MVP 계획 완성

### 🏗️ 시나리오 2: 본격적인 프로젝트 시작
```bash
# 상세한 프로젝트 계획 수립
firstvibe config mode expensive  
firstvibe --questions 15 -v
```
**결과**: 상세하고 체계적인 개발 계획서 완성


---

## ⚙️ 설정 옵션 완전 가이드

### 🎭 성능 모드
| 모드 | 설명 | 모델 | 품질 | 비용 | 속도 |
|------|------|------|------|------|------|
| **cheap** | 프로토타입용 | gpt-5-mini | 기본 | 낮음 | 빠름 |
| **expensive** | 프로덕션용 | gpt-5 | 고품질 | 높음 | 보통 |
| **custom** | 사용자 정의 | 혼합 | 맞춤형 | 가변 | 가변 |

### 🎨 OpenAI Verbosity 레벨
- **low**: 핵심만 간결하게
- **medium**: 적절한 상세도 (권장)  
- **high**: 매우 상세한 설명

### 🧠 OpenAI Reasoning Effort
- **minimal**: 빠른 생성, 기본적인 추론
- **medium**: 균형잡힌 품질과 속도
- **high**: 깊이 있는 분석과 추론

---

## 🎯 실전 팁

### 💡 효율적인 사용법
1. **첫 번째 시도**: `cheap` 모드로 빠르게 아이디어 검증
2. **두 번째 시도**: 만족스러운 방향이면 `expensive` 모드로 정교화
3. **반복 개선**: 생성된 문서를 바탕으로 아이디어 다듬기

### 🔍 질문 답변 요령
- **구체적으로**: "모바일 앱" → "iOS/Android 네이티브 앱"
- **사용자 중심으로**: 기술보다는 사용자 니즈에 집중
- **현실적으로**: 실현 가능한 범위 내에서 목표 설정

### 📈 품질 향상 방법
- **반복 실행**: 같은 아이디어로 여러 번 실행하여 최적의 결과 선택
- **질문 수 조절**: 복잡한 아이디어일수록 질문 수를 늘려서 실행
- **모델 조합**: PRD는 고급 모델, TODO는 경제적 모델로 비용 최적화

---

## 🚨 주의사항 및 제한사항

### 💰 비용 관련
- OpenAI/Google API 사용으로 **토큰 기반 비용 발생**
- 질문 수가 많을수록, OpenAI의 verbosity가 높을수록 비용 증가

### 📝 결과물 품질
- 생성된 문서는 **출발점으로 활용**, 프로젝트에 맞는 **추가 검토 필수**
- AI가 생성한 기술 스택은 **최신 트렌드 반영 확인 필요**
- 도메인별 전문 지식은 **별도 검증 권장**

### 🔧 기술적 제한
- API 키 필수 (OpenAI 또는 Google)
- 인터넷 연결 필수

---

## 🛠️ 문제 해결

### 🔑 API 키 관련
```bash
# API 키 확인
firstvibe config get openai.apiKey

# 새로운 API 키 설정
firstvibe config set openai.apiKey sk-new-key-here
```

### 🌐 네트워크 오류
```bash
# 상세 로그로 오류 확인
firstvibe -v

# 프록시 환경에서 사용 시
export https_proxy=your-proxy-url
firstvibe
```

### 📊 설정 초기화
```bash
# 모든 설정 리셋
firstvibe config reset --force

# 특정 제공자 설정만 변경
firstvibe config set provider gemini
```

---

## 🤝 커뮤니티 및 지원

### 💬 지원 채널
- 🐛 **버그 리포트**: [GitHub Issues](https://github.com/kstost/firstvibe/issues)
- 💡 **기능 제안**: [GitHub Discussions](https://github.com/kstost/firstvibe/discussions)


---

## 📄 라이선스

**AGPL-3.0** - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

## 🎉 마무리

> **firstvibe와 함께라면, 아이디어에서 MVP까지의 여정이 더 이상 막막하지 않습니다.**

당신의 혁신적인 아이디어가 현실이 되는 첫 번째 진동을 **firstvibe**와 함께 시작해보세요! 🚀

### 📞 연락처
- **웹사이트**: [https://firstvibe.dev/](https://firstvibe.dev/)
- **GitHub**: [https://github.com/kstost/firstvibe](https://github.com/kstost/firstvibe)
- **NPM**: [https://www.npmjs.com/package/firstvibe](https://www.npmjs.com/package/firstvibe)

---

*Made with ❤️ by the firstvibe team*