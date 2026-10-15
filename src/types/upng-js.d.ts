declare module "upng-js" {
  const UPNG: {
    encode(
      frames: ArrayBuffer[],
      width: number,
      height: number,
      colorCount: number,
      delaysMs: number[],
    ): ArrayBuffer;
  };
  export default UPNG;
}
