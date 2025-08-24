import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import ora from "ora";
import chalk from "chalk";
import { getEffectiveConfig } from "./config.js";
import { saveApiLog } from "./utils.js";

/**
 * OpenAI JSON Schema를 Gemini 호환 형식으로 변환
 * @param {Object} openaiSchema - OpenAI 형식의 JSON Schema
 * @returns {Object} Gemini 호환 JSON Schema
 */
function convertToGeminiSchema(openaiSchema) {
  function convertSchema(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    // 배열인 경우 그대로 유지
    if (Array.isArray(obj)) {
      return obj.map(item => convertSchema(item));
    }

    const converted = {};

    for (const [key, value] of Object.entries(obj)) {
      // Gemini에서 지원하지 않는 속성들 제거
      if (key === 'additionalProperties' || key === 'strict') {
        continue;
      }

      if (key === 'type') {
        // OpenAI 문자열 타입을 Gemini 문자열로 변환 (REST API 사용)
        converted[key] = typeof value === 'string' ? value.toUpperCase() : value;
      } else if (key === 'required' && Array.isArray(value)) {
        // required 필드는 문자열 배열로 유지
        converted[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        converted[key] = convertSchema(value);
      } else {
        converted[key] = value;
      }
    }

    return converted;
  }

  return convertSchema(openaiSchema);
}

// OpenAI 클라이언트를 동적으로 생성하는 함수
function createOpenAIClient() {
  const config = getEffectiveConfig();
  return new OpenAI({
    apiKey: config.openai.apiKey,
  });
}

// Gemini API를 위한 axios 설정
function createGeminiAxiosConfig() {
  const config = getEffectiveConfig();
  return {
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    headers: {
      'x-goog-api-key': config.gemini.apiKey,
      'Content-Type': 'application/json'
    }
  };
}

// Claude 클라이언트를 동적으로 생성하는 함수
function createClaudeClient() {
  const config = getEffectiveConfig();
  return new Anthropic({ apiKey: config.claude.apiKey });
}

/**
 * 안전한 응답 파싱 함수 (OpenAI 전용)
 * @param {Object} response - OpenAI API 응답
 * @param {boolean} parseJson - JSON 파싱 여부 (기본: false)
 * @returns {string|Object} 파싱된 텍스트 또는 JSON 객체
 */
function parseOpenAIResponse(response, parseJson = false) {
  if (!response) {
    throw new Error('API 응답이 null 또는 undefined입니다.');
  }

  let responseText;

  // 간단하게 output_text 필드 사용 (우선순위)
  if (response.output_text) {
    responseText = response.output_text;
  } else {
    // output_text가 없으면 output 배열에서 message 타입 찾기
    if (!response.output || !Array.isArray(response.output)) {
      console.error('응답 구조 오류:', JSON.stringify(response, null, 2));
      throw new Error('API 응답 구조가 올바르지 않습니다.');
    }

    // message 타입 찾기
    const messageOutput = response.output.find(item => item.type === 'message');
    if (!messageOutput) {
      throw new Error('API 응답에서 message 타입을 찾을 수 없습니다.');
    }

    if (!messageOutput.content || !Array.isArray(messageOutput.content) || messageOutput.content.length === 0) {
      console.error('content 구조 오류:', JSON.stringify(messageOutput, null, 2));
      throw new Error('API 응답의 content가 올바르지 않습니다.');
    }

    if (!messageOutput.content[0].text) {
      console.error('text 누락:', JSON.stringify(messageOutput.content[0], null, 2));
      throw new Error('API 응답에 text가 없습니다.');
    }

    responseText = messageOutput.content[0].text;
  }

  return parseJson ? JSON.parse(responseText) : responseText;
}

/**
 * Gemini 응답 파싱 함수
 * @param {Object} response - Gemini API 응답
 * @param {boolean} parseJson - JSON 파싱 여부 (기본: false)
 * @returns {string|Object} 파싱된 텍스트 또는 JSON 객체
 */
function parseGeminiResponse(response, parseJson = false) {
  if (!response) {
    throw new Error('API 응답이 null 또는 undefined입니다.');
  }

  if (!response.candidates || !Array.isArray(response.candidates) || response.candidates.length === 0) {
    console.error('Gemini 응답 구조 오류:', JSON.stringify(response, null, 2));
    throw new Error('Gemini API 응답 구조가 올바르지 않습니다.');
  }

  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    console.error('Gemini 응답 내용 구조 오류:', JSON.stringify(response, null, 2));
    throw new Error('Gemini API 응답 내용 구조가 올바르지 않습니다.');
  }

  let responseText = candidate.content.parts[0].text;

  // Fenced code block 제거 처리 (조건부)
  function removeFencedCodeBlockIfWrapped(text) {
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

  // JSON 파싱이 필요한 경우 fenced code block 제거 후 JSON 추출
  if (parseJson) {
    // 먼저 fenced code block 제거 시도
    responseText = removeFencedCodeBlockIfWrapped(responseText);

    // 앞뒤 잡문 제거 (JSON 시작/끝 기준)
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      responseText = responseText.substring(jsonStart, jsonEnd + 1);
    } else {
      // 배열 형태 JSON인 경우
      const arrayStart = responseText.indexOf('[');
      const arrayEnd = responseText.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        responseText = responseText.substring(arrayStart, arrayEnd + 1);
      }
    }
  }
  // parseJson이 false인 경우 일반 텍스트에서 fenced code block 제거
  else {
    responseText = removeFencedCodeBlockIfWrapped(responseText);
  }

  return parseJson ? JSON.parse(responseText) : responseText;
}

/**
 * Claude 응답 파싱 함수
 * @param {Object} response - Claude API 응답
 * @param {boolean} parseJson - JSON 파싱 여부 (기본: false)
 * @returns {string|Object} 파싱된 텍스트 또는 JSON 객체
 */
function parseClaudeResponse(response, parseJson = false) {
  if (!response) {
    throw new Error('API 응답이 null 또는 undefined입니다.');
  }

  if (!response.content || !Array.isArray(response.content)) {
    console.error('Claude 응답 구조 오류:', JSON.stringify(response, null, 2));
    throw new Error('Claude API 응답 구조가 올바르지 않습니다.');
  }

  // tool_use 블록에서 JSON 추출 (structured output)
  let result = null;
  for (const block of response.content) {
    if (block.type === "tool_use" && block.input) {
      result = block.input; // 이미 JS 객체
      break;
    }
    // 일반 텍스트 블록
    if (block.type === "text" && block.text) {
      result = block.text;
      break;
    }
  }

  if (result === null) {
    throw new Error('Claude API 응답에서 유효한 컨텐츠를 찾을 수 없습니다.');
  }

  // structured output의 경우 이미 객체이므로 parseJson 무시
  if (typeof result === 'object') {
    return result;
  }

  return parseJson ? JSON.parse(result) : result;
}

/**
 * Gemini API 호출 함수 (axios 직접 REST API 호출)
 * @param {Object} options 호출 옵션
 * @param {string} options.purpose - 요청 목적
 * @param {string} options.model - 사용할 모델
 * @param {string} options.systemInstruction - 시스템 지시사항
 * @param {string} options.userMessage - 사용자 메시지
 * @param {Object} options.generationConfig - 생성 설정
 * @param {string} options.spinnerText - 로딩 스피너 텍스트
 * @param {string} options.spinnerColor - 스피너 색상
 * @param {boolean} options.parseJson - JSON 파싱 여부
 * @returns {Promise<string|Object>} API 응답
 */
async function callGeminiAI({
  purpose,
  model,
  systemInstruction,
  userMessage,
  generationConfig = {},
  spinnerText,
  spinnerColor,
  parseJson
}) {
  const effectiveConfig = getEffectiveConfig();
  const axiosConfig = createGeminiAxiosConfig();

  // 요청 페이로드 구성
  const requestPayload = {
    contents: [{
      parts: [{ text: userMessage }]
    }],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    }
  };

  // generationConfig가 있으면 추가
  if (Object.keys(generationConfig).length > 0) {
    requestPayload.generationConfig = generationConfig;
  }

  const requestData = {
    model,
    systemInstruction,
    userMessage,
    generationConfig
  };

  // 로깅이 활성화되어 있으면 요청 로그 저장
  if (effectiveConfig.app.log) {
    saveApiLog(purpose, 'REQUEST', requestData, 'gemini', model);
  }

  // Raw 페이로드 출력
  // console.log(`🔵 [${purpose}] Gemini Request Payload:`, JSON.stringify(requestPayload, null, 2));

  // Gemini REST API 호출
  const response = await axios.post(`/models/${model}:generateContent`, requestPayload, axiosConfig);
  const result = response.data;

  // Raw 응답 출력
  // console.log(`🟢 [${purpose}] Gemini Response Payload:`, JSON.stringify(result, null, 2));

  // 로깅이 활성화되어 있으면 응답 로그 저장
  if (effectiveConfig.app.log) {
    saveApiLog(purpose, 'RESPONSE', result, 'gemini', model);
  }

  return parseGeminiResponse(result, parseJson);
}

/**
 * Claude API 호출 함수
 * @param {Object} options 호출 옵션
 * @param {string} options.purpose - 요청 목적
 * @param {string} options.model - 사용할 모델
 * @param {string} options.systemMessage - 시스템 메시지
 * @param {string} options.userMessage - 사용자 메시지
 * @param {Object} options.jsonSchema - JSON 스키마 (옵션)
 * @param {string} options.spinnerText - 로딩 스피너 텍스트
 * @param {string} options.spinnerColor - 스피너 색상
 * @param {boolean} options.parseJson - JSON 파싱 여부
 * @returns {Promise<string|Object>} API 응답
 */
async function callClaudeAI({
  purpose,
  model,
  systemMessage,
  userMessage,
  jsonSchema = null,
  spinnerText,
  spinnerColor,
  parseJson
}) {
  const effectiveConfig = getEffectiveConfig();
  const claude = createClaudeClient();

  const system = [{
    type: "text",
    text: systemMessage
  }];

  const messages = [{
    role: "user",
    content: userMessage
  }];

  let requestData = {
    model,
    system,
    messages,
    max_tokens: 4000  // 스트리밍 없이 처리 가능한 토큰 수
  };

  // JSON Schema가 있는 경우 tools 사용 (structured output)
  if (jsonSchema) {
    const tools = [{
      name: "emit_structured_json",
      description: "Return structured data as JSON according to the schema.",
      input_schema: jsonSchema
    }];

    requestData.tools = tools;
    requestData.tool_choice = { type: "tool", name: "emit_structured_json" };
  }

  // 로깅이 활성화되어 있으면 요청 로그 저장
  if (effectiveConfig.app.log) {
    saveApiLog(purpose, 'REQUEST', requestData, 'claude', model);
  }

  // Raw 페이로드 출력
  console.log(`🔵 [${purpose}] Claude Request Payload:`, JSON.stringify(requestData, null, 2));

  const response = await claude.messages.create(requestData);

  // Raw 응답 출력
  console.log(`🟢 [${purpose}] Claude Response Payload:`, JSON.stringify(response, null, 2));

  // 로깅이 활성화되어 있으면 응답 로그 저장
  if (effectiveConfig.app.log) {
    saveApiLog(purpose, 'RESPONSE', response, 'claude', model);
  }

  return parseClaudeResponse(response, parseJson);
}

/**
 * 통합 AI API 호출 함수 (JSON 파싱 재시도 포함)
 * @param {Object} options 호출 옵션
 * @param {string} options.purpose - 요청 목적 (QUESTION, PRD, TRD, TODO)
 * @param {string} options.model - 사용할 모델
 * @param {Array} options.input - 입력 메시지 배열
 * @param {Object} options.textOptions - text 설정 (verbosity, format 등)
 * @param {Object} options.reasoningOptions - reasoning 설정 (effort)
 * @param {string} options.spinnerText - 로딩 스피너 텍스트
 * @param {string} options.spinnerColor - 스피너 색상 (기본: 'cyan')
 * @param {boolean} options.parseJson - JSON 파싱 여부 (기본: false)
 * @param {number} options.maxRetries - 최대 재시도 횟수 (기본: 2)
 * @returns {Promise<string|Object>} API 응답 (파싱된 텍스트 또는 JSON)
 */
export async function callAI({
  purpose,
  model,
  input,
  textOptions = {},
  reasoningOptions = { effort: 'medium' },
  spinnerText = 'AI 처리 중...',
  spinnerColor = 'cyan',
  parseJson = false,
  maxRetries = 1000
}) {
  let spinner = ora({
    text: spinnerText,
    color: spinnerColor
  }).start();

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        spinner.text = `${spinnerText} (재시도 ${attempt - 1}/${maxRetries})`;
      }

      const effectiveConfig = getEffectiveConfig();
      const provider = effectiveConfig.provider;
      let result;

      if (provider === 'claude') {
        // Claude API 사용
        const systemMessage = input.find(msg => msg.role === 'developer')?.content?.[0]?.text || '';
        const userMessage = input.find(msg => msg.role === 'user')?.content?.[0]?.text || '';

        // JSON Schema가 있는 경우 structured output 사용
        let jsonSchema = null;
        if (textOptions.format?.type === 'json_schema') {
          jsonSchema = textOptions.format.schema;
        }

        result = await callClaudeAI({
          purpose,
          model,
          systemMessage,
          userMessage,
          jsonSchema,
          spinnerText,
          spinnerColor,
          parseJson
        });

      } else if (provider === 'gemini') {
        // Gemini API 사용
        const systemInstruction = input.find(msg => msg.role === 'developer')?.content?.[0]?.text || '';
        const userMessage = input.find(msg => msg.role === 'user')?.content?.[0]?.text || '';

        // JSON Schema가 있는 경우 config 설정
        let config = {};
        if (textOptions.format?.type === 'json_schema') {
          // OpenAI 형식의 JSON Schema를 Gemini 형식으로 변환
          const geminiSchema = convertToGeminiSchema(textOptions.format.schema);
          config = {
            responseMimeType: "application/json",
            responseSchema: geminiSchema
          };
        }

        result = await callGeminiAI({
          purpose,
          model,
          systemInstruction,
          userMessage,
          generationConfig: config,
          spinnerText,
          spinnerColor,
          parseJson
        });

      } else {
        // OpenAI API 사용 (기본값)
        const openai = createOpenAIClient();

        const requestData = {
          model,
          input,
          text: textOptions,
          reasoning: reasoningOptions,
          tools: [],
          store: true
        };

        // 로깅이 활성화되어 있으면 요청 로그 저장
        if (effectiveConfig.app.log) {
          saveApiLog(purpose, 'REQUEST', requestData, 'openai', model);
        }

        // Raw 페이로드 출력
        // console.log(`🔵 [${purpose}] OpenAI Request Payload:`, JSON.stringify(requestData, null, 2));

        const response = await openai.responses.create(requestData);

        // Raw 응답 출력
        // console.log(`🟢 [${purpose}] OpenAI Response Payload:`, JSON.stringify(response, null, 2));

        // 로깅이 활성화되어 있으면 응답 로그 저장
        if (effectiveConfig.app.log) {
          saveApiLog(purpose, 'RESPONSE', response, 'openai', model);
        }

        result = parseOpenAIResponse(response, parseJson);
      }

      // JSON 파싱이 필요한 경우 유효성 검증
      if (parseJson && typeof result === 'string') {
        try {
          JSON.parse(result);
        } catch (jsonError) {
          throw new Error(`Invalid JSON response: ${jsonError.message}`);
        }
      }

      spinner.stop();
      return result;

    } catch (error) {
      // 429 응답코드 처리 (Rate Limit)
      if (error.status === 429 || error.response?.status === 429) {
        if (attempt <= maxRetries) {
          spinner.text = `${spinnerText} (Rate limit 도달, 10초 후 재시도 ${attempt}/${maxRetries})`;
          await new Promise(resolve => setTimeout(resolve, 10000));
          continue;
        }
      }

      // JSON 파싱 오류이고 재시도 가능한 경우
      if (parseJson && error.message.includes('JSON') && attempt <= maxRetries) {
        // 스피너를 유지하고 재시도 텍스트만 업데이트
        continue;
      }

      // 기타 모든 에러는 즉시 프로그램 종료
      spinner.stop();
      console.error(chalk.red(`❌ ${purpose} API 호출 중 오류가 발생했습니다:`), error.message);
      process.exit(1);
    }
  }
}

/**
 * 질문 생성 API 호출
 * @param {Array} messages - 대화 메시지 배열
 * @param {Object} jsonSchema - JSON 스키마
 * @returns {Promise<Object>} 파싱된 질문 데이터
 */
export async function generateQuestions(messages, jsonSchema) {
  const effectiveConfig = getEffectiveConfig();
  const provider = effectiveConfig.provider;

  let model;
  if (provider === 'claude') {
    model = effectiveConfig.claude.questionModel;
  } else if (provider === 'gemini') {
    model = effectiveConfig.gemini.questionModel;
  } else {
    model = effectiveConfig.openai.questionModel;
  }

  return await callAI({
    purpose: 'QUESTION',
    model,
    input: messages,
    textOptions: {
      format: {
        type: "json_schema",
        name: jsonSchema.name,
        strict: jsonSchema.strict,
        schema: jsonSchema.schema
      },
      verbosity: provider === 'openai' ? effectiveConfig.openai.questionVerbosity : undefined
    },
    reasoningOptions: {
      effort: provider === 'openai' ? effectiveConfig.openai.questionReasoningEffort : undefined
    },
    spinnerText: '질문을 생성하고 있습니다...',
    spinnerColor: 'cyan',
    parseJson: true
  });
}

/**
 * PRD 생성 API 호출
 * @param {Array} input - 입력 메시지 배열
 * @returns {Promise<string>} 생성된 PRD 텍스트
 */
export async function generatePRD(input) {
  const effectiveConfig = getEffectiveConfig();
  const provider = effectiveConfig.provider;

  let model;
  if (provider === 'claude') {
    model = effectiveConfig.claude.prdModel;
  } else if (provider === 'gemini') {
    model = effectiveConfig.gemini.prdModel;
  } else {
    model = effectiveConfig.openai.prdModel;
  }

  return await callAI({
    purpose: 'PRD',
    model,
    input,
    textOptions: {
      verbosity: provider === 'openai' ? effectiveConfig.openai.prdVerbosity : undefined
    },
    reasoningOptions: {
      effort: provider === 'openai' ? effectiveConfig.openai.prdReasoningEffort : undefined
    },
    spinnerText: 'PRD 문서를 생성하고 있습니다...',
    spinnerColor: 'blue',
    parseJson: false
  });
}

/**
 * TRD 생성 API 호출
 * @param {Array} input - 입력 메시지 배열
 * @returns {Promise<string>} 생성된 TRD 텍스트
 */
export async function generateTRD(input) {
  const effectiveConfig = getEffectiveConfig();
  const provider = effectiveConfig.provider;

  let model;
  if (provider === 'claude') {
    model = effectiveConfig.claude.trdModel;
  } else if (provider === 'gemini') {
    model = effectiveConfig.gemini.trdModel;
  } else {
    model = effectiveConfig.openai.trdModel;
  }

  return await callAI({
    purpose: 'TRD',
    model,
    input,
    textOptions: {
      verbosity: provider === 'openai' ? effectiveConfig.openai.trdVerbosity : undefined
    },
    reasoningOptions: {
      effort: provider === 'openai' ? effectiveConfig.openai.trdReasoningEffort : undefined
    },
    spinnerText: 'TRD(기술요구사항문서)를 생성하고 있습니다...',
    spinnerColor: 'cyan',
    parseJson: false
  });
}

/**
 * TODO 생성 API 호출
 * @param {Array} input - 입력 메시지 배열
 * @param {Object} jsonSchema - JSON 스키마
 * @returns {Promise<Object>} 파싱된 TODO 데이터
 */
export async function generateTODO(input, jsonSchema) {
  const effectiveConfig = getEffectiveConfig();
  const provider = effectiveConfig.provider;

  let model;
  if (provider === 'claude') {
    model = effectiveConfig.claude.todoModel;
  } else if (provider === 'gemini') {
    model = effectiveConfig.gemini.todoModel;
  } else {
    model = effectiveConfig.openai.todoModel;
  }

  return await callAI({
    purpose: 'TODO',
    model,
    input,
    textOptions: {
      format: jsonSchema ? {
        type: "json_schema",
        name: jsonSchema.name,
        strict: jsonSchema.strict,
        schema: jsonSchema.schema
      } : undefined,
      verbosity: provider === 'openai' ? effectiveConfig.openai.todoVerbosity : undefined
    },
    reasoningOptions: {
      effort: provider === 'openai' ? effectiveConfig.openai.todoReasoningEffort : undefined
    },
    spinnerText: 'TODO 목록을 생성하고 있습니다...',
    spinnerColor: 'cyan',
    parseJson: true
  });
}