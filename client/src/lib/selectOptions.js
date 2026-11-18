import { Children, Fragment, isValidElement } from 'react';

/** Plain text of React children (strings, numbers, nested arrays/elements). */
export function childrenToText(children) {
  let out = '';
  Children.forEach(children, (c) => {
    if (c === null || c === undefined || typeof c === 'boolean') return;
    if (typeof c === 'string' || typeof c === 'number') out += String(c);
    else if (isValidElement(c)) out += childrenToText(c.props.children);
  });
  return out;
}

/**
 * Turn native <option> children (including mapped arrays and fragments) into
 * [{ value, label, disabled }]. Values are strings, like a native <select>.
 */
export function flattenOptions(children) {
  const out = [];
  const walk = (nodes) =>
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === Fragment) return walk(child.props.children);
      if (child.type === 'option') {
        const { value, children: label, disabled } = child.props;
        const text = childrenToText(label);
        out.push({ value: value === undefined ? text : String(value), label: text, disabled: Boolean(disabled) });
      }
    });
  walk(children);
  return out;
}

/** Native-like change event so existing `e.target.value` handlers keep working. */
export const changeEvent = (value, name, type = 'select-one') => ({ target: { value, name, type }, currentTarget: { value, name } });

/** Callers pass width utilities (e.g. "sm:w-48"); default to full width when no base width is given. */
export const widthClass = (className = '') => (/(^|\s)w-/.test(className) ? '' : 'w-full');
