"use client";
import React, { useState, useCallback, useEffect, ChangeEvent } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import ToolsWindow from './ToolsWindow';

// Re-import model options or define them here if needed
const modelOptions = {
  openai: ['gpt-4o', 'gpt-4.1', 'o3-mini'],
  anthropic: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  google: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', 'gemini-1.0-pro'],
};

// Updated AgentNodeData interface
export interface AgentNodeData {
  label?: string;
  // LLM Fields
  systemPrompt?: string;
  llmApiKey?: string; // Renamed to avoid conflict if needed
  modelProvider?: 'openai' | 'anthropic' | 'google';
  modelName?: string;
  // Tool Fields
  composioApiKey?: string;
  allowedTools?: string; // Simple text area for now, e.g., "gmail.send_email, github.create_issue"
  // Callback for data changes within this node
  onNodeDataChange?: (id: string, data: Partial<Omit<AgentNodeData, 'onNodeDataChange'>>) => void;
  width?: number;
}

interface AgentNodeProps extends NodeProps<AgentNodeData> {
  onOpenToolsWindow?: () => void;
}

const AgentNode: React.FC<AgentNodeProps> = ({ id, data, isConnectable, onOpenToolsWindow }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [availableActions, setAvailableActions] = useState<{[key: string]: string[]}>({});
  const selectedActionsList = (data.allowedTools || '').split(',').map(t => t.trim()).filter(Boolean);

  // Fetch available actions for connected tools
  useEffect(() => {
    const fetchToolActions = async () => {
      try {
        const response = await fetch('/api/composio-tools');
        const data = await response.json();
        const tools = data.tools || [];
        const actions: {[key: string]: string[]} = {};
        tools.forEach((tool: { name: string, actions: string[] }) => {
          if (selectedActionsList.includes(tool.name)) {
            actions[tool.name] = tool.actions;
          }
        });
        setAvailableActions(actions);
      } catch (error) {
        console.error('Failed to fetch tool actions:', error);
      }
    };
    if (selectedActionsList.length > 0) {
      fetchToolActions();
    }
  }, [selectedActionsList]);

  const handleNodeConfigChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    let newData: Partial<AgentNodeData> = { [name]: value };
    if (name === 'modelProvider') {
      const newProvider = value as keyof typeof modelOptions;
      newData.modelName = modelOptions[newProvider]?.[0] || undefined;
    }
    if (data.onNodeDataChange) data.onNodeDataChange(id, newData);
  };

  const handleRemoveTool = useCallback((toolNameToRemove: string) => {
    const updatedSelectedTools = selectedActionsList.filter(t => t !== toolNameToRemove);
    if (data.onNodeDataChange) data.onNodeDataChange(id, { allowedTools: updatedSelectedTools.join(',') });
  }, [selectedActionsList, data, id]);

  const handleConnectTool = (toolName: string, actions: string[]) => {
    if (!selectedActionsList.includes(toolName)) {
      const updatedSelectedTools = [...selectedActionsList, toolName];
      if (data.onNodeDataChange) {
        data.onNodeDataChange(id, { allowedTools: updatedSelectedTools.join(',') });
      }
    }
    if (onOpenToolsWindow) onOpenToolsWindow(); // just close, parent will handle
  };

  // Common styles
  const inputStyle = {
    width: '100%',
    padding: '0.5rem',
    fontSize: '0.75rem',
    color: '#cbfcfc', // Use agent node color
    background: 'rgba(180, 245, 245, 0.05)',
    border: '1px solid rgba(180, 245, 245, 0.1)',
    borderRadius: '0.375rem',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: 'rgba(180, 245, 245, 0.7)',
    marginBottom: '0.25rem'
  };

  return (
    <>
      <div style={{
        background: 'rgba(180, 245, 245, 0.1)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(180, 245, 245, 0.2)',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 24px -1px rgba(0, 0, 0, 0.2)',
        width: '20rem',
        color: '#cbfcfc',
        fontSize: '0.85rem',
      }}>
        <div style={{
          padding: '0.5rem',
          borderBottom: '1px solid rgba(180, 245, 245, 0.2)',
        }}>
          <input
            type="text"
            name="label"
            value={data.label ?? 'Agent'}
            onChange={handleNodeConfigChange}
            onPaste={(e) => e.stopPropagation()}
            style={{
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#cbfcfc',
              background: 'transparent',
              outline: 'none',
              border: 'none',
              width: '100%',
              padding: '0.15rem',
            }}
            className="focus:ring-1 focus:ring-[#cbfcfc] rounded"
            placeholder="Agent Label"
          />
        </div>
        <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* LLM Configuration Section */}
          <div style={{ borderBottom: '1px dashed rgba(180, 245, 245, 0.1)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ ...labelStyle, fontSize: '0.8rem', color: 'rgba(180, 245, 245, 0.9)', marginBottom: '0.3rem' }}>LLM Config</span>
            <div>
              <label htmlFor={`modelProvider-${id}`} style={labelStyle}>Model Provider</label>
              <select
                id={`modelProvider-${id}`}
                name="modelProvider"
                value={data.modelProvider || 'openai'}
                onChange={handleNodeConfigChange}
                style={inputStyle}
                className="focus:ring-1 focus:ring-[#cbfcfc] cursor-pointer"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
              </select>
            </div>
            <div>
              <label htmlFor={`modelName-${id}`} style={labelStyle}>Model Name</label>
              <select
                id={`modelName-${id}`}
                name="modelName"
                value={data.modelName || modelOptions[data.modelProvider || 'openai'][0]}
                onChange={handleNodeConfigChange}
                style={inputStyle}
                className="focus:ring-1 focus:ring-[#cbfcfc] cursor-pointer"
                disabled={!modelOptions[data.modelProvider || 'openai']?.length}
              >
                {(modelOptions[data.modelProvider || 'openai'] || []).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                {!(modelOptions[data.modelProvider || 'openai']?.length) && (
                  <option value="" disabled>No models available</option>
                )}
              </select>
            </div>
            <div>
              <label htmlFor={`llmApiKey-${id}`} style={labelStyle}>LLM API Key</label>
              <input
                id={`llmApiKey-${id}`}
                type="password"
                name="llmApiKey"
                value={data.llmApiKey || ''}
                onChange={handleNodeConfigChange}
                onPaste={(e) => e.stopPropagation()}
                style={inputStyle}
                className="focus:ring-1 focus:ring-[#cbfcfc]"
                placeholder="Enter LLM API Key..."
              />
            </div>
            <div>
              <label htmlFor={`systemPrompt-${id}`} style={labelStyle}>System Prompt</label>
              <textarea
                id={`systemPrompt-${id}`}
                name="systemPrompt"
                value={data.systemPrompt || ''}
                onChange={handleNodeConfigChange}
                onPaste={(e) => e.stopPropagation()}
                rows={2}
                style={inputStyle}
                className="focus:ring-1 focus:ring-[#cbfcfc]"
                placeholder="e.g., You are a helpful agent..."
              />
            </div>
          </div>
          {/* Tool Configuration Section */}
          <div>
            <span style={{ ...labelStyle, fontSize: '0.8rem', color: 'rgba(180, 245, 245, 0.9)', marginBottom: '0.3rem' }}>Tool Config</span>
            <div style={{ marginBottom: '0.5rem' }}>
              <div className="mb-2 bg-red-600/90 text-white text-xs font-semibold rounded px-2 py-1 text-center">
                You must provide a Composio API key to use tools.
              </div>
              <label htmlFor={`composioApiKey-${id}`} style={labelStyle}>Composio API Key</label>
              <input
                id={`composioApiKey-${id}`}
                type="password"
                name="composioApiKey"
                value={data.composioApiKey || ''}
                onChange={handleNodeConfigChange}
                onPaste={(e) => e.stopPropagation()}
                style={inputStyle}
                className="focus:ring-1 focus:ring-[#cbfcfc]"
                placeholder="Enter Composio API Key (optional)"
              />
            </div>

            {/* Tools Selection */}
            <div className="relative">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={labelStyle}>Available Actions</label>
              </div>
              <div 
                onClick={() => setShowDropdown(!showDropdown)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                className="hover:bg-[rgba(180,245,245,0.08)] focus:bg-[rgba(180,245,245,0.08)] transition-colors duration-150"
              >
                <span style={{ color: 'rgba(180, 245, 245, 0.6)' }}>
                  Select an action...
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              
              {showDropdown && (
                <div 
                  className="absolute left-0 right-0 mt-1 bg-[#0a2323] border border-[#cbfcfc33] rounded-md shadow-lg z-20 max-h-48 overflow-y-auto"
                  style={{ fontSize: '0.85em' }}
                >
                  <div
                    className="px-3 py-2 cursor-pointer hover:bg-[#cbfcfc22] text-[#cbfcfc] font-medium border-b border-[#cbfcfc33]"
                    onClick={() => {
                      if (onOpenToolsWindow) onOpenToolsWindow();
                      setShowDropdown(false);
                    }}
                  >
                    + Add Tool
                  </div>
                  {Object.entries(availableActions).map(([toolName, actions]) => (
                    <div key={toolName}>
                      <div className="px-3 py-1.5 text-xs text-[#cbfcfc99] bg-[#cbfcfc0a]">
                        {toolName}
                      </div>
                      {Array.isArray(actions) && actions.map(action => (
                        <div
                          key={action}
                          className="px-3 py-2 cursor-pointer hover:bg-[#cbfcfc22] text-[#cbfcfc]"
                          onClick={() => {
                            const actionKey = `${toolName}.${action}`;
                            if (!selectedActionsList.includes(actionKey)) {
                              const updated = [...selectedActionsList, actionKey];
                              if (data.onNodeDataChange) data.onNodeDataChange(id, { allowedTools: updated.join(',') });
                            }
                            setShowDropdown(false);
                          }}
                        >
                          {action}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div 
              className="flex flex-wrap gap-2 mt-2"
              style={{ maxHeight: '4.5rem', overflowY: 'auto' }}
            >
              {selectedActionsList.map(actionKey => (
                <div key={actionKey} className="bg-[#cbfcfc22] text-[#cbfcfc] rounded-full px-3 py-1 text-xs flex items-center gap-1.5">
                  <button
                    type="button"
                    className="text-[#cbfcfc] hover:text-white leading-none mr-1.5"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1em', padding: '0'}}
                    onClick={() => {
                      const updated = selectedActionsList.filter(a => a !== actionKey);
                      if (data.onNodeDataChange) data.onNodeDataChange(id, { allowedTools: updated.join(',') });
                    }}
                    aria-label={`Remove ${actionKey}`}
                  >
                    ×
                  </button>
                  {actionKey}
                </div>
              ))}
            </div>
          </div>
        </div>
        <Handle 
          type='target' 
          position={Position.Left} 
          id='input' 
          isConnectable={isConnectable} 
          style={{
            background: '#cbfcfc',
            width: '0.75rem',
            height: '0.75rem',
          }}
        />
        <Handle 
          type='source' 
          position={Position.Right} 
          id='output' 
          isConnectable={isConnectable} 
          style={{
            background: '#cbfcfc',
            width: '0.75rem',
            height: '0.75rem',
          }}
        />
      </div>
    </>
  );
};

export default AgentNode;