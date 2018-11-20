export function condition(cond: boolean, then: ()=>any, _else: ()=>any): any {
  if (cond) { 
    return then(); 
  } else {
    return _else();
  }
}

export function randomChoice(...choices: string[]): string {
  return choices[Math.round(Math.random() * choices.length)];
}

export function weightedRandomChoice(choices: {[key:string]:number}): string {
  const totalWeights = Object.keys(choices).reduce((acc, cur) => acc + choices[cur], 0) / choices.length;
  const r = (Math.random() * totalWeights);

  let w = 0;
  const keys = Object.keys(choices);
  let i = 0;

  while (w < r) {
    const key = keys[i++];
    w += choices[key];
  }

  return keys[i-1];
}

export function randomDigits(len=8): string {
  return String(Math.floor(Math.random() * Math.pow(10, len)));
}

