"use client";

import * as React from "react";
import { Bot, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AgentBuilderProps {
  onSubmit?: (data: AgentBuilderFormData, close: () => void) => void;
}

interface AgentBuilderFormData {
  description: string;
  llmApiKey: string;
  composioApiKey: string;
}

const AgentBuilder: React.FC<AgentBuilderProps> = ({ onSubmit }) => {
  const [formData, setFormData] = React.useState<AgentBuilderFormData>({
    description: "",
    llmApiKey: "",
    composioApiKey: "",
  });
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (onSubmit) {
      await onSubmit(formData, () => setOpen(false));
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="px-6 py-3 h-[48px] text-base font-medium rounded-lg shadow-md transition-all duration-200 flex items-center justify-center gap-2 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed border border-slate-300 hover:shadow-lg">
          <Wand2 className="h-4 w-4" />
          Agent Builder
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
            <DialogDescription>
              Describe your agent and provide API keys to automatically generate a flow.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="description">Agent Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe what you want your agent to do..."
                className="min-h-[100px]"
                value={formData.description}
                onChange={handleChange}
                required
              />
              <p className="text-xs text-muted-foreground">
                Example: "A customer service agent that can answer questions about our products and handle returns."
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="llmApiKey">LLM API Key</Label>
              <Input
                id="llmApiKey"
                name="llmApiKey"
                type="password"
                placeholder="sk-..."
                value={formData.llmApiKey}
                onChange={handleChange}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="composioApiKey">Composio API Key</Label>
              <Input
                id="composioApiKey"
                name="composioApiKey"
                type="password"
                placeholder="composio-..."
                value={formData.composioApiKey}
                onChange={handleChange}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" className="gap-2" disabled={loading}>
              {loading ? (
                <svg className="animate-spin h-4 w-4 text-slate-700" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              ) : (
                <Bot className="h-4 w-4" />
              )}
              {loading ? "Generating..." : "Generate Agent Flow"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AgentBuilder; 