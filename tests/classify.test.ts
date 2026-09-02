import { describe, expect, it } from 'vitest';
import { classifyError } from '../src/worker/classify.ts';

const named = (name: string, message: string): Error => Object.assign(new Error(message), { name });

describe('classifyError', () => {
  it('取消优先于一切', () => {
    expect(classifyError(named('CancelledError', 'cancelled'), false).code).toBe('cancelled');
    expect(classifyError(new Error('whatever'), true).code).toBe('cancelled');
  });

  it('密码与无效 PDF', () => {
    expect(classifyError(named('PasswordException', 'No password given'), false).code).toBe(
      'password-required',
    );
    expect(classifyError(named('PasswordException', 'Incorrect Password'), false).code).toBe(
      'password-incorrect',
    );
    expect(classifyError(named('InvalidPDFException', 'Invalid PDF structure'), false).code).toBe(
      'invalid-pdf',
    );
  });

  it('内存不足的几种说法都归到 out-of-memory', () => {
    for (const message of [
      'Array buffer allocation failed',
      'Out of memory',
      'Cannot enlarge memory arrays',
      'RuntimeError: memory access out of bounds',
      'Invalid array length',
    ]) {
      expect(classifyError(new RangeError(message), false)).toEqual({
        code: 'out-of-memory',
        detail: message,
      });
    }
  });

  it('其他错误保留原文', () => {
    expect(classifyError('boom', false)).toEqual({ code: 'unknown', detail: 'boom' });
  });
});
