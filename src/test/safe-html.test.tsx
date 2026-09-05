import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { SafeHtml } from '../components/SafeHtml';

describe('SafeHtml Component', () => {
  it('completely removes iframe together with its contents', () => {
    const dirty = '<p>Hello</p><iframe src="https://youtube.com/watch?v=123">Fallback text inside iframe</iframe><p>World</p>';
    const { container } = render(<SafeHtml html={dirty} />);

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).not.toContain('Fallback text inside iframe');
    expect(container.textContent).toContain('Hello');
    expect(container.textContent).toContain('World');
  });

  it('completely removes script, style, and object tags and their contents', () => {
    const dirty = `
      <div>
        <script>alert("xss")</script>
        <style>body { color: red; }</style>
        <object data="evil.swf">Flash content</object>
        <p>Safe paragraph</p>
      </div>
    `;
    const { container } = render(<SafeHtml html={dirty} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelector('object')).toBeNull();
    expect(container.textContent).not.toContain('alert("xss")');
    expect(container.textContent).not.toContain('Flash content');
    expect(container.textContent).toContain('Safe paragraph');
  });

  it('sanitizes attributes and preserves safe tags', () => {
    const dirty = '<a href="https://example.com" onclick="alert(1)">Click me</a><img src="https://example.com/img.png" onerror="alert(2)" alt="An image" />';
    const { container } = render(<SafeHtml html={dirty} />);

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('onclick')).toBeNull();
    expect(link?.getAttribute('target')).toBe('_blank');

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/img.png');
    expect(img?.getAttribute('onerror')).toBeNull();
    expect(img?.getAttribute('alt')).toBe('An image');
  });

  it('strips unsafe javascript: links', () => {
    const dirty = '<a href="javascript:alert(1)">Bad link</a>';
    const { container } = render(<SafeHtml html={dirty} />);

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBeNull();
    expect(link?.textContent).toBe('Bad link');
  });
});
