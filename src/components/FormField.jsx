export default function FormField({ name, id = name, label, error, hint, optional = false, multiline = false, children, ...props }) {
  const descriptions = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  const inputProps = {
    id, name, 'aria-invalid': error ? true : undefined,
    'aria-describedby': descriptions || undefined,
    required: !optional, ...props,
  };
  return (
    <div className={`form-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}{optional && <span> (optional)</span>}</label>
      {children ? <select {...inputProps}>{children}</select> : multiline ? <textarea {...inputProps} /> : <input {...inputProps} />}
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  );
}
