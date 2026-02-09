export interface IMMessage {
  session_id?: string;
  user_id: string;
  message: string;
  callback_url: string;
  metadata?: Record<string, any>;
}

export interface IMResponse {
  session_id: string;
  response_text: string;
  tool_calls?: any[];
  status: "success" | "error";
  error?: string;
}
