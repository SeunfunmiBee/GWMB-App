// The one Node API the Worker uses (available at runtime through the nodejs_compat flag).
declare module 'node:buffer' {
  export const Buffer: { from(data: ArrayBuffer): Uint8Array };
}
