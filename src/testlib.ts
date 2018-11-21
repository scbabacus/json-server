export function condition(cond: boolean, then: () => any, elseExp: () => any): any {
  if (cond) {
    return then();
  } else {
    return elseExp();
  }
}

export function randomChoice(...choices: string[]): string {
  return choices[Math.floor(Math.random() * choices.length)];
}

export function weightedRandomChoice(choices: {[key: string]: number}): string {
  const totalWeights = Object.keys(choices).reduce((acc, cur) => acc + choices[cur], 0) / choices.length;
  const r = (Math.random() * totalWeights);

  let w = 0;
  const keys = Object.keys(choices);
  let i = 0;

  while (w < r) {
    const key = keys[i++];
    w += choices[key];
  }

  return keys[i - 1];
}

export const CC_NUMBERS = "0123456789";
export const CC_CAPITALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const CC_LOWERCASES = "abcdefghijklmnopqrstuvwxyz";
export const CC_ALPHANUM = CC_NUMBERS + CC_CAPITALS;
export const CC_LOWER_ALPHANUM = CC_NUMBERS + CC_LOWERCASES;
export const CC_MIX_ALPHANUM = CC_NUMBERS + CC_LOWERCASES + CC_CAPITALS;

export function randomDigits(len = 8, optionalCharClass?: string): string {
  const charClass = optionalCharClass || CC_NUMBERS;
  const result: string[] = [];

  for (let i = 0; i < len; i++) {
    result.push(charClass.charAt(Math.floor(Math.random() * charClass.length)));
  }
  return result.join("");
}

export function randomNumber(max: number = 100, min: number = 0): number {
  return Math.round(min + (Math.random() * (max - min)));
}
