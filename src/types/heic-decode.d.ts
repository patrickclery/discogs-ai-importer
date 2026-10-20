// heic-decode@2.1.0 ships only index.js (no TypeScript types).
declare module 'heic-decode' {
  type DecodedImage = {
    width: number;
    height: number;
    /** RGBA, 4 bytes per pixel. */
    data: Uint8ClampedArray;
  };
  /** One image of the container: size known, pixels not decoded yet. */
  type ImageHandle = {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  };
  function decode(input: {
    buffer: ArrayBufferLike | Uint8Array;
  }): Promise<DecodedImage>;
  namespace decode {
    /** Parses the container only; call dispose() when done. */
    function all(input: {
      buffer: ArrayBufferLike | Uint8Array;
    }): Promise<ImageHandle[] & { dispose(): void }>;
  }
  export default decode;
}
