import os from 'os';
import path from 'path';
import fs from 'fs';

/**
 * 크로스 플랫폼 홈 디렉토리 경로를 가져오는 함수
 * Windows, macOS, Linux에서 모두 동작
 */
export function getHomeDirectory() {
  return os.homedir();
}

/**
 * .firstvibe.config.json 파일의 전체 경로를 가져오는 함수
 */
export function getConfigFilePath() {
  const homeDir = getHomeDirectory();
  return path.join(homeDir, '.firstvibe.config.json');
}

/**
 * 플랫폼별 경로 구분자를 반환하는 함수
 */
export function getPathSeparator() {
  return path.sep;
}

/**
 * 파일 경로가 절대경로인지 확인하는 함수
 */
export function isAbsolutePath(filePath) {
  return path.isAbsolute(filePath);
}

/**
 * 두 경로를 안전하게 결합하는 함수
 */
export function joinPath(...paths) {
  return path.join(...paths);
}

/**
 * .firstvibe_log 폴더 경로를 가져오는 함수
 */
export function getLogDirectory() {
  return path.join(process.cwd(), '.firstvibe_log');
}

/**
 * 로그 폴더가 존재하지 않으면 생성
 */
export function ensureLogDirectory() {
  const logDir = getLogDirectory();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

/**
 * API 로그 파일명 생성
 * @param {string} purpose - 요청 목적 (QUESTION, PRD, TRD, TODO)
 * @param {string} type - 요청/응답 구분 (REQUEST, RESPONSE)
 * @param {string} provider - AI 제공자 (openai, gemini, claude)
 * @param {string} model - 모델명
 * @returns {string} 파일명
 */
export function generateLogFileName(purpose, type, provider = '', model = '') {
  const now = new Date();
  const timestamp = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, '0') + 
    String(now.getDate()).padStart(2, '0') + 
    String(now.getHours()).padStart(2, '0') + 
    String(now.getMinutes()).padStart(2, '0') + 
    String(now.getSeconds()).padStart(2, '0') + 
    String(now.getMilliseconds()).padStart(3, '0');
  
  const providerPart = provider ? `-${provider}` : '';
  const modelPart = model ? `-${model}` : '';
  
  return `${timestamp}-${purpose}${providerPart}${modelPart}-${type}.json`;
}

/**
 * API 요청/응답을 로그 파일에 저장
 * @param {string} purpose - 요청 목적 (QUESTION, PRD, TRD, TODO)
 * @param {string} type - 요청/응답 구분 (REQUEST, RESPONSE)
 * @param {object} data - 저장할 데이터
 * @param {string} provider - AI 제공자 (openai, gemini, claude)
 * @param {string} model - 모델명
 */
export function saveApiLog(purpose, type, data, provider = '', model = '') {
  try {
    const logDir = ensureLogDirectory();
    const fileName = generateLogFileName(purpose, type, provider, model);
    const filePath = path.join(logDir, fileName);
    
    const logData = {
      timestamp: new Date().toISOString(),
      purpose,
      type,
      provider,
      model,
      data
    };
    
    fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf8');
    
    return filePath;
  } catch (error) {
    console.warn('로그 저장 중 오류 발생:', error.message);
    return null;
  }
}