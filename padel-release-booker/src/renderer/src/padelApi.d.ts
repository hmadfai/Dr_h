import type { PadelApi } from '../../shared/ipc.js';

declare global {
  interface Window {
    padelApi: PadelApi;
  }
}

export {};
