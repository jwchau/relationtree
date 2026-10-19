/** The newline-delimited JSON events POST /api/ask streams (see ask_api.py). */
export type AskEvent =
  | { tool: string }
  | { text: string }
  | { error: string }
  | { people: { id: string; name: string }[] };

export interface Answer {
  /** What the AI is looking up right now; cleared once it starts writing. */
  progress: string | null;
  text: string;
  people: { id: string; name: string }[];
  error: string | null;
  done: boolean;
}

export const initialAnswer: Answer = { progress: null, text: '', people: [], error: null, done: false };

/** Splits streamed text into complete lines; a line cut across chunks waits for the rest. */
export function createLineSplitter() {
  let buffer = '';
  return (chunk: string): string[] => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    return lines.filter((line) => line.trim() !== '');
  };
}

export function applyAskEvent(answer: Answer, event: AskEvent): Answer {
  if ('tool' in event) return { ...answer, progress: event.tool };
  if ('text' in event) return { ...answer, progress: null, text: answer.text + event.text };
  if ('error' in event) return { ...answer, progress: null, error: event.error, done: true };
  return { ...answer, progress: null, people: event.people, done: true };
}
