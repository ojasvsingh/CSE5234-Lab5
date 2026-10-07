export default function FormField({ name, label, error, hint, optional = false, children, ...props }) {
  const descriptions = [error && `${name}-error`, hint && `${name}-hint`].filter(Boolean).join(' ');
  const inputProps = {
    id: name, name, 'aria-invalid': error ? true : undefined,
    'aria-describedby': descriptions || undefined,
    required: !optional, ...props,
  };
  return (
    <div className={`form-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={name}>{label}{optional && <span> (optional)</span>}</label>
      {children ? <select {...inputProps}>{children}</select> : <input {...inputProps} />}
      {hint && <p id={`${name}-hint`} className="field-hint">{hint}</p>}
      {error && <p id={`${name}-error`} className="field-error">{error}</p>}
    </div>
  );
}
