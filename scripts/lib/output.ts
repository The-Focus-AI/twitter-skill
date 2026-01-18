/**
 * CLI output helpers for consistent JSON output
 */

export interface SuccessOutput<T = unknown> {
  success: true;
  data: T;
}

export interface ErrorOutput {
  success: false;
  error: string;
}

export type Output<T = unknown> = SuccessOutput<T> | ErrorOutput;

/**
 * Output a successful result as JSON
 */
export function output<T>(data: T): void {
  const result: SuccessOutput<T> = {
    success: true,
    data,
  };
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Output an error and exit
 */
export function fail(message: string): never {
  const result: ErrorOutput = {
    success: false,
    error: message,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

/**
 * Wrap an async function with error handling
 */
export async function withErrorHandling<T>(fn: () => Promise<T>): Promise<void> {
  try {
    const result = await fn();
    output(result);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
