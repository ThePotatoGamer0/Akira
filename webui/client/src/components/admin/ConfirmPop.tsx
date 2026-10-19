import { useEffect } from "react";
import { createPortal } from "react-dom";

export function ConfirmPop(props: {
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !props.busy) props.onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.busy, props.onCancel]);

  return createPortal(
    <div className="confirm-pop" role="presentation">
      <div className="confirm-pop__backdrop" onClick={() => { if (!props.busy) props.onCancel(); }} />
      <div className="confirm-pop__card" role="dialog" aria-modal="true" aria-labelledby="confirm-pop-title">
        <h3 id="confirm-pop-title">{props.title}</h3>
        <p>{props.body}</p>
        <div className="confirm-pop__actions">
          <button type="button" className="danger" disabled={props.busy} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
          <button type="button" className="secondary" disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
