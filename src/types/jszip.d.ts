declare module "jszip" {
  interface JSZipObject {
    async(type: "string"): Promise<string>;
  }

  interface JSZipFile {
    dir: boolean;
    name: string;
  }

  interface JSZip {
    files: Record<string, JSZipFile>;
    file(name: string): JSZipObject | null;
  }

  interface JSZipStatic {
    loadAsync(data: ArrayBuffer | Uint8Array): Promise<JSZip>;
  }

  const JSZip: JSZipStatic;
  export default JSZip;
}
