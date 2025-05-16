"use client";
import React, { memo, ChangeEvent } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export interface ComposioNodeData {
  label?: string;
  composioApiKey?: string;
  toolActions?: string; // comma-separated actions, e.g., "gmail.send_email,github.create_issue"
  onNodeDataChange?: (id: string, data: Partial<Omit<ComposioNodeData, 'onNodeDataChange'>>) => void;
}

const ComposioNode: React.FC<NodeProps<ComposioNodeData>> = ({ id, data, isConnectable }) => {
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [availableActions, setAvailableActions] = React.useState<string[]>([]);
  const selectedActionsList = (data.toolActions || '').split(',').map(t => t.trim()).filter(Boolean);

  React.useEffect(() => {
    async function fetchActions() {
      if (!data.composioApiKey) {
        setAvailableActions([]);
        return;
      }
      try {
        const res = await fetch(`/api/composio-tools/actions?toolkitSlug=gmail&composioApiKey=${encodeURIComponent(data.composioApiKey)}`);
        const d = await res.json();
        setAvailableActions(d.actions ? d.actions.map((a: any) => a.name) : []);
      } catch {
        setAvailableActions([]);
      }
    }
    fetchActions();
  }, [data.composioApiKey]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    if (data.onNodeDataChange) {
      data.onNodeDataChange(id, { [name]: value });
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '0.5rem',
    fontSize: '0.75rem',
    color: '#fff5f5',
    background: 'rgba(255, 245, 245, 0.05)',
    border: '1px solid rgba(255, 245, 245, 0.1)',
    borderRadius: '0.375rem',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: 'rgba(255, 245, 245, 0.7)',
    marginBottom: '0.25rem'
  };

  return (
    <div style={{
      background: 'rgba(255, 245, 245, 0.05)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 245, 245, 0.1)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 24px -1px rgba(0, 0, 0, 0.2)',
      width: '16rem',
      color: '#fff5f5'
    }}>
      <div style={{
        padding: '0.75rem',
        borderBottom: '1px solid rgba(255, 245, 245, 0.1)',
      }}>
        <input
          type="text"
          name="label"
          value={data.label ?? 'Composio Tool'}
          onChange={handleInputChange}
          onPaste={(e) => e.stopPropagation()}
          style={{
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#fff5f5',
            background: 'transparent',
            outline: 'none',
            border: 'none',
            width: '100%',
            padding: '0.25rem',
          }}
          className="focus:ring-1 focus:ring-[#fff5f5] rounded"
          placeholder="Node Label"
        />
      </div>
      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          {!data.composioApiKey && (
            <div className="mb-3 flex items-center gap-2 bg-gradient-to-r from-red-500 via-red-600 to-pink-500 text-white rounded-lg px-4 py-2 shadow-lg border border-red-300/40 animate-fade-in">
              <svg className="w-5 h-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /></svg>
              <span className="font-medium text-sm">You must provide a <span className="underline">Composio API key</span> to use tools.</span>
            </div>
          )}
          <label htmlFor={`composioApiKey-${id}`} style={labelStyle}>Composio API Key</label>
          <input
            id={`composioApiKey-${id}`}
            type="password"
            name="composioApiKey"
            value={data.composioApiKey || ''}
            onChange={handleInputChange}
            onPaste={(e) => e.stopPropagation()}
            style={inputStyle}
            className="focus:ring-1 focus:ring-[#fff5f5]"
            placeholder="comp_..."
          />
        </div>
      </div>
      <Handle 
        type='target' 
        position={Position.Left} 
        id='input' 
        isConnectable={isConnectable} 
        style={{
          background: '#fff5f5',
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
          background: '#fff5f5',
          width: '0.75rem',
          height: '0.75rem',
        }}
      />
    </div>
  );
};

export default memo(ComposioNode); 