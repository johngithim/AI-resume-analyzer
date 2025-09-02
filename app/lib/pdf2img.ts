export interface PdfConversionResult {
  imageUrl: string;
  file: File | null;
  error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

/**
 * Lazily loads and caches the pdf.js library (pdfjs-dist) for use elsewhere in the module.
 *
 * Loads pdfjs-dist/build/pdf.mjs once and returns the loaded library. Concurrent callers share a single in-progress
 * load via an internal promise. As a side effect, sets `GlobalWorkerOptions.workerSrc` to "/pdf.worker.min.mjs"
 * and updates module-level caching state so subsequent calls return the cached library immediately.
 *
 * @returns A promise that resolves to the imported pdf.js library.
 */
async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadPromise) return loadPromise;

  isLoading = true;
  // @ts-expect-error - pdfjs-dist/build/pdf.mjs is not a module
  loadPromise = import("pdfjs-dist/build/pdf.mjs").then((lib) => {
    // Set the worker source to use local file
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    pdfjsLib = lib;
    isLoading = false;
    return lib;
  });

  return loadPromise;
}

/**
 * Converts the first page of a PDF File into a PNG image and returns the result.
 *
 * This renders page 1 of the provided PDF at a high resolution (scale 4) to an offscreen
 * canvas, then produces a PNG Blob and a File with the same base name as the input PDF.
 *
 * @param file - The PDF file to convert (only the first page is processed).
 * @returns An object containing:
 *  - `imageUrl`: a blob URL for the generated PNG (empty string on failure),
 *  - `file`: a File wrapping the PNG blob (null on failure),
 *  - `error` (optional): an error message when conversion failed.
 */
export async function convertPdfToImage(
  file: File,
): Promise<PdfConversionResult> {
  try {
    const lib = await loadPdfJs();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 4 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    if (context) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
    }

    await page.render({ canvasContext: context!, viewport }).promise;

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Create a File from the blob with the same name as the pdf
            const originalName = file.name.replace(/\.pdf$/i, "");
            const imageFile = new File([blob], `${originalName}.png`, {
              type: "image/png",
            });

            resolve({
              imageUrl: URL.createObjectURL(blob),
              file: imageFile,
            });
          } else {
            resolve({
              imageUrl: "",
              file: null,
              error: "Failed to create image blob",
            });
          }
        },
        "image/png",
        1.0,
      ); // Set quality to maximum (1.0)
    });
  } catch (err) {
    return {
      imageUrl: "",
      file: null,
      error: `Failed to convert PDF: ${err}`,
    };
  }
}
