import { generateTRD } from "./ai_api.js";
import { TRD_SYSTEM_PROMPT } from "./system_prompts.js";


async function makeTRD(userRequirement, options = {}) {
  const input = [
    {
      "role": "developer",
      "content": [
        {
          "type": "input_text",
          "text": TRD_SYSTEM_PROMPT
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": userRequirement
        }
      ]
    }
  ];

  return await generateTRD(input);
}

export default makeTRD;