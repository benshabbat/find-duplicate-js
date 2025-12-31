// TypeScript utility functions for math operations

interface CalculationResult {
  result: number;
  operation: string;
}

/**
 * Adds two numbers and returns the sum
 * @param a First number
 * @param b Second number
 * @returns The sum of a and b
 */
export function addNumbers(a: number, b: number): number {
  const sum = a + b;
  return sum;
}

/**
 * Multiplies two numbers
 */
export const multiplyNumbers = (x: number, y: number): number => {
  const product = x * y;
  return product;
}

/**
 * Generic function to calculate sum with type safety
 */
export function calculateSum<T extends number>(num1: T, num2: T): T {
  const result = num1 + num2;
  return result as T;
}

/**
 * Async function to fetch and calculate
 */
export async function fetchAndCalculate(id: string): Promise<number> {
  const data = await fetch(`/api/data/${id}`);
  const json = await data.json();
  return json.value + 10;
}

/**
 * Class with TypeScript features
 */
export class Calculator {
  private history: number[] = [];

  public add(a: number, b: number): number {
    const result = a + b;
    this.history.push(result);
    return result;
  }

  public multiply(x: number, y: number): number {
    const product = x * y;
    this.history.push(product);
    return product;
  }

  public getHistory(): readonly number[] {
    return this.history;
  }
}

/**
 * Function with union types
 */
export function processValue(value: string | number): string {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }
  return value.toString();
}

/**
 * Another similar add function (should be detected as duplicate!)
 */
export function sumTwoNumbers(first: number, second: number): number {
  const total = first + second;
  return total;
}
