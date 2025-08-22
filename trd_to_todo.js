import OpenAI from "openai";
import fs from "fs";
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

function generateMarkdown(todoData) {
    let md = '';

    // Project Information
    md += `# ${todoData.project.name}\n\n`;
    md += `**Version:** ${todoData.project.version}\n\n`;
    md += `${todoData.project.description}\n\n`;

    // Table of Contents
    md += `## 목차\n\n`;
    md += `- [프로젝트 개요](#프로젝트-개요)\n`;
    md += `  - [프로젝트 현황](#프로젝트-현황)\n`;
    md += `  - [우선순위별 작업 분포](#우선순위별-작업-분포)\n`;
    md += `- [작업 목록](#작업-목록)\n`;
    md += `- [구현 가이드](#구현-가이드)\n`;
    md += `- [전역 고려사항](#전역-고려사항)\n`;
    md += `- [실행 순서](#실행-순서)\n`;
    md += `- [메타데이터](#메타데이터)\n\n`;

    // Project Overview
    md += `## 프로젝트 개요\n\n`;
    md += `${todoData.project.description}\n\n`;

    // Task Summary
    const totalTasks = todoData.tasks.length;
    const totalSubtasks = todoData.tasks.reduce((sum, task) => sum + (task.subtasks ? task.subtasks.length : 0), 0);

    md += `### 프로젝트 현황\n\n`;
    md += `- **전체 작업:** ${totalTasks}개\n`;
    md += `- **세부 작업:** ${totalSubtasks}개\n\n`;

    // Priority breakdown
    const p0Tasks = todoData.tasks.filter(task => task.priority === 'P0').length;
    const p1Tasks = todoData.tasks.filter(task => task.priority === 'P1').length;
    const p2Tasks = todoData.tasks.filter(task => task.priority === 'P2').length;

    md += `### 우선순위별 작업 분포\n\n`;
    md += `- **P0 (필수):** ${p0Tasks}개\n`;
    md += `- **P1 (중요):** ${p1Tasks}개\n`;
    md += `- **P2 (선택):** ${p2Tasks}개\n\n`;

    // Tasks
    md += `## 작업 목록\n\n`;

    todoData.tasks.forEach(task => {
        md += `### ${task.title} (${task.id})\n\n`;
        md += `- **우선순위:** ${task.priority}\n`;
        md += `- **상태:** ${task.status}\n`;
        md += `- **실행 순서:** ${task.order}\n\n`;

        md += `**설명:**\n${task.description}\n\n`;

        // Dependencies
        if (task.dependencies && task.dependencies.length > 0) {
            md += `**종속성:**\n`;
            task.dependencies.forEach(dep => {
                md += `- ${dep}\n`;
            });
            md += `\n`;
        }

        // Files
        if (task.files && task.files.length > 0) {
            md += `**관련 파일:**\n`;
            task.files.forEach(file => {
                md += `- \`${file.path}\` (${file.type}): ${file.description}\n`;
            });
            md += `\n`;
        }

        // Subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            md += `**세부 작업:**\n\n`;
            task.subtasks.forEach(subtask => {
                md += `#### ${subtask.title} (${subtask.id})\n\n`;
                md += `- **카테고리:** ${subtask.category}\n`;
                md += `**설명:** ${subtask.description}\n\n`;

                if (subtask.implementation_notes && subtask.implementation_notes.length > 0) {
                    md += `**구현 참고사항:**\n`;
                    subtask.implementation_notes.forEach(note => {
                        md += `- ${note}\n`;
                    });
                    md += `\n`;
                }
            });
        }

        // Completion Criteria
        if (task.completion_criteria && task.completion_criteria.length > 0) {
            md += `**완료 기준:**\n`;
            task.completion_criteria.forEach(criteria => {
                md += `- ${criteria}\n`;
            });
            md += `\n`;
        }

        // Risks
        if (task.risks && task.risks.length > 0) {
            md += `**위험 요소:**\n`;
            task.risks.forEach(risk => {
                md += `- **위험:** ${risk.risk}\n`;
                md += `- **완화 방안:** ${risk.mitigation}\n\n`;
            });
        }

        md += `---\n\n`;
    });

    // Implementation Guides
    md += `## 구현 가이드\n\n`;

    todoData.implementation_guides.forEach(guide => {
        md += `### ${guide.title} (${guide.id})\n\n`;
        md += `**카테고리:** ${guide.category}\n\n`;
        md += `${guide.content}\n\n`;

        // Related Tasks
        if (guide.related_tasks && guide.related_tasks.length > 0) {
            md += `**관련 작업:**\n`;
            guide.related_tasks.forEach(taskId => {
                md += `- ${taskId}\n`;
            });
            md += `\n`;
        }

        // Code Examples
        if (guide.code_examples && guide.code_examples.length > 0) {
            md += `**코드 예시:**\n\n`;
            guide.code_examples.forEach(example => {
                md += `**${example.description}**\n\n`;
                md += `\`\`\`${example.language}\n`;
                md += `${example.code}\n`;
                md += `\`\`\`\n\n`;
            });
        }

        md += `---\n\n`;
    });

    // Global Considerations
    md += `## 전역 고려사항\n\n`;

    md += `### 브라우저 호환성\n`;
    todoData.global_considerations.browser_compatibility.forEach(browser => {
        md += `- ${browser}\n`;
    });
    md += `\n`;

    md += `### 성능 요구사항\n`;
    todoData.global_considerations.performance_requirements.forEach(req => {
        md += `- ${req}\n`;
    });
    md += `\n`;

    md += `### 접근성 표준\n`;
    todoData.global_considerations.accessibility_standards.forEach(std => {
        md += `- ${std}\n`;
    });
    md += `\n`;

    md += `### 오류 처리 정책\n`;
    todoData.global_considerations.error_handling_policies.forEach(policy => {
        md += `- ${policy}\n`;
    });
    md += `\n`;

    md += `### 메모리 관리\n`;
    todoData.global_considerations.memory_management.forEach(mgmt => {
        md += `- ${mgmt}\n`;
    });
    md += `\n`;

    // Execution Order
    md += `## 실행 순서\n\n`;
    md += `**요약:** ${todoData.execution_order.summary}\n\n`;

    todoData.execution_order.phases.forEach((phase, index) => {
        md += `### 단계 ${index + 1}: ${phase.phase_name}\n\n`;
        md += `${phase.description}\n\n`;
        md += `**포함 작업:**\n`;
        phase.task_ids.forEach(taskId => {
            md += `- ${taskId}\n`;
        });
        md += `\n`;
    });

    // Metadata
    md += `## 메타데이터\n\n`;
    md += `- **작성자:** ${todoData.metadata.author}\n`;
    md += `- **버전:** ${todoData.metadata.version}\n`;
    md += `- **생성일:** ${todoData.metadata.created_at}\n`;
    md += `- **수정일:** ${todoData.metadata.updated_at}\n`;

    return md;
}

const SYSTEM_PROMPT = `당신은 AI 개발 워크플로우 설계 전문가입니다. 사용자가 제시하는 TRD(Technical Requirements Document)를 달성하기 위해 AI가 소프트웨어 개발 작업을 수행할 때 사용할 To-Do List를 작성하는 것이 당신의 핵심 역할입니다.
당신이 작성하는 To-Do List는 AI 코딩 에이전트에 의해 읽히고 사용됩니다.

## 작성 지침
- 큰 단계, 그리고 큰단계에 속하는 작은단계로 과정을 나눠서 세분화한다.
- 각 작업의 전후 관계와 의존성을 고려하여 만든다
`;

async function trdToTodo(trdContent, options = {}) {
    const effectiveConfig = getEffectiveConfig();
    const {
        model = effectiveConfig.openai.todoModel,
        verbosity = effectiveConfig.openai.todoVerbosity,
        reasoning_effort = effectiveConfig.openai.todoReasoningEffort
    } = options;

    const spinner = ora({
        text: chalk.cyan('TODO 목록을 생성하고 있습니다...'),
        color: 'cyan'
    }).start();

    const json_schema = {
        "name": "project_todo_list",
        "strict": true,
        "schema": {
            "type": "object",
            "properties": {
                "project": {
                    "type": "object",
                    "description": "프로젝트의 기본 정보를 정의하는 섹션. 프로젝트의 정체성과 범위를 명확히 하여 모든 참여자가 동일한 목표를 공유할 수 있도록 합니다.",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "프로젝트의 고유한 이름. 예: 'TRD 이미지 첨부 일기장 앱', '웹 기반 다이어리 시스템'. 프로젝트를 식별하고 참조할 때 사용되는 공식 명칭"
                        },
                        "description": {
                            "type": "string",
                            "description": "프로젝트의 목적과 주요 기능을 간략히 설명하는 텍스트. 프로젝트 범위와 최종 목표를 명확히 기술하여 개발 방향성 제시. 이해관계자들이 프로젝트의 가치와 목적을 이해할 수 있도록 작성"
                        },
                        "version": {
                            "type": "string",
                            "description": "현재 프로젝트 문서의 버전. 의미적 버전 관리(Semantic Versioning) 형식 권장 (예: '1.0.0', '2.1.3'). 문서의 변경 이력을 추적하고 호환성을 관리하는 데 사용"
                        }
                    },
                    "required": [
                        "name",
                        "description",
                        "version"
                    ],
                    "additionalProperties": false
                },
                "tasks": {
                    "type": "array",
                    "description": "프로젝트를 구성하는 모든 작업의 배열. 각 작업은 독립적으로 실행 가능한 단위로 정의되며, 명확한 입력/출력과 완료 기준을 가집니다. 작업의 세분화를 통해 진행상황 추적과 병렬 처리를 가능하게 합니다.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "작업의 고유 식별자. 다른 작업에서 의존성 참조 시 사용됩니다. 예: 'task-001', 'db-setup', 'ui-components'. 프로젝트 전체에서 유일해야 하며, 의미있는 이름을 사용하여 가독성을 높입니다."
                            },
                            "title": {
                                "type": "string",
                                "description": "작업의 명확하고 간결한 제목. 무엇을 하는 작업인지 한눈에 알 수 있도록 작성. 예: 'DB 초기화 모듈', '이미지 서비스 구현'. 작업의 본질과 범위를 즉시 이해할 수 있는 수준으로 작성"
                            },
                            "priority": {
                                "type": "string",
                                "enum": [
                                    "P0",
                                    "P1",
                                    "P2"
                                ],
                                "description": "작업의 중요도 및 우선순위를 나타내는 분류. P0: 핵심 기능으로 프로젝트 성공에 필수적인 작업, 최우선 처리. P1: 중요한 기능이지만 P0 완료 이후 진행 가능한 작업. P2: 선택적 기능으로 시간 여유가 있을 때 구현하는 작업"
                            },
                            "description": {
                                "type": "string",
                                "description": "작업에 대한 상세한 설명. 작업의 목적, 범위, 제약사항, 기대 결과를 포함하여 개발자가 구현할 내용을 명확히 이해할 수 있도록 작성. 기술적 요구사항과 비즈니스 요구사항을 모두 포함"
                            },
                            "files": {
                                "type": "array",
                                "description": "이 작업과 관련된 모든 파일의 목록. 새로 생성할 파일, 수정할 파일, 삭제할 파일을 명시하여 파일 시스템 변경사항을 추적하고 코드리뷰 시 참고 자료로 활용",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "path": {
                                            "type": "string",
                                            "description": "프로젝트 루트를 기준으로 한 파일의 상대 경로. 예: 'src/services/imageService.js', 'assets/css/components.css'. 일관된 경로 표기법을 사용하여 파일 위치를 명확히 지정"
                                        },
                                        "description": {
                                            "type": "string",
                                            "description": "해당 파일의 역할과 주요 내용에 대한 설명. 파일이 프로젝트에서 담당하는 기능과 다른 파일과의 관계를 명시하여 아키텍처 이해를 돕습니다"
                                        },
                                        "type": {
                                            "type": "string",
                                            "enum": [
                                                "create",
                                                "modify",
                                                "delete"
                                            ],
                                            "description": "파일에 대한 작업 유형을 명시. create: 새 파일 생성, modify: 기존 파일 수정, delete: 파일 삭제. 변경 영향도 분석과 백업 전략 수립에 활용"
                                        }
                                    },
                                    "required": [
                                        "path",
                                        "description",
                                        "type"
                                    ],
                                    "additionalProperties": false
                                }
                            },
                            "subtasks": {
                                "type": "array",
                                "description": "주 작업을 구성하는 세부 작업들의 목록. 큰 작업을 관리 가능한 단위로 분할하여 진행상황 추적과 병렬 작업을 가능하게 합니다. 각 세부 작업은 독립적으로 완료 가능해야 합니다.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {
                                            "type": "string",
                                            "description": "세부 작업의 고유 식별자. 부모 작업 ID와 구분되도록 명명. 예: 'db-setup-schema', 'db-setup-indexes'. 계층적 구조를 반영한 명명 규칙 사용 권장"
                                        },
                                        "title": {
                                            "type": "string",
                                            "description": "세부 작업의 구체적이고 실행 가능한 제목. 개발자가 정확히 무엇을 해야 하는지 명시하여 작업의 명확성을 보장. 동사로 시작하는 능동적 표현 권장"
                                        },
                                        "description": {
                                            "type": "string",
                                            "description": "세부 작업의 상세 내용. 구현 방법, 사용할 기술, 고려사항 등을 포함하여 실제 코딩 시 참고할 수 있는 수준의 정보 제공. 예상되는 어려움과 해결 방향도 포함"
                                        },
                                        "category": {
                                            "type": "string",
                                            "description": "세부 작업의 성격을 나타내는 카테고리. 예: 'UI', '동작', '내부구현', 'API', '데이터처리', '유효성검사', '오류처리' 등. 작업 분류와 전문성 배분에 활용"
                                        },
                                        "implementation_notes": {
                                            "type": "array",
                                            "description": "구현 시 반드시 고려해야 할 기술적 세부사항, 주의사항, 베스트 프랙티스의 배열. 코드 품질과 일관성 보장을 위한 가이드라인으로, 실수 방지와 표준 준수를 목적으로 함",
                                            "items": {
                                                "type": "string"
                                            }
                                        }
                                    },
                                    "required": [
                                        "id",
                                        "title",
                                        "description",
                                        "category",
                                        "implementation_notes"
                                    ],
                                    "additionalProperties": false
                                }
                            },
                            "dependencies": {
                                "type": "array",
                                "description": "현재 작업을 시작하기 전에 반드시 완료되어야 하는 다른 작업들의 ID 목록. 작업 순서와 병렬 처리 가능성을 결정하는 핵심 정보로, 프로젝트 스케줄링과 리소스 할당의 기준이 됩니다.",
                                "items": {
                                    "type": "string"
                                }
                            },
                            "completion_criteria": {
                                "type": "array",
                                "description": "작업이 성공적으로 완료되었다고 판단할 수 있는 구체적이고 측정 가능한 기준들. 품질 보증과 완료 여부 판단의 객관적 근거를 제공하여 작업의 명확한 종료점을 정의합니다.",
                                "items": {
                                    "type": "string"
                                }
                            },
                            "risks": {
                                "type": "array",
                                "description": "작업 진행 중 발생할 수 있는 위험 요소와 그에 대한 대응 방안. 프로젝트 리스크 관리와 사전 대비책 수립에 활용하여 예상치 못한 문제로 인한 지연을 최소화합니다.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "risk": {
                                            "type": "string",
                                            "description": "예상되는 위험 상황이나 문제점의 구체적 설명. 기술적 한계, 성능 이슈, 호환성 문제, 외부 의존성 등을 포함하여 현실적인 위험 요소를 식별"
                                        },
                                        "mitigation": {
                                            "type": "string",
                                            "description": "해당 위험에 대한 구체적인 완화 방안이나 대안책. 실행 가능하고 실용적인 해결 방법을 제시하여 위험 발생 시 즉시 대응할 수 있도록 준비"
                                        }
                                    },
                                    "required": [
                                        "risk",
                                        "mitigation"
                                    ],
                                    "additionalProperties": false
                                }
                            },
                            "order": {
                                "type": "integer",
                                "description": "전체 프로젝트에서 이 작업의 실행 순서를 나타내는 정수. 의존성과 함께 작업 스케줄링의 기준이 되며, 프로젝트 타임라인 수립과 마일스톤 설정에 사용됩니다."
                            },
                            "status": {
                                "type": "string",
                                "enum": [
                                    "not_started",
                                    "in_progress",
                                    "completed",
                                    "blocked"
                                ],
                                "description": "작업의 현재 진행 상태를 나타내는 열거값. not_started: 아직 시작하지 않은 상태, in_progress: 현재 진행 중인 상태, completed: 완료된 상태, blocked: 의존성 미완료 등으로 차단된 상태"
                            }
                        },
                        "required": [
                            "id",
                            "title",
                            "priority",
                            "description",
                            "files",
                            "subtasks",
                            "dependencies",
                            "completion_criteria",
                            "risks",
                            "order",
                            "status"
                        ],
                        "additionalProperties": false
                    }
                },
                "implementation_guides": {
                    "type": "array",
                    "description": "프로젝트 전반에 걸쳐 적용되는 구현 원칙과 가이드라인 모음. 코드 일관성, 아키텍처 결정, 공통 패턴 등 개발 전반의 품질과 표준을 보장하기 위한 세부 지침서로, 팀 내 지식 공유와 표준화에 기여합니다.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "구현 가이드의 고유 식별자. 관련 작업에서 참조할 수 있도록 명명. 예: 'router-cleanup', 'image-processing', 'error-handling'. 가이드의 주제를 반영한 직관적인 이름 사용"
                            },
                            "title": {
                                "type": "string",
                                "description": "구현 가이드의 주제나 영역을 명확히 나타내는 제목. 개발자가 필요한 가이드를 쉽게 찾을 수 있도록 작성하며, 가이드의 핵심 내용을 함축적으로 표현"
                            },
                            "category": {
                                "type": "string",
                                "description": "가이드의 분류 카테고리. 예: '아키텍처', '성능', '보안', '접근성', '데이터처리', '사용자경험' 등. 관련 가이드들을 그룹화하여 관리하고 검색 효율성을 높입니다."
                            },
                            "content": {
                                "type": "string",
                                "description": "구현 가이드의 상세 내용. 원칙, 방법론, 주의사항, 베스트 프랙티스를 포함하여 개발자가 실제 구현 시 따라야 할 구체적인 지침을 제공. 이론적 배경과 실용적 적용 방법을 균형있게 설명"
                            },
                            "related_tasks": {
                                "type": "array",
                                "description": "이 가이드가 적용되는 관련 작업들의 ID 목록. 가이드와 작업 간의 연관관계를 명시하여 적절한 시점에 참조할 수 있도록 하며, 가이드의 실제 활용도를 높입니다.",
                                "items": {
                                    "type": "string"
                                }
                            },
                            "code_examples": {
                                "type": "array",
                                "description": "가이드 내용을 보완하는 실제 코드 예시들. 구현 방법을 구체적으로 보여주어 개발자의 이해를 돕고 일관된 코딩 스타일 유지. 복사-붙여넣기 가능한 완전한 코드 제공",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "language": {
                                            "type": "string",
                                            "description": "코드 예시에서 사용된 프로그래밍 언어. 예: 'javascript', 'css', 'html', 'typescript'. 구문 강조와 적절한 도구 선택을 위해 정확한 언어명 사용"
                                        },
                                        "code": {
                                            "type": "string",
                                            "description": "실제 실행 가능한 코드 예시. 구문 강조와 복사-붙여넣기가 가능하도록 완전한 형태로 제공하며, 주석을 포함하여 이해를 돕습니다."
                                        },
                                        "description": {
                                            "type": "string",
                                            "description": "코드 예시에 대한 설명. 코드의 목적, 동작 방식, 주요 포인트를 설명하여 이해와 활용을 돕고, 수정이나 확장 시 고려사항도 포함"
                                        }
                                    },
                                    "required": [
                                        "language",
                                        "code",
                                        "description"
                                    ],
                                    "additionalProperties": false
                                }
                            }
                        },
                        "required": [
                            "id",
                            "title",
                            "category",
                            "content",
                            "related_tasks",
                            "code_examples"
                        ],
                        "additionalProperties": false
                    }
                },
                "global_considerations": {
                    "type": "object",
                    "description": "프로젝트 전체에 적용되는 공통 요구사항과 제약사항. 모든 작업에서 일관되게 고려해야 할 기술적, 비즈니스적 조건들을 정의하여 프로젝트의 통일성과 품질을 보장합니다.",
                    "properties": {
                        "browser_compatibility": {
                            "type": "array",
                            "description": "지원해야 하는 브라우저와 버전 목록, 그리고 각 브라우저별 특별 고려사항. 폴백 처리와 기능 감지 전략을 포함하여 광범위한 사용자 환경에서 일관된 경험을 제공하기 위한 요구사항",
                            "items": {
                                "type": "string"
                            }
                        },
                        "performance_requirements": {
                            "type": "array",
                            "description": "시스템이 만족해야 하는 성능 기준과 최적화 방향. 로딩 시간, 메모리 사용량, 반응성 등의 정량적 목표와 달성 방법을 명시하여 사용자 경험의 품질을 보장",
                            "items": {
                                "type": "string"
                            }
                        },
                        "accessibility_standards": {
                            "type": "array",
                            "description": "접근성 준수 기준과 구현 가이드라인. WCAG 기준, 키보드 탐색, 스크린 리더 지원 등 장애를 가진 사용자를 포함하여 모든 사용자가 제품을 원활하게 사용할 수 있도록 하는 포용적 설계 요구사항",
                            "items": {
                                "type": "string"
                            }
                        },
                        "error_handling_policies": {
                            "type": "array",
                            "description": "시스템 전반의 오류 처리 원칙과 정책. 오류 분류, 사용자 알림 방식, 복구 전략, 로깅 방식 등 일관된 오류 관리 체계를 통해 안정적인 사용자 경험과 효율적인 디버깅을 지원",
                            "items": {
                                "type": "string"
                            }
                        },
                        "memory_management": {
                            "type": "array",
                            "description": "메모리 효율적 사용과 누수 방지를 위한 원칙과 방법론. 객체 생명주기 관리, 이벤트 리스너 정리, 대용량 데이터 처리 전략 등을 통해 장시간 사용 시에도 안정적인 성능을 유지",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    "required": [
                        "browser_compatibility",
                        "performance_requirements",
                        "accessibility_standards",
                        "error_handling_policies",
                        "memory_management"
                    ],
                    "additionalProperties": false
                },
                "execution_order": {
                    "type": "object",
                    "description": "프로젝트의 체계적인 실행 전략과 단계별 진행 계획. 작업 간 의존성을 고려한 최적의 실행 순서와 병렬 처리 가능성을 정의하여 효율적인 프로젝트 진행을 보장합니다.",
                    "properties": {
                        "summary": {
                            "type": "string",
                            "description": "전체 실행 계획의 요약 설명. 주요 마일스톤, 핵심 의존성, 전체 일정의 개요를 포함하여 프로젝트 진행 방향성을 제시하고 이해관계자들의 기대치를 정렬"
                        },
                        "phases": {
                            "type": "array",
                            "description": "프로젝트를 논리적으로 구분한 실행 단계들. 각 단계는 명확한 목표와 완료 기준을 가지며, 이전 단계의 완료를 전제로 진행하여 체계적인 개발 프로세스를 구현",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "phase_name": {
                                        "type": "string",
                                        "description": "실행 단계의 명칭. 해당 단계에서 달성하고자 하는 목표나 주요 특징을 반영한 이름. 예: '기반 구조 설정', '핵심 기능 구현', '통합 및 최적화'. 단계의 본질을 직관적으로 표현"
                                    },
                                    "task_ids": {
                                        "type": "array",
                                        "description": "해당 실행 단계에 포함되는 모든 작업들의 ID 목록. 단계 내에서 병렬 처리 가능한 작업들을 그룹화하여 효율적인 리소스 활용과 일정 단축을 도모",
                                        "items": {
                                            "type": "string"
                                        }
                                    },
                                    "description": {
                                        "type": "string",
                                        "description": "실행 단계의 상세 설명. 단계의 목적, 주요 달성 목표, 이전 단계와의 연관성, 다음 단계로의 전환 조건 등을 포함하여 각 단계의 의미와 중요성을 명확히 전달"
                                    }
                                },
                                "required": [
                                    "phase_name",
                                    "task_ids",
                                    "description"
                                ],
                                "additionalProperties": false
                            }
                        }
                    },
                    "required": [
                        "summary",
                        "phases"
                    ],
                    "additionalProperties": false
                },
                "metadata": {
                    "type": "object",
                    "description": "문서의 생성 및 관리와 관련된 메타 정보. 버전 관리, 변경 이력 추적, 책임 소재 명확화를 위한 관리 데이터로, 문서의 신뢰성과 추적 가능성을 보장합니다.",
                    "properties": {
                        "created_at": {
                            "type": "string",
                            "format": "date-time",
                            "description": "문서가 최초 생성된 일시. ISO 8601 형식으로 기록하여 정확한 시점 추적 가능. 예: '2024-03-15T09:30:00Z'. 문서의 연대기와 버전 히스토리 관리에 필수적인 정보"
                        },
                        "updated_at": {
                            "type": "string",
                            "format": "date-time",
                            "description": "문서가 마지막으로 수정된 일시. 변경 사항의 최신성을 확인하고 문서의 현재성을 판단하는 기준. 협업 시 최신 버전 식별과 동기화에 중요한 역할"
                        },
                        "author": {
                            "type": "string",
                            "description": "문서를 작성한 주 책임자의 이름이나 식별자. 문서에 대한 문의나 승인이 필요할 때 연락할 담당자를 명시하여 책임 소재를 명확히 함"
                        },
                        "version": {
                            "type": "string",
                            "description": "문서의 버전 번호. 의미적 버전 관리 체계를 따라 주요 변경(major), 기능 추가(minor), 버그 수정(patch)을 구분하여 관리. 예: '1.2.3'"
                        }
                    },
                    "required": [
                        "created_at",
                        "updated_at",
                        "author",
                        "version"
                    ],
                    "additionalProperties": false
                }
            },
            "required": [
                "project",
                "tasks",
                "implementation_guides",
                "global_considerations",
                "execution_order",
                "metadata"
            ],
            "additionalProperties": false
        }
    };

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
                            "text": trdContent
                        }
                    ]
                }
            ],
            response_format: {
                "type": "json_schema",
                json_schema
            },
            verbosity,
            reasoning_effort
        });

        spinner.stop();
        const todoData = JSON.parse(response.choices[0].message.content);
        const markdown = generateMarkdown(todoData);

        return { todoData, markdown };
    } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ TODO 생성 중 오류가 발생했습니다:'), error.message);
        throw error;
    }
}

export default trdToTodo;