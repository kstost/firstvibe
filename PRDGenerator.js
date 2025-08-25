import inquirer from "inquirer";
import chalk from "chalk";
import fs from "fs";
import makeTRD from "./make_trd.js";
import trdToTodo from "./trd_to_todo.js";
import {
  getConfigFilePath,
  getEffectiveConfig,
  setConfigValue
} from "./config.js";
import { generateQuestions, generatePRD } from "./ai_api.js";
import { PRD_SYSTEM_PROMPT, createQuestionSystemPrompt } from "./system_prompts.js";
import { tagify } from "./utils.js";

const pastelColors = {
  pink: chalk.hex('#FFB3BA'),
  mint: chalk.hex('#BAFFC9'),
  yellow: chalk.hex('#FFFFBA'),
  lavender: chalk.hex('#C8BFE7'),
  blue: chalk.hex('#B3E5FC'),
  orange: chalk.hex('#FFCBA4'),
  peach: chalk.hex('#FFD7AF'),
  lightMint: chalk.hex('#AFFFD7'),
  lightPurple: chalk.hex('#D7AFFF'),
  lightPink: chalk.hex('#FFAFD7')
};

class PRDGenerator {
  constructor() {
    this.qaHistory = [];
    this.currentQuestion = 1;
    this.maxQuestions = 10; // 기본값, options에서 덮어씀
    this.options = {};
    this.firstvibeJsonData = null; // firstvibe.json 데이터
  }

  setMaxQuestions(count) {
    const questionCount = parseInt(count, 10);
    if (isNaN(questionCount) || questionCount < 1 || questionCount > 50) {
      console.error(chalk.red('❌ 질문 횟수는 1~50 사이의 숫자여야 합니다.'));
      process.exit(1);
    }
    this.maxQuestions = questionCount;
  }

  restoreQAHistoryFromJson() {
    if (!this.firstvibeJsonData) return false;

    // 프로젝트 설명을 첫 번째 히스토리로 추가
    this.qaHistory = [{
      userInput: this.firstvibeJsonData.project.description,
      questionNumber: 0
    }];

    // QA 히스토리 복원
    this.firstvibeJsonData.qa_history.forEach((qa, index) => {
      this.qaHistory.push({
        questionNumber: index + 1,
        aiResponse: {
          questions: [{
            question: qa.question,
            choices: qa.choices
          }]
        },
        userAnswer: qa.answer
      });
    });

    return true;
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
        console.log(pastelColors.blue.bold(`[${i + 1}] ${question}`));
        console.log(pastelColors.mint(` ⎿ ${qa.userAnswer}`));
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

    let selection;
    
    if (process.stdin.isTTY || this.commandLineDescription) {
      // 대화형 모드: 일반적인 inquirer 사용 (명령줄 인수 제공 시에도 대화형)
      const result = await inquirer.prompt([
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
      selection = result.selection;
    } else {
      // 비대화형 모드: 첫 번째 선택지 자동 선택 (파이프 입력인 경우만)
      selection = choices[defaultChoice];
      console.log(pastelColors.lightPurple(`[${this.currentQuestion}/${this.maxQuestions}] ${questionData.question}`));
      console.log(pastelColors.yellow(`자동 선택: ${selection}`));
    }

    if (selection === "기타 (직접 입력)") {
      if (process.stdin.isTTY || this.commandLineDescription) {
        // 멀티라인 입력을 위한 여러 번 입력받기 방식
        console.log(pastelColors.yellow('직접 입력해주세요. 여러 줄을 원하시면 각 줄을 차례로 입력하세요.'));
        console.log(pastelColors.lavender('빈 줄에서 엔터치면 완료됩니다.'));
        
        let customLines = [];
        
        // 현재 답변이 있으면 기본값으로 설정
        if (currentAnswer) {
          customLines = currentAnswer.split('\n');
          console.log(pastelColors.lightPurple(`현재 답변: ${currentAnswer}`));
        }
        
        while (true) {
          const result = await inquirer.prompt([
            {
              type: 'input',
              name: 'line',
              message: '❯',
              default: ''
            }
          ]);
          
          const line = result.line?.trim();
          
          if (!line) {
            // 빈 줄이면 완료
            break;
          }
          
          customLines.push(line);
        }
        
        const custom = customLines.join('\n').trim();
        
        if (!custom) {
          console.log(chalk.red('답변을 입력해주세요.'));
          return await this.askQuestion(questionData, currentAnswer);
        }
        
        return custom;
      } else {
        // 비대화형 모드: 기본값 또는 프로젝트 설명 기반 답변 사용 (파이프 입력인 경우만)
        const defaultValue = currentAnswer && !choices.slice(0, -1).includes(currentAnswer) ? currentAnswer : '기본 설정';
        console.log(pastelColors.yellow(`직접 입력 (자동): ${defaultValue}`));
        return defaultValue;
      }
    }

    return selection;
  }

  async generatePRD() {
    // Q&A 데이터를 tagify로 구조화하여 PRD 생성을 위한 텍스트로 변환
    const qaStructure = {
      tagname: "project_requirements",
      children: [
        {
          tagname: "project_description",
          children: [
            { content: this.qaHistory[0].userInput }
          ]
        },
        {
          tagname: "collected_requirements",
          children: []
        }
      ]
    };

    // Q&A 항목들을 구조화
    for (let i = 0; i < this.qaHistory.length; i++) {
      const qa = this.qaHistory[i];
      if (qa.aiResponse && qa.aiResponse.questions && qa.userAnswer) {
        const question = qa.aiResponse.questions[0].question;
        const qaItem = {
          tagname: "qa_item",
          children: [
            {
              tagname: "question",
              children: [{ content: question }]
            },
            {
              tagname: "answer", 
              children: [{ content: qa.userAnswer }]
            }
          ]
        };
        qaStructure.children[1].children.push(qaItem);
      }
    }

    // tagify를 사용하여 구조화된 텍스트 생성
    const qaText = tagify(qaStructure);

    const input = [
      {
        "role": "developer",
        "content": [
          {
            "type": "input_text",
            "text": PRD_SYSTEM_PROMPT
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": qaText
          }
        ]
      }
    ];

    try {
      return await generatePRD(input);
    } catch (error) {
      console.error(pastelColors.pink(`❌ PRD 생성 중 오류가 발생했습니다: ${error.message}`));
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
        console.log(pastelColors.blue('  • firstvibe.json') + pastelColors.lightPurple(' - 질문-답변 데이터'));
        console.log(pastelColors.blue('  • prd.md') + pastelColors.lightPurple(' - 제품요구사항문서'));
        console.log(pastelColors.blue('  • trd.md') + pastelColors.lightPurple(' - 기술요구사항문서'));
        return;
      }

      // TRD를 바탕으로 TODO 생성
      const { markdown } = await trdToTodo(trd);

      const todoPath = 'todo.yaml';
      fs.writeFileSync(todoPath, markdown, 'utf8');
      console.log(pastelColors.mint('✅ TODO 변환 완료: ') + pastelColors.blue(todoPath));

      console.log(pastelColors.mint.bold('\n🎉 전체 문서 생성이 완료되었습니다!'));
      console.log(pastelColors.lightPurple('생성된 파일들:'));
      console.log(pastelColors.blue('  • firstvibe.json') + pastelColors.lightPurple(' - 질문-답변 데이터'));
      console.log(pastelColors.blue('  • prd.md') + pastelColors.lightPurple(' - 제품요구사항문서'));
      console.log(pastelColors.blue('  • trd.md') + pastelColors.lightPurple(' - 기술요구사항문서'));
      console.log(pastelColors.blue('  • todo.yaml') + pastelColors.lightPurple(' - 개발 할일 목록'));
      console.log(pastelColors.peach('✨ 이제 바이브코딩을 시작할 준비가 되었습니다!'));

    } catch (error) {
      console.error(pastelColors.pink('❌ TRD/TODO 생성 중 오류가 발생했습니다: ') + error.message);
      if (this.options.verbose) {
        console.error(pastelColors.lightPurple('상세 오류:'), error.stack);
      }
      console.error(pastelColors.lightPurple('PRD 문서는 성공적으로 생성되었으니 수동으로 TRD를 작성해 주세요.'));
      process.exit(1);
    }
  }

  async getAIResponse() {

    // 대화 히스토리를 tagify로 구조화
    const conversationStructure = {
      tagname: "conversation_history",
      children: [
        {
          tagname: "initial_project_description",
          children: [
            { content: this.qaHistory[0].userInput }
          ]
        }
      ]
    };

    // 첫 번째 질문이 아닌 경우, 이전 Q&A들을 추가
    if (this.qaHistory.length > 1) {
      const previousQASection = {
        tagname: "previous_qa_history",
        children: []
      };

      for (let i = 0; i < this.qaHistory.length; i++) {
        const qa = this.qaHistory[i];
        if (qa.aiResponse && qa.aiResponse.questions && qa.userAnswer) {
          const qaHistoryItem = {
            tagname: "qa_history_item",
            children: [
              {
                tagname: "previous_question",
                children: [{ content: qa.aiResponse.questions[0].question }]
              },
              {
                tagname: "user_answer",
                children: [{ content: qa.userAnswer }]
              }
            ]
          };
          previousQASection.children.push(qaHistoryItem);
        }
      }

      if (previousQASection.children.length > 0) {
        conversationStructure.children.push(previousQASection);
      }
    }

    // tagify를 사용하여 구조화된 대화 히스토리 생성
    const conversationHistory = tagify(conversationStructure);

    const messages = [
      {
        "role": "developer",
        "content": [
          {
            "type": "input_text",
            "text": createQuestionSystemPrompt(this.maxQuestions)
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": conversationHistory
          }
        ]
      }
    ];

    const jsonSchema = {
      name: "prd_interrogator",
      strict: true,
      schema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            description: "A list of short, clear PRD-related questions to ask the user, designed to cover all necessary elements for a product requirements document. Each question should be concise and easy to understand.",
            items: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "A short, clear, and focused question relevant to a PRD element."
                },
                choices: {
                  type: "array",
                  description: "Short, clear choice options (4-5 options) that are easy to understand and select.",
                  items: {
                    type: "string"
                  }
                }
              },
              required: [
                "question",
                "choices"
              ],
              additionalProperties: false
            }
          }
        },
        required: [
          "questions"
        ],
        additionalProperties: false
      }
    };

    try {
      return await generateQuestions(messages, jsonSchema);
    } catch (error) {
      console.error(pastelColors.pink(`❌ API 호출 중 오류가 발생했습니다: ${error.message}`));
      throw error;
    }
  }

  async reviewAndConfirmAnswers() {
    if (!process.stdin.isTTY && !this.commandLineDescription) {
      // 비대화형 모드: 자동으로 확인하고 계속 진행 (파이프 입력인 경우만)
      this.displayQASummary();
      console.log(pastelColors.peach('비대화형 모드: 답변을 자동으로 확인하고 PRD 생성을 시작합니다.'));
      return true;
    }
    
    // 대화형 모드: 기존 로직
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
    console.log(pastelColors.lavender.bold('\n🚀 firstvibe 초기 설정'));
    console.log(pastelColors.lightPurple('처음 사용하시는군요! 설정을 도와드릴게요.\n'));

    // AI 제공자 선택
    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: '🤖 사용할 AI 제공자를 선택해주세요:',
        choices: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Google', value: 'gemini' }
        ],
        default: 'openai'
      }
    ]);

    // 선택된 제공자에 대한 정보 표시
    switch (provider) {
      case 'openai':
        console.log(chalk.yellow('📝 OpenAI API 키가 필요합니다.'));
        console.log(chalk.gray('   OpenAI API 키는 다음 링크에서 발급받을 수 있습니다:'));
        console.log(chalk.blue('   👉 https://platform.openai.com/account/api-keys\n'));
        break;
      case 'gemini':
        console.log(chalk.yellow('📝 Google AI Studio API 키가 필요합니다.'));
        console.log(chalk.gray('   Google AI Studio API 키는 다음 링크에서 발급받을 수 있습니다:'));
        console.log(chalk.blue('   👉 https://aistudio.google.com/app/apikey\n'));
        break;
      case 'claude':
        console.log(chalk.yellow('📝 Anthropic API 키가 필요합니다.'));
        console.log(chalk.gray('   Anthropic API 키는 다음 링크에서 발급받을 수 있습니다:'));
        console.log(chalk.blue('   👉 https://console.anthropic.com/account/keys\n'));
        break;
    }

    // 제공자별 API 키 입력 프롬프트
    let apiKeyMessage, apiKeyPrefix;
    switch (provider) {
      case 'openai':
        apiKeyMessage = '🔑 OpenAI API 키를 입력해주세요 (sk-로 시작):';
        apiKeyPrefix = 'sk-';
        break;
      case 'gemini':
        apiKeyMessage = '🔑 Google AI Studio API 키를 입력해주세요:';
        apiKeyPrefix = '';
        break;
      case 'claude':
        apiKeyMessage = '🔑 Anthropic API 키를 입력해주세요 (sk-ant-로 시작):';
        apiKeyPrefix = 'sk-ant-';
        break;
    }

    let apiKey;
    while (!apiKey) {
      const response = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiKey',
          message: apiKeyMessage,
          default: '',
          transformer: (input) => {
            return '*'.repeat(input.length);
          }
        }
      ]);

      const inputValue = response.apiKey;

      if (!inputValue) {
        console.log(chalk.yellow('\n설정이 취소되었습니다. 나중에 다시 실행해주세요.'));
        process.exit(0);
      }

      apiKey = inputValue;
    }

    // 제공자 설정
    const { setConfigValue } = await import('./config.js');
    if (!setConfigValue('provider', provider)) {
      console.log(chalk.red('❌ 제공자 설정 저장에 실패했습니다.'));
      return;
    }

    // API 키 저장
    const configKey = `${provider}.apiKey`;
    if (!setConfigValue(configKey, apiKey)) {
      console.log(chalk.red('❌ API 키 저장에 실패했습니다.'));
      return;
    }

    console.log(chalk.green(`\n✅ ${provider.toUpperCase()} API 키가 성공적으로 설정되었습니다!`));

    // 모델 선택
    console.log(pastelColors.lightPurple('\n📋 사용할 모델을 선택해주세요:'));

    let modelChoices = [];
    switch (provider) {
      case 'openai':
        modelChoices = [
          { name: 'gpt-5 (최고 성능)', value: 'gpt-5' },
          { name: 'gpt-5-mini (균형)', value: 'gpt-5-mini' },
          { name: 'gpt-5-nano (빠르고 경제적)', value: 'gpt-5-nano' }
        ];
        break;
      case 'gemini':
        modelChoices = [
          { name: 'gemini-2.5-pro (최고 성능)', value: 'gemini-2.5-pro' },
          { name: 'gemini-2.5-flash (빠름)', value: 'gemini-2.5-flash' },
          { name: 'gemini-2.5-flash-lite (가장 빠름)', value: 'gemini-2.5-flash-lite' }
        ];
        break;
      case 'claude':
        modelChoices = [
          { name: 'claude-opus-4-1-20250805 (최신 Opus)', value: 'claude-opus-4-1-20250805' },
          { name: 'claude-opus-4-20250514 (Opus)', value: 'claude-opus-4-20250514' },
          { name: 'claude-sonnet-4-20250514 (Sonnet 4)', value: 'claude-sonnet-4-20250514' },
          { name: 'claude-3-7-sonnet-20250219 (Sonnet 3.7)', value: 'claude-3-7-sonnet-20250219' },
          { name: 'claude-3-5-haiku-20241022 (Haiku)', value: 'claude-3-5-haiku-20241022' }
        ];
        break;
    }

    const { selectedModel } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedModel',
        message: '🤖 모델을 선택해주세요:',
        choices: modelChoices,
        default: modelChoices[0].value
      }
    ]);

    // 모든 용도에 선택된 모델 적용
    const modelKeys = [`${provider}.questionModel`, `${provider}.prdModel`, `${provider}.trdModel`, `${provider}.todoModel`];
    for (const key of modelKeys) {
      if (!setConfigValue(key, selectedModel)) {
        console.log(chalk.red(`❌ ${key} 설정 저장에 실패했습니다.`));
        return;
      }
    }

    console.log(chalk.green(`✅ 모델 ${selectedModel}이 모든 용도에 적용되었습니다!`));

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
    const provider = effectiveConfig.provider || 'openai';

    let hasApiKey = false;
    switch (provider) {
      case 'openai':
        hasApiKey = !!effectiveConfig.openai.apiKey;
        break;
      case 'gemini':
        hasApiKey = !!effectiveConfig.gemini.apiKey;
        break;
      case 'claude':
        hasApiKey = !!effectiveConfig.claude.apiKey;
        break;
    }

    if (!hasApiKey) {
      await this.promptForApiKey();
      // API 키 설정 후 다시 설정을 로드하고 계속 진행
      const newConfig = getEffectiveConfig();
      const newProvider = newConfig.provider || 'openai';

      let newHasApiKey = false;
      switch (newProvider) {
        case 'openai':
          newHasApiKey = !!newConfig.openai.apiKey;
          break;
        case 'gemini':
          newHasApiKey = !!newConfig.gemini.apiKey;
          break;
        case 'claude':
          newHasApiKey = !!newConfig.claude.apiKey;
          break;
      }

      if (!newHasApiKey) {
        return;
      }
    }

    console.log(pastelColors.lavender.bold('🚀 firstvibe - Vibe Document Generator'));
    console.log(pastelColors.lightPurple('쉽게 PRD, TRD, TODO List를 만들 수 있는 문서 생성 도구\n'));

    if (this.options.verbose) {
      console.log(chalk.gray('🔧 상세 출력 모드가 활성화되었습니다.'));
      console.log(chalk.gray(`📍 현재 작업 디렉토리: ${process.cwd()}`));
      console.log(chalk.gray(`📁 설정 파일: ${getConfigFilePath()}`));
      console.log(chalk.gray(`❓ 설정된 질문 횟수: ${this.maxQuestions}개`));
      const currentProvider = effectiveConfig.provider || 'openai';
      let modelInfo = '';
      switch (currentProvider) {
        case 'openai':
          modelInfo = `PRD(${effectiveConfig.openai.prdModel}), TRD(${effectiveConfig.openai.trdModel}), TODO(${effectiveConfig.openai.todoModel})`;
          break;
        case 'gemini':
          modelInfo = `PRD(${effectiveConfig.gemini.prdModel}), TRD(${effectiveConfig.gemini.trdModel}), TODO(${effectiveConfig.gemini.todoModel})`;
          break;
        case 'claude':
          modelInfo = `PRD(${effectiveConfig.claude.prdModel}), TRD(${effectiveConfig.claude.trdModel}), TODO(${effectiveConfig.claude.todoModel})`;
          break;
      }
      console.log(chalk.gray(`🤖 AI 제공자: ${currentProvider.toUpperCase()}`));
      console.log(chalk.gray(`📋 사용 모델: ${modelInfo}\n`));
    }

    try {
      // firstvibe.json 데이터가 있으면 설문 과정 건너뛰기
      if (this.firstvibeJsonData) {
        console.log(pastelColors.lavender.bold('🚀 firstvibe.json에서 데이터를 복원합니다.'));
        
        if (this.restoreQAHistoryFromJson()) {
          console.log(pastelColors.mint(`📝 프로젝트: ${this.firstvibeJsonData.project.description}`));
          console.log(pastelColors.lightPurple(`📊 복원된 질문-답변: ${this.firstvibeJsonData.qa_history.length}개\n`));
          
          // QA 요약 표시
          this.displayQASummary();
          
          // 답변 검토 및 확인 단계로 이동 (수정/확인 선택)
          const confirmed = await this.reviewAndConfirmAnswers();
          
          if (confirmed) {
            // 확인됐으면 PRD 생성
            process.stdout.write('\x1B[1A\x1B[2K');
            await this.generateAndDisplayPRD();
            return;
          } else {
            // 수정을 원한다면 일반 설문 과정으로 이동
            console.log(pastelColors.yellow('🔄 설문 과정을 다시 시작합니다...'));
            // firstvibe.json 데이터를 초기화하고 일반 설문 과정으로 진행
            this.firstvibeJsonData = null;
            this.commandLineDescription = this.qaHistory[0].userInput; // 프로젝트 설명만 유지
          }
        }
      }

      let restart = true;

      while (restart) {
        // 초기화 (재시작 시)
        this.qaHistory = [];
        this.currentQuestion = 1;

        // 초기 프로젝트 설명 입력 - 명령줄/대화형/비대화형 모드 구분
        let initialInput;
        
        if (this.commandLineDescription) {
          // 명령줄 인수로 제공된 경우
          initialInput = this.commandLineDescription;
          console.log(pastelColors.mint('📝 프로젝트 설명: ') + pastelColors.yellow(initialInput));
        } else if (process.stdin.isTTY) {
          // 프로젝트 설명 멀티라인 입력
          console.log(pastelColors.mint('만들고자 하는 프로젝트에 대해 설명해주세요. 여러 줄로 입력 가능합니다.'));
          console.log(pastelColors.lavender('빈 줄에서 엔터치면 완료됩니다.'));
          
          let descriptionLines = [];
          
          while (true) {
            const result = await inquirer.prompt([
              {
                type: 'input',
                name: 'line',
                message: '❯',
                default: ''
              }
            ]);
            
            const line = result.line?.trim();
            
            if (!line) {
              // 빈 줄이면 완료
              break;
            }
            
            descriptionLines.push(line);
          }
          
          const description = descriptionLines.join('\n').trim();
          
          if (!description) {
            console.error(chalk.red('프로젝트 설명을 입력해주세요.'));
            process.exit(1);
          }
          initialInput = description;
        } else {
          // 비대화형 모드: stdin에서 파이프된 입력 읽기
          let stdinInput = '';
          process.stdin.setEncoding('utf8');
          
          for await (const chunk of process.stdin) {
            stdinInput += chunk;
          }
          
          // 개행 문자를 보존하면서 앞뒤 공백만 제거
          initialInput = stdinInput.replace(/^\s+|\s+$/g, '');
          
          if (!initialInput) {
            console.error(chalk.red('❌ 파이프된 입력이 비어있습니다.'));
            process.exit(1);
          }
          
          console.log(pastelColors.mint('📝 입력된 프로젝트 설명: ') + pastelColors.yellow(initialInput));
        }

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
          // 이전 줄 지우기 (확인 질문 제거)
          process.stdout.write('\x1B[1A\x1B[2K');
          await this.generateAndDisplayPRD();
        }
        // confirmed가 false면 다시 루프를 돈다 (재시작)
      }

    } catch (error) {
      // console.log('This is error spot!', error);
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
    // 질문-답변 데이터를 firstvibe.json으로 저장
    try {
      const qaData = {
        timestamp: new Date().toISOString(),
        project: {
          description: this.qaHistory[0].userInput
        },
        qa_history: []
      };

      // Q&A 히스토리 구성
      for (let i = 0; i < this.qaHistory.length; i++) {
        const qa = this.qaHistory[i];
        if (qa.aiResponse && qa.aiResponse.questions && qa.userAnswer) {
          qaData.qa_history.push({
            question_number: i,
            question: qa.aiResponse.questions[0].question,
            choices: qa.aiResponse.questions[0].choices,
            answer: qa.userAnswer
          });
        }
      }

      fs.writeFileSync('firstvibe.json', JSON.stringify(qaData, null, 2), 'utf8');
      console.log(pastelColors.lightMint('💾 Q&A 데이터 저장 완료: ') + pastelColors.blue('firstvibe.json'));
    } catch (saveError) {
      console.error(pastelColors.pink('⚠️  Q&A 데이터 저장 실패: ') + saveError.message);
    }

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
        console.error(chalk.red('⚠️  파일 저장 실패: ') + saveError.message);
        console.log(chalk.gray('위 내용을 복사하여 수동으로 저장해 주세요.'));
      }

    } catch (error) {
      console.log(chalk.red('\n❌ PRD 문서 생성에 실패했습니다.'));
      console.log(chalk.gray('수집된 정보를 바탕으로 수동으로 PRD를 작성해 주세요.'));
    }
  }
}

export default PRDGenerator;