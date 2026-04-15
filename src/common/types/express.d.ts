// Extend Express Request to include our custom properties
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export {};
