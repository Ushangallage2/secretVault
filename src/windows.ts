async function tauriWindow() {
  try {
    return await import("@tauri-apps/api/webviewWindow");
  } catch {
    return null;
  }
}

async function openOrFocus(label: string, opts: {
  url: string;
  title: string;
  width: number;
  height: number;
}) {
  const api = await tauriWindow();
  if (!api) {
    window.open(opts.url, label, `width=${opts.width},height=${opts.height}`);
    return;
  }
  const existing = await api.WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }
  const win = new api.WebviewWindow(label, {
    url: opts.url,
    title: opts.title,
    width: opts.width,
    height: opts.height,
    minWidth: 260,
    minHeight: 160,
    resizable: true,
    alwaysOnTop: true,
    decorations: true,
    transparent: false,
    visible: true,
    focus: true,
  });
  await new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (event) => {
      const payload = (event as { payload?: unknown }).payload;
      reject(new Error(typeof payload === "string" ? payload : "Could not open window"));
    });
  });
}

export function openScratchPad() {
  return openOrFocus("scratch", {
    url: "index.html?pane=scratch",
    title: "Scratch pad",
    width: 400,
    height: 340,
  });
}

export function openTodoAlert() {
  return openOrFocus("todo-alert", {
    url: "index.html?pane=alert",
    title: "Todo reminder",
    width: 360,
    height: 190,
  });
}

export async function closeThisWindow() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } catch {
    window.close();
  }
}
