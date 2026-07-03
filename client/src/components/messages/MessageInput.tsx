import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface MessageInputHandle {
  focus: () => void;
}

/**
 * MessageInput — поле ввода сообщения на `contenteditable`, а не `<textarea>`.
 * Причина: iOS Safari/WebView показывает над клавиатурой системную панель формы
 * (стрелки ↑↓ «пред./след. поле» + «Готово») для `<input>`/`<textarea>`, и убрать
 * её веб-API нельзя. Для `contenteditable` эта панель не появляется (так делают веб-
 * версии мессенджеров). Ведёт себя как управляемое поле: значение приходит из React,
 * а DOM синхронизируем ТОЛЬКО при внешнем расхождении (очистка после отправки), иначе
 * во время набора каретка бы прыгала. Enter — отправка, Shift+Enter — перенос строки,
 * IME (композиция) не отправляет, вставка — как простой текст.
 */
export const MessageInput = forwardRef<MessageInputHandle, {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}>(function MessageInput({ value, onChange, onSubmit, placeholder = 'Сообщение…' }, ref) {
  const elRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  useImperativeHandle(ref, () => ({ focus: () => elRef.current?.focus() }), []);

  // Синхронизация состояние→DOM только когда они разошлись извне (например, поле
  // очистили после отправки). При наборе value === innerText → no-op, каретка цела.
  useEffect(() => {
    const el = elRef.current;
    if (el && el.innerText !== value) el.innerText = value;
  }, [value]);

  const emit = (): void => {
    const el = elRef.current;
    if (!el) return;
    // Пустой contenteditable часто держит служебный <br> → innerText '\n', хотя текста
    // нет. Пустоту определяем по textContent (он <br> игнорирует): тогда очистка даёт
    // '' (вернётся плейсхолдер, sync-эффект подчистит DOM), а НАБРАННЫЕ переносы строк
    // (Shift+Enter) сохраняются — берём innerText как есть, эффект их не затирает.
    onChange(el.textContent === '' ? '' : el.innerText);
  };

  return (
    <div
      ref={elRef}
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-empty={value.length === 0 ? 'true' : 'false'}
      enterKeyHint="send"
      className="dm-input dm-editable"
      onInput={emit}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
        emit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
          e.preventDefault();
          onSubmit();
        }
      }}
      onPaste={(e) => {
        // Вставляем как простой текст (без чужого форматирования из буфера).
        e.preventDefault();
        const t = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, t);
      }}
      style={{
        flex: 1,
        maxHeight: 140,
        minHeight: 40,
        overflowY: 'auto',
        padding: '9px 16px',
        borderRadius: 20,
        border: '1px solid var(--line-2)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        color: 'var(--text-0)',
        fontSize: 15,
        fontFamily: 'inherit',
        lineHeight: 1.4,
        outline: 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        cursor: 'text',
      }}
    />
  );
});
