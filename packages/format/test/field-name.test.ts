import { describe, expect, test } from 'bun:test';
import { emptyLabel, fieldNameInSentence } from '../src/field-name.ts';

describe('fieldNameInSentence', () => {
  test('lower-cases a capitalised word', () => {
    expect(fieldNameInSentence('Vendor reference')).toBe('vendor reference');
    expect(fieldNameInSentence('Go-live date')).toBe('go-live date');
  });

  test('keeps an acronym', () => {
    expect(fieldNameInSentence('SLA tier')).toBe('SLA tier');
    expect(fieldNameInSentence('QA')).toBe('QA');
  });

  test('leaves a lower-case or one-letter name', () => {
    expect(fieldNameInSentence('severity')).toBe('severity');
    expect(fieldNameInSentence('X')).toBe('X');
  });
});

describe('emptyLabel', () => {
  test('reads as a sentence', () => {
    expect(emptyLabel('Severity')).toBe('No severity');
    expect(emptyLabel('Kick-off call')).toBe('No kick-off call');
  });
});
