import { useEffect, useState } from "react";
import { closeThisWindow } from "../windows";
import { readTodoAlert, writeTodoAlert, type TodoAlert } from "../scratch";

export function TodoAlertPane() {
  const [alert, setAlert] = useState<TodoAlert | null>(() => readTodoAlert());

  useEffect(() => {
    const sync = () => setAlert(readTodoAlert());
    window.addEventListener("storage", sync);
    window.addEventListener("sv-todo-alert", sync);
    const id = window.setInterval(sync, 800);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("sv-todo-alert", sync);
      window.clearInterval(id);
    };
  }, []);

  const due = alert?.dueAt
    ? new Date(alert.dueAt).toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : "";

  const dismiss = () => {
    writeTodoAlert(null);
    void closeThisWindow();
  };

  return (
    <div className="pane-window alert-pane">
      <p className="alert-kicker">Todo reminder</p>
      <h1>{alert?.title || "A todo is due"}</h1>
      {due ? <p className="muted">{due}</p> : null}
      <div className="pane-actions">
        <button type="button" className="primary" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
