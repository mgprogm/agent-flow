"use client";

import React, { useState, useCallback, DragEvent, useMemo, useEffect, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  Node,
  Edge,
  Connection,
  ReactFlowInstance,
  useNodesState,
  useEdgesState,
  NodeTypes,
  XYPosition,
  MarkerType,
  NodeDragHandler,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import ReactMarkdown from 'react-markdown';

// Import custom nodes
import InputNode, { InputNodeData } from '@/components/builder-nodes/InputNode';
import OutputNode from '@/components/builder-nodes/OutputNode';
import LLMNode, { LLMNodeData } from '@/components/builder-nodes/LLMNode';
import ComposioNode, { ComposioNodeData } from '@/components/builder-nodes/ComposioNode';
import AgentNode, { AgentNodeData } from '@/components/builder-nodes/AgentNode';

// Lucide Icons for sidebar items
import { MessageSquare, BrainCircuit, Puzzle, ArrowRightCircle, DownloadCloud, PanelLeftOpen, PanelRightOpen, PanelLeftClose, PanelRightClose, Trash2, Group, Share2, Upload } from 'lucide-react';

// Import the new Squares background component
import { Squares } from '@/components/ui/squares-background';

// Helper function to create a unique ID
const getUniqueNodeId = (type: string) => `${type}_${Math.random().toString(36).substr(2, 9)}`;

// localStorage keys
const LOCAL_STORAGE_NODES_KEY = 'reactFlowNodes';
const LOCAL_STORAGE_EDGES_KEY = 'reactFlowEdges';

// Define modelOptions before it's used in sidebarNodeTypes
const modelOptions = {
  openai: ['gpt-4o', 'gpt-4.1', 'o3-mini'],
  anthropic: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  google: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', 'gemini-1.0-pro'],
};

// Sidebar item configuration
const sidebarNodeTypes = [
  { type: 'customInput', label: 'Input Node', icon: <MessageSquare size={18} /> , defaultData: { label: 'Start Query', query: '' } },
  { type: 'llm', label: 'LLM Node', icon: <BrainCircuit size={18} />, defaultData: { label: 'LLM Call', systemPrompt: '', apiKey: '' } },
  { type: 'composio', label: 'Composio Tool', icon: <Puzzle size={18} />, defaultData: { label: 'Composio Action', apiKey: '', toolAction: '' } },
  { type: 'customOutput', label: 'Output Node', icon: <ArrowRightCircle size={18} />, defaultData: { label: 'End Result' } },
  { type: 'agent', label: 'Agent Node', icon: <Group size={18} />, 
    defaultData: { 
      label: 'Agent', 
      modelProvider: 'openai', 
      modelName: modelOptions.openai[0], // Use modelOptions here
      systemPrompt: '', 
      llmApiKey: '', 
      composioApiKey: '', 
      allowedTools: '' 
    } 
  },
];

const Page = () => { 
  // Load initial state from localStorage or default to empty arrays
  const [initialNodesLoaded, setInitialNodesLoaded] = useState(false);
  const [initialEdgesLoaded, setInitialEdgesLoaded] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [serializedGraph, setSerializedGraph] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<any>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // State for sidebar visibility
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Dustbin drag state
  const [isDustbinActive, setIsDustbinActive] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [draggedNodePos, setDraggedNodePos] = useState<{x: number, y: number} | null>(null);

  // Ref for dustbin div to get its bounding box
  const dustbinRef = React.useRef<HTMLDivElement>(null);

  // Track selected nodes
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [clipboardNodes, setClipboardNodes] = useState<Node[] | null>(null);

  // History state
  const [history, setHistory] = useState<{nodes: Node[], edges: Edge[]}[]>([]);

  // Ref for hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to push current state to history
  const pushToHistory = useCallback(() => {
    setHistory((h) => [...h, { nodes, edges }]);
  }, [nodes, edges]);

  // Wrap onNodesChange to push to history
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    pushToHistory();
    onNodesChange(changes);
  }, [onNodesChange, pushToHistory]);

  // Wrap onEdgesChange to push to history
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    pushToHistory();
    onEdgesChange(changes);
  }, [onEdgesChange, pushToHistory]);

  // Undo handler
  useEffect(() => {
    const handleUndo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (history.length > 0) {
          const prev = history[history.length - 1];
          setNodes(prev.nodes);
          setEdges(prev.edges);
          setHistory((h) => h.slice(0, -1));
        }
      }
    };
    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  }, [history, setNodes, setEdges]);

  // Effect to load nodes from localStorage on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedNodes = localStorage.getItem(LOCAL_STORAGE_NODES_KEY);
      if (savedNodes) {
        try {
          setNodes(JSON.parse(savedNodes));
        } catch (e) {
          console.error("Failed to parse saved nodes:", e);
          setNodes([]); // Fallback to empty if parsing fails
        }
      }
      setInitialNodesLoaded(true);
    }
  }, [setNodes]);

  // Effect to load edges from localStorage on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEdges = localStorage.getItem(LOCAL_STORAGE_EDGES_KEY);
      if (savedEdges) {
        try {
          setEdges(JSON.parse(savedEdges));
        } catch (e) {
          console.error("Failed to parse saved edges:", e);
          setEdges([]); // Fallback to empty if parsing fails
        }
      }
      setInitialEdgesLoaded(true);
    }
  }, [setEdges]);

  // Effect to save nodes to localStorage when they change, only after initial load
  useEffect(() => {
    if (typeof window !== 'undefined' && initialNodesLoaded) {
      // Similar to handleSerializeGraph, remove non-serializable data before saving
      const nodesToSave = nodes.map(node => ({ ...node, data: { ...node.data, onNodeDataChange: undefined }}));
      localStorage.setItem(LOCAL_STORAGE_NODES_KEY, JSON.stringify(nodesToSave));
    }
  }, [nodes, initialNodesLoaded]);

  // Effect to save edges to localStorage when they change, only after initial load
  useEffect(() => {
    if (typeof window !== 'undefined' && initialEdgesLoaded) {
      localStorage.setItem(LOCAL_STORAGE_EDGES_KEY, JSON.stringify(edges));
    }
  }, [edges, initialEdgesLoaded]);

  const onNodeDataChange = useCallback(
    (id: string, newData: Partial<InputNodeData | LLMNodeData | ComposioNodeData | AgentNodeData>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...newData } } : node
        )
      );
    },
    [setNodes]
  );

  const nodeTypes: NodeTypes = useMemo(() => ({
    customInput: (props) => <InputNode {...props} data={{...props.data, onNodeDataChange: onNodeDataChange as any }} />,
    customOutput: OutputNode,
    llm: (props) => <LLMNode {...props} data={{ ...props.data, onNodeDataChange: onNodeDataChange as any}} />,
    composio: (props) => <ComposioNode {...props} data={{ ...props.data, onNodeDataChange: onNodeDataChange as any }} />,
    agent: (props) => <AgentNode {...props} data={{ ...props.data, onNodeDataChange: onNodeDataChange as any }} />,
  }), [onNodeDataChange]);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      if (!rfInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      const initialNodeDataJSON = event.dataTransfer.getData('application/nodeInitialData');
      const initialNodeData = JSON.parse(initialNodeDataJSON || '{}');
      
      if (typeof type === 'undefined' || !type) return;

      const position: XYPosition = rfInstance.screenToFlowPosition({
        x: event.clientX - 288, // Adjust based on actual sidebar width
        y: event.clientY - 64,  // Adjust based on actual header height
      });
      
      let nodeData: any = { ...initialNodeData }; 
      if (type === 'customInput' || type === 'llm' || type === 'composio') {
        nodeData.onNodeDataChange = onNodeDataChange;
      }

      const newNode: Node = {
        id: getUniqueNodeId(type),
        type,
        position,
        data: nodeData,
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [rfInstance, setNodes, onNodeDataChange]
  );
  
  const onDragStart = (event: DragEvent, nodeType: string, nodeLabel: string, initialData: object) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/nodeInitialData', JSON.stringify(initialData));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleSerializeGraph = (forSave = false) => {
    // Ensure callbacks are removed before serialization
    const nodesToSerialize = nodes.map(node => ({
      ...node,
      data: { ...node.data, onNodeDataChange: undefined }
    }));
    const graph = {
      nodes: nodesToSerialize,
      edges,
    };
    const json = JSON.stringify(graph, null, 2);
    if (!forSave) {
      setSerializedGraph(json);
      console.log("Serialized Graph for Backend:", json); // Log the structure being sent
    }
    return graph;
  };

  // --- Share Workflow Logic ---
  const handleShareWorkflow = () => {
    const graphToSave = handleSerializeGraph(true); // Serialize without updating the state
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(graphToSave, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = "workflow.json";
    link.click();
  };

  // --- Upload Workflow Logic ---
  const handleUploadClick = () => {
    fileInputRef.current?.click(); // Trigger the hidden file input
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error("Failed to read file content.");

        const parsedGraph = JSON.parse(text);

        // Basic validation
        if (!parsedGraph || !Array.isArray(parsedGraph.nodes) || !Array.isArray(parsedGraph.edges)) {
          throw new Error("Invalid workflow file format. Missing 'nodes' or 'edges' array.");
        }

        // TODO: Add more robust validation if needed (e.g., check node types, data structure)

        // Restore the onNodeDataChange callback
        const restoredNodes = parsedGraph.nodes.map((node: Node) => ({
          ...node,
          data: { ...node.data, onNodeDataChange: onNodeDataChange },
        }));

        pushToHistory(); // Save current state before overwriting
        setNodes(restoredNodes);
        setEdges(parsedGraph.edges);

        // Clear the input value so the same file can be uploaded again if needed
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        alert("Workflow loaded successfully!");

      } catch (error: any) {
        console.error("Error loading workflow:", error);
        alert(`Failed to load workflow: ${error.message}`);
        // Clear the input value on error too
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.onerror = (e) => {
      console.error("FileReader error:", e);
      alert("Error reading file.");
       if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
    };
    reader.readAsText(file);
  };

  const handleRunAgentFromBuilder = async () => {
    console.log("[handleRunAgentFromBuilder] Function started.");

    const graph = handleSerializeGraph();
    if (!graph || graph.nodes.length === 0) {
       alert("Graph is empty or invalid.");
       return;
    }

    // --- Backend Payload Preparation ---
    // The core idea now is that the `graphJson` itself contains all necessary info
    // within each node's data property. The backend will need to interpret this.

    // Example validation (optional but good practice): Check for an input node
    const inputNode = graph.nodes.find(node => node.type === 'customInput') as Node<InputNodeData> | undefined;
     if (!inputNode?.data?.query) {
       alert("Please provide a query in an Input Node.");
       return;
     }

    // We no longer extract global API keys or actions here.
    // The backend needs to look inside each LLMNode/ComposioNode/AgentNode's data.

    setIsAgentRunning(true);
    setRunResults(null);

    try {
      console.log("Sending graph to /api/agent:", graph);
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send only the graph structure. The backend must extract keys/prompts/tools
        // from the node data within the graphJson as it processes each node.
        body: JSON.stringify({
          graphJson: graph,
        }),
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || `API request failed: ${response.status}`);
      }
      console.log("Received response from /api/agent:", responseData);
      setRunResults({ type: 'success', data: responseData });
    } catch (error: any) {
      console.error("Error running agent from builder:", error);
      setRunResults({ type: 'error', message: error.message });
    } finally {
      setIsAgentRunning(false);
    }
  };

  // Advanced: ReactFlow onNodeDrag/onNodeDragStop handlers
  const onNodeDrag: NodeDragHandler = useCallback((event, node) => {
    setDraggedNodeId(node.id);
    setDraggedNodePos(node.positionAbsolute || node.position);
    // Use mouse position for dustbin overlap
    if (dustbinRef.current && event && 'clientX' in event && 'clientY' in event) {
      const dustbinRect = dustbinRef.current.getBoundingClientRect();
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      if (
        mouseX > dustbinRect.left &&
        mouseX < dustbinRect.right &&
        mouseY > dustbinRect.top &&
        mouseY < dustbinRect.bottom
      ) {
        setIsDustbinActive(true);
      } else {
        setIsDustbinActive(false);
      }
    }
  }, []);

  const onNodeDragStop: NodeDragHandler = useCallback((event, node) => {
    // Use mouse position for dustbin overlap
    let shouldDelete = false;
    if (dustbinRef.current && event && 'clientX' in event && 'clientY' in event) {
      const dustbinRect = dustbinRef.current.getBoundingClientRect();
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      if (
        mouseX > dustbinRect.left &&
        mouseX < dustbinRect.right &&
        mouseY > dustbinRect.top &&
        mouseY < dustbinRect.bottom
      ) {
        shouldDelete = true;
      }
    }
    setIsDustbinActive(false);
    setDraggedNodeId(null);
    setDraggedNodePos(null);
    if (shouldDelete) {
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
    }
  }, [setNodes]);

  // Edge click handler
  const onEdgeClick = useCallback((event: any, edge: any) => {
    event.stopPropagation();
    setSelectedEdgeId(prevId => prevId === edge.id ? null : edge.id);
  }, []);

  // Add click handler to clear selection when clicking canvas
  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  // Track selected nodes
  const onSelectionChange = useCallback(({ nodes: selected }: { nodes: Node[] }) => {
    setSelectedNodes(selected);
  }, []);

  // Copy selected nodes to clipboard
  useEffect(() => {
    const handleCopy = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedNodes.length > 0) {
          setClipboardNodes(selectedNodes.map(n => ({ ...n })));
        }
      }
    };
    window.addEventListener('keydown', handleCopy);
    return () => window.removeEventListener('keydown', handleCopy);
  }, [selectedNodes]);

  // Paste nodes from clipboard
  useEffect(() => {
    const handlePaste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboardNodes && clipboardNodes.length > 0) {
          const offset = 40;
          const newNodes = clipboardNodes.map((node) => {
            const newId = getUniqueNodeId(node.type || 'node');
            return {
              ...node,
              id: newId,
              position: {
                x: (node.position?.x || 0) + offset,
                y: (node.position?.y || 0) + offset,
              },
              selected: false,
              data: { ...node.data },
            };
          });
          setNodes((nds) => nds.concat(newNodes));
        }
      }
    };
    window.addEventListener('keydown', handlePaste);
    return () => window.removeEventListener('keydown', handlePaste);
  }, [clipboardNodes, setNodes]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ 
      background: '#000000',
      color: '#fff5f5',
      backdropFilter: 'blur(10px)',
    }}>
      {/* Top Bar */}
      <header className="h-16 flex items-center justify-between px-6 shrink-0" style={{ 
        background: 'rgba(0, 0, 0, 0.7)',
        borderBottom: '1px solid rgba(255, 245, 245, 0.2)',
        backdropFilter: 'blur(10px)',
      }}>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            className="p-1.5 rounded-md transition-all duration-200 hover:bg-[#fff5f5]/20 hover:scale-105"
            style={{
              background: 'rgba(255, 245, 245, 0.1)',
              color: '#fff5f5',
              backdropFilter: 'blur(5px)',
            }}
            title={isLeftSidebarOpen ? "Close Left Sidebar" : "Open Left Sidebar"}
          >
            {isLeftSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>
          <h1 className="text-xl font-semibold text-[#fff5f5] ml-2">AI Agent Builder</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Share Button */}
          <button 
            onClick={handleShareWorkflow}
            className="px-3 py-1.5 text-sm rounded-md transition-all duration-200 flex items-center gap-1.5 hover:bg-[#fff5f5]/20 hover:scale-105"
            style={{
              background: 'rgba(255, 245, 245, 0.1)',
              color: '#fff5f5',
              backdropFilter: 'blur(5px)',
            }}
            title="Download current workflow as JSON"
          >
            <Share2 size={16} /> Share
          </button>
          {/* Upload Button - Triggers hidden input */}
          <button 
            onClick={handleUploadClick}
            className="px-3 py-1.5 text-sm rounded-md transition-all duration-200 flex items-center gap-1.5 hover:bg-[#fff5f5]/20 hover:scale-105"
            style={{
              background: 'rgba(255, 245, 245, 0.1)',
              color: '#fff5f5',
              backdropFilter: 'blur(5px)',
            }}
            title="Load workflow from JSON file"
          >
            <Upload size={16} /> Upload
          </button>
          {/* Hidden file input */}
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            style={{ display: 'none' }} 
          />
          <button className="px-3 py-1.5 text-sm rounded-md transition-all duration-200 hover:bg-[#fff5f5]/20 hover:scale-105" style={{
            background: 'rgba(255, 245, 245, 0.1)',
            color: '#fff5f5',
            backdropFilter: 'blur(5px)',
          }}>Add Interface</button>
          <button 
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            className="p-1.5 rounded-md ml-2 transition-all duration-200 hover:bg-[#fff5f5]/20 hover:scale-105"
            style={{
              background: 'rgba(255, 245, 245, 0.1)',
              color: '#fff5f5',
              backdropFilter: 'blur(5px)',
            }}
            title={isRightSidebarOpen ? "Close Right Sidebar" : "Open Right Sidebar"}
          >
            {isRightSidebarOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
          </button>
        </div>
      </header>

      <div className="flex flex-grow min-h-0">
        {/* Left Sidebar */}
        <aside 
            className={`flex flex-col shrink-0 overflow-y-auto transition-all duration-300 ease-in-out 
                       ${isLeftSidebarOpen ? 'w-72 p-4' : 'w-0 p-0 overflow-hidden'}`}
            style={{ 
              background: 'rgba(0, 0, 0, 0.7)',
              borderRight: '1px solid rgba(255, 245, 245, 0.2)',
              backdropFilter: 'blur(10px)',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 245, 245, 0.3) transparent'
            }}
        >
          {isLeftSidebarOpen && (
            <>
              <div className="sticky top-0 z-20 pb-2 mb-3 flex items-center gap-2" style={{ 
                borderBottom: '1px solid rgba(255, 245, 245, 0.2)',
                background: 'rgba(0, 0, 0, 0.7)',
              }}>
                <span className="text-xl font-bold text-[#fff5f5] tracking-tight">Node Library</span>
              </div>
              <div className="flex flex-col gap-4 flex-grow overflow-y-auto" style={{
                  paddingBottom: '1rem', 
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255, 245, 245, 0.3) transparent' 
              }}>
                {sidebarNodeTypes.map(({ type, label, icon, defaultData }) => (
                  <div
                    key={type}
                    onDragStart={(event) => onDragStart(event, type, label, defaultData)}
                    draggable
                    className="group relative p-4 rounded-xl cursor-grab active:scale-[0.97] transition-all duration-200"
                    style={{ 
                      background: 'rgba(255, 245, 245, 0.1)',
                      backdropFilter: 'blur(5px)',
                      border: '1px solid rgba(255, 245, 245, 0.2)',
                    }}
                  >
                    <div className="flex flex-col items-center text-center gap-2">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-1" style={{
                        background: 'rgba(255, 245, 245, 0.15)',
                        backdropFilter: 'blur(5px)',
                      }}>
                        {icon}
                      </div>
                      <span className="text-sm font-medium text-[#fff5f5]">{label}</span>
                      <div className="text-xs text-[#fff5f5]/70 mt-1">
                        {type === 'customInput' && 'Start your flow with user input'}
                        {type === 'llm' && 'Process with AI language model'}
                        {type === 'composio' && 'Execute specific actions'}
                        {type === 'customOutput' && 'Display final results'}
                        {type === 'agent' && 'LLM agent with tool access'}
                  </div>
                </div>
                    <div 
                      className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        background: 'rgba(255, 245, 245, 0.05)',
                        border: '1px solid rgba(255, 245, 245, 0.3)',
                        backdropFilter: 'blur(5px)',
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* React Flow Canvas */}
        <main className="flex-grow h-full relative" onDrop={onDrop} onDragOver={onDragOver}>
          <Squares className="absolute inset-0 z-0" />
          <ReactFlow
            nodes={nodes}
            edges={edges.map(edge =>
              edge.id === selectedEdgeId
                ? {
                    ...edge,
                    style: {
                      ...(edge.style || {}),
                      stroke: '#fff5f5',
                      strokeWidth: 3,
                      filter: 'drop-shadow(0 0 8px rgba(255, 245, 245, 0.5))'
                    },
                    markerEnd: {
                      type: MarkerType.ArrowClosed,
                      color: '#fff5f5',
                      width: 15,
                      height: 15,
                    }
                  }
                : edge
            )}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            nodeTypes={nodeTypes}
            fitView
            style={{ background: 'transparent' }}
            className="relative z-10"
            defaultEdgeOptions={{
              style: { stroke: 'rgba(255, 245, 245, 0.6)', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(255, 245, 245, 0.6)', width: 15, height: 15 },
              type: 'default',
            }}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onSelectionChange={onSelectionChange}
          >
            <Controls />
          </ReactFlow>
          {/* Dustbin */}
          <div
            ref={dustbinRef}
            className="fixed bottom-6 right-6 z-0 flex items-center justify-center w-16 h-16 rounded-full shadow-lg transition-all duration-200"
            style={{ 
              background: isDustbinActive ? 'rgba(255, 245, 245, 0.2)' : 'rgba(0, 0, 0, 0.5)',
              border: `2px solid ${isDustbinActive ? 'rgba(255, 245, 245, 0.8)' : 'rgba(255, 245, 245, 0.2)'}`,
              color: '#fff5f5',
              backdropFilter: 'blur(5px)',
              cursor: 'pointer'
            }}
            title="Drag nodes here to delete"
          >
            <Trash2 size={32} />
                  </div>
        </main>

        {/* Right Sidebar */}
        <aside 
          className={`flex flex-col shrink-0 overflow-y-auto transition-all duration-300 ease-in-out 
                     ${isRightSidebarOpen ? 'w-80 p-4' : 'w-0 p-0 overflow-hidden'}`}
          style={{ 
            background: 'rgba(0, 0, 0, 0.7)',
            borderLeft: '1px solid rgba(255, 245, 245, 0.2)',
            backdropFilter: 'blur(10px)',
          }}>
          {isRightSidebarOpen && (
            <>
              <h3 className="text-lg font-semibold mb-4 pb-2 text-[#fff5f5] sticky top-0 z-10 bg-[rgba(0,0,0,0.7)] backdrop-blur-sm" 
                  style={{ borderBottom: '1px solid rgba(255, 245, 245, 0.2)' }}>Run & Results</h3>
              <button 
                onClick={handleRunAgentFromBuilder}
                disabled={isAgentRunning}
                className="w-full p-2.5 text-sm font-medium flex items-center justify-center gap-2 rounded-md disabled:opacity-50 transition-all duration-200 mb-4"
                style={{ 
                  background: 'rgba(255, 245, 245, 0.1)',
                  color: '#fff5f5',
                  backdropFilter: 'blur(5px)',
                }}
              >
                {isAgentRunning ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin mr-2" style={{ borderColor: '#fff5f5 transparent #fff5f5 #fff5f5' }} />
                    Running Agent...
                  </>
                ) : "Run Agent from Flow"}
              </button>
              {runResults && (
                <div className="flex-grow overflow-y-auto text-sm" 
                     style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(255, 245, 245, 0.3) transparent'
                     }}>
                  <div className="prose prose-invert prose-sm max-w-none p-3 rounded-md bg-[rgba(0,0,0,0.5)] border border-[rgba(255,245,245,0.2)] mb-4"
                      style={{ backdropFilter: 'blur(5px)' }}>
                      
                    <h4 className="font-semibold !mb-2 !text-[#fff5f5]">
                      {runResults.type === 'success' ? 'Agent Output:' : 'Error:'}
                    </h4>
                    {runResults.type === 'success' ? (
                      <ReactMarkdown>{runResults.data.response || 'No textual response.'}</ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{runResults.message}</p>
                    )}
                  </div>

                  {runResults.type === 'success' && runResults.data.steps && runResults.data.steps.length > 0 && (
                    <div className="prose prose-invert prose-sm max-w-none p-3 rounded-md bg-[rgba(0,0,0,0.4)] border border-[rgba(255,245,245,0.15)]"
                         style={{ backdropFilter: 'blur(5px)', maxHeight: '200px', overflowY: 'auto' }}> 
                      <h5 className="font-semibold !mt-0 !mb-2 !text-[#fff5f5]">
                        Execution Steps:
                      </h5>
                      <ul className="list-disc list-inside space-y-0.5 !mt-0 !text-xs !text-[#fff5f5]/90">
                        {(runResults.data.steps || []).map((step: string, i: number) => (
                          <li key={i} className="!mb-0.5 break-words">{step}</li> 
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

// initialEdges remains the same if it's just an empty array
const initialEdges: Edge[] = [];

export default Page; // Renamed export
