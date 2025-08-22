#!/usr/bin/env node

import OpenAI from "openai";
import prompts from "prompts";
import chalk from "chalk";

// 파스텔톤 색상 정의
const pastelColors = {
  pink: chalk.hex('#FFB3BA'),        // 파스텔 핑크
  mint: chalk.hex('#BAFFC9'),        // 파스텔 민트  
  yellow: chalk.hex('#FFFFBA'),      // 파스텔 옐로우
  lavender: chalk.hex('#C8BFE7'),    // 파스텔 라벤더
  blue: chalk.hex('#B3E5FC'),        // 파스텔 블루
  orange: chalk.hex('#FFCBA4'),      // 파스텔 오렌지
  peach: chalk.hex('#FFD7AF'),       // 피치톤
  lightMint: chalk.hex('#AFFFD7'),   // 연민트
  lightPurple: chalk.hex('#D7AFFF'), // 연보라
  lightPink: chalk.hex('#FFAFD7')    // 연핑크
};

// Ctrl+C 처리를 위한 SIGINT 핸들러
process.on('SIGINT', () => {
  console.log(pastelColors.peach('\n\n👋 프로그램을 종료합니다.'));
  process.exit(0);
});

// prompts 라이브러리의 취소 처리 함수들
const handleCtrlC = () => {
  console.log(pastelColors.peach('\n\n👋 프로그램을 종료합니다.'));
  process.exit(0);
};

// prompts 라이브러리의 취소 동작 오버라이드
const originalPrompts = prompts;

// prompts 함수를 래핑하여 ESC 키 비활성화
const wrappedPrompts = async (questions, options = {}) => {
  const modifiedOptions = {
    ...options,
    onCancel: options.onCancel || handleCtrlC,
    // ESC 키를 완전히 차단하는 커스텀 핸들러
    onState: (state) => {
      // ESC로 인한 중단 시 아무것도 하지 않고 계속 진행
      if (state.aborted && !state.exited) {
        // ESC 키로 인한 중단을 무시
        state.aborted = false;
        return;
      }
      if (options.onState) {
        return options.onState(state);
      }
    }
  };

  try {
    return await originalPrompts(questions, modifiedOptions);
  } catch (error) {
    // ESC로 인한 에러 시 다시 시도
    if (error.message.includes('User force closed') || error.message.includes('canceled')) {
      return await wrappedPrompts(questions, options);
    }
    throw error;
  }
};

// 전역 prompts를 오버라이드
global.prompts = wrappedPrompts;
import { Command } from "commander";
import ora from "ora";
import fs from "fs";
import makeTRD from "./make_trd.js";
import trdToTodo from "./trd_to_todo.js";
import {
  getConfigFilePath,
  getAllConfig,
  getConfigValue,
  setConfigValue,
  resetConfig,
  getAvailableConfigKeys,
  getEffectiveConfig,
  setCheapMode,
  setExpensiveMode,
  getCurrentMode
} from "./config.js";

// 설정을 로드하여 OpenAI 클라이언트 초기화
const config = getEffectiveConfig();
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

const PRD_SYSTEM_PROMPT = `
You are an AI Product Requirements Document (PRD) Expert. Your core role is to write a comprehensive Product Requirements Document (PRD) based on collected user requirements and answers.
The PRD you write will be used by product managers, developers, and stakeholders to understand and implement the product.

## Core Principles

### User-Centric Design
- Write all content in a clear, structured markdown format that is easy for humans to read and understand.
- Use consistent and clear markdown notation.
- Focus on user needs, business objectives, and product vision.
- Present information in a logical, hierarchical structure.

### Comprehensive Coverage
- Include all essential PRD sections: Overview, Goals, User Stories, Requirements, Success Metrics, etc.
- Provide clear rationale for each requirement and feature.
- Include both functional and non-functional requirements.
- Address user experience, technical considerations, and business impact.

### Actionable Specifications
- Present clear, specific, and measurable requirements.
- Include acceptance criteria for each feature.
- Specify user roles, personas, and use cases.
- Define success metrics and KPIs.
- Focus on priority considerations and feature organization.

## PRD Structure Requirements
- **Product Overview**: Vision, mission, and high-level description
- **Goals & Objectives**: Business goals, user goals, and success metrics
- **Target Audience**: User personas, demographics, and use cases
- **User Stories & Use Cases**: Detailed scenarios and user journeys
- **Functional Requirements**: Core features and capabilities
- **Non-Functional Requirements**: Performance, security, scalability
- **User Experience**: UI/UX guidelines and design principles
- **Technical Considerations**: Architecture, integrations, constraints
- **Success Metrics**: KPIs, analytics, and measurement criteria
- **Priority & Risk Assessment**: Feature prioritization, importance levels, and risk mitigation strategies

## Additional Guidelines
- Use the collected Q&A data to inform all sections of the PRD
- Prioritize requirements based on user needs and business value
- Include risk assessment and mitigation strategies
- Ensure traceability from user needs to specific requirements

## Response Format
- Respond in well-structured Markdown format
- Use appropriate headers, lists, and formatting
- Include tables where appropriate for clarity
- Do not include any introductory messages or text outside of the PRD itself
`;

class PRDGenerator {
  constructor() {
    this.qaHistory = [];
    this.currentQuestion = 1;
    this.maxQuestions = 10; // 기본값, options에서 덮어씀
    this.options = {};
  }

  setMaxQuestions(count) {
    const questionCount = parseInt(count, 10);
    if (isNaN(questionCount) || questionCount < 1 || questionCount > 50) {
      console.error(chalk.red('❌ 질문 횟수는 1~50 사이의 숫자여야 합니다.'));
      process.exit(1);
    }
    this.maxQuestions = questionCount;
  }

  displayQASummary() {
    console.log(pastelColors.lavender.bold('\n📋 질문/답변 요약'));
    console.log(('═'.repeat(60)));

    if (this.qaHistory.length > 0 && this.qaHistory[0].userInput) {
      console.log(pastelColors.orange.bold(`\n🎯 프로젝트 설명:`));
      console.log(pastelColors.yellow(`${this.qaHistory[0].userInput}`));
    }

    for (let i = 0; i < this.qaHistory.length; i++) {
      const qa = this.qaHistory[i];
      if (qa.aiResponse && qa.aiResponse.questions && qa.userAnswer) {
        const question = qa.aiResponse.questions[0].question;
        console.log(pastelColors.blue.bold(`❓ [${i + 1}] ${question}`));
        console.log(pastelColors.mint(`✅ ${qa.userAnswer}`));
      }
    }

    console.log(('═'.repeat(60)));
  }

  async confirmOrEdit() {
    const response = await wrappedPrompts({
      type: 'select',
      name: 'action',
      message: pastelColors.peach('위의 답변들을 확인해주세요. 어떻게 하시겠습니까?'),
      choices: [
        { title: '✅ 답변이 만족스럽습니다. PRD 생성을 시작하세요.', value: 'confirm' },
        { title: '✏️  특정 답변을 수정하고 싶습니다.', value: 'edit' },
        { title: '🔄 처음부터 다시 시작하고 싶습니다.', value: 'restart' }
      ]
    }, {
      onCancel: handleCtrlC,
      onSubmit: () => {
        // 수정 과정에서는 선택한 내용을 화면에서 지움
        process.stdout.write('\x1B[1A\x1B[2K');
      }
    });

    return response.action;
  }

  async selectQuestionToEdit() {
    const choices = [];

    // 각 질문/답변 수정 옵션
    for (let i = 0; i < this.qaHistory.length; i++) {
      const qa = this.qaHistory[i];
      if (qa.aiResponse && qa.aiResponse.questions && qa.userAnswer) {
        const question = qa.aiResponse.questions[0].question;
        const shortAnswer = qa.userAnswer.substring(0, 30) + (qa.userAnswer.length > 30 ? '...' : '');
        choices.push({
          name: `❓ [${i + 1}] ${question.substring(0, 40)}... → "${shortAnswer}"`,
          value: i + 1
        });
      }
    }

    choices.push({ name: '⬅️  뒤로 가기', value: 'back' });

    const response = await wrappedPrompts({
      type: 'select',
      name: 'questionIndex',
      message: pastelColors.lightMint('수정하고 싶은 항목을 선택해주세요:'),
      choices: choices.map(choice => ({
        title: choice.name || choice,
        value: choice.value || choice
      }))
    }, {
      onCancel: handleCtrlC,
      onSubmit: () => {
        // 수정 과정에서는 선택한 내용을 화면에서 지움
        process.stdout.write('\x1B[1A\x1B[2K');
      }
    });

    return response.questionIndex;
  }

  async editAnswer(questionIndex) {
    // 질문의 답변 수정 (questionIndex는 1부터 시작)
    const qaIndex = questionIndex - 1;
    const qa = this.qaHistory[qaIndex];

    if (qa && qa.aiResponse && qa.aiResponse.questions) {
      const questionData = qa.aiResponse.questions[0];

      const newAnswer = await this.askQuestion(questionData, qa.userAnswer);
      qa.userAnswer = newAnswer;
    }
  }

  async askQuestion(questionData, currentAnswer = null) {
    const choices = [...questionData.choices, "기타 (직접 입력)"];

    // 현재 답변이 있으면 기본값으로 설정
    let defaultChoice = 0;
    if (currentAnswer) {
      const index = choices.indexOf(currentAnswer);
      if (index !== -1) {
        defaultChoice = index;
      }
    }

    const response = await wrappedPrompts({
      type: 'select',
      name: 'selection',
      message: currentAnswer ?
        pastelColors.lightPurple(`현재 답변: "${currentAnswer}" - 새로운 답변을 선택해주세요:`) :
        pastelColors.lightPurple(`[${this.currentQuestion}/${this.maxQuestions}] ${questionData.question}`),
      choices: choices.map(choice => ({
        title: choice.name || choice,
        value: choice.value || choice
      })),
      initial: defaultChoice
    }, {
      onCancel: handleCtrlC,
      onSubmit: () => {
        // 수정 시에는 화면 지움, 일반 질문-답변 시에는 유지
        if (currentAnswer) {
          // 수정 모드: 선택한 내용을 화면에서 지움
          process.stdout.write('\x1B[1A\x1B[2K');
        }
        // 일반 질문-답변 모드: 답변이 남아있도록 아무것도 하지 않음
      }
    });

    const answer = response.selection;

    if (answer === "기타 (직접 입력)") {
      const customResponse = await wrappedPrompts({
        type: 'text',
        name: 'custom',
        message: pastelColors.yellow('직접 입력해주세요:'),
        initial: currentAnswer && !choices.slice(0, -1).includes(currentAnswer) ? currentAnswer : '',
        validate: (input) => {
          return input.trim() !== '' || '답변을 입력해주세요.';
        }
      }, {
        onCancel: handleCtrlC
      });

      return customResponse.custom;
    }

    return answer;
  }

  async generatePRD() {
    // Q&A 데이터를 정리하여 PRD 생성을 위한 텍스트로 변환
    let qaText = `프로젝트 설명: ${this.qaHistory[0].userInput}\n\n`;

    qaText += "수집된 요구사항 정보:\n";
    for (let i = 0; i < this.qaHistory.length; i++) {
      const qa = this.qaHistory[i];
      if (qa.aiResponse && qa.aiResponse.questions && qa.userAnswer) {
        const question = qa.aiResponse.questions[0].question;
        qaText += `Q: ${question}\n`;
        qaText += `A: ${qa.userAnswer}\n\n`;
      }
    }

    const spinner = ora({
      text: pastelColors.blue('PRD 문서를 생성하고 있습니다...'),
      color: 'blue'
    }).start();

    try {
      const effectiveConfig = getEffectiveConfig();
      const response = await openai.chat.completions.create({
        model: effectiveConfig.openai.prdModel,
        messages: [
          {
            "role": "developer",
            "content": [
              {
                "type": "text",
                "text": PRD_SYSTEM_PROMPT
              }
            ]
          },
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": qaText
              }
            ]
          }
        ],
        response_format: { "type": "text" },
        verbosity: effectiveConfig.openai.prdVerbosity,
        reasoning_effort: effectiveConfig.openai.prdReasoningEffort
      });

      spinner.stop();
      return response.choices[0].message.content;
    } catch (error) {
      spinner.stop();
      console.log(pastelColors.pink(`❌ PRD 생성 중 오류가 발생했습니다: ${error.message}`));
      throw error;
    }
  }

  async generateTRDFromPRD(prdDocument) {
    try {
      // TRD 생성 건너뛰기 옵션 확인
      if (this.options.skipTrd) {
        console.log(chalk.yellow('⚠️  TRD 생성을 건너뜁니다.'));
        return;
      }

      const trd = await makeTRD(prdDocument);

      const trdPath = 'trd.md';
      fs.writeFileSync(trdPath, trd, 'utf8');
      console.log(pastelColors.mint('✅ TRD 생성 완료: ') + pastelColors.blue(trdPath));

      // TODO 생성 건너뛰기 옵션 확인
      if (this.options.skipTodo) {
        console.log(pastelColors.peach('⚠️  TODO 생성을 건너뜁니다.'));
        console.log(pastelColors.mint.bold('\n🎉 문서 생성이 완료되었습니다!'));
        console.log(pastelColors.lightPurple('생성된 파일들:'));
        console.log(pastelColors.blue('  • prd.md') + pastelColors.lightPurple(' - 제품요구사항문서'));
        console.log(pastelColors.blue('  • trd.md') + pastelColors.lightPurple(' - 기술요구사항문서'));
        return;
      }

      // TRD를 바탕으로 TODO 생성
      const { markdown } = await trdToTodo(trd);

      const todoPath = 'todo.md';
      fs.writeFileSync(todoPath, markdown, 'utf8');
      console.log(pastelColors.mint('✅ TODO 변환 완료: ') + pastelColors.blue(todoPath));

      console.log(pastelColors.mint.bold('\n🎉 전체 문서 생성이 완료되었습니다!'));
      console.log(pastelColors.lightPurple('생성된 파일들:'));
      console.log(pastelColors.blue('  • prd.md') + pastelColors.lightPurple(' - 제품요구사항문서'));
      console.log(pastelColors.blue('  • trd.md') + pastelColors.lightPurple(' - 기술요구사항문서'));
      console.log(pastelColors.blue('  • todo.md') + pastelColors.lightPurple(' - 개발 할일 목록'));
      console.log(pastelColors.peach('✨ 이제 바이브코딩을 시작할 준비가 되었습니다!'));

    } catch (error) {
      console.error(pastelColors.pink('❌ TRD/TODO 생성 중 오류가 발생했습니다: ') + error.message);
      if (this.options.verbose) {
        console.error(pastelColors.lightPurple('상세 오류:'), error.stack);
      }
      console.log(pastelColors.lightPurple('PRD 문서는 성공적으로 생성되었으니 수동으로 TRD를 작성해 주세요.'));
      process.exit(1);
    }
  }

  async getAIResponse() {
    const messages = [
      {
        "role": "developer",
        "content": [
          {
            "type": "text",
            "text": `너는 앱이나 웹사이트를 만들고자 하는 사용자가 PRD(Product Requirements Document)를 만드는것을 위해 준비해야할 요소들에 대한 질문을 사용자에게 하는 역할을 한다.

## 질문 가이드라인

### 질문 내용
- 총 ${this.maxQuestions}가지에 대한 중요한 부분들에 대해 간결하고 명확한 질문을 한다
- 질문은 한번에 한개씩 짧고 명확하게 작성한다
- PRD 작성에 필요한 핵심 정보만 간단히 묻는다
- 예시: "주요 타겟 사용자는 누구인가요?"

### 보기 옵션
- 각 질문에 어울리는 후보 대답의 보기를 간단하고 명확하게 제공한다
- 보기는 짧고 이해하기 쉽게 작성한다
- 각 보기는 핵심 내용만 간결하게 표현한다
- 예시: "모바일 앱", "웹 서비스", "데스크톱 프로그램"
- 보기는 4-5개 정도 제공하되, 다양한 옵션을 간단히 제시한다
- 후보 대답에는 "기타"나 "직접 입력" 같은 옵션은 포함하지 않는다

### 질문 순서
- 제품 개요 → 사용자 정의 → 핵심 기능 → 비기능 요구사항 → 비즈니스 목표 순으로 진행
- 이전 답변을 고려하여 다음 질문을 맞춤화한다`
          }
        ]
      }
    ];

    // 대화 히스토리 추가
    if (this.qaHistory.length === 1) {
      // 첫 번째 질문인 경우 (프로젝트 설명만 있음)
      messages.push({
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": this.qaHistory[0].userInput
          }
        ]
      });
    } else {
      // 전체 대화 히스토리를 재구성
      messages.push({
        "role": "user",
        "content": [{ "type": "text", "text": this.qaHistory[0].userInput }]
      });

      for (let i = 0; i < this.qaHistory.length; i++) {
        const qa = this.qaHistory[i];
        if (qa.aiResponse) {
          messages.push({
            "role": "assistant",
            "content": [{ "type": "text", "text": JSON.stringify(qa.aiResponse) }]
          });
        }
        if (qa.userAnswer) {
          messages.push({
            "role": "user",
            "content": [{ "type": "text", "text": qa.userAnswer }]
          });
        }
      }
    }

    const spinner = ora({
      text: pastelColors.lightMint('질문을 생성하고 있습니다...'),
      color: 'cyan'
    }).start();

    try {
      const effectiveConfig = getEffectiveConfig();
      const response = await openai.chat.completions.create({
        model: effectiveConfig.openai.questionModel,
        messages: messages,
        response_format: {
          "type": "json_schema",
          "json_schema": {
            "name": "prd_interrogator",
            "strict": true,
            "schema": {
              "type": "object",
              "properties": {
                "questions": {
                  "type": "array",
                  "description": "A list of short, clear PRD-related questions to ask the user, designed to cover all necessary elements for a product requirements document. Each question should be concise and easy to understand.",
                  "items": {
                    "type": "object",
                    "properties": {
                      "question": {
                        "type": "string",
                        "description": "A short, clear, and focused question relevant to a PRD element."
                      },
                      "choices": {
                        "type": "array",
                        "description": "Short, clear choice options (4-5 options) that are easy to understand and select.",
                        "items": {
                          "type": "string"
                        }
                      }
                    },
                    "required": [
                      "question",
                      "choices"
                    ],
                    "additionalProperties": false
                  }
                }
              },
              "required": [
                "questions"
              ],
              "additionalProperties": false
            }
          }
        },
        verbosity: effectiveConfig.openai.questionVerbosity,
        reasoning_effort: effectiveConfig.openai.questionReasoningEffort
      });

      spinner.stop();
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      spinner.stop();
      console.log(pastelColors.pink(`❌ API 호출 중 오류가 발생했습니다: ${error.message}`));
      throw error;
    }
  }

  async reviewAndConfirmAnswers() {
    while (true) {
      this.displayQASummary();

      const action = await this.confirmOrEdit();

      if (action === 'confirm') {
        return true;
      } else if (action === 'edit') {
        while (true) {
          const questionIndex = await this.selectQuestionToEdit();

          if (questionIndex === 'back') {
            break;
          }

          await this.editAnswer(questionIndex);

          // 수정 완료 후 바로 다시 선택 화면으로 돌아감
        }
      } else if (action === 'restart') {
        const response = await wrappedPrompts({
          type: 'confirm',
          name: 'restart',
          message: chalk.red('정말로 처음부터 다시 시작하시겠습니까? 현재 답변들이 모두 사라집니다.'),
          initial: false
        }, {
          onCancel: handleCtrlC
        });

        const confirmResult = response.restart;

        if (confirmResult) {
          console.log(chalk.yellow('🔄 처음부터 다시 시작합니다...'));
          return false; // restart 신호
        }
        // 확인을 거부한 경우, 다시 루프
      }
    }
  }

  async promptForApiKey() {
    console.log(`███████╗██╗██████╗ ███████╗████████╗██╗   ██╗██╗██████╗ ███████╗`);
    console.log(`██╔════╝██║██╔══██╗██╔════╝╚══██╔══╝██║   ██║██║██╔══██╗██╔════╝`);
    console.log(`█████╗  ██║██████╔╝███████╗   ██║   ██║   ██║██║██████╔╝█████╗  `);
    console.log(`██╔══╝  ██║██╔══██╗╚════██║   ██║   ╚██╗ ██╔╝██║██╔══██╗██╔══╝  `);
    console.log(`██║     ██║██║  ██║███████║   ██║    ╚████╔╝ ██║██████╔╝███████╗`);
    console.log(`╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝     ╚═══╝  ╚═╝╚═════╝ ╚══════╝`);

    console.log(pastelColors.lavender.bold('\n🚀 firstvibe 초기 설정'));
    console.log(pastelColors.lightPurple('처음 사용하시는군요! 설정을 도와드릴게요.\n'));

    console.log(chalk.yellow('📝 OpenAI API 키가 필요합니다.'));
    console.log(chalk.gray('   OpenAI API 키는 다음 링크에서 발급받을 수 있습니다:'));
    console.log(chalk.blue('   👉 https://platform.openai.com/account/api-keys\n'));

    const response = await prompts({
      type: 'invisible',
      name: 'apiKey',
      message: '🔑 OpenAI API 키를 입력해주세요 (sk-로 시작):',
      validate: value => {
        if (!value) return 'API 키를 입력해주세요.';
        if (!value.startsWith('sk-')) return 'API 키는 sk-로 시작해야 합니다.';
        if (value.length < 20) return 'API 키가 너무 짧습니다.';
        return true;
      }
    });

    if (!response.apiKey) {
      console.log(chalk.yellow('\n설정이 취소되었습니다. 나중에 다시 실행해주세요.'));
      process.exit(0);
    }

    // API 키 저장
    const { setConfigValue } = await import('./config.js');
    setConfigValue('openai.apiKey', response.apiKey);

    console.log(chalk.green('\n✅ API 키가 성공적으로 설정되었습니다!'));
    console.log(chalk.gray('이제 firstvibe를 다시 실행해주세요.\n'));

    process.exit(0);
  }

  async start() {
    // 설정 로드 및 API 키 확인
    const effectiveConfig = getEffectiveConfig();
    if (!effectiveConfig.openai.apiKey) {
      await this.promptForApiKey();
      return;
    }

    console.log(pastelColors.lavender.bold('🚀 firstvibe - Vibe Document Generator'));
    console.log(pastelColors.lightPurple('쉽게 PRD, TRD, TODO List를 만들 수 있는 문서 생성 도구\n'));

    if (this.options.verbose) {
      console.log(chalk.gray('🔧 상세 출력 모드가 활성화되었습니다.'));
      console.log(chalk.gray(`📍 현재 작업 디렉토리: ${process.cwd()}`));
      console.log(chalk.gray(`📁 설정 파일: ${getConfigFilePath()}`));
      console.log(chalk.gray(`❓ 설정된 질문 횟수: ${this.maxQuestions}개`));
      console.log(chalk.gray(`🤖 사용 모델: PRD(${effectiveConfig.openai.prdModel}), TRD(${effectiveConfig.openai.trdModel}), TODO(${effectiveConfig.openai.todoModel})\n`));
    }

    try {
      let restart = true;


      console.log(`███████╗██╗██████╗ ███████╗████████╗██╗   ██╗██╗██████╗ ███████╗`);
      console.log(`██╔════╝██║██╔══██╗██╔════╝╚══██╔══╝██║   ██║██║██╔══██╗██╔════╝`);
      console.log(`█████╗  ██║██████╔╝███████╗   ██║   ██║   ██║██║██████╔╝█████╗  `);
      console.log(`██╔══╝  ██║██╔══██╗╚════██║   ██║   ╚██╗ ██╔╝██║██╔══██╗██╔══╝  `);
      console.log(`██║     ██║██║  ██║███████║   ██║    ╚████╔╝ ██║██████╔╝███████╗`);
      console.log(`╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝     ╚═══╝  ╚═╝╚═════╝ ╚══════╝`);

      console.log('');


      while (restart) {
        // 초기화 (재시작 시)
        this.qaHistory = [];
        this.currentQuestion = 1;

        // 초기 프로젝트 설명 입력
        const response = await wrappedPrompts({
          type: 'text',
          name: 'description',
          message: pastelColors.mint('만들고자 하는 프로젝트에 대해 간단히 설명해주세요:'),
          validate: (input) => {
            return input.trim() !== '' || '프로젝트 설명을 입력해주세요.';
          }
        }, {
          onCancel: handleCtrlC
        });

        const initialInput = response.description;

        // 첫 번째 질문 준비
        this.qaHistory.push({
          userInput: initialInput,
          questionNumber: 0
        });

        // 질문-답변 루프
        for (this.currentQuestion = 1; this.currentQuestion <= this.maxQuestions; this.currentQuestion++) {
          const aiResponse = await this.getAIResponse();

          if (aiResponse.questions && aiResponse.questions.length > 0) {
            const questionData = aiResponse.questions[0];

            // AI 응답을 히스토리에 저장
            this.qaHistory[this.qaHistory.length - 1].aiResponse = aiResponse;

            const userAnswer = await this.askQuestion(questionData, null);

            // 사용자 답변을 히스토리에 저장
            this.qaHistory[this.qaHistory.length - 1].userAnswer = userAnswer;

            // 다음 질문을 위한 새로운 히스토리 항목 추가 (마지막 질문이 아닌 경우)
            if (this.currentQuestion < this.maxQuestions) {
              this.qaHistory.push({
                questionNumber: this.currentQuestion
              });
            }

          }
        }

        // 답변 검토 및 확인 단계
        const confirmed = await this.reviewAndConfirmAnswers();

        if (confirmed) {
          restart = false; // 확인됐으면 루프 종료
          // PRD 문서 생성 및 출력
          await this.generateAndDisplayPRD();
        }
        // confirmed가 false면 다시 루프를 돈다 (재시작)
      }

    } catch (error) {
      console.error(chalk.red('❌ 프로세스 중 오류가 발생했습니다:'), error.message);
      if (this.options.verbose) {
        console.error(chalk.gray('상세 오류:'), error.stack);
      }
      console.error(chalk.yellow('💡 다음 사항을 확인해주세요:'));
      console.error('  - OpenAI API 키가 올바르게 설정되었는지');
      console.error('  - 인터넷 연결이 정상인지');
      console.error('  - API 사용량 제한에 걸리지 않았는지');
      process.exit(1);
    }
  }

  async generateAndDisplayPRD() {
    // PRD 문서 생성
    try {
      const prdDocument = await this.generatePRD();

      // PRD 문서를 파일로 저장
      try {
        fs.writeFileSync('prd.md', prdDocument, 'utf8');
        console.log(pastelColors.mint.bold('\n🎉 PRD 문서가 성공적으로 생성되었습니다!'));
        console.log(pastelColors.peach('📁 PRD 파일 저장: ') + pastelColors.blue('prd.md'));

        // PRD를 바탕으로 TRD 생성
        await this.generateTRDFromPRD(prdDocument);

      } catch (saveError) {
        console.log(chalk.bold.green('\n🎉 PRD 문서가 성공적으로 생성되었습니다!\n'));
        console.log(chalk.bold.blue('📄 생성된 PRD 문서:'));
        console.log(chalk.gray('═'.repeat(70)));
        console.log('\n' + prdDocument + '\n');
        console.log(chalk.gray('═'.repeat(70)));
        console.log(chalk.red('⚠️  파일 저장 실패: ') + saveError.message);
        console.log(chalk.gray('위 내용을 복사하여 수동으로 저장해 주세요.'));
      }

    } catch (error) {
      console.log(chalk.red('\n❌ PRD 문서 생성에 실패했습니다.'));
      console.log(chalk.gray('수집된 정보를 바탕으로 수동으로 PRD를 작성해 주세요.'));
    }
  }
}

// CLI 설정
const program = new Command();

program
  .name('firstvibe')
  .description(`
███████╗██╗██████╗ ███████╗████████╗██╗   ██╗██╗██████╗ ███████╗
██╔════╝██║██╔══██╗██╔════╝╚══██╔══╝██║   ██║██║██╔══██╗██╔════╝
█████╗  ██║██████╔╝███████╗   ██║   ██║   ██║██║██████╔╝█████╗  
██╔══╝  ██║██╔══██╗╚════██║   ██║   ╚██╗ ██╔╝██║██╔══██╗██╔══╝  
██║     ██║██║  ██║███████║   ██║    ╚████╔╝ ██║██████╔╝███████╗
╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝     ╚═══╝  ╚═╝╚═════╝ ╚══════╝
                                                                
AI 기반 PRD, TRD, TODO List 자동 생성 도구

🎯 주요 기능:
  • 대화형 질문을 통한 요구사항 수집
  • PRD (제품요구사항문서) 자동 생성
  • TRD (기술요구사항문서) 자동 생성
  • TODO 목록 자동 생성
  • 설정 관리 (모델, 성능, 비용 최적화)

💡 빠른 시작:
  1. API 키 설정: firstvibe config set openai.apiKey sk-...
  2. 모드 선택: firstvibe config mode cheap (또는 expensive)
  3. 문서 생성: firstvibe`)
  .version('1.0.0')
  .option('-v, --verbose', '상세 출력 모드 (디버깅 정보 표시)')
  .option('--skip-trd', 'TRD 생성 건너뛰기 (PRD만 생성)')
  .option('--skip-todo', 'TODO 생성 건너뛰기 (PRD, TRD만 생성)')
  .option('-q, --questions <number>', '질문 횟수 설정 (1-50, 기본값: 10)', '10')
  .action(async (options) => {
    try {
      const prdGenerator = new PRDGenerator();
      prdGenerator.options = options;
      prdGenerator.setMaxQuestions(options.questions);
      await prdGenerator.start();
    } catch (error) {
      console.error(chalk.red('❌ 오류가 발생했습니다:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// 설정 명령어 추가
program
  .command('config')
  .description('설정 관리 (API 키, 모델, 성능 옵션 등)')
  .addCommand(
    new Command('set')
      .description('설정값 변경 (예: openai.apiKey, openai.prdModel)')
      .argument('<key>', '설정 키 (점 표기법 사용)')
      .argument('<value>', '설정값')
      .action(async (key, value) => {
        try {
          const availableKeys = getAvailableConfigKeys();
          if (!availableKeys.includes(key)) {
            console.error(chalk.red(`❌ 알 수 없는 설정 키: ${key}`));
            console.log(chalk.yellow('사용 가능한 키:'));
            availableKeys.forEach(k => console.log(`  ${k}`));
            process.exit(1);
          }

          // 타입 변환 (숫자, 불린값 처리)
          let processedValue = value;
          if (value === 'true') processedValue = true;
          else if (value === 'false') processedValue = false;
          else if (!isNaN(value) && !isNaN(parseFloat(value))) {
            processedValue = parseFloat(value);
          }

          if (setConfigValue(key, processedValue)) {
            console.log(chalk.green(`✅ ${key} = ${processedValue}`));
          } else {
            console.error(chalk.red('❌ 설정 저장에 실패했습니다.'));
            process.exit(1);
          }
        } catch (error) {
          console.error(chalk.red('❌ 설정 중 오류:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('설정값 조회 (키 생략 시 전체 설정 표시)')
      .argument('[key]', '설정 키 (옵션)')
      .action(async (key) => {
        try {
          if (key) {
            const value = getConfigValue(key);
            if (value !== undefined) {
              console.log(chalk.cyan(`${key}:`), chalk.white(value));
            } else {
              console.error(chalk.red(`❌ 설정을 찾을 수 없습니다: ${key}`));
              process.exit(1);
            }
          } else {
            const config = getAllConfig();
            const currentMode = getCurrentMode();
            console.log(chalk.bold.blue('🔧 현재 설정:\n'));
            console.log(chalk.gray(`설정 파일 위치: ${getConfigFilePath()}`));
            console.log(chalk.gray(`현재 모드: ${currentMode === 'cheap' ? '💰 cheap (빠르고 경제적)' : currentMode === 'expensive' ? '💎 expensive (고품질)' : '🔧 custom (사용자 정의)'}\n`));
            console.log(JSON.stringify(config, null, 2));
          }
        } catch (error) {
          console.error(chalk.red('❌ 설정 조회 중 오류:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('사용 가능한 모든 설정 키와 설명 표시')
      .action(() => {
        console.log(chalk.bold.blue('📋 사용 가능한 설정 키:\n'));

        console.log(chalk.cyan('OpenAI 관련:'));
        console.log('  openai.apiKey                  # OpenAI API 키');
        console.log('  openai.questionModel           # 질문 생성용 모델 (기본: gpt-5)');
        console.log('  openai.prdModel                # PRD 생성용 모델 (기본: gpt-5)');
        console.log('  openai.trdModel                # TRD 생성용 모델 (기본: gpt-5)');
        console.log('  openai.todoModel               # TODO 생성용 모델 (기본: gpt-5)');
        console.log('  openai.questionVerbosity       # 질문 생성 상세도 (기본: low)');
        console.log('  openai.prdVerbosity            # PRD 생성 상세도 (기본: medium)');
        console.log('  openai.trdVerbosity            # TRD 생성 상세도 (기본: medium)');
        console.log('  openai.todoVerbosity           # TODO 생성 상세도 (기본: medium)');
        console.log('  openai.questionReasoningEffort # 질문 추론 노력도 (기본: minimal)');
        console.log('  openai.prdReasoningEffort      # PRD 추론 노력도 (기본: medium)');
        console.log('  openai.trdReasoningEffort      # TRD 추론 노력도 (기본: medium)');
        console.log('  openai.todoReasoningEffort     # TODO 추론 노력도 (기본: medium)\n');

        console.log(chalk.cyan('앱 관련:'));
        console.log('  app.defaultQuestions       # 기본 질문 횟수');
        console.log('  app.verbose                # 상세 출력 모드');
        console.log('  app.skipTrd                # TRD 생성 건너뛰기');
        console.log('  app.skipTodo               # TODO 생성 건너뛰기\n');

        console.log(chalk.yellow('예시:'));
        console.log('  firstvibe config set openai.apiKey sk-...');
        console.log('  firstvibe config set openai.prdModel gpt-5-mini');
        console.log('  firstvibe config set app.defaultQuestions 15');
        console.log('  firstvibe config get openai.prdModel');
        console.log('  firstvibe config mode cheap              # 빠르고 경제적');
        console.log('  firstvibe config mode expensive          # 고품질, 고비용');
      })
  )
  .addCommand(
    new Command('mode')
      .description('성능/비용 모드 설정 (cheap: 빠르고 저렴, expensive: 고품질)')
      .argument('[mode]', '모드: cheap, expensive, status (기본값: status)')
      .action(async (mode) => {
        try {
          if (!mode || mode === 'status') {
            const currentMode = getCurrentMode();
            console.log(chalk.bold.blue('📊 현재 설정 모드:\n'));

            if (currentMode === 'cheap') {
              console.log(chalk.green('💰 cheap 모드') + chalk.gray(' - 빠르고 경제적'));
              console.log(chalk.gray('  • Model: gpt-5-mini'));
              console.log(chalk.gray('  • Verbosity: low'));
              console.log(chalk.gray('  • Reasoning Effort: minimal'));
            } else if (currentMode === 'expensive') {
              console.log(chalk.green('💎 expensive 모드') + chalk.gray(' - 고품질, 고비용'));
              console.log(chalk.gray('  • Model: gpt-5'));
              console.log(chalk.gray('  • Verbosity: high'));
              console.log(chalk.gray('  • Reasoning Effort: high'));
            } else {
              console.log(chalk.yellow('🔧 custom 모드') + chalk.gray(' - 사용자 정의 설정'));
              console.log(chalk.gray('  • 개별 설정이 혼합되어 있습니다'));
            }

            console.log(chalk.gray('\n사용 가능한 모드:'));
            console.log(chalk.cyan('  cheap      ') + chalk.gray('빠르고 경제적 (gpt-5-mini, verbosity: low, reasoning: minimal)'));
            console.log(chalk.cyan('  expensive  ') + chalk.gray('고품질, 고비용 (gpt-5, verbosity: high, reasoning: high)'));

          } else if (mode === 'cheap') {
            if (setCheapMode()) {
              console.log(chalk.green('✅ cheap 모드로 설정되었습니다'));
              console.log(chalk.gray('  • 모든 모델: gpt-5-mini'));
              console.log(chalk.gray('  • 모든 verbosity: low'));
              console.log(chalk.gray('  • 모든 reasoning effort: minimal'));
              console.log(chalk.yellow('💡 빠르고 경제적인 문서 생성이 가능합니다'));
            } else {
              console.error(chalk.red('❌ 설정 변경에 실패했습니다'));
              process.exit(1);
            }

          } else if (mode === 'expensive') {
            if (setExpensiveMode()) {
              console.log(chalk.green('✅ expensive 모드로 설정되었습니다'));
              console.log(chalk.gray('  • 모든 모델: gpt-5'));
              console.log(chalk.gray('  • 모든 verbosity: high'));
              console.log(chalk.gray('  • 모든 reasoning effort: high'));
              console.log(chalk.yellow('💡 고품질 문서 생성이 가능합니다 (시간과 비용이 더 소요됩니다)'));
            } else {
              console.error(chalk.red('❌ 설정 변경에 실패했습니다'));
              process.exit(1);
            }

          } else {
            console.error(chalk.red(`❌ 알 수 없는 모드: ${mode}`));
            console.log(chalk.yellow('사용 가능한 모드: cheap, expensive, status'));
            process.exit(1);
          }
        } catch (error) {
          console.error(chalk.red('❌ 모드 설정 중 오류:'), error.message);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('reset')
      .description('모든 설정을 기본값으로 초기화 (주의: 복구 불가)')
      .option('--force', '확인 프롬프트 없이 강제 초기화')
      .action(async (options) => {
        try {
          if (!options.force) {
            const response = await wrappedPrompts({
              type: 'confirm',
              name: 'reset',
              message: chalk.red('정말로 모든 설정을 기본값으로 초기화하시겠습니까?'),
              initial: false
            }, {
              onCancel: (prompt) => {
                if (!prompt.sigint) {
                  return disableEsc();
                }
                return handleCtrlC();
              }
            });

            const confirmResult = response.reset;

            if (!confirmResult) {
              console.log(chalk.yellow('취소되었습니다.'));
              return;
            }
          }

          if (resetConfig()) {
            console.log(chalk.green('✅ 설정이 기본값으로 초기화되었습니다.'));
            console.log(chalk.gray(`설정 파일: ${getConfigFilePath()}`));
          } else {
            console.error(chalk.red('❌ 설정 초기화에 실패했습니다.'));
            process.exit(1);
          }
        } catch (error) {
          console.error(chalk.red('❌ 설정 초기화 중 오류:'), error.message);
          process.exit(1);
        }
      })
  );

// 도움말 명령어 추가
program
  .command('help')
  .description('상세한 사용법과 예시 표시')
  .action(() => {
    console.log(chalk.bold.blue('\n🌟 firstvibe - AI 문서 생성 도구\n'));

    console.log(chalk.cyan('📚 문서 생성:'));
    console.log('  firstvibe                    # 대화형 문서 생성 시작');
    console.log('  firstvibe -v                 # 상세 출력 모드 (디버깅용)');
    console.log('  firstvibe -q 5               # 질문 5개로 빠른 생성');
    console.log('  firstvibe --questions 15     # 질문 15개로 상세 생성');
    console.log('  firstvibe --skip-trd         # PRD만 생성 (TRD 건너뛰기)');
    console.log('  firstvibe --skip-todo        # PRD+TRD만 생성 (TODO 건너뛰기)\n');

    console.log(chalk.cyan('⚙️  설정 관리:'));
    console.log('  firstvibe config mode        # 현재 모드 확인');
    console.log('  firstvibe config mode cheap  # 💰 빠르고 경제적 (gpt-5-mini)');
    console.log('  firstvibe config mode expensive  # 💎 고품질 (gpt-5)');
    console.log('  firstvibe config set openai.apiKey sk-...  # API 키 설정');
    console.log('  firstvibe config get         # 모든 설정 조회');
    console.log('  firstvibe config list        # 사용 가능한 설정 키');
    console.log('  firstvibe config reset       # 설정 초기화\n');

    console.log(chalk.green('🚀 빠른 시작 가이드:'));
    console.log('  1️⃣  API 키 설정    → firstvibe config set openai.apiKey sk-...');
    console.log('  2️⃣  모드 선택      → firstvibe config mode cheap');
    console.log('  3️⃣  문서 생성      → firstvibe\n');

    console.log(chalk.yellow('📁 생성되는 파일:'));
    console.log('  📄 prd.md         # 제품요구사항문서 (Product Requirements)');
    console.log('  🔧 trd.md         # 기술요구사항문서 (Technical Requirements)');
    console.log('  ✅ todo.md        # 개발 할일 목록 (Development Tasks)\n');

    console.log(chalk.cyan('🔧 고급:'));
    console.log('  firstvibe help               # 이 도움말 표시');
    console.log('  firstvibe --version          # 버전 정보\n');

    console.log(chalk.gray('💡 팁:'));
    console.log(chalk.gray('  • cheap 모드: 빠르고 저렴한 문서 생성 (프로토타입용)'));
    console.log(chalk.gray('  • expensive 모드: 고품질 문서 생성 (실제 프로젝트용)'));
    console.log(chalk.gray('  • 설정 파일: ') + getConfigFilePath());
  });

program.parse();