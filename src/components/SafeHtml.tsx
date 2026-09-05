import React from 'react';

interface SafeHtmlProps {
  html: string;
  className?: string;
}

const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'A',
  'IMG',
  'BLOCKQUOTE',
  'SPAN',
  'DIV',
  'TABLE',
  'TR',
  'TD',
  'TH',
]);

const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title']);

function renderDomNode(node: Node, key: number): React.ReactNode {
  // 1. Text node
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  // 2. Element node
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tagName = el.tagName.toUpperCase();

    // Recursively render child nodes
    const children = Array.from(el.childNodes).map((child, index) =>
      renderDomNode(child, index)
    );

    // If tag is not in whitelist, unwrap children
    if (!ALLOWED_TAGS.has(tagName)) {
      return <React.Fragment key={key}>{children}</React.Fragment>;
    }

    // Build safe element props
    const props: Record<string, any> = { key };

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (ALLOWED_ATTRS.has(name)) {
        const val = attr.value;
        if (name === 'href' || name === 'src') {
          if (/^(https?:|data:image\/)/i.test(val)) {
            props[name] = val;
          }
        } else {
          props[name] = val;
        }
      }
    }

    // Specific tag enhancements
    const lowerTag = tagName.toLowerCase();

    if (tagName === 'A') {
      props.target = '_blank';
      props.rel = 'noreferrer';
      props.className = 'text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors';
    } else if (tagName === 'IMG') {
      props.className = 'max-w-full rounded-xl border border-zinc-800 my-2';
      props.loading = 'lazy';
      return React.createElement(lowerTag, props);
    } else if (tagName === 'BR') {
      return React.createElement(lowerTag, props);
    } else if (tagName === 'UL') {
      props.className = 'list-disc list-inside space-y-1 my-2 text-zinc-300';
    } else if (tagName === 'OL') {
      props.className = 'list-decimal list-inside space-y-1 my-2 text-zinc-300';
    } else if (tagName === 'BLOCKQUOTE') {
      props.className = 'border-l-2 border-cyan-500/60 pl-3 py-1 my-2 bg-zinc-900/50 italic text-zinc-400 rounded-r';
    } else if (tagName === 'H1') {
      props.className = 'text-lg font-bold text-zinc-100 mt-4 mb-2';
    } else if (tagName === 'H2') {
      props.className = 'text-base font-bold text-zinc-200 mt-3 mb-1.5';
    } else if (tagName === 'H3' || tagName === 'H4') {
      props.className = 'text-sm font-semibold text-zinc-300 mt-2 mb-1';
    } else if (tagName === 'P') {
      props.className = 'my-1.5 leading-relaxed text-zinc-300';
    }

    return React.createElement(lowerTag, props, children.length > 0 ? children : undefined);
  }

  return null;
}

export const SafeHtml: React.FC<SafeHtmlProps> = ({ html, className = '' }) => {
  if (!html || !html.trim()) return null;

  // Use native browser DOMParser (zero new packages)
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // WS-28.1: Forbidden elements removed completely WITH their contents
  const forbiddenSelectors = 'script,iframe,object,embed,style,form,link,meta';
  doc.querySelectorAll(forbiddenSelectors).forEach((n) => n.remove());

  // WS-28.2: Sanitize attributes on all remaining elements
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const keep = ALLOWED_ATTRS.has(name);
      const isUrl = name === 'href' || name === 'src';
      const safeUrl = !isUrl || /^(https?:|data:image\/)/i.test(attr.value);
      if (!keep || !safeUrl) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return (
    <div className={`prose prose-invert max-w-none text-xs ${className}`}>
      {Array.from(doc.body.childNodes).map((node, i) => renderDomNode(node, i))}
    </div>
  );
};
