export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface AgentAction {
  tool: string;
  params: Record<string, any>;
  description: string;
}

export interface AgentResult {
  success: boolean;
  message: string;
  actions: AgentAction[];
}
