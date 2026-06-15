/**
 * Comprime y redimensiona una imagen en el navegador a una miniatura JPEG en
 * base64 (data URL). Permite guardar imágenes de productos directamente en
 * Firestore (sin Firebase Storage), manteniéndolas muy por debajo del límite
 * de 1 MB por documento.
 *
 * Solo se puede usar en el cliente (usa canvas/DOM).
 */
export async function comprimirImagenBase64(
  file: File,
  maxDim = 400,
  quality = 0.7
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new window.Image();
    im.onload  = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });

  let { width, height } = img;
  if (width >= height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width  = maxDim;
  } else if (height > maxDim) {
    width  = Math.round((width * maxDim) / height);
    height = maxDim;
  }

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}
