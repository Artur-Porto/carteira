export type SaveOutcome = 'saved' | 'cancelled' | 'downloaded';

/**
 * Offers a file to the user. On the iPhone this opens the share sheet, whose promise settles
 * only once the user finished or cancelled, so the caller knows whether the file was saved.
 * Browsers that cannot share files get a download instead.
 *
 * Call it straight from a tap, with no await before it: Safari refuses share() otherwise.
 */
export async function offerFile(file: File): Promise<SaveOutcome> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'saved';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
