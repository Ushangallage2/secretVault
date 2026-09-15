import { useEffect, useState } from "react";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
import { closeThisWindow } from "../windows";
import { readScratch, writeScratch } from "../scratch";

export function ScratchPad() {
  const [text, setText] = useState(() => readScratch());
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setText(readScratch());
    window.addEventListener("storage", sync);
    window.addEventListener("sv-scratch", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("sv-scratch", sync);
    };
  }, []);

  const toast = (msg: string) => {
    setNote(msg);
    window.setTimeout(() => setNote(null), 1600);
  };

  const update = (next: string) => {
    setText(next);
    writeScratch(next);
  };

  const copyOut = async () => {
    if (!text.trim()) return;
    try {
      await writeText(text);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    toast("Copied — paste wherever you need");
  };

  const pasteIn = async () => {
    try {
      let clip = "";
      try {
        clip = await readText();
      } catch {
        clip = await navigator.clipboard.readText();
      }
      if (!clip) return;
      update(text.trim() ? `${text.trim()}\n\n${clip}` : clip);
      toast("Pasted into scratch");
    } catch {
      toast("Paste with ⌘V into the box");
    }
  };

  return (
    <div className="pane-window scratch-pane">
      <header>
        <strong>Scratch pad</strong>
        <span>Hold copied vault text here, then copy it out again.</span>
      </header>
      <textarea
        value={text}
        onChange={(e) => update(e.target.value)}
        placeholder="Paste from the vault, keep it here, copy when you need it…"
        spellCheck={false}
      />
      <div className="pane-actions">
        <button type="button" className="ghost" onClick={() => void pasteIn()}>
          Paste in
        </button>
        <button type="button" className="ghost" onClick={() => update("")}>
          Clear
        </button>
        <button type="button" className="primary" onClick={() => void copyOut()}>
          Copy out
        </button>
        <button type="button" className="subtle" onClick={() => void closeThisWindow()}>
          Close
        </button>
      </div>
      {note && <p className="pane-note">{note}</p>}
    </div>
  );
}
