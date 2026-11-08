import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, X, XCircle } from "lucide-react";
import { ACCOUNT_STATUS, ITEM_STATUS, PAYMENT_STATUS } from "../lib/format.js";

// ------------------------------------------------------------------ feedback: toasts e confirmações

const FeedbackContext = createContext(null);
export const useFeedback = () => useContext(FeedbackContext);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const dismiss = useCallback(id => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const push = useCallback((tone, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(current => [...current.slice(-3), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
  }, [dismiss]);

  const toast = useRef({ success: m => push("success", m), error: m => push("error", m), info: m => push("info", m) });
  toast.current = { success: m => push("success", m), error: m => push("error", m), info: m => push("info", m) };

  const confirm = useCallback(options => new Promise(resolve => setDialog({ ...options, resolve })), []);
  const closeDialog = value => { dialog.resolve(value); setDialog(null); };

  return (
    <FeedbackContext.Provider value={{ toast: toast.current, confirm }}>
      {children}
      <div className="toasts" role="region" aria-label="Notificações" aria-live="polite">
        {toasts.map(item => (
          <div key={item.id} className={`toast toast-${item.tone}`} role={item.tone === "error" ? "alert" : "status"}>
            {item.tone === "success" ? <CheckCircle2 size={18} /> : item.tone === "error" ? <XCircle size={18} /> : <Info size={18} />}
            <span>{item.message}</span>
            <button className="icon-btn" aria-label="Fechar aviso" onClick={() => dismiss(item.id)}><X size={16} /></button>
          </div>
        ))}
      </div>
      {dialog && <ConfirmDialog {...dialog} onClose={closeDialog} />}
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirmar", danger, reasonLabel, reasonRequired, onClose }) {
  const [reason, setReason] = useState("");
  const id = useId();
  const invalid = reasonLabel && reasonRequired && reason.trim().length < 3;
  return (
    <Modal title={title} onClose={() => onClose(null)} size="sm">
      <form onSubmit={event => { event.preventDefault(); if (!invalid) onClose(reasonLabel ? { reason: reason.trim() } : {}); }}>
        {message && <p className="muted">{message}</p>}
        {reasonLabel && (
          <Field label={reasonLabel} htmlFor={id}>
            <textarea id={id} rows="2" value={reason} onChange={event => setReason(event.target.value)} autoFocus maxLength={255} required={reasonRequired} />
          </Field>
        )}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={() => onClose(null)}>Cancelar</Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} disabled={invalid}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ blocos básicos

export function Button({ variant = "secondary", size, loading, icon: Icon, children, className = "", ...props }) {
  return (
    <button className={`btn btn-${variant} ${size ? `btn-${size}` : ""} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, htmlFor, hint, children, wide }) {
  return (
    <div className={`field ${wide ? "field-wide" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </div>
  );
}

export function Badge({ tone = "muted", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const AccountBadge = ({ status }) => <Badge tone={ACCOUNT_STATUS[status]?.tone}>{ACCOUNT_STATUS[status]?.label || status}</Badge>;
export const ItemBadge = ({ status }) => <Badge tone={ITEM_STATUS[status]?.tone}>{ITEM_STATUS[status]?.label || status}</Badge>;
export const PaymentBadge = ({ status }) => <Badge tone={PAYMENT_STATUS[status]?.tone}>{PAYMENT_STATUS[status]?.label || status}</Badge>;

export function Spinner({ label = "Carregando..." }) {
  return <div className="state" role="status"><Loader2 className="spin" size={22} aria-hidden="true" /><span>{label}</span></div>;
}

export function EmptyState({ icon: Icon = Info, title, children, action }) {
  return (
    <div className="state empty">
      <Icon size={30} aria-hidden="true" />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state error-state" role="alert">
      <AlertTriangle size={26} aria-hidden="true" />
      <strong>Não foi possível carregar</strong>
      <p>{message}</p>
      {onRetry && <Button onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone, icon: Icon }) {
  return (
    <div className={`stat-card ${tone ? `stat-${tone}` : ""}`}>
      <div className="stat-top"><span>{label}</span>{Icon && <Icon size={18} aria-hidden="true" />}</div>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Panel({ title, subtitle, actions, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <div>{title && <h2>{title}</h2>}{subtitle && <p className="muted">{subtitle}</p>}</div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pagination({ page, pageSize, count, onChange }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return count ? <div className="pagination"><span className="muted">{count} {count === 1 ? "registro" : "registros"}</span></div> : null;
  return (
    <nav className="pagination" aria-label="Paginação">
      <span className="muted">{count} registros</span>
      <div>
        <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior" />
        <span className="page-indicator">Página {page} de {pages}</span>
        <Button size="sm" variant="ghost" icon={ChevronRight} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página" />
      </div>
    </nav>
  );
}

// ------------------------------------------------------------------ modal acessível

export function Modal({ title, children, onClose, size = "md", footer }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const onKey = event => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && ref.current) {
        const focusable = ref.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        const list = [...focusable].filter(element => !element.disabled);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    ref.current?.querySelector("[autofocus], input, textarea, select")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("no-scroll"); previous?.focus?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ gráfico simples (SVG)

export function BarChart({ data, series, height = 180 }) {
  if (!data.length) return <EmptyState title="Sem movimentação no período" />;
  const max = Math.max(1, ...data.flatMap(entry => series.map(item => entry[item.key])));
  const width = Math.max(640, data.length * 40);
  const barWidth = Math.min(18, (width / data.length - 8) / series.length);
  const label = entry => `${entry.label}: ${series.map(item => `${item.name} ${Number(entry[item.key]).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join(" · ")}`;
  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${height + 26}`} style={{ minWidth: data.length * 30 }} role="img" aria-label="Recebido e consumido por dia">
        {[0.25, 0.5, 0.75, 1].map(step => <line key={step} x1="0" x2={width} y1={height - height * step} y2={height - height * step} className="chart-grid" />)}
        {data.map((entry, index) => {
          const x = index * (width / data.length) + (width / data.length - barWidth * series.length) / 2;
          return (
            <g key={entry.label}>
              <title>{label(entry)}</title>
              {series.map((item, position) => {
                const h = Math.max(entry[item.key] > 0 ? 2 : 0, (entry[item.key] / max) * (height - 6));
                return <rect key={item.key} x={x + position * barWidth} y={height - h} width={barWidth - 1} height={h} rx="2" className={`chart-bar ${item.className}`} />;
              })}
              {(data.length <= 12 || index % Math.ceil(data.length / 10) === 0) && <text x={x + (barWidth * series.length) / 2} y={height + 16} textAnchor="middle" className="chart-label">{entry.label}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legend">{series.map(item => <span key={item.key}><i className={`dot ${item.className}`} />{item.name}</span>)}</div>
    </div>
  );
}

const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18a9 9 0 0 0-18 0z"/><path d="M4 15h16"/><path d="M5 19h14"/></svg>');

/** Foto de produto com imagem alternativa caso o link esteja quebrado. */
export function ProductImage({ src, alt = "", ...props }) {
  const [failed, setFailed] = useState(false);
  return <img src={failed ? PLACEHOLDER : src} alt={alt} className={failed ? "img-fallback" : undefined} onError={() => setFailed(true)} {...props} />;
}
