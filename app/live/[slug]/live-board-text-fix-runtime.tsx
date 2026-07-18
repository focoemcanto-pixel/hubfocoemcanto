'use client';

import { useEffect } from 'react';

type EditableElement = HTMLDivElement & { dataset: DOMStringMap & { boardTextFixed?: string } };

function selectionOffset(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !root.contains(selection.anchorNode)) return null;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function restoreSelection(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length || 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function activateSelectTool(board: Element) {
  const selectButton = board.querySelector<HTMLButtonElement>('.fl-board-tools button[title="select"]');
  selectButton?.click();
}

function prepareBlock(block: HTMLElement) {
  if (block.dataset.boardTextFixed === '1') return;
  block.dataset.boardTextFixed = '1';
  const editor = block.querySelector<EditableElement>('[contenteditable="true"]');
  if (!editor) return;

  // Clicking or typing inside a text block must never create another block on the canvas.
  block.addEventListener('pointerdown', (event) => event.stopPropagation());
  block.addEventListener('click', (event) => event.stopPropagation());

  let caret = 0;
  editor.addEventListener('beforeinput', () => {
    caret = selectionOffset(editor) ?? editor.textContent?.length ?? 0;
  });
  editor.addEventListener('input', () => {
    const current = selectionOffset(editor);
    if (current !== null) caret = current;
    requestAnimationFrame(() => {
      if (document.activeElement === editor) restoreSelection(editor, caret);
    });
  });

  editor.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      editor.blur();
      activateSelectTool(block.closest('.fl-board-shell') || document.body);
    }
  });

  requestAnimationFrame(() => {
    editor.focus({ preventScroll: true });
    if ((editor.textContent || '').trim() === 'Digite aqui') {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      restoreSelection(editor, editor.textContent?.length || 0);
    }
    // One click creates one text block. Returning to selection prevents balloon spam.
    activateSelectTool(block.closest('.fl-board-shell') || document.body);
  });
}

export default function LiveBoardTextFixRuntime() {
  useEffect(() => {
    const scan = () => document.querySelectorAll<HTMLElement>('.fl-rich-text').forEach(prepareBlock);
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => observer.disconnect();
  }, []);
  return null;
}
