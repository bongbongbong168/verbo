import { useState } from "react";

/**
 * The class code, with one-tap copy.
 *
 * Shown in a monospace face and spaced out, because this is read ALOUD across a
 * room as often as it is copied — the characters have to be told apart at a
 * glance. (The generator already drops O/0 and I/1/L for the same reason.)
 */
export default function JoinCode({ code, open = true, block = false }) {
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      // Reverts on a timer, not on blur — blur never fires if focus never
      // landed on the button.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing useful to say; the code is on screen to be typed either way.
    }
  }

  return (
    <div className={`jc${block ? " jc-block" : ""}`}>
      <span className="jc-label">Class code</span>
      <code className="jc-code">{code}</code>
      <button type="button" className="jc-copy" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      {!open && <span className="jc-closed">Closed</span>}
    </div>
  );
}
