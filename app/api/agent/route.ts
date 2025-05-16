import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { AIMessage, HumanMessage, ToolMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";

import { AuthConfigTypes, AuthSchemeTypes, Composio, } from "@composio/core";
import {LangchainToolset} from '@composio/langchain'

const AgentRequestBodySchema = z.object({
  graphJson: z.object({
    nodes: z.array(z.any()), 
    edges: z.array(z.any()), 
  }),
});

async function executeGraphSequentially(
  graphJson: { nodes: any[]; edges: any[] }
): Promise<{ response: string; steps: string[] }> {
    console.log("[Graph Executor] Starting sequential execution.");
    const { nodes, edges } = graphJson;
    const steps: string[] = [];

    const startNode = nodes.find(n => n.type === 'customInput');
    if (!startNode) throw new Error("Graph must contain a 'customInput' node.");
    if (!startNode.data?.query?.trim()) throw new Error("'customInput' node must contain a non-empty query.");

    const originalQuery = startNode.data.query; 
    let currentNodeId = startNode.id;
    let lastOutputData: any = originalQuery; 
    steps.push(`Start: Initial query = "${originalQuery}"`);

    const visitedNodes = new Set<string>();

    while (currentNodeId && !visitedNodes.has(currentNodeId)) {
        visitedNodes.add(currentNodeId);
        const currentNode = nodes.find(n => n.id === currentNodeId);
        if (!currentNode) throw new Error(`Node with ID ${currentNodeId} not found in graph.`);

        console.log(`[Graph Executor] Executing Node ${currentNode.id} (Type: ${currentNode.type}) with input:`, typeof lastOutputData === 'string' ? lastOutputData.substring(0, 100) + '...' : lastOutputData);
        steps.push(`Executing: Node ${currentNode.id} (Type: ${currentNode.type})`);

        let outputData: any = null;

        switch (currentNode.type) {
            case 'customInput':
                outputData = lastOutputData; 
                break;

            case 'llm': {
                console.log("[Graph Executor] Handling LLM Node:", currentNode.data);
                const { apiKey, systemPrompt: nodeSystemPrompt, modelProvider, modelName } = currentNode.data;
                if (!apiKey) throw new Error(`LLM Node ${currentNode.id} requires an apiKey.`);

                let llm;
                 switch (modelProvider) {
                      case 'anthropic': llm = new ChatAnthropic({ apiKey, temperature: 0.7, modelName }); break;
                      case 'google': llm = new ChatGoogleGenerativeAI({ apiKey, temperature: 0.7, model: modelName }); break;
                      case 'openai': default: llm = new ChatOpenAI({ apiKey, temperature: 0.7, modelName }); break;
                  }
                  console.log(`[LLM Node ${currentNode.id}] Instantiated ${modelProvider} model.`);

                const contextSystemPrompt = `Final Goal: ${originalQuery}\n\nCurrent Status/Input: ${String(lastOutputData)}`;
                const combinedSystemPrompt = `${contextSystemPrompt}\n\n${nodeSystemPrompt || ''}`.trim();

                const messages: BaseMessage[] = [
                    new SystemMessage(combinedSystemPrompt),
                    new HumanMessage(String(lastOutputData))
                ];

                 console.log(`[LLM Node ${currentNode.id}] Invoking LLM with System Prompt: "${combinedSystemPrompt}" and Human Message: "${String(lastOutputData).substring(0,100)}..."`);
                const response = await llm.invoke(messages);
                 console.log(`[LLM Node ${currentNode.id}] LLM Response:`, response);
                outputData = response.content;
                steps.push(`Result (LLM ${currentNode.id}): ${typeof outputData === 'string' ? outputData.substring(0,100)+'...' : JSON.stringify(outputData)}`);
                break;
            }

            case 'agent': {
                 console.log("[Graph Executor] Handling Agent Node:", currentNode.data);
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
                 console.log(`[Agent Node ${currentNode.id}] Instantiated ${modelProvider} model.`);

                 let toolsForAgent: any[] = [];
                 const allowedTools = (allowedToolsString || '').split(',').map((t: string) => t.trim()).filter((t: string) => t);

                 if (composioApiKey && allowedTools.length > 0) {
    try {
      const composio = new Composio({
        apiKey: composioApiKey, 
        toolset: new LangchainToolset()
      })
                         console.log(`[Agent Node ${currentNode.id}] Fetching tools: ${allowedTools.join(', ')}`);
                         toolsForAgent = await composio.getTools( 'user123', {tools: allowedTools} );
                         console.log(`[Agent Node ${currentNode.id}] Loaded ${toolsForAgent.length} tools.`);
    } catch (error: any) {
                         console.error(`[Agent Node ${currentNode.id}] Failed to load tools:`, error);
                         steps.push(`Warning (Agent ${currentNode.id}): Failed to load tools - ${error.message}`);
    }
  } else {
                    console.log(`[Agent Node ${currentNode.id}] No Composio API key or tools specified.`);
                 }

                 const modelWithTools = agentLlm.bindTools(toolsForAgent);

                 const contextSystemPrompt = `Final Goal: ${originalQuery}\n\nCurrent Status/Input: ${String(lastOutputData)}`;
                 const combinedSystemPrompt = `${contextSystemPrompt}\n\n${nodeSystemPrompt || ''}`.trim();

                 let agentMessages: BaseMessage[] = [
                     new SystemMessage(combinedSystemPrompt),
                     new HumanMessage(String(lastOutputData))
                 ];

                 let finalAgentOutput: any = null;
                 const maxTurns = 5; 
                 let turns = 0;

                 while (turns < maxTurns) {
                     turns++;
                     console.log(`[Agent Node ${currentNode.id}] Invoking Agent LLM (Turn ${turns}). System Prompt: "${combinedSystemPrompt}". Current Messages:`, agentMessages.slice(1)); // Log messages excluding system prompt for brevity
                     steps.push(`Agent ${currentNode.id} Turn ${turns}: Calling LLM`);

                     const response: AIMessage = await modelWithTools.invoke(agentMessages); 
                     console.log(`[Agent Node ${currentNode.id}] Raw Agent Response (Turn ${turns}):`, response);
                     agentMessages.push(response); 

                     const toolCalls = response.additional_kwargs?.tool_calls;
                     if (toolCalls && toolCalls.length > 0 && toolsForAgent.length > 0) {
                         console.log(`[Agent Node ${currentNode.id}] LLM requested tool calls:`, toolCalls);
                         steps.push(`Agent ${currentNode.id} Turn ${turns}: LLM requested tools: ${toolCalls.map((tc: any) => tc.function.name).join(', ')}`);

                         const toolMessages: ToolMessage[] = [];
                         await Promise.all(toolCalls.map(async (toolCall: any) => {
                             const toolToCall = toolsForAgent.find((tool) => tool.name === toolCall.function.name);
                             let toolOutputContent: any;
                             let toolCallSuccessful = false;

                             if (toolToCall) {
                                 try {
                                     console.log(`[Agent Node ${currentNode.id}] Executing tool: ${toolCall.function.name} with args:`, toolCall.function.arguments);
                                     let args = {};
                                     try {
                                        args = JSON.parse(toolCall.function.arguments || '{}');
                                     } catch (parseError) {
                                         console.error(`[Agent Node ${currentNode.id}] Failed to parse args for ${toolCall.function.name}:`, parseError);
                                         throw new Error(`Invalid arguments format: ${toolCall.function.arguments}`);
                                     }
                                     toolOutputContent = await toolToCall.invoke(args);
                                     toolCallSuccessful = true;
                                     console.log(`[Agent Node ${currentNode.id}] Tool ${toolCall.function.name} output:`, toolOutputContent);
                                     steps.push(`Agent ${currentNode.id} Turn ${turns}: Executed ${toolCall.function.name}. Result: ${JSON.stringify(toolOutputContent).substring(0,100)}...`);
                                 } catch (toolError: any) {
                                     console.error(`[Agent Node ${currentNode.id}] Error executing tool ${toolCall.function.name}:`, toolError);
                                     toolOutputContent = `Error executing tool: ${toolError.message}`;
                                     steps.push(`Agent ${currentNode.id} Turn ${turns}: Error executing ${toolCall.function.name}: ${toolError.message}`);
                                 }
                             } else {
                                  console.error(`[Agent Node ${currentNode.id}] Tool ${toolCall.function.name} requested but not found/loaded.`);
                                  toolOutputContent = `Error: Tool "${toolCall.function.name}" not found.`;
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
                         console.log(`[Agent Node ${currentNode.id}] Final Agent Response (Turn ${turns}):`, finalAgentOutput);
                         steps.push(`Result (Agent ${currentNode.id}): ${typeof finalAgentOutput === 'string' ? finalAgentOutput.substring(0,100)+'...' : JSON.stringify(finalAgentOutput)}`);
                         break; 
                     }
                 } 

                 if (turns >= maxTurns && finalAgentOutput === null) {
                     console.warn(`[Agent Node ${currentNode.id}] Reached max iterations (${maxTurns}) after tool calls.`);
                     steps.push(`Warning (Agent ${currentNode.id}): Reached max iterations after tool calls.`);
                     const lastMessage = agentMessages[agentMessages.length - 1];
                     finalAgentOutput = lastMessage?.content ?? `Agent reached max iterations (${maxTurns}).`;
                 }

                 outputData = finalAgentOutput; 
                 break;
            } 


            case 'customOutput':
                outputData = lastOutputData; 
                console.log(`[Graph Executor] Reached Output Node ${currentNode.id}. Final data:`, outputData);
                steps.push(`Output: ${typeof outputData === 'string' ? outputData.substring(0,100)+'...' : JSON.stringify(outputData)}`);
                currentNodeId = null; 
          break;

            case 'composio': 
                 console.warn(`[Graph Executor] ComposioNode type execution not fully implemented in sequential model. Ignoring node ${currentNode.id}.`);
                 outputData = lastOutputData; 
                 steps.push(`Skipped (Composio ${currentNode.id}): Execution logic pending.`);
          break;

      default:
                console.warn(`[Graph Executor] Unknown node type: ${currentNode.type}. Skipping node ${currentNode.id}.`);
                outputData = lastOutputData; 
                steps.push(`Skipped (Unknown Type ${currentNode.type} - ${currentNode.id})`);
        }

        if (currentNodeId) { 
             const outgoingEdge = edges.find(edge => edge.source === currentNodeId);
             if (outgoingEdge) {
                 currentNodeId = outgoingEdge.target;
                 lastOutputData = outputData;
                 console.log(`[Graph Executor] Moving to next node: ${currentNodeId}`);
             } else {
                 console.log(`[Graph Executor] No outgoing edge found from node ${currentNodeId}. Ending execution.`);
                 if(currentNode.type !== 'customOutput') {
                     steps.push(`End: No outgoing edge from ${currentNode.id}`);
                 }
                 lastOutputData = outputData;
                 currentNodeId = null;
             }
    } else {
             lastOutputData = outputData; 
         }
    }

    if (currentNodeId && visitedNodes.has(currentNodeId)) {
        console.error("[Graph Executor] Error: Infinite loop detected.");
        steps.push("Error: Infinite loop detected in graph.");
        return { response: "Error: Infinite loop detected", steps };
  }
  
    console.log("[Graph Executor] Sequential execution finished.");
    return { response: String(lastOutputData), steps };
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

        const result = await executeGraphSequentially(graphJson);

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