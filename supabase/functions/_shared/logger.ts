export const colors = {
  reset: "\x1b[0m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
};

export function createLogger(prefix: string) {
  const coloredPrefix = `${colors.magenta}[${prefix}]${colors.reset}`;

  return {
    info: (...args: unknown[]) =>
      console.log(coloredPrefix, `${colors.cyan}ℹ${colors.reset}`, ...args),
    success: (...args: unknown[]) =>
      console.log(coloredPrefix, `${colors.green}✓${colors.reset}`, ...args),
    warn: (...args: unknown[]) =>
      console.warn(coloredPrefix, `${colors.yellow}⚠${colors.reset}`, ...args),
    error: (...args: unknown[]) =>
      console.error(coloredPrefix, `${colors.red}✕${colors.reset}`, ...args),
    log: (...args: unknown[]) => console.log(coloredPrefix, ...args),
  };
}
