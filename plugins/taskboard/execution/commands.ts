/** Parse human-entered argv without shell evaluation, expansion, pipes, or redirection. */
export function parseVerificationCommands(value: string) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const argv: string[] = [];
      let word = '';
      let quote = '';
      let escaped = false;
      let started = false;
      for (const character of line) {
        if (escaped) {
          word += character;
          escaped = false;
          started = true;
          continue;
        }
        if (character === '\\' && quote !== "'") {
          escaped = true;
          started = true;
          continue;
        }
        if (quote) {
          if (character === quote) quote = '';
          else word += character;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
          started = true;
          continue;
        }
        if (/\s/.test(character)) {
          if (started) {
            argv.push(word);
            word = '';
            started = false;
          }
          continue;
        }
        if (/[|;&<>`]/.test(character))
          throw new Error(
            'Use one executable command per line; shell operators are not supported'
          );
        word += character;
        started = true;
      }
      if (quote || escaped)
        throw new Error('Finish the quoted command or escape');
      if (started) argv.push(word);
      return { id: `check_${index + 1}`, argv, inputs: [], timeoutMs: 120000 };
    });
}
