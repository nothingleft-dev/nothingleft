import ts from 'typescript';

export interface CodeSite {
  file: string;
  line: number;
  text: string;
}

export interface ErrorCodeScan {
  codes: Map<string, CodeSite>;
  unresolved: CodeSite[];
}

// Where an error code is chosen: the AppError constructor, errorKey(), and an ErrorBody
// literal (an object with both `code` and `message`). The checker resolves each to its
// string-literal type, so `const code = a ? 'x' : 'y'` yields both codes.
function codeExpressions(node: ts.Node): ts.Expression[] {
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'AppError') {
    return node.arguments?.[0] ? [node.arguments[0]] : [];
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'errorKey') {
    return node.arguments[0] ? [node.arguments[0]] : [];
  }
  if (ts.isObjectLiteralExpression(node)) {
    const named = (name: string) =>
      node.properties.find(p => p.name && ts.isIdentifier(p.name) && p.name.text === name);
    const code = named('code');
    if (!code || !named('message')) return [];
    if (ts.isPropertyAssignment(code)) return [code.initializer];
    if (ts.isShorthandPropertyAssignment(code)) return [code.name];
  }
  return [];
}

// A shorthand `{ code }` widens to string at the property; the variable keeps its literal type.
function typeOf(checker: ts.TypeChecker, expr: ts.Expression): ts.Type {
  if (ts.isShorthandPropertyAssignment(expr.parent)) {
    const symbol = checker.getShorthandAssignmentValueSymbol(expr.parent);
    if (symbol) return checker.getTypeOfSymbolAtLocation(symbol, expr);
  }
  return checker.getTypeAtLocation(expr);
}

function literalValues(type: ts.Type): string[] | null {
  const parts = type.isUnion() ? type.types : [type];
  const values: string[] = [];
  for (const part of parts) {
    if (!part.isStringLiteral()) return null;
    values.push(part.value);
  }
  return values;
}

export function scanErrorCodes(program: ts.Program, include: (fileName: string) => boolean): ErrorCodeScan {
  const checker = program.getTypeChecker();
  const codes = new Map<string, CodeSite>();
  const unresolved: CodeSite[] = [];

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !include(source.fileName)) continue;
    const visit = (node: ts.Node) => {
      for (const expr of codeExpressions(node)) {
        const site = {
          file: source.fileName,
          line: source.getLineAndCharacterOfPosition(expr.getStart()).line + 1,
          text: expr.getText(),
        };
        const values = literalValues(typeOf(checker, expr));
        if (values === null) unresolved.push(site);
        else for (const value of values) if (!codes.has(value)) codes.set(value, site);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { codes, unresolved };
}

export function missingFromCatalogue(scan: ErrorCodeScan, catalogue: Record<string, string>): CodeSite[] {
  return [...scan.codes]
    .filter(([code]) => !Object.prototype.hasOwnProperty.call(catalogue, `error.${code}`))
    .map(([code, site]) => ({ ...site, text: code }));
}

export function programFromTsconfig(tsconfigPath: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: d => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      },
    },
  );
  if (!parsed) throw new Error(`cannot read ${tsconfigPath}`);
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}
