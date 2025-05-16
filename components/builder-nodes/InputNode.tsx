"use client";

import React, { memo, ChangeEvent } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export interface InputNodeData {
  label?: string;
  query?: string;
  onNodeDataChange?: (id: string, data: Partial<Omit<InputNodeData, 'onNodeDataChange'>>) => void;
  width?: number;
}

const InputNode: React.FC<NodeProps<InputNodeData>> = ({ id, data, isConnectable }) => {
  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    if (data.onNodeDataChange) {
      data.onNodeDataChange(id, { [name]: value });
    }
  };

  return (
    <div style={{
      background: 'rgba(255, 245, 245, 0.05)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 245, 245, 0.1)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 24px -1px rgba(0, 0, 0, 0.2)',
      width: data.width || 160,
      maxWidth: 160,
      color: '#fff5f5',
      fontSize: '0.85rem',
    }}>
      <div style={{
        padding: '0.5rem',
        borderBottom: '1px solid rgba(255, 245, 245, 0.1)',
      }}>
        <input
          type="text"
          name="label"
          value={data.label ?? 'Input Node'}
          onChange={handleInputChange}
          onPaste={(e) => e.stopPropagation()}
          style={{
            fontSize: '0.85rem',
            fontWeight: '500',
            color: '#fff5f5',
            background: 'transparent',
            outline: 'none',
            border: 'none',
            width: '100%',
            padding: '0.15rem',
          }}
          className="focus:ring-1 focus:ring-[#fff5f5] rounded"
          placeholder="Input Label"
        />
      </div>
      <div style={{ padding: '0.5rem' }}>
        <label htmlFor={`query-${id}`} style={{ 
          display: 'block',
          fontSize: '0.75rem',
          fontWeight: '500',
          color: 'rgba(255, 245, 245, 0.7)',
          marginBottom: '0.15rem'
        }}>
          User Query
        </label>
        <textarea
          id={`query-${id}`}
          name="query"
          value={data.query || ''}
          onChange={handleInputChange}
          onPaste={(e) => e.stopPropagation()}
          rows={2}
          style={{
            width: '100%',
            padding: '0.3rem',
            fontSize: '0.75rem',
            color: '#fff5f5',
            background: 'rgba(255, 245, 245, 0.05)',
            border: '1px solid rgba(255, 245, 245, 0.1)',
            borderRadius: '0.375rem',
            outline: 'none',
          }}
          className="focus:ring-1 focus:ring-[#fff5f5]"
          placeholder="Enter the initial query..."
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="output"
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

export default memo(InputNode); 