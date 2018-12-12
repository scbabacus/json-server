import * as log from "winston";

export function executeJsExpression(exp: string, context: object): any {
  const functionedExpression = `return ${exp};`;

  const f = new Function("ctx", functionedExpression);
  const result = f(context);

  log.debug(`Expression executed = ${exp}`);
  log.debug(`Expression result   = ${JSON.stringify(result)}`);
  log.debug(`ctx.data            = ${JSON.stringify(global.data, null, 2)}`);

  return result;
}

export function executeJsStatement(stmt: string | string[], context: object) {
  const stmts = Array.isArray(stmt) ? stmt : [stmt];

  stmts.forEach((statement) => {
    if (typeof(statement) !== "string") {
      log.warn(`Invalid statement: ${statement}`);
      return;
    }

    const f = new Function("ctx", statement);
    f(context);

    log.debug(`Statement executed = ${stmt}`);
    log.debug(`ctx.data            = ${JSON.stringify(global.data, null, 2)}`);
  });
}
