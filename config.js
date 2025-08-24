import fs from 'fs';
import { getConfigFilePath } from './utils.js';
import chalk from 'chalk';

// utils.js에서 가져온 함수를 re-export
export { getConfigFilePath };

/**
 * 기본 설정값 정의
 */
const DEFAULT_CONFIG = {
  provider: 'openai', // 기본 AI 제공자
  openai: {
    apiKey: '',
    questionModel: 'gpt-5',
    prdModel: 'gpt-5',
    trdModel: 'gpt-5', 
    todoModel: 'gpt-5',
    questionVerbosity: 'low',
    prdVerbosity: 'medium',
    trdVerbosity: 'medium',
    todoVerbosity: 'medium',
    questionReasoningEffort: 'minimal',
    prdReasoningEffort: 'medium',
    trdReasoningEffort: 'medium',
    todoReasoningEffort: 'medium'
  },
  gemini: {
    apiKey: '',
    questionModel: 'gemini-2.5-pro',
    prdModel: 'gemini-2.5-pro',
    trdModel: 'gemini-2.5-pro',
    todoModel: 'gemini-2.5-pro'
  },
  claude: {
    apiKey: '',
    questionModel: 'claude-opus-4-1-20250805',
    prdModel: 'claude-opus-4-1-20250805',
    trdModel: 'claude-opus-4-1-20250805',
    todoModel: 'claude-opus-4-1-20250805'
  },
  app: {
    defaultQuestions: 10,
    verbose: false,
    skipTrd: false,
    skipTodo: false,
    log: false
  }
};

/**
 * 설정 파일 스키마 검증
 */
function validateConfigSchema(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('설정 파일이 올바른 JSON 객체가 아닙니다.');
  }

  // provider 검증
  if (config.provider && !['openai', 'gemini', 'claude'].includes(config.provider)) {
    throw new Error('provider는 "openai", "gemini", 또는 "claude" 중 하나여야 합니다.');
  }

  // openai 섹션 검증
  if (config.openai && typeof config.openai !== 'object') {
    throw new Error('openai 설정이 올바른 객체가 아닙니다.');
  }

  // gemini 섹션 검증
  if (config.gemini && typeof config.gemini !== 'object') {
    throw new Error('gemini 설정이 올바른 객체가 아닙니다.');
  }

  // claude 섹션 검증
  if (config.claude && typeof config.claude !== 'object') {
    throw new Error('claude 설정이 올바른 객체가 아닙니다.');
  }

  // app 섹션 검증  
  if (config.app && typeof config.app !== 'object') {
    throw new Error('app 설정이 올바른 객체가 아닙니다.');
  }

  // 숫자 값 검증
  if (config.app?.defaultQuestions && 
      (!Number.isInteger(config.app.defaultQuestions) || 
       config.app.defaultQuestions < 1 || 
       config.app.defaultQuestions > 50)) {
    throw new Error('defaultQuestions는 1-50 사이의 정수여야 합니다.');
  }

  // boolean 값 검증
  if (config.app?.log !== undefined && typeof config.app.log !== 'boolean') {
    throw new Error('log 설정은 boolean 값(true/false)이어야 합니다.');
  }

  return true;
}

/**
 * 설정 파일 읽기
 */
export function loadConfig() {
  const configPath = getConfigFilePath();
  
  try {
    if (!fs.existsSync(configPath)) {
      return DEFAULT_CONFIG;
    }
    
    const configContent = fs.readFileSync(configPath, 'utf8');
    const userConfig = JSON.parse(configContent);
    
    // 기본 설정과 사용자 설정 병합
    return mergeConfig(DEFAULT_CONFIG, userConfig);
    
  } catch (error) {
    console.error(chalk.red('❌ 설정 파일 로드 중 오류:'), error.message);
    console.error(chalk.yellow('💡 기본 설정을 사용합니다.'));
    return DEFAULT_CONFIG;
  }
}

/**
 * 설정 파일 저장
 */
export function saveConfig(config) {
  const configPath = getConfigFilePath();
  
  try {
    // 설정을 보기 좋게 정렬하여 저장
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
    
  } catch (error) {
    console.error(chalk.red('❌ 설정 파일 저장 중 오류:'), error.message);
    return false;
  }
}

/**
 * 깊은 병합 함수 (중첩된 객체도 병합)
 */
function mergeConfig(defaultConfig, userConfig) {
  const result = { ...defaultConfig };
  
  for (const key in userConfig) {
    if (userConfig[key] && 
        typeof userConfig[key] === 'object' && 
        !Array.isArray(userConfig[key])) {
      result[key] = { ...result[key], ...userConfig[key] };
    } else {
      result[key] = userConfig[key];
    }
  }
  
  return result;
}

/**
 * 특정 설정값 가져오기 (점 표기법 지원)
 * 예: getConfigValue('openai.apiKey') 
 */
export function getConfigValue(path) {
  const config = loadConfig();
  const keys = path.split('.');
  
  let current = config;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

/**
 * 특정 설정값 설정하기 (점 표기법 지원)
 * 예: setConfigValue('openai.apiKey', 'sk-...') 
 */
export function setConfigValue(path, value) {
  const config = loadConfig();
  const keys = path.split('.');
  const lastKey = keys.pop();
  
  let current = config;
  for (const key of keys) {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[lastKey] = value;
  return saveConfig(config);
}

/**
 * 설정 초기화 (기본값으로 재설정)
 */
export function resetConfig() {
  return saveConfig(DEFAULT_CONFIG);
}

/**
 * 모든 설정값 반환
 */
export function getAllConfig() {
  return loadConfig();
}

/**
 * 설정 파일과 기본값을 병합하여 최종 설정 반환
 * 우선순위: 설정파일 > 기본값
 */
export function getEffectiveConfig() {
  const config = loadConfig();
  
  // 설정 파일 값 사용
  const finalConfig = {
    provider: config.provider,
    openai: {
      apiKey: config.openai.apiKey,
      questionModel: config.openai.questionModel,
      prdModel: config.openai.prdModel,
      trdModel: config.openai.trdModel,
      todoModel: config.openai.todoModel,
      questionVerbosity: config.openai.questionVerbosity,
      prdVerbosity: config.openai.prdVerbosity,
      trdVerbosity: config.openai.trdVerbosity,
      todoVerbosity: config.openai.todoVerbosity,
      questionReasoningEffort: config.openai.questionReasoningEffort,
      prdReasoningEffort: config.openai.prdReasoningEffort,
      trdReasoningEffort: config.openai.trdReasoningEffort,
      todoReasoningEffort: config.openai.todoReasoningEffort
    },
    gemini: {
      ...config.gemini
    },
    claude: {
      ...config.claude
    },
    app: {
      ...config.app
    }
  };
  
  return finalConfig;
}

/**
 * cheap 모드 설정 (빠르고 경제적)
 */
export function setCheapMode() {
  const config = loadConfig();
  const provider = config.provider || 'openai';
  
  switch (provider) {
    case 'openai':
      // 모델을 gpt-5-mini로 설정
      config.openai.questionModel = 'gpt-5-mini';
      config.openai.prdModel = 'gpt-5-mini';
      config.openai.trdModel = 'gpt-5-mini';
      config.openai.todoModel = 'gpt-5-mini';
      
      // verbosity를 low로 설정
      config.openai.questionVerbosity = 'low';
      config.openai.prdVerbosity = 'low';
      config.openai.trdVerbosity = 'low';
      config.openai.todoVerbosity = 'low';
      
      // reasoning effort를 minimal로 설정
      config.openai.questionReasoningEffort = 'minimal';
      config.openai.prdReasoningEffort = 'minimal';
      config.openai.trdReasoningEffort = 'minimal';
      config.openai.todoReasoningEffort = 'minimal';
      break;
      
    case 'gemini':
      // 모델을 gemini-2.5-flash-lite로 설정
      config.gemini.questionModel = 'gemini-2.5-flash-lite';
      config.gemini.prdModel = 'gemini-2.5-flash-lite';
      config.gemini.trdModel = 'gemini-2.5-flash-lite';
      config.gemini.todoModel = 'gemini-2.5-flash-lite';
      break;
      
    case 'claude':
      // 모델을 claude-3-5-haiku로 설정
      config.claude.questionModel = 'claude-3-5-haiku-20241022';
      config.claude.prdModel = 'claude-3-5-haiku-20241022';
      config.claude.trdModel = 'claude-3-5-haiku-20241022';
      config.claude.todoModel = 'claude-3-5-haiku-20241022';
      break;
  }
  
  return saveConfig(config);
}

/**
 * expensive 모드 설정 (고품질, 고비용)
 */
export function setExpensiveMode() {
  const config = loadConfig();
  const provider = config.provider || 'openai';
  
  switch (provider) {
    case 'openai':
      // 모델을 gpt-5로 설정
      config.openai.questionModel = 'gpt-5';
      config.openai.prdModel = 'gpt-5';
      config.openai.trdModel = 'gpt-5';
      config.openai.todoModel = 'gpt-5';
      
      // verbosity를 high로 설정
      config.openai.questionVerbosity = 'high';
      config.openai.prdVerbosity = 'high';
      config.openai.trdVerbosity = 'high';
      config.openai.todoVerbosity = 'high';
      
      // reasoning effort를 high로 설정
      config.openai.questionReasoningEffort = 'high';
      config.openai.prdReasoningEffort = 'high';
      config.openai.trdReasoningEffort = 'high';
      config.openai.todoReasoningEffort = 'high';
      break;
      
    case 'gemini':
      // 모델을 gemini-2.5-pro로 설정
      config.gemini.questionModel = 'gemini-2.5-pro';
      config.gemini.prdModel = 'gemini-2.5-pro';
      config.gemini.trdModel = 'gemini-2.5-pro';
      config.gemini.todoModel = 'gemini-2.5-pro';
      break;
      
    case 'claude':
      // 모델을 claude-opus-4-1로 설정
      config.claude.questionModel = 'claude-opus-4-1-20250805';
      config.claude.prdModel = 'claude-opus-4-1-20250805';
      config.claude.trdModel = 'claude-opus-4-1-20250805';
      config.claude.todoModel = 'claude-opus-4-1-20250805';
      break;
  }
  
  return saveConfig(config);
}

/**
 * 현재 모드 확인
 */
export function getCurrentMode() {
  const config = loadConfig();
  const provider = config.provider || 'openai';
  
  let isCheap = false;
  let isExpensive = false;
  
  switch (provider) {
    case 'openai':
      // cheap 모드 조건 확인
      const allMini = [
        config.openai.questionModel,
        config.openai.prdModel,
        config.openai.trdModel,
        config.openai.todoModel
      ].every(m => m === 'gpt-5-mini');
      
      const allLow = [
        config.openai.questionVerbosity,
        config.openai.prdVerbosity,
        config.openai.trdVerbosity,
        config.openai.todoVerbosity
      ].every(v => v === 'low');
      
      const allMinimal = [
        config.openai.questionReasoningEffort,
        config.openai.prdReasoningEffort,
        config.openai.trdReasoningEffort,
        config.openai.todoReasoningEffort
      ].every(e => e === 'minimal');
      
      // expensive 모드 조건 확인
      const allGpt5 = [
        config.openai.questionModel,
        config.openai.prdModel,
        config.openai.trdModel,
        config.openai.todoModel
      ].every(m => m === 'gpt-5');
      
      const allHigh = [
        config.openai.questionVerbosity,
        config.openai.prdVerbosity,
        config.openai.trdVerbosity,
        config.openai.todoVerbosity
      ].every(v => v === 'high');
      
      const allHighEffort = [
        config.openai.questionReasoningEffort,
        config.openai.prdReasoningEffort,
        config.openai.trdReasoningEffort,
        config.openai.todoReasoningEffort
      ].every(e => e === 'high');
      
      isCheap = allMini && allLow && allMinimal;
      isExpensive = allGpt5 && allHigh && allHighEffort;
      break;
      
    case 'gemini':
      const allFlashLite = [
        config.gemini.questionModel,
        config.gemini.prdModel,
        config.gemini.trdModel,
        config.gemini.todoModel
      ].every(m => m === 'gemini-2.5-flash-lite');
      
      const allPro = [
        config.gemini.questionModel,
        config.gemini.prdModel,
        config.gemini.trdModel,
        config.gemini.todoModel
      ].every(m => m === 'gemini-2.5-pro');
      
      isCheap = allFlashLite;
      isExpensive = allPro;
      break;
      
    case 'claude':
      const allHaiku = [
        config.claude.questionModel,
        config.claude.prdModel,
        config.claude.trdModel,
        config.claude.todoModel
      ].every(m => m === 'claude-3-5-haiku-20241022');
      
      const allOpus = [
        config.claude.questionModel,
        config.claude.prdModel,
        config.claude.trdModel,
        config.claude.todoModel
      ].every(m => m === 'claude-opus-4-1-20250805');
      
      isCheap = allHaiku;
      isExpensive = allOpus;
      break;
  }
  
  if (isCheap) {
    return 'cheap';
  } else if (isExpensive) {
    return 'expensive';
  } else {
    return 'custom';
  }
}

/**
 * 사용 가능한 설정 키 목록 반환
 */
export function getAvailableConfigKeys() {
  return [
    'provider',
    'openai.apiKey',
    'openai.questionModel',
    'openai.prdModel', 
    'openai.trdModel',
    'openai.todoModel',
    'openai.questionVerbosity',
    'openai.prdVerbosity',
    'openai.trdVerbosity', 
    'openai.todoVerbosity',
    'openai.questionReasoningEffort',
    'openai.prdReasoningEffort',
    'openai.trdReasoningEffort',
    'openai.todoReasoningEffort',
    'gemini.apiKey',
    'gemini.questionModel',
    'gemini.prdModel',
    'gemini.trdModel',
    'gemini.todoModel',
    'claude.apiKey',
    'claude.questionModel',
    'claude.prdModel',
    'claude.trdModel',
    'claude.todoModel',
    'app.defaultQuestions',
    'app.verbose',
    'app.skipTrd',
    'app.skipTodo',
    'app.log'
  ];
}