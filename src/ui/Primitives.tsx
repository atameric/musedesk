import React from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icons';

export function IconButton({ icon, label, className = '', ...props }: {
  icon: IconName; label: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={'btn icon ' + className} title={label} aria-label={label} {...props}><Icon name={icon} /></button>;
}

export interface MenuOption {
  value: string;
  label: string;
  description?: string;
  icon?: IconName;
  disabled?: boolean;
  danger?: boolean;
}

export function Dropdown({ label, options, value, onChange, disabled, className = '', children, select = false }: {
  label: string; options: MenuOption[]; value?: string; onChange: (value: string) => void;
  disabled?: boolean; className?: string; children?: React.ReactNode; select?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [position, setPosition] = React.useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 230, maxHeight: 320 });
  const trigger = React.useRef<HTMLButtonElement>(null);
  const menu = React.useRef<HTMLDivElement>(null);
  const anchorRect = React.useRef({ top: 0, left: 0 });
  const id = React.useId();
  const search = React.useRef({ text: '', time: 0 });
  const optionsRef = React.useRef(options); optionsRef.current = options;
  const close = React.useCallback((restore = true) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }, []);
  React.useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  React.useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    anchorRect.current = { top: r.top, left: r.left };
    const width = Math.min(Math.max(230, r.width), window.innerWidth - 24);
    const above = window.innerHeight - r.bottom < 260 && r.top > 260;
    const maxHeight = Math.min(340, above ? r.top - 20 : window.innerHeight - r.bottom - 20);
    setPosition({
      top: above ? undefined : r.bottom + 6, bottom: above ? window.innerHeight - r.top + 6 : undefined,
      left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)), width, maxHeight,
    });
    const active = Math.max(0, optionsRef.current.findIndex((o) => !o.disabled && o.value === value));
    setIndex(active);
    const timer = requestAnimationFrame(() => menu.current?.focus());
    return () => cancelAnimationFrame(timer);
  }, [open, options.length, value]);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close(false);
    };
    const onResize = () => close(false);
    const onScroll = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (rect && (Math.abs(rect.top - anchorRect.current.top) > 1 || Math.abs(rect.left - anchorRect.current.left) > 1)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);
  React.useEffect(() => {
    if (open) document.getElementById(id + '-' + index)?.scrollIntoView({ block: 'nearest' });
  }, [index, open, id]);
  const choose = (option: MenuOption) => { if (!option.disabled) { close(); onChange(option.value); } };
  const move = (direction: number) => {
    for (let n = 1; n <= options.length; n++) {
      const next = (index + direction * n + options.length) % options.length;
      if (!options[next]?.disabled) { setIndex(next); break; }
    }
  };
  return <>
    <button type="button" ref={trigger} className={className} aria-label={label} title={label}
      aria-haspopup={select ? 'listbox' : 'menu'} aria-expanded={open} aria-controls={open ? id : undefined}
      disabled={disabled} onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
      }}>
      {children ?? options.find((o) => o.value === value)?.label ?? label}
      {select && <Icon name="down" size={14} />}
    </button>
    {open && createPortal(
      <div ref={menu} id={id} className="popup-menu" style={position} role={select ? 'listbox' : 'menu'}
        aria-label={label} tabIndex={0} aria-activedescendant={id + '-' + index}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) close(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
          else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            const enabled = options.map((o, i) => o.disabled ? -1 : i).filter((i) => i >= 0);
            setIndex((e.key === 'Home' ? enabled[0] : enabled[enabled.length - 1]) ?? 0);
          } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[index]) choose(options[index]); }
          else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
            const now = Date.now();
            search.current = { text: (now - search.current.time < 700 ? search.current.text : '') + e.key.toLowerCase(), time: now };
            const match = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(search.current.text));
            if (match >= 0) setIndex(match);
          }
        }}>
        <div className="popup-title">{label}</div>
        {options.length === 0 && <div className="side-note">No options available.</div>}
        {options.map((option, i) => <div key={option.value} id={id + '-' + i}
          role={select ? 'option' : 'menuitem'} aria-selected={select ? option.value === value : undefined}
          aria-disabled={option.disabled} className={'popup-option' + (i === index ? ' focused' : '') + (option.danger ? ' danger' : '')}
          onMouseMove={() => { if (!option.disabled) setIndex(i); }}
          onPointerDown={(e) => e.preventDefault()} onClick={() => choose(option)}>
          {option.icon && <Icon name={option.icon} />}
          <span className="popup-option-text"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>
          {select && option.value === value && <Icon name="check" size={16} />}
        </div>)}
      </div>, document.body)}
  </>;
}

export function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  const panel = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const timer = requestAnimationFrame(() => { const input = panel.current?.querySelector<HTMLInputElement>('.palette-input'); (input ?? panel.current)?.focus(); });
    const onKey = (e: KeyboardEvent) => {
      if (!panel.current || document.querySelector('.popup-menu')) return;
      if (e.key === 'Escape' && closeRef.current) { e.preventDefault(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const nodes = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"], a[href]')]
        .filter((n) => n.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { e.preventDefault(); panel.current.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(timer); document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return createPortal(<div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div className="dialog" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="dlg-head"><strong id={id}>{title}</strong>{onClose && <IconButton icon="close" label="Close dialog" onClick={onClose} />}</div>
      {children}
    </div>
  </div>, document.body);
}
