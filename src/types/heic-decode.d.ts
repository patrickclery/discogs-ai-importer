// heic-decode@2.1.0 ships only index.js (no TypeScript types).
declare module 'heic-decode' {
  type DecodedImage = {
    width: number;
    height: number;
    /** RGBA, 4 bytes per pixel. */
    data: Uint8ClampedArray;
  };
  function decode(input: {
    buffer: ArrayBufferLike | Uint8Array;
  }): Promise<DecodedImage>;
  export default decode;
}
