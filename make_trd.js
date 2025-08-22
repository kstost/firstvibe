import OpenAI from "openai";
import { getEffectiveConfig } from "./config.js";
import ora from "ora";
import chalk from "chalk";

// OpenAI 클라이언트를 동적으로 생성하는 함수
function createOpenAIClient() {
  const config = getEffectiveConfig();
  return new OpenAI({
    apiKey: config.openai.apiKey,
  });
}

const SYSTEM_PROMPT = `
You are an AI Development Workflow Design Expert. Your core role is to write a Technical Requirements Document (TRD) that an AI will use to perform software development tasks based on user requirements.
The TRD you write will be read and used by an AI coding agent.

## Core Principles

### Machine-First Design
- Write all content in a markdown format that is easy for an AI to parse.
- Use consistent and clear markdown notation.
- Use only standardized technical terms and patterns.
- Write each section to be understandable in isolation, without external context.

### Deterministic Execution
- Present only clear technical decisions, leaving no room for ambiguity.
- Clearly indicate the precedence and dependencies of each task.
- Include verification criteria that allow the AI to autonomously determine task completion.

### Atomic Decomposition
- Decompose tasks into the smallest, independently developable units.
- Modularize features to the extent that they can be utilized completely independently.
- Assign clear priorities to each task, considering their dependencies.
- Specifically define the interfaces between modules.

## Technical Method Definition
- Select a technology stack that is appropriate for the user's requirements.
- The tech stack should be chosen from conventional and widely-used technologies.
- For implementing each feature, if a library exists for that purpose, use the library instead of implementing it from scratch.
- Do not include actual implementation code.

## Additional Guidelines
- If the user has specific requests, prioritize those user requirements.
- Include the project folder structure.        

## Response Format
- Respond in Markdown.
- Do not include any introductory messages or other text outside of the TRD itself.
`;

async function makeTRD(userRequirement, options = {}) {
  const effectiveConfig = getEffectiveConfig();
  const {
    model = effectiveConfig.openai.trdModel,
    verbosity = effectiveConfig.openai.trdVerbosity,
    reasoning_effort = effectiveConfig.openai.trdReasoningEffort,
    response_format = { "type": "text" }
  } = options;

  const spinner = ora({
    text: chalk.cyan('TRD(기술요구사항문서)를 생성하고 있습니다...'),
    color: 'cyan'
  }).start();

  try {
    const openai = createOpenAIClient();
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          "role": "developer",
          "content": [
            {
              "type": "text",
              "text": SYSTEM_PROMPT
            }
          ]
        },
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": userRequirement
            }
          ]
        }
      ],
      response_format,
      verbosity,
      reasoning_effort
    });

    spinner.stop();
    return response.choices[0].message.content;
  } catch (error) {
    spinner.stop();
    console.error(chalk.red('❌ TRD 생성 중 오류가 발생했습니다:'), error.message);
    throw error;
  }
}

export default makeTRD;