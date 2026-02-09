import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { bashTool } from "./bash.js";
import type { AgentTool } from "../agent/types.js";

export const DEFAULT_TOOLS: AgentTool[] = [
  readTool,
  writeTool,
  bashTool,
];

export { readTool, writeTool, bashTool };
