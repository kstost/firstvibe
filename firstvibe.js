#!/usr/bin/env node

import OpenAI from "openai";
import inquirer from "inquirer";
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


// inquirer 라이브러리의 취소 처리 함수들
const handleCtrlC = () => {
  console.log(pastelColors.peach('\n\n👋 vibe quitting'));
  process.exit(0);
};

// inquirer 전역 SIGINT 처리
process.on('SIGINT', handleCtrlC);
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

// OpenAI 클라이언트를 동적으로 생성하는 함수
function createOpenAIClient() {
  const config = getEffectiveConfig();
  return new OpenAI({
    apiKey: config.openai.apiKey,
  });
}

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
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: pastelColors.peach('위의 답변들을 확인해주세요. 어떻게 하시겠습니까?'),
        choices: [
          { name: '✅ 답변이 만족스럽습니다. PRD 생성을 시작하세요.', value: 'confirm' },
          { name: '✏️  특정 답변을 수정하고 싶습니다.', value: 'edit' },
          { name: '🔄 처음부터 다시 시작하고 싶습니다.', value: 'restart' }
        ]
      }
    ]);

    return action;
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

    const { questionIndex } = await inquirer.prompt([
      {
        type: 'list',
        name: 'questionIndex',
        message: pastelColors.lightMint('수정하고 싶은 항목을 선택해주세요:'),
        choices: choices
      }
    ]);

    return questionIndex;
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

    const { selection } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message: currentAnswer ?
          pastelColors.lightPurple(`현재 답변: "${currentAnswer}" - 새로운 답변을 선택해주세요:`) :
          pastelColors.lightPurple(`[${this.currentQuestion}/${this.maxQuestions}] ${questionData.question}`),
        choices: choices,
        default: defaultChoice
      }
    ]);

    if (selection === "기타 (직접 입력)") {
      const { custom } = await inquirer.prompt([
        {
          type: 'input',
          name: 'custom',
          message: pastelColors.yellow('직접 입력해주세요:'),
          default: currentAnswer && !choices.slice(0, -1).includes(currentAnswer) ? currentAnswer : '',
          validate: (input) => {
            return input.trim() !== '' || '답변을 입력해주세요.';
          }
        }
      ]);

      return custom;
    }

    return selection;
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
      const openai = createOpenAIClient();
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
            "text": `# Role
You are a question-driven facilitator that leads brainstorming sessions for app/web MVP development, helping users quickly complete **PRD (Product Requirements Document)** and **TRD (Technical Requirements Document)**.
Your core mission is to present short, clear single questions in sequence to drive key decisions and structure all responses for immediate conversion into document drafts.

Main language: Korean

---

## Conversation Principles
- Use Korean formal language.
- Present **only 1 question** at a time.
- Manage total Q&A within **${this.maxQuestions} questions** (prioritize essential items).
- Write questions **short and concise** (core concepts only).
- Minimize explanations, supplement with one sentence if necessary.

---

## Question Scope and Order
Progress through these 5 areas in order, customizing based on previous answers:
1) **Product Overview**  
2) **User Definition**  
3) **Core Features (MVP)**  
4) **Non-functional/Technical Requirements (TRD linkage)**  
5) **Business Goals**

> When ${this.maxQuestions} is limited, prioritize in order: 1→3→4→2→5 (ensure essential coverage).

---

## Choice Design Rules
- Provide **4-5 choices** for each question.
- Choices should be **short and mutually exclusive**, representing different decision directions.
- Each choice contains **single concept only** (don't mix multiple concepts).
- Don't use open-ended choices like "Other/Direct input".
- For numerical choices (performance, availability, etc.), present in **domain-appropriate intervals** (high/medium/low or ranges, prohibit specific value enumeration).
- **Single selection only**: Multiple selection is not allowed. Each question must have exactly one answer selected.

---

## Progress Method (Turn Management)
- Each turn outputs only **1 question and corresponding choices**.  
- Response format requires **simple selection indication** only.  
- When ambiguous/contradictory responses are detected, correct with **short verification question (yes/no)** (this also counts as 1 question).

---

## Customization Rules
- **Chain Customization**: Adjust difficulty/scope of next question based on previous selection.  
  - e.g., If specific platform is chosen, follow up with decision items fitting that platform characteristics (priority device, deployment path, UI/UX constraints, etc.).
- **Domain-Specific Transition**: Once problem domain is determined, prioritize core flows/policies/constraints of that domain.
- **Complexity Control**: When multiple selection exceeds limit, briefly request to **keep only top items**.
- **Mutual Exclusivity Guarantee**: When conflicting choices are presented/selected together, guide toward single selection consolidation.
- **Question Dependency Management**: Carefully consider dependencies between questions. Ensure prerequisite information is gathered before asking dependent questions. For example, ask about target platform before platform-specific technical requirements, or establish user type before asking about user-specific features.

---

## State Management (Internal)
Accumulate selections as **structured state object** during conversation (not exposed in dialogue).
- **Product**: Form, problem definition, core value, platform/device, differentiating elements
- **User**: Primary target, persona outline, region/language, main usage scenarios
- **Core Features (MVP)**: Essential flows (with caps), differentiating features (with caps), operational/management elements
- **Non-functional/Technical (TRD)**: Performance (SLO), availability, security/compliance, scalability, accessibility, observability, data storage/processing, integration/external connectivity, preferred stack, deployment/hosting, release strategy
- **Business**: North Star metrics, primary KPIs, monetization, launch scope, timeline goals

At section end, internally check missing items and prioritize补充未确定项目in next questions.

---

## Question Design Guide (Descriptive)
- **Product Overview**: Quickly establish product form, problem domain, core value. Structure choices to represent different product visions.
- **User Definition**: Narrow down primary target, region/language, top priority scenarios. Create choices covering different user groups/market categories.
- **Core Features (MVP)**: Select essential flows and differentiating features within **caps**, while determining basic operational requirements.
- **Non-functional/Technical Requirements**: Present **measurable or selectable items** like performance, availability, security, data, stack, deployment with quantitative/qualitative mixed choices (numerical in interval units).
- **Business Goals**: Establish North Star metrics, monetization, launch scope, timeline. Include progressive, conservative, aggressive options reflecting organizational risk preferences and resource levels.

---

## Starting Procedure
Begin conversation with question from **highest-level decision in Product Overview area**.  
Structure initial question choices to quickly differentiate product visions, with subsequent questions progressively narrowing scope based on previous selections.
`
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
      const openai = createOpenAIClient();
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
        const { restart } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'restart',
            message: chalk.red('정말로 처음부터 다시 시작하시겠습니까? 현재 답변들이 모두 사라집니다.'),
            default: false
          }
        ]);

        const confirmResult = restart;

        if (confirmResult) {
          console.log(chalk.yellow('🔄 처음부터 다시 시작합니다...'));
          return false; // restart 신호
        }
        // 확인을 거부한 경우, 다시 루프
      }
    }
  }

  async promptForApiKey() {
    // console.log(`███████╗██╗██████╗ ███████╗████████╗██╗   ██╗██╗██████╗ ███████╗`);
    // console.log(`██╔════╝██║██╔══██╗██╔════╝╚══██╔══╝██║   ██║██║██╔══██╗██╔════╝`);
    // console.log(`█████╗  ██║██████╔╝███████╗   ██║   ██║   ██║██║██████╔╝█████╗  `);
    // console.log(`██╔══╝  ██║██╔══██╗╚════██║   ██║   ╚██╗ ██╔╝██║██╔══██╗██╔══╝  `);
    // console.log(`██║     ██║██║  ██║███████║   ██║    ╚████╔╝ ██║██████╔╝███████╗`);
    // console.log(`╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝     ╚═══╝  ╚═╝╚═════╝ ╚══════╝`);

    console.log(pastelColors.lavender.bold('\n🚀 firstvibe 초기 설정'));
    console.log(pastelColors.lightPurple('처음 사용하시는군요! 설정을 도와드릴게요.\n'));

    console.log(chalk.yellow('📝 OpenAI API 키가 필요합니다.'));
    console.log(chalk.gray('   OpenAI API 키는 다음 링크에서 발급받을 수 있습니다:'));
    console.log(chalk.blue('   👉 https://platform.openai.com/account/api-keys\n'));

    let apiKey;
    while (!apiKey) {
      const response = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiKey',
          message: '🔑 OpenAI API 키를 입력해주세요 (sk-로 시작):',
          default: '', // 항상 빈 값으로 시작
          transformer: (input) => {
            // 입력할 때 * 표시
            return '*'.repeat(input.length);
          }
        }
      ]);

      const inputValue = response.apiKey;

      if (!inputValue) {
        console.log(chalk.yellow('\n설정이 취소되었습니다. 나중에 다시 실행해주세요.'));
        process.exit(0);
      }

      // 검증
      if (!inputValue.startsWith('sk-')) {
        console.log(chalk.red('❌ API 키는 sk-로 시작해야 합니다.\n'));
        continue; // 다시 입력 요청
      }

      if (inputValue.length < 20) {
        console.log(chalk.red('❌ API 키가 너무 짧습니다.\n'));
        continue; // 다시 입력 요청
      }

      apiKey = inputValue; // 검증 통과
    }

    // API 키 저장
    const { setConfigValue } = await import('./config.js');
    setConfigValue('openai.apiKey', apiKey);

    console.log(chalk.green('\n✅ API 키가 성공적으로 설정되었습니다!'));

    // API 키 설정 완료, 함수 종료하여 start()로 돌아감
  }

  async start() {
    // ASCII ART 출력 (앱 시작시 한번만)
    console.log(`███████╗██╗██████╗ ███████╗████████╗██╗   ██╗██╗██████╗ ███████╗`);
    console.log(`██╔════╝██║██╔══██╗██╔════╝╚══██╔══╝██║   ██║██║██╔══██╗██╔════╝`);
    console.log(`█████╗  ██║██████╔╝███████╗   ██║   ██║   ██║██║██████╔╝█████╗  `);
    console.log(`██╔══╝  ██║██╔══██╗╚════██║   ██║   ╚██╗ ██╔╝██║██╔══██╗██╔══╝  `);
    console.log(`██║     ██║██║  ██║███████║   ██║    ╚████╔╝ ██║██████╔╝███████╗`);
    console.log(`╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝     ╚═══╝  ╚═╝╚═════╝ ╚══════╝`);
    console.log('');

    // 설정 로드 및 API 키 확인
    const effectiveConfig = getEffectiveConfig();
    if (!effectiveConfig.openai.apiKey) {
      await this.promptForApiKey();
      // API 키 설정 후 다시 설정을 로드하고 계속 진행
      const newConfig = getEffectiveConfig();
      if (!newConfig.openai.apiKey) {
        return; // 여전히 API 키가 없으면 종료
      }
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


      while (restart) {
        // 초기화 (재시작 시)
        this.qaHistory = [];
        this.currentQuestion = 1;

        // 초기 프로젝트 설명 입력
        const { description } = await inquirer.prompt([
          {
            type: 'input',
            name: 'description',
            message: pastelColors.mint('만들고자 하는 프로젝트에 대해 간단히 설명해주세요:'),
            validate: (input) => {
              return input.trim() !== '' || '프로젝트 설명을 입력해주세요.';
            }
          }
        ]);

        const initialInput = description;

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
          // 화면 클리어 후 PRD 문서 생성 및 출력
          console.clear();
          await this.generateAndDisplayPRD();
        }
        // confirmed가 false면 다시 루프를 돈다 (재시작)
      }

    } catch (error) {
      // SIGINT (Ctrl+C) 에러인 경우 우아하게 종료
      if (error.message.includes('User force closed') || error.message.includes('SIGINT')) {
        console.log(pastelColors.peach('\n👋 vibe quitting'));
        process.exit(0);
      }

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
            const { reset } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'reset',
                message: chalk.red('정말로 모든 설정을 기본값으로 초기화하시겠습니까?'),
                default: false
              }
            ]);

            const confirmResult = reset;

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