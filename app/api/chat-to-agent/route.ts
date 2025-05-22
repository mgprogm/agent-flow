import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Composio } from "@composio/core";
import { LangchainToolset } from "@composio/langchain";

function getModelDetails(apiKey: string): { provider: string; modelName: string; chatModel: any } {
    if (apiKey.startsWith("sk-ant-")) {
        return {
            provider: "anthropic",
            modelName: "claude-3-5-sonnet-20240620",
            chatModel: new ChatAnthropic({
                apiKey: apiKey,
                modelName: "claude-3-5-sonnet-20240620",
                temperature: 0.3,
            }),
        };
    } else if (apiKey.startsWith("sk-")) {
        return {
            provider: "openai",
            modelName: "gpt-4.1",
            chatModel: new ChatOpenAI({
                apiKey: apiKey,
                modelName: "gpt-4.1",
                temperature: 0.3,
            }),
        };
    } else {
        return {
            provider: "google",
            modelName: "gemini-2.0-flash",
            chatModel: new ChatGoogleGenerativeAI({
                apiKey: apiKey,
                model: "gemini-2.0-flash",
                temperature: 0.3,
            }),
        };
    }
}

function constructSystemPrompt(
    llmApiKey: string,
    composioApiKey: string,
    llmProvider: string,
    llmModelName: string,
    tools: any[]
): string {
    return `
You are an expert AI assistant that generates graph structures for a workflow automation platform.
Your task is to create a JSON object representing a graph of nodes and edges based on the user's description of an agent or workflow. The graph will be used to render a diagram in a ReactFlow canvas.

**Instructions:**
- Use only the tools and actions provided in the following list. Do not invent or use any other tools or actions.
- For any agent or composio node that needs to use actions, include a field called 'allowedTools' in its data, which is a single comma-separated string of the action names from the 'actions' array of the relevant app(s) below. For example: 'allowedTools': 'ACTION_1,ACTION_2'.
- Do not invent actions; always use the provided actions.

**Available Tools and Actions:**
${tools.map(t => `- App: ${t.app}\n  Actions: ${t.actions.join(', ')}\n  Description: ${t.description || ''}`).join('\n')}

**Node Types and Data:**
1. 'customInput': Starting point.
   - data: { label: string, query: string }
2. 'llm': LLM call.
   - data: { label: string, systemPrompt: string, apiKey: "${llmApiKey}", modelProvider: "${llmProvider}", modelName: "${llmModelName}" }
3. 'agent': Autonomous agent with LLM and tool access.
   - data: { label: string, systemPrompt: string, llmApiKey: "${llmApiKey}", modelProvider: "${llmProvider}", modelName: "${llmModelName}", composioApiKey: "${composioApiKey}", allowedTools: "ACTION_1,ACTION_2" }
4. 'composio': Specific action/tool call.
   - data: { label: string, composioApiKey: "${composioApiKey}", allowedTools: "ACTION_1,ACTION_2" }
5. 'customOutput': End point.
   - data: { label: string }

**Node Structure:**
Each node: { "id": string, "type": string, "position": { "x": number, "y": number }, "data": { ... } }

**Edge Structure:**
Each edge: { "id": string, "source": string, "target": string }

**Workflow Logic:**
- Start with a 'customInput' node and end with one or more 'customOutput' nodes.
- Use 'agent' nodes for steps that require multiple or complex tool use, and 'composio' nodes for direct/single actions. Always include the allowedTools string in their data.
- Use 'llm' nodes for generic language processing (no tools).
- Generate clear, descriptive labels.
- Use only the tools/actions you have access to from the provided list.

Node IDs: Use a simple scheme like "input_1", "llm_1", "agent_1", "composio_1", "output_1".

Your output MUST be a single valid JSON object with "nodes" and "edges" arrays. Do not include any other text or explanations outside the JSON structure.
Keep the graph simple and logical. Usually 2-5 nodes are sufficient unless the workflow is complex.
`;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { useCase, llmApiKey, composioApiKey } = body.requestBody.useCase;

        if (!useCase || !llmApiKey || !composioApiKey) {
            return NextResponse.json({ error: "Missing useCase, llmApiKey, or composioApiKey" }, { status: 400 });
        }

        const { provider, modelName, chatModel } = getModelDetails(llmApiKey);

        // Fetch usecase and toolkit from LLM
        const usecaseResponse = await chatModel.invoke(`This is the use case the user wants to build an agent for: ${useCase}. Please generate a small, simple usecase string that describes the core action needed.`)

        // Use structured output to get a list of app names (JSON Schema)
        const schema = {
            type: "object",
            properties: {
                apps: {
                    type: "array",
                    items: { type: "string", description: "A lowercase app name mentioned in the user input" }
                }
            },
            required: ["apps"]
        };
        const modelWithStructure = chatModel.withStructuredOutput(schema);
        const structuredOutput = await modelWithStructure.invoke(
            `Extract a list of app names (as lowercase strings) mentioned in the following use case. Respond as { "apps": [ ... ] } and nothing else. Usecase: ${useCase}`
        );
        let apps = Array.isArray(structuredOutput.apps) ? structuredOutput.apps : [];
        if (!apps.length) {
            return NextResponse.json({ error: 'No apps found in user input.' }, { status: 400 });
        }

        // Fetch tools from API
        const toolResponse = await fetch('https://find-actions.composio.dev/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                use_case: usecaseResponse.content, 
                apps: apps,
                min_actions_per_task: 0,
                max_actions_per_task: 0,
                limit: 0
            })
        });
        let tools;
        try {
            tools = await toolResponse.json();
        } catch (e) {
            return NextResponse.json({ error: 'Failed to parse tools API response.' }, { status: 500 });
        }
        if (!toolResponse.ok || !tools || !Array.isArray(tools) || tools.length === 0) {
            return NextResponse.json({ error: 'No tools found for the use case or tools API returned an error.', details: tools }, { status: 500 });
        }

        // Pass tools to the system prompt
        const systemPrompt = constructSystemPrompt(
            llmApiKey,
            composioApiKey,
            provider,
            modelName,
            tools
        );

        // LLM call to generate the graph
        const messages = [
            new SystemMessage(systemPrompt),
            new HumanMessage(`Generate a graph for the following agent/workflow: ${useCase}`),
        ];
        const response = await chatModel.invoke(messages);

        // Extract and parse the graph JSON from the LLM response
        let graphJsonString = "";
        if (typeof response.content === "string" && response.content.trim()) {
            graphJsonString = response.content.trim();
        }
        // Robustly extract JSON from code blocks like ```json graph ...```
        const codeBlockRegex = /```json[^\n]*\n([\s\S]*?)\n```/i;
        const jsonMatch = graphJsonString.match(codeBlockRegex);
        if (jsonMatch && jsonMatch[1]) {
            graphJsonString = jsonMatch[1];
        }
        graphJsonString = typeof graphJsonString === 'string' ? graphJsonString.trim() : '';

        let graph;
        try {
            graph = JSON.parse(graphJsonString);
        } catch (e: any) {
            console.error('[chat-to-agent] Failed to parse LLM response as JSON');
            return NextResponse.json({ error: "Failed to parse LLM response as JSON.", llmOutput: graphJsonString }, { status: 500 });
        }

        if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
            console.error('[chat-to-agent] Invalid graph structure received from LLM');
            return NextResponse.json({ error: "LLM returned invalid graph structure (missing nodes or edges array).", llmOutput: graph }, { status: 500 });
        }
        return NextResponse.json(graph);

    } catch (error: any) {
        console.error('[chat-to-agent] Error processing request');
        return NextResponse.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}