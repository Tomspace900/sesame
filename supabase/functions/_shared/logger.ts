export const colors = {
  reset: "\x1b[0m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function createLogger(prefix: string) {
  const c = (color: string, icon: string, ...args: unknown[]) => {
    if (args.length === 0) return [`${color}[${prefix}] ${icon}${colors.reset}`];

    // Si le premier argument est une string, on englobe la string entière dans la couleur
    if (typeof args[0] === "string") {
      const msg = args[0];
      const rest = args.slice(1);
      return [`${color}[${prefix}] ${icon} ${msg}${colors.reset}`, ...rest];
    }

    // Sinon, on colore au moins le préfixe
    return [`${color}[${prefix}] ${icon}${colors.reset}`, ...args];
  };

  return {
    debug: (...args: unknown[]) => {
      // By default hidden, enabled via DEBUG=true environment variable
      if (Deno.env.get("DEBUG") === "true") {
        console.log(...c(colors.gray, "🐛", ...args));
      }
    },
    info: (...args: unknown[]) => console.log(...c(colors.cyan, "ℹ", ...args)),
    ai: (...args: unknown[]) => console.log(...c(colors.magenta, "✨", ...args)),
    success: (...args: unknown[]) => console.log(...c(colors.green, "✓", ...args)),
    warn: (...args: unknown[]) => console.warn(...c(colors.yellow, "⚠", ...args)),
    error: (...args: unknown[]) => console.error(...c(colors.red, "✕", ...args)),
    log: (...args: unknown[]) => console.log(`[${prefix}]`, ...args),
  };
}
