import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { AIMessage, HumanMessage, ToolMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";

import { AuthConfigTypes, AuthSchemeTypes, Composio, } from "@composio/core";
import {LangchainToolset} from '@composio/langchain'

const AgentRequestBodySchema = z.object({
  graphJson: z.object({
    nodes: z.array(z.any()), 
    edges: z.array(z.any()), 
  }),
});

const GraphState = Annotation.Root({
  currentData: Annotation<any>(),
  originalQuery: Annotation<string>(),
  graphNodes: Annotation<any[]>(),
  graphEdges: Annotation<any[]>(),
  steps: Annotation<string[]>(),
  currentNodeId: Annotation<string | null>(),
  executionComplete: Annotation<boolean>()
});

type GraphStateType = typeof GraphState.State;

async function executeInput(state: GraphStateType): Promise<Partial<GraphStateType>> {
  console.log("[LangGraph] Executing input node");
  
  const startNode = state.graphNodes.find(n => n.type === 'customInput');
  if (!startNode) throw new Error("Graph must contain a 'customInput' node.");
  if (!startNode.data?.query?.trim()) throw new Error("'customInput' node must contain a non-empty query.");

  const originalQuery = startNode.data.query;
  const steps = [...state.steps, `Start: Initial query = "${originalQuery}"`];
  
  const outgoingEdge = state.graphEdges.find(edge => edge.source === startNode.id);
  const nextNodeId = outgoingEdge?.target || null;
  
  return {
    currentData: originalQuery,
    originalQuery,
    steps,
    currentNodeId: nextNodeId
  };
}

async function executeLLM(state: GraphStateType): Promise<Partial<GraphStateType>> {
  console.log("[LangGraph] Executing LLM node");
  
  const currentNode = state.graphNodes.find(n => n.id === state.currentNodeId);
  if (!currentNode) throw new Error(`LLM Node with ID ${state.currentNodeId} not found`);

  const { apiKey, systemPrompt: nodeSystemPrompt, modelProvider, modelName } = currentNode.data;
  if (!apiKey) throw new Error(`LLM Node ${currentNode.id} requires an apiKey.`);

  let llm;
  switch (modelProvider) {
    case 'anthropic': llm = new ChatAnthropic({ apiKey, temperature: 0.7, modelName }); break;
    case 'google': llm = new ChatGoogleGenerativeAI({ apiKey, temperature: 0.7, model: modelName }); break;
    case 'openai': default: llm = new ChatOpenAI({ apiKey, temperature: 0.7, modelName }); break;
  }
  
  const contextSystemPrompt = `Final Goal: ${state.originalQuery}\n\nCurrent Status/Input: ${String(state.currentData)}`;
  const combinedSystemPrompt = `${contextSystemPrompt}\n\n${nodeSystemPrompt || ''}`.trim();

  const messages: BaseMessage[] = [
    new SystemMessage(combinedSystemPrompt),
    new HumanMessage(String(state.currentData))
  ];

  console.log(`[LLM Node ${currentNode.id}] Invoking LLM with System Prompt: "${combinedSystemPrompt}"`);
  const response = await llm.invoke(messages);
  
  const steps = [...state.steps, `Result (LLM ${currentNode.id}): ${typeof response.content === 'string' ? response.content.substring(0,100)+'...' : JSON.stringify(response.content)}`];
  
  const outgoingEdge = state.graphEdges.find(edge => edge.source === currentNode.id);
  const nextNodeId = outgoingEdge?.target || null;
  
  return {
    currentData: response.content,
    steps,
    currentNodeId: nextNodeId
  };
}

async function executeAgent(state: GraphStateType): Promise<Partial<GraphStateType>> {
  console.log("[LangGraph] Executing Agent node");
  
  const currentNode = state.graphNodes.find(n => n.id === state.currentNodeId);
  if (!currentNode) throw new Error(`Agent Node with ID ${state.currentNodeId} not found`);

  const {
    llmApiKey, systemPrompt: nodeSystemPrompt, modelProvider, modelName,
    composioApiKey, allowedTools: allowedToolsString,
  } = currentNode.data;

  if (!llmApiKey) throw new Error(`Agent Node ${currentNode.id} requires an llmApiKey.`);

  let agentLlm;
  switch (modelProvider) {
    case 'anthropic': agentLlm = new ChatAnthropic({ apiKey: llmApiKey, temperature: 0.7, modelName }); break;
    case 'google': agentLlm = new ChatGoogleGenerativeAI({ apiKey: llmApiKey, temperature: 0.7, model: modelName }); break;
    case 'openai': default: agentLlm = new ChatOpenAI({ apiKey: llmApiKey, temperature: 0.7, modelName }); break;
  }

  let toolsForAgent: any[] = [];
  const allowedTools = (allowedToolsString || '').split(',').map((t: string) => t.trim()).filter((t: string) => t);

  if (composioApiKey && allowedTools.length > 0) {
    try {
      const composio = new Composio({
        apiKey: composioApiKey, 
        toolset: new LangchainToolset()
      })
      console.log(`[Agent Node ${currentNode.id}] Fetching tools: ${allowedTools.join(', ')}`);
      toolsForAgent = await composio.getTools('user123', { tools: allowedTools });
      console.log(`[Agent Node ${currentNode.id}] Loaded ${toolsForAgent.length} tools.`);
    } catch (error: any) {
      console.error(`[Agent Node ${currentNode.id}] Failed to load tools:`, error);
    }
  }

  const modelWithTools = agentLlm.bindTools(toolsForAgent);
  const contextSystemPrompt = `Final Goal: ${state.originalQuery}\n\nCurrent Status/Input: ${String(state.currentData)}`;
  const combinedSystemPrompt = `${contextSystemPrompt}\n\n${nodeSystemPrompt || ''}`.trim();

  let agentMessages: BaseMessage[] = [
    new SystemMessage(combinedSystemPrompt),
    new HumanMessage(String(state.currentData))
  ];

  let finalAgentOutput: any = null;
  let steps = [...state.steps];
  const maxTurns = 5;
  let turns = 0;

  while (turns < maxTurns) {
    turns++;
    steps.push(`Agent ${currentNode.id} Turn ${turns}: Calling LLM`);

    const response: AIMessage = await modelWithTools.invoke(agentMessages);
    agentMessages.push(response);

    const toolCalls = response.additional_kwargs?.tool_calls;
    if (toolCalls && toolCalls.length > 0 && toolsForAgent.length > 0) {
      steps.push(`Agent ${currentNode.id} Turn ${turns}: LLM requested tools: ${toolCalls.map((tc: any) => tc.function.name).join(', ')}`);

      const toolMessages: ToolMessage[] = [];
      await Promise.all(toolCalls.map(async (toolCall: any) => {
        const toolToCall = toolsForAgent.find((tool) => tool.name === toolCall.function.name);
        let toolOutputContent: any;

        if (toolToCall) {
          try {
            let args = {};
            try {
              args = JSON.parse(toolCall.function.arguments || '{}');
            } catch (parseError) {
              throw new Error(`Invalid arguments format: ${toolCall.function.arguments}`);
            }
            toolOutputContent = await toolToCall.invoke(args);
            steps.push(`Agent ${currentNode.id} Turn ${turns}: Executed ${toolCall.function.name}. Result: ${JSON.stringify(toolOutputContent).substring(0,100)}...`);
          } catch (toolError: any) {
            toolOutputContent = `Error executing tool: ${toolError.message}`;
            steps.push(`Agent ${currentNode.id} Turn ${turns}: Error executing ${toolCall.function.name}: ${toolError.message}`);
          }
        } else {
          toolOutputContent = `Error: Tool \"${toolCall.function.name}\" not found.`;
          steps.push(`Agent ${currentNode.id} Turn ${turns}: Tool ${toolCall.function.name} not found.`);
        }
        
        toolMessages.push(new ToolMessage({
          tool_call_id: toolCall.id!,
          content: toolOutputContent,
          name: toolCall.function.name 
        }));
      }));

      agentMessages = agentMessages.concat(toolMessages);
    } else {
      finalAgentOutput = response.content;
      steps.push(`Result (Agent ${currentNode.id}): ${typeof finalAgentOutput === 'string' ? finalAgentOutput.substring(0,100)+'...' : JSON.stringify(finalAgentOutput)}`);
      break;
    }
  }

  if (turns >= maxTurns && finalAgentOutput === null) {
    steps.push(`Warning (Agent ${currentNode.id}): Reached max iterations after tool calls.`);
    const lastMessage = agentMessages[agentMessages.length - 1];
    finalAgentOutput = lastMessage?.content ?? `Agent reached max iterations (${maxTurns}).`;
  }

  const outgoingEdge = state.graphEdges.find(edge => edge.source === currentNode.id);
  const nextNodeId = outgoingEdge?.target || null;

  return {
    currentData: finalAgentOutput,
    steps,
    currentNodeId: nextNodeId
  };
}

async function executeOutput(state: GraphStateType): Promise<Partial<GraphStateType>> {
  console.log("[LangGraph] Executing output node");
  
  const currentNode = state.graphNodes.find(n => n.id === state.currentNodeId);
  const steps = [...state.steps, `Output: ${typeof state.currentData === 'string' ? state.currentData.substring(0,100)+'...' : JSON.stringify(state.currentData)}`];
  
  return {
    steps,
    executionComplete: true,
    currentNodeId: null
  };
}

function routeNext(state: GraphStateType): string {
  if (state.executionComplete || !state.currentNodeId) {
    return END;
  }

  const currentNode = state.graphNodes.find(n => n.id === state.currentNodeId);
  if (!currentNode) {
    return END;
  }

  switch (currentNode.type) {
    case 'llm':
      return 'llm';
    case 'agent':
      return 'agent';
    case 'customOutput':
      return 'output';
    case 'composio':
      return 'agent';
    default:
      return END;
  }
}

async function executeGraphWithLangGraph(
  graphJson: { nodes: any[]; edges: any[] }
): Promise<{ response: string; steps: string[] }> {
  console.log("[LangGraph] Starting graph execution");

  const workflow = new StateGraph(GraphState)
    .addNode('input', executeInput)
    .addNode('llm', executeLLM)
    .addNode('agent', executeAgent)
    .addNode('output', executeOutput)
    .addEdge(START, 'input')
    .addConditionalEdges('input', routeNext)
    .addConditionalEdges('llm', routeNext)
    .addConditionalEdges('agent', routeNext)
    .addEdge('output', END);

  const app = workflow.compile();

  const initialState: GraphStateType = {
    currentData: null,
    originalQuery: '',
    graphNodes: graphJson.nodes,
    graphEdges: graphJson.edges,
    steps: [],
    currentNodeId: null,
    executionComplete: false
  };

  const result = await app.invoke(initialState);
  
  return {
    response: String(result.currentData),
    steps: result.steps
  };
}

export async function POST(request: NextRequest) {
  console.log("Received POST request to /api/agent");
  try {
    const rawBody = await request.json();
    console.log("Raw request body:", rawBody);

    const validationResult = AgentRequestBodySchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error("Invalid request body:", validationResult.error.format());
      return NextResponse.json(
        { error: "Invalid request body", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { graphJson } = validationResult.data;
    console.log("Parsed graph JSON:", graphJson);

    const result = await executeGraphWithLangGraph(graphJson);

    console.log("Agent execution result:", result);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Error running agent:", error);
    if (error.message.includes("requires an apiKey") || error.message.includes("requires an llmApiKey") || error.message.includes("'customInput' node")) {
      return NextResponse.json({ error: `Configuration Error: ${error.message}` }, { status: 400 });
    }
    if (error.response?.status === 401 || error.message.includes("Incorrect API key")) {
      return NextResponse.json({ error: `Authentication Error: ${error.message}` }, { status: 401 });
    }
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
} 