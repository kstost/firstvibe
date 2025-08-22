import os from 'os';
import path from 'path';

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