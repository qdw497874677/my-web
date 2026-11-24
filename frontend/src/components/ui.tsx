import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import styles from './ui.module.css'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`${styles.button} ${variant === 'secondary' ? styles.secondary : ''} ${variant === 'danger' ? styles.danger : ''} ${className}`} {...props} />
}

export function TextField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const generatedId = useId()
  const id = props.id ?? generatedId
  return <div className={styles.field}><label htmlFor={id}>{label}</label><input className={styles.input} {...props} id={id} /></div>
}

export function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const generatedId = useId()
  const id = props.id ?? generatedId
  return <div className={styles.field}><label htmlFor={id}>{label}</label><select className={styles.select} {...props} id={id}>{children}</select></div>
}

export function TextAreaField({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const generatedId=useId();const id=props.id??generatedId
  return <div className={styles.field}><label htmlFor={id}>{label}</label><textarea className={styles.input} {...props} id={id}/></div>
}

export function FilterChips({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return <div className={styles.chipList} aria-label={label}>{options.map((option) => <button className={styles.chip} type="button" aria-pressed={value === option} key={option} onClick={() => onChange(option)}>{option}</button>)}</div>
}

export function StatusPill({ status }: { status: 'published' | 'scheduled' | 'draft' | 'public' | 'private' }) {
  const labels = { published: '已发布', scheduled: '已排期', draft: '草稿', public: '公开', private: '私密' }
  return <span className={`${styles.badge} ${styles[status] ?? ''}`}>{labels[status]}</span>
}

export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    addEventListener('keydown', keydown)
    dialogRef.current?.focus()
    return () => removeEventListener('keydown', keydown)
  }, [onClose])
  return <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}><h2 id={titleId}>{title}</h2>{children}<div className={styles.dialogActions}>{actions}</div></section></div>
}
