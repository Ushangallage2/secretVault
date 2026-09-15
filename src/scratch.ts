export const SCRATCH_KEY = "secret-vault-scratch";
export const TODO_ALERT_KEY = "secret-vault-todo-alert";
export const TODO_FIRED_PREFIX = "secret-vault-todo-fired:";

export function readScratch(): string {
  return localStorage.getItem(SCRATCH_KEY) ?? "";
}

export function writeScratch(text: string) {
  localStorage.setItem(SCRATCH_KEY, text);
  window.dispatchEvent(new Event("sv-scratch"));
}

export function holdInScratch(text: string) {
  const prev = readScratch().trim();
  writeScratch(prev ? `${prev}\n\n${text}` : text);
}

export type TodoAlert = { id: string; title: string; dueAt: string };

export function readTodoAlert(): TodoAlert | null {
  try {
    const raw = localStorage.getItem(TODO_ALERT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TodoAlert;
    if (!parsed?.id || !parsed.title) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTodoAlert(alert: TodoAlert | null) {
  if (!alert) localStorage.removeItem(TODO_ALERT_KEY);
  else localStorage.setItem(TODO_ALERT_KEY, JSON.stringify(alert));
  window.dispatchEvent(new Event("sv-todo-alert"));
}

export function todoFiredKey(id: string, dueAt: string) {
  return `${TODO_FIRED_PREFIX}${id}:${dueAt}`;
}
