// Polyfills para compatibilidad total con PDF.js y navegadores en WebViews/iFrames

if (typeof window !== 'undefined') {
  // 1. Polyfill para Uint8Array.prototype.toHex
  if (!(Uint8Array.prototype as any).toHex) {
    (Uint8Array.prototype as any).toHex = function (): string {
      let hex = '';
      for (let i = 0; i < this.length; i++) {
        hex += this[i].toString(16).padStart(2, '0');
      }
      return hex;
    };
  }

  // 2. Polyfill para Uint8Array.prototype.toBase64
  if (!(Uint8Array.prototype as any).toBase64) {
    (Uint8Array.prototype as any).toBase64 = function (): string {
      let binary = '';
      const len = this.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(this[i]);
      }
      return window.btoa(binary);
    };
  }

  // 3. Polyfill para Promise.withResolvers
  if (!(Promise as any).withResolvers) {
    (Promise as any).withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: any) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  // 4. Polyfill para Array.prototype.toSorted / toReversed
  if (!(Array.prototype as any).toSorted) {
    (Array.prototype as any).toSorted = function (compareFn?: (a: any, b: any) => number) {
      return [...this].sort(compareFn);
    };
  }
  if (!(Array.prototype as any).toReversed) {
    (Array.prototype as any).toReversed = function () {
      return [...this].reverse();
    };
  }
}

export {};
