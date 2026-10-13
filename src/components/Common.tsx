import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = "",
  error = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => {
      ref.current?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={(wide ? "modal wide" : "modal") + " " + className}
      aria-labelledby={titleId}
      onCancel={onClose}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="icon" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </header>
      <div className="modal-body">
        <ErrorText text={error} />
        {children}
      </div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Portrait({
  name,
  src,
  color,
  className = "",
}: {
  name: string;
  src?: string;
  color?: string;
  className?: string;
}) {
  return src ? (
    <img className={"portrait " + className} src={src} alt={name} />
  ) : (
    <span
      className={"portrait placeholder " + className}
      style={{ background: color || "#47675d" }}
    >
      {name.slice(0, 1)}
    </span>
  );
}
export function ErrorText({ text }: { text: string }) {
  return text ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
