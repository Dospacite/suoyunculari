/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { YkUser } from '@/lib/yk';

declare global {
  namespace App {
    interface Locals {
      user?: YkUser;
    }
  }
}

export {};
