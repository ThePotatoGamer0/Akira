import type { User } from "../../../../src/generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
