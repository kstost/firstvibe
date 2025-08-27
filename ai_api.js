import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import ora from "ora";
import chalk from "chalk";
import inquirer from "inquirer";
import { z } from "zod";
import { getEffectiveConfig } from "./config.js";
import { saveApiLog, jsonAIParse } from "./utils.js";

// QUESTION 응답 구조 정의
const QuestionSchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    choices: z.array(z.string())
  }))
});

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
 * Claude 응답 파싱 함수
 * @param {Object} response - Claude API 응답
 * @returns {string|Object} 파싱된 텍스트 또는 JSON 객체
 */
function parseClaudeResponse(response) {
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

  if (typeof result === 'object') {
    return result;
  }
  return result;
}

/**
 * Gemini API 호출 함수 (axios 직접 REST API 호출)
 * @param {Object} options 호출 옵션
 * @param {string} options.purpose - 요청 목적
 * @param {string} options.model - 사용할 모델
 * @param {string} options.systemInstruction - 시스템 지시사항
 * @param {string} options.userMessage - 사용자 메시지
 * @param {Object} options.generationConfig - 생성 설정
 * @returns {Promise<string|Object>} API 응답
 */
async function callGeminiAI({
  purpose,
  model,
  systemInstruction,
  userMessage,
  generationConfig = {},
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

  // Gemini REST API 호출
  const response = await axios.post(`/models/${model}:generateContent`, requestPayload, axiosConfig);
  const result = response.data;

  // 로깅이 활성화되어 있으면 응답 로그 저장
  if (effectiveConfig.app.log) {
    saveApiLog(purpose, 'RESPONSE', result, 'gemini', model);
  }
  let body;
  try { body = result.candidates[0].content.parts[0].text; } catch { }
  return { body, result };
}

/**
 * Claude API 호출 함수
 * @param {Object} options 호출 옵션
 * @param {string} options.purpose - 요청 목적
 * @param {string} options.model - 사용할 모델
 * @param {string} options.systemMessage - 시스템 메시지
 * @param {string} options.userMessage - 사용자 메시지
 * @param {Object} options.jsonSchema - JSON 스키마 (옵션)
 * @returns {Promise<string|Object>} API 응답
 */
async function callClaudeAI({
  purpose,
  model,
  systemMessage,
  userMessage,
  jsonSchema = null,
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

  return parseClaudeResponse(response);
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
}) {
  let spinner = ora({
    text: spinnerText,
    color: spinnerColor
  }).start();

  let retryInfo = { attempt: 0 };
  while (true) {
    try {
      if (retryInfo.attempt > 0) {
        spinner.text = `${spinnerText} (재시도 ${retryInfo.attempt}/${retryInfo.maxRetries})`;
      } else {
        spinner.text = spinnerText;
      }

      const effectiveConfig = getEffectiveConfig();
      const provider = effectiveConfig.provider;
      let responsedResult;
      let responsedBody;

      if (provider === 'claude') {
        // Claude API 사용
        const systemMessage = input.find(msg => msg.role === 'developer')?.content?.[0]?.text || '';
        const userMessage = input.find(msg => msg.role === 'user')?.content?.[0]?.text || '';

        // JSON Schema가 있는 경우 structured output 사용
        let jsonSchema = null;
        if (textOptions.format?.type === 'json_schema') {
          jsonSchema = textOptions.format.schema;
        }

        responsedResult = await callClaudeAI({
          purpose,
          model,
          systemMessage,
          userMessage,
          jsonSchema,
          spinnerText,
          spinnerColor,
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

        let response = await callGeminiAI({
          purpose,
          model,
          systemInstruction,
          userMessage,
          generationConfig: config,
        });
        responsedResult = response.result;
        responsedBody = response.body;

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

        const response = await openai.responses.create(requestData);
        if (effectiveConfig.app.log) {
          saveApiLog(purpose, 'RESPONSE', response, 'openai', model);
        }
        try {
          if (response.output_text) {
            responsedBody = response.output_text;
          } else {
            const messageOutput = response.output.find(item => item.type === 'message');
            responsedBody = messageOutput.content[0].text;
          }
        } catch { }
        responsedResult = response
      }
      const finalResponse = parseJson ? jsonAIParse(responsedBody) : responsedBody;

      if (purpose === 'QUESTION') {
        try {
          QuestionSchema.parse(finalResponse);
        } catch (zodError) {
          const err = new Error('QUESTION 응답 형식이 올바르지 않음');
          err.status = 100101;
          err.finalResponse = finalResponse;
          err.responsedResult = responsedResult;
          err.zodError = zodError;
          throw err;
        }
      }
      if (!finalResponse) {
        const err = new Error('finalResponse가 비어있음');
        err.status = 100101;
        err.finalResponse = finalResponse;
        err.responsedResult = responsedResult;
        throw err;
      }

      spinner.stop();
      // if (parseJson) {
      //   console.log(JSON.stringify(finalResponse, null, 2));
      // }
      return finalResponse;

    } catch (error) {
      // 429 응답코드 처리 (Rate Limit)
      const checkRefresh = (options) => {
        if (retryInfo.status !== error.status) {
          retryInfo = { status: error.status, attempt: 0, ...options };
        }
      }
      if (error.status === 429 || error.response?.status === 429) {
        checkRefresh({ maxRetries: 1000 });
        retryInfo.attempt++;
        if (retryInfo.attempt <= retryInfo.maxRetries) {
          spinner.text = `${spinnerText} (Rate limit 도달, 10초 후 재시도 ${retryInfo.attempt}/${retryInfo.maxRetries})`;
          await new Promise(resolve => setTimeout(resolve, 10000));
          continue;
        }
      }
      if (error.status === 100101) {
        checkRefresh({ maxRetries: 2 });
        retryInfo.attempt++;
        if (retryInfo.attempt <= retryInfo.maxRetries) {
          spinner.text = `${spinnerText} (응답형식 맞지 않음, 재시도 ${retryInfo.attempt}/${retryInfo.maxRetries})`;
          continue;
        }
      }


      // 문제가 지속되고 있는 경우 사용자에게 계속 진행 여부 확인
      spinner.stop();
      const { shouldContinue } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldContinue',
          message: '문제가 지속적으로 생기고 있습니다. 계속 진행하시겠습니까?',
          default: false
        }
      ]);

      if (shouldContinue) {
        spinner.text = spinnerText;
        spinner.start();
        retryInfo.attempt = 0;
        continue;
      } else {
        // 종료 전 에러 메시지 확인 프롬프트
        const { shareError } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shareError',
            message: '에러메시지를 확인하시겠습니까? 개발자에게 공유하여 문제를 개선할 수 있습니다.',
            default: false
          }
        ]);

        if (shareError && error.responsedResult) {
          console.log('\n=== 에러 상세 정보 ===');
          console.log(JSON.stringify(error.responsedResult));
        }
        
        process.exit(0);
      }
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