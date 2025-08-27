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


/**
 * 텍스트의 각 줄에 들여쓰기를 적용하는 함수
 * @param {string} content - 들여쓰기를 적용할 텍스트
 * @param {number} indentLevel - 들여쓰기 레벨 (기본값: 0)
 * @returns {string} 들여쓰기가 적용된 텍스트
 */
export function indentLines(content, indentLevel = 0) {
  return content.split('\n').map(line => '   '.repeat(indentLevel) + line).join('\n');
}

/**
 * JSON 객체를 HTML 태그 형태로 변환하는 함수
 * @param {Object|string} json - 변환할 JSON 객체 또는 문자열
 * @param {number} indentLevel - 들여쓰기 레벨 (기본값: 0)
 * @returns {string} HTML 태그 형태로 변환된 문자열
 * 
 * 지원하는 JSON 구조:
 * - 문자열: 그대로 반환 (들여쓰기 적용)
 * - {tagname: "div", attr: {class: "example"}, children: [...]} : HTML 태그로 변환
 * - {content: "text"}: 텍스트 컨텐츠로 처리
 */
export function tagify(json, indentLevel = 0) {
  if (!json) return '';

  // 문자열이면 바로 content로 처리
  if (typeof json === 'string') {
    return indentLines(json, indentLevel);
  }

  // tagname이 있으면 tag로 처리
  if (json.tagname) {
    let openTag = `<${json.tagname}`;

    // attributes가 있으면 추가
    if (json.attr && typeof json.attr === 'object') {
      for (const [key, value] of Object.entries(json.attr)) {
        openTag += ` ${key}="${value}"`;
      }
    }

    openTag += '>';
    const closeTag = `</${json.tagname}>`;

    let result = indentLines(openTag, indentLevel) + '\n';

    if (json.children && Array.isArray(json.children)) {
      for (const child of json.children) {
        result += tagify(child, indentLevel + 1) + '\n';
      }
    }

    result += indentLines(closeTag, indentLevel);
    return result;
  }

  // content가 있으면 content로 처리
  if (json.content) {
    return indentLines(json.content, indentLevel);
  }

  return '';
}


export function extractFirstJson(str) {
  let accumulatedStr = '';
  for (let i = 0; i < str.length; i++) {
    accumulatedStr += str[i];
    try {
      const jsonObject = JSON.parse(accumulatedStr);
      // JSON 객체가 성공적으로 파싱되면 해당 객체를 반환합니다.
      return JSON.stringify(jsonObject);
    } catch (e) {
      // 파싱 실패는 무시하고 계속 진행합니다.
    }
  }
  // 문자열 전체를 탐색한 후에도 유효한 JSON 객체를 찾지 못한 경우 null을 반환합니다.
  return null;
}
export function removeFencedCodeBlockIfWrapped(text) {
  const trimmedText = text.trim();

  // fenced code block 패턴: ```[언어]로 시작하고 ```로 끝남
  const fencedBlockRegex = /^```([a-zA-Z0-9]*)\s*\n?([\s\S]*?)\n?```$/;
  const match = trimmedText.match(fencedBlockRegex);

  if (match) {
    // 전체 콘텐츠가 fenced code block으로만 구성된 경우
    // (외부에 다른 내용이 없는 경우에만 제거)
    const [, language, content] = match;

    // 코드 블록 외부에 다른 텍스트가 있는지 확인
    const beforeBlock = trimmedText.substring(0, trimmedText.indexOf('```'));
    const afterBlock = trimmedText.substring(trimmedText.lastIndexOf('```') + 3);

    // 앞뒤에 의미있는 텍스트가 없으면 코드 블록 내용만 반환
    if (beforeBlock.trim() === '' && afterBlock.trim() === '') {
      return content.trim();
    }
  }

  return text;
}
export function jsonAIParse(str) {
  try {
    if ((typeof str) !== 'string') throw null;
    str = removeFencedCodeBlockIfWrapped(str)
    str = str.trim();
    if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) { } else { throw null }
    str = extractFirstJson(str)
    return JSON.parse(str)
  } catch { }
  return null;
}