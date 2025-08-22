import os from 'os';
import path from 'path';

/**
 * 크로스 플랫폼 홈 디렉토리 경로를 가져오는 함수
 * Windows, macOS, Linux에서 모두 동작
 */
export function getHomeDirectory() {
  // Node.js os.homedir()는 크로스 플랫폼을 지원하지만
  // 추가적인 안전장치를 위해 환경변수도 확인
  const homeDir = os.homedir();
  
  if (homeDir) {
    return homeDir;
  }
  
  // 환경변수를 통한 폴백
  if (process.platform === 'win32') {
    return process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\Default';
  } else {
    return process.env.HOME || '/tmp';
  }
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