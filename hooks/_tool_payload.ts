export function extractToolName(payload: any): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return '';
  }
  for (const key of ['tool_name', 'toolName', 'name']) {
    const value = payload[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return '';
}

export function extractFilePath(payload: any): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return '';
  }
  const toolInput = payload.tool_input;
  if (toolInput && typeof toolInput === 'object' && !Array.isArray(toolInput)) {
    for (const key of ['file_path', 'filePath', 'path', 'notebook_path', 'notebookPath']) {
      const value = toolInput[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  for (const key of ['file_path', 'filePath', 'path']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}
