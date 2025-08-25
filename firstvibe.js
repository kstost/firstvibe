#!/usr/bin/env node

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
import { generateQuestions, generatePRD } from "./ai_api.js";
import { PRD_SYSTEM_PROMPT, createQuestionSystemPrompt } from "./system_prompts.js";
import PRDGenerator from "./PRDGenerator.js";




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
  1. 초기 설정: firstvibe (AI 제공자 및 API 키 설정)
  2. 모드 선택: firstvibe config mode cheap (또는 expensive)  
  3. 문서 생성: firstvibe 또는 firstvibe -f 파일명.txt`)
  .version('1.1.0')
  .argument('[description]', '프로젝트 설명 (옵션, 제공하지 않으면 대화형으로 입력)')
  .option('-v, --verbose', '상세 출력 모드 (디버깅 정보 표시)')
  .option('--skip-trd', 'TRD 생성 건너뛰기 (PRD만 생성)')
  .option('--skip-todo', 'TODO 생성 건너뛰기 (PRD, TRD만 생성)')
  .option('-q, --questions <number>', '질문 횟수 설정 (1-50, 기본값: 10)', '10')
  .option('-f, --file <path>', '프로젝트 설명이 담긴 파일 경로')
  .action(async (description, options) => {
    try {
      const prdGenerator = new PRDGenerator();
      prdGenerator.options = options;
      prdGenerator.setMaxQuestions(options.questions);
      
      // 프로젝트 설명 입력 우선순위: 파일 > 명령줄 인수
      if (options.file) {
        // 파일 경로로 프로젝트 설명이 제공된 경우
        try {
          const fileContent = fs.readFileSync(options.file, 'utf8');
          prdGenerator.commandLineDescription = fileContent.trim();
          
          if (description) {
            console.log(chalk.yellow('⚠️  파일과 명령줄 설명이 모두 제공되었습니다. 파일 내용을 사용합니다.'));
          }
        } catch (error) {
          console.error(chalk.red(`❌ 파일을 읽을 수 없습니다: ${options.file}`));
          console.error(chalk.gray(`오류: ${error.message}`));
          process.exit(1);
        }
      } else if (description) {
        // 명령줄 인수로 프로젝트 설명이 제공된 경우
        prdGenerator.commandLineDescription = description;
      }
      
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
        console.log('  app.skipTodo               # TODO 생성 건너뛰기');
        console.log('  app.log                    # API 요청/응답 로깅 활성화 (기본: false)\n');

        console.log(chalk.yellow('예시:'));
        console.log('  firstvibe config set openai.apiKey sk-...');
        console.log('  firstvibe config set openai.prdModel gpt-5-mini');
        console.log('  firstvibe config set app.defaultQuestions 15');
        console.log('  firstvibe config set app.log true        # API 로깅 활성화');
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
    console.log('  firstvibe "diet app"         # 명령줄에서 프로젝트 설명 제공');
    console.log('  firstvibe -f project.txt     # 파일에서 프로젝트 설명 읽기');
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
    console.log('  1️⃣  초기 설정      → firstvibe (AI 제공자 및 API 키 선택)');
    console.log('  2️⃣  모드 선택      → firstvibe config mode cheap');
    console.log('  3️⃣  문서 생성      → firstvibe\n');

    console.log(chalk.yellow('📁 생성되는 파일:'));
    console.log('  💾 firstvibe.json # 질문-답변 데이터 (Q&A History)');
    console.log('  📄 prd.md         # 제품요구사항문서 (Product Requirements)');
    console.log('  🔧 trd.md         # 기술요구사항문서 (Technical Requirements)');
    console.log('  ✅ todo.yaml      # 개발 할일 목록 (Development Tasks)\n');

    console.log(chalk.cyan('🔧 고급:'));
    console.log('  firstvibe help               # 이 도움말 표시');
    console.log('  firstvibe --version          # 버전 정보\n');

    console.log(chalk.gray('💡 팁:'));
    console.log(chalk.gray('  • cheap 모드: 빠르고 저렴한 문서 생성 (프로토타입용)'));
    console.log(chalk.gray('  • expensive 모드: 고품질 문서 생성 (실제 프로젝트용)'));
    console.log(chalk.gray('  • 설정 파일: ') + getConfigFilePath());
  });

program.parse();