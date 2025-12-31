// TypeScript service for user operations

export interface User {
  id: string;
  name: string;
  email: string;
}

/**
 * Similar function to addNumbers from mathUtils.ts
 * This should be detected as a duplicate!
 */
export function calculateTotal(val1: number, val2: number): number {
  const sum = val1 + val2;
  return sum;
}

/**
 * Fetch user data - similar to fetchAndCalculate
 */
export async function getUserData(userId: string): Promise<number> {
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();
  return data.score + 10;
}

/**
 * Class method similar to Calculator.add
 */
export class UserService {
  private users: User[] = [];

  public addUser(user: User): void {
    this.users.push(user);
  }

  public getUserById(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }

  // This method is similar to Calculator.add in mathUtils.ts
  public sumScores(score1: number, score2: number): number {
    const result = score1 + score2;
    return result;
  }
}

/**
 * Generic function with constraints
 */
export function mergeArrays<T extends string | number>(
  arr1: T[],
  arr2: T[]
): T[] {
  return [...arr1, ...arr2];
}

/**
 * Type guard function
 */
export function isUser(obj: any): obj is User {
  return (
    typeof obj === 'object' &&
    'id' in obj &&
    'name' in obj &&
    'email' in obj
  );
}

/**
 * Function with optional parameters
 */
export function formatUserName(
  firstName: string,
  lastName?: string,
  middle?: string
): string {
  if (lastName && middle) {
    return `${firstName} ${middle} ${lastName}`;
  }
  if (lastName) {
    return `${firstName} ${lastName}`;
  }
  return firstName;
}
