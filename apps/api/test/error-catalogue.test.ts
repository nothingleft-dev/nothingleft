import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import en from '../../../packages/i18n/en.json';
import { missingFromCatalogue, programFromTsconfig, scanErrorCodes } from './error-catalogue.ts';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

function fixtureProgram(source: string): ts.Program {
  const fileName = '/fixture/src/x.ts';
  const options: ts.CompilerOptions = { strict: true, noLib: true, target: ts.ScriptTarget.ESNext };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = name =>
    name === fileName ? ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, true) : undefined;
  host.fileExists = name => name === fileName;
  return ts.createProgram({ rootNames: [fileName], options, host });
}

const prelude = `
interface String {} interface Number {} interface Boolean {} interface Object {} interface Function {}
interface Array<T> { length: number; [n: number]: T } interface IArguments {} interface RegExp {}
interface CallableFunction {} interface NewableFunction {}
class AppError { constructor(public code: string, public status: number) {} }
declare function errorKey(code: string): string;
declare const httpStatus: number;
declare const anyCode: string;
`;

const scan = (body: string) => scanErrorCodes(fixtureProgram(prelude + body), () => true);

describe('scanErrorCodes', () => {
  test('collects AppError, errorKey and ErrorBody codes, following literal unions', () => {
    const { codes, unresolved } = scan(`
      new AppError('member.not_found', 404);
      errorKey('rate_limited');
      const code = httpStatus === 405 ? 'method_not_allowed' : 'validation_failed';
      const body = { code, message: '', request_id: '' };
      const other = { code: 'conflict', message: '' };
      const notAnError = { code: 'ignored' };
    `);
    expect([...codes.keys()].sort()).toEqual([
      'conflict',
      'member.not_found',
      'method_not_allowed',
      'rate_limited',
      'validation_failed',
    ]);
    expect(unresolved).toEqual([]);
  });

  test('reports a code whose value the checker cannot pin to literals', () => {
    const { unresolved } = scan(`new AppError(anyCode, 400);`);
    expect(unresolved.map(u => u.text)).toEqual(['anyCode']);
  });

  test('missingFromCatalogue names each code without an error.<code> key', () => {
    const result = scan(`new AppError('not_found', 404); new AppError('widget.exploded', 500);`);
    const missing = missingFromCatalogue(result, { 'error.not_found': 'x' });
    expect(missing.map(m => m.text)).toEqual(['widget.exploded']);
  });
});

describe('apps/api error catalogue', () => {
  const program = programFromTsconfig(`${apiRoot}tsconfig.json`);
  const result = scanErrorCodes(program, name => name.startsWith(`${apiRoot}src/`));

  test('finds the codes the error handler emits', () => {
    for (const code of [
      'internal',
      'validation_failed',
      'conflict',
      'rate_limited',
      'method_not_allowed',
      'not_found',
    ]) {
      expect(result.codes.has(code)).toBe(true);
    }
  });

  test('every error code resolves to string literals', () => {
    expect(result.unresolved).toEqual([]);
  });

  test('every error code has an error.<code> key in packages/i18n/en.json', () => {
    expect(missingFromCatalogue(result, en)).toEqual([]);
  });
});
