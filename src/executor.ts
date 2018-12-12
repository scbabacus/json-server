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

export function executeJsStatement(stmt: string, context: object) {
  const f = new Function("ctx", stmt);
  f(context);

  log.debug(`Statement executed = ${stmt}`);
  log.debug(`ctx.data            = ${JSON.stringify(global.data, null, 2)}`);
}
